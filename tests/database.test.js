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

    test('structured automation events appear in daily report details', () => {
        const reportDate = new Date().toISOString().slice(0, 10);
        const runId = `test-run-${Date.now()}`;
        DataService.startAutomationRun({ runId, mode: 'marketplace' });
        DataService.updateAutomationRunScope(runId, { accountsCount: 2, listingsCount: 3 });
        const eventId = DataService.recordAutomationEvent({
            actionType: 'marketplace_post',
            runId,
            mode: 'marketplace',
            accountId: 'test-account',
            listingId: 987654321,
            result: 'success',
            message: 'Test post succeeded',
            metadata: { listingTitle: 'Test listing' },
        });
        const failedEventId = DataService.recordAutomationEvent({
            actionType: 'listing_error',
            runId,
            mode: 'marketplace',
            accountId: 'test-account',
            listingId: 987654321,
            result: 'failed',
            message: 'Test listing failed',
        });
        DataService.finishAutomationRun({ runId, status: 'completed', durationMs: 12500 });

        try {
            const detail = DataService.getDailyReportDetails(reportDate);
            expect(detail.events.some(event => event.id === eventId && event.action_type === 'marketplace_post')).toBe(true);
            expect(detail.summary.errorCount).toBeGreaterThanOrEqual(1);
            expect(detail.runs.some(run => run.run_id === runId && run.status === 'completed')).toBe(true);
            expect(detail.runs.find(run => run.run_id === runId).duration_ms).toBe(12500);
            const report = DataService.getDailyReports(30).find(row => row.report_date === reportDate);
            expect(report.actual_posts).toBeGreaterThanOrEqual(1);
            expect(report.actual_actions).toBeGreaterThanOrEqual(1);
            expect(report.actual_errors).toBeGreaterThanOrEqual(1);
            expect(report.actual_runs).toBeGreaterThanOrEqual(1);
            expect(report.duration_ms).toBeGreaterThanOrEqual(12500);
        } finally {
            const testDb = new Database(TEST_DB_PATH);
            testDb.prepare('DELETE FROM automation_events WHERE id IN (?, ?)').run(eventId, failedEventId);
            testDb.prepare('DELETE FROM automation_runs WHERE run_id = ?').run(runId);
            testDb.close();
        }
    });

    test('failed listing statuses can be reset to ready without deleting products', async () => {
        const listingId = await DataService.addListing({ title: `Reset Status Test ${Date.now()}` });
        try {
            DataService.updateListingStatus(listingId, 'failed');
            const result = DataService.resetFailedListings();
            const listing = (await DataService.getListings()).find(item => item.id === listingId);
            expect(result.changes).toBeGreaterThanOrEqual(1);
            expect(listing).toBeDefined();
            expect(listing.status).toBe('ready');
            expect(listing.last_posted).toBeNull();
        } finally {
            await DataService.deleteListing(listingId);
        }
    });
});
