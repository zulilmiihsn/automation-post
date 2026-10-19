function normalizeListingPrice(price, category = "Kendaraan") {
	if (!price && price !== 0) return "";
	let value = String(price).trim().toLowerCase();
	value = value.replace(/rp\.?/g, "").trim();
	value = value.replace(/(\d+),(\d+)/g, "$1.$2");

	if (value.includes("jt") || value.includes("juta")) {
		const match = value.match(/([\d.]+)\s*(jt|juta)/);
		if (match) {
			const amount = Number.parseFloat(match[1]);
			if (Number.isFinite(amount)) return String(Math.round(amount * 1_000_000));
		}
	}

	if (/^\d+\.\d+$/.test(value)) {
		const amount = Number.parseFloat(value);
		if (Number.isFinite(amount) && amount < 1000) return String(Math.round(amount * 1_000_000));
	}

	const digits = value.replace(/[^0-9]/g, "");
	const amount = Number.parseInt(digits, 10);
	if (!Number.isSafeInteger(amount) || amount === 0) return "";

	if (category === "Kendaraan" || !category) {
		if (amount < 100) return String(amount * 1_000_000);
		if (amount < 1000) return String(amount * 100_000);
		if (amount < 10000) return String(amount * 10_000);
	}

	return String(amount);
}

function formatPriceNatural(price) {
	if (!price && price !== 0) return "";
	const digits = String(price).trim().replace(/[^0-9]/g, "");
	const amount = Number.parseInt(digits, 10);
	if (!Number.isSafeInteger(amount) || amount === 0) return price;

	if (amount >= 1_000_000) {
		const millions = amount / 1_000_000;
		return `${millions.toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt`;
	}
	return `Rp ${amount.toLocaleString("id-ID")}`;
}

function sanitizeListingDescription(description, category = "Kendaraan") {
	if (!description) return "";
	const pricePattern = /Harga\s+(?:Rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{6,9}|\d+(?:[.,]\d+)?(?:\s*(?:jt|juta))?)/gi;
	return String(description).replace(pricePattern, (match, rawPrice) => {
		const digits = rawPrice.replace(/[^0-9]/g, "");
		const hasMillionUnit = /\b(?:jt|juta)\b/i.test(rawPrice);
		if (category !== "Kendaraan" && !hasMillionUnit && digits.length < 6) return match;

		const normalized = normalizeListingPrice(rawPrice, category);
		return normalized ? `Harga ${formatPriceNatural(normalized)}` : match;
	});
}

module.exports = { formatPriceNatural, normalizeListingPrice, sanitizeListingDescription };
