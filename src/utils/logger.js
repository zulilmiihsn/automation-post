const chalk = require("chalk");

class Logger {
	constructor(context = "SYSTEM") {
		this.context = context;
	}

	/**
	 * Map-based persist hooks keyed by mode.
	 * Supports concurrent queues without overwriting each other.
	 * Signature: Map<mode, (level, context, message) => void>
	 */
	static _persistHooks = new Map();

	/** Write buffer for batched DB writes (flushed every 1s) */
	static _buffer = [];
	static _flushTimer = null;

	/**
	 * Register a persist hook for a specific mode.
	 * @param {string} mode - Queue mode identifier
	 * @param {Function|null} fn - Hook function or null to remove
	 */
	static setPersistHook(mode, fn) {
		if (fn) {
			Logger._persistHooks.set(mode, fn);
		} else {
			Logger._persistHooks.delete(mode);
		}
		// Start flush timer on first hook
		if (Logger._persistHooks.size > 0 && !Logger._flushTimer) {
			Logger._flushTimer = setInterval(() => Logger._flush(), 1000);
			// Don't keep process alive just for flushing
			if (Logger._flushTimer.unref) Logger._flushTimer.unref();
		}
		// Stop timer when no hooks remain
		if (Logger._persistHooks.size === 0 && Logger._flushTimer) {
			Logger._flush(); // flush remaining
			clearInterval(Logger._flushTimer);
			Logger._flushTimer = null;
		}
	}

	/** Flush buffered logs to all registered hooks */
	static _flush() {
		if (Logger._buffer.length === 0) return;
		const batch = Logger._buffer.splice(0);
		for (const fn of Logger._persistHooks.values()) {
			try { fn(batch); } catch (_e) { /* never crash */ }
		}
	}

	_persist(level, msg) {
		if (Logger._persistHooks.size === 0) return;
		Logger._buffer.push({ level, context: this.context, message: msg, timestamp: new Date().toISOString() });
	}

	info(msg) {
		console.log(`${chalk.blue("[INFO]   ")} [${this.context}] ${msg}`);
		this._persist("info", msg);
	}

	success(msg) {
		console.log(`${chalk.green("[SUCCESS]")} [${this.context}] ${msg}`);
		this._persist("success", msg);
	}

	warn(msg) {
		console.log(`${chalk.yellow("[WARN]   ")} [${this.context}] ${msg}`);
		this._persist("warn", msg);
	}

	method(status, methodName, detail = "") {
		const normalized = String(status || "INFO").toUpperCase();
		
		// Sembunyikan spam technical log untuk Human, kecuali DEBUG dinyalakan
		if (process.env.DEBUG !== "true" && ["SUCCESS", "TRY", "SKIP"].includes(normalized)) {
			return;
		}

		const suffix = detail ? ` ${detail}` : "";
		const msg = `METHOD ${normalized} [${methodName}]${suffix}`;

		if (normalized === "SUCCESS") {
			this.success(msg);
		} else if (normalized === "FAIL") {
			this.warn(msg);
		} else if (normalized === "ERROR") {
			this.error(msg);
		} else if (normalized === "SKIP") {
			this.warn(msg);
		} else {
			this.info(msg);
		}
	}

	error(msg, err) {
		console.error(`${chalk.red("[ERROR]  ")} [${this.context}] ${msg}`);
		if (err?.stack) {
			console.error(chalk.gray(err.stack));
		}
		this._persist("error", err?.stack ? `${msg}\n${err.stack}` : msg);
	}
}

module.exports = Logger;
