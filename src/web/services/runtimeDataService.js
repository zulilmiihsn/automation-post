const { db } = require("./database");

module.exports = {
	getAppConfig() {
		const rows = db.prepare("SELECT key, value FROM config").all();
		return Object.fromEntries(rows.map((row) => [row.key, row.value]));
	},

	setAppConfig(key, value) {
		db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run(key, String(value ?? ""));
		return true;
	},

	setQueueState(mode, state) {
		try {
			db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)")
				.run(`queue_${mode}`, JSON.stringify(state || { running: false }));
		} catch {
			// Queue persistence is best-effort; runtime queue remains authoritative.
		}
		return true;
	},

	getQueueStates() {
		const states = {};
		try {
			const rows = db.prepare("SELECT key, value FROM config WHERE key LIKE 'queue_%'").all();
			for (const row of rows) {
				const mode = row.key.replace(/^queue_/, "");
				try {
					states[mode] = JSON.parse(row.value);
				} catch {
					states[mode] = { running: false };
				}
			}
		} catch {
			// Ignore missing/corrupt persisted queue state.
		}
		return states;
	},

	clearStaleQueues() {
		const cleared = [];
		try {
			for (const [mode, state] of Object.entries(this.getQueueStates())) {
				if (!state?.running) continue;
				this.setQueueState(mode, {
					running: false,
					pid: state.pid || null,
					endedAt: new Date().toISOString(),
					note: "stale-restart",
				});
				cleared.push(mode);
			}
		} catch {
			// Startup continues even if stale-queue reconciliation fails.
		}
		return cleared;
	},
};
