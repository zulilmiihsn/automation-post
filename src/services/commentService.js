const Logger = require("../utils/logger");
const InteractionEngine = require("../core/interactionEngine");
const path = require("path");
const fs = require("fs-extra");

class CommentService {
	constructor(page, accountName = "COMMENT") {
		this.page = page;
		this.engine = new InteractionEngine(page, accountName);
		this.logger = new Logger(accountName);
		this.lastPostUrl = null;
	}

	normalizeUrl(urlStr) {
		try {
			const url = new URL(urlStr);
			const commentId = url.searchParams.get("comment_id");
			const cleanSearch = commentId ? `?comment_id=${commentId}` : "";
			let host = url.host;
			if (host === "web.facebook.com" || host === "m.facebook.com") {
				host = "www.facebook.com";
			}
			return `https://${host}${url.pathname.replace(/\/$/, "")}${cleanSearch}`;
		} catch (e) {
			return String(urlStr).replace("//web.", "//www.").replace("//m.", "//www.");
		}
	}

	resolvePhotoPaths(photos = []) {
		return photos
			.map((p) => {
				if (!p) return null;
				const cleanPath = p.startsWith("/") ? p.substring(1) : p;
				const fullPath = path.isAbsolute(cleanPath)
					? cleanPath
					: path.join(process.cwd(), cleanPath);
				return fs.existsSync(fullPath) ? fullPath : null;
			})
			.filter((p) => p !== null);
	}

	/**
	 * Post a comment with listing text and photos on a target post URL.
	 * @param {string} postUrl
	 * @param {object} listing - { title, description, photos }
	 */
	async commentOnPost(postUrl, listing) {
		const currentUrl = this.page.url();
		const isSameUrl = this.lastPostUrl === postUrl || this.normalizeUrl(currentUrl) === this.normalizeUrl(postUrl);

		if (isSameUrl) {
			this.logger.info(`Sudah di halaman postingan target. Langsung proses tanpa navigasi ulang.`);
		} else {
			this.logger.info(`Navigasi ke postingan: ${postUrl}`);
			try {
				await this.engine.navigateAndStabilize(postUrl);
				this.lastPostUrl = postUrl;
			} catch (err) {
				this.logger.warn(`Navigasi bermasalah: ${err.message}`);
			}
		}

		// Dismiss semua overlay/dialog setelah navigasi (termasuk "Leave Page" dari Share step)
		await this.dismissOverlays();

		try {
			let commentBox = null;
			let commentId = null;
			try {
				const urlObj = new URL(postUrl);
				commentId = urlObj.searchParams.get("comment_id");
			} catch (_e) {}

			if (commentId) {
				this.logger.info(`Menargetkan balasan komentar untuk comment_id: ${commentId}`);
				this.logger.method("TRY", "comment.reply.locate", `comment_id=${commentId}`);
				
				const commentAnchor = this.page.locator(`a[href*="comment_id=${commentId}"]`).first();
				await commentAnchor.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});

				if (await commentAnchor.isVisible()) {
					// Cari tombol Balas terdekat di blok komentar
					const replyClicked = await commentAnchor.evaluate((el) => {
						const container = el.closest('div[role="article"]') || el.closest('ul') || el.parentElement?.parentElement;
						if (!container) return false;
						const replyBtn = Array.from(container.querySelectorAll('div[role="button"], span, a'))
							.find(item => /^(Reply|Balas)$/i.test(item.innerText || item.textContent || ""));
						if (replyBtn) {
							replyBtn.click();
							return true;
						}
						return false;
					});

					if (replyClicked) {
						await this.engine.delay(300, 500);
						const replyBox = this.page.locator('div[role="textbox"][aria-label*="Komentari" i], div[role="textbox"][aria-label*="Comment" i], div[role="textbox"][aria-label*="balasan" i], div[role="textbox"][aria-label*="reply" i], div[role="textbox"]').first();
						await replyBox.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
						if (await replyBox.isVisible()) {
							commentBox = replyBox;
							this.logger.method("SUCCESS", "comment.reply.locate", "replyBox=ready");
						}
					}
				}
			}

			// Normal post comment box
			if (!commentBox) {
				this.logger.method("TRY", "comment.main.locate");
				
				const boxSelectors = [
					'div[role="textbox"][aria-label*="komentar" i]',
					'div[role="textbox"][aria-label*="comment" i]',
					'div[role="textbox"][aria-label*="Tulis" i]',
					'div[role="textbox"][aria-label*="Write" i]',
					'div[role="textbox"][contenteditable="true"]:not([aria-label*="pikirkan" i]):not([aria-label*="mind" i]):not([aria-label*="buat" i]):not([aria-label*="create" i])',
					'div[role="textbox"]'
				];

				for (const sel of boxSelectors) {
					const box = this.page.locator(sel).filter({ visible: true }).first();
					if (await box.isVisible().catch(() => false)) {
						commentBox = box;
						break;
					}
				}

				if (!commentBox) {
					const placeholder = this.page.locator('[aria-label*="Tulis komentar" i], [aria-label*="Write a comment" i], div[role="button"][aria-label*="komentar" i], div[role="button"][aria-label*="comment" i]').filter({ visible: true }).first();
					if (await placeholder.isVisible().catch(() => false)) {
						await placeholder.click({ force: true }).catch(() => {});
						await this.engine.delay(500);
					} else {
						await this.engine.humanScroll(300);
						await this.engine.delay(500);
					}

					for (const sel of boxSelectors) {
						const box = this.page.locator(sel).first();
						if (await box.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false)) {
							commentBox = box;
							break;
						}
					}
				}

				if (commentBox && await commentBox.isVisible().catch(() => false)) {
					this.logger.method("SUCCESS", "comment.main.locate");
				}
			}

			if (!commentBox) {
				this.logger.method("FAIL", "comment.main.locate");
				throw new Error("Comment textbox not found");
			}

			// Focus kotak komentar
			await commentBox.focus();
			await this.engine.delay(100, 200);

			if (isSameUrl) {
				await commentBox.press("Control+A").catch(() => {});
				await commentBox.press("Backspace").catch(() => {});
			}

			// Injeksi Foto (Browser-native file injection Playwright)
			if (listing.photos && listing.photos.length > 0) {
				const absolutePaths = this.resolvePhotoPaths(listing.photos);
				if (absolutePaths.length > 0) {
					const firstPhotoPath = absolutePaths[0];
					this.logger.info(`Menyematkan foto: ${path.basename(firstPhotoPath)}`);
					
					// 1. Cari input file langsung di halaman
					const fileInputs = this.page.locator('input[type="file"][accept*="image"], input[type="file"]');
					const fileInputCount = await fileInputs.count().catch(() => 0);

					let photoDone = false;
					if (fileInputCount > 0) {
						await fileInputs.last().setInputFiles(firstPhotoPath).catch(() => {});
						photoDone = true;
						this.logger.info("Foto disuntikkan via input file.");
						await this.engine.delay(800, 1200);
					}

					// 2. Fallback: Klik tombol kamera / lampirkan foto jika input belum muncul
					if (!photoDone) {
						const attachBtn = this.page.locator('div[aria-label*="Lampirkan foto" i], div[aria-label*="Attach a photo" i], div[aria-label*="Attach photo" i]').filter({ visible: true }).last();
						if (await attachBtn.isVisible().catch(() => false)) {
							const [fileChooser] = await Promise.all([
								this.page.waitForEvent('filechooser', { timeout: 2000 }).catch(() => null),
								attachBtn.click({ force: true }).catch(() => {})
							]);
							if (fileChooser) {
								await fileChooser.setFiles(firstPhotoPath).catch(() => {});
								photoDone = true;
								this.logger.info("Foto disuntikkan via file chooser.");
								await this.engine.delay(800, 1200);
							}
						}
					}
				}
			}

			// Masukkan teks komentar (Klik, Focus, Insert, dan Verifikasi Masuk)
			const textToType = listing.description || "";
			if (textToType) {
				this.logger.info("Mengisi deskripsi komentar...");
				await commentBox.click({ force: true }).catch(() => {});
				await commentBox.focus().catch(() => {});
				await this.page.keyboard.insertText(textToType);
				await this.engine.delay(300, 500);

				// Verifikasi teks benar-benar masuk ke Lexical editor
				const textVal = await commentBox.innerText().catch(() => "");
				if (!textVal.trim()) {
					await commentBox.click({ force: true }).catch(() => {});
					await this.page.keyboard.type(textToType, { delay: 2 });
					await this.engine.delay(200);
				}
			}

			// Kirim Komentar (Enter + Tombol Kirim + Verifikasi Pengiriman)
			this.logger.info("Mengirimkan komentar...");
			await commentBox.click({ force: true }).catch(() => {});
			await commentBox.focus().catch(() => {});

			// 1. Eksekusi Enter
			await commentBox.press("Enter").catch(() => {});
			await this.page.keyboard.press("Enter").catch(() => {});

			// 2. Klik tombol Kirim jika ada
			const sendBtn = this.page.locator('div[role="button"][aria-label="Kirim" i], div[role="button"][aria-label="Send" i], div[aria-label="Kirim" i], div[aria-label="Send" i], [aria-label*="Kirim komentar" i], [aria-label*="Post comment" i]').filter({ visible: true }).last();
			if (await sendBtn.isVisible().catch(() => false)) {
				await sendBtn.click({ force: true }).catch(() => {});
			}

			// 3. Verifikasi: Tunggu kotak komentar bersih (terkirim)
			const startWait = Date.now();
			while (Date.now() - startWait < 5000) {
				const currentText = await commentBox.innerText().catch(() => "");
				if (!currentText.trim() || currentText.trim() === "\n") {
					break;
				}
				// Retry submit jika setelah 1.5 detik masih ada teks
				if (Date.now() - startWait > 1500) {
					await commentBox.click({ force: true }).catch(() => {});
					await commentBox.press("Enter").catch(() => {});
					await this.page.keyboard.press("Enter").catch(() => {});
					if (await sendBtn.isVisible().catch(() => false)) {
						await sendBtn.click({ force: true }).catch(() => {});
					}
				}
				await this.engine.delay(300);
			}

			this.logger.success("Komentar terkirim.");
			return { success: true };
		} catch (err) {
			this.logger.error("Gagal mengirim komentar", err);
			return { success: false, error: err.message };
		}
	}

	/**
	 * Dismiss HANYA "Leave Page" confirmation dialog dari FB.
	 * JANGAN tutup dialog yang mengandung konten post/komentar.
	 */
	async dismissOverlays() {
		try {
			for (let i = 0; i < 3; i++) {
				// Cari HANYA "Leave Page" / "Leave Site" dialog secara spesifik
				const stayBtn = this.page.locator('div[role="dialog"] button, div[role="dialog"] [role="button"]')
					.filter({ hasText: /^(Stay on Page|Tetap di Halaman|Stay|Tetap)$/i })
					.filter({ visible: true }).first();

				if (await stayBtn.isVisible().catch(() => false)) {
					this.logger.info('Dismiss "Leave Page" dialog (klik Stay)...');
					await stayBtn.click({ force: true }).catch(() => {});
					await this.engine.delay(400, 600);
				} else {
					// Tidak ada Leave Page dialog — selesai
					break;
				}
			}
		} catch (_) {}
	}
}

module.exports = CommentService;
