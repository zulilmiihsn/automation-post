const DataService = require("../services/dataService");
const HealthService = require("../../services/healthService");
const RateLimiter = require("../../services/rateLimiter");

class HealthController {
	static async getHealth(_req, res) {
		try {
			const status = HealthService.getStatus();
			res.json(status);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getActionBudget(req, res) {
		try {
			const { accountId } = req.query;
			if (accountId) {
				res.json(RateLimiter.getBudgetSummary(accountId));
			} else {
				res.json(DataService.getActionBudgetSummary());
			}
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
}

module.exports = HealthController;
