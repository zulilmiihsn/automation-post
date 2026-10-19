const { clampQueryLimit, limitSearchText } = require('../src/utils/queryBounds');

describe('query bounds', () => {
    test('clamps invalid, negative, and oversized limits', () => {
        expect(clampQueryLimit(undefined, 50, 500)).toBe(50);
        expect(clampQueryLimit(-10, 50, 500)).toBe(1);
        expect(clampQueryLimit(1000000, 50, 500)).toBe(500);
        expect(clampQueryLimit(25, 50, 500)).toBe(25);
    });

    test('caps search strings before database queries', () => {
        expect(limitSearchText('a'.repeat(500), 100)).toHaveLength(100);
        expect(limitSearchText({ arbitrary: true })).toBe('');
    });
});
