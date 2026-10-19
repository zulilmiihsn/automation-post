const axios = require("axios");

const DEFAULT_TIMEOUT_MS = 30_000;

function resolveTimeout(timeoutMs, fallback = DEFAULT_TIMEOUT_MS) {
	const value = Number(timeoutMs ?? process.env.AI_REQUEST_TIMEOUT_MS);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function requestAICompletion(aiConfig, request, { timeoutMs } = {}) {
	if (!aiConfig?.apiKey) {
		throw new Error(`${aiConfig?.apiKeyEnv || "AI API key"} tidak ditemukan di .env`);
	}

	const baseURL = String(aiConfig.baseURL || "").replace(/\/+$/, "");
	const response = await axios.post(
		`${baseURL}/chat/completions`,
		{
			model: aiConfig.model,
			...aiConfig.requestOptions,
			...request,
		},
		{
			headers: {
				Authorization: `Bearer ${aiConfig.apiKey}`,
				"Content-Type": "application/json",
			},
			timeout: resolveTimeout(timeoutMs),
		},
	);

	const content = response.data?.choices?.[0]?.message?.content;
	if (typeof content !== "string" || !content.trim()) {
		throw new Error(`${aiConfig.provider || "AI"} returned an empty completion`);
	}

	return content.trim();
}

module.exports = { DEFAULT_TIMEOUT_MS, requestAICompletion, resolveTimeout };
