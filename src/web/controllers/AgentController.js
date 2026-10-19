const DataService = require("../services/dataService");
const QueueService = require("../services/queueService");
const { normalizeFacebookUrl } = require("../../utils/facebookUrl");

class AgentController {
	static async getAgentStats(_req, res) {
		try {
			const stats = DataService.getAgentStats();
			res.json(stats);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getAgentInteractions(req, res) {
		try {
			const { limit, author } = req.query;
			const interactions = DataService.getAgentInteractions({
				limit: limit ? parseInt(limit, 10) : 50,
				author,
			});
			res.json(interactions);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getAgentMemories(req, res) {
		try {
			const { search, limit } = req.query;
			const memories = DataService.getUserMemories({
				search,
				limit: limit ? parseInt(limit, 10) : 100,
			});
			res.json(memories);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
    
    static async runAgent(req, res) {
		const { accountId, limit, targetUrl } = req.body || {};
		const actionLimit = limit == null ? 5 : Number(limit);
		if (!Number.isInteger(actionLimit) || actionLimit < 1 || actionLimit > 20) {
			return res.status(400).json({ error: "Limit AI Agent harus antara 1 dan 20" });
		}
		const safeTargetUrl = targetUrl ? normalizeFacebookUrl(targetUrl) : null;
		if (targetUrl && !safeTargetUrl) {
			return res.status(400).json({ error: "URL target harus HTTPS Facebook yang valid" });
		}
		const queue = QueueService.getQueue("agent");
		const started = queue.startAgent(accountId, actionLimit, safeTargetUrl);
		if (started) {
			res.json({ success: true, message: "AI Agent dimulai" });
		} else {
			const running = QueueService.getRunningModes();
			const error = running.length
				? `Masih ada proses otomasi berjalan: ${running.join(", ")}. Hentikan dulu.`
				: "AI Agent sudah berjalan";
			res.status(400).json({ error });
		}
	}

	static async stopAgent(_req, res) {
		const queue = QueueService.getQueue("agent");
		const stopped = queue.stopAutomation();
		if (stopped) {
			res.json({ success: true, message: "AI Agent dihentikan" });
		} else {
			res.status(400).json({ error: "AI Agent tidak sedang berjalan" });
		}
	}
}

module.exports = AgentController;
