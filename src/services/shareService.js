const Logger = require("../utils/logger");
const InteractionEngine = require("../core/interactionEngine");
const { SELECTORS } = require("../core/constants");

class ShareService {
	constructor(page, accountName = "SHARE") {
		this.page = page;
		this.engine = new InteractionEngine(page, accountName);
		this.logger = new Logger(accountName);
	}

	async _safeClick(locator, timeout = 1000, noScroll = false) {
		try {
			if (!noScroll) await locator.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
			// Playwright akan mengecek actionability. Jika terhalang layer transparan Facebook,
			// batas 1 detik ini akan membuatnya cepat gagal lalu loncat ke mode ekstrim force:true di bawah.
			await locator.click({ timeout });
		} catch (_e1) {
			try {
				await locator.click({ force: true, timeout: 3000 });
			} catch (_e2) {
				// Bypass native click() which breaks React. Gunakan dispatchEvent MouseEvent murni.
				if (await locator.count().catch(() => 0) > 0) {
					await locator.evaluate((el) => {
						el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
						el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
						el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
					}).catch(() => {});
				}
			}
		}
	}

	/**
	 * @param {string} postUrl
	 * @param {string|Array} targetGroups - Keyword string or array of group names
	 * @param {number} maxPerRun
	 */
	async shareToGroups(postUrl, targetGroups, maxPerRun = 50, caption = "") {
		const results = [];

		try {
			if (postUrl?.startsWith("http")) {
				await this.engine.navigateAndStabilize(postUrl);
			} else {
				await this.page.evaluate(() => window.scrollTo(0, 0));
			}

			// Clean and process input group keywords/names
			const groupNames = Array.isArray(targetGroups)
				? targetGroups
				: targetGroups
						.split(",")
						.map((s) => s.trim())
						.filter((s) => s);

			if (groupNames.length === 0) {
				this.logger.warn("Tidak ada target grup/keyword.");
				return [];
			}

			let sharedCount = 0;
			const postedGroupNames = new Set();

			for (const kw of groupNames) {
				if (sharedCount >= maxPerRun) break;

				this.logger.info(`🔍 Mulai membagikan ke grup dengan kata kunci: '${kw}'`);

				let currentIndex = 0;
				let hasMoreGroups = true;

				while (hasMoreGroups && sharedCount < maxPerRun) {
					// Pastikan posisi di Master Post jika belum (hanya navigasi jika terlempar dari halaman)
					if (postUrl?.startsWith("http")) {
						const currentUrl = this.page.url();
						const isAlreadyOnPost = currentUrl.includes("/share/") || currentUrl.includes("/posts/") || currentUrl.includes("pfbid") || currentUrl.includes("story_fbid") || currentUrl.includes("permalink.php");
						
						if (!isAlreadyOnPost) {
							await this.engine.navigateAndStabilize(postUrl);
						}
					}

					// Cek error privasi ("Konten Ini Tidak Tersedia Saat Ini")
					const isContentUnavailable = await this.page.evaluate(() => {
						const text = (document.body.innerText || "").toLowerCase();
						return text.includes("konten ini tidak tersedia saat ini") ||
							   text.includes("this content isn't available right now") ||
							   text.includes("this content is not available");
					}).catch(() => false);

					if (isContentUnavailable) {
						this.logger.error(`❌ Kendala: Postingan utama bersifat Privat atau sudah dihapus. Share dibatalkan.`);
						results.push({ status: "failed", error: "Master post is private / content not available" });
						break;
					}

					// 1. Temukan & Klik Tombol Share Utama di Master Post Card
					// 1. Temukan & Klik Tombol Share Utama di Master Post Card
					// Menggunakan getByRole untuk memastikan HANYA tombol murni yang punya aksesibilitas Share/Bagikan yang disasar.
					// Hal ini menyingkirkan resiko mengeklik tombol Foto (Fullscreen theater) secara instan.
					let shareBtn = this.page
						.getByRole('button', { name: /^(Share|Bagikan|Send this to friends.*|Kirim ini ke teman.*|Kirimkan ini ke teman.*)$/i })
						.filter({ visible: true })
						.first();

					let shareFound = false;
					try {
						await shareBtn.waitFor({ state: "visible", timeout: 2000 });
						shareFound = true;
					} catch (e) {
						// Fallback elegan: kalau tombol share tenggelam di layar sempit/postingan panjang
						this.logger.info("⏳ Tombol Share tersembunyi, bot sedang melakukan scroll otomatis...");
						await this.page.mouse.wheel(0, 300);
						await this.engine.delay(1000);
						
						try {
							await shareBtn.waitFor({ state: "visible", timeout: 3000 });
							shareFound = true;
						} catch (e2) {
							shareFound = false;
						}
					}

					if (!shareFound) {
						this.logger.error("❌ Kendala: Tombol Share tidak ditemukan sama sekali di postingan ini.");
						break;
					}

					await this.engine.humanHover(shareBtn);
					await this._safeClick(shareBtn);

					// 2. Klik Opsi "Share to a group" / "Bagikan ke grup" di Menu Popup (Strict Kunci Active Menu)
					const activeMenu = this.page.locator('div[role="dialog"], div[role="menu"]').filter({ visible: true }).last();

					let shareToGroupBtn = activeMenu
						.locator('[aria-label="Bagikan ke grup" i], [aria-label="Share to a group" i]')
						.filter({ visible: true })
						.first();

					await shareToGroupBtn.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});

					if (!await shareToGroupBtn.isVisible().catch(() => false)) {
						shareToGroupBtn = activeMenu
							.locator('[role="menuitem"]')
							.filter({ visible: true })
							.filter({ hasText: /^Group$|^Grup$|Share to a group|Bagikan ke grup|Ke grup|To a group/i })
							.filter({ hasNotText: /Create group|Buat grup|Your groups|Grup Anda/i })
							.first();

						await shareToGroupBtn.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
					}

					if (await shareToGroupBtn.isVisible().catch(() => false)) {
						await this._safeClick(shareToGroupBtn, 5000, true);
					} else {
						this.logger.warn("⚠️ Kendala: Menu 'Bagikan ke grup' tidak tersedia (mungkin postingan tidak bisa di-share ke grup).");
						await this.page.keyboard.press("Escape").catch(() => {});
						await this.engine.delay(500, 800);
						break;
					}

					// 3. Ambil Modal Dialog Daftar Grup (Filter spesifik: harus punya kotak pencarian 'input' agar tidak salah nangkap menu Messenger)
					let groupDialog = this.page.locator('div[role="dialog"]')
						.filter({ has: this.page.locator('input') })
						.filter({ visible: true })
						.last();
						
					let isGroupDialogVisible = await groupDialog.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);

					if (!isGroupDialogVisible) {
						// Fallback darurat
						groupDialog = this.page.locator('div[role="dialog"]').filter({ visible: true }).last();
						isGroupDialogVisible = await groupDialog.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
					}

					if (!isGroupDialogVisible) {
						this.logger.error("❌ Kendala: Jendela daftar grup gagal dimuat oleh Facebook.");
						await this.page.keyboard.press("Escape").catch(() => {});
						break;
					}

					// 4. Pilih Grup ke-currentIndex yang Cocok dengan Keyword
					const groupItems = groupDialog
						.locator('div[role="button"]')
						.filter({ visible: true })
						.filter({ hasText: /[a-zA-Z0-9]/ });

					await groupItems.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});

					const matchingGroups = groupItems.filter({ hasText: new RegExp(kw, "i") });
					let matchCount = await matchingGroups.count().catch(() => 0);

					let scrollAttempts = 0;
					let targetGroup = null;
					let groupNameClean = null;

					while (scrollAttempts < 15) {
						// Eksekusi pencarian teks di dalam browser context langsung (blazing fast)
						const result = await matchingGroups.evaluateAll((els, postedArray) => {
							const postedSet = new Set(postedArray);
							for (let i = 0; i < els.length; i++) {
								let name = els[i].getAttribute("aria-label");
								if (!name) name = els[i].innerText || "";
								name = name.split("\n")[0].trim();
								if (name && !postedSet.has(name)) {
									return { index: i, nameClean: name };
								}
							}
							return null;
						}, Array.from(postedGroupNames));

						if (result) {
							targetGroup = matchingGroups.nth(result.index);
							groupNameClean = result.nameClean;
							postedGroupNames.add(result.nameClean);
							currentIndex = result.index;
							break;
						}

						// Kalau habis di scan tapi belum nemu grup baru, scroll ke bawah
						await groupDialog.hover().catch(() => {});
						await this.page.mouse.wheel(0, 600);
						await this.engine.delay(200, 400);
						matchCount = await matchingGroups.count().catch(() => 0);
						scrollAttempts++;
					}

					if (!targetGroup) {
						this.logger.info(`✅ Selesai: Semua grup yang mengandung kata '${kw}' sudah berhasil di-share.`);
						hasMoreGroups = false;
						break;
					}

					// Beri waktu (timeout 3000ms) agar Playwright otomatis nunggu modal berhenti bergerak (stabil), 
					// tanpa harus dikasih delay angka mati. Begitu stabil, langsung diklik di detik itu juga.
					await this._safeClick(targetGroup, 3000);

					// 4.5. Ketik Caption (jika ada)
					if (caption) {
						// Facebook sering merubah aria-label, tapi konten utamanya selalu punya role="textbox" dan contenteditable
						const captionInput = this.page.locator('div[role="textbox"][contenteditable="true"]').filter({ visible: true }).last();
						
						if (await captionInput.isVisible().catch(() => false)) {
							await this._safeClick(captionInput);
							// Gunakan insertText karena lebih ngebut dan support emoji/line break native tanpa resiko patah
							await this.page.keyboard.insertText(caption);
						}
					}

					// 5. Klik Tombol "Post" / "Kirim" Akhir di Composer Grup
					const postSubmitBtn = this.page
						.locator('div[role="button"][aria-label="Kirim" i], div[role="button"][aria-label="Post" i], div[role="button"][aria-label="Posting" i], div[role="button"][aria-label="Publish" i]')
						.filter({ visible: true })
						.last();

					let isShared = false;
					let bashCount = 0;

					const isPostBtnVisible = await postSubmitBtn.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);

					if (isPostBtnVisible) {
						// Battering Ram Global (Bypass overlay transparan)
						while (!isShared && bashCount < 10) { // Maks 10 detik
							if (await postSubmitBtn.count() > 0) {
								await postSubmitBtn.evaluate(node => node.click()).catch(() => {});
							}
							await this.engine.delay(800); // Jeda cek

							// Jika tombol Posting hilang atau ter-disable (proses loading FB)
							const isStillVisible = await postSubmitBtn.isVisible().catch(() => false);
							const isDisabled = await postSubmitBtn.getAttribute("aria-disabled").catch(() => null) === "true";
							
							if (!isStillVisible || isDisabled) {
								isShared = true;
								await this.engine.delay(1000);
								break;
							}
							bashCount++;
						}
					}

					if (isShared) {

						// Cek restriksi FB setelah posting
						const postRestriction = await this.checkRestriction();
						if (postRestriction) {
							this.logger.error(`🚫 BLOKIR: Akun terkena limit/pembatasan dari Facebook (${postRestriction}). Berhenti membagikan.`);
							results.push({ status: "accountRestricted", error: postRestriction });
							return results;
						}

						sharedCount++;
						this.logger.success(`🚀 SUKSES: Membagikan ke grup '${groupNameClean}' [${sharedCount}/${maxPerRun}]`);
						results.push({ group: groupNameClean, status: "shared" });
					} else {
						this.logger.warn(`⚠️ GAGAL: Tidak bisa mengeklik tombol Post di grup '${groupNameClean}'. Melewati grup ini.`);
					}
				}
			}
		} catch (err) {
			this.logger.error("Kesalahan selama proses pembagian", err);
			results.push({ status: "failed", error: err.message });
		}

		return results;
	}


	async checkRestriction() {
		const result = await this.page.evaluate((indicators) => {
			const bodyText = (document.body.innerText || "").toLowerCase();
			for (const s of indicators) {
				if (bodyText.includes(s.toLowerCase())) return s;
			}
			return null;
		}, SELECTORS.RESTRICTION_INDICATORS);

		return result;
	}
}

module.exports = ShareService;
