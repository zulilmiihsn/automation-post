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

	static async generateReport(_req, res) {
		try {
			const today = new Date().toISOString().split('T')[0];
			const activity = DataService.getLogActivityByDay(1);
			const counts = { posts: 0, likes: 0, comments: 0, shares: 0, chats: 0, errors: 0 };

			const logs = DataService.getLogs ? DataService.getLogs({ limit: 1000 }) : [];
			for (const log of logs) {
				const msg = (log.message || '').toLowerCase();
				if (msg.includes('posting') || msg.includes('post')) counts.posts++;
				if (msg.includes('like')) counts.likes++;
				if (msg.includes('comment') || msg.includes('komentar')) counts.comments++;
				if (msg.includes('share') || msg.includes('bagikan')) counts.shares++;
				if (msg.includes('chat') || msg.includes('reply')) counts.chats++;
				if (log.level === 'ERROR') counts.errors++;
			}

			const totalActions = counts.posts + counts.likes + counts.comments + counts.shares + counts.chats;
			const summary = `Posts: ${counts.posts}, Likes: ${counts.likes}, Comments: ${counts.comments}, Shares: ${counts.shares}, Chats: ${counts.chats}, Errors: ${counts.errors}`;

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
