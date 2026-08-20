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
    });

    test('GET /api/listings - should return listings array', async () => {
        const res = await request(app).get('/api/listings');
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body)).toBeTruthy();
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
