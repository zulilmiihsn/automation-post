const DataService = require("../services/dataService");

class AnalyticsController {
	static async getAnalyticsActivity(req, res) {
		try {
			const days = req.query.days ? parseInt(req.query.days, 10) : 7;
			res.json(DataService.getLogActivityByDay(days));
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getListingStats(_req, res) {
		try {
			res.json(DataService.getListingSuccessStats());
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getDailyReports(req, res) {
		try {
			const limit = req.query.limit ? parseInt(req.query.limit, 10) : 30;
			res.json(DataService.getDailyReports(limit));
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getDailyReportDetails(req, res) {
		try {
			const reportDate = String(req.params.date || '');
			if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || Number.isNaN(Date.parse(`${reportDate}T00:00:00Z`))) {
				return res.status(400).json({ error: "Tanggal laporan tidak valid" });
			}
			res.json(DataService.getDailyReportDetails(reportDate));
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async generateReport(_req, res) {
		try {
			const today = new Date().toISOString().split('T')[0];
			const details = DataService.getDailyReportDetails(today);
			const counts = {
				posts: details.summary.posts,
				shares: details.summary.shares,
				comments: 0,
				likes: 0,
				chats: 0,
				errors: details.summary.errorCount,
			};
			const totalActions = details.summary.actions;
			const summary = `Marketplace: ${counts.posts}, Feed: ${details.summary.feedPosts}, Share grup: ${counts.shares}, Aksi gagal: ${counts.errors}`;

			DataService.upsertDailyReport(today, {
				posts_created: counts.posts,
				shares_made: counts.shares,
				comments_made: counts.comments,
				likes_given: counts.likes,
				chats_replied: counts.chats,
				errors_count: counts.errors,
				summary,
			});

			res.json({ success: true, date: today, total_actions: totalActions, summary });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
}

module.exports = AnalyticsController;
