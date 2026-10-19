function normalizeFacebookUrl(value) {
	if (typeof value !== "string" || value.length > 2048) return null;
	try {
		const url = new URL(value);
		const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
		const isFacebookHost = hostname === "facebook.com" || hostname.endsWith(".facebook.com");
		if (
			url.protocol !== "https:" ||
			!isFacebookHost ||
			url.username ||
			url.password ||
			(url.port && url.port !== "443")
		) return null;
		return url.href;
	} catch {
		return null;
	}
}

module.exports = { normalizeFacebookUrl };
