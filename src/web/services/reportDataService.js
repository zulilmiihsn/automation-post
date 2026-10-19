const { db } = require("./database");

module.exports = {
	upsertDailyReport(reportDate, data) {
		db.prepare(`
			INSERT INTO daily_reports (
				report_date, posts_created, shares_made, comments_made,
				likes_given, chats_replied, errors_count, summary
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(report_date) DO UPDATE SET
				posts_created = excluded.posts_created,
				shares_made = excluded.shares_made,
				comments_made = excluded.comments_made,
				likes_given = excluded.likes_given,
				chats_replied = excluded.chats_replied,
				errors_count = excluded.errors_count,
				summary = excluded.summary
		`).run(
			reportDate,
			data.posts_created || 0,
			data.shares_made || 0,
			data.comments_made || 0,
			data.likes_given || 0,
			data.chats_replied || 0,
			data.errors_count || 0,
			data.summary || null,
		);
	},

	getDailyReports(limit = 30) {
		return db.prepare(`
			WITH report_dates AS (
				SELECT report_date AS date FROM daily_reports
				UNION SELECT date(timestamp) FROM bot_logs WHERE timestamp >= datetime('now', '-90 days')
				UNION SELECT date(last_posted) FROM listings WHERE last_posted IS NOT NULL
				UNION SELECT date(occurred_at) FROM automation_events
				UNION SELECT date(started_at) FROM automation_runs
			)
			SELECT d.date AS report_date,
				COALESCE(r.posts_created, 0) AS posts_created,
				COALESCE(r.shares_made, 0) AS shares_made,
				COALESCE(r.comments_made, 0) AS comments_made,
				COALESCE(r.likes_given, 0) AS likes_given,
				COALESCE(r.chats_replied, 0) AS chats_replied,
				COALESCE(r.errors_count, 0) AS errors_count,
				r.summary,
				(SELECT COUNT(*) FROM automation_events WHERE date(occurred_at) = d.date AND action_type = 'marketplace_post' AND result = 'success') AS actual_posts,
				(SELECT COUNT(*) FROM automation_events WHERE date(occurred_at) = d.date AND action_type = 'feed_post' AND result = 'success') AS actual_feed_posts,
				(SELECT COUNT(*) FROM automation_events WHERE date(occurred_at) = d.date AND action_type = 'group_share' AND result = 'success') AS actual_shares,
				(SELECT COUNT(*) FROM automation_events WHERE date(occurred_at) = d.date AND result = 'failed') AS actual_errors,
				(SELECT COUNT(*) FROM automation_events WHERE date(occurred_at) = d.date AND result = 'success') AS actual_actions,
				(SELECT COUNT(*) FROM automation_runs WHERE date(started_at) = d.date) AS actual_runs,
				(SELECT COUNT(*) FROM automation_runs WHERE date(started_at) = d.date AND status IN ('failed', 'interrupted')) AS failed_runs,
				(SELECT COALESCE(SUM(duration_ms), 0) FROM automation_runs WHERE date(started_at) = d.date) AS duration_ms,
				(SELECT COUNT(*) FROM bot_logs WHERE date(timestamp) = d.date AND mode = 'all') AS activity_logs
			FROM report_dates d
			LEFT JOIN daily_reports r ON r.report_date = d.date
			WHERE d.date IS NOT NULL
			ORDER BY d.date DESC LIMIT ?
		`).all(limit);
	},

	getDailyReportDetails(reportDate) {
		const logs = db.prepare(`
			SELECT level, message, timestamp
			FROM bot_logs
			WHERE date(timestamp) = ? AND mode = 'all'
			ORDER BY timestamp ASC
		`).all(reportDate);
		const levels = { success: 0, error: 0, warn: 0, info: 0, system: 0 };
		for (const log of logs) {
			const level = String(log.level || "info").toLowerCase();
			if (Object.hasOwn(levels, level)) levels[level]++;
		}

		const events = db.prepare(`
			SELECT e.*, a.name AS account_name, a.fbName AS account_fb_name,
				l.title AS listing_title, l.price AS listing_price
			FROM automation_events e
			LEFT JOIN accounts a ON a.id = e.account_id
			LEFT JOIN listings l ON l.id = e.listing_id
			WHERE date(e.occurred_at) = ?
			ORDER BY e.occurred_at DESC, e.id DESC
		`).all(reportDate).map((event) => {
			let metadata = {};
			try { metadata = JSON.parse(event.metadata || "{}"); } catch {}
			return {
				...event,
				metadata,
				account: event.account_fb_name || event.account_name || event.account_id,
				listing_title: event.listing_title || metadata.listingTitle || null,
			};
		});
		const runs = db.prepare(`
			SELECT r.run_id, r.mode, r.status, r.started_at, r.ended_at, r.duration_ms,
				r.accounts_count, r.listings_count, r.error_message,
				COUNT(e.id) AS event_count,
				COALESCE(SUM(CASE WHEN e.result = 'success' THEN 1 ELSE 0 END), 0) AS success_count,
				COALESCE(SUM(CASE WHEN e.result = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count
			FROM automation_runs r
			LEFT JOIN automation_events e ON e.run_id = r.run_id
			WHERE date(r.started_at) = ?
			GROUP BY r.run_id
			ORDER BY r.started_at DESC
		`).all(reportDate);
		const byAccount = new Map();
		for (const event of events) {
			if (!event.account_id) continue;
			if (!byAccount.has(event.account_id)) byAccount.set(event.account_id, {
				id: event.account_id, name: event.account, events: 0, success: 0, error: 0,
				warn: 0, marketplacePosts: 0, shares: 0,
			});
			const row = byAccount.get(event.account_id);
			row.events++;
			if (event.result === "success") row.success++;
			if (event.result === "failed") row.error++;
			if (event.action_type === "marketplace_post" && event.result === "success") row.marketplacePosts++;
			if (event.action_type === "group_share" && event.result === "success") row.shares++;
		}
		const errors = events.filter((event) => event.result === "failed");
		const timeline = events.map((event) => ({
			level: event.result === "success" ? "success" : "error",
			message: event.message || `${event.action_type}: ${event.result}`,
			timestamp: event.occurred_at,
			account: event.account,
			action_type: event.action_type,
			listing_title: event.listing_title,
		}));
		const listings = events
			.filter((event) => event.action_type === "marketplace_post" && event.result === "success")
			.map((event) => ({
				id: event.listing_id,
				title: event.listing_title || "Produk terhapus",
				price: event.listing_price || 0,
				status: "success",
				account: event.account,
				last_posted: event.occurred_at,
			}));

		return {
			date: reportDate,
			summary: {
				posts: listings.length,
				feedPosts: events.filter((event) => event.action_type === "feed_post" && event.result === "success").length,
				shares: events.filter((event) => event.action_type === "group_share" && event.result === "success").length,
				actions: events.filter((event) => event.result === "success").length,
				runs: runs.length,
				failedRuns: runs.filter((run) => ["failed", "interrupted"].includes(run.status)).length,
				durationMs: runs.reduce((total, run) => total + (run.duration_ms || 0), 0),
				accounts: byAccount.size,
				logs: logs.length,
				levels,
				errorCount: errors.length,
			},
			accounts: [...byAccount.values()].sort((a, b) => b.events - a.events),
			listings,
			runs,
			errors: errors.slice(0, 30),
			timeline: timeline.slice(0, 100),
			events,
		};
	},

	getLogActivityByDay(days = 7) {
		const cutoffDate = new Date(Date.now() - days * 86400000);
		const cutoff = cutoffDate.toISOString().replace("T", " ").split(".")[0];
		const rows = db.prepare(`
			SELECT timestamp, level, message FROM bot_logs
			WHERE timestamp >= ? AND mode = 'all'
			ORDER BY timestamp ASC
		`).all(cutoff);
		const events = db.prepare(`
			SELECT date(occurred_at) AS date, action_type, result, COUNT(*) AS count
			FROM automation_events
			WHERE occurred_at >= ?
			GROUP BY date(occurred_at), action_type, result
		`).all(cutoff);
		const dayMap = {};

		for (let i = days - 1; i >= 0; i--) {
			const date = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
			dayMap[date] = { date, posts: 0, likes: 0, comments: 0, shares: 0, chats: 0, errors: 0, successes: 0, attempts: 0 };
		}

		for (const row of rows) {
			const date = (row.timestamp || "").split(" ")[0] || (row.timestamp || "").split("T")[0];
			if (!date) continue;
			if (!dayMap[date]) dayMap[date] = { date, posts: 0, likes: 0, comments: 0, shares: 0, chats: 0, errors: 0, successes: 0, attempts: 0 };

			const message = (row.message || "").toLowerCase();
			if (!(row.level === "error" || row.level === "ERROR" || message.includes("gagal") || message.includes("error"))) {
				if (message.includes("like") || message.includes("suka")) dayMap[date].likes++;
				if (message.includes("comment") || message.includes("komentar") || message.includes("komen")) dayMap[date].comments++;
				if (message.includes("chat") || message.includes("reply") || message.includes("balas")) dayMap[date].chats++;
			}
		}
		for (const event of events) {
			if (!dayMap[event.date]) dayMap[event.date] = { date: event.date, posts: 0, likes: 0, comments: 0, shares: 0, chats: 0, errors: 0, successes: 0, attempts: 0 };
			dayMap[event.date].attempts += event.count;
			if (event.result === "failed") dayMap[event.date].errors += event.count;
			else dayMap[event.date].successes += event.count;
			if (event.result !== "success") continue;
			if (["marketplace_post", "feed_post"].includes(event.action_type)) dayMap[event.date].posts += event.count;
			if (event.action_type === "group_share") dayMap[event.date].shares += event.count;
		}

		return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
	},

	getListingSuccessStats() {
		return db.prepare("SELECT status, COUNT(*) AS count FROM listings GROUP BY status").all();
	},
};
