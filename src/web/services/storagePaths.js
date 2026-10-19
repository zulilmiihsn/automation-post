const path = require("node:path");

const rootDir = path.resolve(__dirname, "../../..");
const dataDir = path.join(rootDir, "data");
const profilesDir = path.join(rootDir, "profiles");
const accountsFile = path.join(dataDir, "accounts.json");
const listingsFile = path.join(dataDir, "listings.json");
const reservedProfileDirs = new Set(["scraper_bot"]);

function isReservedProfile(profilePath = "") {
	const normalized = profilePath.replace(/\\/g, "/");
	const dirName = normalized.split("/").filter(Boolean).pop();
	return reservedProfileDirs.has(dirName);
}

module.exports = {
	rootDir,
	dataDir,
	profilesDir,
	accountsFile,
	listingsFile,
	reservedProfileDirs,
	isReservedProfile,
};
