const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const EventEmitter = require("node:events");
const Logger = require("../../utils/logger");

const stripAnsi = (str) =>
	str.replace(
		/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
		"",
	);

function writeTitlesFile(titles) {
	const filePath = path.join(
		os.tmpdir(),
		`automation-post-sundul-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
	);
	fs.writeFileSync(filePath, JSON.stringify(titles), { encoding: "utf8", mode: 0o600 });
	return filePath;
}

function cleanupTitlesFile(filePath) {
	if (!filePath) return;
	try {
		fs.rmSync(filePath, { force: true });
	} catch {
		// Best-effort cleanup; temp files are harmless if removal fails.
	}
}

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
		this._forceKillTimer = null;
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
			stopping: this._stoppedManually,
			queueLength: this.queue.length,
		};
	}

	/**
	 * Mode lain yang sedang memegang lock global.
	 * Satu proses otomasi saja untuk mencegah dua browser/akun bertabrakan.
	 * @returns {string|null}
	 */
	_getBusyMode() {
		const busy = Object.entries(queues).find(
			([mode, queue]) => mode !== this.queueMode && queue.isRunning,
		);
		return busy ? busy[0] : null;
	}

	/**
	 * Satu-satunya pintu keluar proses child: lepas lock, simpan state, emit status.
	 * @param {import("node:child_process").ChildProcess} proc
	 * @param {string} mode
	 * @param {string} label
	 * @param {number|null} code
	 * @param {Error|null} error
	 */
	_finalizeProcess(proc, mode, label, code, error = null) {
		if (this.currentProcess !== proc) return;

		if (this._forceKillTimer) {
			clearTimeout(this._forceKillTimer);
			this._forceKillTimer = null;
		}

		const wasManual = this._stoppedManually;
		this._stoppedManually = false;

		if (error) {
			this.addLog(`[ERROR] ${label} gagal: ${error.message}`);
		} else if (wasManual) {
			this.addLog(`SYSTEM: ${label} dihentikan.`);
		} else {
			this.addLog(`SYSTEM: ${label} selesai dengan kode ${code}`);
		}

		this.isRunning = false;
		this.currentProcess = null;
		this._unwireLogPersist();

		try {
			const DataService = require("./dataService");
			DataService.setQueueState(mode, {
				running: false,
				endedAt: new Date().toISOString(),
			});
		} catch (_e) {}

		this.emit("status", this.getStatus());
		this.emit("done", {
			mode,
			label,
			code,
			error: error ? error.message : null,
			manual: wasManual,
			success: !error && code === 0 && !wasManual,
		});
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

		const busyMode = this._getBusyMode();
		if (busyMode) {
			this.addLog(`SYSTEM: ${label} tidak dimulai; mode ${busyMode} masih berjalan.`);
			return false;
		}

		this.isRunning = true;
		this.logs = [];
		this._stoppedManually = false;
		this.addLog(`SYSTEM: Memulai ${label}...`);
		this.emit("status", this.getStatus());

		// Wire batched persist hook for this mode
		this._wireLogPersist(mode);

		const env = { ...process.env, ...envOverrides };
		let child;
		try {
			child = spawn("node", [scriptPath, ...args], {
				cwd: path.join(__dirname, "../../../"),
				env,
			});
		} catch (error) {
			this.addLog(`[ERROR] Gagal memulai ${label}: ${error.message}`);
			this.isRunning = false;
			this._unwireLogPersist();
			try {
				const DataService = require("./dataService");
				DataService.setQueueState(mode, {
					running: false,
					endedAt: new Date().toISOString(),
				});
			} catch (_e) {}
			this.emit("status", this.getStatus());
			return false;
		}

		this.currentProcess = child;

		try {
			const DataService = require("./dataService");
			DataService.setQueueState(mode, {
				running: true,
				pid: child.pid || null,
				startedAt: new Date().toISOString(),
			});
		} catch (_e) {}

		child.stdout.on("data", (data) => {
			data.toString()
				.split("\n")
				.forEach((l) => {
					const trimmed = l.trim();
					if (trimmed) this.addLog(stripAnsi(trimmed));
				});
		});

		child.stderr.on("data", (data) => {
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

		child.on("close", (code) => this._finalizeProcess(child, mode, label, code));
		child.on("error", (error) => this._finalizeProcess(child, mode, label, null, error));

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

	startScraper(url = null, profileDir = null, groupId = null) {
		const args = [];
		if (url) args.push(url);

		let headless = "false";
		try {
			const DataService = require("./dataService");
			const configVal = DataService.getAppConfig().headless_mode;
			headless = (configVal === "0" || configVal === "false" || configVal === false) ? "false" : "true";
		} catch (e) {}

		const envOverrides = {};
		if (profileDir) envOverrides.SCRAPER_PROFILE_DIR = profileDir;
		if (groupId) envOverrides.SCRAPER_GROUP_ID = String(groupId);
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
		let titlesFile = null;
		let args;
		if (Array.isArray(titlesOrAuto)) {
			titlesFile = writeTitlesFile(titlesOrAuto);
			args = [`--titles-file=${titlesFile}`];
		} else {
			args = ["--auto"];
		}

		let headless = "false";
		let maxActions = 20;
		try {
			const DataService = require("./dataService");
			const config = DataService.getAppConfig();
			const configVal = config.headless_mode;
			headless = (configVal === "0" || configVal === "false" || configVal === false) ? "false" : "true";
			const configuredMax = Number(config.sundul_max_actions);
			if (Number.isInteger(configuredMax) && configuredMax > 0) {
				maxActions = Math.min(configuredMax, 100);
			}
		} catch (e) {}
		args.push(`--max=${maxActions}`);

		const envOverrides = { HEADLESS: headless };
		if (profileDir) {
			envOverrides.SUNDUL_PROFILE_DIR = profileDir;
			envOverrides.SUNDUL_ACCOUNT_NAME = accountName;
			envOverrides.SUNDUL_ACCOUNT_ID = accountId || accountName;
		}

		const started = this._spawnProcess(
			path.join(__dirname, "../../../scripts/sundul.js"),
			args,
			"sundul",
			"Sundul",
			{ envOverrides },
		);

		if (!started) {
			cleanupTitlesFile(titlesFile);
			return false;
		}

		if (titlesFile && this.currentProcess) {
			const cleanup = () => cleanupTitlesFile(titlesFile);
			this.currentProcess.once("close", cleanup);
			this.currentProcess.once("error", cleanup);
		}
		return true;
	}

	stopAutomation() {
		if (this.isRunning && this.currentProcess) {
			if (this._stoppedManually) return true;

			const proc = this.currentProcess;
			this.addLog("SYSTEM: Mengirim sinyal stop (SIGTERM)...");
			this._stoppedManually = true;

			try {
				proc.kill("SIGTERM");
			} catch (error) {
				this.addLog(`[ERROR] Gagal mengirim SIGTERM: ${error.message}`);
			}

			// Fallback: force kill after 5s. Lock tetap dipegang sampai child close.
			if (this._forceKillTimer) clearTimeout(this._forceKillTimer);
			this._forceKillTimer = setTimeout(() => {
				try {
					proc.kill("SIGKILL");
					this.addLog("SYSTEM: Force kill (SIGKILL) karena proses tidak merespon.");
				} catch (_e) {
					/* already dead */
				}
			}, 5000);
			if (this._forceKillTimer.unref) this._forceKillTimer.unref();

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

function getRunningModes() {
	return Object.entries(queues)
		.filter(([, queue]) => queue.isRunning)
		.map(([mode]) => mode);
}

module.exports = {
	getQueue: (mode) => {
		const targetMode = mode || "all";
		if (!Object.prototype.hasOwnProperty.call(queues, targetMode)) {
			throw new RangeError(`Unsupported queue mode: ${targetMode}`);
		}
		return queues[targetMode];
	},
	getAllQueues: () => queues,
	getRunningModes,
	isAnyRunning: () => getRunningModes().length > 0,
	// Compatibility properties for backward compat with default root tests / generic imports
	startFullAutomation: (mode, accountId) =>
		module.exports.getQueue(mode).startFullAutomation(mode, accountId),
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
