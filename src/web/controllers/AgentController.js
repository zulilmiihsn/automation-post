const DataService = require("../services/dataService");
const QueueService = require("../services/queueService");

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
		const { accountId, limit, targetUrl } = req.body;
		const queue = QueueService.getQueue("agent");
		const started = queue.startAgent(accountId, limit || 5, targetUrl);
		if (started) {
			res.json({ success: true, message: "AI Agent dimulai" });
		} else {
			res.status(400).json({ error: "AI Agent sudah berjalan" });
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
