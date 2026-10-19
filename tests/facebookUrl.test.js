const { normalizeFacebookUrl } = require('../src/utils/facebookUrl');

describe('Facebook navigation URL validation', () => {
    test.each([
        'https://www.facebook.com/marketplace/item/123',
        'https://web.facebook.com/groups/example',
        'https://m.facebook.com/profile.php?id=123',
    ])('accepts Facebook HTTPS URL %s', (value) => {
        expect(normalizeFacebookUrl(value)).toBeTruthy();
    });

    test.each([
        'http://www.facebook.com/marketplace',
        'https://facebook.com.attacker.example/marketplace',
        'https://127.0.0.1/admin',
        'file:///C:/Users/user/secret.txt',
        'https://user:pass@www.facebook.com/',
        'https://www.facebook.com:444/',
    ])('rejects unsafe target %s', (value) => {
        expect(normalizeFacebookUrl(value)).toBeNull();
    });
});
