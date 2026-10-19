jest.mock('../src/services/aiClient', () => ({
    requestAICompletion: jest.fn(),
    resolveTimeout: (value, fallback) => Number(value) > 0 ? Number(value) : fallback,
}));

const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL_LIGHT: process.env.GROQ_MODEL_LIGHT,
    AI_CHAT_TIMEOUT_MS: process.env.AI_CHAT_TIMEOUT_MS,
};
process.env.AI_PROVIDER = 'groq';
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.GROQ_MODEL_LIGHT = 'openai/gpt-oss-120b';
delete process.env.AI_CHAT_TIMEOUT_MS;

const { requestAICompletion } = require('../src/services/aiClient');
const AIChatService = require('../src/services/aiChatService');

describe('AI Chat sales replies', () => {
    let originalInfo;

    beforeAll(() => {
        originalInfo = AIChatService.logger.info;
        AIChatService.logger.info = jest.fn();
    });

    afterAll(() => {
        AIChatService.logger.info = originalInfo;
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    beforeEach(() => requestAICompletion.mockReset());

    test('uses localized facts, real buyer message, short answer, and light-model token budget', async () => {
        requestAICompletion.mockResolvedValue('Masih ada, bosku. Surat lengkap, boleh cek dan tes langsung. Mau atur waktu?');

        const reply = await AIChatService.generateReply('Masih ada?', { location: 'Berau' });

        expect(reply).toBeTruthy();
        const [, request, options] = requestAICompletion.mock.calls[0];
        expect(request.max_tokens).toBe(256);
        expect(options).toEqual({ timeoutMs: 5000 });
        expect(request.messages[0].content).toContain('Berau');
        expect(request.messages[1].content).toContain('Masih ada?');
        expect(request.messages[1].content).toContain('STNK/BPKB lengkap');
    });

    test('falls back when model exceeds reply length policy', async () => {
        requestAICompletion.mockResolvedValue('satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas tiga belas empat belas lima belas enam belas tujuh belas delapan belas sembilan belas dua puluh satu');

        await expect(AIChatService.generateReply('Masih ada?')).resolves.toBeNull();
    });
});
