const { spawn } = require("node:child_process");
const path = require("node:path");
const EventEmitter = require("node:events");
const Logger = require("../../utils/logger");

const stripAnsi = (str) =>
	str.replace(
		/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
		"",
	);

function parseChildLog(msg) {
	let level = "info";
	let context = "SYSTEM";
	let message = msg;

	if (msg.includes("[ERROR]") || msg.includes("ERROR:")) level = "error";
	else if (msg.includes("[WARN]")) level = "warn";
	else if (msg.includes("[SUCCESS]") || msg.includes("Berhasil")) level = "success";
	else if (msg.includes("SYSTEM:") || msg.includes(">>>") || msg.includes("<<<")) level = "system";

	const ctxMatch = msg.match(/\[\w+\]\s+\[([^\]]+)\]/);
	if (ctxMatch) {
		context = ctxMatch[1];
		message = msg.replace(/^.*?\]\s+\[[^\]]+\]\s*/, "").trim();
	}

	return { level, context, message };
}

class JobQueue extends EventEmitter {
	constructor(queueMode) {
		super();
		this.queueMode = queueMode || "all";
		this.queue = [];
		this.isRunning = false;
		this.currentProcess = null;
		this.logs = [];
		this._stoppedManually = false;
	}

	addLog(msg) {
		const logStr = `[${new Date().toISOString().split("T")[1].split(".")[0]}] ${msg}`;
		this.logs.push(logStr);
		if (this.logs.length > 500) this.logs.shift();
		this.emit("log", logStr);

		try {
			const DataService = require("./dataService");
			const parsed = parseChildLog(msg);
			DataService.addLog(this.queueMode, parsed.level, parsed.context, parsed.message);
		} catch (_e) {}

		if (this.queueMode !== "all" && typeof queues !== "undefined" && queues.all) {
			queues.all.addLog(`[${this.queueMode.toUpperCase()}] ${msg}`);
		}
	}

	getLogs() {
		return this.logs;
	}

	getStatus() {
		return {
			isRunning: this.isRunning,
			queueLength: this.queue.length,
		};
	}

	/**
	 * Shared spawn logic for all process types.
	 * @param {string} scriptPath - Script to run
	 * @param {string[]} args - CLI arguments
	 * @param {string} mode - Queue mode for log tagging
	 * @param {string} label - Human label for start/finish logs
	 * @param {object} [envOverrides] - Extra env vars
	 * @param {string} [stderrLevel] - Default log level for stderr lines
	 * @param {Function} [stderrFilter] - Optional filter: (line) => level
	 */
	_spawnProcess(scriptPath, args, mode, label, { envOverrides, stderrLevel, stderrFilter } = {}) {
		if (this.isRunning) return false;

		this.isRunning = true;
		this.logs = [];
		this.addLog(`SYSTEM: Memulai ${label}...`);
		this.emit("status", this.getStatus());

		// Wire batched persist hook for this mode
		this._wireLogPersist(mode);

		const env = { ...process.env, ...envOverrides };
		this.currentProcess = spawn("node", [scriptPath, ...args], {
			cwd: path.join(__dirname, "../../../"),
			env,
		});

		this.currentProcess.stdout.on("data", (data) => {
			data.toString()
				.split("\n")
				.forEach((l) => {
					const trimmed = l.trim();
					if (trimmed) this.addLog(stripAnsi(trimmed));
				});
		});

		this.currentProcess.stderr.on("data", (data) => {
			data.toString()
				.split("\n")
				.forEach((l) => {
					const trimmed = l.trim();
					if (!trimmed) return;
					const clean = stripAnsi(trimmed);
					const level = stderrFilter ? stderrFilter(clean) : (stderrLevel || "ERROR");
					this.addLog(level === "ERROR" && !clean.includes("[ERROR]") ? `[ERROR] ${clean}` : clean);
				});
		});

		this._stoppedManually = false;

		this.currentProcess.on("close", (code) => {
			if (this._stoppedManually) {
				this._stoppedManually = false;
				return;
			}
			this.addLog(`SYSTEM: ${label} selesai dengan kode ${code}`);
			this.isRunning = false;
			this.currentProcess = null;
			this._unwireLogPersist();
			this.emit("status", this.getStatus());
			this.emit("done");
		});

		return true;
	}

	startFullAutomation(mode = "all", accountId = null, commentTargetUrl = null) {
		const args = [`--mode=${mode}`];
		if (accountId) args.push(`--accountId=${accountId}`);
		if (commentTargetUrl) args.push(`--commentTargetUrl=${commentTargetUrl}`);

		// Plumb toggle headless dari config (headless_mode: '1' = headless, '0' = headful)
		let headless = "false";
		try {
			const DataService = require("./dataService");
			const configVal = DataService.getAppConfig().headless_mode;
			headless = (configVal === "0" || configVal === "false" || configVal === false) ? "false" : "true";
		} catch (e) {
			/* default headful jika config belum siap */
		}

		return this._spawnProcess(
			"main.js",
			args,
			mode,
			`Otomasi ${mode.toUpperCase()}`,
			{
				envOverrides: { HEADLESS: headless },
				stderrFilter: (line) => line.includes("[ERROR]") ? "ERROR" : "ERROR",
			},
		);
	}

	startAgent(accountId = null, limit = 5, targetUrl = null) {
		const args = [];
		if (accountId) args.push(`--accountId=${accountId}`);
		if (limit) args.push(`--limit=${limit}`);
		if (targetUrl) args.push(`--url=${targetUrl}`);

		let headless = "false";
		try {
			const DataService = require("./dataService");
			const configVal = DataService.getAppConfig().headless_mode;
			headless = (configVal === "0" || configVal === "false" || configVal === false) ? "false" : "true";
		} catch (e) {}

		return this._spawnProcess(
			path.join(__dirname, "../../../scripts/groqFbAgent.js"),
			args,
			"agent",
			"AI Agent",
			{ envOverrides: { HEADLESS: headless } }
		);
	}

	startScraper(url = null, profileDir = null) {
		const args = [];
		if (url) args.push(url);

		let headless = "false";
		try {
			const DataService = require("./dataService");
			const configVal = DataService.getAppConfig().headless_mode;
			headless = (configVal === "0" || configVal === "false" || configVal === false) ? "false" : "true";
		} catch (e) {}

		const envOverrides = profileDir ? { SCRAPER_PROFILE_DIR: profileDir } : {};
		envOverrides.HEADLESS = headless;

		return this._spawnProcess(
			path.join(__dirname, "../../../scripts/scraper.js"),
			args,
			"scraper",
			"Scraper",
			{
				envOverrides,
				stderrLevel: "WARN",
			},
		);
	}

	startSundul(titlesOrAuto, accountName = "", profileDir = null, accountId = null) {
		const args = Array.isArray(titlesOrAuto)
			? [`--titles=${titlesOrAuto.join(",")}`]
			: ["--auto"];

		let headless = "false";
		try {
			const DataService = require("./dataService");
			const configVal = DataService.getAppConfig().headless_mode;
			headless = (configVal === "0" || configVal === "false" || configVal === false) ? "false" : "true";
		} catch (e) {}

		const envOverrides = { HEADLESS: headless };
		if (profileDir) {
			envOverrides.SUNDUL_PROFILE_DIR = profileDir;
			envOverrides.SUNDUL_ACCOUNT_NAME = accountName;
			envOverrides.SUNDUL_ACCOUNT_ID = accountId || accountName;
		}

		return this._spawnProcess(
			path.join(__dirname, "../../../scripts/sundul.js"),
			args,
			"sundul",
			"Sundul",
			{ envOverrides },
		);
	}

	stopAutomation() {
		if (this.isRunning && this.currentProcess) {
			const proc = this.currentProcess;
			this.addLog("SYSTEM: Mengirim sinyal stop (SIGTERM)...");
			this._stoppedManually = true;
			proc.kill("SIGTERM");

			// Fallback: force kill after 5s
			const forceKillTimer = setTimeout(() => {
				try {
					proc.kill("SIGKILL");
					this.addLog("SYSTEM: Force kill (SIGKILL) karena proses tidak merespon.");
				} catch (_e) {
					/* already dead */
				}
			}, 5000);

			proc.once("close", () => clearTimeout(forceKillTimer));

			this.addLog("SYSTEM: Otomasi dihentikan.");
			this.isRunning = false;
			this.currentProcess = null;
			this._unwireLogPersist();
			this.emit("status", this.getStatus());
			return true;
		}
		return false;
	}

	_wireLogPersist(mode) {
		try {
			const DataService = require("../services/dataService");
			// Register batch hook: Logger flushes an array of {level, context, message}
			Logger.setPersistHook(mode, (batch) => {
				const rows = batch.map((entry) => ({
					mode,
					level: entry.level,
					context: entry.context,
					message: entry.message,
				}));
				DataService.addLogBatch(rows);
			});
		} catch (_e) {
			// DataService might not be ready yet
		}
	}

	_unwireLogPersist() {
		Logger.setPersistHook(this.queueMode, null);
	}
}

// Store separate instances by mode
const queues = {
	marketplace: new JobQueue("marketplace"),
	viral: new JobQueue("viral"),
	comment: new JobQueue("comment"),
	all: new JobQueue("all"),
	chat: new JobQueue("chat"),
	agent: new JobQueue("agent"),
	scraper: new JobQueue("scraper"),
	sundul: new JobQueue("sundul"),
};

module.exports = {
	getQueue: (mode) => {
		const targetMode = mode || "all";
		if (!queues[targetMode]) {
			queues[targetMode] = new JobQueue(targetMode);
		}
		return queues[targetMode];
	},
	getAllQueues: () => queues,
	isAnyRunning: () => Object.values(queues).some((queue) => queue.isRunning),
	// Compatibility properties for backward compat with default root tests / generic imports
	startFullAutomation: (mode, accountId) =>
		queues[mode || "all"].startFullAutomation(mode, accountId),
	stopAutomation: () => {
		let stopped = false;
		for (const q of Object.values(queues)) {
			if (q.stopAutomation()) stopped = true;
		}
		return stopped;
	},
	getStatus: () => queues.all.getStatus(),
	getLogs: () => queues.all.getLogs(),
	on: (...args) => queues.all.on(...args),
	removeListener: (...args) => queues.all.removeListener(...args),
	emit: (...args) => queues.all.emit(...args),
};
