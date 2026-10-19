const {
    formatPriceNatural,
    normalizeListingPrice,
    sanitizeListingDescription,
} = require('../src/services/aiListingFormatters');

describe('AI listing formatters', () => {
    test.each([
        ['18,5 jt', '18500000'],
        ['Rp 18,000,000', '18000000'],
        ['12.500.000', '12500000'],
        ['18', '18000000'],
    ])('normalizes vehicle price %s', (input, expected) => {
        expect(normalizeListingPrice(input)).toBe(expected);
    });

    test('formats natural description prices consistently', () => {
        expect(formatPriceNatural('12500000')).toBe('12,5 jt');
        expect(sanitizeListingDescription('Harga Rp 12500000')).toBe('Harga 12,5 jt');
        expect(sanitizeListingDescription('Harga 12.500.000, nego tipis setelah cek unit.'))
            .toBe('Harga 12,5 jt, nego tipis setelah cek unit.');
        expect(sanitizeListingDescription('Harga 18', 'Mebel')).toBe('Harga 18');
    });
});
