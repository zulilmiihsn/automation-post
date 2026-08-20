const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("node:path");
const Logger = require("../utils/logger");

chromium.use(StealthPlugin());

/** Anti-detection: random viewport per session */
const _randomViewport = () => ({
	width: 1400 + Math.floor(Math.random() * 400),
	height: 800 + Math.floor(Math.random() * 300),
});

const _UA_POOL = [
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];
const _randomUA = () => _UA_POOL[Math.floor(Math.random() * _UA_POOL.length)];

class BrowserManager {
	constructor(options = {}) {
		this.accountName = options.accountName || "BROWSER";
		this.logger = new Logger(this.accountName);
		this.userDataDir =
			options.userDataDir || path.join(process.cwd(), "fb-profile");
		this.context = null;
		this.browser = null;
		this.viewport = _randomViewport();
	}

	/**
	 * Launch persistent browser context with anti-detection.
	 * @param {{ headless?: boolean, remotePort?: number }} options
	 * @returns {Promise<import('playwright-core').Page>}
	 */
	async init(options = {}) {
		const { headless = false, remotePort = 0 } = options;

		try {
			this.logger.info(`Meluncurkan browser dengan profil: ${this.userDataDir} (viewport: ${this.viewport.width}x${this.viewport.height})`);

			this.context = await chromium.launchPersistentContext(this.userDataDir, {
				headless,
				viewport: this.viewport,
				userAgent: _randomUA(),
				permissions: ["clipboard-read", "clipboard-write"],
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-gpu",
					"--disable-dev-shm-usage",
					`--remote-debugging-port=${remotePort}`,
					"--disable-extensions",
					"--no-singleton",
					"--disable-blink-features=AutomationControlled",
					// --- Hemat RAM (laptop 6GB) ---
					"--disable-background-networking",
					"--disable-features=Translate,BackForwardCache,MediaRouter,OptimizationHints,IsolateOrigins,site-per-process",
					"--js-flags=--max-old-space-size=512",
					"--renderer-process-limit=2",
					"--mute-audio",
				],
				ignoreDefaultArgs: ["--enable-automation"],
			});

			// Headless: block heavy resources to save RAM
			if (headless) {
				await this.context.route("**/*", (route) => {
					const type = route.request().resourceType();
					if (type === "image" || type === "media" || type === "font") {
						return route.abort();
					}
					return route.continue();
				});
			}

			const pages = this.context.pages();
			this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

			// Auto-accept any browser dialogs (e.g., "Leave site?") to prevent hanging
			this.page.on('dialog', async dialog => await dialog.accept());

			// Grant clipboard permissions
			await this.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://www.facebook.com" }).catch(() => {});

			// Anti-detection: mask webdriver flag and spoof navigator properties
			await this.page.addInitScript(() => {
				Object.defineProperty(navigator, 'webdriver', { get: () => false });
				
				// Overwrite the `plugins` property to use a custom getter.
				Object.defineProperty(navigator, 'plugins', {
					get: () => [1, 2, 3], // Fakes having plugins
				});
				
				// Overwrite the `languages` property to use a custom getter.
				Object.defineProperty(navigator, 'languages', {
					get: () => ['id-ID', 'id', 'en-US', 'en'],
				});

				// WebGL Spoofing (Mocking vendor to appear as standard Intel/NVIDIA instead of SwiftShader/Mesa)
				const getParameter = WebGLRenderingContext.prototype.getParameter;
				WebGLRenderingContext.prototype.getParameter = function(parameter) {
					// UNMASKED_VENDOR_WEBGL
					if (parameter === 37445) {
						return 'Google Inc. (Intel)';
					}
					// UNMASKED_RENDERER_WEBGL
					if (parameter === 37446) {
						return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
					}
					return getParameter.apply(this, arguments);
				};
			});

			this.logger.success("Browser berhasil diinisialisasi.");
			return this.page;
		} catch (err) {
			this.logger.error("Gagal menginisialisasi browser", err);
			throw err;
		}
	}

	async close() {
		if (this.context) {
			const pages = this.context.pages();
			for (const p of pages) {
				await p.close().catch(() => {});
			}
			await this.context.close();
		}
		this.page = null;
		this.context = null;
	}

	/**
	 * Wait for user to manually log in to Facebook
	 * @param {number} timeoutMs
	 * @returns {Promise<{success: boolean, name?: string, error?: string}>}
	 */
	async waitForLogin(timeoutMs = 120000) {
		if (!this.page) throw new Error("Browser not initialized");
		try {
			// Wait for elements that indicate user is logged in
			await this.page.waitForSelector(
				'[aria-label="Facebook"], [aria-label="Beranda"], [aria-label="Home"], [aria-label="Profil Anda"]',
				{
					timeout: timeoutMs,
					state: "visible",
				},
			);
			const title = await this.page.title();
			const cleanName = title
				.replace(/\(\d+[^)]*\)/g, "")
				.replace(/\|\s*Facebook/gi, "")
				.replace(/-\s*Facebook/gi, "")
				.replace(/·\s*Facebook/gi, "")
				.replace(/\bFacebook\b/gi, "")
				.trim();
			return {
				success: true,
				name: cleanName || "User",
			};
		} catch (e) {
			return { success: false, error: `Login timeout or failed: ${e.message}` };
		}
	}

	async takeScreenshot(name) {
		if (!this.page) return;
		const filename = `debug_${name}_${Date.now()}.png`;
		const filePath = path.join(process.cwd(), "assets/debug", filename);
		await require("fs-extra").ensureDir(path.dirname(filePath));
		await this.page.screenshot({ path: filePath });
		this.logger.info(`Screenshot disimpan: ${filename}`);
	}

	/**
	 * Get logged-in user profile info
	 * @returns {Promise<{name: string, pic: string} | null>}
	 */
	async getProfileInfo() {
		if (!this.page) return null;
		try {
			this.logger.info("Mengambil info profil...");

			// Step 1: Navigasi paksa ke profil sendiri
			const currentUrl = this.page.url();
			if (
				!currentUrl.includes("/me") &&
				!currentUrl.includes("profile.php") &&
				!currentUrl.match(/facebook\.com\/[a-zA-Z0-9.]+$/)
			) {
				this.logger.info("Mengarahkan ke halaman /me untuk mengambil data profil lengkap...");
				await this.page.goto("https://www.facebook.com/me", {
					waitUntil: "domcontentloaded",
					timeout: 30000,
				}).catch(() => {});
			}

			// Tunggu redirect & render sampai title atau h1 siap (max 10s)
			for (let i = 0; i < 10; i++) {
				await new Promise((r) => setTimeout(r, 1000));
				try {
					const title = await this.page.title();
					const clean = title
						.replace(/^\s*\(\d+[^)]*\)\s*/, "")
						.replace(/\s*\|\s*Facebook.*$/i, "")
						.replace(/\s*-\s*Facebook.*$/i, "")
						.replace(/\s*·\s*Facebook.*$/i, "")
						.replace(/\bFacebook\b/gi, "")
						.trim();
					if (clean && clean.length >= 2 && !/facebook/i.test(clean)) {
						break;
					}
				} catch (_) {}
			}

			const profileData = await this.page.evaluate(() => {
				const results = { name: "", pic: "" };

				const BANNED_NAMES = new Set([
					"facebook",
					"edit profile",
					"edit profil",
					"sunting profil",
					"edit cover photo",
					"sunting foto sampul",
					"your profile",
					"profil anda",
					"lihat profil anda",
					"see your profile",
					"home",
					"beranda",
					"friends",
					"teman",
					"groups",
					"grup",
					"marketplace",
					"watch",
					"video",
					"gaming",
					"notifications",
					"notifikasi",
					"messages",
					"pesan",
					"messenger",
					"chat",
					"menu",
					"settings",
					"pengaturan",
					"log out",
					"keluar",
					"privacy",
					"privasi",
					"create",
					"buat",
					"search",
					"cari",
					"help",
					"bantuan",
					"user",
					"pengguna",
					"akun",
					"account",
					"intro",
					"about",
					"tentang",
					"photos",
					"foto",
					"posts",
					"postingan",
					"reels",
					"stories",
					"cerita",
					"feeds",
					"linimasa",
					"timeline",
					"more",
					"lainnya",
					"add to story",
					"tambahkan ke cerita",
					"manage",
					"kelola",
				]);

				const cleanFbText = (str) => {
					if (!str) return "";
					return str
						.replace(/^\s*\(\d+[^)]*\)\s*/, "")
						.replace(/\s*\|\s*Facebook.*$/i, "")
						.replace(/\s*-\s*Facebook.*$/i, "")
						.replace(/\s*·\s*Facebook.*$/i, "")
						.replace(/\bFacebook\b/gi, "")
						.trim();
				};

				const isValidName = (n) => {
					if (!n || typeof n !== "string") return false;
					const trimmed = n.trim();
					if (trimmed.length < 2 || trimmed.length > 70) return false;
					const lower = trimmed.toLowerCase();
					if (lower.includes("facebook")) return false;
					if (/^\(\d+/.test(trimmed)) return false;
					if (BANNED_NAMES.has(lower)) return false;
					return true;
				};

				// 1. CARI DARI TITLE (Paling akurat setelah redirect /me -> "Nama User | Facebook")
				const titleName = cleanFbText(document.title);
				if (isValidName(titleName)) {
					results.name = titleName;
				}

				// 2. CARI DARI H1 di halaman profil (div[role="main"] h1)
				if (!results.name) {
					const mainH1 = document.querySelector('div[role="main"] h1, h1[dir="auto"], h1 span[dir="auto"], h1');
					const h1Text = mainH1?.innerText?.trim();
					if (isValidName(h1Text)) {
						results.name = h1Text;
					}
				}

				// 3. Fallback: Cari H1 lain di halaman
				if (!results.name) {
					const h1Elements = Array.from(document.querySelectorAll("h1"));
					for (const h1 of h1Elements) {
						const text = h1.innerText?.trim();
						if (isValidName(text)) {
							results.name = text;
							break;
						}
					}
				}

				// 4. Fallback: meta og:title
				if (!results.name) {
					const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
					const cleanedOg = cleanFbText(ogTitle);
					if (isValidName(cleanedOg)) {
						results.name = cleanedOg;
					}
				}

				// 5. Fallback: Script Initial Data (CurrentUserInitialData / viewer)
				if (!results.name) {
					try {
						const scripts = Array.from(document.querySelectorAll("script:not([src])"));
						for (const s of scripts) {
							const content = s.textContent || "";
							const m1 = content.match(/"NAME":"([^"]+)"/);
							if (m1 && isValidName(m1[1])) {
								results.name = m1[1];
								break;
							}
							const m2 = content.match(/"USER_NAME":"([^"]+)"/);
							if (m2 && isValidName(m2[2])) {
								results.name = m2[2];
								break;
							}
						}
					} catch (_) {}
				}

				// 6. Fallback: Navigasi link profil
				if (!results.name) {
					const navLinks = Array.from(
						document.querySelectorAll('div[role="navigation"] a, a[href*="/me"], a[href*="profile.php"]')
					);
					for (const a of navLinks) {
						const span = a.querySelector('span[dir="auto"], span');
						const text = span?.innerText?.trim();
						if (isValidName(text)) {
							results.name = text;
							break;
						}
						const aria = a.getAttribute("aria-label");
						if (isValidName(aria)) {
							results.name = aria;
							break;
						}
					}
				}

				// 7. CARI FOTO PROFIL (Strategy: Name-Match & scontent)
				if (results.name) {
					const nameMatchSelectors = [
						`svg[aria-label="${results.name}"] image`,
						`img[aria-label="${results.name}"]`,
						`div[aria-label="${results.name}"] img`,
						`a[aria-label="${results.name}"] img`,
						`svg[aria-label*="${results.name}"] image`,
						`img[aria-label*="${results.name}"]`,
					];

					for (const sel of nameMatchSelectors) {
						try {
							const el = document.querySelector(sel);
							if (el) {
								const src =
									el.getAttribute("xlink:href") ||
									el.getAttribute("href") ||
									el.src;
								if (src?.includes("scontent")) {
									results.pic = src;
									break;
								}
							}
						} catch (_e) {}
					}
				}

				// Fallback Foto A: Label "Foto Profil" / "Profile photo"
				if (!results.pic) {
					const fallbackLabels = [
						'img[aria-label="Profile photo"]',
						'img[aria-label="Foto profil"]',
						'img[aria-label="Foto Profil"]',
						'div[aria-label="Profile photo"] img',
						'div[aria-label="Foto profil"] img',
					];
					for (const sel of fallbackLabels) {
						const el = document.querySelector(sel);
						if (el?.src?.includes("scontent")) {
							results.pic = el.src;
							break;
						}
					}
				}

				// Fallback Foto B: SVG scan with size check (Excluding cover photo)
				if (!results.pic) {
					const svgImages = Array.from(document.querySelectorAll("svg image"));
					for (const img of svgImages) {
						const src =
							img.getAttribute("xlink:href") ||
							img.getAttribute("href") ||
							img.getAttribute("src");
						const label = img.closest("svg")?.getAttribute("aria-label") || "";

						if (
							label.toLowerCase().includes("sampul") ||
							label.toLowerCase().includes("cover")
						)
							continue;

						if (src?.includes("scontent")) {
							const rect = img.getBoundingClientRect();
							if (
								rect.width > 80 &&
								rect.width < 300 &&
								Math.abs(rect.width - rect.height) < 20
							) {
								results.pic = src;
								break;
							}
						}
					}
				}

				return results;
			});

			if (profileData.name && !/facebook/i.test(profileData.name)) {
				this.logger.success(`Profil ditemukan: ${profileData.name}`);
				return profileData;
			}

			return null;
		} catch (err) {
			this.logger.warn(`Gagal mengambil info profil: ${err.message}`);
			return null;
		}
	}
}

module.exports = BrowserManager;
