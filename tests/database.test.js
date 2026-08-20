process.env.NODE_ENV = 'test';
const DataService = require('../src/web/services/dataService');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

describe('DataService (SQLite)', () => {
    // Gunakan database temporary untuk testing
    const TEST_DB_PATH = path.join(__dirname, '../data/test_database.sqlite');
    
    beforeAll(async () => {
        // Kita tidak bisa mengganti DB_PATH di dalam DataService dengan mudah tanpa refactor
        // Tapi kita bisa asumsikan DataService bekerja pada database.sqlite
        // Untuk amannya, kita test method-methodnya saja
    });

    test('getListings should return an array', async () => {
        const listings = await DataService.getListings();
        expect(Array.isArray(listings)).toBe(true);
    });

    test('getAccounts should return an array', async () => {
        const accounts = await DataService.getAccounts();
        expect(Array.isArray(accounts)).toBe(true);
    });

    test('getAccounts should hide reserved internal profiles', async () => {
        const accounts = await DataService.getAccounts();
        expect(accounts.some(acc => acc.id === 'scraper_bot' || acc.profile === 'profiles/scraper_bot')).toBe(false);
    });

    test('addListing should insert a new listing', async () => {
        const testListing = {
            title: 'Test Item ' + Date.now(),
            price: 1000,
            description: 'Test description',
            isActive: true
        };
        const id = await DataService.addListing(testListing);
        expect(id).toBeDefined();
        
        const listings = await DataService.getListings();
        const found = listings.find(l => l.id === id);
        expect(found).toBeDefined();
        expect(found.title).toBe(testListing.title);
    });

    test('maxGroups default should be 20', async () => {
        const id = await DataService.addListing({ title: 'Default Groups Test' });
        const listings = await DataService.getListings();
        const found = listings.find(l => l.id === id);
        expect(found.maxGroups).toBe(20);
    });

    test('deleteListing should remove id from app_groups', async () => {
        const id = await DataService.addListing({ title: 'Group Sync Test Listing' });
        const groupId = DataService.addGroup('Test Group Listing Sync', [], [id]);
        
        let groups = DataService.getGroups();
        let group = groups.find(g => g.id === groupId);
        expect(group.listings).toContain(id);

        await DataService.deleteListing(id);

        groups = DataService.getGroups();
        group = groups.find(g => g.id === groupId);
        expect(group.listings).not.toContain(id);

        DataService.deleteGroup(groupId);
    });

    test('deleteAccount should remove id from app_groups', async () => {
        const acc = await DataService.addAccount('Test Sync Acc');
        const groupId = DataService.addGroup('Test Group Acc Sync', [acc.id], []);

        let groups = DataService.getGroups();
        let group = groups.find(g => g.id === groupId);
        expect(group.accounts).toContain(acc.id);

        await DataService.deleteAccount(acc.id);

        groups = DataService.getGroups();
        group = groups.find(g => g.id === groupId);
        expect(group.accounts).not.toContain(acc.id);

        DataService.deleteGroup(groupId);
    });
});

