const { normalizeListingPrice } = require("./aiListingFormatters");

function wordCount(text) {
	return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function parseObject(content) {
	try {
		const value = JSON.parse(content);
		return value && typeof value === "object" && !Array.isArray(value) ? value : null;
	} catch {
		return null;
	}
}

function parseAIObject(content) {
	const value = parseObject(content);
	if (!value) throw new Error("AI returned invalid JSON object");
	return value;
}

function buildFallbackTags({ title, location, category, condition, attributes = {} } = {}) {
	const base = String(title || "").trim();
	return [
		[base, location].filter(Boolean).join(" "),
		[base, category].filter(Boolean).join(" "),
		[base, condition].filter(Boolean).join(" "),
		...Object.entries(attributes).map(([field, value]) => [base, field, value].filter(Boolean).join(" ")),
		base,
	];
}

function normalizeTags(value, fallbackTags = []) {
	const uniqueTags = new Map();
	for (const tag of [...value.split(","), ...fallbackTags]) {
		const cleanTag = tag.trim().replace(/^#+/, "");
		const key = cleanTag.toLocaleLowerCase("id-ID");
		if (cleanTag && !uniqueTags.has(key)) uniqueTags.set(key, cleanTag);
	}

	if (uniqueTags.size < 20) {
		throw new Error(`AI returned ${uniqueTags.size} unique tags; 20 required`);
	}
	return [...uniqueTags.values()].slice(0, 20).join(",");
}

function normalizeCondition(value) {
	const normalized = value.trim().toLocaleLowerCase("id-ID");
	const conditions = new Map([
		["baru", "Baru"],
		["new", "Baru"],
		["brand new", "Baru"],
		["bekas - seperti baru", "Bekas - Seperti Baru"],
		["used - like new", "Bekas - Seperti Baru"],
		["like new", "Bekas - Seperti Baru"],
		["bekas - baik", "Bekas - Baik"],
		["used - good", "Bekas - Baik"],
		["good", "Bekas - Baik"],
		["bekas - cukup", "Bekas - Cukup"],
		["used - fair", "Bekas - Cukup"],
		["fair", "Bekas - Cukup"],
	]);
	const condition = conditions.get(normalized);
	if (!condition) throw new Error(`AI returned unsupported condition: ${value}`);
	return condition;
}

function normalizeAttributes(attributes, allowedFields) {
	const allowedByName = new Map(allowedFields.map((field) => [field.toLocaleLowerCase("id-ID"), field]));
	const normalized = {};
	for (const [name, value] of Object.entries(attributes)) {
		const field = allowedByName.get(name.toLocaleLowerCase("id-ID"));
		if (!field || value == null || typeof value === "object") continue;
		normalized[field] = String(value).trim();
	}
	return normalized;
}

function parseListingOptimization(content, { allowedCategories, fieldsByCategory } = {}) {
	const value = parseAIObject(content);
	const mapping = value.mapping;
	const copywriting = value.copywriting;
	if (
		!mapping || typeof mapping !== "object" || Array.isArray(mapping) ||
		!copywriting || typeof copywriting !== "object" || Array.isArray(copywriting) ||
		typeof mapping.title !== "string" || !mapping.title.trim() ||
		!isScalar(mapping.price) ||
		typeof mapping.category !== "string" ||
		typeof mapping.condition !== "string" ||
		typeof mapping.tags !== "string" ||
		!mapping.attributes || typeof mapping.attributes !== "object" || Array.isArray(mapping.attributes) ||
		typeof copywriting.description !== "string" || !copywriting.description.trim()
	) {
		throw new Error("AI listing response missing required fields");
	}
	if (allowedCategories && !allowedCategories.includes(mapping.category)) {
		throw new Error(`AI returned unsupported category: ${mapping.category}`);
	}
	mapping.condition = normalizeCondition(mapping.condition);
	const allowedFields = fieldsByCategory?.[mapping.category];
	if (Array.isArray(allowedFields)) {
		mapping.attributes = normalizeAttributes(mapping.attributes, allowedFields);
	}
	mapping.tags = normalizeTags(mapping.tags, buildFallbackTags({
		title: mapping.title,
		category: mapping.category,
		condition: mapping.condition,
		attributes: mapping.attributes,
	}));
	copywriting.description = copywriting.description.trim();
	copywriting.analysis = typeof copywriting.analysis === "string" ? copywriting.analysis.trim() : "";
	copywriting.missing_info = Array.isArray(copywriting.missing_info) ? copywriting.missing_info : [];
	return value;
}

function parseGeneratedFields(content, { allowedCategories, allowedFields = [] } = {}) {
	const value = parseAIObject(content);
	if (
		typeof value.title !== "string" || !value.title.trim() ||
		!isScalar(value.price) ||
		typeof value.category !== "string" || !value.category.trim() ||
		typeof value.condition !== "string" ||
		typeof value.tags !== "string" ||
		typeof value.description !== "string" || !value.description.trim() ||
		!value.attributes || typeof value.attributes !== "object" || Array.isArray(value.attributes)
	) {
		throw new Error("AI fields response missing required fields");
	}
	if (allowedCategories && !allowedCategories.includes(value.category)) {
		throw new Error(`AI returned unsupported category: ${value.category}`);
	}
	value.condition = normalizeCondition(value.condition);
	value.title = value.title.trim();
	value.description = value.description.trim();
	value.attributes = normalizeAttributes(value.attributes, allowedFields);
	value.tags = normalizeTags(value.tags, buildFallbackTags({
		title: value.title,
		category: value.category,
		condition: value.condition,
		attributes: value.attributes,
	}));
	return value;
}

function parseTags(content, context = {}) {
	const value = parseAIObject(content);
	if (typeof value.tags !== "string") throw new Error("AI tags response missing tags string");
	return normalizeTags(value.tags, buildFallbackTags(context));
}

function parsePriceSuggestion(content) {
	const value = parseAIObject(content);
	const prices = ["min_price", "ideal_price", "max_price"].map((key) => {
		const raw = value[key];
		if (!isScalar(raw)) {
			throw new Error(`AI price response has invalid ${key}`);
		}
		const price = Number(normalizeListingPrice(raw, "Kendaraan"));
		if (!Number.isSafeInteger(price) || price <= 0) throw new Error(`AI price response has invalid ${key}`);
		return price;
	});
	if (prices[0] > prices[1] || prices[1] > prices[2]) {
		throw new Error("AI price response range is out of order");
	}
	return {
		min_price: String(prices[0]),
		ideal_price: String(prices[1]),
		max_price: String(prices[2]),
		reasoning: typeof value.reasoning === "string" ? value.reasoning.trim() : "",
	};
}

function isScalar(value) {
	return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function parseAgentDecision(content) {
	const value = parseObject(content);
	if (!value || typeof value.should_like !== "boolean" || typeof value.should_comment !== "boolean") {
		return null;
	}

	const commentText = typeof value.comment_text === "string" ? value.comment_text.trim() : "";
	if (value.should_comment && (!commentText || commentText.length > 300 || wordCount(commentText) > 12)) {
		return null;
	}

	return {
		...value,
		comment_text: value.should_comment ? commentText : "",
		reason: typeof value.reason === "string" ? value.reason.slice(0, 300) : "",
		updated_memory: typeof value.updated_memory === "string" ? value.updated_memory.trim().slice(0, 300) : "",
	};
}

function parseAgentReply(content) {
	const value = parseObject(content);
	if (!value || typeof value.should_reply !== "boolean") return null;

	const replyText = typeof value.reply_text === "string" ? value.reply_text.trim() : "";
	if (value.should_reply && (!replyText || replyText.length > 300 || wordCount(replyText) > 12)) {
		return null;
	}

	return {
		...value,
		reply_text: value.should_reply ? replyText : "",
		reason: typeof value.reason === "string" ? value.reason.slice(0, 300) : "",
		updated_memory: typeof value.updated_memory === "string" ? value.updated_memory.trim().slice(0, 300) : "",
	};
}

module.exports = {
	parseAIObject,
	parseAgentDecision,
	parseAgentReply,
	parseGeneratedFields,
	parseListingOptimization,
	parsePriceSuggestion,
	parseTags,
};
