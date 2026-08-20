const DAY_MS = 24 * 60 * 60 * 1000;

const TITLE_STOP_WORDS = new Set([
	"ready",
	"berau",
	"surat",
	"lengkap",
	"mulus",
	"siap",
	"pakai",
	"unit",
	"dijual",
	"jual",
	"tahun",
	"year",
	"bekas",
	"second",
	"plat",
	"pajak",
	"on",
	"off",
	"kondisi",
	"istimewa",
	"terawat",
	"murah",
	"nego",
	"motor",
]);

const BRAND_WORDS = new Set(["yamaha", "honda", "suzuki", "kawasaki"]);

function normalizeTitle(value = "") {
	return String(value)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function titleTokens(value) {
	return normalizeTitle(value)
		.split(" ")
		.filter((token) => token.length > 0 && !TITLE_STOP_WORDS.has(token));
}

function titleMatchScore(targetTitle, candidateTitle) {
	const target = normalizeTitle(targetTitle);
	const candidate = normalizeTitle(candidateTitle);
	if (!target || !candidate) return 0;
	if (target === candidate) return 1;

	const targetTokens = titleTokens(target);
	const candidateTokens = titleTokens(candidate);
	if (targetTokens.length === 0 || candidateTokens.length === 0) return 0;

	// Extract numbers and 4-digit years
	const targetNumbers = targetTokens.filter((token) => /^\d+$/.test(token));
	const candidateNumbers = candidateTokens.filter((token) => /^\d+$/.test(token));

	const targetYears = targetNumbers.filter((n) => /^(19|20)\d{2}$/.test(n));
	const candidateYears = candidateNumbers.filter((n) => /^(19|20)\d{2}$/.test(n));
	if (targetYears.length > 0 && candidateYears.length > 0) {
		if (!targetYears.some((y) => candidateYears.includes(y))) return 0;
	} else if (targetNumbers.length > 0 && candidateNumbers.length > 0) {
		if (!targetNumbers.some((n) => candidateNumbers.includes(n))) return 0;
	}

	// Model tokens excluding brand and years
	const targetModel = targetTokens.filter((t) => !BRAND_WORDS.has(t) && !/^(19|20)\d{2}$/.test(t));
	const candidateModel = candidateTokens.filter((t) => !BRAND_WORDS.has(t) && !/^(19|20)\d{2}$/.test(t));

	if (targetModel.length === 0 && candidateModel.length === 0) {
		return 1;
	}
	if (targetModel.length === 0 || candidateModel.length === 0) {
		return 0;
	}

	const intersection = targetModel.filter((t) => candidateModel.includes(t));
	if (intersection.length === 0) return 0;

	const union = new Set([...targetModel, ...candidateModel]);
	return intersection.length / union.size;
}

function findBestListingMatch(targetTitle, listings, minimumScore = 0.4) {
	const ranked = listings
		.map((listing) => ({ listing, score: titleMatchScore(targetTitle, listing.title) }))
		.filter((entry) => entry.score >= minimumScore)
		.sort((a, b) => b.score - a.score);

	if (ranked.length === 0) return null;
	if (
		ranked.length > 1 &&
		ranked[0].score === ranked[1].score &&
		ranked[0].listing.title !== ranked[1].listing.title
	) {
		return null;
	}
	return ranked[0];
}

const MONTH_MAP = {
	januari: 1, jan: 1, january: 1,
	februari: 2, feb: 2, february: 2,
	maret: 3, mar: 3, march: 3,
	april: 4, apr: 4,
	mei: 5, may: 5,
	juni: 6, jun: 6, june: 6,
	juli: 7, jul: 7, july: 7,
	agustus: 8, agu: 8, agt: 8, august: 8, aug: 8,
	september: 9, sep: 9, sept: 9,
	oktober: 10, okt: 10, october: 10, oct: 10,
	november: 11, nov: 11,
	desember: 12, des: 12, december: 12, dec: 12,
};

function parseNamedMonthDate(cleanText, now) {
	const words = cleanText.toLowerCase();
	// Format: "25 Juli 2024" or "25 July"
	const matchDayFirst = words.match(/\b(\d{1,2})\s+([a-z]+)(?:\s+(\d{2,4}))?\b/);
	if (matchDayFirst && MONTH_MAP[matchDayFirst[2]]) {
		const day = Number(matchDayFirst[1]);
		const month = MONTH_MAP[matchDayFirst[2]];
		let year = matchDayFirst[3] ? Number(matchDayFirst[3]) : now.getFullYear();
		if (year < 100) year += 2000;
		if (day >= 1 && day <= 31) {
			let listedAt = new Date(year, month - 1, day);
			if (!matchDayFirst[3] && listedAt.getTime() > now.getTime()) {
				listedAt = new Date(year - 1, month - 1, day);
			}
			const age = Math.floor((now.getTime() - listedAt.getTime()) / DAY_MS);
			return age >= 0 ? age : null;
		}
	}

	// Format: "July 25, 2024" or "Juli 25"
	const matchMonthFirst = words.match(/\b([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{2,4}))?\b/);
	if (matchMonthFirst && MONTH_MAP[matchMonthFirst[1]]) {
		const month = MONTH_MAP[matchMonthFirst[1]];
		const day = Number(matchMonthFirst[2]);
		let year = matchMonthFirst[3] ? Number(matchMonthFirst[3]) : now.getFullYear();
		if (year < 100) year += 2000;
		if (day >= 1 && day <= 31) {
			let listedAt = new Date(year, month - 1, day);
			if (!matchMonthFirst[3] && listedAt.getTime() > now.getTime()) {
				listedAt = new Date(year - 1, month - 1, day);
			}
			const age = Math.floor((now.getTime() - listedAt.getTime()) / DAY_MS);
			return age >= 0 ? age : null;
		}
	}

	return null;
}

function parseNumericDate(cleanText, now) {
	const match = cleanText.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
	if (!match) return null;

	const first = Number(match[1]);
	const second = Number(match[2]);
	let year = match[3] ? Number(match[3]) : now.getFullYear();
	if (year < 100) year += 2000;

	const indonesian = /ditawarkan|diperbarui|pada/.test(cleanText);
	let day;
	let month;
	if (first > 12) {
		day = first;
		month = second;
	} else if (second > 12) {
		day = second;
		month = first;
	} else {
		day = indonesian ? first : second;
		month = indonesian ? second : first;
	}
	if (day < 1 || day > 31 || month < 1 || month > 12) return null;

	let listedAt = new Date(year, month - 1, day);
	if (!match[3] && listedAt.getTime() > now.getTime()) {
		listedAt = new Date(year - 1, month - 1, day);
	}

	const age = Math.floor((now.getTime() - listedAt.getTime()) / DAY_MS);
	return age >= 0 ? age : null;
}

function parseListingAgeDays(text, now = new Date()) {
	const rawClean = String(text)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
	const clean = normalizeTitle(rawClean);
	if (!clean) return null;

	if (/\b(hari ini|today|baru saja|just now)\b/.test(clean)) return 0;
	if (/\b(kemarin|yesterday)\b/.test(clean)) return 1;
	if (/\b\d+\s*(menit|minute|minutes|jam|hour|hours|sec|detik)\b/.test(clean)) return 0;

	const relativeUnits = [
		{ pattern: /\b(\d+)\s*(hari|day|days|d)\b/, multiplier: 1 },
		{ pattern: /\b(\d+)\s*(minggu|pekan|week|weeks|w)\b/, multiplier: 7 },
		{ pattern: /\b(\d+)\s*(bulan|month|months|mo)\b/, multiplier: 30 },
		{ pattern: /\b(\d+)\s*(tahun|year|years|y)\b/, multiplier: 365 },
	];

	for (const unit of relativeUnits) {
		const match = clean.match(unit.pattern);
		if (match) return Number(match[1]) * unit.multiplier;
	}

	const numericAge = parseNumericDate(rawClean, now);
	if (numericAge !== null) return numericAge;

	return parseNamedMonthDate(rawClean, now);
}

function buildListingKey(listing) {
	if (listing.listingId) return String(listing.listingId);
	const urlMatch = String(listing.href || "").match(/\/marketplace\/item\/(\d+)/i);
	if (urlMatch) return urlMatch[1];
	return normalizeTitle(listing.title);
}

function evaluateListingEligibility(
	listing,
	{ recentKeys = new Set(), minimumAgeDays = 7, now = new Date() } = {},
) {
	const key = buildListingKey(listing);
	const ageDays = parseListingAgeDays(listing.ageText, now);

	if (listing.hasDirectRenew && !recentKeys.has(key) && listing.active !== false && !listing.warning) {
		return { eligible: true, reason: "eligible", key, ageDays: ageDays ?? 7 };
	}
	if (!listing.active) return { eligible: false, reason: "inactive", key, ageDays };
	if (listing.warning) return { eligible: false, reason: listing.warning, key, ageDays };
	if (recentKeys.has(key)) return { eligible: false, reason: "recently-renewed", key, ageDays: ageDays ?? 0 };

	if (ageDays === null) return { eligible: false, reason: "unknown-age", key, ageDays };
	if (ageDays < minimumAgeDays) return { eligible: false, reason: "too-new", key, ageDays };
	return { eligible: true, reason: "eligible", key, ageDays };
}

function isTooSimilar(title, renewedTitles, minimumScore = 0.9) {
	for (const renewedTitle of renewedTitles) {
		if (titleMatchScore(title, renewedTitle) >= minimumScore) return true;
	}
	return false;
}

function isRenewVerified({ successSignal = false, renewUnavailable = false } = {}) {
	return Boolean(successSignal || renewUnavailable);
}

module.exports = {
	buildListingKey,
	evaluateListingEligibility,
	findBestListingMatch,
	isTooSimilar,
	isRenewVerified,
	normalizeTitle,
	parseListingAgeDays,
	titleMatchScore,
};
