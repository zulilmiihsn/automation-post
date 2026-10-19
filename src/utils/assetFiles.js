const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const ASSETS_ROOT = path.resolve(PROJECT_ROOT, "assets");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function isWithin(root, target) {
	const relative = path.relative(root, target);
	return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveAssetPath(value, { mustExist = false, imageOnly = true } = {}) {
	if (typeof value !== "string" || !value.trim()) return null;

	const normalized = value.trim().replace(/^[/\\]+/, "");
	const candidate = path.resolve(PROJECT_ROOT, normalized);
	if (!isWithin(ASSETS_ROOT, candidate)) return null;
	if (imageOnly && !IMAGE_EXTENSIONS.has(path.extname(candidate).toLowerCase())) return null;

	if (!fs.existsSync(candidate)) return mustExist ? null : candidate;

	try {
		const realAssetsRoot = fs.realpathSync(ASSETS_ROOT);
		const realCandidate = fs.realpathSync(candidate);
		if (!isWithin(realAssetsRoot, realCandidate) || !fs.statSync(realCandidate).isFile()) return null;
		return realCandidate;
	} catch {
		return null;
	}
}

module.exports = { ASSETS_ROOT, IMAGE_EXTENSIONS, resolveAssetPath };
