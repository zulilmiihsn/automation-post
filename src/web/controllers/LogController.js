const DataService = require("../services/dataService");
const QueueService = require("../services/queueService");
const NotificationService = require("../../services/notificationService");

class LogController {
	static streamLogs(req, res) {
		const mode = req.query.mode || "all";
		const queue = QueueService.getQueue(mode);

		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.flushHeaders();

		const onLog = (logStr) => {
			res.write(`data: ${JSON.stringify({ msg: logStr })}\n\n`);
		};

		const onStatus = (status) => {
			res.write(`data: ${JSON.stringify({ type: "status", ...status })}\n\n`);
		};

		const onDone = () => {
			res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
		};

		if (mode === "all") {
			queue.getLogs().forEach((logStr) => onLog(logStr));

			const allQueues = QueueService.getAllQueues();
			for (const [qName, q] of Object.entries(allQueues)) {
				if (qName !== "all") {
					res.write(`data: ${JSON.stringify({ type: "status", mode: qName, isRunning: q.isRunning, queueLength: q.queue.length })}\n\n`);
				}
			}

			queue.on("log", onLog);

			const statusListeners = {};
			const doneListeners = {};

			for (const [qName, q] of Object.entries(allQueues)) {
				if (qName !== "all") {
					statusListeners[qName] = (_status) => {
						res.write(`data: ${JSON.stringify({ type: "status", mode: qName, isRunning: q.isRunning, queueLength: q.queue.length })}\n\n`);
					};
					doneListeners[qName] = () => {
						res.write(`data: ${JSON.stringify({ done: true, mode: qName })}\n\n`);
					};
					q.on("status", statusListeners[qName]);
					q.on("done", doneListeners[qName]);
				}
			}

			req.on("close", () => {
				queue.removeListener("log", onLog);
				for (const [qName, q] of Object.entries(allQueues)) {
					if (qName !== "all") {
						q.removeListener("status", statusListeners[qName]);
						q.removeListener("done", doneListeners[qName]);
					}
				}
			});
		} else {
			queue.getLogs().forEach((logStr) => onLog(logStr));
			onStatus(queue.getStatus());

			queue.on("log", onLog);
			queue.on("status", onStatus);
			queue.on("done", onDone);

			req.on("close", () => {
				queue.removeListener("log", onLog);
				queue.removeListener("status", onStatus);
				queue.removeListener("done", onDone);
			});
		}
	}

	static async getLogs(req, res) {
		try {
			const { mode, level, search, limit, before } = req.query;
			const logs = DataService.getLogs({
				mode,
				level,
				search,
				limit: limit ? parseInt(limit, 10) : 200,
				before,
			});
			res.json(logs);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async clearLogs(req, res) {
		try {
			const { olderThanDays } = req.body || {};
			const result = DataService.clearLogs(olderThanDays || 7);
			res.json({ success: true, deleted: result.changes });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getLogStats(_req, res) {
		try {
			const stats = DataService.getLogStats();
			res.json(stats);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static streamNotifications(req, res) {
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.flushHeaders();

		const unsub = NotificationService.onNotification((notif) => {
			res.write(`data: ${JSON.stringify(notif)}\n\n`);
		});

		req.on('close', () => {
			unsub();
		});
	}

	static async getNotifications(req, res) {
		try {
			const { unreadOnly, limit } = req.query;
			res.json(DataService.getNotifications({
				unreadOnly: unreadOnly === 'true',
				limit: limit ? parseInt(limit, 10) : 50,
			}));
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getUnreadCount(_req, res) {
		try {
			res.json({ count: DataService.getUnreadNotificationCount() });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async markNotificationRead(req, res) {
		try {
			DataService.markNotificationRead(parseInt(req.params.id, 10));
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async markAllNotificationsRead(_req, res) {
		try {
			DataService.markAllNotificationsRead();
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
}

module.exports = LogController;
