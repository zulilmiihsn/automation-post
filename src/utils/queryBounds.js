function clampQueryLimit(value, fallback = 50, maximum = 500) {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.max(1, Math.min(maximum, Math.trunc(number)));
}

function limitSearchText(value, maximum = 200) {
	return typeof value === "string" ? value.slice(0, maximum) : "";
}

module.exports = { clampQueryLimit, limitSearchText };
