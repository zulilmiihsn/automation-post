const { db } = require("./database");

module.exports = {
	getGroups() {
		const groups = db.prepare("SELECT id, name FROM app_groups ORDER BY id ASC").all();
		const accounts = db.prepare("SELECT account_id FROM app_group_accounts WHERE group_id = ?");
		const listings = db.prepare("SELECT listing_id FROM app_group_listings WHERE group_id = ?");
		return groups.map((group) => ({
			id: group.id,
			name: group.name,
			accounts: accounts.all(group.id).map((row) => row.account_id),
			listings: listings.all(group.id).map((row) => row.listing_id),
		}));
	},

	addGroup(name, accountIds = [], listingIds = []) {
		const insertGroup = db.prepare("INSERT INTO app_groups (name) VALUES (?)");
		const insertAccount = db.prepare("INSERT OR IGNORE INTO app_group_accounts (group_id, account_id) VALUES (?, ?)");
		const insertListing = db.prepare("INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)");
		let groupId;
		db.transaction(() => {
			groupId = insertGroup.run(name).lastInsertRowid;
			if (Array.isArray(accountIds)) {
				for (const accountId of accountIds) if (accountId) insertAccount.run(groupId, accountId);
			}
			if (Array.isArray(listingIds)) {
				for (const listingId of listingIds) if (listingId) insertListing.run(groupId, Number(listingId));
			}
		})();
		return groupId;
	},

	updateGroup(id, name, accountIds = [], listingIds = []) {
		const updateGroup = db.prepare("UPDATE app_groups SET name = ? WHERE id = ?");
		const deleteAccounts = db.prepare("DELETE FROM app_group_accounts WHERE group_id = ?");
		const deleteListings = db.prepare("DELETE FROM app_group_listings WHERE group_id = ?");
		const insertAccount = db.prepare("INSERT OR IGNORE INTO app_group_accounts (group_id, account_id) VALUES (?, ?)");
		const insertListing = db.prepare("INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)");
		db.transaction(() => {
			updateGroup.run(name, id);
			deleteAccounts.run(id);
			deleteListings.run(id);
			if (Array.isArray(accountIds)) {
				for (const accountId of accountIds) if (accountId) insertAccount.run(id, accountId);
			}
			if (Array.isArray(listingIds)) {
				for (const listingId of listingIds) if (listingId) insertListing.run(id, Number(listingId));
			}
		})();
	},

	addGroupListing(groupId, listingId) {
		db.prepare("INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)")
			.run(Number(groupId), Number(listingId));
		return true;
	},

	removeGroupListing(groupId, listingId) {
		db.prepare("DELETE FROM app_group_listings WHERE group_id = ? AND listing_id = ?")
			.run(Number(groupId), Number(listingId));
		return true;
	},

	deleteGroup(id) {
		db.prepare("DELETE FROM app_groups WHERE id = ?").run(id);
	},

	toggleGroupState(id, isActive) {
		const accountIds = db.prepare("SELECT account_id FROM app_group_accounts WHERE group_id = ?").all(id).map((row) => row.account_id);
		const listingIds = db.prepare("SELECT listing_id FROM app_group_listings WHERE group_id = ?").all(id).map((row) => row.listing_id);
		const status = isActive ? 1 : 0;
		db.transaction(() => {
			if (accountIds.length) {
				const placeholders = accountIds.map(() => "?").join(",");
				db.prepare(`UPDATE accounts SET isActive = ? WHERE id IN (${placeholders})`).run(status, ...accountIds);
			}
			if (listingIds.length) {
				const placeholders = listingIds.map(() => "?").join(",");
				db.prepare(`UPDATE listings SET isActive = ? WHERE id IN (${placeholders})`).run(status, ...listingIds);
			}
		})();
	},

	activateGroupExclusive(id) {
		const accountIds = db.prepare("SELECT account_id FROM app_group_accounts WHERE group_id = ?").all(id).map((row) => row.account_id);
		const listingIds = db.prepare("SELECT listing_id FROM app_group_listings WHERE group_id = ?").all(id).map((row) => row.listing_id);
		db.transaction(() => {
			db.prepare("UPDATE accounts SET isActive = 0").run();
			db.prepare("UPDATE listings SET isActive = 0").run();
			if (accountIds.length) {
				const placeholders = accountIds.map(() => "?").join(",");
				db.prepare(`UPDATE accounts SET isActive = 1 WHERE id IN (${placeholders})`).run(...accountIds);
			}
			if (listingIds.length) {
				const placeholders = listingIds.map(() => "?").join(",");
				db.prepare(`UPDATE listings SET isActive = 1 WHERE id IN (${placeholders})`).run(...listingIds);
			}
		})();
	},

	getSchedules() {
		return db.prepare("SELECT * FROM automation_schedules ORDER BY created_at DESC").all()
			.map((row) => ({ ...row, enabled: !!row.enabled }));
	},

	addSchedule(name, cronExpr, mode, accountId) {
		return db.prepare("INSERT INTO automation_schedules (name, cron_expr, mode, account_id) VALUES (?, ?, ?, ?)")
			.run(name, cronExpr, mode || "all", accountId || null).lastInsertRowid;
	},

	updateSchedule(id, updates) {
		const fields = [];
		const values = [];
		for (const [key, value] of Object.entries(updates)) {
			if (["name", "cron_expr", "mode", "account_id", "enabled"].includes(key)) {
				fields.push(`${key} = ?`);
				values.push(key === "enabled" ? (value ? 1 : 0) : value);
			}
		}
		if (!fields.length) return;
		values.push(id);
		db.prepare(`UPDATE automation_schedules SET ${fields.join(", ")} WHERE id = ?`).run(...values);
	},

	deleteSchedule(id) {
		return db.prepare("DELETE FROM automation_schedules WHERE id = ?").run(id);
	},

	markScheduleRun(id) {
		db.prepare("UPDATE automation_schedules SET last_run = CURRENT_TIMESTAMP WHERE id = ?").run(id);
	},

	getRecentMarketplaceRenewals(accountId, withinDays = 7) {
		const safeDays = Math.max(1, Math.min(90, Number(withinDays) || 7));
		return db.prepare(`
			SELECT account_id, listing_key, title, renewed_at
			FROM marketplace_renewals
			WHERE account_id = ? AND renewed_at >= datetime('now', ?)
			ORDER BY renewed_at DESC
		`).all(String(accountId), `-${safeDays} days`);
	},

	markMarketplaceRenewed(accountId, listingKey, title) {
		if (!accountId || !listingKey || !title) {
			throw new Error("accountId, listingKey, dan title wajib untuk riwayat sundul");
		}
		return db.prepare(`
			INSERT INTO marketplace_renewals (account_id, listing_key, title, renewed_at)
			VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(account_id, listing_key) DO UPDATE SET title = excluded.title, renewed_at = CURRENT_TIMESTAMP
		`).run(String(accountId), String(listingKey), String(title).substring(0, 200));
	},
};
