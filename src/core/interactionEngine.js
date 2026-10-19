const path = require("node:path");
const fs = require("fs-extra");
const crypto = require("node:crypto");
const Logger = require("../utils/logger");
const { resolveAssetPath } = require("../utils/assetFiles");
const { detectImageType, isValidImageBuffer } = require("../utils/imageTypes");

class InteractionEngine {
	constructor(page, accountName = "BOT") {
		this.page = page;
		this.logger = new Logger(accountName);
	}

	async delay(min, max = min) {
		const ms = Math.floor(Math.random() * (max - min + 1) + min);
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	async humanType(field, text) {
		await field.click();
		let i = 0;
		while (i < text.length) {
			const char = text[i];
			
			// Occasionally make a typo and backspace (1% chance for normal characters)
			if (Math.random() < 0.01 && char !== '\n' && char !== ' ') {
				const typos = "abcdefghijklmnopqrstuvwxyz";
				const wrongChar = typos[Math.floor(Math.random() * typos.length)];
				await this.page.keyboard.type(wrongChar);
				await this.delay(50, 150);
				await this.page.keyboard.press("Backspace");
				await this.delay(100, 200);
			}

			if (char === "\n") {
				await this.page.keyboard.press("Shift+Enter");
				await this.delay(200, 500); // Pause longer after newline
			} else {
				await this.page.keyboard.type(char);
				
				// Burst typing: fast for a few chars, then short pause
				if (Math.random() < 0.15) { // 15% chance to pause
					await this.delay(20, 50);
				} else {
					await this.delay(5, 15); // Fast burst
				}
			}
			
			// Pause after punctuation or space
			if ([' ', '.', ',', '!', '?'].includes(char)) {
				await this.delay(30, 60);
			}
			
			i++;
		}
	}

	async withRetry(fn, retries = 3, interval = 2000) {
		for (let i = 0; i < retries; i++) {
			try {
				return await fn();
			} catch (err) {
				if (i === retries - 1) throw err;
				this.logger.warn(`Mengulangi tugas... (${i + 1}/${retries})`);
				await this.delay(interval, interval * 1.5);
			}
		}
	}

	async waitForCondition(fn, timeout = 10000, interval = 500) {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const res = await fn();
			if (res) return res;
			await new Promise((resolve) => setTimeout(resolve, interval));
		}
		return false;
	}

	async humanScroll(amountY = 300) {
		const steps = Math.floor(Math.random() * 3) + 2; // 2-4 steps
		const stepAmount = Math.floor(amountY / steps);
		
		for (let i = 0; i < steps; i++) {
			await this.page.mouse.wheel(0, stepAmount);
			await this.delay(150, 400); // Jeda baca manusiawi
		}
	}

	async humanHover(locator) {
		try {
			const box = await locator.boundingBox();
			if (box) {
				const startX = box.x + Math.random() * box.width;
				const startY = box.y + Math.random() * box.height;
				// Jitter steps to simulate hand shake
				await this.page.mouse.move(startX, startY, { steps: 5 });
				await this.delay(50, 150);
			}
		} catch (e) {
			// ignore
		}
	}

	/**
	 * Centralized navigation and FB stabilization.
	 */
	async navigateAndStabilize(url, timeout = 30000) {
		this.logger.info(`Navigasi ke: ${url}`);
		await this.page
			.goto(url, { waitUntil: "domcontentloaded", timeout })
			.catch((err) => {
				this.logger.warn(`Masalah navigasi: ${err.message}`);
			});

		// Wait for dynamic hydration
		await this.page
			.waitForSelector('[role="main"], [role="dialog"]', { timeout: 15000 })
			.catch(() => {});
	}

	/**
	 * Resolve relative or absolute photo paths to absolute paths.
	 */
	resolvePhotoPaths(photos = []) {
		return photos
			.map((p) => {
				if (!p) return null;
				return resolveAssetPath(String(p), { mustExist: true });
			})
			.filter((p) => p !== null);
	}

	/**
	 * Download image from URL and save to local assets.
	 */
	async downloadImage(url, subfolder = "scraped") {
		try {
			const imageUrl = new URL(url);
			const hostname = imageUrl.hostname.toLowerCase();
			const isFacebookImageHost = hostname.endsWith(".fbcdn.net") || hostname.endsWith(".fbsbx.com");
			if (
				imageUrl.protocol !== "https:" || !isFacebookImageHost ||
				imageUrl.username || imageUrl.password || imageUrl.port || subfolder !== "scraped"
			) {
				throw new Error("URL gambar tidak diizinkan");
			}

			const response = await this.page.request.get(imageUrl.href, { timeout: 10000, maxRedirects: 0 });
			if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
			const finalUrl = new URL(response.url());
			if (!finalUrl.hostname.toLowerCase().endsWith(".fbcdn.net") && !finalUrl.hostname.toLowerCase().endsWith(".fbsbx.com")) {
				throw new Error("Redirect gambar keluar dari domain Facebook");
			}
			const headers = response.headers();
			const contentType = String(headers["content-type"] || "").split(";")[0].toLowerCase();
			const contentLength = Number(headers["content-length"] || 0);
			if (contentLength > 10 * 1024 * 1024) throw new Error("Ukuran gambar melewati batas 10 MB");

			const buffer = await response.body();
			if (buffer.length > 10 * 1024 * 1024 || !isValidImageBuffer(buffer, contentType)) {
				throw new Error("Isi respons bukan gambar valid");
			}
			const imageType = detectImageType(buffer);
			const hash = crypto
				.createHash("sha256")
				.update(url)
				.digest("hex")
				.substring(0, 8);
			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, "-")
				.slice(0, 19);
			const filename = `img_${timestamp}_${hash}${imageType.extension}`;
			const filePath = path.join(process.cwd(), "assets", subfolder, filename);

			await fs.ensureDir(path.dirname(filePath));
			await fs.writeFile(filePath, buffer);

			this.logger.info(`Aset disimpan: ${filename}`);
			return `/assets/${subfolder}/${filename}`;
		} catch (err) {
			this.logger.warn(`Gagal mengunduh gambar: ${err.message}`);
			return null;
		}
	}

	async handleCombobox(field, value, variants = []) {
		this.logger.info(`Memproses combobox untuk nilai: ${value}`);
		try {
			await field.scrollIntoViewIfNeeded();
			await field.click({ force: true });
			await this.delay(1000, 2000);

			const found = await this.selectFromDropdown([value, ...variants]);
			if (found) return true;

			this.logger.info(`Mengetik "${value}" ke combobox...`);
			await this.clearInput(field);
			await this.page.keyboard.type(value, { delay: 10 });
			await this.delay(500, 1000);

			const foundAfterType = await this.selectFromDropdown([
				value,
				...variants,
			]);
			if (foundAfterType) return true;

			this.logger.warn(
				`Opsi "${value}" tetap tidak ditemukan. Menekan Enter sebagai fallback.`,
			);
			await this.page.keyboard.press("Enter");
			return true;
		} catch (error) {
			this.logger.error(`Kesalahan pada handleCombobox: ${error.message}`);
			return false;
		}
	}

	async selectFromDropdown(targets) {
		return await this.page.evaluate((list) => {
			const options = Array.from(
				document.querySelectorAll(
					'[role="option"], [role="listbox"] [role="button"], .x1n2onr6 [role="button"]',
				),
			);
			for (const t of list) {
				const target = options.find(
					(o) =>
						o.innerText.toLowerCase().includes(t.toLowerCase()) ||
						o.textContent.toLowerCase().includes(t.toLowerCase()),
				);
				if (target) {
					target.scrollIntoView({ block: "center" });
					target.click();
					return true;
				}
			}
			return false;
		}, targets);
	}

	async clearInput(field) {
		await field.click({ clickCount: 3 });
		await this.page.keyboard.press("Backspace");
		await field.evaluate((el) => {
			const input =
				el.tagName === "INPUT" || el.tagName === "TEXTAREA"
					? el
					: el.querySelector("input, textarea");
			if (input) {
				input.value = "";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});
	}

	async smartClick(selectors, key = "unknown") {
		const Health = require("./selectorHealth");
		for (let idx = 0; idx < selectors.length; idx++) {
			const sel = selectors[idx];
			// Tolak class hash FB: .x1n2onr6 gampang jebol, pakai role/aria/teks dulu
			if (/\.x[a-z0-9]{6,}/i.test(sel)) {
				this.logger.warn(`Selector rapuh dilewati [${key}]: ${sel.slice(0, 60)}`);
				continue;
			}
			try {
				const el = this.page.locator(sel).first();
				if (await el.isVisible({ timeout: 2000 })) {
					await el.click();
					Health.record(key, idx, selectors.length);
					if (idx > 0) this.logger.warn(`Fallback selector dipakai [${key}] idx=${idx}`);
					return true;
				}
			} catch (_e) {
				/* selector gagal dicoba, lanjut ke selector berikutnya */
			}
		}
		Health.record(key, -1, selectors.length);
		this.logger.error(`Semua selector gagal [${key}]. Dump HTML untuk self-heal.`);
		try {
			const html = await this.page.content().catch(() => "");
			if (html) {
				const fs = require("fs-extra");
				const path = require("node:path");
				const file = path.join(process.cwd(), "assets/debug", `domfail_${key}_${Date.now()}.html`);
				await fs.ensureDir(path.dirname(file));
				await fs.writeFile(file, html.slice(0, 200000));
			}
			if (this.page.screenshot) {
				await this.page.screenshot({ path: `assets/debug/domfail_${key}_${Date.now()}.png` }).catch(() => {});
			}
		} catch (_e) {}
		return false;
	}
}

module.exports = InteractionEngine;
