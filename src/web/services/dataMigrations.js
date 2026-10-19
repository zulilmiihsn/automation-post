const Logger = require("../../utils/logger");

const logger = new Logger("DB-MIGRATIONS");

function hasColumn(db, table, column) {
	return db.pragma(`table_info(${table})`).some((field) => field.name === column);
}

function addColumn(db, table, column, definition) {
	if (!hasColumn(db, table, column)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
	}
}

function migrateLegacyGroupRelations(db) {
	const tableInfo = db.pragma("table_info(app_groups)");
	const hasAccounts = tableInfo.some((field) => field.name === "accounts");
	const hasListings = tableInfo.some((field) => field.name === "listings");
	if (!hasAccounts && !hasListings) return;

	const groups = db.prepare("SELECT * FROM app_groups").all();
	const validAccounts = new Set(db.prepare("SELECT id FROM accounts").all().map((row) => row.id));
	const validListings = new Set(db.prepare("SELECT id FROM listings").all().map((row) => row.id));
	const insertAccount = db.prepare(
		"INSERT OR IGNORE INTO app_group_accounts (group_id, account_id) VALUES (?, ?)",
	);
	const insertListing = db.prepare(
		"INSERT OR IGNORE INTO app_group_listings (group_id, listing_id) VALUES (?, ?)",
	);

	db.transaction(() => {
		for (const group of groups) {
			try {
				const ids = typeof group.accounts === "string" ? JSON.parse(group.accounts || "[]") : group.accounts;
				if (Array.isArray(ids)) {
					for (const accountId of ids) {
						if (validAccounts.has(accountId)) insertAccount.run(group.id, accountId);
					}
				}
			} catch {
				logger.warn(`Abaikan daftar akun rusak pada workspace ${group.id}`);
			}

			try {
				const ids = typeof group.listings === "string" ? JSON.parse(group.listings || "[]") : group.listings;
				if (Array.isArray(ids)) {
					for (const listingId of ids) {
						const id = Number(listingId);
						if (validListings.has(id)) insertListing.run(group.id, id);
					}
				}
			} catch {
				logger.warn(`Abaikan daftar produk rusak pada workspace ${group.id}`);
			}
		}
	})();
}

function migrateLegacyJson(db, fs, files) {
	try {
		const listingCount = db.prepare("SELECT COUNT(*) AS count FROM listings").get().count;
		if (listingCount === 0 && fs.existsSync(files.listings)) {
			const oldListings = fs.readJsonSync(files.listings);
			const insert = db.prepare(`
				INSERT INTO listings (
					title, price, description, category, condition, availability, location,
					tags, sku, targetGroup, maxGroups, isActive, photoDir, photos, attributes
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			db.transaction((rows) => {
				for (const listing of rows) {
					insert.run(
						listing.title || "",
						listing.price || "",
						listing.description || "",
						listing.category || "",
						listing.condition || "",
						listing.availability || "",
						listing.location || "",
						listing.tags || "",
						listing.sku || "",
						listing.targetGroup || "",
						listing.maxGroups || 20,
						listing.isActive !== false ? 1 : 0,
						listing.photoDir || "",
						JSON.stringify(listing.photos || []),
						JSON.stringify(listing.attributes || {}),
					);
				}
			})(oldListings);
			fs.renameSync(files.listings, `${files.listings}.bak`);
			console.log("Migration: listings.json moved to listings.json.bak");
		}
	} catch (error) {
		logger.error(`Migrasi listings.json gagal: ${error.message}`);
	}

	try {
		const accountCount = db.prepare("SELECT COUNT(*) AS count FROM accounts").get().count;
		if (accountCount === 0 && fs.existsSync(files.accounts)) {
			const oldAccounts = fs.readJsonSync(files.accounts);
			const insert = db.prepare(`
				INSERT INTO accounts (id, name, profile, fbName, fbPic, targetGroups, linked, isActive)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`);
			db.transaction((rows) => {
				for (const account of rows) {
					insert.run(
						account.id,
						account.name,
						account.profile,
						account.fbName || null,
						account.fbPic || null,
						JSON.stringify(account.targetGroups || []),
						account.linked ? 1 : 0,
						account.isActive !== undefined ? (account.isActive ? 1 : 0) : 1,
					);
				}
			})(oldAccounts);
			fs.renameSync(files.accounts, `${files.accounts}.bak`);
			console.log("Migration: accounts.json moved to accounts.json.bak");
		}
	} catch (error) {
		logger.error(`Migrasi accounts.json gagal: ${error.message}`);
	}
}

function runMigrations(db, fs, files) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);

	const hasMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
	const recordMigration = db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)");
	const apply = (version, name, migration) => {
		if (hasMigration.get(version)) return;
		const transaction = db.transaction(() => {
			migration();
			recordMigration.run(version, name);
		});
		transaction();
	};

	apply(1, "add-account-and-listing-fields", () => {
		for (const [table, column, definition] of [
			["accounts", "fbName", "TEXT"],
			["accounts", "fbPic", "TEXT"],
			["accounts", "isActive", "INTEGER DEFAULT 1"],
			["accounts", "e2ee_pin", "TEXT DEFAULT ''"],
			["listings", "status", "TEXT DEFAULT 'pending'"],
			["listings", "last_posted", "DATETIME"],
			["listings", "autoFeed", "INTEGER DEFAULT 1"],
			["listings", "existingPostUrl", "TEXT"],
			["listings", "postMarketplace", "INTEGER DEFAULT 1"],
			["listings", "photoUsage", "TEXT DEFAULT '{}'"],
			["listings", "commentTargetUrl", "TEXT DEFAULT ''"],
		]) {
			addColumn(db, table, column, definition);
		}
	});

	apply(2, "normalize-workspace-relations", () => {
		try {
			migrateLegacyGroupRelations(db);
		} catch (error) {
			logger.warn(`Migrasi relasi workspace gagal: ${error.message}`);
		}
	});

	apply(3, "import-legacy-json-data", () => migrateLegacyJson(db, fs, files));

	apply(4, "add-structured-automation-events", () => {
		db.exec(`
			CREATE TABLE IF NOT EXISTS automation_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				action_type TEXT NOT NULL,
				mode TEXT NOT NULL DEFAULT 'all',
				account_id TEXT,
				listing_id INTEGER,
				result TEXT NOT NULL CHECK (result IN ('success', 'failed')),
				message TEXT,
				metadata TEXT NOT NULL DEFAULT '{}',
				occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			);
			CREATE INDEX IF NOT EXISTS idx_automation_events_time ON automation_events(occurred_at);
			CREATE INDEX IF NOT EXISTS idx_automation_events_action_time ON automation_events(action_type, occurred_at);
			CREATE INDEX IF NOT EXISTS idx_automation_events_account_time ON automation_events(account_id, occurred_at);
		`);
	});

	apply(5, "track-automation-runs", () => {
		if (!hasColumn(db, "automation_events", "run_id")) {
			db.exec("ALTER TABLE automation_events ADD COLUMN run_id TEXT");
		}
		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_automation_events_run ON automation_events(run_id);
			CREATE TABLE IF NOT EXISTS automation_runs (
				run_id TEXT PRIMARY KEY,
				mode TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'running',
				started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				ended_at DATETIME,
				duration_ms INTEGER,
				accounts_count INTEGER NOT NULL DEFAULT 0,
				listings_count INTEGER NOT NULL DEFAULT 0,
				error_message TEXT
			);
			CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON automation_runs(started_at);
		`);
	});

	apply(6, "add-schedule-last-status", () => {
		addColumn(db, "automation_schedules", "last_status", "TEXT");
	});
}

module.exports = { runMigrations };
