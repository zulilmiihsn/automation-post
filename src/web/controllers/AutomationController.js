const path = require("node:path");
const { spawn } = require("node:child_process");
const DataService = require("../services/dataService");
const QueueService = require("../services/queueService");

class AutomationController {
	static getAutomationStatus(_req, res) {
		const allQueues = QueueService.getAllQueues();
		res.json({
			isRunningMp: allQueues.marketplace ? allQueues.marketplace.isRunning : false,
			isRunningViral: allQueues.viral ? allQueues.viral.isRunning : false,
			isRunningComment: allQueues.comment ? allQueues.comment.isRunning : false,
			isRunningSundul: allQueues.sundul ? allQueues.sundul.isRunning : false,
			isRunningChat: allQueues.chat ? allQueues.chat.isRunning : false,
			isRunningAgent: allQueues.agent ? allQueues.agent.isRunning : false,
			isAnyRunning: QueueService.isAnyRunning()
		});
	}

	static async runAutomation(req, res) {
		const { mode, accountId, commentTargetUrl, targetUrl } = req.body;
		const target = commentTargetUrl || targetUrl || null;
		const queue = QueueService.getQueue(mode);
		const started = queue.startFullAutomation(mode, accountId, target);
		if (started) {
			res.json({ success: true, message: `Otomasi ${mode} dimulai` });
		} else {
			res.status(400).json({ error: `Otomasi ${mode} sudah berjalan` });
		}
	}

	static async stopAutomation(req, res) {
		const { mode } = req.body || {};
		if (mode && mode !== "all") {
			const queue = QueueService.getQueue(mode);
			const stopped = queue.stopAutomation();
			if (stopped) {
				return res.json({ success: true, message: `Otomasi ${mode} dihentikan` });
			}
		}
		const stoppedAny = QueueService.stopAutomation();
		if (stoppedAny) {
			return res.json({ success: true, message: "Semua proses otomasi dihentikan" });
		}
		return res.json({ success: true, message: "Tidak ada proses otomasi yang aktif" });
	}

	static async runScraper(req, res) {
		if (QueueService.getStatus().isRunning) {
			return res.status(400).json({
				error: "Otomasi sedang berjalan, hentikan dulu sebelum scraping.",
			});
		}

		const { url, groupId } = req.body;
		const appConfig = DataService.getAppConfig();
		const scraperAccountId = appConfig.scraper_account_id;
		if (!scraperAccountId) {
			return res.status(400).json({
				error: "Pilih Akun Scraper dulu di Bot Settings.",
			});
		}

		const accounts = await DataService.getAccounts();
		const account = accounts.find((a) => a.id === scraperAccountId);
		if (!account) {
			return res.status(400).json({
				error: `Akun scraper '${scraperAccountId}' tidak ditemukan. Pilih ulang Akun Scraper di Bot Settings.`,
			});
		}

		const profileDir = path.join(__dirname, "../../../", account.profile);
		const scraperPath = path.join(__dirname, "../../../scripts/scraper.js");
		const args = [scraperPath];
		if (url) args.push(url);

		res.json({
			success: true,
			message: `Scraper dimulai dengan akun ${account.fbName || account.name}.`,
		});

		const env = { ...process.env, SCRAPER_PROFILE_DIR: profileDir };
		if (groupId) env.SCRAPER_GROUP_ID = String(groupId);

		const child = spawn("node", args, {
			env,
			cwd: path.join(__dirname, "../../../"),
		});

		const emit = (line) => QueueService.emit("log", `[SCRAPER] ${line.trim()}`);
		child.stdout.on("data", (data) => {
			data.toString().split("\n").filter((l) => l.trim()).forEach(emit);
		});
		child.stderr.on("data", (data) => {
			data.toString().split("\n").filter((l) => l.trim()).forEach((l) => emit(`[WARN] ${l}`));
		});
		child.on("close", (code) => {
			emit(code === 0
				? "Scraping selesai! Refresh database untuk melihat hasil."
				: `Scraper berhenti dengan kode ${code}.`);
		});
	}

	static async runSundul(req, res) {
		if (QueueService.isAnyRunning()) {
			return res.status(400).json({
				error: "Otomasi sedang berjalan, hentikan dulu sebelum sundul.",
			});
		}

		const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
		const accountId = typeof req.body.accountId === "string" ? req.body.accountId : null;
		const autoMode = req.body.autoMode === true;
		if (!autoMode && (!ids || !ids.length)) {
			return res.status(400).json({ error: "Tidak ada listing yang dipilih." });
		}

		let targetProfileDir = null;
		let targetAccountName = "Semua Akun Aktif";

		if (accountId) {
			const accounts = await DataService.getAccounts();
			const account = accounts.find((a) => a.id === accountId);
			if (!account || !account.isActive || !account.linked) {
				return res.status(400).json({ error: "Akun tidak aktif, belum tertaut, atau tidak ditemukan." });
			}
			targetProfileDir = path.join(__dirname, "../../../", account.profile);
			targetAccountName = account.fbName || account.name;
		}

		const listings = autoMode ? [] : await DataService.getListings();
		let targetTitles = [];

		if (autoMode) {
			targetTitles = "auto";
		} else {
			for (const id of ids) {
				const item = listings.find(l => l.id === id);
				if (item && item.title) {
					targetTitles.push(item.title);
				}
			}
			if (targetTitles.length === 0) {
				return res.status(400).json({ error: "Tidak ada listing yang valid dipilih." });
			}
		}

		const queue = QueueService.getQueue("sundul");
		
		const started = queue.startSundul(
			targetTitles,
			targetAccountName,
			targetProfileDir,
			accountId,
		);
		if (started) {
			const msg = autoMode
				? `Sundul otomatis dimulai untuk ${targetAccountName}.`
				: `Sundul ${targetTitles.length} postingan dimulai untuk ${targetAccountName}.`;
			res.json({ success: true, message: msg });
		} else {
			res.status(400).json({ error: "Proses sundul sudah berjalan" });
		}
	}
}

module.exports = AutomationController;
