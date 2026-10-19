const { db } = require("./database");

function threadKey(accountId, buyer, topic) {
	return `${accountId}::${buyer}::${topic}`.slice(0, 300);
}

module.exports = {
	threadKey,

	upsertThread({ accountId, buyer, topic = "", href = "", lastMessage = "", unread = 0 }) {
		const key = threadKey(accountId, buyer, topic);
		db.prepare(`
			INSERT INTO chat_threads (key, account_id, buyer, topic, href, last_message, unread, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(key) DO UPDATE SET
				href = excluded.href,
				last_message = excluded.last_message,
				unread = excluded.unread,
				updated_at = CURRENT_TIMESTAMP
		`).run(key, accountId, buyer, topic, href, lastMessage.slice(0, 500), unread ? 1 : 0);
		return key;
	},

	listThreads({ accountId = null, limit = 50 } = {}) {
		const { clampQueryLimit } = require("../../utils/queryBounds");
		if (accountId) {
			return db.prepare("SELECT * FROM chat_threads WHERE account_id = ? ORDER BY updated_at DESC LIMIT ?").all(accountId, clampQueryLimit(limit, 1, 200));
		}
		return db.prepare("SELECT * FROM chat_threads ORDER BY updated_at DESC LIMIT ?").all(clampQueryLimit(limit, 1, 200));
	},

	addMessage(threadKeyValue, sender, text, sentAt = null) {
		if (!text || !text.trim()) return null;
		const r = db.prepare("INSERT INTO chat_messages (thread_key, sender, text, sent_at) VALUES (?, ?, ?, ?)").run(threadKeyValue, sender, text.slice(0, 2000), sentAt ? String(sentAt).slice(0, 60) : null);
		db.prepare("UPDATE chat_threads SET last_message = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?").run(text.slice(0, 500), threadKeyValue);
		return r.lastInsertRowid;
	},

	getMessages(threadKeyValue, limit = 50) {
		const { clampQueryLimit } = require("../../utils/queryBounds");
		return db.prepare("SELECT * FROM chat_messages WHERE thread_key = ? ORDER BY id DESC LIMIT ?").all(threadKeyValue, clampQueryLimit(limit, 1, 200)).reverse();
	},

	saveDraft(threadKeyValue, draft) {
		const r = db.prepare("INSERT INTO chat_drafts (thread_key, draft) VALUES (?, ?)").run(threadKeyValue, draft.slice(0, 2000));
		return r.lastInsertRowid;
	},

	listDrafts(threadKeyValue, status = "pending") {
		return db.prepare("SELECT * FROM chat_drafts WHERE thread_key = ? AND status = ? ORDER BY id DESC").all(threadKeyValue, status);
	},

	setDraftStatus(id, status) {
		db.prepare("UPDATE chat_drafts SET status = ? WHERE id = ?").run(status, id);
		return true;
	},

	getFollowupCandidates(accountId, days = 2, limit = 5) {
		const { clampQueryLimit } = require("../../utils/queryBounds");
		// Kita terakhir bicara + pembeli sunyi N hari + belum 2x follow-up
		return db.prepare(`
			SELECT t.* FROM chat_threads t
			WHERE t.account_id = ?
				AND COALESCE(t.followup_count, 0) < 2
				AND (t.followup_at IS NULL OR t.followup_at < datetime('now', ?))
				AND (SELECT m.sender FROM chat_messages m WHERE m.thread_key = t.key ORDER BY m.id DESC LIMIT 1) IN ('bot', 'human')
				AND (SELECT m.created_at FROM chat_messages m WHERE m.thread_key = t.key ORDER BY m.id DESC LIMIT 1) < datetime('now', ?)
			ORDER BY t.updated_at ASC LIMIT ?
		`).all(accountId, `-${days} days`, `-${days} days`, clampQueryLimit(limit, 1, 20));
	},

	bumpFollowup(threadKeyValue) {
		db.prepare("UPDATE chat_threads SET followup_count = COALESCE(followup_count, 0) + 1, followup_at = CURRENT_TIMESTAMP WHERE key = ?").run(threadKeyValue);
		return true;
	},
};
