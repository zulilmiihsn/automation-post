const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ASSETS_ROOT, resolveAssetPath } = require('../src/utils/assetFiles');
const InteractionEngine = require('../src/core/interactionEngine');

process.env.NODE_ENV = 'test';
const ListingDataService = require('../src/web/services/listingDataService');

describe('asset path confinement', () => {
    test('only resolves existing image files inside assets', () => {
        const testDir = path.join(ASSETS_ROOT, `security-test-${process.pid}-${Date.now()}`);
        const imagePath = path.join(testDir, 'sample.png');
        const engine = new InteractionEngine(null);
        fs.mkdirSync(testDir, { recursive: true });

        try {
            fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
            expect(resolveAssetPath(`assets/${path.basename(testDir)}/sample.png`, { mustExist: true }))
                .toBe(fs.realpathSync(imagePath));
            expect(engine.resolvePhotoPaths([imagePath])).toEqual([fs.realpathSync(imagePath)]);
            expect(resolveAssetPath('assets/../../package.json')).toBeNull();
            expect(resolveAssetPath(path.join(os.tmpdir(), 'outside.png'))).toBeNull();
            expect(engine.resolvePhotoPaths([imagePath, path.resolve(os.tmpdir(), 'outside.jpg')]))
                .toEqual([fs.realpathSync(imagePath)]);
            expect(resolveAssetPath(`assets/${path.basename(testDir)}/sample.txt`)).toBeNull();
        } finally {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    test('photo deletion refuses paths outside assets', () => {
        const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopost-photo-path-'));
        const sentinel = path.join(outsideDir, `sentinel-${process.pid}-${Date.now()}.png`);
        fs.writeFileSync(sentinel, 'must survive');

        try {
            const relativePath = path.relative(process.cwd(), sentinel);
            expect(ListingDataService.deletePhotoIfUnused(relativePath)).toEqual({
                deleted: false,
                reason: 'invalid-path',
            });
            expect(fs.existsSync(sentinel)).toBe(true);
        } finally {
            fs.rmSync(outsideDir, { recursive: true, force: true });
        }
    });
});
