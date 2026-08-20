require("dotenv").config();
const path = require("node:path");
const fs = require("fs-extra");
const Database = require("better-sqlite3");
const axios = require("axios");
const BrowserManager = require("../src/core/browserManager");
const Logger = require("../src/utils/logger");

// Lokasi database dan file riwayat lama
const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const HISTORY_FILE = path.join(__dirname, "../data/groq_agent_history.json");
const REPLY_HISTORY_FILE = path.join(__dirname, "../data/groq_reply_history.json");

const logger = new Logger("GROQ-AI-AGENT");

// Parsing parameter baris perintah
const args = process.argv.slice(2);
const accountIdArg = args.find((arg) => arg.startsWith("--accountId="));
const ACCOUNT_ID = accountIdArg ? accountIdArg.split("=")[1] : null; // null berarti otomatis semua akun aktif

const limitArg = args.find((arg) => arg.startsWith("--limit="));
const ACTION_LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 5; // default 5 aksi

const urlArg = args.find((arg) => arg.startsWith("--url="));
const TARGET_URL = urlArg ? urlArg.split("=")[1] : null;

const headless = process.env.HEADLESS === "true" || args.includes("--headless");

async function askGroq(postText, authorName, memoryNotes) {
	const apiKey = process.env.GROQ_API_KEY;
	if (!apiKey) {
		logger.error("GROQ_API_KEY tidak ditemukan di .env");
		return null;
	}

	const model = process.env.GROQ_MODEL_LIGHT || "llama-3.3-70b-versatile";
	let systemPrompt = `Kamu adalah AI Agent asisten robot Facebook yang bertugas menyaring feed media sosial. Kamu harus bertindak sebagai pengguna nyata dari Indonesia.
Tugasmu adalah menganalisis kiriman (post) dari feed Facebook dan memutuskan tindakan:
1. Menyukai (should_like): true jika konten positif, netral, informatif, menghibur, atau menarik. false jika negatif, spam, provokatif, atau SARA.
2. Memberi komentar (should_comment): true jika kiriman menarik untuk dikomentari secara natural (misal ucapan selamat, dukungan, info bermanfaat, pertanyaan santai, atau apresiasi). false jika kiriman tidak penting, spam, jualan keras (hard selling), atau bersifat pribadi sekali.
3. Menulis teks komentar (comment_text): Tulis komentar pendek (maksimal 12 kata), santai, sopan, relevan dengan isi kiriman, dalam bahasa Indonesia yang natural (tanpa emoji, tanpa hashtag).
4. Pembaruan Memori (updated_memory): Buat deskripsi profil singkat yang diperbarui tentang penulis postingan berdasarkan postingan ini (maksimal 15 kata, dalam Bahasa Indonesia, tanpa emoji). Ceritakan apa minatnya atau apa yang dia lakukan.

Kembangkan memori ini dengan baik agar kita bisa mengenali profil penulis secara berkesinambungan di kemudian hari.

Keluarkan output dalam format JSON murni seperti ini:
{
  "should_like": true/false,
  "should_comment": true/false,
  "comment_text": "isi komentar jika should_comment true, jika false kosongkan saja",
  "reason": "alasan singkat keputusanmu",
  "updated_memory": "deskripsi singkat penulis untuk memori agen"
}`;

	if (memoryNotes) {
		systemPrompt += `\n\nKamu memiliki memori/catatan masa lalu tentang penulis postingan ini: "${memoryNotes}". Gunakan informasi ini jika membantu memberikan respon/komentar yang lebih relevan dan ramah. Jika ada informasi baru di postingan ini, gabungkan informasi tersebut ke dalam "updated_memory" yang baru.`;
	}

	const userPrompt = `Penulis: ${authorName}\nIsi Kiriman: "${postText}"`;

	try {
		const response = await axios.post(
			"https://api.groq.com/openai/v1/chat/completions",
			{
				model: model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt }
				],
				temperature: 0.5,
				response_format: { type: "json_object" }
			},
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json"
				}
			}
		);

		return JSON.parse(response.data.choices[0].message.content);
	} catch (e) {
		logger.error(`Gagal memanggil Groq API untuk postingan dari ${authorName}`, e);
		return null;
	}
}

async function askGroqForReply(postText, commentText, commentAuthor, memoryNotes) {
	const apiKey = process.env.GROQ_API_KEY;
	if (!apiKey) {
		logger.error("GROQ_API_KEY tidak ditemukan di .env");
		return null;
	}

	const model = process.env.GROQ_MODEL_LIGHT || "llama-3.3-70b-versatile";
	let systemPrompt = `Kamu adalah AI Agent asisten robot Facebook yang bertugas membalas komentar kiriman media sosial. Kamu harus bertindak sebagai pengguna nyata dari Indonesia.
Tugasmu adalah menganalisis sebuah komentar di bawah postingan Facebook dan memutuskan tindakan:
1. Membalas komentar (should_reply): true jika komentar tersebut positif, ramah, mendukung, bertanya hal relevan, atau berupa apresiasi yang pantas dibalas secara santai dan sopan. false jika komentar berupa spam, jualan, link promosi, kata-kata kasar, ujaran kebencian, atau tidak penting.
2. Menulis teks balasan (reply_text): Tulis balasan pendek (maksimal 12 kata), santai, sopan, relevan dengan komentar dan kiriman utama, dalam bahasa Indonesia yang natural (tanpa emoji, tanpa hashtag).
3. Pembaruan Memori (updated_memory): Buat deskripsi profil singkat yang diperbarui tentang komentator berdasarkan komentar ini (maksimal 15 kata, dalam Bahasa Indonesia, tanpa emoji).

Keluarkan output dalam format JSON murni seperti ini:
{
  "should_reply": true/false,
  "reply_text": "isi balasan jika should_reply true, jika false kosongkan saja",
  "reason": "alasan singkat keputusanmu",
  "updated_memory": "deskripsi singkat komentator untuk memori agen"
}`;

	if (memoryNotes) {
		systemPrompt += `\n\nKamu memiliki memori/catatan masa lalu tentang komentator ini: "${memoryNotes}". Gunakan informasi ini jika membantu memberikan respon/balasan yang lebih relevan dan ramah. Jika ada informasi baru di komentar ini, gabungkan informasi tersebut ke dalam "updated_memory" yang baru.`;
	}

	const userPrompt = `Kiriman Utama: "${postText}"\nKomentar dari ${commentAuthor}: "${commentText}"`;

	try {
		const response = await axios.post(
			"https://api.groq.com/openai/v1/chat/completions",
			{
				model: model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt }
				],
				temperature: 0.5,
				response_format: { type: "json_object" }
			},
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json"
				}
			}
		);

		return JSON.parse(response.data.choices[0].message.content);
	} catch (e) {
		logger.error(`Gagal memanggil Groq API untuk balasan komentar dari ${commentAuthor}`, e);
		return null;
	}
}

async function humanType(page, element, text) {
	await element.focus();
	await page.waitForTimeout(200 + Math.random() * 500);
	for (const char of text) {
		await page.keyboard.type(char);
		await page.waitForTimeout(50 + Math.random() * 100); // 50-150ms per karakter
	}
	await page.waitForTimeout(200 + Math.random() * 500);
}

async function run() {
	logger.info("Memulai AI Agent Robot Facebook...");

	// 1. Inisialisasi Database SQLite
	if (!fs.existsSync(DB_PATH)) {
		logger.error(`Database SQLite tidak ditemukan di: ${DB_PATH}`);
		process.exit(1);
	}

	const db = new Database(DB_PATH);

	// Buat tabel-tabel baru jika belum ada
	db.prepare(`
		CREATE TABLE IF NOT EXISTS agent_interactions (
			post_key TEXT PRIMARY KEY,
			author TEXT,
			post_text TEXT,
			should_like INTEGER,
			should_comment INTEGER,
			comment_text TEXT,
			reason TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).run();

	db.prepare(`
		CREATE TABLE IF NOT EXISTS agent_replies (
			reply_key TEXT PRIMARY KEY,
			post_key TEXT,
			comment_author TEXT,
			comment_text TEXT,
			should_reply INTEGER,
			reply_text TEXT,
			reason TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(post_key) REFERENCES agent_interactions(post_key)
		)
	`).run();

	db.prepare(`
		CREATE TABLE IF NOT EXISTS user_memories (
			username TEXT PRIMARY KEY,
			notes TEXT,
			interaction_count INTEGER DEFAULT 1,
			last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).run();

	// Definisi fungsi helper database
	const isPostProcessed = (key) => {
		const row = db.prepare("SELECT 1 FROM agent_interactions WHERE post_key = ?").get(key);
		return !!row;
	};

	const isReplyProcessed = (key) => {
		const row = db.prepare("SELECT 1 FROM agent_replies WHERE reply_key = ?").get(key);
		return !!row;
	};

	const getUserMemory = (username) => {
		const row = db.prepare("SELECT notes FROM user_memories WHERE username = ?").get(username);
		return row ? row.notes : null;
	};

	const saveOrUpdateMemory = (username, newNotes) => {
		if (!newNotes || newNotes.trim().length === 0) return;
		const existing = db.prepare("SELECT interaction_count FROM user_memories WHERE username = ?").get(username);
		if (existing) {
			db.prepare(`
				UPDATE user_memories 
				SET notes = ?, interaction_count = interaction_count + 1, last_interaction = CURRENT_TIMESTAMP 
				WHERE username = ?
			`).run(newNotes, username);
		} else {
			db.prepare(`
				INSERT INTO user_memories (username, notes, interaction_count) 
				VALUES (?, ?, 1)
			`).run(username, newNotes);
		}
	};

	const savePostInteraction = (key, author, postText, shouldLike, shouldComment, commentText, reason) => {
		db.prepare(`
			INSERT OR REPLACE INTO agent_interactions (post_key, author, post_text, should_like, should_comment, comment_text, reason)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(key, author, postText, shouldLike ? 1 : 0, shouldComment ? 1 : 0, commentText || "", reason || "");
	};

	const saveCommentReply = (key, postKey, author, commentText, shouldReply, replyText, reason) => {
		db.prepare(`
			INSERT OR REPLACE INTO agent_replies (reply_key, post_key, comment_author, comment_text, should_reply, reply_text, reason)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(key, postKey, author, commentText, shouldReply ? 1 : 0, replyText || "", reason || "");
	};

	// 2. Jalankan migrasi riwayat dari JSON lama ke SQLite
	if (fs.existsSync(HISTORY_FILE)) {
		try {
			const oldHistory = fs.readJsonSync(HISTORY_FILE);
			logger.info(`Menemukan riwayat postingan lama. Memulai migrasi ${oldHistory.length} data ke SQLite...`);
			const insertPost = db.prepare(`
				INSERT OR IGNORE INTO agent_interactions (post_key, author, post_text, should_like, should_comment, comment_text, reason)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);
			
			db.transaction((historyArray) => {
				for (const key of historyArray) {
					const parts = key.split("_");
					const author = parts[0] || "Pengguna Facebook";
					const text = parts.slice(1).join("_") || "";
					insertPost.run(key, author, text, 0, 0, "", "Migrasi dari JSON");
				}
			})(oldHistory);

			fs.moveSync(HISTORY_FILE, `${HISTORY_FILE}.bak`, { overwrite: true });
			logger.success("Migrasi riwayat postingan selesai. File JSON diarsipkan.");
		} catch (err) {
			logger.warn("Gagal memigrasi riwayat postingan lama:", err.message);
		}
	}

	if (fs.existsSync(REPLY_HISTORY_FILE)) {
		try {
			const oldReplyHistory = fs.readJsonSync(REPLY_HISTORY_FILE);
			logger.info(`Menemukan riwayat balasan lama. Memulai migrasi ${oldReplyHistory.length} data ke SQLite...`);
			const insertReply = db.prepare(`
				INSERT OR IGNORE INTO agent_replies (reply_key, post_key, comment_author, comment_text, should_reply, reply_text, reason)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);

			db.transaction((replyArray) => {
				for (const key of replyArray) {
					const parts = key.split("_");
					const author = parts[0] || "Pengguna Facebook";
					const text = parts.slice(1).join("_") || "";
					insertReply.run(key, null, author, text, 0, "", "Migrasi dari JSON");
				}
			})(oldReplyHistory);

			fs.moveSync(REPLY_HISTORY_FILE, `${REPLY_HISTORY_FILE}.bak`, { overwrite: true });
			logger.success("Migrasi riwayat balasan selesai. File JSON diarsipkan.");
		} catch (err) {
			logger.warn("Gagal memigrasi riwayat balasan lama:", err.message);
		}
	}

	let accountsToProcess = [];
	if (ACCOUNT_ID) {
		const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(ACCOUNT_ID);
		if (account) accountsToProcess.push(account);
	} else {
		accountsToProcess = db.prepare("SELECT * FROM accounts WHERE isActive = 1 AND linked = 1").all();
	}

	if (accountsToProcess.length === 0) {
		logger.error(ACCOUNT_ID ? `Akun dengan ID "${ACCOUNT_ID}" tidak ditemukan di database.` : "Tidak ada akun aktif yang terhubung di database.");
		db.close();
		process.exit(1);
	}

	logger.info(`Akan memproses ${accountsToProcess.length} akun secara bergantian.`);

	for (let i = 0; i < accountsToProcess.length; i++) {
		const account = accountsToProcess[i];
		const fbName = account.fbName || account.name;
		const profileDirName = account.profile;
		const userDataDir = path.isAbsolute(profileDirName)
			? profileDirName
			: path.join(process.cwd(), profileDirName);

		logger.info(`\n======================================================`);
		logger.info(`[${i + 1}/${accountsToProcess.length}] Menggunakan Akun: ${fbName} (${account.id})`);
		logger.info(`Profile Directory: ${userDataDir}`);

		// 3. Inisialisasi Browser
		const manager = new BrowserManager({
			accountName: fbName,
			userDataDir: userDataDir
		});

		let page;
		try {
			page = await manager.init({ headless: headless });
		} catch (err) {
			logger.error(`Gagal meluncurkan browser untuk akun ${fbName}. Melewati ke akun berikutnya...`, err);
			continue;
		}

		try {
			if (TARGET_URL) {
			logger.info(`Membuka URL target: ${TARGET_URL}`);
			await page.goto(TARGET_URL, {
				waitUntil: "domcontentloaded",
				timeout: 60000
			});
		} else {
			logger.info("Membuka beranda Facebook...");
			await page.goto("https://web.facebook.com/", {
				waitUntil: "domcontentloaded",
				timeout: 60000
			});
		}

		// Tunggu login terverifikasi
		logger.info("Memverifikasi status login...");
		const loginStatus = await manager.waitForLogin(15000);
		if (!loginStatus.success) {
			logger.warn("Status login tidak terdeteksi langsung. Menunggu 5 detik tambahan...");
			await page.waitForTimeout(5000);
		}

		if (TARGET_URL) {
			logger.info("Menunggu halaman target stabil...");
			await page.waitForTimeout(5000);
			// Scroll ke bawah untuk meload komentar
			const dialog = page.locator('div[aria-modal="true"][role="dialog"]').filter({ visible: true }).first();
			const hasDialog = await dialog.isVisible();
			if (hasDialog) {
				logger.info("Melakukan scrolling pada modal dialog...");
				await page.evaluate(() => {
					const dialogScrollable = document.querySelector('div[aria-modal="true"][role="dialog"] div[style*="overflow-y"]') || 
					                         document.querySelector('div[aria-modal="true"][role="dialog"] [style*="overflow"]');
					if (dialogScrollable) {
						dialogScrollable.scrollTop = 1000;
					} else {
						window.scrollTo(0, 1000);
					}
				});
			} else {
				await page.evaluate(() => window.scrollTo(0, 1000));
			}
			await page.waitForTimeout(4000);
		}

		let actionCount = 0;
		let scannedPostsCount = 0;
		let scrollAttempts = 0;
		const maxScrolls = 30;

		logger.info("Mulai melakukan scanning feed...");

		while (actionCount < ACTION_LIMIT && scannedPostsCount < 20 && scrollAttempts < maxScrolls) {
			if (TARGET_URL) {
				if (scrollAttempts > 0) break;
				scrollAttempts++;
			} else {
				// Scroll ke bawah sedikit untuk memicu loading feed item baru
				await page.evaluate(() => window.scrollBy(0, 500));
				await page.waitForTimeout(1700 + Math.random() * 1000);
				scrollAttempts++;
			}

			// Ekstraksi postingan yang terlihat
			const posts = await page.evaluate(() => {
				const items = [];
				const modal = document.querySelector('div[aria-modal="true"][role="dialog"]');
				const scope = modal || document;
				
				// Cari tombol Suka / Like sebagai penanda adanya post
				const likeBtns = scope.querySelectorAll('[aria-label="Suka"], [aria-label="Like"]');
				const processedCards = new Set();

				likeBtns.forEach((btn) => {
					let card = null;
					let parent = btn.parentElement;
					// Cari container induk yang menampung post
					for (let i = 0; i < 50; i++) {
						if (!parent) break;
						if (parent.getAttribute('role') === 'article' || parent.getAttribute('aria-posinset')) {
							card = parent;
							break;
						}
						parent = parent.parentElement;
					}

					// Fallback
					if (!card) {
						parent = btn.parentElement;
						for (let i = 0; i < 50; i++) {
							if (!parent) break;
							const hasComment = parent.querySelector('[aria-label="Beri komentar"], [aria-label="Comment"]');
							if (hasComment && parent.innerText.length > 50) {
								card = parent;
							}
							parent = parent.parentElement;
						}
					}

					if (card && !processedCards.has(card)) {
						processedCards.add(card);

						let author = "Pengguna Facebook";
						const authorAnchor = card.querySelector('h3 a, h4 a, strong a, a[role="link"] h2, h2 a, h3, h4');
						if (authorAnchor && authorAnchor.innerText.trim()) {
							author = authorAnchor.innerText.trim();
						} else {
							const boldEl = card.querySelector('strong, b');
							if (boldEl && boldEl.innerText.trim()) {
								author = boldEl.innerText.trim();
							}
						}

						let postText = "";
						const msgEl = card.querySelector('div[data-ad-comet-preview="message"]');
						if (msgEl && msgEl.innerText.trim()) {
							postText = msgEl.innerText.trim();
						} else {
							const textDivs = Array.from(card.querySelectorAll('div[dir="auto"]')).filter(el => {
								const txt = el.innerText.trim();
								return txt.length > 15 && txt !== author && !txt.includes('Suka') && !txt.includes('Komentar');
							});
							if (textDivs.length > 0) {
								postText = textDivs[0].innerText.trim();
							} else {
								postText = card.innerText.trim().replace(/\\n/g, " ").substring(0, 150);
							}
						}

						if (postText && !postText.includes("Memuat...") && !postText.includes("Loading...")) {
							items.push({
								index: items.length,
								author,
								text: postText
							});
						}
					}
				});
				return items;
			});

			logger.info(`Menemukan ${posts.length} postingan di layar saat ini.`);

			for (const post of posts) {
				if (actionCount >= ACTION_LIMIT) break;
				if (scannedPostsCount >= 20) break;

				// Generate unique key untuk post
				const postKey = `${post.author}_${post.text.substring(0, 50)}`;

				// Skip jika sudah pernah diproses sebelumnya
				if (isPostProcessed(postKey) && !TARGET_URL) {
					continue;
				}

				scannedPostsCount++;
				logger.info(`[SCANNING] Memproses kiriman ke-${scannedPostsCount}/20...`);

				logger.info(`----------------------------------------`);
				logger.info(`Menganalisis kiriman dari: ${post.author}`);
				logger.info(`Isi: "${post.text.substring(0, 100)}${post.text.length > 100 ? "..." : ""}"`);

				// Dapatkan catatan memori penulis (jika ada)
				const memoryNotes = getUserMemory(post.author);
				if (memoryNotes) {
					logger.info(`[MEMORY FOUND] Memori tentang ${post.author}: "${memoryNotes}"`);
				}

				// Dapatkan keputusan AI dari Groq
				const decision = await askGroq(post.text, post.author, memoryNotes);
				if (!decision) {
					logger.warn("Gagal mendapatkan analisis Groq. Melewati postingan ini.");
					continue;
				}

				if (TARGET_URL) {
					decision.should_like = true;
					decision.should_comment = true;
					decision.comment_text = `Up, robot proof ${Date.now()}`;
					decision.reason = "Pengujian terarah TARGET_URL";
					decision.updated_memory = "Pengguna pengujian sistem robot Facebook";
				}

				logger.info(`[ANALISIS AI] Keputusan: Like=${decision.should_like}, Comment=${decision.should_comment}. Alasan: ${decision.reason}`);

				// Cari kontainer kartu postingan di Playwright berdasarkan kecocokan teks
				const initialDialogForLoc = page.locator('div[aria-modal="true"][role="dialog"]').filter({ visible: true }).first();
				const hasInitialDialogForLoc = await initialDialogForLoc.isVisible();
				const searchContainer = hasInitialDialogForLoc ? initialDialogForLoc : page;
				
				const msgTextPrefix = post.text.length > 30 ? post.text.substring(0, 30) : post.text;
				const messageLoc = searchContainer.locator('div[dir="auto"], span[dir="auto"]').filter({ hasText: msgTextPrefix }).last();
				let cardLoc = messageLoc;
				let foundCard = false;
				
				// Fallback jika tidak ketemu
				if (await cardLoc.count() === 0) {
					cardLoc = searchContainer.locator('div[role="article"]').nth(post.index);
				}

				for (let i = 0; i < 45; i++) {
					const parent = cardLoc.locator('xpath=..');
					if (await parent.count() === 0) break;
					const likeBtn = parent.locator('[aria-label="Suka"], [aria-label="Like"]');
					if (await likeBtn.count() > 0) {
						cardLoc = parent;
						foundCard = true;
						break;
					}
					cardLoc = parent;
				}

				if (!foundCard) {
					logger.warn("Gagal memetakan kontainer kartu postingan di browser. Melewati.");
					continue;
				}

				let performedAction = false;

				// Deteksi scope interaksi: gunakan dialog jika aktif, atau cardLoc sebagai default
				const initialDialog = page.locator('div[aria-modal="true"][role="dialog"]').filter({ visible: true }).first();
				const hasInitialDialog = await initialDialog.isVisible();
				let activeScope = hasInitialDialog ? initialDialog : cardLoc;
				if (hasInitialDialog) {
					logger.info("Menggunakan scope modal dialog untuk interaksi.");
				}

				// 1. Eksekusi LIKE jika disetujui AI
				if (decision.should_like) {
					const likeBtn = activeScope.locator('[aria-label="Suka"], [aria-label="Like"]').first();
					if (await likeBtn.isVisible()) {
						logger.info("Melakukan Like...");
						await likeBtn.scrollIntoViewIfNeeded();
						await page.waitForTimeout(200 + Math.random() * 500);
						await likeBtn.click({ force: true });
						performedAction = true;
						logger.success("Berhasil Like!");
						await page.waitForTimeout(1200);
					} else {
						logger.warn("Tombol Like tidak terlihat.");
					}
				}

				// 2. Eksekusi COMMENT jika disetujui AI
				if (decision.should_comment && decision.comment_text) {
					const commentBtn = activeScope.locator('[aria-label="Beri komentar"], [aria-label="Comment"]').first();
					if (await commentBtn.isVisible()) {
						logger.info(`Menulis komentar: "${decision.comment_text}"`);
						await commentBtn.scrollIntoViewIfNeeded();
						await page.waitForTimeout(200 + Math.random() * 500);
						await commentBtn.click({ force: true });
						
						await page.waitForTimeout(1700);
						const postClickDialog = page.locator('div[aria-modal="true"][role="dialog"]').filter({ visible: true }).first();
						const hasPostClickDialog = await postClickDialog.isVisible();
						const commentScope = hasPostClickDialog ? postClickDialog : cardLoc;

						const commentBox = commentScope.locator('div[role="textbox"]').filter({ visible: true }).first();
						try {
							await commentBox.waitFor({ state: "visible", timeout: 15000 });
							await humanType(page, commentBox, decision.comment_text);
							await page.waitForTimeout(700);
							await page.keyboard.press("Enter");
							performedAction = true;
							logger.success("Berhasil mengirim komentar!");
							await page.waitForTimeout(4700);
						} catch (e) {
							logger.warn("Kotak input komentar tidak dapat ditemukan setelah menunggu.");
						}
					} else {
						logger.warn("Tombol komentar tidak terlihat.");
					}
				}

				// Catat ke database SQLite
				savePostInteraction(postKey, post.author, post.text, decision.should_like, decision.should_comment, decision.comment_text, decision.reason);

				// Update memori penulis jika ada
				if (decision.updated_memory) {
					saveOrUpdateMemory(post.author, decision.updated_memory);
					logger.info(`[MEMORY UPDATED] Memori ${post.author} diperbarui: "${decision.updated_memory}"`);
				}

				// 3. PROSES REPLY KOMENTAR (Comment on Comment)
				logger.info("Mencari komentar yang bisa dibalas di bawah postingan ini...");
				const comments = await page.evaluate((args) => {
					const items = [];
					let scopeElement = null;
					if (args.hasDialog) {
						scopeElement = document.querySelector('div[aria-modal="true"][role="dialog"]');
					} else {
						const messageDivs = document.querySelectorAll('div[data-ad-comet-preview="message"]');
						const targetMsg = messageDivs[args.postIndex];
						if (targetMsg) {
							let parent = targetMsg.parentElement;
							for (let i = 0; i < 50; i++) {
								if (!parent) break;
								const hasLike = parent.querySelector('[aria-label="Suka"], [aria-label="Like"]');
								if (hasLike) {
									scopeElement = parent;
									break;
								}
								parent = parent.parentElement;
							}
						}
					}
					
					if (!scopeElement) scopeElement = document.body;

					const replyButtons = Array.from(scopeElement.querySelectorAll('div[role="button"], span, a')).filter(el => {
						const txt = el.innerText.trim();
						return txt === 'Balas' || txt === 'Reply';
					});

					replyButtons.forEach((btn, index) => {
						let parent = btn.parentElement;
						let commentText = "";
						let authorName = "Pengguna Facebook";
						for (let i = 0; i < 8; i++) {
							if (!parent) break;
							const textSpans = Array.from(parent.querySelectorAll('span[dir="auto"], div[dir="auto"]'));
							const textSpan = textSpans.find(s => s !== btn && !s.closest('a[role="link"], strong, b'));
							if (textSpan && textSpan.innerText.trim().length > 0) {
								commentText = textSpan.innerText.trim();
								const authorEl = parent.querySelector('a[role="link"], strong, b');
								if (authorEl && authorEl.innerText.trim() && authorEl.innerText.trim() !== authorName) {
									authorName = authorEl.innerText.trim();
								}
								break;
							}
							parent = parent.parentElement;
						}

						if (commentText && commentText.length > 1) {
							items.push({
								index,
								author: authorName,
								text: commentText
							});
						}
					});
					return items;
				}, { hasDialog: hasInitialDialog || performedAction, postIndex: post.index });

				logger.info(`Menemukan ${comments.length} komentar di postingan ini.`);
				
				let replyCountThisPost = 0;
				for (const comment of comments) {
					if (replyCountThisPost >= 2) break; // Batasi maksimal 2 reply per kiriman untuk keamanan

					const replyKey = `${comment.author}_${comment.text.substring(0, 50)}`;
					if (isReplyProcessed(replyKey)) {
						continue;
					}

					logger.info(`Menganalisis komentar dari ${comment.author}: "${comment.text.substring(0, 50)}..."`);
					
					// Dapatkan catatan memori komentator (jika ada)
					const commentMemory = getUserMemory(comment.author);
					if (commentMemory) {
						logger.info(`[MEMORY FOUND] Memori tentang komentator ${comment.author}: "${commentMemory}"`);
					}

					let replyDecision = await askGroqForReply(post.text, comment.text, comment.author, commentMemory);
					if (TARGET_URL && replyDecision) {
						replyDecision.should_reply = true;
						replyDecision.reply_text = "Balasan otomatis sukses";
						replyDecision.reason = "Pengujian terarah TARGET_URL";
						replyDecision.updated_memory = "Teman terpercaya yang sering memberi feedback";
					}
					
					if (replyDecision && replyDecision.should_reply && replyDecision.reply_text) {
						logger.info(`[REACTION REPLY] Keputusan: REPLY. Teks: "${replyDecision.reply_text}". Alasan: ${replyDecision.reason}`);
						
						const currentScope = (await page.locator('div[aria-modal="true"][role="dialog"]').filter({ visible: true }).first().isVisible())
							? page.locator('div[aria-modal="true"][role="dialog"]').filter({ visible: true }).first()
							: cardLoc;
						
						const replyBtn = currentScope.locator('div[role="button"], span, a').filter({ hasText: /^(Reply|Balas)$/i }).nth(comment.index);
						
						if (await replyBtn.isVisible()) {
							await replyBtn.scrollIntoViewIfNeeded();
							await page.waitForTimeout(700);
							await replyBtn.click({ force: true });
							await page.waitForTimeout(1700);

							const activeReplyScope = (await page.locator('div[aria-modal="true"][role="dialog"]').filter({ visible: true }).first().isVisible())
								? page.locator('div[aria-modal="true"][role="dialog"]').filter({ visible: true }).first()
								: cardLoc;
							
							const replyBox = activeReplyScope.locator('div[role="textbox"]').filter({ visible: true }).first();
							if (await replyBox.isVisible()) {
								await humanType(page, replyBox, replyDecision.reply_text);
								await page.waitForTimeout(700);
								await page.keyboard.press("Enter");
								logger.success("Berhasil mengirim balasan komentar!");
								replyCountThisPost++;
								performedAction = true; // Tandai agar screenshot diambil
								
								// Simpan ke database SQLite
								saveCommentReply(replyKey, postKey, comment.author, comment.text, 1, replyDecision.reply_text, replyDecision.reason);
								
								// Update memori komentator
								if (replyDecision.updated_memory) {
									saveOrUpdateMemory(comment.author, replyDecision.updated_memory);
									logger.info(`[MEMORY UPDATED] Memori ${comment.author} diperbarui: "${replyDecision.updated_memory}"`);
								}
								
								await page.waitForTimeout(3700);
							} else {
								logger.warn("Kotak reply input tidak ditemukan.");
							}
						} else {
							logger.warn("Tombol Balas komentar tidak terlihat.");
						}
					} else {
						logger.info(`[REACTION REPLY] Keputusan: SKIP. Alasan: ${replyDecision ? replyDecision.reason : "API Error"}`);
						// Catat ke database SQLite
						saveCommentReply(replyKey, postKey, comment.author, comment.text, 0, "", replyDecision ? replyDecision.reason : "API Error");
						
						// Update memori komentator jika ada data pembaruan
						if (replyDecision && replyDecision.updated_memory) {
							saveOrUpdateMemory(comment.author, replyDecision.updated_memory);
						}
					}
				}

				if (performedAction) {
					actionCount++;
					logger.info(`Total Aksi Terlaksana: ${actionCount}/${ACTION_LIMIT}`);

					// Ambil screenshot bukti aksi
					logger.info("Mengambil screenshot bukti aksi...");
					await cardLoc.scrollIntoViewIfNeeded().catch(() => {});
					await page.waitForTimeout(1500);
					const proofFilename = `proof_headless_action_${actionCount}_${Date.now()}.png`;
					const proofPath = path.join(process.cwd(), "assets/debug", proofFilename);
					await fs.ensureDir(path.dirname(proofPath));
					await page.screenshot({ path: proofPath });
					logger.success(`Screenshot bukti aksi disimpan: ${proofPath}`);

					// Jeda antar postingan yang diinteraksi
					await page.waitForTimeout(4700 + Math.random() * 5000);
				} else {
					logger.info("Tidak ada aksi yang dilakukan pada postingan ini.");
				}
			}
		}

		logger.success(`Selesai! Berhasil mengeksekusi ${actionCount} aksi interaksi.`);

		// Ambil screenshot bukti sebelum menutup browser
		if (page) {
			logger.info("Mengambil screenshot bukti...");
			const proofPath = path.join(process.cwd(), `assets/debug/groq_agent_proof_${account.id}_${Date.now()}.png`);
			await fs.ensureDir(path.dirname(proofPath));
			await page.screenshot({ path: proofPath });
			logger.success(`Screenshot bukti disimpan di: ${proofPath}`);
		}

		} catch (error) {
			logger.error(`Terjadi error selama eksekusi AI Agent pada akun ${fbName}`, error);
		} finally {
			logger.info(`Menutup browser untuk akun ${fbName}...`);
			if (manager) {
				await manager.close();
			}
		}
	} // Akhir dari loop akun

	db.close();
	logger.success("Proses AI Agent selesai penuh untuk SEMUA akun.");
}

// Graceful Shutdown Handler
async function gracefulShutdown(signal) {
	logger.info(`Menerima sinyal ${signal}. Mengakhiri proses secara aman...`);
	process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

run();
