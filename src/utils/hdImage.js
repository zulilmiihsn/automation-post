function pickHdUrl(src, srcset) {
	try {
		if (srcset) {
			const parts = String(srcset).split(",").map((s) => s.trim()).filter(Boolean);
			let best = "";
			let bestW = -1;
			for (const part of parts) {
				const m = part.match(/^(https?:\S+)\s+(\d+)w$/);
				if (m) {
					const w = parseInt(m[2], 10);
					if (w > bestW) {
						bestW = w;
						best = m[1];
					}
				} else if (!best) {
					best = part.split(/\s+/)[0];
				}
			}
			if (best && /^https?:/.test(best)) return best;
		}
		if (src && /^https?:/.test(src) && !src.startsWith("blob:") && !src.startsWith("data:")) return src;
		return "";
	} catch (_e) {
		return src || "";
	}
}

function isCdnImage(url) {
	try {
		const h = new URL(url).hostname.toLowerCase();
		return h.endsWith(".fbcdn.net") || h.endsWith(".fbsbx.com") || h.includes("scontent");
	} catch (_e) {
		return false;
	}
}

module.exports = { pickHdUrl, isCdnImage };
