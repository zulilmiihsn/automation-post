const Logger = require("../utils/logger");
const DataService = require("../web/services/dataService");

/**
 * Circuit Breaker pattern for external API calls (e.g., GROQ API).
 * States: CLOSED (ok) -> OPEN (paused) -> HALF_OPEN (testing)
 */
class CircuitBreaker {
	constructor(name, { threshold = 3, resetTimeout = 60000 } = {}) {
		this.name = name;
		this.threshold = threshold;
		this.resetTimeout = resetTimeout;
		this.failureCount = 0;
		this.lastFailureTime = 0;
		this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
		this.logger = new Logger(`CB-${name}`);
	}

	async execute(fn) {
		if (this.state === "OPEN") {
			if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
				this.state = "HALF_OPEN";
				this.logger.info(`Circuit ${this.name}: HALF_OPEN - testing...`);
			} else {
				const remaining = Math.ceil((this.resetTimeout - (Date.now() - this.lastFailureTime)) / 1000);
				this.logger.warn(`Circuit ${this.name}: OPEN - skipping (${remaining}s until retry)`);
				throw new Error(`Circuit breaker OPEN: ${this.name} (${remaining}s cooldown)`);
			}
		}

		try {
			const result = await fn();
			this._onSuccess();
			return result;
		} catch (err) {
			this._onFailure();
			throw err;
		}
	}

	_onSuccess() {
		if (this.state === "HALF_OPEN") {
			this.logger.success(`Circuit ${this.name}: recovered, closing.`);
		}
		this.failureCount = 0;
		this.state = "CLOSED";
	}

	_onFailure() {
		this.failureCount++;
		this.lastFailureTime = Date.now();
		if (this.failureCount >= this.threshold) {
			this.state = "OPEN";
			this.logger.error(`Circuit ${this.name}: OPEN after ${this.failureCount} failures. Pausing ${this.resetTimeout / 1000}s.`);
			DataService.addHealthEvent("circuit_breaker", "circuit_open", `${this.name} opened after ${this.failureCount} failures`, "warn");
		}
	}

	getStatus() {
		return {
			name: this.name,
			state: this.state,
			failures: this.failureCount,
			cooldownRemaining: this.state === "OPEN"
				? Math.max(0, this.resetTimeout - (Date.now() - this.lastFailureTime))
				: 0,
		};
	}
}

/**
 * Health Monitor Service
 * - Monitors browser health, API health, memory usage
 * - Persists health events
 * - Auto-cleanup old events
 */
class HealthService {
	constructor() {
		this.logger = new Logger("HEALTH");
		this.circuitBreakers = new Map();
		this._monitorInterval = null;
		this._memoryWarnThreshold = 500 * 1024 * 1024; // 500MB
	}

	/**
	 * Get or create a circuit breaker for a named service.
	 */
	getCircuitBreaker(name, options) {
		if (!this.circuitBreakers.has(name)) {
			this.circuitBreakers.set(name, new CircuitBreaker(name, options));
		}
		return this.circuitBreakers.get(name);
	}

	/**
	 * Wrap an async function with a circuit breaker.
	 */
	async withCircuitBreaker(name, fn, options) {
		const cb = this.getCircuitBreaker(name, options);
		return cb.execute(fn);
	}

	/**
	 * Check if a circuit breaker allows calls (not OPEN).
	 */
	isCircuitClosed(name) {
		const cb = this.circuitBreakers.get(name);
		return !cb || cb.state !== "OPEN";
	}

	/**
	 * Start periodic health monitoring.
	 */
	startMonitoring(intervalMs = 30000) {
		if (this._monitorInterval) return;

		this.logger.info("Health monitoring started.");
		this._monitorInterval = setInterval(() => this._tick(), intervalMs);
		if (this._monitorInterval.unref) this._monitorInterval.unref();

		// Clean old events on start
		DataService.clearHealthEvents(3);
	}

	/**
	 * Stop monitoring.
	 */
	stopMonitoring() {
		if (this._monitorInterval) {
			clearInterval(this._monitorInterval);
			this._monitorInterval = null;
			this.logger.info("Health monitoring stopped.");
		}
	}

	/**
	 * Record a health event.
	 */
	recordEvent(source, type, message, severity = "info") {
		DataService.addHealthEvent(source, type, message, severity);
	}

	/**
	 * Check memory usage of current process.
	 */
	checkMemory() {
		const usage = process.memoryUsage();
		const rssMB = Math.round(usage.rss / 1024 / 1024);
		const heapMB = Math.round(usage.heapUsed / 1024 / 1024);

		if (usage.rss > this._memoryWarnThreshold) {
			this.logger.warn(`High memory usage: RSS=${rssMB}MB, Heap=${heapMB}MB`);
			this.recordEvent("process", "high_memory", `RSS=${rssMB}MB Heap=${heapMB}MB`, "warn");
		}

		return { rssMB, heapMB };
	}

	/**
	 * Get health status summary.
	 */
	getStatus() {
		const memory = this.checkMemory();
		const breakers = {};
		for (const [name, cb] of this.circuitBreakers) {
			breakers[name] = cb.getStatus();
		}
		const recentEvents = DataService.getHealthEvents(10);

		return {
			healthy: Object.values(breakers).every(b => b.state !== "OPEN"),
			memory,
			circuitBreakers: breakers,
			recentEvents,
			uptime: process.uptime(),
		};
	}

	_tick() {
		try {
			this.checkMemory();
		} catch (err) {
			this.logger.error("Health tick error:", err);
		}
	}
}

// Singleton instance
module.exports = new HealthService();
module.exports.CircuitBreaker = CircuitBreaker;
