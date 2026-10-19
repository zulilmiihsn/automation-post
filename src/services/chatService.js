const Logger = require("../utils/logger");
const InteractionEngine = require("../core/interactionEngine");
const AIChatService = require("./aiChatService");
const { BUBBLES_JS } = require("./chatThread");

class ChatService {
	constructor(page, accountName = "CHAT") {
		this.page = page;
		this.accountName = accountName;
		this.engine = new InteractionEngine(page, accountName);
		this.logger = new Logger(accountName);
	}

	/**
	 * Automate replying to up to 15 last chat messages in the Marketplace inbox.
	 * @param {object} options - Options including customized reply templates
	 */
	async replyToInbox(options = {}) {
		const replyText = options.replyText || "Masih ada, bosku. Surat lengkap, mesin dan kelistrikan normal; boleh cek/tes langsung. Mau atur waktu?";
		const useAI = options.useAI !== false; // Default enabled
		this.logger.info(`Membuka Inbox Marketplace... (AI mode: ${useAI})`);

		try {
			const currentUrl = this.page.url();
			if (!currentUrl.includes("/marketplace/inbox")) {
				await this.engine.navigateAndStabilize("https://www.facebook.com/marketplace/inbox");
			} else {
				this.logger.info("Sudah di halaman Inbox. Merefresh halaman...");
				await this.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
				await this.engine.delay(2000, 3000);
			}
			
			const finalUrl = this.page.url();
			this.logger.info(`URL halaman saat ini: ${finalUrl}`);
			if (finalUrl.includes("login.php") || finalUrl.includes("/login")) {
				this.logger.error("Akun belum login atau sesi habis (dialihkan ke halaman login)!");
				return { success: false, error: "Session expired / Not logged in" };
			}
			
			// Wait for inbox threads to load (semantic dulu dari rekaman: role link "Obrolan grup: ...")
			const threadSelector = [
				'a[aria-label*="Obrolan grup" i]',
				'a[aria-label*="Obrolan" i]',
				'a[href*="/marketplace/inbox/thread/"]',
				'a[href*="/messages/t/"]',
				'div[role="gridcell"] a[role="link"]',
			].join(", ");
			await this.page.waitForSelector(threadSelector, { timeout: 2000 }).catch(() => {});
			
			// Wait stable
			await this.engine.delay(2000, 3000);

			let processedCount = 0;
			const maxChats = 15;
			const threadResults = [];

			// Scroll sidebar to load more chats (lazy loading bypass)
			this.logger.info("Memuat & menscroll daftar chat...");
			for (let s = 0; s < 3; s++) {
				const threads = this.page.locator(threadSelector);
				const count = await threads.count();
				if (count >= maxChats) break;
				
				const lastThread = threads.last();
				if (await lastThread.count() > 0) {
					await lastThread.evaluate(el => el.scrollIntoView({ block: "center" })).catch(() => {});
					await this.engine.delay(1000, 1500);
				} else {
					break;
				}
			}

			for (let i = 0; i < maxChats; i++) {
				// Re-locate threads each loop iteration to prevent stale element references
				const threads = this.page.locator(threadSelector);
				const count = await threads.count();
				
				if (i === 0) {
					this.logger.info(`Ditemukan total ${count} elemen thread di DOM.`);
				}
				
				if (i >= count) {
					this.logger.info(`Tidak ada chat lagi untuk diproses. Total diproses: ${processedCount}`);
					break;
				}

				const thread = threads.nth(i);
				const threadText = await thread.innerText().catch(() => "");
				const firstLine = threadText.split("\n")[0] || `Chat #${i + 1}`;
				
				// Lewati jika tombol utility atau link "Lihat semua"
				if (
					firstLine.toLowerCase().includes("lihat semua") || 
					firstLine.toLowerCase().includes("see all") ||
					threadText.toLowerCase().includes("lihat semua")
				) {
					this.logger.info(`Lewati link utilitas: "${firstLine.trim()}"`);
					continue;
				}

				this.logger.info(`[${i + 1}/${maxChats}] Memeriksa chat dari: "${firstLine.trim()}"`);

				const lowerText = threadText.toLowerCase();
				const isAlreadyReplied = lowerText.includes("anda:") || lowerText.includes("you:");
				const keywords = ["masih ada", "ready", "masih?", "ada?", "apakah ini masih ada", "barang ini masih ada"];
				const matchesKeyword = keywords.some(kw => lowerText.includes(kw));

				if (isAlreadyReplied) {
					this.logger.info(`Lewati chat "${firstLine.trim()}": Sudah dibalas oleh kita.`);
					threadResults.push({ buyer: firstLine.trim(), status: "skipped", reason: "sudah-dibalas" });
					continue;
				}

				if (!matchesKeyword) {
					this.logger.info(`Lewati chat "${firstLine.trim()}": Tidak cocok kata kunci.`);
					threadResults.push({ buyer: firstLine.trim(), status: "skipped", reason: "tak-cocok-keyword" });
					continue;
				}

				try {
					this.logger.success(`Menemukan chat cocok di daftar inbox: "${threadText.trim()}"`);
					
					// Use direct JS click which is highly reliable and bypasses strict viewport visibility checks
					await thread.evaluate(el => el.click());
					await this.engine.delay(2000, 3000); // Wait for chat pane to hydrate

					// Unlock E2EE if pin is supplied
					if (options.pin) {
						await this.handleE2eeUnlock(options.pin);
					}

					// Muat riwayat penuh: scroll pane ke atas hingga mentok (max 8x) agar AI punya konteks
					await this._loadFullHistory();

					// Determine if the last message requires a reply from DOM history (for non-E2EE)
					const rawBubbles = await this.page.evaluate(BUBBLES_JS, {
						buyerFirst: (firstLine.trim().split(" ")[0] || "").toLowerCase(),
						myName: (this.accountName || "").split(" ")[0].toLowerCase(),
					}).catch(() => []);
					const messages = (rawBubbles || [])
						.filter((m) => !m.sys)
						.map((m) => ({ text: m.text, isOutgoing: m.out }));
					let decision;
					if (messages.length === 0) {
						decision = { shouldReply: true, isE2eeFallback: true, reason: "Pesan terenkripsi E2EE / tidak terbaca di DOM, gunakan data sidebar.", messages: [] };
					} else {
						const lastMsg = messages[messages.length - 1];
						if (lastMsg.isOutgoing) {
							decision = { shouldReply: false, reason: "Pesan terakhir dikirim oleh kita (sudah dibalas).", messages };
						} else {
							const lastText = lastMsg.text.toLowerCase();
							const kws = ["masih ada", "ready", "masih?", "ada?", "apakah ini masih ada", "barang ini masih ada"];
							const matches = kws.some((kw) => lastText.includes(kw));
							decision = matches
								? { shouldReply: true, clientMessage: lastMsg.text, messages }
								: { shouldReply: false, reason: `Pesan terakhir tidak cocok kata kunci: "${lastMsg.text}"`, messages };
						}
					}

					if (decision.messages && decision.messages.length > 0) {
						const lastFew = decision.messages.slice(-3);
						this.logger.info(`Riwayat chat terakhir: ${lastFew.map(m => `[${m.isOutgoing ? 'KITA' : 'PEMBELI'}] "${m.text}"`).join(" -> ")}`);
					}

					if (decision.shouldReply) {
						// Generate AI reply or use template
						let finalReply = replyText;
						if (useAI && decision.clientMessage) {
							const aiReply = await AIChatService.generateReply(
								decision.clientMessage,
								{},
								decision.messages || [],
								{ username: firstLine.trim().slice(0, 80) },
							);
							if (aiReply) {
								finalReply = aiReply;
								this.logger.info(`AI Reply: "${aiReply}"`);
							} else {
								this.logger.info(`Using template fallback: "${replyText}"`);
							}
						}

						if (decision.isE2eeFallback) {
							this.logger.info(`Menggunakan E2EE fallback: ${decision.reason}`);
						} else {
							this.logger.success(`Pesan masuk cocok: "${decision.clientMessage}". Membalas...`);
						}
						
						const textbox = this.page.locator('div[role="textbox"]').first();
						if (await textbox.isVisible()) {
							await textbox.focus();
							await this.engine.humanType(textbox, finalReply);
							await this.engine.delay(500, 1000);
							await this.page.keyboard.press("Enter");
							this.logger.success(`Balasan terkirim ke "${firstLine.trim()}".`);
							processedCount++;
							threadResults.push({ buyer: firstLine.trim(), status: "replied", reply: finalReply.slice(0, 200) });
							await this.engine.delay(3000, 5000); // Random delay after reply
						} else {
							this.logger.warn("Elemen textbox chat tidak ditemukan atau tersembunyi.");
							threadResults.push({ buyer: firstLine.trim(), status: "failed", reason: "textbox-tak-temu" });
						}
					} else {
						this.logger.info(`Lewati chat: ${decision.reason}`);
						threadResults.push({ buyer: firstLine.trim(), status: "skipped", reason: decision.reason });
					}
				} catch (err) {
					this.logger.error(`Gagal memproses chat ke-${i + 1}: ${err.message}`);
					threadResults.push({ buyer: firstLine.trim(), status: "failed", reason: err.message.slice(0, 120) });
				}
				
				await this.engine.delay(1000, 2000);
			}

			this.logger.success(`Selesai memproses inbox. Total dibalas: ${processedCount} chat.`);
			return { success: true, replied: processedCount, threads: threadResults };
		} catch (err) {
			this.logger.error("Kesalahan fatal saat membalas inbox", err);
			return { success: false, error: err.message };
		}
	}

	async _openThreadByBuyer(thread, timeout = 8000) {
		const escRx = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const first = (thread.topic || "").split(" ").filter(Boolean)[0] || "";
		const locs = [
			this.page.locator('div[role="button"], a[role="link"]').filter({ hasText: new RegExp(escRx(thread.buyer) + ".*" + escRx(first), "i") }).first(),
			this.page.locator('div[role="button"], a[role="link"]').filter({ hasText: new RegExp(escRx(thread.buyer), "i") }).first(),
		];
		for (const loc of locs) {
			try {
				await loc.click({ timeout: 5000 });
				await this.engine.delay(2500, 3500);
				const box = this.page.locator('div[role="textbox"]').first();
				if (await box.isVisible().catch(() => false)) {
					const label = (await box.getAttribute("aria-label").catch(() => "")) || "";
					if (!thread.buyer || label.toLowerCase().includes(thread.buyer.split(" ")[0].toLowerCase())) return true;
				}
			} catch (_e) {}
		}
		return false;
	}

	/**
	 * Follow-up thread sunyi: kita terakhir bicara + sunyi N hari.
	 * @returns {Promise<Array>} hasil per thread
	 */
	async followUpThreads(account, candidates, options = {}) {
		const { pin, useAI = true, replyText = "Halo kak, unit masih tersedia. Mau atur waktu cek?", onSent = null } = options;
		const out = [];
		for (const thread of candidates) {
			try {
				const opened = await this._openThreadByBuyer(thread);
				if (!opened) {
					out.push({ key: thread.key, buyer: thread.buyer, status: "failed", reason: "thread-tak-terbuka" });
					continue;
				}
				if (pin) await this.handleE2eeUnlock(pin);
				await this._loadFullHistory(4);
				const history = await this._readHistory(thread.buyer);
				const lastBuyer = [...history].reverse().find((m) => !m.isOutgoing);
				let finalReply = replyText;
				if (useAI) {
					const aiReply = await AIChatService.generateReply(
						lastBuyer ? lastBuyer.text : `Sapa ulang ${thread.buyer} soal ${thread.topic}`,
						{ title: thread.topic },
						history,
						{ username: `${thread.buyer}`, followup: true },
					);
					if (aiReply) finalReply = aiReply;
				}
				const textbox = this.page.locator('div[role="textbox"]').first();
				if (!(await textbox.isVisible().catch(() => false))) {
					out.push({ key: thread.key, buyer: thread.buyer, status: "failed", reason: "textbox-tak-temu" });
					continue;
				}
				await textbox.focus();
				await this.engine.humanType(textbox, finalReply);
				await this.engine.delay(500, 1000);
				await this.page.keyboard.press("Enter");
				await this.engine.delay(3000, 5000);
				out.push({ key: thread.key, buyer: thread.buyer, status: "replied", reply: finalReply.slice(0, 200) });
				if (onSent) await onSent(thread, finalReply);
			} catch (e) {
				out.push({ key: thread.key, buyer: thread.buyer, status: "failed", reason: (e.message || "").slice(0, 120) });
			}
			await this.engine.delay(1000, 2000);
		}
		return out;
	}

	async _readHistory(buyerFirst = "") {
		const bf = String(buyerFirst || "").toLowerCase();
		return await this.page.evaluate((bf) => {
			const els = Array.from(document.querySelectorAll('div[role="presentation"], [data-testid="message-text"]'));
			const out = [];
			for (const b of els) {
				const t = (b.innerText || b.textContent || "").trim();
				if (!t || t.length <= 1 || t.length >= 500) continue;
				if (/detail percakapan/i.test(t)) continue;
				if (/^(sen|sel|rab|kam|jum|sab|min)\b/i.test(t) && t.length < 30) continue;
				if (/^message sent$/i.test(t)) continue;
				let named = "";
				let p = b;
				for (let d = 0; d < 5 && p; d++) {
					const a = (p.getAttribute && p.getAttribute("aria-label")) || "";
					const m = a.match(/(?:pukul|at)\s+[^,]*,\s*(.+?)\s*:/i);
					if (m) {
						named = m[1].toLowerCase();
						break;
					}
					p = p.parentElement;
				}
				out.push({ text: t, named });
			}
			const seen = new Set();
			return out.filter((m) => {
				if (seen.has(m.text)) return false;
				seen.add(m.text);
				return true;
			}).slice(-12).map((m) => ({ text: m.text, isOutgoing: !(bf && m.named.includes(bf)) }));
		}, bf).catch(() => []);
	}

	async _loadFullHistory(maxScrolls = 8) {
		const sel = [
			'div[role="presentation"]',
			'[aria-label^="Pukul" i]',
			'[data-testid="message-text"]',
		].join(", ");
		let lastCount = -1;
		for (let i = 0; i < maxScrolls; i++) {
			const count = await this.page.evaluate((s) => document.querySelectorAll(s).length, sel).catch(() => 0);
			if (count === lastCount) break;
			lastCount = count;
			await this.page.evaluate(() => {
				const main = document.querySelector('[role="main"]');
				const scroller = (el) => {
					let p = el;
					while (p && p !== document.body) {
						const st = getComputedStyle(p);
						if (/auto|scroll/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 50) return p;
						p = p.parentElement;
					}
					return null;
				};
				const pane = scroller(main) || main || document.scrollingElement;
				if (pane) pane.scrollTop = 0; // tarik ke atas = muat pesan lama
				else window.scrollBy(0, -800);
			}).catch(() => {});
			await this.engine.delay(700, 1100);
		}
	}

	async handleE2eeUnlock(pin) {
		if (!pin) return;
		try {
			// Look for E2EE unlock triggers (like Lupa PIN link or PIN text box)
			const restoreBtn = this.page.locator('div[role="button"], span, a').filter({ hasText: /^(Masukkan PIN|Restore|Unlock|Lupa PIN\?)$/i }).first();
			if (await restoreBtn.isVisible()) {
				this.logger.info("Menemukan tombol trigger E2EE PIN. Mengklik...");
				await restoreBtn.click();
				await this.engine.delay(2000, 3000);
			}

			const pinInputs = this.page.locator('input[type="password"], input[inputmode="numeric"], input[aria-label*="PIN" i]');
			const inputsCount = await pinInputs.count();
			if (inputsCount > 0) {
				this.logger.info(`Menemukan ${inputsCount} kolom input PIN E2EE. Memasukkan PIN...`);
				if (inputsCount === 6) {
					for (let d = 0; d < 6; d++) {
						await pinInputs.nth(d).fill(pin[d]);
						await this.engine.delay(100, 200);
					}
				} else {
					await pinInputs.first().fill(pin);
				}
				await this.engine.delay(1000, 2000);

				// Look for submit/continue button
				const submitBtn = this.page.locator('div[role="button"], button').filter({ hasText: /^(Kirim|Selesai|Lanjutkan|Confirm|Submit|Ok|Simpan)$/i }).first();
				if (await submitBtn.isVisible()) {
					await submitBtn.click();
					this.logger.info("Tombol kirim PIN diklik.");
					await this.engine.delay(3000, 4000);
				} else {
					// Press Enter as fallback
					await this.page.keyboard.press("Enter");
					await this.engine.delay(3000, 4000);
				}
			}
		} catch (err) {
			this.logger.warn(`Gagal memproses unlock E2EE: ${err.message}`);
		}
	}
}

module.exports = ChatService;
