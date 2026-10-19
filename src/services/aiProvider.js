const PROVIDERS = {
  groq: {
    apiKeyEnv: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
    models: {
      heavy: ['GROQ_MODEL_HEAVY', 'openai/gpt-oss-120b'],
      light: ['GROQ_MODEL_LIGHT', 'openai/gpt-oss-120b'],
    },
  },
  nvidia: {
    apiKeyEnv: 'NVIDIA_API_KEY',
    baseURL: process.env.NVIDIA_API_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    models: {
      heavy: ['NVIDIA_MODEL_HEAVY', 'z-ai/glm-5.3-flash'],
      light: ['NVIDIA_MODEL_LIGHT', 'z-ai/glm-5.3-flash'],
    },
  },
};

function getAIConfig(tier = 'light') {
  const requestedProvider = String(process.env.AI_PROVIDER || 'groq').trim().toLowerCase();
  if (!PROVIDERS[requestedProvider]) {
    throw new Error(`AI_PROVIDER tidak dikenal: ${requestedProvider}`);
  }
  const provider = requestedProvider;
  const config = PROVIDERS[provider];
  const [modelEnv, fallbackModel] = config.models[tier] || config.models.light;
  const model = process.env[modelEnv] || fallbackModel;
  const requestOptions = provider === 'nvidia'
    ? { reasoning_effort: process.env.NVIDIA_REASONING_EFFORT || 'low' }
    : model.startsWith('openai/gpt-oss-')
      ? { reasoning_effort: process.env.GROQ_REASONING_EFFORT || 'low' }
      : {};

  return {
    provider,
    apiKey: process.env[config.apiKeyEnv],
    apiKeyEnv: config.apiKeyEnv,
    baseURL: provider === 'nvidia'
      ? process.env.NVIDIA_API_BASE_URL || config.baseURL
      : config.baseURL,
    model,
    requestOptions,
  };
}

module.exports = { getAIConfig };
