const path = require("node:path");
const fs = require("fs-extra");
const readline = require("node:readline");
const BrowserManager = require("../src/core/browserManager");
const Logger = require("../src/utils/logger");
const DataService = require("../src/web/services/dataService");
require("dotenv").config();

const logger = new Logger("INSPECT");
const RECORD_FILE = path.join(__dirname, "../scratch/sundul_recorded_actions.jsonl");
const SNAPSHOT_FILE = path.join(__dirname, "../scratch/sundul_dom_dump.html");
const SCROLL_LOG_FILE = path.join(__dirname, "../scratch/sundul_scroll_log.jsonl");
const CARDS_DUMP_FILE = path.join(__dirname, "../scratch/sundul_cards_dump.json");

fs.ensureDirSync(path.join(__dirname, "../scratch"));

function parseArgs() {
	const args = process.argv.slice(2);
	const accountArg = args.find((a) => a.startsWith("--account="))?.split("=")[1];
	const profileArg = args.find((a) => a.startsWith("--profile="))?.split("=")[1];
	return {
		accountId: accountArg || null,
		profileDir: profileArg || null,
	};
}

async function getTargetAccount(cli) {
	const allAccounts = await DataService.getAccounts();
	const accounts = (Array.isArray(allAccounts) ? allAccounts : []).filter((a) => Boolean(a.isActive));
	if (accounts.length === 0) {
		throw new Error("Tidak ada akun aktif di database.");
	}

	if (cli.accountId) {
		const match = accounts.find((a) => String(a.id) === String(cli.accountId));
		if (match) return match;
	}

	// Cari akun_4 atau akun_5 atau akun pertama
	const preferred = accounts.find((a) => /akun_4|akun_5/i.test(a.profile)) || accounts[0];
	return preferred;
}

async function main() {
	const cli = parseArgs();
	const account = await getTargetAccount(cli);
	const profilePath = cli.profileDir
		? path.resolve(cli.profileDir)
		: path.join(__dirname, "..", account.profile);

	logger.info(`=======================================================`);
	logger.info(`   SUNDUL INTERACTIVE INSPECTOR & SCROLL RECORDER`);
	logger.info(`   Akun: ${account.fbName || account.name} (ID: ${account.id})`);
	logger.info(`   Profil: ${profilePath}`);
	logger.info(`=======================================================`);
	logger.info(`Petunjuk:`);
	logger.info(`1. Silakan scroll ke bawah sampai paling dasar untuk melihat perilaku loading listing.`);
	logger.info(`2. Silakan klik tombol/modal yang ingin dicatat.`);
	logger.info(`3. Ketik 'c' + [Enter] untuk mencatat daftar semua kartu listing di layar saat ini.`);
	logger.info(`4. Tekan [Enter] kosong untuk menyimpan full snapshot HTML.`);
	logger.info(`5. Tekan [Ctrl+C] untuk selesai & keluar.\n`);

	const browser = new BrowserManager({
		accountName: account.name,
		userDataDir: profilePath,
	});

	const page = await browser.init({ headless: false });

	// Expose logger to page
	await page.exposeFunction("recordDomAction", (data) => {
		const time = new Date().toLocaleTimeString();
		logger.info(`[${time}] [KLIK DETEKSI] <${data.tag}> "${data.text || data.ariaLabel || data.role || 'no-text'}"`);
		if (data.dialog) {
			logger.info(`   └─ Berada di dalam Dialog: "${data.dialog.title || data.dialog.role}"`);
		}
		if (data.cardText) {
			logger.info(`   └─ Teks Kartu/Container: "${data.cardText.replace(/\n+/g, ' | ').slice(0, 100)}..."`);
		}
		logger.info(`   └─ Selector: ${data.selector}`);
		logger.info(`   └─ Full XPath: ${data.xpath}\n`);

		fs.appendFileSync(RECORD_FILE, JSON.stringify({ timestamp: new Date().toISOString(), ...data }) + "\n");
	});

	await page.exposeFunction("recordScrollAction", (data) => {
		logger.info(`[SCROLL] Posisi: ${data.scrollY}px / ${data.scrollHeight}px | Kartu Terdeteksi di DOM: ${data.cardCount} | Batch Baru: +${data.newCards}`);
		fs.appendFileSync(SCROLL_LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), ...data }) + "\n");
	});

	// Inject interaction & scroll recorder listener
	await page.addInitScript(() => {
		function getCssSelector(el) {
			if (!el || el.nodeType !== 1) return "";
			if (el.id) return `#${el.id}`;
			const role = el.getAttribute("role");
			const aria = el.getAttribute("aria-label");
			if (aria) return `${el.tagName.toLowerCase()}[aria-label="${aria}"]`;
			if (role) return `${el.tagName.toLowerCase()}[role="${role}"]`;
			return el.tagName.toLowerCase();
		}

		function getXPath(el) {
			if (!el) return "";
			if (el.id) return `//*[@id="${el.id}"]`;
			const parts = [];
			let current = el;
			while (current && current.nodeType === 1) {
				let index = 1;
				let sibling = current.previousElementSibling;
				while (sibling) {
					if (sibling.tagName === current.tagName) index += 1;
					sibling = sibling.previousElementSibling;
				}
				const tagName = current.tagName.toLowerCase();
				parts.unshift(`${tagName}[${index}]`);
				current = current.parentElement;
			}
			return `/${parts.join("/")}`;
		}

		window.addEventListener(
			"click",
			(e) => {
				try {
					const el = e.target;
					const clickable = el.closest('button, [role="button"], a, div[role="dialog"], [aria-label]') || el;
					const dialog = el.closest('[role="dialog"]');
					const card = el.closest('div[role="article"], div[role="main"], div[data-pagelet*="Item"], div[tabindex="0"]') || el.parentElement;

					const data = {
						tag: clickable.tagName,
						text: (clickable.innerText || "").trim().slice(0, 200),
						ariaLabel: clickable.getAttribute("aria-label") || "",
						role: clickable.getAttribute("role") || "",
						className: clickable.className || "",
						selector: getCssSelector(clickable),
						xpath: getXPath(clickable),
						outerHTML: clickable.outerHTML.slice(0, 500),
						cardText: card ? (card.innerText || "").trim().slice(0, 300) : "",
						dialog: dialog
							? {
									role: dialog.getAttribute("role") || "dialog",
									title: (dialog.querySelector('h1, h2, h3, [role="heading"]') || {}).innerText || "",
									outerHTML: dialog.outerHTML.slice(0, 300),
							  }
							: null,
					};

					// Visual halo on clicked element
					const prevOutline = clickable.style.outline;
					clickable.style.outline = "3px solid #00ff00";
					setTimeout(() => {
						clickable.style.outline = prevOutline;
					}, 1000);

					window.recordDomAction(data);
				} catch (err) {
					console.error("Record error:", err);
				}
			},
			true,
		);

		// Scroll throttling recorder
		let lastScrollReport = 0;
		let lastCardCount = 0;
		window.addEventListener("scroll", () => {
			const now = Date.now();
			if (now - lastScrollReport > 800) {
				lastScrollReport = now;
				const cards = document.querySelectorAll('a[href*="/marketplace/item/"], div[role="article"], div[data-pagelet*="Item"]');
				const cardCount = cards.length;
				const newCards = Math.max(0, cardCount - lastCardCount);
				lastCardCount = cardCount;

				window.recordScrollAction({
					scrollY: Math.round(window.scrollY),
					scrollHeight: Math.round(document.body.scrollHeight),
					innerHeight: window.innerHeight,
					cardCount,
					newCards,
				});
			}
		});
	});

	logger.info(`Membuka https://www.facebook.com/marketplace/you/selling ...`);
	await page.goto("https://www.facebook.com/marketplace/you/selling", {
		waitUntil: "domcontentloaded",
		timeout: 60000,
	});

	// Terminal CLI interactive loop
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	rl.on("line", async (line) => {
		const cmd = line.trim().toLowerCase();
		if (cmd === "c" || cmd === "cards") {
			try {
				const cardData = await page.evaluate(() => {
					const items = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
					return items.map((a, idx) => {
						let parent = a;
						for (let d = 0; d < 8 && parent; d++) {
							if (parent.innerText && parent.innerText.length > 20) break;
							parent = parent.parentElement;
						}
						const text = parent ? parent.innerText : a.innerText;
						return {
							index: idx + 1,
							href: a.href,
							textPreview: (text || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6),
						};
					});
				});

				fs.writeJsonSync(CARDS_DUMP_FILE, cardData, { spaces: 2 });
				logger.success(`[DUMP SUKSES] Berhasil mencatat ${cardData.length} kartu listing ke: scratch/sundul_cards_dump.json`);
			} catch (err) {
				logger.error(`Gagal dump kartu: ${err.message}`);
			}
		} else {
			try {
				const html = await page.content();
				fs.writeFileSync(SNAPSHOT_FILE, html, "utf-8");
				logger.success(`[SNAPSHOT SUKSES] DOM HTML disimpan ke: scratch/sundul_dom_dump.html`);
			} catch (e) {
				logger.error(`Gagal ambil snapshot: ${e.message}`);
			}
		}
	});

	process.on("SIGINT", async () => {
		logger.info("\nMenutup browser inspector...");
		rl.close();
		await browser.close().catch(() => {});
		process.exit(0);
	});
}

main().catch((err) => {
	logger.error(`Error: ${err.message}`);
	process.exit(1);
});
