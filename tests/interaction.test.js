const InteractionEngine = require('../src/core/interactionEngine');

describe('InteractionEngine', () => {
    let mockPage;
    let engine;

    beforeEach(() => {
        mockPage = {
            waitForLoadState: jest.fn().mockResolvedValue(undefined),
            click: jest.fn().mockResolvedValue(undefined),
            fill: jest.fn().mockResolvedValue(undefined),
            type: jest.fn().mockResolvedValue(undefined),
            waitForSelector: jest.fn().mockResolvedValue({ 
                click: jest.fn(),
                scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined)
            }),
            evaluate: jest.fn(),
            evaluateHandle: jest.fn(),
            keyboard: {
                press: jest.fn().mockResolvedValue(undefined),
                type: jest.fn().mockResolvedValue(undefined)
            }
        };
        engine = new InteractionEngine(mockPage, 'TestAccount');
        // Mock delay so tests run fast
        jest.spyOn(engine, 'delay').mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('withRetry should retry on failure and eventually succeed', async () => {
        const failingTask = jest.fn()
            .mockRejectedValueOnce(new Error('Fail 1'))
            .mockRejectedValueOnce(new Error('Fail 2'))
            .mockResolvedValue('Success');

        const result = await engine.withRetry(failingTask, 3, 100);
        
        expect(result).toBe('Success');
        expect(failingTask).toHaveBeenCalledTimes(3);
    });

    test('withRetry should throw after max retries', async () => {
        const alwaysFails = jest.fn().mockRejectedValue(new Error('Permanent Fail'));

        await expect(engine.withRetry(alwaysFails, 2, 10))
            .rejects.toThrow('Permanent Fail');
        
        expect(alwaysFails).toHaveBeenCalledTimes(2);
    });

    test('waitForCondition should return true when condition is met', async () => {
        let count = 0;
        const condition = jest.fn().mockImplementation(async () => {
            count++;
            return count === 3;
        });

        const result = await engine.waitForCondition(condition, 5000, 10);
        expect(result).toBe(true);
        expect(condition).toHaveBeenCalledTimes(3);
    });

    test('waitForCondition should return false on timeout', async () => {
        const neverTrue = jest.fn().mockResolvedValue(false);
        const result = await engine.waitForCondition(neverTrue, 50, 10);
        expect(result).toBe(false);
    });

    test('handleCombobox should attempt to click and type', async () => {
        const mockElement = { 
            click: jest.fn().mockResolvedValue(undefined),
            scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined),
            evaluate: jest.fn().mockResolvedValue(undefined)
        };
        mockPage.evaluate
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        await engine.handleCombobox(mockElement, 'Yamaha');
        
        expect(mockElement.click).toHaveBeenCalled();
        expect(mockPage.keyboard.type).toHaveBeenCalledWith('Yamaha', { delay: 10 });
        expect(mockPage.evaluate).toHaveBeenCalledTimes(2);
    });
});
