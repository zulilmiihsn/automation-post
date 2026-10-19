const path = require("node:path");
const DataService = require("../services/dataService");
const QueueService = require("../services/queueService");
const { normalizeFacebookUrl } = require("../../utils/facebookUrl");

const AUTOMATION_MODES = new Set(["all", "viral", "marketplace", "comment", "chat"]);
const STOPPABLE_MODES = new Set([...AUTOMATION_MODES, "sundul"]);

function queueBusyMessage(requestedMode) {
	const running = typeof QueueService.getRunningModes === "function"
		? QueueService.getRunningModes()
		: [];
	if (running.length === 0) return `Otomasi ${requestedMode} sudah berjalan`;
	return `Masih ada proses otomasi berjalan: ${running.join(", ")}. Hentikan dulu.`;
}

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
			isRunningScraper: allQueues.scraper ? allQueues.scraper.isRunning : false,
			runningModes: QueueService.getRunningModes(),
			isAnyRunning: QueueService.isAnyRunning()
		});
	}

	static async runAutomation(req, res) {
		const { mode, accountId, commentTargetUrl, targetUrl } = req.body || {};
		const runMode = mode || "all";
		if (!AUTOMATION_MODES.has(runMode)) {
			return res.status(400).json({ error: "Mode otomasi tidak valid" });
		}
		const rawTarget = commentTargetUrl || targetUrl || null;
		const target = rawTarget ? normalizeFacebookUrl(rawTarget) : null;
		if (rawTarget && !target) return res.status(400).json({ error: "URL target harus HTTPS Facebook yang valid" });
		const queue = QueueService.getQueue(runMode);
		const started = queue.startFullAutomation(runMode, accountId, target);
		if (started) {
			res.json({ success: true, message: `Otomasi ${runMode} dimulai` });
		} else {
			res.status(400).json({ error: queueBusyMessage(runMode) });
		}
	}

	static async stopAutomation(req, res) {
		const { mode } = req.body || {};
		if (mode && mode !== "all") {
			if (!STOPPABLE_MODES.has(mode)) return res.status(400).json({ error: "Mode otomasi tidak valid" });
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
		if (QueueService.isAnyRunning()) {
			return res.status(400).json({ error: queueBusyMessage("scraper") });
		}

		const { url: rawUrl, groupId } = req.body || {};
		const url = rawUrl ? normalizeFacebookUrl(rawUrl) : null;
		if (rawUrl && !url) return res.status(400).json({ error: "URL scraper harus HTTPS Facebook yang valid" });
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
		const queue = QueueService.getQueue("scraper");
		const started = queue.startScraper(url, profileDir, groupId);
		if (!started) {
			return res.status(400).json({ error: queueBusyMessage("scraper") });
		}

		return res.json({
			success: true,
			message: `Scraper dimulai dengan akun ${account.fbName || account.name}.`,
		});
	}

	static async runSundul(req, res) {
		if (QueueService.isAnyRunning()) {
			return res.status(400).json({ error: queueBusyMessage("sundul") });
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

		let maxActions = 20;
		try {
			const configuredMax = Number(DataService.getAppConfig().sundul_max_actions);
			if (Number.isInteger(configuredMax) && configuredMax > 0) {
				maxActions = Math.min(configuredMax, 100);
			}
		} catch (_e) {}

		const queue = QueueService.getQueue("sundul");
		const started = queue.startSundul(
			targetTitles,
			targetAccountName,
			targetProfileDir,
			accountId,
		);
		if (started) {
			const msg = autoMode
				? `Sundul otomatis dimulai untuk ${targetAccountName} (maks ${maxActions} per run).`
				: targetTitles.length > maxActions
					? `Sundul ${maxActions} dari ${targetTitles.length} postingan dimulai untuk ${targetAccountName}. Sisa ${targetTitles.length - maxActions} akan dicoba pada run berikutnya.`
					: `Sundul ${targetTitles.length} postingan dimulai untuk ${targetAccountName}.`;
			res.json({ success: true, message: msg });
		} else {
			res.status(400).json({ error: queueBusyMessage("sundul") });
		}
	}
}

module.exports = AutomationController;
