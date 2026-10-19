const originalApiKey = process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY = 'test-groq-key';

const AIService = require('../src/services/aiService');
const twentyTags = Array.from({ length: 20 }, (_, index) => `tag${index + 1}`).join(',');

const makeFieldsResponse = (category) => JSON.stringify({
    title: 'Honda Beat 2020',
    price: '12500000',
    condition: 'Bekas - Baik',
    category,
    tags: twentyTags,
    description: 'Honda Beat 2020, mesin normal.',
    attributes: {},
});

describe('AI listing field generation', () => {
    let originalRequestCompletion;

    beforeEach(() => {
        originalRequestCompletion = AIService.requestCompletion;
    });

    afterEach(() => {
        AIService.requestCompletion = originalRequestCompletion;
    });

    afterAll(() => {
        if (originalApiKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = originalApiKey;
    });

    test('skips model category request for obvious motor listings', async () => {
        AIService.requestCompletion = jest.fn().mockResolvedValue(makeFieldsResponse('Kendaraan'));

        const result = await AIService.generateFieldsFromDescription({
            description: 'Motor Honda Beat 2020, pajak hidup, harga 12,5 juta',
        });

        expect(AIService.requestCompletion).toHaveBeenCalledTimes(1);
        expect(result.category).toBe('Kendaraan');
        expect(result.attributes['Jarak Tempuh']).toBeUndefined();
        expect(result.attributes['Jenis bahan bakar']).toBeUndefined();
    });

    test('keeps model classification for ambiguous product descriptions', async () => {
        AIService.requestCompletion = jest.fn()
            .mockResolvedValueOnce(JSON.stringify({ category: 'Mebel' }))
            .mockResolvedValueOnce(makeFieldsResponse('Mebel'));

        const result = await AIService.generateFieldsFromDescription({
            description: 'Meja kayu untuk ruang tamu, kondisi baik',
        });

        expect(AIService.requestCompletion).toHaveBeenCalledTimes(2);
        expect(result.category).toBe('Mebel');
    });

    test('validates and normalizes listing output', async () => {
        AIService.requestCompletion = jest.fn().mockResolvedValue(JSON.stringify({
            mapping: {
                category: 'Kendaraan',
                title: '[READY] Honda Beat 2020',
                price: '12,5',
                tags: twentyTags,
                condition: 'Bekas - Baik',
                attributes: {},
            },
            copywriting: {
                description: 'Harga 12500000',
                analysis: 'Data mengikuti input.',
                missing_info: [],
            },
        }));

        const result = await AIService.processListing('Honda Beat 2020 harga 12,5 juta');

        expect(result.mapping.title).toBe('Honda Beat 2020');
        expect(result.mapping.price).toBe('12500000');
        expect(result.copywriting.description).toBe('Harga 12,5 jt');
        expect(AIService.requestCompletion).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 2048 }));
    });
});
