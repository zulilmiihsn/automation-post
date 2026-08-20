const DataService = require("../services/dataService");

class SettingsController {
	static async getConfig(_req, res) {
		const { FIELD_MAP, FIELD_CONFIG } = require("../../core/constants");
		const appConfig = DataService.getAppConfig();
		res.json({ FIELD_MAP, FIELD_CONFIG, ...appConfig });
	}

	static async setConfig(req, res) {
		try {
			const { key, value } = req.body;
			const ALLOWED_KEYS = [
				"scraper_account_id", "debug_account_id",
				"headless_mode", "max_retries", "page_timeout",
				"rate_limit_likes_per_day", "rate_limit_posts_per_day", "rate_limit_comments_per_day",
				"ai_chat_enabled", "ai_model",
				"anti_detect_enabled", "anti_detect_viewport", "anti_detect_ua", "anti_detect_mouse",
			];
			if (!ALLOWED_KEYS.includes(key)) {
				return res.status(400).json({ error: "Config key tidak diizinkan" });
			}
			DataService.setAppConfig(key, value);
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
}

module.exports = SettingsController;
