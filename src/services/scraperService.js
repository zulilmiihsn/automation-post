const Logger = require("../utils/logger");
const AIService = require("./aiService");
const InteractionEngine = require("../core/interactionEngine");

/**
 * ScraperService handles extraction logic for Facebook Marketplace & Post listings.
 * Optimized with high-precision selectors discovered via Live DOM Inspection.
 */
class ScraperService {
	constructor(page, accountName) {
		this.page = page;
		this.logger = new Logger(`Scraper-${accountName}`);
		this.engine = new InteractionEngine(page, `Scraper-${accountName}`);
	}

	/**
	 * Main orchestration method for scraping a single listing URL.
	 */
	async scrapeListing(url) {
		this.logger.info(`Memulai Scraping: ${url}`);

		// Hemat load: buang font + video (tak perlu untuk caption/foto)
		try {
			await this.page.route("**/*", (route) => {
				const t = route.request().resourceType();
				if (t === "font" || t === "media") return route.abort();
				return route.continue();
			});
		} catch (_e) {}
		await this.engine.navigateAndStabilize(url);
		await this._stabilizePost();

		this.logger.info("Ekstraksi data...");

		const captionResult = await this.extractCaption();
		const caption = captionResult.text;

		const data = {
			url,
			title: "Produk Facebook",
			price: "0",
			description: caption,
			category: "Lain-lain",
			location: "Tanjungredep",
			photos: [],
			attributes: {},
			scrapedAt: new Date().toISOString(),
		};

		if (!caption) {
			this.logger.error("Scraping dibatalkan: Tidak ada caption yang diekstrak.");
			data.photos = await this.extractImages("");
			return data;
		}

		// Unduh paralel sambil AI jalan paralel (AI hanya butuh caption)
		const urls = await this.collectImageUrls(caption);
		const [photos, enriched] = await Promise.all([
			this.downloadImages(urls),
			this.enrichWithAI(data),
		]);
		enriched.photos = photos;
		return enriched;
	}

	/**
	 * Recorder-grade stabilize: buka SeeMore scope kontainer post + scroll tipis.
	 * Cap 8 detik total agar tak picu badai virtualisasi FB.
	 */
	async _stabilizePost() {
		const run = (async () => {
			try {
				await this.page.evaluate(() => {
					const root =
						document.querySelector('div[role="dialog"][aria-modal="true"]') ||
						document.querySelector('div[role="dialog"]') ||
						document.querySelector('div[role="main"]') ||
						document.body;
					const btns = Array.from(root.querySelectorAll('div[role="button"], span'));
					const btn = btns.find((b) => /^(lihat selengkapnya|see more)$/i.test((b.innerText || "").trim()));
					if (btn) btn.click();
				});
			} catch (_e) {}
			try {
				await this.page.mouse.wheel(0, 300);
			} catch (_e) {}
			await this.engine.delay(400, 700);
		})();
		await Promise.race([
			run,
			new Promise((r) => setTimeout(r, 8000)),
		]);
		try {
			require("../core/selectorHealth").record("scraper.stabilize", 0, 1);
		} catch (_e) {}
	}

	/**
	 * Extracts the main product description from the page.
	 * Uses smart container detection to find the correct post modal.
	 */
	async extractCaption() {
		this.logger.method("TRY", "scraper.caption.extract", "lapis=adPreview|post|og|json|body");
		const captionResult = await this.page.evaluate(() => {
			const txt = (el) => (el && el.innerText ? el.innerText.trim() : "");
			const ok = (s) => s && s.length > 5;
			const containers = [
				...Array.from(document.querySelectorAll('div[role="dialog"][aria-modal="true"]')),
				...Array.from(document.querySelectorAll('div[role="dialog"]')),
				document.querySelector('div[role="main"]'),
				document.body,
			].filter(Boolean);

			// Lapis 1: adPreview klasik
			for (const c of containers) {
				const p = c.querySelector('div[data-ad-comet-preview="message"], div[data-ad-preview="message"]');
				if (p && ok(txt(p))) return { text: txt(p).slice(0, 4000), method: "adPreviewMessage" };
			}
			// Lapis 2: post message generik FB
			for (const c of containers) {
				const sels = [
					'div[data-ad-preview="message"]',
					'div[dir="auto"][data-testid]',
					'div[data-testid="post_message"]',
					'article div[dir="auto"]',
					'div[role="article"] div[dir="auto"]',
				];
				for (const s of sels) {
					const el = c.querySelector(s);
					if (el && ok(txt(el))) return { text: txt(el).slice(0, 4000), method: "postMessage:" + s.slice(0, 24) };
				}
			}
			// Lapis 3: meta og:description
			const og = document.querySelector('meta[property="og:description"]');
			if (og && ok(og.content)) return { text: og.content.trim().slice(0, 4000), method: "ogDescription" };
			// Lapis 4: JSON tertanam (comet payload)
			try {
				const scripts = Array.from(document.querySelectorAll("script:not([src])")).slice(0, 40);
				for (const sc of scripts) {
					const t = sc.textContent || "";
					const m = t.match(/"message"\s*:\s*\{\s*"text"\s*:\s*"([^"]{8,500})"/) || t.match(/"text"\s*:\s*"([^"]{20,1000})"/);
					if (m && ok(m[1])) return { text: m[1].slice(0, 4000), method: "embeddedJson" };
				}
			} catch (_e) {}
			// Lapis 5: body fallback panjang
			const body = (document.body.innerText || "").trim();
			if (ok(body)) return { text: body.slice(0, 2000), method: "bodyFallback" };
			return { text: "", method: "none" };
		});

		try {
			const Health = require("../core/selectorHealth");
			Health.record("scraper.caption", captionResult.text ? 0 : -1, 5);
		} catch (_e) {}
		if (captionResult.text) {
			this.logger.method("SUCCESS", "scraper.caption.extract", `method=${captionResult.method}`);
		} else {
			this.logger.method("FAIL", "scraper.caption.extract", "method=none");
		}
		return captionResult;
	}

	/**
	 * Loops through the image gallery in theater mode to capture high-res photos.
	 */
	async _collectVisibleHds(hint = "") {
		return await this.page.evaluate((hint) => {
			const hdOf = (img) => {
				try {
					const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
					if (ss) {
						let best = "";
						let bestW = -1;
						for (const part of String(ss).split(",")) {
							const m = part.trim().match(/^(https?:\S+)\s+(\d+)w$/);
							if (m && parseInt(m[2], 10) > bestW) {
								bestW = parseInt(m[2], 10);
								best = m[1];
							}
						}
						if (best && /^https?:/.test(best)) return best;
					}
				} catch (_e) {}
				return img.currentSrc || img.src || "";
			};
			let scope = document;
			try {
				if (hint) {
					const all = Array.from(document.querySelectorAll("div, span, p"));
					const anchor = all.find((el) => (el.innerText || "").includes(hint.slice(0, 20)) && (el.innerText || "").length < 4000);
					const post = anchor ? anchor.closest('div[role="dialog"], div[role="main"], article') : null;
					if (post) scope = post;
					else scope = document.querySelector('div[role="dialog"]') || document.querySelector('div[role="main"]') || document;
				} else {
					scope = document.querySelector('div[role="dialog"]') || document.querySelector('div[role="main"]') || document;
				}
			} catch (_e) {}
			const inPost = (img) => {
				try {
					if (img.closest("svg")) return false;
					const a = img.closest("a");
					if (a && /profil|profile/.test((a.getAttribute("aria-label") || "").toLowerCase())) return false;
				} catch (_e) {}
				return true;
			};
			const out = [];
			for (const i of Array.from(scope.querySelectorAll("img"))) {
				const hd = hdOf(i);
				if (!hd || (!hd.includes("fbcdn") && !hd.includes("scontent"))) continue;
				if (!((i.width > 250) || (i.naturalWidth > 250))) continue;
				if (!inPost(i)) continue;
				if (out.includes(hd)) continue;
				out.push(hd);
				if (out.length >= 10) break;
			}
			return out;
		}, String(hint || "").split("\n")[0] || "");
	}

	async downloadImages(urls = []) {
		const list = [...new Set((urls || []).filter(Boolean))].slice(0, 10);
		if (list.length === 0) return [];
		// Paralel 3 jalur: hemat ~1 detik per 2 foto
		const out = [];
		for (let i = 0; i < list.length; i += 3) {
			const chunk = list.slice(i, i + 3);
			const got = await Promise.all(chunk.map((u) => this.engine.downloadImage(u)));
			for (const f of got) if (f) out.push(f);
		}
		return out;
	}

	async extractImages(hint = "") {
		const urls = await this.collectImageUrls(hint);
		return await this.downloadImages(urls);
	}

	async collectImageUrls(hint = "") {
		this.logger.info("Mengumpulkan URL gambar HD...");
		const urls = [];
		const seenFbids = new Set();
		const captionHint = String(hint || "").split("\n")[0] || "";

		// Theater dulu: kualitas 117KB vs visible 14KB. Visible hanya sapu sisa.
		const containerSelector = await this.page.evaluate(() => {
			return document.querySelector('[role="dialog"]')
				? '[role="dialog"]'
				: '[role="main"]';
		});

		const postImages = await this.page
			.locator(`${containerSelector} img[src*="fbcdn"], ${containerSelector} img[src*="scontent"]`)
			.all();

		if (postImages.length > 0) {
				try {
					this.logger.method("TRY", "scraper.images.openTheater", `candidates=${postImages.length}`);

					// Recorder-grade: pilih gambar terbesar (area), bukan elemen pertama
					const targetImgId = await this.page.evaluate((containerSel) => {
						const imgs = Array.from(
							document.querySelector(containerSel)?.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]') || []
						);
						const big = imgs
							.map((img) => ({ img, area: (img.naturalWidth * img.naturalHeight) || (img.width * img.height) || 0 }))
							.filter((x) => x.area > 0 && x.img.offsetWidth > 200 && x.img.offsetHeight > 50)
							.sort((a, b) => b.area - a.area)[0];
						const target = big ? big.img : null;
						if (!target) return null;
						const id = 'temp-theater-' + Math.random().toString(36).substring(2, 9);
						target.setAttribute('data-temp-id', id);
						return id;
					}, containerSelector);

					if (!targetImgId) {
						this.logger.method("FAIL", "scraper.images.openTheater", "reason=no-large-image");
						this.logger.warn("Tidak ada gambar besar (>200px) ditemukan untuk membuka theater.");
					} else {
						const targetImg = this.page.locator(`[data-temp-id="${targetImgId}"]`).first();
						await targetImg.click({ force: true });
						await this.engine.delay(800, 1200);
						this.logger.method("SUCCESS", "scraper.images.openTheater", "index=0");
					}
				} catch (_e) {
					this.logger.method("FAIL", "scraper.images.openTheater");
					this.logger.warn("Gagal mengklik gambar untuk mode bioskop.");
				}
			}

		const isTheater = await this.page.evaluate(
			() => !!document.querySelector('[role="dialog"]'),
		);

		if (!isTheater) {
			this.logger.warn("Tidak dalam mode bioskop, hanya mengambil gambar yang terlihat.");
			this.logger.method("TRY", "scraper.images.visibleFbcdnFallback");
			const found = await this.page.evaluate(() => {
				const hdOf = (img) => {
					try {
						const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
						if (ss) {
							let best = "";
							let bestW = -1;
							for (const part of String(ss).split(",")) {
								const m = part.trim().match(/^(https?:\S+)\s+(\d+)w$/);
								if (m && parseInt(m[2], 10) > bestW) {
									bestW = parseInt(m[2], 10);
									best = m[1];
								}
							}
							if (best && /^https?:/.test(best)) return best;
						}
					} catch (_e) {}
					return img.currentSrc || img.src || "";
				};
				const seen = new Set();
				const out = [];
				for (const i of Array.from(document.querySelectorAll("img"))) {
					const hd = hdOf(i);
					if (!hd || seen.has(hd)) continue;
					if (!hd.includes("fbcdn") && !hd.includes("scontent")) continue;
					if (!((i.width > 250) || (i.naturalWidth > 250))) continue;
					seen.add(hd);
					out.push(hd);
					if (out.length >= 10) break;
				}
				return out;
			});
			for (const url of found) {
				const id = (url.match(/fbid=(\d+)/) || [])[1] || url;
				if (seenFbids.has(id)) continue;
				seenFbids.add(id);
				urls.push(url);
			}
			this.logger.method(
				urls.length > 0 ? "SUCCESS" : "FAIL",
				"scraper.images.visibleFbcdnFallback",
				`collected=${urls.length}`,
			);
			try {
				require("../core/selectorHealth").record("scraper.images", urls.length > 0 ? 0 : -1, 2);
			} catch (_e) {}
			return urls;
		}

		let stalls = 0;
		for (let i = 0; i < 10; i++) {
			let imgUrl = null;
			let identifier = null;

			try {
				this.logger.method("TRY", "scraper.images.theaterMainImage", `index=${i}`);
				const result = await this.page.waitForFunction((seen) => {
					const hdOf = (img) => {
						try {
							const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
							if (ss) {
								let best = "";
								let bestW = -1;
								for (const part of String(ss).split(",")) {
									const m = part.trim().match(/^(https?:\S+)\s+(\d+)w$/);
									if (m && parseInt(m[2], 10) > bestW) {
										bestW = parseInt(m[2], 10);
										best = m[1];
									}
								}
								if (best && /^https?:/.test(best)) return best;
							}
						} catch (_e) {}
						return img.currentSrc || img.src || "";
					};
					const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]'));
					const largeImgs = imgs.filter(img => img.width > 250 || img.naturalWidth > 250);
					if (largeImgs.length === 0) return null;

					// Sort images by size descending to find the main theater photo
					largeImgs.sort((a, b) => {
						const aSize = (a.naturalWidth * a.naturalHeight) || (a.width * a.height) || 0;
						const bSize = (b.naturalWidth * b.naturalHeight) || (b.width * b.height) || 0;
						return bSize - aSize;
					});

					const theaterImg = largeImgs[0];
					const hd = hdOf(theaterImg);
					if (!theaterImg || !hd) return null;

					const fbidMatch = hd.match(/fbid=(\d+)/);
					const id = fbidMatch ? fbidMatch[1] : hd;
					
					return !seen.includes(id) ? { url: hd, id: id } : null;
				}, Array.from(seenFbids), { timeout: 1800 });
				
				const data = await result.jsonValue();
				imgUrl = data.url;
				identifier = data.id;
				this.logger.method("SUCCESS", "scraper.images.theaterMainImage", `index=${i}`);
			} catch (e) {
				stalls++;
				this.logger.method("FAIL", "scraper.images.theaterMainImage", `index=${i} stall=${stalls}`);
				if (stalls >= 2) {
					this.logger.info("Sudah mencapai ujung galeri foto.");
					break;
				}
				// Fallback 1: klik thumbnail strip belum terlihat di dialog (tanpa dump, ini alur normal)
				try {
					const clicked = await this.page.evaluate((seen) => {
						const dlg = document.querySelector('div[role="dialog"]') || document;
						const thumbs = Array.from(dlg.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]'));
						for (const t of thumbs) {
							const src = t.currentSrc || t.src || "";
							const idm = src.match(/fbid=(\d+)/);
							const id = idm ? idm[1] : src;
							if (!id || seen.includes(id)) continue;
							const area = (t.naturalWidth * t.naturalHeight) || (t.width * t.height) || 0;
							if (area < 2500) continue;
							t.scrollIntoView({ block: "nearest" });
							t.click();
							return true;
						}
						return false;
					}, Array.from(seenFbids));
					if (clicked) this.logger.method("SUCCESS", "scraper.images.thumbStrip", `index=${i}`);
					else {
						// Tombol next dicoba sunyi via evaluate (tanpa dump screenshot mahal)
						await this.page.evaluate(() => {
							const btn = document.querySelector('[aria-label="Next"], [aria-label="Berikutnya"]');
							if (btn) btn.click();
						}).catch(() => {});
						await this.page.keyboard.press("ArrowRight").catch(() => {});
					}
				} catch (_e) {}
				await this.engine.delay(600, 900);
				continue;
			}

			stalls = 0;
			seenFbids.add(identifier);
			if (urls.length < 10) urls.push(imgUrl);

			// Maju galeri: ArrowRight dulu, tombol next jadi cadangan di loop berikut
			this.logger.method("SUCCESS", "scraper.images.onPoint", `index=${i}`);
			await this.page.keyboard.press("ArrowRight");
			
			// Jeda agar animasi slide selesai
			await this.engine.delay(500, 700);
		}

		await this.page.keyboard.press("Escape");
		// Sapu sisa scope kontainer post saja (bukan avatar/feed lain)
		try {
			const extra = await this._collectVisibleHds(captionHint);
			for (const url of extra) {
				const id = (url.match(/fbid=(\d+)/) || [])[1] || url;
				if (seenFbids.has(id) || urls.length >= 10) continue;
				seenFbids.add(id);
				urls.push(url);
			}
			if (extra.length > 0) this.logger.method("SUCCESS", "scraper.images.visibleSweep", `collected=${urls.length}`);
		} catch (_e) {}
		try {
			require("../core/selectorHealth").record("scraper.images", urls.length > 0 ? 0 : -1, 2);
		} catch (_e) {}
		this.logger.method(urls.length > 0 ? "SUCCESS" : "FAIL", "scraper.images.theater", `collected=${urls.length}`);
		return urls;
	}

	/**
	 * Enriches scraped data using AI (Qwen3).
	 */
	async enrichWithAI(data) {
		const validConditions = ["Baru", "Bekas - Seperti Baru", "Bekas - Baik", "Bekas - Cukup"];

		// Set default awal jika condition kosong/tidak valid
		if (!data.condition || !validConditions.includes(data.condition)) {
			data.condition = "Bekas - Seperti Baru";
		}

		if (!data.description || data.description.length < 10) return data;

		try {
			const aiResult = await AIService.processListing(data.description);
			if (aiResult) {
				const enriched = {
					...data,
					...aiResult.mapping,
					description: aiResult.copywriting?.description || data.description,
					ai_analysis: aiResult.copywriting?.analysis || "",
					missing_info: aiResult.copywriting?.missing_info || [],
				};

				// Pastikan condition terisi, jika tidak atau tidak valid maka default "Bekas - Seperti Baru"
				if (!enriched.condition || !validConditions.includes(enriched.condition)) {
					enriched.condition = "Bekas - Seperti Baru";
				}

				return enriched;
			}
		} catch (err) {
			this.logger.error("Pengayaan AI gagal", err);
		}
		return data;
	}
}

module.exports = ScraperService;
