const fs = require("node:fs");
const path = require("node:path");
const BrowserManager = require("../src/core/browserManager");
const Logger = require("../src/utils/logger");
const DataService = require("../src/web/services/dataService");
const { SELECTORS } = require("../src/core/constants");
const {
	buildListingKey,
	evaluateListingEligibility,
	findBestListingMatch,
	isRenewVerified,
	isTooSimilar,
	normalizeTitle,
} = require("../src/services/sundulRules");
require("dotenv").config();

const logger = new Logger("SUNDUL");
const SELLING_URL = "https://www.facebook.com/marketplace/you/selling";
const OPTIONS_SELECTOR = '[aria-label*="Opsi"], [aria-label*="opsi"], [aria-label*="More"], [aria-label*="more"], [aria-label*="Lainnya"], [aria-label*="lainnya"], [aria-label*="Actions"], [aria-label*="Tindakan"], [aria-haspopup="menu"]';
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="button"], button';
const SUCCESS_TEXT = [
	"penawaran diperbarui",
	"berhasil diperbarui",
	"telah diperbarui",
	"listing diperbarui",
	"tawaran diperbarui",
	"listing renewed",
	"renewed successfully",
	"offer renewed",
	"item renewed",
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_MAX_ACTIONS = 20;
const VERIFY_RELOAD_DELAY_MS = Number(process.env.SUNDUL_VERIFY_RELOAD_DELAY_MS) || 1800;

function readTitlesFile(filePath) {
	try {
		const raw = fs.readFileSync(filePath, "utf8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error("Isi file judul harus berupa array JSON.");
		}
		return parsed
			.map((title) => String(title).trim())
			.filter(Boolean);
	} catch (error) {
		throw new Error(`Gagal membaca daftar judul sundul: ${error.message}`);
	} finally {
		try {
			fs.unlinkSync(filePath);
		} catch {
			// Best-effort cleanup; queue juga membersihkan file saat proses selesai.
		}
	}
}

function parseCliArgs(argv = process.argv.slice(2)) {
	const autoMode = argv.includes("--auto");
	const dryRun = argv.includes("--dry-run");
	const maxArg = argv.find((arg) => arg.startsWith("--max="));
	const parsedMax = maxArg ? Number(maxArg.slice("--max=".length)) : DEFAULT_MAX_ACTIONS;
	const maxActions = Number.isInteger(parsedMax) && parsedMax > 0
		? Math.min(parsedMax, 100)
		: DEFAULT_MAX_ACTIONS;
	const titlesFileArg = argv.find((arg) => arg.startsWith("--titles-file="));
	const titlesArg = argv.find((arg) => arg.startsWith("--titles="));
	const titles = titlesFileArg
		? readTitlesFile(titlesFileArg.slice("--titles-file=".length))
		: titlesArg
			? titlesArg
				.slice("--titles=".length)
				.split(",")
				.map((title) => title.trim())
				.filter(Boolean)
			: [];
	return { autoMode, dryRun, maxActions, titles };
}

async function getAccountsToProcess() {
	const profileDir = process.env.SUNDUL_PROFILE_DIR;
	if (profileDir && profileDir !== "ALL") {
		return [
			{
				id: process.env.SUNDUL_ACCOUNT_ID || normalizeTitle(process.env.SUNDUL_ACCOUNT_NAME || "bot"),
				name: process.env.SUNDUL_ACCOUNT_NAME || "Bot",
				profileDir,
			},
		];
	}

	const accounts = await DataService.getAccounts();
	return accounts
		.filter((account) => account.isActive && account.linked)
		.map((account) => ({
			id: account.id,
			name: account.fbName || account.name,
			profileDir: path.join(__dirname, "..", account.profile),
		}));
}

async function closeOverlays(page) {
	await delay(300);
	const closeSelectors = [
		'[aria-label="Close"]',
		'[aria-label="Tutup"]',
		'[aria-label="Tutup Detail"]',
		'[aria-label="Close Detail"]',
		'div[aria-label="Close"]',
		'div[aria-label="Tutup"]',
		'[role="dialog"] [aria-label*="Close"]',
		'[role="dialog"] [aria-label*="Tutup"]',
	];
	for (const selector of closeSelectors) {
		const buttons = await page.$$(selector).catch(() => []);
		for (const button of buttons) {
			if (await button.isVisible().catch(() => false)) {
				await button.click({ timeout: 1500 }).catch(() => {});
			}
		}
	}
	await page.keyboard.press("Escape").catch(() => {});
	await delay(300);
}

async function clickRenewButton(page, targetTitle) {
	return page.evaluate((title) => {
		const norm = (s) =>
			(s || "")
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, " ")
				.replace(/\s+/g, " ")
				.trim();

		const isClickable = (el) => {
			if (!el) return false;
			const rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		};

		const allButtons = Array.from(
			document.querySelectorAll('div[role="button"], button, a[role="button"], span[role="button"]'),
		);

		// Prioritas 1: Cari tombol biru dengan label persis "Renew Listing" / "Perbarui Tawaran" dsb
		for (const btn of allButtons) {
			const text = (btn.innerText || "").trim().toLowerCase();
			const aria = (btn.getAttribute("aria-label") || "").trim().toLowerCase();

			const isExactRenew =
				text === "renew listing" ||
				text === "perbarui listingan" ||
				text === "perbarui tawaran" ||
				text === "renew your listing" ||
				text === "perbarui" ||
				aria === "renew listing" ||
				aria === "perbarui listingan" ||
				aria === "perbarui tawaran" ||
				aria === "perbarui";

			if (isExactRenew && isClickable(btn)) {
				btn.scrollIntoView({ block: "center" });
				btn.click();
				return { clicked: true, text: text || aria, stage: "exact-button" };
			}
		}

		// Prioritas 2: Cari banner "Renew your listing?" di kartu produk atau modal
		for (const btn of allButtons) {
			const text = (btn.innerText || "").toLowerCase();
			if (
				(text.includes("renew your listing") ||
					text.includes("perbarui tawaran") ||
					text.includes("perbarui listingan")) &&
				!text.includes("mark as sold") &&
				!text.includes("tandai sebagai")
			) {
				const actionBtn = btn.querySelector('div[role="button"], button, a') || btn;
				if (isClickable(actionBtn)) {
					actionBtn.scrollIntoView({ block: "center" });
					actionBtn.click();
					return { clicked: true, text: "banner-action", stage: "banner" };
				}
			}
		}

		return { clicked: false };
	}, normalizeTitle(targetTitle));
}

async function detectRestriction(page) {
	return page.evaluate((indicators) => {
		const containers = [
			...document.querySelectorAll('[role="alert"], [role="dialog"] [role="status"]'),
			...document.querySelectorAll('[data-testid*="error"], [data-testid*="restriction"], [data-testid*="blocked"]'),
		];
		for (const element of containers) {
			const text = (element.innerText || "").toLowerCase();
			const found = indicators.find((indicator) => text.includes(indicator.toLowerCase()));
			if (found) return found;
		}

		const bodyText = (document.body.innerText || "").toLowerCase();
		return indicators.find(
			(indicator) => indicator.length >= 10 && bodyText.includes(indicator.toLowerCase()),
		) || null;
	}, SELECTORS.RESTRICTION_INDICATORS);
}

async function scrollMarketplace(page, attempts = 1, fraction = 0.7) {
	for (let index = 0; index < attempts; index += 1) {
		await page
			.evaluate((scrollFraction) => {
				window.scrollBy(0, Math.max(200, Math.floor(window.innerHeight * scrollFraction)));
			}, fraction)
			.catch(() => {});
		await delay(600);
	}
}

async function extractVisibleListings(page) {
	return page.evaluate((optionsSelector) => {
		const isVisible = (element) => {
			const rect = element.getBoundingClientRect();
			return (
				rect.width > 0 &&
				rect.height > 0 &&
				rect.bottom > 0 &&
				rect.top < window.innerHeight
			);
		};

		// 1. Ambil semua tombol opsi atau tombol tindakan pada setiap kartu
		const actionButtons = [
			...document.querySelectorAll(
				'div[role="button"], button, [aria-label*="Opsi"], [aria-label*="options"], [aria-label*="More"], [aria-label*="Lainnya"]',
			),
		].filter(isVisible);

		// Ambil container kartu unik dari elemen tindakan
		const cardElements = new Set();
		for (const btn of actionButtons) {
			const btnText = (btn.innerText || btn.getAttribute("aria-label") || "").toLowerCase();
			if (
				btnText.includes("mark as sold") ||
				btnText.includes("tandai sebagai terjual") ||
				btnText.includes("promote") ||
				btnText.includes("promosikan") ||
				btnText.includes("share") ||
				btnText.includes("bagikan") ||
				btnText.includes("more options") ||
				btnText.includes("opsi lainnya") ||
				btnText.includes("more") ||
				btnText.includes("lainnya")
			) {
				let parent = btn;
				for (let depth = 0; depth < 12 && parent; depth += 1) {
					const text = parent.innerText || "";
					if (
						/(Ditawarkan|Diperbarui|Listed|Offered|Renewed|Aktif|Active)/i.test(text) &&
						(text.includes("IDR") || text.includes("Rp") || /\b\d{1,3}(\.\d{3})+\b/.test(text))
					) {
						cardElements.add(parent);
						break;
					}
					parent = parent.parentElement;
				}
			}
		}

		// Fallback: Jika tidak ketemu dari tombol, ambil via optionsSelector langsung
		if (cardElements.size === 0) {
			const optionButtons = [...document.querySelectorAll(optionsSelector)].filter(isVisible);
			for (const button of optionButtons) {
				let card = button;
				for (let depth = 0; card && depth < 12; depth += 1) {
					const text = card.innerText || "";
					if (/(Ditawarkan|Diperbarui|Listed|Offered|Renewed|Aktif|Active)/i.test(text)) {
						cardElements.add(card);
						break;
					}
					card = card.parentElement;
				}
			}
		}

		const listings = [];
		for (const card of cardElements) {
			const cardText = card.innerText || "";
			const lines = cardText.split("\n").map((line) => line.trim()).filter(Boolean);
			if (lines.length === 0) continue;

			const linkEl = card.querySelector('a[href*="/marketplace/item/"]');
			const link = linkEl ? linkEl.href : "";
			let idMatch = link.match(/\/marketplace\/item\/(\d+)/i);

			// Kartu "selling" sering tidak punya link item, tetapi tombol promosi
			// menyimpan target_id listing yang stabil dan unik per kartu.
			if (!idMatch) {
				const promoteLink = card.querySelector('a[href*="target_id="]');
				const promoteHref = promoteLink?.getAttribute("href") || "";
				idMatch = promoteHref.match(/[?&]target_id=(\d+)/i);
			}

			// Deteksi Pintasan Langsung: "Tip: Renew your listing?" / "Tips: Perbarui tawaran Anda?"
			const hasDirectRenew = /renew your listing|perbarui tawaran anda|perbarui listingan/i.test(cardText);

			// Ekstraksi Judul Produk dari teks kartu
			let title = "";
			for (let i = 0; i < lines.length; i += 1) {
				const line = lines[i];
				if (/^Tip:|^Tips:/i.test(line)) continue;
				if (/^(Active|Aktif|Draft|Draf|Sold|Terjual|Pending|Stok Ada|In stock)/i.test(line)) continue;
				if (/IDR|Rp|\b\d{1,3}(\.\d{3})+/.test(line)) continue;
				if (/Mark as sold|Tandai sebagai|Promote|Promosikan|Share|Bagikan/i.test(line)) continue;
				if (/Listed on|Ditawarkan pada|Diperbarui|Renewed|clicks on listing|klik tawaran/i.test(line)) continue;
				if (/duplikat|duplicate|sepertinya anda|it looks like|ditolak|rejected|peringatan|warning/i.test(line)) continue;
				if (line.length >= 3) {
					title = line;
					break;
				}
			}

			// Fallback judul dari aria-label jika ada
			if (!title) {
				const optBtn = card.querySelector(
					'[aria-label*="Opsi"], [aria-label*="options"], [aria-label*="More"], [aria-label*="Lainnya"]',
				);
				const aria = optBtn?.getAttribute("aria-label") || "";
				const cleanAria = aria
					.replace(/^Opsi lainnya untuk\s*/i, "")
					.replace(/^More options for\s*/i, "")
					.trim();
				if (cleanAria && !/^(more options|opsi lainnya|more|lainnya)$/i.test(cleanAria)) {
					title = cleanAria;
				}
			}

			// Fallback judul dari heading / span
			if (!title) {
				const heading = card.querySelector('span[dir="auto"], strong, h2, h3, h4');
				if (heading && heading.innerText?.trim()) {
					const hText = heading.innerText.trim();
					if (!/duplikat|duplicate|sepertinya anda|it looks like/i.test(hText)) {
						title = hText;
					}
				}
			}

			if (!title || /duplikat|duplicate|sepertinya anda|it looks like/i.test(title)) continue;

			const ageText = lines.find((line) =>
				/\b(Diperbarui|Renewed|Ditawarkan|Offered|Listed|pada|on)\b.*\d+/i.test(line),
			) || lines.find((line) =>
				/\b(Diperbarui|Renewed|Ditawarkan|Offered|Listed)\b/i.test(line),
			) || "";

			let warning = null;
			if (/duplikat|duplicate/i.test(cardText)) warning = "duplicate";
			else if (/ditolak|rejected/i.test(cardText)) warning = "rejected";
			else if (/\b(draf|draft)\b/i.test(cardText)) warning = "draft";
			else if (/menunggu persetujuan|pending/i.test(cardText)) warning = "pending";
			else if (
				/stok habis|sold out/i.test(cardText) &&
				!/tandai sebagai stok habis|mark as out of stock/i.test(cardText)
			) {
				warning = "sold";
			}
			else if (/\bterjual\b/i.test(cardText) && !/tandai sebagai terjual/i.test(cardText)) warning = "sold";
			else if (/\bsold\b/i.test(cardText) && !/mark as sold/i.test(cardText)) warning = "sold";

			const isActive =
				/\b(Aktif|Active|Stok Ada|In stock)\b/i.test(cardText) ||
				hasDirectRenew ||
				/mark as sold|tandai sebagai terjual|promote|promosikan/i.test(cardText);

			listings.push({
				title,
				href: link,
				listingId: idMatch ? idMatch[1] : "",
				ageText,
				active: Boolean(isActive && !warning),
				warning,
				hasDirectRenew,
			});
		}

		return listings;
	}, OPTIONS_SELECTOR);
}

async function discoverListings(page, minTarget = 250) {
	await page.evaluate(() => window.scrollTo(0, 0));
	await delay(400);
	const discovered = [];
	const keyFor = (listing) =>
		listing.listingId
			? String(listing.listingId)
			: listing.href && listing.href.includes("/marketplace/item/")
				? listing.href
				: `${normalizeTitle(listing.title)}_${normalizeTitle(listing.ageText)}`;
	let stagnantBatches = 0;
	let lastCount = 0;

	for (let batch = 0; batch < 150; batch += 1) {
		const visible = await extractVisibleListings(page);
		for (const listing of visible) {
			const key = keyFor(listing);
			const existingIndex = discovered.findIndex((item) => keyFor(item) === key);
			if (existingIndex === -1) {
				discovered.push(listing);
				continue;
			}

			// Kartu yang sama bisa muncul sebagai versi duplikat lalu versi aktif.
			// Simpan versi yang paling layak diproses, bukan sekadar yang pertama terlihat.
			const existing = discovered[existingIndex];
			const existingScore =
				Number(Boolean(existing.active && !existing.warning)) +
				Number(Boolean(existing.hasDirectRenew));
			const listingScore =
				Number(Boolean(listing.active && !listing.warning)) +
				Number(Boolean(listing.hasDirectRenew));
			if (listingScore > existingScore) {
				discovered[existingIndex] = listing;
			}
		}

		if (discovered.length >= minTarget) {
			logger.info(`Target ${minTarget} listingan tercapai (Total: ${discovered.length} kartu).`);
			break;
		}

		if (discovered.length === lastCount) {
			stagnantBatches += 1;
		} else {
			stagnantBatches = 0;
		}
		lastCount = discovered.length;

		if (stagnantBatches >= 12) {
			logger.info(`Ujung halaman Facebook tercapai (Total: ${discovered.length} kartu).`);
			break;
		}

		await scrollMarketplace(page, 1, 0.7);
	}
	return discovered;
}

async function findOptionsButton(page, listing, maxScrolls = 80, { matchAge = false } = {}) {
	if (!page.url().includes("/marketplace/you/selling")) {
		await page.goto(SELLING_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
		await delay(1200);
	}

	// Selalu mulai dari atas. Setelah scan, halaman biasanya berada di bawah;
	// mencari dari posisi itu membuat target di atas terlewat.
	await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
	await delay(500);

	const normalizedTitle = normalizeTitle(listing.title);
	const normalizedAge = matchAge ? normalizeTitle(listing.ageText || "") : "";
	let stagnantScrolls = 0;

	for (let attempt = 0; attempt <= maxScrolls; attempt += 1) {
		const handle = await page.evaluateHandle(
			({ listingId, normalizedTitle, normalizedAge }) => {
				const norm = (s) =>
					(s || "")
						.toLowerCase()
						.replace(/[^a-z0-9\s]/g, " ")
						.replace(/\s+/g, " ")
						.trim();

				// Hanya tombol yang benar-benar terlihat di viewport. Facebook menyimpan
				// kartu lama/offscreen di DOM; mengkliknya bisa menggulir ke area kosong.
				const isInViewport = (rect) =>
					rect.width > 0 &&
					rect.height > 0 &&
					rect.top >= 64 &&
					rect.bottom <= window.innerHeight - 8;

				const buttons = Array.from(
					document.querySelectorAll(
						'div[role="button"][aria-label^="Opsi lainnya untuk"], div[role="button"][aria-label^="More options for"], [aria-label*="Opsi lainnya untuk"], [aria-label*="More options for"]',
					),
				);

				for (const btn of buttons) {
					if (btn.dataset.sundulProcessed === "true") continue;
					if (btn.closest('a[href*="/help/"]')) continue;

					const rect = btn.getBoundingClientRect();
					if (!isInViewport(rect)) continue;

					const btnAria = norm(btn.getAttribute("aria-label") || "")
						.replace(/^opsi lainnya untuk\s*/i, "")
						.replace(/^more options for\s*/i, "")
						.trim();

					// Cari container kartu lebih dulu. ID dan teks harus berasal
					// dari kartu yang sama, bukan wrapper berisi banyak kartu.
					let card = btn;
					for (let depth = 0; depth < 8 && card; depth += 1) {
						if (card.getAttribute("role") === "button" && card !== btn) break;
						if (card.getAttribute("role") === "article" || card.dataset.pagelet) break;
						card = card.parentElement;
					}

					const cardText = card ? norm(card.innerText) : "";
					const idLinks = card
						? Array.from(
								card.querySelectorAll(
									'a[href*="/marketplace/item/"], a[href*="target_id="]',
								),
							)
						: [];

					let isMatch = false;
					let hasCardId = false;

					// 1. Cocokkan ID jika kartu punya ID. target_id berasal dari link
					// promosi dan membedakan listing berjudul sama persis.
					if (listingId && idLinks.length > 0) {
						hasCardId = true;
						const idPattern = new RegExp(`[?&]target_id=${listingId}(?:&|$)`);
						isMatch = idLinks.some((anchor) => {
							const href = anchor.getAttribute("href") || "";
							return (
								href.includes(`/marketplace/item/${listingId}`) ||
								idPattern.test(href)
							);
						});
					}

					// 2. Fallback judul hanya untuk kartu tanpa ID. Jika kartu punya
					// ID tetapi tidak cocok, jangan pernah jatuh ke judul: duplikat
					// berjudul sama bisa tertukar.
					if (!isMatch && !hasCardId && btnAria) {
						isMatch = btnAria === normalizedTitle || btnAria.includes(normalizedTitle);
					}

					if (!isMatch) continue;

					// Cek apakah kartu memiliki badge alert warning duplikat / ditolak / draf
					if (
						cardText.includes("duplikat") ||
						cardText.includes("duplicate") ||
						cardText.includes("sepertinya anda") ||
						cardText.includes("it looks like")
					) {
						btn.dataset.sundulProcessed = "true";
						continue;
					}

					// Usia ikut dicocokkan saat aksi awal agar duplikat berjudul sama
					// tidak saling tertukar. Saat verifikasi pasca-reload, teks usia
					// bisa berubah menjadi "Diperbarui", jadi pencocokan usia tidak dipakai.
					if (normalizedAge && !cardText.includes(normalizedAge)) continue;

					const cx = rect.left + rect.width / 2;
					const cy = rect.top + rect.height / 2;
					const topElement = document.elementFromPoint(cx, cy);
					if (topElement && !btn.contains(topElement) && !topElement.contains(btn)) {
						continue;
					}

					// Tandai tombol ini sebagai SUDAH DIPROSES
					btn.dataset.sundulProcessed = "true";
					return btn;
				}
				return null;
			},
			{
				listingId: listing.listingId || "",
				normalizedTitle,
				normalizedAge,
			},
		);

		const element = handle.asElement();
		if (element) return element;
		await handle.dispose().catch(() => {});

		if (attempt < maxScrolls) {
			const scrollState = await page
				.evaluate(() => {
					const beforeY = window.scrollY;
					const beforeHeight = document.documentElement.scrollHeight;
					window.scrollBy(0, Math.max(200, Math.floor(window.innerHeight * 0.7)));
					return {
						moved: window.scrollY > beforeY,
						beforeHeight,
						afterHeight: document.documentElement.scrollHeight,
					};
				})
				.catch(() => ({ moved: false, beforeHeight: 0, afterHeight: 0 }));

			// Facebook memuat kartu berikutnya secara lazy. Jangan berhenti pada
			// satu kali "tidak bergerak"; beri waktu daftar bertambah dulu.
			if (scrollState.moved || scrollState.afterHeight > scrollState.beforeHeight) {
				stagnantScrolls = 0;
				await delay(350);
			} else {
				stagnantScrolls += 1;
				if (stagnantScrolls >= 8) break;
				await delay(1200);
			}
		}
	}
	return null;
}

function isRenewActionText(text) {
	const clean = text.toLowerCase();
	if (/delete|hapus|relist|tayangkan ulang|edit|ubah/.test(clean)) return false;
	return /perbarui|renew/.test(clean);
}

async function findVisibleRenewAction(page) {
	// Jangan pernah mengambil tombol "Perbarui" dari kartu lain di halaman.
	// Hanya item di dalam menu dropdown yang boleh dianggap aksi sundul.
	const elements = await page.$$(
		'[role="menu"] [role="menuitem"], [role="menu"] [role="button"], [role="menu"] div[tabindex="0"], [role="menu"] span',
	);
	for (const element of elements) {
		if (!(await element.isVisible().catch(() => false))) continue;
		const text = await element.innerText().catch(() => "");
		if (!isRenewActionText(text)) continue;
		const ariaDisabled = await element.getAttribute("aria-disabled");
		const disabled = await element.getAttribute("disabled");
		const enabled = ariaDisabled !== "true" && disabled === null;
		logger.info(`[DEBUG] [MENU] Opsi "${text.trim()}" ditemukan (Status: ${enabled ? 'Aktif/Bisa Diklik' : 'Disabled'}).`);
		return { element, text: text.trim(), enabled };
	}
	return null;
}

async function openListingMenu(page, listing, { matchAge = false } = {}) {
	await closeOverlays(page);
	logger.info(`[DEBUG] [CARI] Mencari tombol opsi titik tiga [...] untuk "${listing.title}"...`);
	const optionsButton = await findOptionsButton(page, listing, 80, { matchAge });
	if (!optionsButton) {
		logger.warn(`[DEBUG] [GAGAL] Tombol opsi titik tiga [...] tidak ditemukan untuk "${listing.title}".`);
		return { opened: false, renewAction: null };
	}

	logger.info(`[DEBUG] [KLIK SUKSES] Mengklik tombol opsi titik tiga [...] untuk "${listing.title}"`);
	await optionsButton.scrollIntoViewIfNeeded().catch(() => {});

	// Coba klik dengan retry 2x jika menu belum terbuka
	for (let clickAttempt = 1; clickAttempt <= 2; clickAttempt += 1) {
		await optionsButton.click({ force: true, timeout: 3000 }).catch(async () => {
			await page.evaluate((el) => el.click(), optionsButton);
		});

		const menuReady = await page
			.waitForFunction(
				() =>
					[
						...document.querySelectorAll(
							'[role="menuitem"], [role="menu"] [role="button"], [role="menu"]',
						),
					].some((element) => {
						const rect = element.getBoundingClientRect();
						return rect.width > 0 && rect.height > 0;
					}),
				null,
				{ timeout: 3500 },
			)
			.then(() => true)
			.catch(() => false);

		if (menuReady) {
			logger.info(`[DEBUG] [STEP LOLOS] Menu dropdown berhasil terbuka.`);
			const renewAction = await findVisibleRenewAction(page);
			return { opened: true, renewAction };
		}
		await delay(400);
	}

	logger.warn(`[DEBUG] [GAGAL] Menu dropdown tidak terbuka setelah klik opsi titik tiga.`);
	return { opened: false, renewAction: null };
}

async function clickConfirmationIfPresent(page) {
	await delay(500);
	const dialogs = await page.$$('[role="dialog"]').catch(() => []);
	let dialog = null;
	for (const candidate of dialogs) {
		if (await candidate.isVisible().catch(() => false)) {
			dialog = candidate;
			break;
		}
	}
	if (!dialog) return false;

	const candidates = await dialog.$$(MENU_ITEM_SELECTOR).catch(() => []);
	for (const candidate of candidates) {
		if (!(await candidate.isVisible().catch(() => false))) continue;
		const text = normalizeTitle(await candidate.innerText().catch(() => ""));
		const ariaLabel = normalizeTitle(await candidate.getAttribute("aria-label"));
		const value = text || ariaLabel;
		if (
			![
				"perbarui",
				"renew",
				"perbarui penawaran",
				"renew listing",
				"perbarui tawaran",
				"renew offer",
				"ya",
				"yes",
				"konfirmasi",
				"confirm",
				"lanjutkan",
				"continue",
			].includes(value)
		) {
			continue;
		}
		const ariaDisabled = await candidate.getAttribute("aria-disabled");
		const disabled = await candidate.getAttribute("disabled");
		if (ariaDisabled === "true" || disabled !== null) continue;
		logger.info(`[DEBUG] [KLIK SUKSES] Modal dialog muncul, mengklik konfirmasi: "${value}"`);
		await candidate.click({ timeout: 3000 });
		return true;
	}
	return false;
}

async function waitForSuccessSignal(page, timeoutMs = 6500) {
	return page
		.waitForFunction(
			(successText) => {
				const elements = document.querySelectorAll(
					'[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]',
				);
				for (const element of elements) {
					const text = (element.innerText || "").toLowerCase();
					const found = successText.find((indicator) => text.includes(indicator));
					if (found) return found;
				}
				return false;
			},
			SUCCESS_TEXT,
			{ timeout: timeoutMs },
		)
		.then((handle) => {
			handle.dispose().catch(() => {});
			return true;
		})
		.catch(() => false);
}

async function clickModalDetailRenew(page, listing) {
	if (!page.url().includes("/marketplace/you/selling")) {
		await page.goto(SELLING_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
		await delay(1200);
	}

	// 1. Klik kartu produk untuk membuka modal dialog "Penawaran Anda" / "Your listing"
	const opened = await page.evaluate(({ title, listingId }) => {
		const norm = (s) =>
			(s || "")
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, " ")
				.replace(/\s+/g, " ")
				.trim();

		const cards = Array.from(
			document.querySelectorAll('div[role="button"][aria-label], div[role="article"], div[data-pagelet*="Item"]'),
		);

		for (const card of cards) {
			if (card.dataset.sundulProcessedModal === "true") continue;
			if (card.closest('a[href*="/help/"]')) continue;
			if (/^Opsi lainnya|^More options/i.test(card.getAttribute("aria-label") || "")) {
				continue;
			}

			const cardText = norm(card.innerText);
			if (
				cardText.includes("duplikat") ||
				cardText.includes("duplicate") ||
				cardText.includes("sepertinya anda") ||
				cardText.includes("it looks like")
			) {
				card.dataset.sundulProcessedModal = "true";
				continue;
			}

			const rect = card.getBoundingClientRect();
			if (
				rect.width <= 0 ||
				rect.height <= 0 ||
				rect.top < 64 ||
				rect.bottom > window.innerHeight - 8
			) {
				continue;
			}

			let matched = false;
			let hasCardId = false;
			if (listingId) {
				const idPattern = new RegExp(`[?&]target_id=${listingId}(?:&|$)`);
				const idLinks = Array.from(
					card.querySelectorAll('a[href*="/marketplace/item/"], a[href*="target_id="]'),
				);
				if (idLinks.length > 0) {
					hasCardId = true;
					matched = idLinks.some((anchor) => {
						const href = anchor.getAttribute("href") || "";
						return href.includes(`/marketplace/item/${listingId}`) || idPattern.test(href);
					});
				}
			}

			if (!matched && !hasCardId) {
				const aria = norm(card.getAttribute("aria-label"));
				matched = aria === title || aria.includes(title) || cardText.includes(title);
			}

			if (matched) {
				card.dataset.sundulProcessedModal = "true";
				card.click();
				return true;
			}
		}
		return false;
	}, {
		title: normalizeTitle(listing.title),
		listingId: listing.listingId || "",
	});

	if (!opened) return { clicked: false, reason: "card-not-found" };
	await delay(1200);

	// 2. Cari tombol biru "Perbarui penawaran" / "Renew listing" di dalam dialog modal
	const result = await page.evaluate(() => {
		const isClickable = (el) => {
			if (!el) return false;
			const rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		};

		const buttons = Array.from(
			document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] button'),
		);

		for (const btn of buttons) {
			const text = (btn.innerText || "").trim().toLowerCase();
			const aria = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
			const isRenew =
				text.includes("perbarui") ||
				text.includes("renew") ||
				aria.includes("perbarui") ||
				aria.includes("renew");

			if (isRenew && isClickable(btn)) {
				btn.scrollIntoView({ block: "center" });
				btn.click();
				return { clicked: true, text: text || aria };
			}
		}
		return { clicked: false, reason: "button-in-modal-not-found" };
	});

	return result;
}

/**
 * Verifikasi cadangan setelah klik renew: reload halaman selling, lalu cek
 * apakah aksi renew untuk listing yang sama sekarang disabled/cooldown.
 * Kalau iya, kemungkinan besar klik tadi berhasil walau toast sukses tidak muncul.
 * @returns {Promise<{ renewUnavailable: boolean, reason: string }>}
 */
async function verifyRenewAfterReload(page, listing) {
	try {
		logger.info(`[DEBUG] [VERIFIKASI] Reload halaman selling untuk memastikan status "${listing.title}"...`);
		await page.goto(SELLING_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
		await delay(VERIFY_RELOAD_DELAY_MS);

		const menu = await openListingMenu(page, listing, { matchAge: false });
		const renewUnavailable = Boolean(menu.opened && menu.renewAction && !menu.renewAction.enabled);
		let reason = "menu-not-found";
		if (menu.opened) {
			if (!menu.renewAction) reason = "renew-action-missing";
			else if (!menu.renewAction.enabled) reason = "cooldown-active";
			else reason = "renew-still-enabled";
		}
		await closeOverlays(page);
		return { renewUnavailable, reason };
	} catch (error) {
		await closeOverlays(page).catch(() => {});
		logger.warn(`[DEBUG] [VERIFIKASI] Gagal verifikasi post-reload "${listing.title}": ${error.message}.`);
		return { renewUnavailable: false, reason: `verify-error:${error.message}` };
	}
}

async function renewListing(page, listing) {
	if (!page.url().includes("/marketplace/you/selling")) {
		await page.goto(SELLING_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
		await delay(1200);
	}

	// ==========================================
	// JALUR 1 (UTAMA - Paling Cepat): Menu Titik Tiga [...]
	// ==========================================
	logger.info(`[DEBUG] [JALUR 1 - UTAMA] Membuka menu opsi titik tiga [...] untuk "${listing.title}"...`);
	const menu = await openListingMenu(page, listing, { matchAge: true });

	if (menu.opened && menu.renewAction) {
		// Jika tombol dalam kondisi disabled (contoh: "Renew (3 days)" / "Renew (6 days)")
		if (!menu.renewAction.enabled) {
			logger.info(`[DEBUG] [COOLDOWN] Listing "${listing.title}" masih dalam masa cooldown 7 hari FB (${menu.renewAction.text}).`);
			await closeOverlays(page);
			return { success: false, reason: "cooldown-active" };
		}

		// Tombol aktif / bisa disundul
		logger.info(`[DEBUG] [KLIK SUKSES] Mengklik menu "${menu.renewAction.text || 'Perbarui'}"`);
		await menu.renewAction.element.click({ timeout: 4000 });
		await delay(800);

		// Handle konfirmasi jika ada modal konfirmasi tambahan
		await clickConfirmationIfPresent(page);
		const successSignal = await waitForSuccessSignal(page, 6500);

		// Sinyal sukses spesifik dari Facebook sudah cukup. Fallback cooldown
		// dipakai jika toast tidak muncul; cooldown bisa telat beberapa menit.
		if (isRenewVerified({ successSignal })) {
			await closeOverlays(page);
			logger.info(`[DEBUG] [STEP LOLOS] Sundul terverifikasi via Jalur 1 (Menu Dropdown).`);
			return { success: true, reason: "menu-dropdown-success" };
		}

		const reloadCheck = await verifyRenewAfterReload(page, listing);
		if (isRenewVerified({ renewUnavailable: reloadCheck.renewUnavailable })) {
			logger.info(`[DEBUG] [STEP LOLOS] Sundul terverifikasi via cooldown post-reload (${reloadCheck.reason}).`);
			return { success: true, reason: "post-reload-cooldown" };
		}

		logger.warn(
			`[DEBUG] [TIDAK TERVERIFIKASI] Klik Jalur 1 berhasil, tapi Facebook tidak menampilkan sinyal sukses untuk "${listing.title}" (${reloadCheck.reason}).`,
		);
		return { success: false, reason: "unverified" };
	}

	// ==========================================
	// JALUR 2 (FALLBACK): Buka Modal Detail "Penawaran Anda"
	// ==========================================
	logger.info(`[DEBUG] [JALUR 2 - FALLBACK] Mencoba via Modal Detail Penawaran untuk "${listing.title}"...`);
	await closeOverlays(page);
	const modalResult = await clickModalDetailRenew(page, listing);

	if (modalResult.clicked) {
		logger.info(`[DEBUG] [KLIK SUKSES] Tombol "${modalResult.text}" di modal dialog BERHASIL DIKLIK untuk "${listing.title}"`);
		await delay(800);
		await clickConfirmationIfPresent(page);
		const successSignal = await waitForSuccessSignal(page, 6500);

		if (isRenewVerified({ successSignal })) {
			await closeOverlays(page);
			logger.info(`[DEBUG] [STEP LOLOS] Sundul terverifikasi via Jalur 2 (Modal Dialog).`);
			return { success: true, reason: "modal-dialog-success" };
		}

		const reloadCheck = await verifyRenewAfterReload(page, listing);
		if (isRenewVerified({ renewUnavailable: reloadCheck.renewUnavailable })) {
			logger.info(`[DEBUG] [STEP LOLOS] Sundul terverifikasi via cooldown post-reload (${reloadCheck.reason}).`);
			return { success: true, reason: "post-reload-cooldown" };
		}

		logger.warn(
			`[DEBUG] [TIDAK TERVERIFIKASI] Klik Jalur 2 berhasil, tapi Facebook tidak menampilkan sinyal sukses untuk "${listing.title}" (${reloadCheck.reason}).`,
		);
		return { success: false, reason: "unverified" };
	}

	await closeOverlays(page);
	logger.warn(`[DEBUG] [GAGAL] Kedua jalur sundul tidak dapat mengeksekusi "${listing.title}".`);
	return { success: false, reason: "all-paths-failed" };
}

function selectTargets({ autoMode, titles, listings, recentKeys, localListings = [] }) {
	if (autoMode) {
		const hasCatalog = Array.isArray(localListings) && localListings.length > 0;
		const selectedKeys = new Set();

		return listings
			.map((listing) => {
				if (hasCatalog) {
					// Cari apakah listing Facebook ini ada di database produk aktif aplikasi
					const match = findBestListingMatch(listing.title, localListings, 0.75);
					if (!match) {
						return {
							listing,
							eligibility: {
								eligible: false,
								reason: "not-in-catalog",
								key: buildListingKey(listing),
								ageDays: null,
							},
						};
					}
				}

				return {
					listing,
					eligibility: evaluateListingEligibility(listing, { recentKeys }),
				};
			})
			.filter((entry) => {
				if (!entry.eligibility.eligible) return false;
				if (selectedKeys.has(entry.eligibility.key)) return false;
				selectedKeys.add(entry.eligibility.key);
				return true;
			});
	}

	const selected = [];
	const selectedKeys = new Set();
	for (const title of titles) {
		const best = findBestListingMatch(title, listings);
		if (!best) continue;
		const eligibility = evaluateListingEligibility(best.listing, { recentKeys });
		if (!eligibility.eligible) continue;
		if (selectedKeys.has(eligibility.key)) continue;
		selectedKeys.add(eligibility.key);
		selected.push({ listing: best.listing, eligibility });
	}
	return selected;
}

async function processAccount(account, cli) {
	const browser = new BrowserManager({
		accountName: account.name,
		userDataDir: account.profileDir,
	});
	currentBrowser = browser;

	try {
		const page = await browser.init({ headless: process.env.HEADLESS === "true" });
		logger.info(`Menuju Dashboard Tawaran Anda: ${SELLING_URL}`);
		await page.goto(SELLING_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
		await delay(2000);

		const restriction = await detectRestriction(page);
		if (restriction) {
			logger.warn(`STOP: Marketplace membatasi akun ini: "${restriction}".`);
			return { successCount: 0, attemptedCount: 0, restricted: true };
		}

		logger.info("Memindai kartu listing Facebook dan mencocokkan dengan katalog aktif aplikasi...");
		// Skala target scan dengan kebutuhan: judul spesifik tak perlu sapu 250 kartu.
		const scanTarget = cli.autoMode ? 250 : Math.min(250, Math.max(30, (cli.titles || []).length * 10));
		const listings = await discoverListings(page, scanTarget);
		const recentRenewals = DataService.getRecentMarketplaceRenewals(account.id, 7);
		const recentKeys = new Set(recentRenewals.map((renewal) => renewal.listing_key));
		const localListings = (await DataService.getListings()).filter(
			(l) => l.isActive !== false && l.postMarketplace !== false,
		);
		const eligibleTargets = selectTargets({ ...cli, listings, recentKeys, localListings });
		const targets = eligibleTargets.slice(0, cli.maxActions);
		if (eligibleTargets.length > targets.length) {
			logger.info(
				`Dibatasi ke ${targets.length} dari ${eligibleTargets.length} target eligible ` +
				`(max ${cli.maxActions} per run). Sisa target akan dicoba pada run berikutnya.`,
			);
		}

		const eligibilitySummary = listings.reduce((summary, listing) => {
			let result = evaluateListingEligibility(listing, { recentKeys });
			if (cli.autoMode && localListings.length > 0 && !findBestListingMatch(listing.title, localListings, 0.75)) {
				result = { eligible: false, reason: "not-in-catalog" };
			}
			summary[result.reason] = (summary[result.reason] || 0) + 1;
			return summary;
		}, {});
		logger.info(
			`Hasil scan: ${listings.length} kartu FB, ${eligibleTargets.length} eligible (sesuai katalog aktif ${localListings.length} produk). ` +
			`Status: ${JSON.stringify(eligibilitySummary)}.`,
		);

		for (const listing of listings) {
			const match = localListings.length > 0 ? findBestListingMatch(listing.title, localListings, 0.75) : null;
			const el = evaluateListingEligibility(listing, { recentKeys });
			if (!match && localListings.length > 0 && cli.autoMode) {
				logger.info(`[DEBUG] [SCAN SKIP] "${listing.title}" -> Tidak ada di katalog aktif database.`);
			} else if (!el.eligible) {
				logger.info(`[DEBUG] [SCAN SKIP] "${listing.title}" -> Belum eligible (${el.reason}, umur: ${el.ageDays ?? 'unknown'} hari).`);
			} else {
				logger.info(`[DEBUG] [SCAN SIAP] "${listing.title}" -> SIAP DISUNDUL (Umur: ${el.ageDays} hari, DirectTip: ${listing.hasDirectRenew ? 'YA' : 'TIDAK'}).`);
			}
		}
		if (cli.dryRun) {
			for (const listing of listings) {
				const eligibility = evaluateListingEligibility(listing, { recentKeys });
				if (eligibility.reason === "unknown-age" || eligibility.reason === "too-new") {
					logger.info(
						`Dry run skip ${eligibility.reason}: "${listing.title}" ` +
						`(teks umur: "${listing.ageText || "kosong"}").`,
					);
				}
			}
			logger.info(`Dry run selesai. Tidak ada tombol Facebook yang diklik.`);
			return { successCount: 0, attemptedCount: 0, restricted: false };
		}

		let successCount = 0;
		for (let index = 0; index < targets.length; index += 1) {
			const { listing, eligibility } = targets[index];

			logger.info(
				`[${index + 1}/${targets.length}] Renew "${listing.title}" ` +
				`(umur terbaca ${eligibility.ageDays} hari, key ${eligibility.key}).`,
			);
			const result = await renewListing(page, listing).catch((error) => ({
				success: false,
				reason: `error:${error.message}`,
			}));

			if (!result.success) {
				logger.warn(`Gagal verifikasi sundul "${listing.title}": ${result.reason}.`);
				// Beri jeda sebelum target berikutnya supaya tidak menembak Facebook terlalu cepat.
				await delay(400 + Math.floor(Math.random() * 400));
				continue;
			}

			const key = buildListingKey(listing);
			DataService.markMarketplaceRenewed(account.id, key, listing.title);
			recentKeys.add(key);
			successCount += 1;
			logger.success(`Sundul terverifikasi: "${listing.title}" (${result.reason}).`);
			await delay(700 + Math.floor(Math.random() * 500));
		}

		return { successCount, attemptedCount: targets.length, restricted: false };
	} finally {
		await browser.close().catch(() => {});
	}
}
let currentBrowser = null;

// Graceful Shutdown Handler
async function gracefulShutdown(signal) {
	logger.info(`Menerima sinyal ${signal}. Menutup browser...`);
	try {
		if (currentBrowser) {
			await currentBrowser.close();
		}
	} catch (e) {}
	process.exit(0);
}
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

async function processSundul(argv = process.argv.slice(2)) {
	const cli = parseCliArgs(argv);
	if (!cli.autoMode && cli.titles.length === 0) {
		throw new Error("Dibutuhkan argument --auto atau --titles=judul1,judul2");
	}

	const accounts = await getAccountsToProcess();
	if (accounts.length === 0) throw new Error("Tidak ada akun aktif yang ditautkan.");

	let globalSuccessCount = 0;
	let globalAttemptedCount = 0;
	let failedAccounts = 0;
	let restrictedAccounts = 0;
	for (let index = 0; index < accounts.length; index += 1) {
		const account = accounts[index];
		logger.info(`[AKUN ${index + 1}/${accounts.length}] Memulai Sundul untuk ${account.name}.`);
		try {
			const result = await processAccount(account, cli);
			globalSuccessCount += result.successCount;
			globalAttemptedCount += result.attemptedCount;
			if (result.restricted) {
				restrictedAccounts += 1;
			} else {
				logger.success(
					`Sundul selesai untuk ${account.name}. Terverifikasi: ` +
					`${result.successCount}/${result.attemptedCount}.`,
				);
			}
		} catch (error) {
			failedAccounts += 1;
			logger.error(`Kesalahan bot Sundul untuk ${account.name}`, error);
		}
	}

	const success = failedAccounts === 0 && restrictedAccounts === 0;
	const summary =
		`Total terverifikasi: ${globalSuccessCount}/${globalAttemptedCount}. ` +
		`Akun gagal: ${failedAccounts}, akun dibatasi: ${restrictedAccounts}.`;
	if (success) {
		logger.success(`Semua proses Sundul selesai. ${summary}`);
	} else {
		logger.error(`Sundul selesai dengan masalah. ${summary}`);
	}

	return {
		successCount: globalSuccessCount,
		attemptedCount: globalAttemptedCount,
		failedAccounts,
		restrictedAccounts,
		success,
	};
}

if (require.main === module) {
	processSundul()
		.then((result) => {
			if (!result.success) process.exitCode = 1;
		})
		.catch((error) => {
			logger.error("Proses Sundul gagal", error);
			process.exitCode = 1;
		});
}

module.exports = {
	discoverListings,
	parseCliArgs,
	processSundul,
	renewListing,
	selectTargets,
};
