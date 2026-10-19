const fs = require("node:fs");
const path = require("node:path");

function listFilesRecursive(dir) {
	const out = [];
	const walk = (d) => {
		let ents = [];
		try {
			ents = fs.readdirSync(d, { withFileTypes: true });
		} catch (_e) {
			return;
		}
		for (const e of ents) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.isFile()) {
				try {
					const st = fs.statSync(p);
					out.push({ path: p, mtimeMs: st.mtimeMs, size: st.size });
				} catch (_e) {}
			}
		}
	};
	walk(dir);
	return out;
}

function pruneDir(dir, { maxAgeMs = 7 * 24 * 3600 * 1000, maxBytes = 500 * 1024 * 1024 } = {}) {
	const now = Date.now();
	let files = listFilesRecursive(dir);
	let removed = [];
	for (const f of files) {
		if (now - f.mtimeMs > maxAgeMs) {
			try {
				fs.unlinkSync(f.path);
				removed.push(f.path);
			} catch (_e) {}
		}
	}
	files = listFilesRecursive(dir).sort((a, b) => a.mtimeMs - b.mtimeMs);
	let total = files.reduce((s, f) => s + f.size, 0);
	for (const f of files) {
		if (total <= maxBytes) break;
		try {
			fs.unlinkSync(f.path);
			removed.push(f.path);
			total -= f.size;
		} catch (_e) {}
	}
	return { removed: removed.length, dir };
}

function pruneDefaults() {
	const out = [];
	try {
		out.push(pruneDir(path.join(process.cwd(), "assets/debug"), { maxAgeMs: 7 * 24 * 3600 * 1000, maxBytes: 500 * 1024 * 1024 }));
	} catch (_e) {}
	try {
		out.push(pruneDir(path.join(process.cwd(), "assets/recordings"), { maxAgeMs: 30 * 24 * 3600 * 1000, maxBytes: 500 * 1024 * 1024 }));
	} catch (_e) {}
	return out;
}

module.exports = { pruneDir, pruneDefaults };
