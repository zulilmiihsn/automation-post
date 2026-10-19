process.env.NODE_ENV = 'test';
jest.mock('../src/services/aiService', () => {
    return {
        generateTags: jest.fn().mockResolvedValue('tag1,tag2,tag3,tag4,tag5,tag6,tag7,tag8,tag9,tag10,tag11,tag12,tag13,tag14,tag15,tag16,tag17,tag18,tag19,tag20'),
        generateFieldsFromDescription: jest.fn().mockResolvedValue({
            title: 'Yamaha NMAX 2020',
            price: '25000000',
            condition: 'Bekas - Baik',
            category: 'Kendaraan',
            tags: 'nmax,yamaha,motor',
            description: 'Bismillah... Yamaha NMAX 2020 mulus banar.',
            attributes: {
                'Merek': 'Yamaha',
                'Tahun': '2020'
            }
        })
    };
});
const request = require('supertest');
const app = require('../src/web/app');
const fs = require('fs-extra');
const path = require('path');
const Database = require('better-sqlite3');
const DataService = require('../src/web/services/dataService');
const QueueService = require('../src/web/services/queueService');

const ACCOUNTS_FILE = path.join(__dirname, '../data/accounts.json');
const LISTINGS_FILE = path.join(__dirname, '../data/listings.json');

describe('API Endpoints', () => {
    // Note: We test against the live database. In a real CI environment, 
    // we would use a separate test database.
    
    beforeAll(async () => {
        // Prepare state if needed
    });

    afterAll(async () => {
        // Cleanup if needed
    });

    test('GET /api/accounts - should return accounts array', async () => {
        const res = await request(app).get('/api/accounts');
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body)).toBeTruthy();
        expect(res.body.every(account => account.e2ee_pin === undefined)).toBe(true);
    });

    test('local API rejects foreign hosts and cross-origin browser requests', async () => {
        const foreignHost = await request(app).get('/api/health').set('Host', 'attacker.example');
        expect(foreignHost.statusCode).toBe(421);

        const foreignOrigin = await request(app).get('/api/health').set('Origin', 'https://attacker.example');
        expect(foreignOrigin.statusCode).toBe(403);
    });

    test('automation rejects unsupported modes, untrusted navigation URLs, and invalid agent limits', async () => {
        const beforeQueues = Object.keys(QueueService.getAllQueues()).sort();

        const badMode = await request(app).post('/api/run-automation').send({ mode: 'unbounded-custom-mode' });
        expect(badMode.statusCode).toBe(400);

        const badTarget = await request(app).post('/api/run-automation').send({
            mode: 'marketplace',
            targetUrl: 'http://127.0.0.1/admin',
        });
        expect(badTarget.statusCode).toBe(400);

        const badAgentLimit = await request(app).post('/api/run-agent').send({ limit: 1000000 });
        expect(badAgentLimit.statusCode).toBe(400);

        const badLogMode = await request(app).get('/api/stream-logs?mode=unbounded-stream');
        expect(badLogMode.statusCode).toBe(400);
        expect(Object.keys(QueueService.getAllQueues()).sort()).toEqual(beforeQueues);
    });

    test('photo upload rejects spoofed MIME content and removes stored file', async () => {
        const assetsDir = path.join(__dirname, '../assets');
        const before = new Set(fs.readdirSync(assetsDir));
        const response = await request(app)
            .post('/api/upload')
            .attach('photos', Buffer.from('<html><script>alert(1)</script></html>'), {
                filename: 'not-an-image.html',
                contentType: 'image/png',
            });

        expect(response.statusCode).toBe(400);
        expect(fs.readdirSync(assetsDir).filter(file => !before.has(file))).toHaveLength(0);
    });

    test('valid image upload uses generated image extension and relative path', async () => {
        const response = await request(app)
            .post('/api/upload')
            .attach('photos', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), {
                filename: 'user-controlled.html',
                contentType: 'image/png',
            });

        try {
            expect(response.statusCode).toBe(200);
            expect(response.body.folderPath).toBe('assets');
            expect(response.body.files).toHaveLength(1);
            expect(response.body.files[0]).toMatch(/^[a-f0-9-]+\.png$/i);
        } finally {
            for (const filename of response.body.files || []) {
                await fs.remove(path.join(__dirname, '../assets', filename));
            }
        }
    });

    test('GET /api/listings - should return listings array', async () => {
        const res = await request(app).get('/api/listings');
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body)).toBeTruthy();
    });

    test('GET /api/config exposes active AI model names without credentials', async () => {
        const res = await request(app).get('/api/config');
        expect(res.statusCode).toBe(200);
        expect(typeof res.body.runtime_ai_models.heavy).toBe('string');
        expect(typeof res.body.runtime_ai_models.light).toBe('string');
        expect(typeof res.body.runtime_ai_models.credentials_configured).toBe('boolean');
        expect(res.body.GROQ_API_KEY).toBeUndefined();
    });

    test('settings API rejects invalid numeric values and accepts bounded rate limits', async () => {
        const key = 'rate_limit_likes_per_day';
        const previous = DataService.getAppConfig()[key] ?? '';
        try {
            const negative = await request(app).post('/api/config').send({ key, value: '-1' });
            expect(negative.statusCode).toBe(400);

            const oversized = await request(app).post('/api/config').send({ key, value: '1000001' });
            expect(oversized.statusCode).toBe(400);

            const valid = await request(app).post('/api/config').send({ key, value: '80' });
            expect(valid.statusCode).toBe(200);
            expect(DataService.getAppConfig()[key]).toBe('80');
        } finally {
            DataService.setAppConfig(key, previous);
        }
    });

    test('settings API accepts only explicit toggle values', async () => {
        const key = 'headless_mode';
        const previous = DataService.getAppConfig()[key] ?? '1';
        try {
            const invalid = await request(app).post('/api/config').send({ key, value: 'sometimes' });
            expect(invalid.statusCode).toBe(400);

            const valid = await request(app).post('/api/config').send({ key, value: '0' });
            expect(valid.statusCode).toBe(200);
            expect(DataService.getAppConfig()[key]).toBe('0');
        } finally {
            DataService.setAppConfig(key, previous);
        }
    });

    test('API mutations appear in global console stream and saved history', async () => {
        const res = await request(app).post('/api/groups').send({ name: `Console Audit ${Date.now()}`, accounts: [], listings: [] });
        expect(res.statusCode).toBe(200);

        const liveLogs = QueueService.getQueue('all').getLogs().slice(-5);
        expect(liveLogs.some(message => message.includes('[APP] POST /api/groups'))).toBe(true);
        expect(DataService.getLogs({ mode: 'all', search: 'POST /api/groups', limit: 1000 })
            .some(log => log.context === 'APP')).toBe(true);

        await request(app).delete(`/api/groups/${res.body.id}`);
    });

    test('notification read state persists and notifications can be cleared', async () => {
        const suffix = Date.now();
        const readNotice = DataService.addNotification('info', `Read test ${suffix}`, 'read-state');
        const unreadNotice = DataService.addNotification('info', `Unread test ${suffix}`, 'unread-state');

        try {
            const beforeRead = await request(app).get('/api/notifications?limit=100');
            const notice = beforeRead.body.find(item => item.id === readNotice.id);
            expect(notice.is_read).toBe(false);
            expect(notice.created_at).toBeTruthy();

            await request(app).post(`/api/notifications/${readNotice.id}/read`);
            const afterRead = await request(app).get('/api/notifications?limit=100');
            expect(afterRead.body.find(item => item.id === readNotice.id).is_read).toBe(true);

            const clearRead = await request(app).delete('/api/notifications?readOnly=true');
            expect(clearRead.body.deleted).toBeGreaterThanOrEqual(1);
            const afterClearRead = await request(app).get('/api/notifications?limit=100');
            expect(afterClearRead.body.some(item => item.id === readNotice.id)).toBe(false);
            expect(afterClearRead.body.some(item => item.id === unreadNotice.id)).toBe(true);

            await request(app).delete('/api/notifications');
            const afterClearAll = await request(app).get('/api/notifications?limit=100');
            expect(afterClearAll.body.some(item => item.id === unreadNotice.id)).toBe(false);
        } finally {
            const testDb = new Database(path.join(__dirname, '../data/test_database.sqlite'));
            testDb.prepare('DELETE FROM notifications WHERE id IN (?, ?)').run(readNotice.id, unreadNotice.id);
            testDb.close();
        }
    });

    test('schedule creation validates cron and accepts settings form fields', async () => {
        const invalid = await request(app).post('/api/schedules').send({ name: 'Bad schedule', cronExpr: 'not-cron' });
        expect(invalid.statusCode).toBe(400);

        const created = await request(app).post('/api/schedules').send({
            name: `Settings schedule ${Date.now()}`,
            cronExpr: '0 8 * * *',
            mode: 'marketplace',
            accountId: null,
        });
        expect(created.statusCode).toBe(200);
        const schedules = await request(app).get('/api/schedules');
        expect(schedules.body.find(schedule => schedule.id === created.body.id)?.cron_expr).toBe('0 8 * * *');
        await request(app).delete(`/api/schedules/${created.body.id}`);
    });

    test('POST /api/listings - should save new listings', async () => {
        const newListings = [{ title: 'Test Listing API', price: '1000' }];
        const res = await request(app).post('/api/listings').send(newListings);
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBeTruthy();
        
        // Verify via API
        const checkRes = await request(app).get('/api/listings');
        const found = checkRes.body.find(l => l.title === 'Test Listing API');
        expect(found).toBeDefined();
    });

    test('POST /api/accounts - should create account with default name as id when name is empty', async () => {
        const res = await request(app).post('/api/accounts').send({});
        expect(res.statusCode).toEqual(200);
        expect(res.body.id).toBeDefined();
        expect(res.body.name).toBe(res.body.id);
        
        // Clean up
        await request(app).delete(`/api/accounts/${res.body.id}`);
    });

    test('POST /api/listings/generate-tags - should return generated tags', async () => {
        const res = await request(app)
            .post('/api/listings/generate-tags')
            .send({
                title: 'Honda Vario 150 2020',
                location: 'Samarinda',
                category: 'Kendaraan',
                condition: 'Bekas - Baik'
            });
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBeTruthy();
        expect(res.body.tags).toBeDefined();
        expect(res.body.tags.split(',').length).toBe(20);
    });

    test('POST /api/listings/generate-fields - should return fields and description', async () => {
        const res = await request(app)
            .post('/api/listings/generate-fields')
            .send({
                description: 'Yamaha nmax 2020 dijual'
            });
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBeTruthy();
        expect(res.body.title).toBe('Yamaha NMAX 2020');
        expect(res.body.description).toBe('Bismillah... Yamaha NMAX 2020 mulus banar.');
        expect(res.body.attributes.Merek).toBe('Yamaha');
    });
});
