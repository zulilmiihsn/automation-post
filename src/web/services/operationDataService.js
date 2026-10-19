const Logger = require("../../utils/logger");
const { clampQueryLimit, limitSearchText } = require("../../utils/queryBounds");
const { db } = require("./database");

const logger = new Logger("DB-OPERATIONS");
const insertLog = db.prepare(
	"INSERT INTO bot_logs (mode, level, context, message) VALUES (?, ?, ?, ?)",
);
const insertLogs = db.transaction((rows) => {
	for (const row of rows) insertLog.run(row.mode, row.level, row.context, row.message);
});

module.exports = {
	startAutomationRun({ runId, mode = "all" }) {
		if (!runId) return null;
		try {
			db.prepare("INSERT INTO automation_runs (run_id, mode, status) VALUES (?, ?, 'running')")
				.run(String(runId), String(mode || "all"));
			return runId;
		} catch (error) {
			logger.warn(`Gagal mulai catatan run automasi: ${error.message}`);
			return null;
		}
	},

	updateAutomationRunScope(runId, { accountsCount = 0, listingsCount = 0 } = {}) {
		if (!runId) return null;
		try {
			return db.prepare(`
				UPDATE automation_runs SET accounts_count = ?, listings_count = ? WHERE run_id = ?
			`).run(Number(accountsCount) || 0, Number(listingsCount) || 0, String(runId));
		} catch (error) {
			logger.warn(`Gagal memperbarui cakupan run automasi: ${error.message}`);
			return null;
		}
	},

	finishAutomationRun({ runId, status = "completed", durationMs = null, errorMessage = null } = {}) {
		if (!runId) return null;
		try {
			return db.prepare(`
				UPDATE automation_runs
				SET status = ?, ended_at = CURRENT_TIMESTAMP, duration_ms = ?, error_message = ?
				WHERE run_id = ?
			`).run(String(status), durationMs == null ? null : Math.max(0, Number(durationMs)), errorMessage || null, String(runId));
		} catch (error) {
			logger.warn(`Gagal menutup catatan run automasi: ${error.message}`);
			return null;
		}
	},

	markInterruptedAutomationRuns() {
		try {
			return db.prepare(`
				UPDATE automation_runs
				SET status = 'interrupted', ended_at = CURRENT_TIMESTAMP,
					duration_ms = MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400000 AS INTEGER))
				WHERE status = 'running'
			`).run();
		} catch (error) {
			logger.warn(`Gagal rekonsiliasi run automasi yatim: ${error.message}`);
			return null;
		}
	},

	recordAutomationEvent({ actionType, runId = null, mode = "all", accountId = null, listingId = null, result, message = null, metadata = {} }) {
		if (!actionType || !["success", "failed"].includes(result)) {
			logger.warn("automation event dilewati: actionType/result tidak valid");
			return null;
		}
		try {
			const info = db.prepare(`
				INSERT INTO automation_events (action_type, run_id, mode, account_id, listing_id, result, message, metadata)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				String(actionType), runId ? String(runId) : null, String(mode || "all"), accountId ? String(accountId) : null,
				listingId == null ? null : Number(listingId), result,
				message ? String(message).slice(0, 1000) : null, JSON.stringify(metadata || {}),
			);
			return Number(info.lastInsertRowid);
		} catch (error) {
			logger.warn(`Gagal mencatat automation event: ${error.message}`);
			return null;
		}
	},

	addLogBatch(rows) {
		try {
			if (rows.length > 0) insertLogs(rows);
		} catch {
			// Logging must not interrupt automation.
		}
	},

	addLog(mode, level, context, message) {
		try {
			insertLog.run(mode || "all", level || "info", context || "SYSTEM", message);
		} catch (error) {
			logger.warn(`addLog failed: ${error.message}`);
		}
	},

	getLogs({ mode, level, search, limit = 200, before } = {}) {
		let query = "SELECT * FROM bot_logs WHERE 1=1";
		const params = [];
		if (mode && mode !== "all") {
			query += " AND mode = ?";
			params.push(mode);
		}
		if (level && level !== "all") {
			query += " AND level = ?";
			params.push(level);
		}
		const safeSearch = limitSearchText(search);
		if (safeSearch) {
			query += " AND message LIKE ?";
			params.push(`%${safeSearch}%`);
		}
		if (before) {
			query += " AND timestamp < ?";
			params.push(before);
		}
		query += " ORDER BY timestamp ASC LIMIT ?";
		params.push(clampQueryLimit(limit, 200, 1000));
		return db.prepare(query).all(...params);
	},

	clearLogs(olderThanDays = 7) {
		const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
		return db.prepare("DELETE FROM bot_logs WHERE timestamp < ?").run(cutoff);
	},

	getLogStats() {
		const total = db.prepare("SELECT COUNT(*) AS count FROM bot_logs").get().count;
		const byLevel = db.prepare("SELECT level, COUNT(*) AS count FROM bot_logs GROUP BY level").all();
		const byMode = db.prepare("SELECT mode, COUNT(*) AS count FROM bot_logs GROUP BY mode").all();
		return {
			total,
			byLevel: Object.fromEntries(byLevel.map((row) => [row.level, row.count])),
			byMode: Object.fromEntries(byMode.map((row) => [row.mode, row.count])),
		};
	},

	addHealthEvent(source, type, message, severity = "info") {
		try {
			db.prepare("INSERT INTO health_events (source, type, message, severity) VALUES (?, ?, ?, ?)")
				.run(source, type, message, severity);
		} catch (error) {
			logger.warn(`addHealthEvent failed: ${error.message}`);
		}
	},

	getHealthEvents(limit = 50) {
		return db.prepare("SELECT * FROM health_events ORDER BY timestamp DESC LIMIT ?").all(limit);
	},

	clearHealthEvents(olderThanDays = 3) {
		const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
		return db.prepare("DELETE FROM health_events WHERE timestamp < ?").run(cutoff);
	},

	getActionCount(accountId, actionType) {
		const today = new Date().toISOString().split("T")[0];
		const row = db.prepare(
			"SELECT count FROM action_budget WHERE account_id = ? AND action_type = ? AND date = ?",
		).get(accountId, actionType, today);
		return row ? row.count : 0;
	},

	incrementAction(accountId, actionType) {
		const today = new Date().toISOString().split("T")[0];
		db.prepare(`
			INSERT INTO action_budget (account_id, action_type, date, count) VALUES (?, ?, ?, 1)
			ON CONFLICT(account_id, action_type, date) DO UPDATE SET count = count + 1
		`).run(accountId, actionType, today);
	},

	getActionBudgetSummary() {
		const today = new Date().toISOString().split("T")[0];
		return db.prepare("SELECT * FROM action_budget WHERE date = ?").all(today);
	},
};
