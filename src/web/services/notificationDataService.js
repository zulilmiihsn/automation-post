const Logger = require("../../utils/logger");
const { clampQueryLimit } = require("../../utils/queryBounds");
const { db } = require("./database");

const logger = new Logger("DB-NOTIFICATIONS");

module.exports = {
	addNotification(type, title, message, data = {}) {
		if (typeof type === "object" && type !== null) {
			const notification = type;
			title = notification.title;
			message = notification.message;
			data = notification.data || {};
			type = notification.type;
		}
		try {
			const result = db.prepare(
				"INSERT INTO notifications (type, title, message, data) VALUES (?, ?, ?, ?)",
			).run(type || "info", title, message, JSON.stringify(data ?? {}));
			return { id: result.lastInsertRowid };
		} catch (error) {
			logger.warn(`addNotification failed: ${error.message}`);
			return null;
		}
	},

	getNotifications({ unreadOnly = false, limit = 50 } = {}) {
		let query = "SELECT * FROM notifications";
		if (unreadOnly) query += " WHERE read = 0";
		query += " ORDER BY timestamp DESC LIMIT ?";
		return db.prepare(query).all(clampQueryLimit(limit, 50, 500)).map((row) => ({
			...row,
			is_read: Boolean(row.read),
			created_at: row.timestamp,
			data: JSON.parse(row.data || "{}"),
		}));
	},

	markNotificationRead(id) {
		return db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
	},

	markAllNotificationsRead() {
		return db.prepare("UPDATE notifications SET read = 1").run();
	},

	getUnreadNotificationCount() {
		return db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE read = 0").get().count;
	},

	clearReadNotifications() {
		return db.prepare("DELETE FROM notifications WHERE read = 1").run();
	},

	clearAllNotifications() {
		return db.prepare("DELETE FROM notifications").run();
	},
};
