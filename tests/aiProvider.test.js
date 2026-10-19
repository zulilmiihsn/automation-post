const { getAIConfig } = require('../src/services/aiProvider');

describe('AI provider configuration', () => {
    const envKeys = [
        'AI_PROVIDER', 'GROQ_API_KEY', 'GROQ_MODEL_HEAVY', 'GROQ_MODEL_LIGHT', 'GROQ_REASONING_EFFORT',
        'NVIDIA_API_KEY', 'NVIDIA_MODEL_HEAVY', 'NVIDIA_MODEL_LIGHT', 'NVIDIA_API_BASE_URL', 'NVIDIA_REASONING_EFFORT',
    ];
    let originalEnv;

    beforeEach(() => {
        originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
        for (const key of envKeys) delete process.env[key];
    });

    afterEach(() => {
        for (const key of envKeys) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    });

    test('defaults to existing Groq models', () => {
        process.env.GROQ_API_KEY = 'test-groq-key';
        expect(getAIConfig('heavy')).toMatchObject({
            provider: 'groq',
            apiKey: 'test-groq-key',
            baseURL: 'https://api.groq.com/openai/v1',
            model: 'openai/gpt-oss-120b',
        });
        expect(getAIConfig('light').model).toBe('openai/gpt-oss-120b');
        expect(getAIConfig('light').requestOptions).toEqual({ reasoning_effort: 'low' });
    });

    test('supports NVIDIA Build OpenAI-compatible endpoints and model overrides', () => {
        process.env.AI_PROVIDER = 'nvidia';
        process.env.NVIDIA_API_KEY = 'test-nvidia-key';
        expect(getAIConfig('heavy')).toMatchObject({
            provider: 'nvidia',
            apiKey: 'test-nvidia-key',
            baseURL: 'https://integrate.api.nvidia.com/v1',
            model: 'z-ai/glm-5.3-flash',
            requestOptions: { reasoning_effort: 'low' },
        });

        process.env.NVIDIA_MODEL_HEAVY = 'deepseek-ai/deepseek-v4.1-flash';
        process.env.NVIDIA_MODEL_LIGHT = 'nvidia/custom-light-model';

        expect(getAIConfig('heavy')).toMatchObject({
            provider: 'nvidia',
            apiKey: 'test-nvidia-key',
            baseURL: 'https://integrate.api.nvidia.com/v1',
            model: 'deepseek-ai/deepseek-v4.1-flash',
        });
        expect(getAIConfig('light').model).toBe('nvidia/custom-light-model');
    });

    test('fails clearly for an unsupported provider instead of silently switching', () => {
        process.env.AI_PROVIDER = 'unsupported-provider';
        expect(() => getAIConfig('heavy')).toThrow('AI_PROVIDER tidak dikenal: unsupported-provider');
    });
});
