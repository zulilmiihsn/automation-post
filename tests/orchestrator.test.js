const BotOrchestrator = require('../src/core/orchestrator');
const DataService = require('../src/web/services/dataService');
const FacebookBot = require('../src/core/bot');

// Mock dependencies
jest.mock('../src/web/services/dataService');
jest.mock('../src/core/bot');

describe('BotOrchestrator', () => {
    let orchestrator;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Mock default DataService behavior
        DataService.getListings.mockResolvedValue([]);
        DataService.getAccounts.mockResolvedValue([]);
        DataService.updateListingStatus.mockReturnValue();
        DataService.resetHangingListings.mockResolvedValue();

        // Create fresh orchestrator instance
        orchestrator = new BotOrchestrator('all');
        // Mute logger to keep test output clean
        orchestrator.logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            success: jest.fn()
        };
    });

    test('run() should early return if no active listings', async () => {
        DataService.getListings.mockResolvedValue([]);
        
        await orchestrator.run();

        expect(DataService.getListings).toHaveBeenCalled();
        expect(DataService.getAccounts).toHaveBeenCalled();
        expect(orchestrator.logger.warn).toHaveBeenCalledWith('Tidak ada listing aktif untuk diposting.');
    });

    test('run() should early return if no linked accounts', async () => {
        DataService.getListings.mockResolvedValue([{ id: 1, isActive: true }]);
        DataService.getAccounts.mockResolvedValue([]);

        await orchestrator.run();

        expect(orchestrator.logger.error).toHaveBeenCalledWith('Tidak ada akun Facebook yang tertaut (linked). Mohon login dulu di Dashboard.');
    });

    test('run() should process accounts with active listings', async () => {
        const mockListing = { id: 1, isActive: true, title: 'Test Listing' };
        const mockAccount = { name: 'Test Account', linked: true, isActive: true, profile: 'test-profile' };
        
        DataService.getListings.mockResolvedValue([mockListing]);
        DataService.getAccounts.mockResolvedValue([mockAccount]);

        // Spy on _processAccount to avoid deep nesting in this test
        jest.spyOn(orchestrator, '_processAccount').mockResolvedValue();

        await orchestrator.run();

        expect(orchestrator._processAccount).toHaveBeenCalledWith(mockAccount, [mockListing]);
        expect(DataService.resetHangingListings).toHaveBeenCalled();
        expect(orchestrator.logger.success).toHaveBeenCalledWith('Semua antrean otomasi selesai.');
    });

    test('_processAccount should initialize bot, process listings, and close bot', async () => {
        const mockBotInstance = {
            init: jest.fn().mockResolvedValue(),
            close: jest.fn().mockResolvedValue()
        };
        FacebookBot.mockImplementation(() => mockBotInstance);

        const mockListing = { id: 1, isActive: true };
        const mockAccount = { name: 'Test Account', profile: 'test-profile' };

        jest.spyOn(orchestrator, '_processListing').mockResolvedValue();

        await orchestrator._processAccount(mockAccount, [mockListing]);

        expect(FacebookBot).toHaveBeenCalledTimes(1);
        expect(mockBotInstance.init).toHaveBeenCalledTimes(1);
        expect(orchestrator._processListing).toHaveBeenCalledWith(
            mockBotInstance, 
            mockAccount, 
            mockListing, 
            1, 
            1
        );
        expect(mockBotInstance.close).toHaveBeenCalledTimes(1);
    });

    test('_processAccount should retry on BROWSER_CLOSED error', async () => {
        const mockBotInstance = {
            init: jest.fn().mockResolvedValue(),
            close: jest.fn().mockResolvedValue()
        };
        FacebookBot.mockImplementation(() => mockBotInstance);

        const mockListing = { id: 1, isActive: true };
        const mockAccount = { name: 'Test Account', profile: 'test-profile' };

        // Simulate BROWSER_CLOSED on first try, success on second
        jest.spyOn(orchestrator, '_processListing')
            .mockRejectedValueOnce(new Error('BROWSER_CLOSED'))
            .mockResolvedValueOnce(undefined);

        await orchestrator._processAccount(mockAccount, [mockListing]);

        expect(mockBotInstance.init).toHaveBeenCalledTimes(2); // Initial + 1 retry
        expect(mockBotInstance.close).toHaveBeenCalledTimes(2); // 1 retry close + final close
        expect(orchestrator._processListing).toHaveBeenCalledTimes(2);
        expect(orchestrator.logger.warn).toHaveBeenCalledWith('Browser hancur/timeout. Menginisialisasi ulang... (sisa 2 percobaan)');
    });

    test('_processListing should handle restricted account flow correctly', async () => {
        const mockBotInstance = {};
        const mockAccount = { name: 'Test Account' };
        const mockListing = { id: 1, title: 'Test' };

        jest.spyOn(orchestrator, '_phase1FeedAndShare').mockRejectedValue(new Error('ACCOUNT_LIMIT_REACHED'));
        jest.spyOn(orchestrator, '_phase2Marketplace').mockResolvedValue();

        await expect(
            orchestrator._processListing(mockBotInstance, mockAccount, mockListing, 1, 1)
        ).rejects.toThrow('ACCOUNT_LIMIT_REACHED');
        
        expect(DataService.updateListingStatus).toHaveBeenCalledWith(1, 'posting');
        expect(orchestrator._phase1FeedAndShare).toHaveBeenCalled();
        expect(DataService.updateListingStatus).toHaveBeenCalledWith(1, 'failed');
        expect(orchestrator._phase2Marketplace).not.toHaveBeenCalled(); // Should skip phase 2 if restricted
    });

    test('_processListing should handle successful flow correctly', async () => {
        const mockBotInstance = {};
        const mockAccount = { name: 'Test Account' };
        const mockListing = { id: 1, title: 'Test' };

        jest.spyOn(orchestrator, '_phase1FeedAndShare').mockResolvedValue(false); // false means not restricted
        jest.spyOn(orchestrator, '_phase2Marketplace').mockResolvedValue();

        await orchestrator._processListing(mockBotInstance, mockAccount, mockListing, 1, 1);

        expect(DataService.updateListingStatus).toHaveBeenCalledWith(1, 'posting');
        expect(orchestrator._phase1FeedAndShare).toHaveBeenCalled();
        expect(orchestrator._phase2Marketplace).toHaveBeenCalled();
        expect(DataService.updateListingStatus).toHaveBeenCalledWith(1, 'success');
    });

    test('_handleListingError should handle ACCOUNT_LIMIT_REACHED specifically', () => {
        const mockAccount = { name: 'Test Account' };
        const mockListing = { id: 1, title: 'Test' };
        const mockError = new Error('ACCOUNT_LIMIT_REACHED');

        expect(() => {
            orchestrator._handleListingError(mockAccount, mockListing, mockError);
        }).toThrow('ACCOUNT_LIMIT_REACHED');

        expect(orchestrator.logger.warn).toHaveBeenCalled();
        expect(DataService.updateListingStatus).toHaveBeenCalledWith(1, 'failed');
    });

    test('_getLinkedAccounts should filter by accountId if provided', async () => {
        const accounts = [
            { id: '1', name: 'Account 1', linked: true, isActive: true },
            { id: '2', name: 'Account 2', linked: true, isActive: true },
            { id: '3', name: 'Account 3', linked: false, isActive: true },
        ];
        DataService.getAccounts.mockResolvedValue(accounts);

        // Test with accountId '1'
        const orchWithFilter = new BotOrchestrator('all', '1');
        orchWithFilter.logger = { warn: jest.fn() };
        let filtered = await orchWithFilter._getLinkedAccounts();
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe('1');

        // Test with invalid accountId
        const orchWithInvalid = new BotOrchestrator('all', '999');
        orchWithInvalid.logger = { warn: jest.fn() };
        filtered = await orchWithInvalid._getLinkedAccounts();
        expect(filtered).toHaveLength(0);
        expect(orchWithInvalid.logger.warn).toHaveBeenCalledWith('Akun dengan ID 999 tidak aktif, tidak terhubung, atau tidak ditemukan.');
    });
});
