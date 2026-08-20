const _path = require("node:path");
const Logger = require("../utils/logger");
const InteractionEngine = require("../core/interactionEngine");
const { SELECTORS } = require("../core/constants");

class FeedService {
	constructor(page, accountName = "FEED") {
		this.page = page;
		this.engine = new InteractionEngine(page, accountName);
		this.logger = new Logger(accountName);
	}

	async postToFeed(content) {
		try {
			this.logger.info("Memulai posting ke Feed/Timeline...");

			await this.engine.navigateAndStabilize("https://www.facebook.com/me");

			// Kriteria Cepat & Aman untuk Kotak Posting (Support Bilingual 100%)
			const composerSelectors = [
				'[aria-label="Apa yang Anda pikirkan sekarang?" i]',
				'[aria-label="What\'s on your mind?" i]',
				'[aria-label*="Apa yang Anda pikirkan" i]',
				'[aria-label*="What\'s on your mind" i]',
				'div[role="button"]:has-text("What\'s on your mind")',
				'div[role="button"]:has-text("Apa yang Anda pikirkan")',
				'div[role="button"]:has-text("Create a post")',
				'div[role="button"]:has-text("Buat postingan")'
			];

			let composerTrigger = this.page.locator(composerSelectors.join(", ")).filter({ visible: true }).first();

			this.logger.method("TRY", "feed.composer.trigger", "selector=COMPOSER_SELECTORS");
			let triggerFound = await composerTrigger.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
			
			if (!triggerFound) {
				this.logger.warn("Kotak posting tidak langsung ditemukan. Mencoba me-refresh halaman (F5)...");
				await this.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
				await this.engine.delay(3000);
				
				composerTrigger = this.page.locator(composerSelectors.join(", ")).filter({ visible: true }).first();
				triggerFound = await composerTrigger.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
			}

			if (!triggerFound) {
				this.logger.method("FAIL", "feed.composer.trigger");
				throw new Error("Kotak posting benar-benar tidak ditemukan (layout Facebook tidak dikenali).");
			} else {
				await composerTrigger.click();
			}
			this.logger.method("SUCCESS", "feed.composer.trigger");

			// Pastikan dialog composer "Create post" sudah terbuka & terlihat
			let composerDialog = this.page.locator('div[role="dialog"]').filter({ visible: true }).last();
			
			// Proteksi ekstra: pastikan dialog ini benar-benar memiliki textbox
			if (!await composerDialog.locator('div[role="textbox"]').isVisible().catch(() => false)) {
				composerDialog = this.page.locator('div[role="dialog"]')
					.filter({ has: this.page.locator('div[role="textbox"]') })
					.filter({ visible: true })
					.first();
			}

			await composerDialog.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});


			// Handle Audience Review Popup jika tiba-tiba muncul dan menutupi layar
			try {
				const audienceReviewBtn = composerDialog.locator('div[role="button"]:has-text("Continue"), div[role="button"]:has-text("Lanjutkan")').first();
				if (await audienceReviewBtn.isVisible().catch(() => false)) {
					this.logger.info("Menangani popup Audience Review...");
					await audienceReviewBtn.click({ force: true }).catch(() => {});
					await this.engine.delay(800, 1000);
					const saveAudienceBtn = this.page.locator('div[role="button"]:has-text("Done"), div[role="button"]:has-text("Selesai"), div[role="button"]:has-text("Simpan"), div[role="button"]:has-text("Save")').first();
					if (await saveAudienceBtn.isVisible().catch(() => false)) {
						await saveAudienceBtn.click({ force: true }).catch(() => {});
						await this.engine.delay(1000, 1500);
					}
				}
			} catch (e) {
				// Abaikan jika error
			}

			// 1. Eksekusi Input Deskripsi & Upload Foto secara PARALEL (Promise.all)
			const parallelTasks = [];

			if (content.text) {
				parallelTasks.push(this._pasteDescriptionToComposer(composerDialog, content.text));
			}

			if (content.photos && content.photos.length > 0) {
				parallelTasks.push(this.uploadMedia(content.photos));
			}

			this.logger.info("Menunggu tugas paste text dan upload selesai...");
			await Promise.all(parallelTasks);
			this.logger.info("Tugas paralel selesai.");

			// 2. Klik tombol Post di dalam modal composer
			this.logger.info("Menunggu Facebook selesai memproses konten...");
			this.logger.method("TRY", "feed.publish.onPoint", "battering-ram-global");

			// Gunakan locator GLOBAL (Tidak terikat pada composerDialog yang bisa berubah jika ada tooltip/popup)
			const postBtnLocator = this.page
				.locator('div[role="button"][aria-label="Kirim" i], div[role="button"][aria-label="Post" i], div[role="button"][aria-label="Posting" i], div[role="button"][aria-label="Publish" i]')
				.filter({ visible: true })
				.last();

			let oldFirstPostText = "";
			try {
				const firstArt = this.page.getByRole('article').filter({ visible: true }).first();
				if (await firstArt.waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false)) {
					oldFirstPostText = await firstArt.innerText().catch(() => "");
				}
			} catch (e) {}

			// 1. Tunggu Tombol Post Aktif (tidak ada aria-disabled="true" atau disabled)
			this.logger.info("Menunggu tombol Post aktif (media & teks selesai diproses Facebook)...");
			const isPostBtnActive = await this.engine.waitForCondition(async () => {
				if (!await postBtnLocator.isVisible().catch(() => false)) return false;
				const ariaDisabled = await postBtnLocator.getAttribute("aria-disabled").catch(() => null);
				const disabled = await postBtnLocator.getAttribute("disabled").catch(() => null);
				return ariaDisabled !== "true" && disabled !== "true" && disabled !== "";
			}, 20000, 200);

			if (!isPostBtnActive) {
				this.logger.method("FAIL", "feed.publish.btnActive", "Tombol Post masih disabled");
				throw new Error("Tombol Post tidak aktif (media atau teks gagal diproses Facebook).");
			}

			let modalClosed = false;
			let bashCount = 0;

			// 2. Kombinasi Klik Playwright Nyata + Pointer Events
			while (!modalClosed && bashCount < 20) {
				if (await postBtnLocator.count().catch(() => 0) > 0) {
					// Dispatch pointerdown & pointerup terpercaya
					await postBtnLocator.evaluate((node) => {
						node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
						node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
						node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse" }));
						node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
					}).catch(() => {});

					// Playwright real click
					await postBtnLocator.click({ force: true }).catch(() => {});
				}

				await this.engine.delay(800, 1200);

				// Periksa apakah modal composer / tombol post sudah hilang
				const isBtnVisible = await postBtnLocator.isVisible().catch(() => false);
				const isDialogVisible = await composerDialog.isVisible().catch(() => false);
				if (!isBtnVisible && !isDialogVisible) {
					modalClosed = true;
					break;
				}
				bashCount++;
			}

			// 3. Validasi Sukses Sebelum Melanjutkan / Reload
			if (!modalClosed) {
				this.logger.method("FAIL", "feed.publish.modalNotClosed");
				throw new Error("Gagal memosting: Modal composer masih terbuka dan tidak terkirim.");
			}

			this.logger.method("SUCCESS", "feed.publish.onPoint");
			this.logger.success(`Berhasil memosting ke Feed! (Modal tertutup di ketukan ke-${bashCount})`);

			// Pastikan modal composer benar-benar hilang dari DOM
			await composerDialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
			this.logger.info("Proses memosting selesai.");
			
			this.logger.info("Mengambil link publik postingan terbaru (Salin Tautan)...");
			this.logger.method("TRY", "feed.postUrl.copyLink", "metode=share-menu-copy-link");
			let postUrl = await this.getPostUrlFromClipboard(oldFirstPostText);

			// Jika Salin Tautan gagal langsung di feed, buka permalink post lalu ambil Salin Tautan
			if (!postUrl) {
				this.logger.info("Mencari link postingan terbaru untuk navigasi ke halaman tunggal...");
				const profilePostUrl = await this.page.evaluate(() => {
					const searchContainer = document.querySelector('div[role="main"]') || document.body;
					const globalLinks = Array.from(searchContainer.querySelectorAll('a'));
					const postLink = globalLinks.find(a => {
						const href = a.href || '';
						const isPost = href.includes('/posts/') || href.includes('/permalink.php') || href.includes('story_fbid=') || href.includes('pfbid');
						const isPhotoHeader = href.includes('/photos/') && (href.includes('profile') || href.includes('cover'));
						return isPost && !isPhotoHeader && !href.includes('/groups/');
					});
					return postLink ? postLink.href : null;
				}).catch(() => null);

				if (profilePostUrl) {
					this.logger.info(`Membuka halaman postingan (${profilePostUrl}) untuk mengambil Salin Tautan...`);
					await this.engine.navigateAndStabilize(profilePostUrl);
					postUrl = await this.getPostUrlFromClipboard("");
				}
			}

			if (postUrl) {
				postUrl = this.cleanPostUrl(postUrl);
			}

			if (!postUrl) {
				this.logger.method("SKIP", "feed.postUrl.persistable", "link tidak didapat; viral share akan memakai halaman aktif bila tersedia");
			}
			return { success: true, postUrl };
		} catch (err) {
			this.logger.error("Gagal posting ke Feed", err);
			throw err;
		}
	}

	async getPostUrlFromClipboard(oldFirstPostText = "") {
		try {
			this.logger.method("TRY", "feed.postUrl.copyLink", "metode=share-menu-copy-link");
			
			// SISTEM PELOTOT (Active Polling): Menunggu Facebook menyuntikkan postingan baru
			if (oldFirstPostText) {
				this.logger.info("Sistem Pelotot aktif: Menunggu postingan baru muncul di feed...");
				let waitCount = 0;
				while (waitCount < 150) { // Maks 15 detik (150 * 100ms)
					let currentText = await this.page.getByRole('article').filter({ visible: true }).first().innerText().catch(() => "");
					// Jika teks artikel pertama sudah berbeda dengan teks sebelum kita ngepost, 
					// artinya postingan baru sudah sukses dirender!
					if (currentText && currentText !== oldFirstPostText) {
						this.logger.success("Postingan baru terdeteksi secara instan!");
						break; 
					}
					await this.engine.delay(100);
					waitCount++;
				}
			} else {
				// Fallback statis jika konteks text tidak tersedia (hanya saat navigasi manual)
				this.logger.info("Menunggu feed me-refresh...");
				await this.engine.delay(4000);
			}

			// Kita fokus mencari tombol Share di postingan pertama (postingan yang baru saja dikirim)
			// Menggunakan getByRole untuk memastikan yang diklik adalah tombol murni, BUKAN foto atau kontainer
			const firstArticle = this.page.getByRole('article').filter({ visible: true }).first();

			let shareBtn = firstArticle
				.getByRole('button', { name: /^(Share|Bagikan|Send this to friends.*|Kirim ini ke teman.*|Kirimkan ini ke teman.*)$/i })
				.filter({ visible: true })
				.first();

			// Fallback jika tidak ketemu di dalam article pertama (misal struktur FB berubah)
			if (!await shareBtn.isVisible().catch(() => false)) {
				shareBtn = this.page
					.getByRole('button', { name: /^(Share|Bagikan|Send this to friends.*|Kirim ini ke teman.*|Kirimkan ini ke teman.*)$/i })
					.filter({ visible: true })
					.first();
			}

			// Active Waiting: Tunggu sampai internet selesai merender post baru (Maks 15 detik)
			let waitCount = 0;
			this.logger.info("Menunggu postingan baru muncul di layar (tergantung koneksi)...");
			while (!await shareBtn.isVisible().catch(() => false) && waitCount < 15) {
				await this.engine.delay(1000);
				waitCount++;
				if (waitCount === 8) {
					// Pastikan modal composer benar-benar sudah tertutup sebelum melakukan reload
					const isDialogVisible = (await this.page.locator('div[role="dialog"]').filter({ visible: true }).count().catch(() => 0)) > 0;
					if (!isDialogVisible) {
						this.logger.warn("Postingan baru belum muncul setelah 8 detik. Facebook mungkin nge-bug, mencoba refresh paksa (F5)...");
						await this.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
						await this.engine.delay(4000);
						
						// Re-evaluate the fallback locator after reload
						const newFirstArticle = this.page.getByRole('article').filter({ visible: true }).first();
						shareBtn = newFirstArticle
							.getByRole('button', { name: /^(Share|Bagikan|Send this to friends.*|Kirim ini ke teman.*|Kirimkan ini ke teman.*)$/i })
							.filter({ visible: true })
							.first();
					}
				}
			}

			if (!await shareBtn.isVisible().catch(() => false)) {
				// Scroll beberapa kali ke bawah karena Facebook mungkin belum me-render tombol Share di DOM jika layar sempit
				for (let i = 0; i < 5; i++) {
					await this.page.evaluate(() => window.scrollBy(0, 500));
					await this.engine.delay(600);
					if (await shareBtn.isVisible().catch(() => false)) {
						break;
					}
				}
			}

			if (!await shareBtn.isVisible().catch(() => false)) {
				// DEBUG Ekstrim: Rekam semua link postingan di seluruh halaman
				this.logger.warn("Share button MASIH tidak terdeteksi setelah direfresh. Mengambil snapshot seluruh link di halaman...");
				const debugHtml = await this.page.evaluate(() => {
					const links = Array.from(document.body.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="fbid="]')).slice(0, 10);
					return links.map(a => `Teks: "${a.innerText.trim()}" | Link: ${a.href}`).join("\n");
				});
				this.logger.info("SNAPSHOT 10 LINK POSTINGAN PERTAMA:\n" + (debugHtml || "KOSONG. Tidak ada link post sama sekali di halaman."));

				// Coba ambil dari timestamp link (Cara Paling Ampuh & Anti Gagal - SCAN SELURUH BODY)
				this.logger.info("Mencoba jalur darurat: scan seluruh halaman untuk link timestamp (Baru Saja/Just Now)...");
				const permalink = await this.page.evaluate(() => {
					const links = Array.from(document.body.querySelectorAll('a'));
					
					// Filter ketat: Harus link postingan/foto, BUKAN Messenger/Notifikasi/Teman
					const validPostLinks = links.filter(a => {
						const href = a.href || "";
						if (!href.startsWith("http")) return false;
						if (href.includes("/messages/") || href.includes("/notifications/") || href.includes("/friends/")) return false;
						return href.includes("/posts/") || href.includes("/permalink/") || href.includes("fbid=") || href.includes("/photo") || href.includes("/share/p/");
					});

					for (const a of validPostLinks) {
						const text = (a.innerText || "").toLowerCase().trim();
						// Pencocokan ketat untuk kata kunci waktu (hindari jebakan teks lain)
						if (
							text === "just now" || 
							text === "baru saja" || 
							/^\d+\s*(m|mnt|detik|menit|h|jam)$/i.test(text)
						) {
							return a.href;
						}
					}
					
					// Kalau tetap gagal, kembalikan link postingan pertama yang paling relevan
					const firstPostLink = validPostLinks.find(a => 
						a.href.includes("/posts/") || a.href.includes("/permalink/") || a.href.includes("/share/p/")
					);
					if (firstPostLink) return "FALLBACK_FIRST_LINK|" + firstPostLink.href;
					
					return null;
				});

				if (permalink && permalink.startsWith("http")) {
					this.logger.method("SUCCESS", "feed.postUrl.timestampFallback");
					this.logger.info("Jalur darurat berhasil: Link didapat dari teks waktu!");
					return permalink;
				} else if (permalink && permalink.startsWith("FALLBACK_FIRST_LINK|")) {
					const actualLink = permalink.split("|")[1];
					this.logger.method("SUCCESS", "feed.postUrl.firstLinkFallback");
					this.logger.info("Jalur darurat buta berhasil: Mengambil sembarang link post teratas.");
					return actualLink;
				}

				this.logger.method("FAIL", "feed.postUrl.shareButton");
				this.logger.warn("Benar-benar tidak ada link yang bisa diambil.");
				return null;
			}

			if (await shareBtn.isVisible()) {
				this.logger.method("SUCCESS", "feed.postUrl.shareButton");
				this.logger.info("Membuka menu Bagikan untuk mengambil link...");
				await shareBtn.click({ force: true }).catch(() => {});

				const dialog = this.page.locator('div[role="dialog"], div[role="menu"]').filter({ visible: true }).last();
				
				let copyLinkBtn = dialog.locator('[aria-label="Salin tautan" i], [aria-label="Copy link" i], [role="listitem"]:has-text("Salin tautan"), [role="listitem"]:has-text("Copy link")').first();
				
				if (!await copyLinkBtn.isVisible().catch(() => false)) {
					copyLinkBtn = dialog.locator('div[role="button"], div[role="menuitem"], span')
						.filter({
							hasText: new RegExp(SELECTORS.COPY_LINK_BTN.join("|"), "i"),
						})
						.first();
				}

				if (await copyLinkBtn.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) {
					this.logger.method("SUCCESS", "feed.postUrl.copyLinkButton");
					this.logger.info("Mengklik opsi Salin Tautan...");
					await copyLinkBtn.click({ force: true }).catch(() => {});
					await this.engine.delay(300, 500); // Jeda singkat proses clipboard

					const copiedText = await this.page.evaluate(async () => {
						try {
							return await navigator.clipboard.readText();
						} catch (e) {
							return null;
						}
					});

					if (copiedText && copiedText.startsWith("http")) {
						this.logger.method("SUCCESS", "feed.postUrl.copyLink", `url=${copiedText}`);
						this.logger.success(`Berhasil mendapatkan link postingan dari clipboard: ${copiedText}`);
						return copiedText;
					} else {
						this.logger.method("FAIL", "feed.postUrl.copyLink", "clipboard bukan URL");
						this.logger.warn(`Clipboard berisi teks tidak valid: "${copiedText || ''}"`);
					}
				} else {
					this.logger.method("FAIL", "feed.postUrl.copyLinkButton");
					this.logger.warn("Opsi Salin Tautan tidak ditemukan di menu.");
					await this.page.keyboard.press("Escape").catch(() => {});
				}
				await this.engine.delay(800);
			} else {
				this.logger.method("FAIL", "feed.postUrl.shareButton");
				this.logger.warn("Tombol Bagikan tidak ditemukan untuk mengambil link.");
			}
		} catch (extractError) {
			this.logger.method("FAIL", "feed.postUrl.copyLink", extractError.message);
			this.logger.error("Error saat mencoba mengambil link postingan dari clipboard", extractError);
			await this.page.keyboard.press("Escape").catch(() => {});
		}
		return null;
	}



	cleanPostUrl(urlStr) {
		if (!urlStr) return null;
		try {
			const url = new URL(urlStr);
			const cleanParams = new URLSearchParams();
			if (url.pathname.includes("permalink.php")) {
				const fbid = url.searchParams.get("story_fbid");
				const id = url.searchParams.get("id");
				if (fbid) cleanParams.set("story_fbid", fbid);
				if (id) cleanParams.set("id", id);
				url.search = cleanParams.toString();
			} else {
				url.search = "";
			}
			return url.toString();
		} catch (e) {
			return urlStr;
		}
	}

	async uploadMedia(photos) {
		this.logger.info(
			`Mengunggah ${photos.length} foto ke Feed secara silent...`,
		);
		const absolutePaths = this.engine.resolvePhotoPaths(photos);

		if (absolutePaths.length === 0) {
			this.logger.warn("Tidak ada foto valid untuk diunggah.");
			return;
		}

		const fileInput = this.page
			.locator('div[role="dialog"] input[type="file"]')
			.first();
		this.logger.method("TRY", "feed.media.inputFiles", `count=${absolutePaths.length}`);
		await fileInput.setInputFiles(absolutePaths);
		this.logger.method("SUCCESS", "feed.media.inputFiles", `count=${absolutePaths.length}`);
		this.logger.info("File berhasil disuntikkan ke input.");

		// Karena kita sekarang sudah pakai Sistem Pelotot (100ms polling) pada tombol Post, 
		// kita tidak perlu lagi menebak-nebak dan menunggu elemen preview (yang sering bikin delay 5 detik).
		await this.engine.delay(300);
	}

	async _pasteDescriptionToComposer(composerDialog, text) {
		let textBox = composerDialog
			.locator('div[role="textbox"]')
			.first();
		
		this.logger.method("TRY", "feed.composer.textbox", "selector=dialog-lexical-parallel");
		if (await textBox.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)) {
			let textLength = 0;
			let pasteAttempts = 0;

			while (textLength === 0 && pasteAttempts < 3) {
				// Target inner <p> if it exists (Lexical structure)
				const innerP = textBox.locator('p').first();
				if (await innerP.isVisible().catch(() => false)) {
					await innerP.click({ force: true }).catch(() => {});
				} else {
					await textBox.click({ force: true }).catch(() => {});
				}
				await textBox.focus().catch(() => {});

				// Tembakkan native DOM Paste Event
				await textBox.evaluate((el, txt) => {
					const dataTransfer = new DataTransfer();
					dataTransfer.setData('text/plain', txt);
					const pasteEvent = new ClipboardEvent('paste', {
						clipboardData: dataTransfer,
						bubbles: true,
						cancelable: true,
					});
					el.dispatchEvent(pasteEvent);
				}, text).catch(() => {});
				
				await this.engine.delay(300);
				textLength = await textBox.evaluate((el) => (el.innerText || "").trim().length).catch(() => 0);

				if (textLength === 0) {
					this.logger.warn(`Paste attempt ${pasteAttempts + 1} gagal, mencoba fallback keyboard.insertText...`);
					await this.page.keyboard.insertText(text);
					await this.engine.delay(300);
					textLength = await textBox.evaluate((el) => (el.innerText || "").trim().length).catch(() => 0);
				}

				pasteAttempts++;
			}

			if (textLength > 0) {
				this.logger.method("SUCCESS", "feed.composer.textbox", "method=parallel-copy-paste-robust");
			} else {
				this.logger.method("FAIL", "feed.composer.textbox", "Gagal mengisi deskripsi setelah 3 percobaan");
			}
		} else {
			this.logger.method("FAIL", "feed.composer.textbox", "dialog textbox tidak terlihat");
		}
	}
}

module.exports = FeedService;
