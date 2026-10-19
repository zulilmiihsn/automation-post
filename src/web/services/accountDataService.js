const fs = require("fs-extra");
const { db } = require("./database");
const { rootDir, profilesDir, reservedProfileDirs, isReservedProfile } = require("./storagePaths");

module.exports = {
	syncProfilesDirectory() {
		try {
			fs.ensureDirSync(profilesDir);
			const profileNames = fs.readdirSync(profilesDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && !reservedProfileDirs.has(entry.name))
				.map((entry) => entry.name);
			const existingProfiles = new Set(db.prepare("SELECT profile FROM accounts").all().map((row) => row.profile));
			db.transaction(() => {
				for (const name of profileNames) {
					const profile = `profiles/${name}`;
					if (!existingProfiles.has(profile)) {
						db.prepare(`
							INSERT INTO accounts (id, name, profile, targetGroups, linked, isActive)
							VALUES (?, ?, ?, ?, ?, ?)
						`).run(name, name, profile, "[]", 0, 1);
					}
				}
			})();
		} catch (error) {
			console.error("Failed to sync profiles directory:", error);
		}
	},

	async getAccounts() {
		this.syncProfilesDirectory();
		return db.prepare("SELECT * FROM accounts").all()
			.filter((row) => !isReservedProfile(row.profile) && !reservedProfileDirs.has(row.id))
			.map((row) => ({
				...row,
				targetGroups: JSON.parse(row.targetGroups || "[]"),
				linked: !!row.linked,
				isActive: !!row.isActive,
			}));
	},

	async addAccount(name) {
		const databaseIds = db.prepare("SELECT id FROM accounts").all().map((row) => row.id);
		const profileIds = fs.existsSync(profilesDir)
			? fs.readdirSync(profilesDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
			: [];
		const maxNumber = [...new Set([...databaseIds, ...profileIds])].reduce((max, id) => {
			const match = id.match(/^akun_(\d+)$/);
			return match ? Math.max(max, Number(match[1])) : max;
		}, 0);
		const id = `akun_${maxNumber + 1}`;
		const profile = `profiles/${id}`;
		db.prepare(`
			INSERT INTO accounts (id, name, profile, targetGroups, linked, isActive)
			VALUES (?, ?, ?, ?, ?, ?)
		`).run(id, name || id, profile, "[]", 0, 1);
		return { id, name: name || id, profile, targetGroups: [], linked: false, isActive: true };
	},

	async updateAccount(id, updateFn) {
		const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
		if (!row) return false;
		const account = {
			...row,
			targetGroups: JSON.parse(row.targetGroups),
			linked: !!row.linked,
			isActive: !!row.isActive,
		};
		updateFn(account);
		db.prepare(`
			UPDATE accounts
			SET name = ?, profile = ?, fbName = ?, fbPic = ?, targetGroups = ?, linked = ?, isActive = ?, e2ee_pin = ?
			WHERE id = ?
		`).run(
			account.name,
			account.profile,
			account.fbName || null,
			account.fbPic || null,
			JSON.stringify(account.targetGroups),
			account.linked ? 1 : 0,
			account.isActive ? 1 : 0,
			account.e2ee_pin || "",
			id,
		);
		return true;
	},

	async deleteAccount(id) {
		const row = db.prepare("SELECT profile FROM accounts WHERE id = ?").get(id);
		if (row?.profile) {
			const profilePath = require("node:path").join(rootDir, row.profile);
			if (await fs.pathExists(profilePath)) {
				await fs.remove(profilePath);
				console.log(`[CLEANUP] Deleted profile directory: ${profilePath}`);
			}
		}
		db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
		return true;
	},
};
