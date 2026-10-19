require("dotenv").config();
const Logger = require("../utils/logger");
const { requestAICompletion, resolveTimeout } = require("./aiClient");
const { getAIConfig } = require("./aiProvider");
const { CHAT_SYSTEM_PROMPT, buildChatPrompt } = require("./aiPrompts");

/**
 * AI Chat Service - Generates contextual replies for marketplace buyer conversations.
 * Replaces hardcoded template replies with AI-generated natural responses.
 */
class AIChatService {
	constructor() {
		const aiConfig = getAIConfig("light");
		this.apiKey = aiConfig.apiKey;
		this.apiKeyEnv = aiConfig.apiKeyEnv;
		this.provider = aiConfig.provider;
		this.model = aiConfig.model;
		this.aiConfig = aiConfig;
		this.logger = new Logger("AI-CHAT-SERVICE");
		const providerTimeout = this.provider === "nvidia" ? 15000 : 5000;
		this._timeout = resolveTimeout(
			process.env.AI_CHAT_TIMEOUT_MS,
			providerTimeout,
		);
	}

	/**
	 * Generate a contextual reply for a marketplace buyer message.
	 * @param {string} buyerMessage - The buyer's message
	 * @param {object} listingContext - Optional listing info for context
	 * @returns {string|null} Generated reply or null if failed
	 */
	async generateReply(buyerMessage, listingContext = {}, history = [], options = {}) {
		if (!this.apiKey) {
			this.logger.warn(`${this.apiKeyEnv} tidak ditemukan; pakai balasan template.`);
			return null;
		}

		let memory = "";
		const username = typeof options.username === "string" ? options.username.slice(0, 80) : "";
		try {
			if (username) {
				const DataService = require("../web/services/dataService");
				memory = DataService.getUserMemory(username) || "";
			}
		} catch (_e) {}
		const prompt = buildChatPrompt(buyerMessage, listingContext, history, memory, options.followup === true);

		try {
			const raw = await requestAICompletion(
				this.aiConfig,
				{
					messages: [
						{ role: "system", content: CHAT_SYSTEM_PROMPT },
						{ role: "user", content: prompt },
					],
					temperature: 0.7,
					max_tokens: this.model.startsWith("openai/gpt-oss-") ? 256 : 100,
				},
				{ timeoutMs: this._timeout },
			);
			const memoMatch = raw.match(/\nMEMO:\s*(.+)\s*$/);
			const memo = memoMatch ? memoMatch[1].trim().slice(0, 200) : "";
			const reply = raw.replace(/\nMEMO:\s*.+\s*$/, "").trim();
			const wordCount = reply.split(/\s+/).filter(Boolean).length;
			if (reply.length <= 300 && wordCount <= 20) {
				this.logger.info(`AI Reply generated: "${reply.substring(0, 50)}..."`);
				if (username && memo) {
					try {
						const DataService = require("../web/services/dataService");
						DataService.saveOrUpdateMemory(username, memo);
					} catch (_e) {}
				}
				return reply;
			}
			return null;
		} catch (err) {
			this.logger.warn(`AI reply generation failed: ${err.message}. Using template fallback.`);
			return null;
		}
	}
}

module.exports = new AIChatService();
