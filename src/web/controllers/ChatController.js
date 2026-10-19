const path = require("node:path");
const DataService = require("../services/dataService");
const FacebookBot = require("../../core/bot");
const { THREAD_ROW_JS, BUBBLES_JS, openThreadByBuyer, sendTextToThread } = require("../../services/chatThread");

function accountProfileDir(account) {
	return path.isAbsolute(account.profile) ? account.profile : path.join(process.cwd(), account.profile);
}

const busyAccounts = new Set();

async function withAccountLock(accountId, fn) {
	const key = String(accountId);
	if (busyAccounts.has(key)) {
		const err = new Error("Akun sibuk, tunggu aksi berjalan selesai.");
		err.code = "ACCOUNT_BUSY";
		throw err;
	}
	busyAccounts.add(key);
	try {
		return await fn();
	} finally {
		busyAccounts.delete(key);
	}
}

async function openThread(bot, thread) {
	return openThreadByBuyer(bot.page, null, thread);
}

class ChatController {
	static async listThreads(req, res) {
		try {
			res.json(DataService.listThreads({ accountId: req.query.accountId || null, limit: req.query.limit ? parseInt(req.query.limit, 10) : 50 }));
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async getThreadMessages(req, res) {
		try {
			const key = Buffer.from(req.params.key, "base64url").toString("utf8");
			res.json({
				messages: DataService.getMessages(key),
				drafts: DataService.listDrafts(key),
			});
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async syncInbox(req, res) {
		const { accountId } = req.body || {};
		try {
			const accounts = await DataService.getAccounts();
			const targets = accountId ? accounts.filter((a) => String(a.id) === String(accountId)) : accounts.filter((a) => a.linked && a.isActive);
			if (targets.length === 0) return res.status(400).json({ error: "Akun tidak ditemukan / tak aktif." });
			let total = 0;
			const skipped = [];
			for (const account of targets) {
				try {
					total += await withAccountLock(account.id, async () => {
						let count = 0;
						const bot = new FacebookBot({ accountName: account.fbName || account.name, userDataDir: accountProfileDir(account) });
						try {
							await bot.init();
							await bot.page.goto("https://www.facebook.com/marketplace/inbox", { waitUntil: "domcontentloaded", timeout: 30000 });
							await new Promise((r) => setTimeout(r, 5000));
					// Tunggu + scroll ringan: daftar thread malas render
					for (let w = 0; w < 6; w++) {
						const n = await bot.page.evaluate(() => document.querySelectorAll('div[role="button"], a[role="link"]').length).catch(() => 0);
						if (n > 20) break;
						await bot.page.mouse.wheel(0, 600).catch(() => {});
						await new Promise((r) => setTimeout(r, 1500));
					}
					// Poll hingga baris thread (ada ·) muncul, max ~12 detik
					for (let w = 0; w < 8; w++) {
						const n = await bot.page.evaluate(() => {
							let c = 0;
							for (const el of document.querySelectorAll('div[role="button"], a[role="link"]')) {
								const t = (el.innerText || "").trim();
								if (t && t.length >= 10 && t.length <= 300 && /·/.test(t)) c++;
							}
							return c;
						}).catch(() => 0);
						if (n >= 3) break;
						await bot.page.mouse.wheel(0, 600).catch(() => {});
						await new Promise((r) => setTimeout(r, 1500));
					}
					let rows = await bot.page.evaluate(THREAD_ROW_JS).catch(() => []);
					if (rows.length === 0) {
						// Coba sekali lagi (profil mungkin dikunci browser lain / render telat)
						await new Promise((r) => setTimeout(r, 4000));
						rows = await bot.page.evaluate(THREAD_ROW_JS).catch(() => []);
					}
					for (const r of rows) {
						DataService.upsertThread({ accountId: account.id, buyer: r.buyer, topic: r.topic, lastMessage: r.line });
						count++;
					}
						} finally {
							await bot.close().catch(() => {});
						}
						return count;
					});
				} catch (e) {
					if (e.code === "ACCOUNT_BUSY") skipped.push(account.id);
					else throw e;
				}
			}
			res.json({ success: true, threads: total, skipped });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async sendMessage(req, res) {
		const { accountId, threadKey, text } = req.body || {};
		const clean = String(text || "").trim().slice(0, 1000);
		if (!accountId || !threadKey || !clean) return res.status(400).json({ error: "accountId + threadKey + text wajib." });
		try {
			const accounts = await DataService.getAccounts();
			const account = accounts.find((a) => String(a.id) === String(accountId));
			if (!account) return res.status(400).json({ error: "Akun tak ditemukan." });
			const thread = DataService.listThreads({ accountId: account.id, limit: 200 }).find((t) => t.key === threadKey);
			if (!thread) return res.status(400).json({ error: "Thread tak ditemukan." });
			try {
				await withAccountLock(account.id, async () => {
					const bot = new FacebookBot({ accountName: account.fbName || account.name, userDataDir: accountProfileDir(account) });
					try {
						await bot.init();
						await bot.page.goto("https://www.facebook.com/marketplace/inbox", { waitUntil: "domcontentloaded", timeout: 30000 });
						await new Promise((r) => setTimeout(r, 4000));
						if (!(await openThread(bot, thread))) throw new Error("Thread tak terbuka (kandidat tak cocok).");
						await sendTextToThread(bot.page, null, clean);
					} finally {
						await bot.close().catch(() => {});
					}
				});
			} catch (e) {
				if (e.code === "ACCOUNT_BUSY") return res.status(409).json({ error: e.message });
				throw e;
			}
			DataService.addMessage(threadKey, "human", clean);
			DataService.recordAutomationEvent({ actionType: "chat_reply", mode: "chat", accountId: account.id, result: "success", message: `Manual ke ${thread.buyer}: ${clean.slice(0, 120)}` });
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async readThread(req, res) {
		try {
			const key = Buffer.from(req.params.key, "base64url").toString("utf8");
			const all = DataService.listThreads({ limit: 500 });
			const thread = all.find((t) => t.key === key);
			if (!thread) return res.status(400).json({ error: "Thread tak ditemukan." });
			const accounts = await DataService.getAccounts();
			const account = accounts.find((a) => String(a.id) === String(thread.account_id));
			if (!account) return res.status(400).json({ error: "Akun tak ditemukan." });
			const bot = new FacebookBot({ accountName: account.fbName || account.name, userDataDir: accountProfileDir(account) });
			let count = 0;
			try {
				await withAccountLock(account.id, async () => {
					await bot.init();
					await bot.page.goto("https://www.facebook.com/marketplace/inbox", { waitUntil: "domcontentloaded", timeout: 30000 });
					await new Promise((r) => setTimeout(r, 5000));
					if (!(await openThread(bot, thread))) throw new Error("Thread tak terbuka (kandidat tak cocok).");
					const bubbles = await bot.page.evaluate(BUBBLES_JS, { buyerFirst: (thread.buyer || "").split(" ")[0].toLowerCase(), myName: (account.fbName || account.name || "").split(" ")[0].toLowerCase() });
					for (const b of bubbles) {
						const sender = b.sys ? "system" : b.out ? "bot" : "buyer";
						const have = DataService.getMessages(key, 200).some((m) => m.text === b.text && m.sender === sender);
						if (have) continue;
						DataService.addMessage(key, sender, b.text, b.sentAt || null);
						count++;
					}
				});
			} catch (e) {
				if (e.code === "ACCOUNT_BUSY") return res.status(409).json({ error: e.message });
				throw e;
			} finally {
				await bot.close().catch(() => {});
			}
			res.json({ success: true, messages: count });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async runFollowup(req, res) {
		const { accountId } = req.body || {};
		try {
			const accounts = await DataService.getAccounts();
			const targets = accountId
				? accounts.filter((a) => String(a.id) === String(accountId))
				: accounts.filter((a) => a.linked && a.isActive);
			if (targets.length === 0) return res.status(400).json({ error: "Akun tidak ditemukan / tak aktif." });
		 const all = [];
			const skippedFu = [];
			for (const account of targets) {
				const cands = DataService.getFollowupCandidates(account.id, 2, 3);
				if (cands.length === 0) continue;
				try {
					await withAccountLock(account.id, async () => {
						const bot = new FacebookBot({ accountName: account.fbName || account.name, userDataDir: accountProfileDir(account) });
						try {
							await bot.init();
							const results = await bot.followUpThreads(account, cands, { pin: account.e2ee_pin });
							for (const r of results) {
								if (r.status === "replied" && r.key) {
									try {
										DataService.bumpFollowup(r.key);
									} catch (_e) {}
									try {
										DataService.addMessage(r.key, "bot", r.reply || "");
									} catch (_e) {}
								}
								all.push({ account: account.id, ...r });
							}
						} finally {
							await bot.close().catch(() => {});
						}
					});
				} catch (e) {
					if (e.code === "ACCOUNT_BUSY") {
						skippedFu.push(account.id);
						continue;
					}
					throw e;
				}
			}
			res.json({ success: true, results: all, skipped: skippedFu });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async approveDraft(req, res) {
		try {
			const draft = DataService.listDrafts(req.body.threadKey, "pending").find((d) => String(d.id) === String(req.body.draftId));
			if (!draft) return res.status(400).json({ error: "Draf tak ditemukan." });
			DataService.setDraftStatus(draft.id, "approved");
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}
}

module.exports = ChatController;
