const {
    parseAgentDecision,
    parseAgentReply,
    parseGeneratedFields,
    parseListingOptimization,
    parsePriceSuggestion,
    parseTags,
} = require('../src/services/aiOutputs');

const twentyTags = Array.from({ length: 20 }, (_, index) => `tag${index + 1}`).join(',');

describe('AI agent output validation', () => {
    test('accepts valid booleans and normalizes unused action text', () => {
        expect(parseAgentDecision(JSON.stringify({
            should_like: false,
            should_comment: false,
            comment_text: 'must not be used',
            reason: 'Post tidak relevan',
        }))).toMatchObject({
            should_like: false,
            should_comment: false,
            comment_text: '',
            reason: 'Post tidak relevan',
            updated_memory: '',
        });
    });

    test('rejects string booleans and oversized action content', () => {
        expect(parseAgentDecision('{"should_like":"false","should_comment":false}')).toBeNull();
        expect(parseAgentDecision(JSON.stringify({
            should_like: false,
            should_comment: true,
            comment_text: 'satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas tiga belas',
        }))).toBeNull();
        expect(parseAgentReply('{"should_reply":true,"reply_text":12}')).toBeNull();
    });

    test('accepts concise reply and returns null for malformed JSON', () => {
        expect(parseAgentReply('{"should_reply":true,"reply_text":"Terima kasih, siap dibantu."}'))
            .toMatchObject({ should_reply: true, reply_text: 'Terima kasih, siap dibantu.' });
        expect(parseAgentReply('not-json')).toBeNull();
    });

    test('validates listing, fields, and tag payloads before returning them', () => {
        expect(parseListingOptimization(JSON.stringify({
            mapping: {
                title: 'Honda Beat', price: '12000000', category: 'Kendaraan',
                condition: 'Bekas - Baik', tags: twentyTags, attributes: {},
            },
            copywriting: { description: 'Mesin normal.' },
        })).mapping.title).toBe('Honda Beat');

        expect(parseGeneratedFields(JSON.stringify({
            title: 'Honda Beat', price: 12000000, category: 'Kendaraan', condition: 'Used - Good',
            tags: twentyTags, description: 'Mesin normal.', attributes: {},
        })).condition).toBe('Bekas - Baik');

        expect(parseTags(JSON.stringify({ tags: twentyTags }))).toBe(twentyTags);
        expect(() => parseListingOptimization('{"mapping":{}}')).toThrow('missing required fields');
        expect(() => parseGeneratedFields('{"title":"Honda Beat"}')).toThrow('missing required fields');
        expect(() => parseTags('{"tags":12}')).toThrow('missing tags string');
        expect(() => parseTags('{"tags":"honda,beat"}')).toThrow('20 required');
    });

    test('canonicalizes allowed attributes and rejects unknown categories', () => {
        const result = parseGeneratedFields(JSON.stringify({
            title: 'Honda Beat', price: '12000000', category: 'Kendaraan', condition: 'Bekas - Baik',
            tags: twentyTags, description: 'Mesin normal.',
            attributes: { tahun: 2020, Unknown: 'not allowed' },
        }), { allowedCategories: ['Kendaraan'], allowedFields: ['Tahun'] });

        expect(result.attributes).toEqual({ Tahun: '2020' });
        expect(() => parseGeneratedFields(JSON.stringify({
            title: 'Produk', price: '1000', category: 'unknown', condition: 'Baru',
            tags: twentyTags, description: 'Baik.', attributes: {},
        }), { allowedCategories: ['Kendaraan'] })).toThrow('unsupported category');
    });

    test('deduplicates, strips hashtag prefixes, and caps extra tags at twenty', () => {
        const tags = [...Array.from({ length: 20 }, (_, index) => `tag${index + 1}`), '#TAG1'].join(',');
        expect(parseTags(JSON.stringify({ tags }))).toBe(twentyTags);
    });

    test('fills a short tag list with safe product-derived terms', () => {
        const nineteenTags = Array.from({ length: 19 }, (_, index) => `tag${index + 1}`).join(',');
        const tags = parseTags(JSON.stringify({ tags: nineteenTags }), {
            title: 'Honda Beat 2020',
            location: 'Berau',
            category: 'Kendaraan',
            condition: 'Bekas - Baik',
        });

        expect(tags.split(',')).toHaveLength(20);
        expect(tags).toContain('Honda Beat 2020 Berau');
    });

    test('validates ordered price ranges and normalizes rupiah strings', () => {
        expect(parsePriceSuggestion(JSON.stringify({
            min_price: '10,000,000',
            ideal_price: '12,500,000',
            max_price: '15,000,000',
            reasoning: 'Kondisi unit dan harga pasar.',
        }))).toEqual({
            min_price: '10000000',
            ideal_price: '12500000',
            max_price: '15000000',
            reasoning: 'Kondisi unit dan harga pasar.',
        });
        expect(() => parsePriceSuggestion('{"min_price":"15jt","ideal_price":"12jt","max_price":"20jt"}'))
            .toThrow('range is out of order');
    });
});
