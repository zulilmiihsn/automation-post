const path = require("node:path");
const DataService = require("../services/dataService");
const BrowserManager = require("../../core/browserManager");

/** Cegah dobel-klik / retry menumpuk: 1 akun = 1 sesi login/logout dalam 1 waktu. */
const _accountBusy = new Set();

class AccountController {
	static async getAccounts(_req, res) {
		try {
			const data = await DataService.getAccounts();
			res.json(data.map((account) => {
				const publicAccount = { ...account };
				delete publicAccount.e2ee_pin;
				return publicAccount;
			}));
		} catch (_err) {
			res.status(500).json({ error: "Failed to load accounts" });
		}
	}

	static async updateAccountById(req, res) {
		const id = req.params.id;
		const data = req.body;
		const ALLOWED_FIELDS = ['name', 'fbName', 'fbPic', 'targetGroups', 'linked', 'isActive'];
		try {
			await DataService.updateAccount(id, (acc) => {
				for (const key of ALLOWED_FIELDS) {
					if (key in data) acc[key] = data[key];
				}
			});
			res.json({ success: true });
		} catch (error) {
			res.status(500).json({ error: error.message });
		}
	}

	static async toggleAccount(req, res) {
		const id = req.params.id;
		const { isActive } = req.body;
		try {
			await DataService.updateAccount(id, (acc) => { acc.isActive = !!isActive; });
			res.json({ success: true });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async deleteAccountById(req, res) {
		const id = req.params.id;
		try {
			await DataService.deleteAccount(id);
			res.json({ success: true, message: "Account deleted" });
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	}

	static async createAccount(req, res) {
		try {
			const { name } = req.body;
			const newAccount = await DataService.addAccount(name);
			res.json(newAccount);
		} catch (err) {
			res.status(500).json({ error: `Failed to create account: ${err.message}` });
		}
	}

	static async loginAccount(req, res) {
		const accountId = req.params.id;
		if (_accountBusy.has(accountId)) {
			return res.status(409).json({ error: "Login akun ini sedang berjalan. Tunggu browser yang sudah terbuka, jangan klik berulang." });
		}
		_accountBusy.add(accountId);
		const browser = await (async () => {
			const accounts = await DataService.getAccounts();
			const account = accounts.find((a) => a.id === accountId);
			if (!account) return null;
			return new BrowserManager({
				accountName: account.fbName || account.name,
				userDataDir: path.join(__dirname, "../../../", account.profile),
			});
		})();
		if (!browser) {
			_accountBusy.delete(accountId);
			return res.status(404).json({ error: "Account not found" });
		}
		try {

			await browser.init({ headless: false });
			await browser.page.goto("https://www.facebook.com");

			const result = await browser.waitForLogin();

			if (result.success) {
				await new Promise((r) => setTimeout(r, 2000));
				const profileInfo = await browser.getProfileInfo();
				let localPicUrl = profileInfo?.pic || "";

				if (profileInfo && profileInfo.pic) {
					try {
						const axios = require("axios");
						const fs = require("fs-extra");
						const response = await axios({
							method: "GET",
							url: profileInfo.pic,
							responseType: "stream",
							timeout: 10000
						});
						const picPath = path.join(__dirname, "../../../assets/profiles", `${accountId}.jpg`);
						await fs.ensureDir(path.dirname(picPath));
						const writer = fs.createWriteStream(picPath);
						response.data.pipe(writer);
						await new Promise((resolve, reject) => {
							writer.on("finish", resolve);
							writer.on("error", reject);
						});
						localPicUrl = `/assets/profiles/${accountId}.jpg`;
					} catch (downloadErr) {
						console.error("Gagal mendownload foto profil:", downloadErr);
					}
				}

				await DataService.updateAccount(accountId, (acc) => {
					acc.linked = true;
					if (profileInfo) {
						acc.fbName = profileInfo.name;
						acc.fbPic = localPicUrl;
					}
				});
				res.json({
					success: true,
					accountName: profileInfo?.name || result.name,
				});
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error("Failed to open browser:", error);
			if (!res.headersSent) res.status(500).json({ error: error.message });
		} finally {
			await browser.close().catch(() => {});
			_accountBusy.delete(accountId);
		}
	}

	static async logoutAccount(req, res) {
		const accountId = req.params.id;
		if (_accountBusy.has(accountId)) {
			return res.status(409).json({ error: "Akun ini sedang diproses. Tunggu sebentar." });
		}
		_accountBusy.add(accountId);
		let browser = null;
		try {
			const accounts = await DataService.getAccounts();
			const account = accounts.find((a) => a.id === accountId);
			if (!account) return res.status(404).json({ error: "Account not found" });

			browser = new BrowserManager({
				accountName: account.fbName || account.name,
				userDataDir: path.join(__dirname, "../../../", account.profile),
			});

			await browser.init({ headless: false });
			await browser.page.goto("https://www.facebook.com");

			await browser.context.clearCookies();
			await browser.page.evaluate(() => {
				localStorage.clear();
				sessionStorage.clear();
			});

			await DataService.updateAccount(accountId, (acc) => {
				acc.linked = false;
			});

			res.json({ success: true, message: "Logged out successfully" });
		} catch (error) {
			if (!res.headersSent) res.status(500).json({ error: error.message });
		} finally {
			if (browser) await browser.close().catch(() => {});
			_accountBusy.delete(accountId);
		}
	}
}

module.exports = AccountController;
