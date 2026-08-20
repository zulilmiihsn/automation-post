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

		await this.engine.navigateAndStabilize(url);

		this.logger.info("Ekstraksi data...");

		const captionResult = await this.extractCaption();
		const caption = captionResult.text;
		const photos = await this.extractImages();

		const data = {
			url,
			title: "Produk Facebook",
			price: "0",
			description: caption,
			category: "Lain-lain",
			location: "Tanjungredep",
			photos: photos,
			attributes: {},
			scrapedAt: new Date().toISOString(),
		};

		if (!caption) {
			this.logger.error("Scraping dibatalkan: Tidak ada caption yang diekstrak.");
			return data;
		}

		return await this.enrichWithAI(data);
	}

	/**
	 * Extracts the main product description from the page.
	 * Uses smart container detection to find the correct post modal.
	 */
	async extractCaption() {
		this.logger.method("TRY", "scraper.caption.extract", "candidates=dialog|main");
		const captionResult = await this.page.evaluate(() => {
			const candidates = [
				...Array.from(
					document.querySelectorAll('div[role="dialog"][aria-modal="true"]'),
				),
				...Array.from(document.querySelectorAll('div[role="dialog"]')),
				document.querySelector('div[role="main"]'),
			].filter(Boolean);

			for (const container of candidates) {
				const primary = container.querySelector(
					'div[data-ad-comet-preview="message"], div[data-ad-preview="message"]',
				);
				if (primary && primary.innerText.trim().length > 5) {
					return { text: primary.innerText.trim(), method: "adPreviewMessage" };
				}
			}

			return { text: "", method: "none" };
		});

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
	async extractImages() {
		this.logger.info("Mendownload gambar HD...");
		const images = [];
		const seenFbids = new Set();

		const containerSelector = await this.page.evaluate(() => {
			return document.querySelector('[role="dialog"]')
				? '[role="dialog"]'
				: '[role="main"]';
		});

		const postImages = await this.page
			.locator(`${containerSelector} img[src*="fbcdn"]`)
			.all();

		if (postImages.length > 0) {
				try {
					this.logger.method("TRY", "scraper.images.openTheater", `candidates=${postImages.length}`);

					// Filter langsung dari DOM: ambil elemen pertama yang width > 200
					// Hindari fallback loop — langsung tuju kandidat yang valid
					const targetImgId = await this.page.evaluate((containerSel) => {
						const imgs = Array.from(
							document.querySelector(containerSel)?.querySelectorAll('img[src*="fbcdn"]') || []
						);
						const target = imgs.find(img => img.offsetWidth > 200 && img.offsetHeight > 50);
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
						await this.engine.delay(2000, 2500);
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
			const urls = await this.page.evaluate(() => {
				return Array.from(document.querySelectorAll("img"))
					.filter((i) => i.src.includes("fbcdn") && i.width > 250)
					.map((i) => i.src);
			});
			for (const url of urls) {
				const filename = await this.engine.downloadImage(url);
				if (filename) images.push(filename);
			}
			this.logger.method(
				images.length > 0 ? "SUCCESS" : "FAIL",
				"scraper.images.visibleFbcdnFallback",
				`downloaded=${images.length}`,
			);
			return images;
		}

		for (let i = 0; i < 10; i++) {
			let imgUrl = null;
			let identifier = null;

			try {
				this.logger.method("TRY", "scraper.images.theaterMainImage", `index=${i}`);
				const result = await this.page.waitForFunction((seen) => {
					const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn"]'));
					const largeImgs = imgs.filter(img => img.width > 250 || img.naturalWidth > 250);
					if (largeImgs.length === 0) return null;

					// Sort images by size descending to find the main theater photo
					largeImgs.sort((a, b) => {
						const aSize = (a.naturalWidth * a.naturalHeight) || (a.width * a.height) || 0;
						const bSize = (b.naturalWidth * b.naturalHeight) || (b.width * b.height) || 0;
						return bSize - aSize;
					});

					const theaterImg = largeImgs[0];
					if (!theaterImg || !theaterImg.src) return null;

					const fbidMatch = theaterImg.src.match(/fbid=(\d+)/);
					const id = fbidMatch ? fbidMatch[1] : theaterImg.src;
					
					return !seen.includes(id) ? { url: theaterImg.src, id: id } : null;
				}, Array.from(seenFbids), { timeout: 4000 });
				
				const data = await result.jsonValue();
				imgUrl = data.url;
				identifier = data.id;
				this.logger.method("SUCCESS", "scraper.images.theaterMainImage", `index=${i}`);
			} catch (e) {
				this.logger.method("FAIL", "scraper.images.theaterMainImage", `index=${i}`);
				this.logger.info("Sudah mencapai ujung galeri foto.");
				break;
			}

			seenFbids.add(identifier);
			const filename = await this.engine.downloadImage(imgUrl);
			if (filename) images.push(filename);

			// Menggunakan ArrowRight secara langsung (100% on point) tanpa mencoba cari tombol next
			this.logger.method("SUCCESS", "scraper.images.onPoint", `index=${i}`);
			await this.page.keyboard.press("ArrowRight");
			
			// Jeda agar animasi slide selesai
			await this.engine.delay(1000, 1500);
		}

		await this.page.keyboard.press("Escape");
		return images;
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
