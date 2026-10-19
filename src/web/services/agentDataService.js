const { db } = require("./database");
const { clampQueryLimit, limitSearchText } = require("../../utils/queryBounds");

module.exports = {
	isPostProcessed(key) {
		return !!db.prepare("SELECT 1 FROM agent_interactions WHERE post_key = ?").get(key);
	},

	isReplyProcessed(key) {
		return !!db.prepare("SELECT 1 FROM agent_replies WHERE reply_key = ?").get(key);
	},

	getUserMemory(username) {
		const row = db.prepare("SELECT notes FROM user_memories WHERE username = ?").get(username);
		return row ? row.notes : null;
	},

	saveOrUpdateMemory(username, newNotes) {
		if (!newNotes || newNotes.trim().length === 0) return;
		const existing = db.prepare("SELECT interaction_count FROM user_memories WHERE username = ?").get(username);
		if (existing) {
			db.prepare(`
				UPDATE user_memories
				SET notes = ?, interaction_count = interaction_count + 1, last_interaction = CURRENT_TIMESTAMP
				WHERE username = ?
			`).run(newNotes, username);
		} else {
			db.prepare("INSERT INTO user_memories (username, notes, interaction_count) VALUES (?, ?, 1)")
				.run(username, newNotes);
		}
	},

	savePostInteraction(key, author, postText, shouldLike, shouldComment, commentText, reason) {
		db.prepare(`
			INSERT OR REPLACE INTO agent_interactions (
				post_key, author, post_text, should_like, should_comment, comment_text, reason
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(key, author, postText, shouldLike ? 1 : 0, shouldComment ? 1 : 0, commentText || "", reason || "");
	},

	saveCommentReply(key, postKey, author, commentText, shouldReply, replyText, reason) {
		db.prepare(`
			INSERT OR REPLACE INTO agent_replies (
				reply_key, post_key, comment_author, comment_text, should_reply, reply_text, reason
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(key, postKey, author, commentText, shouldReply ? 1 : 0, replyText || "", reason || "");
	},

	getAgentStats() {
		const totalPosts = db.prepare("SELECT COUNT(*) AS count FROM agent_interactions").get().count;
		const likesGiven = db.prepare("SELECT COUNT(*) AS count FROM agent_interactions WHERE should_like = 1").get().count;
		const commentsMade = db.prepare("SELECT COUNT(*) AS count FROM agent_interactions WHERE should_comment = 1").get().count;
		const repliesSent = db.prepare("SELECT COUNT(*) AS count FROM agent_replies WHERE should_reply = 1").get().count;
		const uniqueUsers = db.prepare("SELECT COUNT(*) AS count FROM user_memories").get().count;
		return { totalPosts, likesGiven, commentsMade, repliesSent, uniqueUsers };
	},

	getAgentInteractions({ limit = 50, author } = {}) {
		let query = "SELECT * FROM agent_interactions";
		const params = [];
		const safeAuthor = limitSearchText(author, 100);
		if (safeAuthor) {
			query += " WHERE author LIKE ?";
			params.push(`%${safeAuthor}%`);
		}
		query += " ORDER BY timestamp DESC LIMIT ?";
		params.push(clampQueryLimit(limit, 50, 500));
		return db.prepare(query).all(...params);
	},

	getUserMemories({ search, limit = 100 } = {}) {
		let query = "SELECT * FROM user_memories";
		const params = [];
		const safeSearch = limitSearchText(search, 200);
		if (safeSearch) {
			query += " WHERE username LIKE ? OR notes LIKE ?";
			params.push(`%${safeSearch}%`, `%${safeSearch}%`);
		}
		query += " ORDER BY last_interaction DESC LIMIT ?";
		params.push(clampQueryLimit(limit, 100, 500));
		return db.prepare(query).all(...params);
	},
};
