require("dotenv").config();
const DataService = require("../services/dataService");
const { getAIConfig } = require("../../services/aiProvider");

const NUMERIC_LIMITS = {
	max_retries: { min: 0, max: 10 },
	page_timeout: { min: 1000, max: 120000 },
	rate_limit_likes_per_day: { min: 0, max: 1000 },
	rate_limit_posts_per_day: { min: 0, max: 1000 },
	rate_limit_comments_per_day: { min: 0, max: 1000 },
	sundul_max_actions: { min: 1, max: 100 },
};
const BOOLEAN_KEYS = new Set(["headless_mode", "ai_chat_enabled", "anti_detect_enabled", "anti_detect_mouse"]);
const TEXT_LIMITS = {
	scraper_account_id: 100,
	debug_account_id: 100,
	ai_model: 200,
	chat_enabled_accounts: 1000,
	anti_detect_viewport: 100,
	anti_detect_ua: 512,
};

function normalizeConfigValue(key, value) {
	if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
		return { error: "Nilai konfigurasi harus berupa teks atau angka." };
	}
	const normalized = String(value ?? "").trim();
	if (BOOLEAN_KEYS.has(key)) {
		if (["1", "true", "on"].includes(normalized.toLowerCase())) return { value: "1" };
		if (["0", "false", "off"].includes(normalized.toLowerCase())) return { value: "0" };
		return { error: "Nilai toggle harus aktif atau nonaktif." };
	}
	if (NUMERIC_LIMITS[key]) {
		if (normalized === "") return { value: "" };
		const number = Number(normalized);
		const { min, max } = NUMERIC_LIMITS[key];
		if (!Number.isSafeInteger(number) || number < min || number > max) {
			return { error: `Nilai harus berupa bilangan bulat antara ${min} dan ${max}.` };
		}
		return { value: String(number) };
	}
	const maxLength = TEXT_LIMITS[key];
	if (maxLength && normalized.length > maxLength) {
		return { error: `Nilai maksimal ${maxLength} karakter.` };
	}
	return { value: normalized };
}

class SettingsController {
	static async getConfig(_req, res) {
		const { FIELD_MAP, FIELD_CONFIG } = require("../../core/constants");
		const appConfig = DataService.getAppConfig();
		const heavyAI = getAIConfig("heavy");
		const lightAI = getAIConfig("light");
		res.json({
			FIELD_MAP,
			FIELD_CONFIG,
			...appConfig,
			runtime_ai_models: {
				provider: heavyAI.provider,
				heavy: heavyAI.model,
				light: lightAI.model,
				credentials_configured: Boolean(heavyAI.apiKey && lightAI.apiKey),
			},
		});
	}

	static async setConfig(req, res) {
		try {
			const { key, value } = req.body || {};
			const ALLOWED_KEYS = [
				"scraper_account_id", "debug_account_id",
				"headless_mode", "max_retries", "page_timeout",
				"rate_limit_likes_per_day", "rate_limit_posts_per_day", "rate_limit_comments_per_day",
				"sundul_max_actions",
			"ai_chat_enabled", "ai_model", "chat_enabled_accounts",
			"anti_detect_enabled", "anti_detect_viewport", "anti_detect_ua", "anti_detect_mouse",
			];
			if (!ALLOWED_KEYS.includes(key)) {
				return res.status(400).json({ error: "Config key tidak diizinkan" });
			}
			const result = normalizeConfigValue(key, value);
			if (result.error) return res.status(400).json({ error: result.error });
			DataService.setAppConfig(key, result.value);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
}

module.exports = SettingsController;
