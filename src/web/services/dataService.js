const fs = require("fs-extra");
const path = require("node:path");
const Database = require("better-sqlite3");
const Logger = require("../../utils/logger");

const logger = new Logger("DB");

const DB_PATH =
	process.env.NODE_ENV === "test"
		? path.join(__dirname, "../../../data/test_database.sqlite")
		: path.join(__dirname, "../../../data/database.sqlite");
const ACCOUNTS_FILE = path.join(__dirname, "../../../data/accounts.json");
const LISTINGS_FILE = path.join(__dirname, "../../../data/listings.json");
const RESERVED_PROFILE_DIRS = new Set(["scraper_bot"]);

const isReservedProfile = (profilePath = "") => {
	const normalized = profilePath.replace(/\\/g, "/");
	const dirName = normalized.split("/").filter(Boolean).pop();
	return RESERVED_PROFILE_DIRS.has(dirName);
};

fs.ensureDirSync(path.join(__dirname, "../../../data"));
const db = new Database(DB_PATH, { verbose: null });

// Best Practices: Enable WAL mode for better concurrency and performance
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    profile TEXT NOT NULL,
    fbName TEXT,
    fbPic TEXT,
    targetGroups TEXT DEFAULT '[]',
    linked INTEGER DEFAULT 0,
    isActive INTEGER DEFAULT 1,
    e2ee_pin TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    price INTEGER DEFAULT 0,
    description TEXT,
    category TEXT,
    condition TEXT,
    availability TEXT,
    location TEXT,
    tags TEXT,
    sku TEXT,
    targetGroup TEXT DEFAULT 'berau',
    maxGroups INTEGER DEFAULT 20,
    status TEXT DEFAULT 'pending',
    last_posted DATETIME,
    isActive INTEGER DEFAULT 1,
    photoDir TEXT,
    photos TEXT DEFAULT '[]',
    attributes TEXT DEFAULT '{}',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    autoFeed INTEGER DEFAULT 1,
    postMarketplace INTEGER DEFAULT 1,
    existingPostUrl TEXT,
    photoUsage TEXT DEFAULT '{}'
  );

  -- Optimization: Indexes for faster queries
  CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(isActive);
  CREATE INDEX IF NOT EXISTS idx_accounts_linked ON accounts(linked);

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS bot_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT DEFAULT 'all',
    level TEXT DEFAULT 'info',
    context TEXT DEFAULT 'SYSTEM',
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_bot_logs_timestamp ON bot_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_bot_logs_mode ON bot_logs(mode);
  CREATE INDEX IF NOT EXISTS idx_bot_logs_level ON bot_logs(level);

  -- Health monitoring events
  CREATE TABLE IF NOT EXISTS health_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT,
    severity TEXT DEFAULT 'info',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_events(timestamp);

  -- Action budget tracking per account per day
  CREATE TABLE IF NOT EXISTS action_budget (
    account_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (account_id, action_type, date)
  );

  -- Agent interactions (shared from groqFbAgent)
  CREATE TABLE IF NOT EXISTS agent_interactions (
    post_key TEXT PRIMARY KEY,
    author TEXT,
    post_text TEXT,
    should_like INTEGER,
    should_comment INTEGER,
    comment_text TEXT,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agent_replies (
    reply_key TEXT PRIMARY KEY,
    post_key TEXT,
    comment_author TEXT,
    comment_text TEXT,
    should_reply INTEGER,
    reply_text TEXT,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_memories (
    username TEXT PRIMARY KEY,
    notes TEXT,
    interaction_count INTEGER DEFAULT 1,
    last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Automation schedules (cron)
  CREATE TABLE IF NOT EXISTS automation_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cron_expr TEXT NOT NULL,
    mode TEXT DEFAULT 'all',
    account_id TEXT,
    enabled INTEGER DEFAULT 1,
    last_run DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_group_accounts (
    group_id INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    PRIMARY KEY (group_id, account_id),
    FOREIGN KEY (group_id) REFERENCES app_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_group_acc_group ON app_group_accounts(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_acc_acc ON app_group_accounts(account_id);

  CREATE TABLE IF NOT EXISTS app_group_listings (
    group_id INTEGER NOT NULL,
    listing_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, listing_id),
    FOREIGN KEY (group_id) REFERENCES app_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_group_list_group ON app_group_listings(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_list_list ON app_group_listings(listing_id);

  -- Marketplace renew cooldown per Facebook listing and account
  CREATE TABLE IF NOT EXISTS marketplace_renewals (
    account_id TEXT NOT NULL,
    listing_key TEXT NOT NULL,
    title TEXT NOT NULL,
    renewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id, listing_key)
  );
  CREATE INDEX IF NOT EXISTS idx_marketplace_renewals_time
    ON marketplace_renewals(account_id, renewed_at);

  -- In-app notifications
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    read INTEGER DEFAULT 0,
    data TEXT DEFAULT '{}',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

  -- Daily summary reports
  CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date TEXT NOT NULL UNIQUE,
    posts_created INTEGER DEFAULT 0,
    shares_made INTEGER DEFAULT 0,
    comments_made INTEGER DEFAULT 0,
    likes_given INTEGER DEFAULT 0,
    chats_replied INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default config keys
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('scraper_account_id', '')`).run();
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('debug_account_id', '')`).run();
// Phase 1-4 new config seeds
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('rate_limit_likes_per_day', '50')`).run();
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('rate_limit_posts_per_day', '20')`).run();
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('rate_limit_comments_per_day', '30')`).run();
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('ai_chat_enabled', '1')`).run();
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('ai_model', 'llama-3.3-70b-versatile')`).run();
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('headless_mode', '1')`).run();
db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES ('anti_detect_enabled', '1')`).run();

// Seed default schedules if empty
const schedCount = db.prepare("SELECT COUNT(*) as count FROM automation_schedules").get().count;
if (schedCount === 0) {
	const insertSched = db.prepare("INSERT INTO automation_schedules (name, cron_expr, mode, enabled) VALUES (?, ?, ?, ?)");
	db.transaction(() => {
		insertSched.run("Auto Post Pagi (07:00)", "0 7 * * *", "marketplace", 1);
		insertSched.run("Auto Post Siang (14:00)", "0 14 * * *", "marketplace", 1);
		insertSched.run("Auto Post Malam (19:00)", "0 19 * * *", "marketplace", 1);
		insertSched.run("Auto Post Larut (23:00)", "0 23 * * *", "marketplace", 1);
	})();
}

// MIGRASI: Tambahin kolom kalau belum ada (buat database lama)
const addColumn = (table, column, def) => {
	const tableInfo = db.pragma(`table_info(${table})`);
	if (!tableInfo.some((c) => c.name === column)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
	}
};

addColumn("accounts", "fbName", "TEXT");
addColumn("accounts", "fbPic", "TEXT");
addColumn("accounts", "isActive", "INTEGER DEFAULT 1");
addColumn("accounts", "e2ee_pin", "TEXT DEFAULT ''");

// Auto-seed PIN for testing
db.exec("UPDATE accounts SET e2ee_pin = '090204' WHERE e2ee_pin IS NULL OR e2ee_pin = ''");
addColumn("listings", "status", "TEXT DEFAULT 'pending'");
addColumn("listings", "last_posted", "DATETIME");
addColumn("listings", "autoFeed", "INTEGER DEFAULT 1");
addColumn("listings", "existingPostUrl", "TEXT");
addColumn("listings", "postMarketplace", "INTEGER DEFAULT 1");
addColumn("listings", "photoUsage", "TEXT DEFAULT '{}'");

// MIGRASI: Pindahkan data app_groups lama ke tabel relasi app_group_accounts dan app_group_listings
try {
	const tableInfo = db.pragma("table_info(app_groups)");
	const hasAccountsCol = tableInfo.some((c) => c.name === "accounts");
	const hasListingsCol = tableInfo.some((c) => c.name === "listings");

	if (hasAccountsCol || hasListingsCol) {
		const existingGroups = db.prepare("SELECT * FROM app_groups").all();
		const validAccounts = new Set(db.prepare("SELECT id FROM accounts").all().map((a) => a.id));
		const validListings = new Set(db.prepare("SELECT id FROM listings").all().map((l) => l.id));

		const insertGroupAcc = db.prepare(
			"INSERT OR IGNORE INTO app_group_accounts (group_id, account_id) VALUES (?, ?)",
		);
		const insertGroupList = db.prepare(
			"INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)",
		);

		db.transaction(() => {
			for (const g of existingGroups) {
				if (g.accounts) {
					try {
						const accs = typeof g.accounts === "string" ? JSON.parse(g.accounts) : g.accounts;
						if (Array.isArray(accs)) {
							for (const aid of accs) {
								if (validAccounts.has(aid)) {
									insertGroupAcc.run(g.id, aid);
								}
							}
						}
					} catch (_) {}
				}
				if (g.listings) {
					try {
						const lists = typeof g.listings === "string" ? JSON.parse(g.listings) : g.listings;
						if (Array.isArray(lists)) {
							for (const lid of lists) {
								if (validListings.has(Number(lid))) {
									insertGroupList.run(g.id, Number(lid));
								}
							}
						}
					} catch (_) {}
				}
			}
		})();
	}
} catch (err) {
	logger.warn(`Migration of group junction tables: ${err.message}`);
}

try {
	const listCount = db
		.prepare("SELECT COUNT(*) as count FROM listings")
		.get().count;
	if (listCount === 0 && fs.existsSync(LISTINGS_FILE)) {
		const oldLists = fs.readJsonSync(LISTINGS_FILE);
		const insertList = db.prepare(
			`INSERT INTO listings (title, price, description, category, condition, availability, location, tags, sku, targetGroup, maxGroups, isActive, photoDir, photos, attributes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		db.transaction((lists) => {
			for (const l of lists) {
				insertList.run(
					l.title || "",
					l.price || "",
					l.description || "",
					l.category || "",
					l.condition || "",
					l.availability || "",
					l.location || "",
					l.tags || "",
					l.sku || "",
					l.targetGroup || "",
					l.maxGroups || 20,
					l.isActive !== false ? 1 : 0,
					l.photoDir || "",
					JSON.stringify(l.photos || []),
					JSON.stringify(l.attributes || {}),
				);
			}
		})(oldLists);

		// Best Practice: Rename file to prevent re-migration
		fs.renameSync(LISTINGS_FILE, `${LISTINGS_FILE}.bak`);
		console.log("Migration: listings.json moved to listings.json.bak");
	}

	// Also handle accounts.json
	const accCount = db
		.prepare("SELECT COUNT(*) as count FROM accounts")
		.get().count;
	if (accCount === 0 && fs.existsSync(ACCOUNTS_FILE)) {
		const oldAccs = fs.readJsonSync(ACCOUNTS_FILE);
		const insertAcc = db.prepare(
			`INSERT INTO accounts (id, name, profile, fbName, fbPic, targetGroups, linked, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		db.transaction((accs) => {
			for (const acc of accs) {
				insertAcc.run(
					acc.id,
					acc.name,
					acc.profile,
					acc.fbName || null,
					acc.fbPic || null,
					JSON.stringify(acc.targetGroups || []),
					acc.linked ? 1 : 0,
					acc.isActive !== undefined ? (acc.isActive ? 1 : 0) : 1,
				);
			}
		})(oldAccs);

		fs.renameSync(ACCOUNTS_FILE, `${ACCOUNTS_FILE}.bak`);
		console.log("Migration: accounts.json moved to accounts.json.bak");
	}
} catch (err) {
	console.error("Migration error:", err);
}

class DataService {
	static syncProfilesDirectory() {
		try {
			const profilesDir = path.join(__dirname, "../../../profiles");
			fs.ensureDirSync(profilesDir);
			const dirs = fs.readdirSync(profilesDir, { withFileTypes: true })
				.filter(dirent => dirent.isDirectory())
				.filter(dirent => !RESERVED_PROFILE_DIRS.has(dirent.name))
				.map(dirent => dirent.name);

			const existingProfiles = db.prepare("SELECT profile FROM accounts").all().map(r => r.profile);
			
			db.transaction(() => {
				for (const dir of dirs) {
					const profilePath = `profiles/${dir}`;
					if (!existingProfiles.includes(profilePath)) {
						db.prepare(
							`INSERT INTO accounts (id, name, profile, targetGroups, linked, isActive) VALUES (?, ?, ?, ?, ?, ?)`
						).run(dir, dir, profilePath, "[]", 0, 1);
					}
				}
			})();
		} catch (err) {
			console.error("Failed to sync profiles directory:", err);
		}
	}

	static async getAccounts() {
		this.syncProfilesDirectory();
		const rows = db.prepare("SELECT * FROM accounts").all()
			.filter((r) => !isReservedProfile(r.profile) && !RESERVED_PROFILE_DIRS.has(r.id));
		return rows.map((r) => ({
			...r,
			targetGroups: JSON.parse(r.targetGroups || "[]"),
			linked: !!r.linked,
			isActive: !!r.isActive,
		}));
	}



	static async addAccount(name) {
		// Cari nomor tertinggi dari DB dan filesystem, lalu lanjutkan
		const dbIds = db.prepare("SELECT id FROM accounts").all().map(r => r.id);
		const profilesDir = path.join(__dirname, "../../../profiles");
		const fsIds = fs.existsSync(profilesDir)
			? fs.readdirSync(profilesDir, { withFileTypes: true })
				.filter(d => d.isDirectory())
				.map(d => d.name)
			: [];

		const allIds = [...new Set([...dbIds, ...fsIds])];
		const maxNum = allIds.reduce((max, id) => {
			const match = id.match(/^akun_(\d+)$/);
			return match ? Math.max(max, parseInt(match[1], 10)) : max;
		}, 0);

		const id = `akun_${maxNum + 1}`;
		const profile = `profiles/${id}`;
		db.prepare(
			`INSERT INTO accounts (id, name, profile, targetGroups, linked, isActive) VALUES (?, ?, ?, ?, ?, ?)`,
		).run(id, name || id, profile, "[]", 0, 1);
		return {
			id,
			name: name || id,
			profile,
			targetGroups: [],
			linked: false,
			isActive: true,
		};
	}

	static async updateAccount(id, updateFn) {
		const row = db.prepare("SELECT * FROM accounts WHERE id=?").get(id);
		if (row) {
			const account = {
				...row,
				targetGroups: JSON.parse(row.targetGroups),
				linked: !!row.linked,
				isActive: !!row.isActive,
			};
			updateFn(account);
			db.prepare(
				`UPDATE accounts SET name=?, profile=?, fbName=?, fbPic=?, targetGroups=?, linked=?, isActive=?, e2ee_pin=? WHERE id=?`,
			).run(
				account.name,
				account.profile,
				account.fbName || null,
				account.fbPic || null,
				JSON.stringify(account.targetGroups),
				account.linked ? 1 : 0,
				account.isActive ? 1 : 0,
				account.e2ee_pin || "",
				id,
			);
			return true;
		}
		return false;
	}

	static async deleteAccount(id) {
		const row = db.prepare("SELECT profile FROM accounts WHERE id=?").get(id);
		if (row && row.profile) {
			const profilePath = path.join(__dirname, "../../../", row.profile);
			if (await fs.pathExists(profilePath)) {
				await fs.remove(profilePath);
				console.log(`[CLEANUP] Deleted profile directory: ${profilePath}`);
			}
		}
		// Foreign key CASCADE will automatically delete rows in app_group_accounts
		db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
		return true;
	}

	static async getListings() {
		const rows = db.prepare("SELECT * FROM listings").all();
		return rows.map((r) => ({
			...r,
			isActive: !!r.isActive,
			autoFeed: r.autoFeed !== undefined ? !!r.autoFeed : true,
			postMarketplace: r.postMarketplace !== undefined ? !!r.postMarketplace : true,
			existingPostUrl: r.existingPostUrl || "",
			photos: JSON.parse(r.photos || "[]"),
			attributes: JSON.parse(r.attributes || "{}"),
			photoUsage: JSON.parse(r.photoUsage || "{}"),
		}));
	}

	static async addListing(l, groupId = null) {
		const targetGroupId = groupId || l.groupId || null;
		const insert = db.prepare(
			`INSERT INTO listings (title, price, description, category, condition, availability, location, tags, sku, targetGroup, maxGroups, isActive, photoDir, photos, attributes, autoFeed, postMarketplace, existingPostUrl, photoUsage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);

		// Fix photo paths before saving or if they are broken
		const normalizedPhotos = (l.photos || []).map((p) => {
			if (p.includes("scraped\\")) {
				return p.split("scraped\\")[1]
					? `assets/scraped/${p.split("scraped\\")[1]}`
					: p;
			}
			return p;
		});

		const safeStr = (v) => {
			if (v === null || v === undefined) return '';
			if (Array.isArray(v)) return v.join(', ');
			if (typeof v === 'object') return JSON.stringify(v);
			return String(v);
		};

		let listingId;
		db.transaction(() => {
			const result = insert.run(
				String(l.title || "Untitled").substring(0, 100),
				String(l.price || "0").replace(/[^0-9]/g, ""),
				safeStr(l.description),
				safeStr(l.category),
				safeStr(l.condition),
				safeStr(l.availability),
				safeStr(l.location),
				safeStr(l.tags),
				safeStr(l.sku),
				safeStr(l.targetGroup) || "berau",
				Number(l.maxGroups) || 20,
				l.isActive !== false ? 1 : 0,
				safeStr(l.photoDir),
				JSON.stringify(normalizedPhotos),
				JSON.stringify(l.attributes || {}),
				l.autoFeed !== false ? 1 : 0,
				l.postMarketplace !== false ? 1 : 0,
				safeStr(l.existingPostUrl),
				JSON.stringify(l.photoUsage || {})
			);
			listingId = result.lastInsertRowid;

			if (targetGroupId) {
				db.prepare(
					"INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)"
				).run(Number(targetGroupId), listingId);
			}
		})();

		return listingId;
	}



	static async updateListingById(id, l) {
		const safeStr = (v) => {
			if (v === null || v === undefined) return '';
			if (Array.isArray(v)) return v.join(', ');
			if (typeof v === 'object') return JSON.stringify(v);
			return String(v);
		};
		db.prepare(`UPDATE listings SET 
            title=?, price=?, description=?, category=?, condition=?,
            availability=?, location=?, tags=?, sku=?, targetGroup=?,
            maxGroups=?, isActive=?, photoDir=?, photos=?, attributes=?,
            autoFeed=?, postMarketplace=?, existingPostUrl=?, photoUsage=?
            WHERE id=?`).run(
			String(l.title || "Untitled").substring(0, 100),
			String(l.price || "0").replace(/[^0-9]/g, ""),
			safeStr(l.description),
			safeStr(l.category),
			safeStr(l.condition),
			safeStr(l.availability),
			safeStr(l.location),
			safeStr(l.tags),
			safeStr(l.sku),
			safeStr(l.targetGroup),
			Number(l.maxGroups) || 20,
			l.isActive !== false ? 1 : 0,
			safeStr(l.photoDir),
			JSON.stringify(l.photos || []),
			JSON.stringify(l.attributes || {}),
			l.autoFeed !== false ? 1 : 0,
			l.postMarketplace !== false ? 1 : 0,
			safeStr(l.existingPostUrl),
			JSON.stringify(l.photoUsage || {}),
			id,
		);
	}

	static async deleteListing(id) {
		try {
			// Get listing photos before deletion
			const listing = db
				.prepare("SELECT photos FROM listings WHERE id = ?")
				.get(id);
			if (listing?.photos) {
				const photos = JSON.parse(listing.photos);
				
				// Gunakan map dan Promise.all agar hapus file berjalan paralel & asinkronus murni
				const deletePromises = photos.map(async (photoPath) => {
					// Normalize path: remove leading slash if exists to avoid path.join issues on Windows
					const relativePath = photoPath.startsWith("/")
						? photoPath.substring(1)
						: photoPath;
					// Use process.cwd() for reliable root path access
					const fullPath = path.join(process.cwd(), relativePath);

					if (await fs.pathExists(fullPath)) {
						await fs.unlink(fullPath);
						console.log(`[CLEANUP] Berhasil hapus: ${relativePath}`);
					} else {
						console.log(`[CLEANUP] File tidak ditemukan (skip): ${fullPath}`);
					}
				});
				
				await Promise.all(deletePromises);
			}
		} catch (err) {
			console.warn(`[CLEANUP] Failed to delete some assets: ${err.message}`);
		}

		// Foreign key CASCADE will automatically delete rows in app_group_listings
		db.prepare("DELETE FROM listings WHERE id = ?").run(id);
	}

	static updateListingStatus(id, status) {
		const stmt = db.prepare(
			"UPDATE listings SET status = ?, last_posted = CURRENT_TIMESTAMP WHERE id = ?",
		);
		return stmt.run(status, id);
	}

	static resetHangingListings() {
		// Bersihkan status 'posting' yang nyangkut biar UI bisa stop otomatis
		const stmt = db.prepare(
			"UPDATE listings SET status = 'ready' WHERE status = 'posting'",
		);
		return stmt.run();
	}

	static bulkUpdateListingsActive(isActive) {
		db.prepare("UPDATE listings SET isActive = ?").run(isActive ? 1 : 0);
		return true;
	}

	static bulkUpdateListingsFeed(autoFeed) {
		db.prepare("UPDATE listings SET autoFeed = ?").run(autoFeed ? 1 : 0);
		return true;
	}

	static async bulkUpdateListings(ids, updates) {
		if (!Array.isArray(ids) || ids.length === 0 || !updates || typeof updates !== "object") {
			return 0;
		}
		const allowedFields = [
			"title", "price", "description", "category", "condition",
			"availability", "location", "tags", "sku", "targetGroup",
			"maxGroups", "isActive", "photoDir", "photos", "attributes",
			"autoFeed", "postMarketplace", "existingPostUrl", "photoUsage"
		];

		const setClauses = [];
		const values = [];

		for (const [key, rawVal] of Object.entries(updates)) {
			if (!allowedFields.includes(key)) continue;

			if (key === "isActive" || key === "autoFeed" || key === "postMarketplace") {
				setClauses.push(`${key} = ?`);
				values.push(rawVal ? 1 : 0);
			} else if (key === "price") {
				setClauses.push("price = ?");
				values.push(String(rawVal || "0").replace(/[^0-9]/g, ""));
			} else if (key === "photos" || key === "attributes" || key === "photoUsage") {
				setClauses.push(`${key} = ?`);
				values.push(JSON.stringify(rawVal));
			} else if (key === "maxGroups") {
				setClauses.push("maxGroups = ?");
				values.push(Number(rawVal) || 20);
			} else {
				setClauses.push(`${key} = ?`);
				values.push(String(rawVal ?? ""));
			}
		}

		if (setClauses.length === 0) return 0;

		const placeholders = ids.map(() => "?").join(",");
		const sql = `UPDATE listings SET ${setClauses.join(", ")} WHERE id IN (${placeholders})`;
		const stmt = db.prepare(sql);
		const info = stmt.run(...values, ...ids.map(Number));
		return info.changes;
	}

	static async bulkDeleteListings(ids) {
		if (!Array.isArray(ids) || ids.length === 0) return 0;
		for (const id of ids) {
			await DataService.deleteListing(Number(id));
		}
		return ids.length;
	}

	static clearAllExistingPostUrls() {
		db.prepare("UPDATE listings SET existingPostUrl = ''").run();
		return true;
	}



	static getAppConfig() {
		const rows = db.prepare("SELECT key, value FROM config").all();
		return Object.fromEntries(rows.map((r) => [r.key, r.value]));
	}

	static setAppConfig(key, value) {
		db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run(key, String(value ?? ""));
		return true;
	}

	// --- Persistent Bot Logs (batched writes) ---
	static _logInsertStmt = db.prepare(
		"INSERT INTO bot_logs (mode, level, context, message) VALUES (?, ?, ?, ?)"
	);

	static _logInsertTx = db.transaction((rows) => {
		for (const r of rows) {
			DataService._logInsertStmt.run(r.mode, r.level, r.context, r.message);
		}
	});

	/**
	 * Batch insert logs. Accepts array of {mode, level, context, message}.
	 * Called by Logger flush mechanism.
	 */
	static addLogBatch(rows) {
		try {
			if (rows.length === 0) return;
			DataService._logInsertTx(rows);
		} catch (_e) {
			// Silently fail - logging should never crash the app
		}
	}

	/** Single insert for backward compat */
		static addLog(mode, level, context, message) {
		try {
			DataService._logInsertStmt.run(mode || 'all', level || 'info', context || 'SYSTEM', message);
		} catch (_e) {
			logger.warn(`addLog failed: ${_e.message}`);
		}
	}

	static getLogs({ mode, level, search, limit = 200, before } = {}) {
		let query = "SELECT * FROM bot_logs WHERE 1=1";
		const params = [];

		if (mode && mode !== 'all') {
			query += " AND mode = ?";
			params.push(mode);
		}
		if (level && level !== 'all') {
			query += " AND level = ?";
			params.push(level);
		}
		if (search) {
			query += " AND message LIKE ?";
			params.push(`%${search}%`);
		}
		if (before) {
			query += " AND timestamp < ?";
			params.push(before);
		}

		query += " ORDER BY timestamp ASC LIMIT ?";
		params.push(limit);

		return db.prepare(query).all(...params);
	}

	static clearLogs(olderThanDays = 7) {
		const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
		return db.prepare("DELETE FROM bot_logs WHERE timestamp < ?").run(cutoff);
	}

	static getLogStats() {
		const total = db.prepare("SELECT COUNT(*) as count FROM bot_logs").get().count;
		const byLevel = db.prepare(
			"SELECT level, COUNT(*) as count FROM bot_logs GROUP BY level"
		).all();
		const byMode = db.prepare(
			"SELECT mode, COUNT(*) as count FROM bot_logs GROUP BY mode"
		).all();
		return {
			total,
			byLevel: Object.fromEntries(byLevel.map(r => [r.level, r.count])),
			byMode: Object.fromEntries(byMode.map(r => [r.mode, r.count])),
		};
	}

	// --- Health Events ---
	static addHealthEvent(source, type, message, severity = 'info') {
		try {
			db.prepare("INSERT INTO health_events (source, type, message, severity) VALUES (?, ?, ?, ?)")
				.run(source, type, message, severity);
		} catch (_e) {
			logger.warn(`addHealthEvent failed: ${_e.message}`);
		}
	}

	static getHealthEvents(limit = 50) {
		return db.prepare("SELECT * FROM health_events ORDER BY timestamp DESC LIMIT ?").all(limit);
	}

	static clearHealthEvents(olderThanDays = 3) {
		const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
		return db.prepare("DELETE FROM health_events WHERE timestamp < ?").run(cutoff);
	}

	// --- Action Budget ---
	static getActionCount(accountId, actionType) {
		const today = new Date().toISOString().split('T')[0];
		const row = db.prepare("SELECT count FROM action_budget WHERE account_id = ? AND action_type = ? AND date = ?")
			.get(accountId, actionType, today);
		return row ? row.count : 0;
	}

	static incrementAction(accountId, actionType) {
		const today = new Date().toISOString().split('T')[0];
		db.prepare(`
			INSERT INTO action_budget (account_id, action_type, date, count) VALUES (?, ?, ?, 1)
			ON CONFLICT(account_id, action_type, date) DO UPDATE SET count = count + 1
		`).run(accountId, actionType, today);
	}

	static getActionBudgetSummary() {
		const today = new Date().toISOString().split('T')[0];
		return db.prepare("SELECT * FROM action_budget WHERE date = ?").all(today);
	}

	// --- Agent Interactions (shared) ---
	static isPostProcessed(key) {
		return !!db.prepare("SELECT 1 FROM agent_interactions WHERE post_key = ?").get(key);
	}

	static isReplyProcessed(key) {
		return !!db.prepare("SELECT 1 FROM agent_replies WHERE reply_key = ?").get(key);
	}

	static getUserMemory(username) {
		const row = db.prepare("SELECT notes FROM user_memories WHERE username = ?").get(username);
		return row ? row.notes : null;
	}

	static saveOrUpdateMemory(username, newNotes) {
		if (!newNotes || newNotes.trim().length === 0) return;
		const existing = db.prepare("SELECT interaction_count FROM user_memories WHERE username = ?").get(username);
		if (existing) {
			db.prepare("UPDATE user_memories SET notes = ?, interaction_count = interaction_count + 1, last_interaction = CURRENT_TIMESTAMP WHERE username = ?")
				.run(newNotes, username);
		} else {
			db.prepare("INSERT INTO user_memories (username, notes, interaction_count) VALUES (?, ?, 1)")
				.run(username, newNotes);
		}
	}

	static savePostInteraction(key, author, postText, shouldLike, shouldComment, commentText, reason) {
		db.prepare(`INSERT OR REPLACE INTO agent_interactions (post_key, author, post_text, should_like, should_comment, comment_text, reason)
			VALUES (?, ?, ?, ?, ?, ?, ?)`)
			.run(key, author, postText, shouldLike ? 1 : 0, shouldComment ? 1 : 0, commentText || "", reason || "");
	}

	static saveCommentReply(key, postKey, author, commentText, shouldReply, replyText, reason) {
		db.prepare(`INSERT OR REPLACE INTO agent_replies (reply_key, post_key, comment_author, comment_text, should_reply, reply_text, reason)
			VALUES (?, ?, ?, ?, ?, ?, ?)`)
			.run(key, postKey, author, commentText, shouldReply ? 1 : 0, replyText || "", reason || "");
	}

	static getAgentStats() {
		const totalPosts = db.prepare("SELECT COUNT(*) as c FROM agent_interactions").get().c;
		const likesGiven = db.prepare("SELECT COUNT(*) as c FROM agent_interactions WHERE should_like = 1").get().c;
		const commentsMade = db.prepare("SELECT COUNT(*) as c FROM agent_interactions WHERE should_comment = 1").get().c;
		const repliesSent = db.prepare("SELECT COUNT(*) as c FROM agent_replies WHERE should_reply = 1").get().c;
		const uniqueUsers = db.prepare("SELECT COUNT(*) as c FROM user_memories").get().c;
		return { totalPosts, likesGiven, commentsMade, repliesSent, uniqueUsers };
	}

	static getAgentInteractions({ limit = 50, author } = {}) {
		let query = "SELECT * FROM agent_interactions";
		const params = [];
		if (author) {
			query += " WHERE author LIKE ?";
			params.push(`%${author}%`);
		}
		query += " ORDER BY timestamp DESC LIMIT ?";
		params.push(limit);
		return db.prepare(query).all(...params);
	}

	static getUserMemories({ search, limit = 100 } = {}) {
		let query = "SELECT * FROM user_memories";
		const params = [];
		if (search) {
			query += " WHERE username LIKE ? OR notes LIKE ?";
			params.push(`%${search}%`, `%${search}%`);
		}
		query += " ORDER BY last_interaction DESC LIMIT ?";
		params.push(limit);
		return db.prepare(query).all(...params);
	}

	// --- Groups (Relational Junction Tables) ---
	static getGroups() {
		const groups = db.prepare("SELECT id, name FROM app_groups ORDER BY id ASC").all();
		const accStmt = db.prepare("SELECT account_id FROM app_group_accounts WHERE group_id = ?");
		const listStmt = db.prepare("SELECT listing_id FROM app_group_listings WHERE group_id = ?");

		return groups.map((g) => {
			const accounts = accStmt.all(g.id).map((r) => r.account_id);
			const listings = listStmt.all(g.id).map((r) => r.listing_id);
			return {
				id: g.id,
				name: g.name,
				accounts,
				listings,
			};
		});
	}

	static addGroup(name, accounts = [], listings = []) {
		const insertGroup = db.prepare("INSERT INTO app_groups (name) VALUES (?)");
		const insertAcc = db.prepare("INSERT OR IGNORE INTO app_group_accounts (group_id, account_id) VALUES (?, ?)");
		const insertList = db.prepare("INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)");

		let groupId;
		db.transaction(() => {
			const res = insertGroup.run(name);
			groupId = res.lastInsertRowid;

			if (Array.isArray(accounts)) {
				for (const aid of accounts) {
					if (aid) insertAcc.run(groupId, aid);
				}
			}

			if (Array.isArray(listings)) {
				for (const lid of listings) {
					if (lid) insertList.run(groupId, Number(lid));
				}
			}
		})();

		return groupId;
	}

	static updateGroup(id, name, accounts = [], listings = []) {
		const updateGroup = db.prepare("UPDATE app_groups SET name = ? WHERE id = ?");
		const delAccs = db.prepare("DELETE FROM app_group_accounts WHERE group_id = ?");
		const delLists = db.prepare("DELETE FROM app_group_listings WHERE group_id = ?");
		const insertAcc = db.prepare("INSERT OR IGNORE INTO app_group_accounts (group_id, account_id) VALUES (?, ?)");
		const insertList = db.prepare("INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)");

		db.transaction(() => {
			updateGroup.run(name, id);
			delAccs.run(id);
			delLists.run(id);

			if (Array.isArray(accounts)) {
				for (const aid of accounts) {
					if (aid) insertAcc.run(id, aid);
				}
			}

			if (Array.isArray(listings)) {
				for (const lid of listings) {
					if (lid) insertList.run(id, Number(lid));
				}
			}
		})();
	}

	static addGroupListing(groupId, listingId) {
		db.prepare("INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)").run(
			Number(groupId),
			Number(listingId)
		);
		return true;
	}

	static removeGroupListing(groupId, listingId) {
		db.prepare("DELETE FROM app_group_listings WHERE group_id = ? AND listing_id = ?").run(
			Number(groupId),
			Number(listingId)
		);
		return true;
	}

	static deleteGroup(id) {
		// Foreign key CASCADE will automatically delete rows in app_group_accounts and app_group_listings
		db.prepare("DELETE FROM app_groups WHERE id = ?").run(id);
	}

	static toggleGroupState(id, isActive) {
		const accountRows = db.prepare("SELECT account_id FROM app_group_accounts WHERE group_id = ?").all(id);
		const listingRows = db.prepare("SELECT listing_id FROM app_group_listings WHERE group_id = ?").all(id);

		const accountIds = accountRows.map((r) => r.account_id);
		const listingIds = listingRows.map((r) => r.listing_id);

		const status = isActive ? 1 : 0;
		db.transaction(() => {
			if (accountIds.length > 0) {
				const placeholders = accountIds.map(() => "?").join(",");
				db.prepare(`UPDATE accounts SET isActive=? WHERE id IN (${placeholders})`).run(status, ...accountIds);
			}
			if (listingIds.length > 0) {
				const placeholders = listingIds.map(() => "?").join(",");
				db.prepare(`UPDATE listings SET isActive=? WHERE id IN (${placeholders})`).run(status, ...listingIds);
			}
		})();
	}

	static activateGroupExclusive(id) {
		const accountRows = db.prepare("SELECT account_id FROM app_group_accounts WHERE group_id = ?").all(id);
		const listingRows = db.prepare("SELECT listing_id FROM app_group_listings WHERE group_id = ?").all(id);

		const accountIds = accountRows.map((r) => r.account_id);
		const listingIds = listingRows.map((r) => r.listing_id);

		db.transaction(() => {
			// Deactivate all first
			db.prepare("UPDATE accounts SET isActive=0").run();
			db.prepare("UPDATE listings SET isActive=0").run();

			// Activate only group members
			if (accountIds.length > 0) {
				const placeholders = accountIds.map(() => "?").join(",");
				db.prepare(`UPDATE accounts SET isActive=1 WHERE id IN (${placeholders})`).run(...accountIds);
			}
			if (listingIds.length > 0) {
				const placeholders = listingIds.map(() => "?").join(",");
				db.prepare(`UPDATE listings SET isActive=1 WHERE id IN (${placeholders})`).run(...listingIds);
			}
		})();
	}


	// --- Automation Schedules ---
	static getSchedules() {
		const rows = db.prepare("SELECT * FROM automation_schedules ORDER BY created_at DESC").all();
		return rows.map(r => ({ ...r, enabled: !!r.enabled }));
	}

	static addSchedule(name, cronExpr, mode, accountId) {
		const result = db.prepare("INSERT INTO automation_schedules (name, cron_expr, mode, account_id) VALUES (?, ?, ?, ?)")
			.run(name, cronExpr, mode || 'all', accountId || null);
		return result.lastInsertRowid;
	}

	static updateSchedule(id, updates) {
		const fields = [];
		const values = [];
		for (const [k, v] of Object.entries(updates)) {
			if (['name', 'cron_expr', 'mode', 'account_id', 'enabled'].includes(k)) {
				fields.push(`${k} = ?`);
				values.push(k === 'enabled' ? (v ? 1 : 0) : v);
			}
		}
		if (fields.length === 0) return;
		values.push(id);
		db.prepare(`UPDATE automation_schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
	}

	static deleteSchedule(id) {
		return db.prepare("DELETE FROM automation_schedules WHERE id = ?").run(id);
	}

	static markScheduleRun(id) {
		db.prepare("UPDATE automation_schedules SET last_run = CURRENT_TIMESTAMP WHERE id = ?").run(id);
	}

	// --- Marketplace Renew History ---
	static getRecentMarketplaceRenewals(accountId, withinDays = 7) {
		const safeDays = Math.max(1, Math.min(90, Number(withinDays) || 7));
		return db.prepare(`
			SELECT account_id, listing_key, title, renewed_at
			FROM marketplace_renewals
			WHERE account_id = ?
			  AND renewed_at >= datetime('now', ?)
			ORDER BY renewed_at DESC
		`).all(String(accountId), `-${safeDays} days`);
	}

	static markMarketplaceRenewed(accountId, listingKey, title) {
		if (!accountId || !listingKey || !title) {
			throw new Error("accountId, listingKey, dan title wajib untuk riwayat sundul");
		}
		return db.prepare(`
			INSERT INTO marketplace_renewals (account_id, listing_key, title, renewed_at)
			VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(account_id, listing_key) DO UPDATE SET
				title = excluded.title,
				renewed_at = CURRENT_TIMESTAMP
		`).run(String(accountId), String(listingKey), String(title).substring(0, 200));
	}

	// --- Notifications ---
	static addNotification(type, title, message, data = {}) {
		// Support both signatures:
		//   addNotification({ type, title, message, data })  // object form (preferred)
		//   addNotification(type, title, message, data)      // positional form (legacy)
		if (typeof type === 'object' && type !== null) {
			const obj = type;
			title = obj.title;
			message = obj.message;
			data = obj.data || {};
			type = obj.type;
		}
		try {
			const result = db.prepare("INSERT INTO notifications (type, title, message, data) VALUES (?, ?, ?, ?)")
				.run(type || 'info', title, message, JSON.stringify(data ?? {}));
			return { id: result.lastInsertRowid };
		} catch (_e) {
			logger.warn(`addNotification failed: ${_e.message}`);
			return null;
		}
	}

	static getNotifications({ unreadOnly = false, limit = 50 } = {}) {
		let query = "SELECT * FROM notifications";
		const params = [];
		if (unreadOnly) {
			query += " WHERE read = 0";
		}
		query += " ORDER BY timestamp DESC LIMIT ?";
		params.push(limit);
		return db.prepare(query).all(...params).map(r => ({ ...r, data: JSON.parse(r.data || '{}') }));
	}

	static markNotificationRead(id) {
		return db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
	}

	static markAllNotificationsRead() {
		return db.prepare("UPDATE notifications SET read = 1").run();
	}

	static getUnreadNotificationCount() {
		return db.prepare("SELECT COUNT(*) as count FROM notifications WHERE read = 0").get().count;
	}

	// --- Daily Reports ---
	static upsertDailyReport(reportDate, data) {
		db.prepare(`INSERT INTO daily_reports (report_date, posts_created, shares_made, comments_made, likes_given, chats_replied, errors_count, summary)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
			data.summary || null
		);
	}

	static getDailyReports(limit = 30) {
		return db.prepare("SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT ?").all(limit);
	}

	// --- Analytics helpers ---
	static getLogActivityByDay(days = 7) {
		const cutoffDate = new Date(Date.now() - days * 86400000);
		// Format to YYYY-MM-DD HH:MM:SS for SQLite query matching CURRENT_TIMESTAMP
		const cutoff = cutoffDate.toISOString().replace('T', ' ').split('.')[0];
		
		const rows = db.prepare(`
			SELECT timestamp, level, message FROM bot_logs
			WHERE timestamp >= ?
			ORDER BY timestamp ASC
		`).all(cutoff);

		const dayMap = {};

		// Initialize all days in range to 0 to prevent gaps in charts
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
			dayMap[d] = { date: d, posts: 0, likes: 0, comments: 0, shares: 0, chats: 0, errors: 0 };
		}

		for (const row of rows) {
			const date = (row.timestamp || '').split(' ')[0] || (row.timestamp || '').split('T')[0];
			if (!date) continue;

			if (!dayMap[date]) {
				dayMap[date] = { date, posts: 0, likes: 0, comments: 0, shares: 0, chats: 0, errors: 0 };
			}

			const msg = (row.message || '').toLowerCase();
			if (row.level === 'error' || row.level === 'ERROR' || msg.includes('gagal') || msg.includes('error')) {
				dayMap[date].errors++;
			} else {
				if (msg.includes('posting') || msg.includes('post') || msg.includes('sundul') || msg.includes('renew')) {
					dayMap[date].posts++;
				}
				if (msg.includes('like') || msg.includes('suka')) {
					dayMap[date].likes++;
				}
				if (msg.includes('comment') || msg.includes('komentar') || msg.includes('komen')) {
					dayMap[date].comments++;
				}
				if (msg.includes('share') || msg.includes('bagikan')) {
					dayMap[date].shares++;
				}
				if (msg.includes('chat') || msg.includes('reply') || msg.includes('balas')) {
					dayMap[date].chats++;
				}
			}
		}

		return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
	}

	static getListingSuccessStats() {
		return db.prepare(`
			SELECT status, COUNT(*) as count FROM listings GROUP BY status
		`).all();
	}

	static cloneListingsToAppliance({ ids = [], targetGroupId = null, prefix = "[READY BERAU] ", stripBrands = true } = {}) {
		const brandRegex = /^(yamaha|honda|suzuki|kawasaki|vespa|piaggio|toyota|daihatsu|mitsubishi|nissan|isuzu|mazda|hyundai|wuling)\s+/i;
		
		let sourceListings = [];
		if (Array.isArray(ids) && ids.length > 0) {
			const placeholders = ids.map(() => "?").join(",");
			sourceListings = db.prepare(`SELECT * FROM listings WHERE id IN (${placeholders})`).all(...ids);
		} else if (targetGroupId) {
			sourceListings = db.prepare(`
				SELECT l.* FROM listings l
				JOIN app_group_listings agl ON agl.listing_id = l.id
				WHERE agl.group_id = ?
			`).all(targetGroupId);
		} else {
			sourceListings = db.prepare("SELECT * FROM listings WHERE category = 'Kendaraan'").all();
		}

		if (sourceListings.length === 0) {
			sourceListings = db.prepare("SELECT * FROM listings").all();
		}

		const insertListing = db.prepare(`
			INSERT INTO listings (
				title, price, description, category, condition, availability, 
				location, tags, sku, targetGroup, maxGroups, isActive, 
				photoDir, photos, attributes, status, last_posted, autoFeed, 
				existingPostUrl, postMarketplace, commentTargetUrl, photoUsage
			) VALUES (
				?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			)
		`);

		const insertGroupListing = targetGroupId 
			? db.prepare("INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)")
			: null;

		const clonedIds = [];

		const transaction = db.transaction(() => {
			for (const item of sourceListings) {
				let originalAttrs = {};
				try {
					if (item.attributes) originalAttrs = JSON.parse(item.attributes);
				} catch (_) {}

				let cleanTitle = item.title || "";
				if (stripBrands) {
					cleanTitle = cleanTitle.replace(brandRegex, "").trim();
					cleanTitle = cleanTitle.replace(/^(YAMAHA|HONDA|SUZUKI|KAWASAKI)\s+/i, "").trim();
				}

				const pfx = prefix ? prefix.trim() + " " : "";
				const finalTitle = cleanTitle.startsWith(pfx.trim()) ? cleanTitle : `${pfx}${cleanTitle}`.trim();

				let newDesc = item.description || "";
				const specs = Object.entries(originalAttrs)
					.filter(([k, v]) => v && typeof v === "string")
					.map(([k, v]) => `${k}: ${v}`)
					.join("\n");

				if (specs && !newDesc.includes("Spesifikasi:")) {
					newDesc += "\n\nSpesifikasi:\n" + specs;
				}

				let labelProd = originalAttrs["Model"] || originalAttrs["Merek"] || cleanTitle;
				if (stripBrands && typeof labelProd === "string") {
					labelProd = labelProd.replace(brandRegex, "").trim();
				}

				const newAttrs = {
					Warna: originalAttrs["Warna eksterior"] || originalAttrs["Warna"] || "Hitam",
					"Label produk": labelProd || "Peralatan"
				};

				const res = insertListing.run(
					finalTitle,
					item.price || 0,
					newDesc,
					"Peralatan rumah tangga",
					item.condition || "Bekas - Seperti Baru",
					item.availability || "in_stock",
					"", // location kosong / skip
					item.tags || "",
					item.sku || "",
					item.targetGroup || "berau",
					item.maxGroups || 20,
					1,
					item.photoDir || "",
					item.photos || "[]",
					JSON.stringify(newAttrs),
					"pending",
					null,
					item.autoFeed !== undefined ? item.autoFeed : 1,
					"",
					item.postMarketplace !== undefined ? item.postMarketplace : 1,
					item.commentTargetUrl || "",
					item.photoUsage || "{}"
				);

				const newId = res.lastInsertRowid;
				clonedIds.push(newId);

				if (insertGroupListing && targetGroupId) {
					insertGroupListing.run(targetGroupId, newId);
				}
			}
		});

		transaction();
		return { count: clonedIds.length, ids: clonedIds };
	}
}

// Auto-prune logs older than 7 days on startup
try {
	const pruned = db.prepare("DELETE FROM bot_logs WHERE timestamp < ?").run(
		new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
	);
	if (pruned.changes > 0) {
		logger.info(`Pruned ${pruned.changes} old log entries (>7 days)`);
	}
} catch (_e) {
	logger.warn(`Auto-prune failed: ${_e.message}`);
}

module.exports = DataService;
