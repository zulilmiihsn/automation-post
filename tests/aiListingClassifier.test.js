const { inferListingCategory } = require('../src/services/aiListingClassifier');

describe('AI listing category fast path', () => {
    test.each([
        ['Motor Honda Beat 2020, surat lengkap', 'Kendaraan'],
        ['Suku cadang motor Honda, kondisi baru', 'Komponen otomotif'],
        ['Sepeda gunung 27.5 inch', 'Sepeda'],
    ])('classifies obvious listing: %s', (description, expectedCategory) => {
        expect(inferListingCategory(description)).toBe(expectedCategory);
    });

    test('leaves ambiguous descriptions for model classification', () => {
        expect(inferListingCategory('Barang masih bagus, bisa cek langsung')).toBeNull();
        expect(inferListingCategory('')).toBeNull();
    });
});
