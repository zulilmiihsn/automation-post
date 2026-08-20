const Logger = require("../utils/logger");
const InteractionEngine = require("../core/interactionEngine");
const AIChatService = require("./aiChatService");

class ChatService {
	constructor(page, accountName = "CHAT") {
		this.page = page;
		this.engine = new InteractionEngine(page, accountName);
		this.logger = new Logger(accountName);
	}

	/**
	 * Automate replying to up to 15 last chat messages in the Marketplace inbox.
	 * @param {object} options - Options including customized reply templates
	 */
	async replyToInbox(options = {}) {
		const replyText = options.replyText || "Masih, langsung lanjut WA ya";
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
			
			// Wait for inbox threads to load
			const threadSelector = 'a[href*="/marketplace/inbox/thread/"], a[href*="/messages/t/"], div[role="gridcell"] a[role="link"]';
			await this.page.waitForSelector(threadSelector, { timeout: 2000 }).catch(() => {});
			
			// Wait stable
			await this.engine.delay(2000, 3000);

			let processedCount = 0;
			const maxChats = 15;

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
					continue;
				}

				if (!matchesKeyword) {
					this.logger.info(`Lewati chat "${firstLine.trim()}": Tidak cocok kata kunci.`);
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

					// Determine if the last message requires a reply from DOM history (for non-E2EE)
					const decision = await this.page.evaluate(() => {
						const msgSelector = 'div.xexx8yu.xyri2b.x18d9i69.x1c1uobl, [data-testid="message-text"], span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft';
						const msgBubbles = Array.from(document.querySelectorAll(msgSelector));
						
						if (msgBubbles.length === 0) {
							// E2EE Locked or blank chat pane. Since sidebar preview already verified it, we allow reply fallback.
							return { shouldReply: true, isE2eeFallback: true, reason: "Pesan terenkripsi E2EE / tidak terbaca di DOM, gunakan data sidebar." };
						}

						const chatContainer = document.querySelector('[role="main"]') || msgBubbles[0].closest('[role="grid"]') || msgBubbles[0].parentElement;
						if (!chatContainer) {
							return { shouldReply: true, isE2eeFallback: true, reason: "Container tidak ditemukan, gunakan data sidebar." };
						}

						const containerRect = chatContainer.getBoundingClientRect();

						// Filter empty texts and map with alignment heuristics
						const messages = msgBubbles.map(el => {
							const rect = el.getBoundingClientRect();
							const text = (el.innerText || el.textContent || "").trim();
							if (rect.width === 0 || rect.height === 0) return null;
							
							const distToRight = containerRect.right - rect.right;
							const distToLeft = rect.left - containerRect.left;
							const isOutgoing = distToRight < distToLeft; // Right-aligned means sent by us
							return { text, isOutgoing };
						}).filter(m => m !== null && m.text.length > 0);

						if (messages.length === 0) {
							return { shouldReply: true, isE2eeFallback: true, reason: "Semua pesan kosong, gunakan data sidebar." };
						}

						const lastMsg = messages[messages.length - 1];

						// Check if we are the last sender in history
						if (lastMsg.isOutgoing) {
							return { shouldReply: false, reason: "Pesan terakhir dikirim oleh kita (sudah dibalas).", messages };
						}

						// Check message text for buy/availability keywords
						const lastText = lastMsg.text.toLowerCase();
						const kws = ["masih ada", "ready", "masih?", "ada?", "apakah ini masih ada", "barang ini masih ada"];
						const matches = kws.some(kw => lastText.includes(kw));

						if (matches) {
							return { shouldReply: true, clientMessage: lastMsg.text, messages };
						}

						return { shouldReply: false, reason: `Pesan terakhir tidak cocok kata kunci: "${lastMsg.text}"`, messages };
					});

					if (decision.messages && decision.messages.length > 0) {
						const lastFew = decision.messages.slice(-3);
						this.logger.info(`Riwayat chat terakhir: ${lastFew.map(m => `[${m.isOutgoing ? 'KITA' : 'PEMBELI'}] "${m.text}"`).join(" -> ")}`);
					}

					if (decision.shouldReply) {
						// Generate AI reply or use template
						let finalReply = replyText;
						if (useAI) {
							const aiReply = await AIChatService.generateReply(
								decision.clientMessage || firstLine.trim(),
								{ title: firstLine.trim() }
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
							await this.engine.delay(3000, 5000); // Random delay after reply
						} else {
							this.logger.warn("Elemen textbox chat tidak ditemukan atau tersembunyi.");
						}
					} else {
						this.logger.info(`Lewati chat: ${decision.reason}`);
					}
				} catch (err) {
					this.logger.error(`Gagal memproses chat ke-${i + 1}: ${err.message}`);
				}
				
				await this.engine.delay(1000, 2000);
			}

			this.logger.success(`Selesai memproses inbox. Total dibalas: ${processedCount} chat.`);
			return { success: true, replied: processedCount };
		} catch (err) {
			this.logger.error("Kesalahan fatal saat membalas inbox", err);
			return { success: false, error: err.message };
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
