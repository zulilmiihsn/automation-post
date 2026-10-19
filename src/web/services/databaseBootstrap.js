const fs = require("fs-extra");
const { runMigrations } = require("./dataMigrations");
const { ensureSchema } = require("./databaseSchema");
const { accountsFile, listingsFile } = require("./storagePaths");

function initializeDatabase(db) {
	ensureSchema(db);
	const configDefaults = [
		["scraper_account_id", ""],
		["debug_account_id", ""],
		["rate_limit_likes_per_day", "50"],
		["rate_limit_posts_per_day", "20"],
		["rate_limit_comments_per_day", "30"],
		["ai_chat_enabled", "1"],
		["ai_model", "qwen/qwen3.8-27b"],
		["headless_mode", "1"],
		["anti_detect_enabled", "1"],
	];
	const seedConfig = db.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)");
	db.transaction(() => {
		for (const [key, value] of configDefaults) seedConfig.run(key, value);
	})();

	if (db.prepare("SELECT COUNT(*) AS count FROM automation_schedules").get().count === 0) {
		const insertSchedule = db.prepare(
			"INSERT INTO automation_schedules (name, cron_expr, mode, enabled) VALUES (?, ?, ?, ?)",
		);
		db.transaction(() => {
			insertSchedule.run("Auto Post Pagi (07:00)", "0 7 * * *", "marketplace", 1);
			insertSchedule.run("Auto Post Siang (14:00)", "0 14 * * *", "marketplace", 1);
			insertSchedule.run("Auto Post Malam (19:00)", "0 19 * * *", "marketplace", 1);
			insertSchedule.run("Auto Post Larut (23:00)", "0 23 * * *", "marketplace", 1);
		})();
	}

	runMigrations(db, fs, { accounts: accountsFile, listings: listingsFile });
}

module.exports = { initializeDatabase };
