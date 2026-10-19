jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const { requestAICompletion, resolveTimeout } = require('../src/services/aiClient');

describe('AI completion client', () => {
    const originalTimeout = process.env.AI_REQUEST_TIMEOUT_MS;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.AI_REQUEST_TIMEOUT_MS;
    });

    afterAll(() => {
        if (originalTimeout === undefined) delete process.env.AI_REQUEST_TIMEOUT_MS;
        else process.env.AI_REQUEST_TIMEOUT_MS = originalTimeout;
    });

    test('sends provider config and bounded timeout, returns trimmed content', async () => {
        axios.post.mockResolvedValue({ data: { choices: [{ message: { content: ' {"ok":true} ' } }] } });
        const config = {
            provider: 'groq',
            apiKey: 'test-key',
            apiKeyEnv: 'GROQ_API_KEY',
            baseURL: 'https://api.groq.com/openai/v1/',
            model: 'openai/gpt-oss-120b',
            requestOptions: { reasoning_effort: 'low' },
        };

        await expect(requestAICompletion(config, { temperature: 0.2 }, { timeoutMs: 1500 }))
            .resolves.toBe('{"ok":true}');

        expect(axios.post).toHaveBeenCalledWith(
            'https://api.groq.com/openai/v1/chat/completions',
            expect.objectContaining({ model: config.model, reasoning_effort: 'low', temperature: 0.2 }),
            expect.objectContaining({ timeout: 1500 }),
        );
    });

    test('rejects missing credentials and empty provider completions', async () => {
        await expect(requestAICompletion({ apiKeyEnv: 'GROQ_API_KEY' }, {}))
            .rejects.toThrow('GROQ_API_KEY tidak ditemukan');

        axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '  ' } }] } });
        await expect(requestAICompletion({
            provider: 'groq', apiKey: 'test-key', baseURL: 'https://api.groq.com/openai/v1', model: 'model',
        }, {})).rejects.toThrow('returned an empty completion');
    });

    test('uses safe fallback for invalid timeout values', () => {
        expect(resolveTimeout('not-a-number', 5000)).toBe(5000);
        expect(resolveTimeout(-1, 5000)).toBe(5000);
        expect(resolveTimeout(1200, 5000)).toBe(1200);
    });
});
