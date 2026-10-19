require("dotenv").config();
const { CATEGORY_TRANSLATIONS, FIELD_MAP, FIELD_CONFIG } = require("../core/constants");
const Logger = require("../utils/logger");
const { requestAICompletion } = require("./aiClient");
const { inferListingCategory } = require("./aiListingClassifier");
const { normalizeListingPrice, sanitizeListingDescription } = require("./aiListingFormatters");
const {
	parseAIObject,
	parseGeneratedFields,
	parseListingOptimization,
	parsePriceSuggestion,
	parseTags,
} = require("./aiOutputs");
const { getAIConfig } = require("./aiProvider");
const {
	JSON_SYSTEM_PROMPT,
	buildCategoryPrompt,
	buildFieldsPrompt,
	buildListingPrompt,
	buildPriceSuggestionPrompt,
	buildTagsPrompt,
} = require("./aiPrompts");

class AIService {
	constructor() {
		const aiConfig = getAIConfig("heavy");
		this.aiConfig = aiConfig;
		this.apiKey = aiConfig.apiKey;
		this.apiKeyEnv = aiConfig.apiKeyEnv;
		this.provider = aiConfig.provider;
		this.model = aiConfig.model;
		this.categories = Object.keys(CATEGORY_TRANSLATIONS);
		this.logger = new Logger("AI-SERVICE");
	}

	requestCompletion(request) {
		return requestAICompletion(this.aiConfig, request);
	}

	formatAIError(error, defaultMsg = "Gagal memproses AI") {
		const rawMsg = error.response?.data?.error?.message || error.message || "";
		const status = error.response?.status;

		if (status === 429 || rawMsg.includes("Rate limit") || rawMsg.includes("TPM") || rawMsg.includes("rate_limit_exceeded")) {
			const waitMatch = rawMsg.match(/try again in ([\d.]+)s/i);
			const seconds = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 20;
			return `Kuota AI per menit tercapai (Rate Limit). Silakan tunggu ~${seconds} detik lalu coba lagi.`;
		}

		if (rawMsg.includes("API key") || status === 401) {
			return `${this.apiKeyEnv} tidak valid atau belum diatur di file .env.`;
		}

		if (error.code === "ECONNABORTED" || rawMsg.includes("timeout")) {
			return "Koneksi ke AI timeout (terlalu lama). Silakan coba beberapa saat lagi.";
		}

		return `${defaultMsg}: ${rawMsg}`;
	}

	async processListing(rawCaption) {
		if (!this.apiKey) {
			this.logger.error(`${this.apiKeyEnv} tidak ditemukan di .env`);
			return null;
		}

		this.logger.info(`Mengoptimalkan data listing menggunakan ${this.model}...`);

		const prompt = buildListingPrompt(rawCaption, this.categories);

		try {
			const content = await this.requestCompletion({
				messages: [
					{
						role: "system",
						content: JSON_SYSTEM_PROMPT,
					},
					{ role: "user", content: prompt },
				],
				temperature: 0.3,
				max_tokens: 2048,
				response_format: { type: "json_object" },
			});
			const parsed = parseListingOptimization(content, {
				allowedCategories: this.categories,
				fieldsByCategory: FIELD_MAP,
			});

			// Sanitize title to ensure pure search keywords at front
			if (parsed?.mapping?.title) {
				parsed.mapping.title = parsed.mapping.title
					.replace(/^\[READY[^\]]*\]\s*/i, "")
					.replace(/^Bismillah(\.\.\.)?\s*/i, "")
					.replace(/^(Dijual|Jual)\s+/i, "")
					.trim();
			}

			// Normalize price to full rupiah
			if (parsed?.mapping?.price) {
				parsed.mapping.price = normalizeListingPrice(parsed.mapping.price, parsed.mapping.category);
			}

			// Sanitize description natural price
			if (parsed?.copywriting?.description) {
				parsed.copywriting.description = sanitizeListingDescription(parsed.copywriting.description);
			}

			return parsed;
		} catch (error) {
			this.logger.error(this.formatAIError(error, "Gagal optimasi AI"));
			return null;
		}
	}

	async generateTags({ title, location, category, condition }) {
		if (!this.apiKey) {
			this.logger.error(`${this.apiKeyEnv} tidak ditemukan di .env`);
			throw new Error(`${this.apiKeyEnv} tidak ditemukan di .env`);
		}

		this.logger.info(`Generating tags using AI for: "${title}"...`);

		const prompt = buildTagsPrompt({ title, location, category, condition });

		try {
			const content = await this.requestCompletion({
				messages: [
					{
						role: "system",
						content: JSON_SYSTEM_PROMPT,
					},
					{ role: "user", content: prompt },
				],
				temperature: 0.6,
				max_tokens: 512,
				response_format: { type: "json_object" },
			});
			return parseTags(content, { title, location, category, condition });
		} catch (error) {
			const msg = this.formatAIError(error, "Gagal generate tags lewat AI");
			this.logger.error(msg);
			throw new Error(msg);
		}
	}
	async generateFieldsFromDescription({ description }) {
		if (!this.apiKey) {
			this.logger.error(`${this.apiKeyEnv} tidak ditemukan di .env`);
			throw new Error(`${this.apiKeyEnv} tidak ditemukan di .env`);
		}

		let category = inferListingCategory(description);
		if (category) {
			this.logger.info(`Kategori dikenali dari deskripsi: "${category}"; lewati request klasifikasi.`);
		} else {
			this.logger.info("Detecting category for description...");
			category = "Lain-lain";
			try {
				const catContent = parseAIObject(await this.requestCompletion({
					messages: [
						{ role: "system", content: JSON_SYSTEM_PROMPT },
						{
							role: "user",
						content: buildCategoryPrompt(description, this.categories),
						},
					],
					temperature: 0.1,
					max_tokens: 256,
					response_format: { type: "json_object" },
				}));
				if (this.categories.includes(catContent?.category)) {
					category = catContent.category;
				} else if (typeof catContent?.category === "string") {
					const found = this.categories.find(c => c.toLowerCase() === catContent.category.toLowerCase());
					if (found) category = found;
				}
			} catch (catErr) {
				this.logger.warn(`Gagal mendeteksi kategori lewat AI; fallback ke ${category}: ${catErr.message}`);
			}
		}

		this.logger.info(`Detected category: "${category}". Generating fields with filtered config...`);

		// 2. Filter FIELD_MAP and FIELD_CONFIG for only the detected category
		const relevantFields = FIELD_MAP[category] || [];
		const trimmedFieldConfig = {};
		for (const field of relevantFields) {
			if (FIELD_CONFIG[field]) {
				if (field === "Tahun") {
					// Ringkas pilihan tahun dari 1900-2026 agar hemat token
					trimmedFieldConfig[field] = {
						type: "select",
						options: ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "... (atau tahun lain hingga 1900 jika sesuai)"]
					};
				} else {
					trimmedFieldConfig[field] = FIELD_CONFIG[field];
				}
			}
		}

		// 3. Request all field mapping and copywriting
		const prompt = buildFieldsPrompt({ description, category, relevantFields, trimmedFieldConfig });

		try {
			const content = await this.requestCompletion({
				messages: [
					{
						role: "system",
						content: JSON_SYSTEM_PROMPT,
					},
					{ role: "user", content: prompt },
				],
				temperature: 0.3,
				max_tokens: 2048,
				response_format: { type: "json_object" },
			});
			const parsed = parseGeneratedFields(content, {
				allowedCategories: this.categories,
				allowedFields: relevantFields,
			});
			
			// Sanitize title to ensure pure search keywords at front
			if (parsed.title) {
				parsed.title = parsed.title
					.replace(/^\[READY[^\]]*\]\s*/i, "")
					.replace(/^Bismillah(\.\.\.)?\s*/i, "")
					.replace(/^(Dijual|Jual)\s+/i, "")
					.trim();
			}

			// Normalize price to full rupiah
			if (parsed.price) {
				parsed.price = normalizeListingPrice(parsed.price, parsed.category);
			}

			// Sanitize description natural price
			if (parsed.description) {
				parsed.description = sanitizeListingDescription(parsed.description, parsed.category);
			}

			return parsed;
		} catch (error) {
			const msg = this.formatAIError(error, "Gagal generate fields lewat AI");
			this.logger.error(msg);
			throw new Error(msg);
		}
	}

	/**
	 * Suggest a competitive price based on listing context.
	 */
	async suggestPrice({ title, category, condition, attributes }) {
		if (!this.apiKey) {
			throw new Error(`${this.apiKeyEnv} tidak ditemukan di .env`);
		}

		this.logger.info(`Suggesting price for: "${title}"...`);

		const prompt = buildPriceSuggestionPrompt({ title, category, condition, attributes });

		try {
			const content = await this.requestCompletion({
				messages: [
					{ role: "system", content: JSON_SYSTEM_PROMPT },
					{ role: "user", content: prompt },
				],
				temperature: 0.3,
				max_tokens: 512,
				response_format: { type: "json_object" },
			});

			return parsePriceSuggestion(content);
		} catch (error) {
			const msg = this.formatAIError(error, "Gagal suggest price");
			this.logger.error(msg);
			throw new Error(msg);
		}
	}

	/**
	 * Detect potential duplicate listings using title similarity.
	 * Returns array of similar listings with similarity score.
	 */
	detectDuplicates(newTitle, existingListings) {
		if (!newTitle || !existingListings?.length) return [];

		const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
		const newNorm = normalize(newTitle);
		const newWords = new Set(newNorm.split(/\s+/).filter(w => w.length > 2));

		const duplicates = [];
		for (const existing of existingListings) {
			if (!existing.title) continue;
			const existNorm = normalize(existing.title);
			const existWords = new Set(existNorm.split(/\s+/).filter(w => w.length > 2));

			// Jaccard similarity
			const intersection = [...newWords].filter(w => existWords.has(w));
			const union = new Set([...newWords, ...existWords]);
			const similarity = union.size > 0 ? intersection.length / union.size : 0;

			if (similarity >= 0.7) {
				duplicates.push({
					id: existing.id,
					title: existing.title,
					similarity: Math.round(similarity * 100),
				});
			}
		}

		return duplicates.sort((a, b) => b.similarity - a.similarity);
	}
}

module.exports = new AIService();
