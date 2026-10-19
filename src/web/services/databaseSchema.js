function ensureSchema(db) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS accounts (
			id TEXT PRIMARY KEY, name TEXT NOT NULL, profile TEXT NOT NULL,
			fbName TEXT, fbPic TEXT, targetGroups TEXT DEFAULT '[]',
			linked INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1, e2ee_pin TEXT DEFAULT ''
		);
		CREATE TABLE IF NOT EXISTS listings (
			id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, price INTEGER DEFAULT 0,
			description TEXT, category TEXT, condition TEXT, availability TEXT, location TEXT,
			tags TEXT, sku TEXT, targetGroup TEXT DEFAULT 'berau', maxGroups INTEGER DEFAULT 20,
			status TEXT DEFAULT 'pending', last_posted DATETIME, isActive INTEGER DEFAULT 1,
			photoDir TEXT, photos TEXT DEFAULT '[]', attributes TEXT DEFAULT '{}',
			createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, autoFeed INTEGER DEFAULT 1,
			postMarketplace INTEGER DEFAULT 1, existingPostUrl TEXT, photoUsage TEXT DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(isActive);
		CREATE INDEX IF NOT EXISTS idx_accounts_linked ON accounts(linked);
		CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
		CREATE TABLE IF NOT EXISTS bot_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT DEFAULT 'all', level TEXT DEFAULT 'info',
			context TEXT DEFAULT 'SYSTEM', message TEXT NOT NULL,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_bot_logs_timestamp ON bot_logs(timestamp);
		CREATE INDEX IF NOT EXISTS idx_bot_logs_mode ON bot_logs(mode);
		CREATE INDEX IF NOT EXISTS idx_bot_logs_level ON bot_logs(level);
		CREATE TABLE IF NOT EXISTS health_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, type TEXT NOT NULL,
			message TEXT, severity TEXT DEFAULT 'info', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_events(timestamp);
		CREATE TABLE IF NOT EXISTS action_budget (
			account_id TEXT NOT NULL, action_type TEXT NOT NULL, date TEXT NOT NULL,
			count INTEGER DEFAULT 0, PRIMARY KEY (account_id, action_type, date)
		);
		CREATE TABLE IF NOT EXISTS agent_interactions (
			post_key TEXT PRIMARY KEY, author TEXT, post_text TEXT, should_like INTEGER,
			should_comment INTEGER, comment_text TEXT, reason TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS agent_replies (
			reply_key TEXT PRIMARY KEY, post_key TEXT, comment_author TEXT, comment_text TEXT,
			should_reply INTEGER, reply_text TEXT, reason TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS user_memories (
			username TEXT PRIMARY KEY, notes TEXT, interaction_count INTEGER DEFAULT 1,
			last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS automation_schedules (
			id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, cron_expr TEXT NOT NULL,
			mode TEXT DEFAULT 'all', account_id TEXT, enabled INTEGER DEFAULT 1,
			last_run DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS app_groups (
			id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS app_group_accounts (
			group_id INTEGER NOT NULL, account_id TEXT NOT NULL,
			PRIMARY KEY (group_id, account_id),
			FOREIGN KEY (group_id) REFERENCES app_groups(id) ON DELETE CASCADE,
			FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS idx_group_acc_group ON app_group_accounts(group_id);
		CREATE INDEX IF NOT EXISTS idx_group_acc_acc ON app_group_accounts(account_id);
		CREATE TABLE IF NOT EXISTS app_group_listings (
			group_id INTEGER NOT NULL, listing_id INTEGER NOT NULL,
			PRIMARY KEY (group_id, listing_id),
			FOREIGN KEY (group_id) REFERENCES app_groups(id) ON DELETE CASCADE,
			FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS idx_group_list_group ON app_group_listings(group_id);
		CREATE INDEX IF NOT EXISTS idx_group_list_list ON app_group_listings(listing_id);
		CREATE TABLE IF NOT EXISTS marketplace_renewals (
			account_id TEXT NOT NULL, listing_key TEXT NOT NULL, title TEXT NOT NULL,
			renewed_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (account_id, listing_key)
		);
		CREATE INDEX IF NOT EXISTS idx_marketplace_renewals_time ON marketplace_renewals(account_id, renewed_at);
		CREATE TABLE IF NOT EXISTS notifications (
			id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, title TEXT NOT NULL,
			message TEXT, read INTEGER DEFAULT 0, data TEXT DEFAULT '{}',
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
		CREATE TABLE IF NOT EXISTS daily_reports (
			id INTEGER PRIMARY KEY AUTOINCREMENT, report_date TEXT NOT NULL UNIQUE,
			posts_created INTEGER DEFAULT 0, shares_made INTEGER DEFAULT 0,
			comments_made INTEGER DEFAULT 0, likes_given INTEGER DEFAULT 0,
			chats_replied INTEGER DEFAULT 0, errors_count INTEGER DEFAULT 0,
			summary TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS deleted_listings (
			trash_id INTEGER PRIMARY KEY AUTOINCREMENT, original_id INTEGER,
			data TEXT NOT NULL, deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_deleted_at ON deleted_listings(deleted_at);
		CREATE TABLE IF NOT EXISTS automation_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT, action_type TEXT NOT NULL,
			run_id TEXT, mode TEXT NOT NULL DEFAULT 'all', account_id TEXT, listing_id INTEGER,
			result TEXT NOT NULL CHECK (result IN ('success', 'failed')),
			message TEXT, metadata TEXT NOT NULL DEFAULT '{}',
			occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_automation_events_time ON automation_events(occurred_at);
		CREATE INDEX IF NOT EXISTS idx_automation_events_action_time ON automation_events(action_type, occurred_at);
		CREATE INDEX IF NOT EXISTS idx_automation_events_account_time ON automation_events(account_id, occurred_at);
		CREATE TABLE IF NOT EXISTS chat_threads (
			key TEXT PRIMARY KEY, account_id TEXT NOT NULL, buyer TEXT NOT NULL,
			topic TEXT DEFAULT '', href TEXT DEFAULT '', last_message TEXT DEFAULT '',
			unread INTEGER DEFAULT 0, status TEXT DEFAULT 'open',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_chat_threads_account ON chat_threads(account_id, updated_at);
		CREATE TABLE IF NOT EXISTS chat_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT, thread_key TEXT NOT NULL,
			sender TEXT NOT NULL, text TEXT NOT NULL, sent_at TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_key, id);
		CREATE TABLE IF NOT EXISTS chat_drafts (
			id INTEGER PRIMARY KEY AUTOINCREMENT, thread_key TEXT NOT NULL,
			draft TEXT NOT NULL, status TEXT DEFAULT 'pending',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_chat_drafts_thread ON chat_drafts(thread_key, status);
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
	try {
		const cols = db.prepare("PRAGMA table_info(chat_messages)").all().map((c) => c.name);
		if (!cols.includes("sent_at")) db.exec("ALTER TABLE chat_messages ADD COLUMN sent_at TEXT");
		const tcols = db.prepare("PRAGMA table_info(chat_threads)").all().map((c) => c.name);
		if (!tcols.includes("followup_count")) db.exec("ALTER TABLE chat_threads ADD COLUMN followup_count INTEGER DEFAULT 0");
		if (!tcols.includes("followup_at")) db.exec("ALTER TABLE chat_threads ADD COLUMN followup_at TEXT");
	} catch (_e) {}
}

module.exports = { ensureSchema };
