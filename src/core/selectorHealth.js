const stats = new Map(); // key -> { ok, fail, fallback, lastFailAt }

function record(key, idx, total) {
	if (!key) return;
	let s = stats.get(key);
	if (!s) {
		s = { ok: 0, fail: 0, fallback: 0 };
		stats.set(key, s);
	}
	if (idx < 0) {
		s.fail++;
		s.lastFailAt = new Date().toISOString();
	} else {
		s.ok++;
		if (idx > 0) s.fallback++;
		if (total > 1 && idx === total - 1) s.lastResort = true;
	}
}

function report() {
	return Object.fromEntries(stats.entries());
}

function reset() {
	stats.clear();
}

function fallbackRate(key) {
	const s = stats.get(key);
	if (!s || !s.ok) return 0;
	return s.fallback / s.ok;
}

module.exports = { record, report, reset, fallbackRate };
