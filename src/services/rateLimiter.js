const Logger = require("../utils/logger");
const DataService = require("../web/services/dataService");

/**
 * Smart Rate Limiter
 * - Per-action delays with jitter
 * - Progressive backoff on FB warnings
 * - Daily action budgets per account
 */
class RateLimiter {
	constructor() {
		this.logger = new Logger("RATE-LIMIT");

		// Default action delays [min, max] in ms
		this.delays = {
			like:     { min: 2000,  max: 5000  },
			comment:  { min: 5000,  max: 10000 },
			post:     { min: 10000, max: 20000 },
			share:    { min: 5000,  max: 12000 },
			chat:     { min: 3000,  max: 6000  },
		};

		// Default daily budgets (can be overridden by config)
		this.defaultBudgets = {
			like: 50,
			comment: 30,
			post: 20,
			share: 40,
			chat: 30,
		};

		// Backoff multipliers per account (reset on process restart)
		this._backoff = new Map(); // accountId -> multiplier

		// Warning keywords that trigger backoff
		this._warningPatterns = [
			/restricted/i,
			/limit/i,
			/terbatas/i,
			/batas/i,
			/account.?limit/i,
			/temporarily.?blocked/i,
			/spam/i,
		];
	}

	/**
	 * Check if an account can perform an action today.
	 * @param {string} accountId The DB account ID
	 * @param {string} actionType 'post', 'like', 'comment', 'share', 'chat'
	 * @returns {boolean} True if budget > used
	 */
	canAct(accountId, actionType) {
		if (this.isGlobalPaused()) {
			this.logger.warn("Otomasi dijeda oleh Global Circuit Breaker.");
			return false;
		}
		const budget = this._getBudget(actionType);
		const used = DataService.getActionCount(accountId, actionType);
		return used < budget;
	}

	/**
	 * Record that an action was performed.
	 * @param {string} accountId The DB account ID
	 * @param {string} actionType 'post', 'like', 'comment', 'share', 'chat'
	 * @returns {void}
	 */
	recordAction(accountId, actionType) {
		DataService.incrementAction(accountId, actionType);
	}

	/**
	 * Get the delay before next action (with jitter and backoff).
	 */
	getDelay(actionType, accountId = null) {
		const range = this.delays[actionType] || { min: 2000, max: 5000 };
		const base = range.min + Math.random() * (range.max - range.min);

		// Apply backoff multiplier
		const multiplier = accountId ? (this._backoff.get(accountId) || 1) : 1;
		return Math.round(base * multiplier);
	}

	/**
	 * Wait for a randomized delay suitable for the given action type.
	 * Includes backoff multiplier if account was recently warned.
	 * @param {import('playwright-core').Page} page Playwright page to perform delay on
	 * @param {string} actionType 'post', 'like', 'comment', 'share', 'chat'
	 * @param {string} [accountId] Used to retrieve backoff penalty
	 * @returns {Promise<void>}
	 */
	async delayFor(page, actionType, accountId = null) {
		const delay = this.getDelay(actionType, accountId);
		this.logger.info(`Delay ${actionType}: ${(delay / 1000).toFixed(1)}s` +
			(accountId && this._backoff.get(accountId) > 1 ? ` (backoff x${this._backoff.get(accountId)})` : ""));
		await new Promise(resolve => setTimeout(resolve, delay));
	}

	/**
	 * Check error message for rate-limit patterns and apply penalty if matched.
	 * @param {string} accountId
	 * @param {Error|string} error
	 * @returns {boolean} True if warning pattern matched
	 */
	handleWarning(accountId, error) {
		const message = typeof error === 'string' ? error : error.message;
		const isWarning = this._warningPatterns.some(p => p.test(message));
		if (isWarning && accountId) {
			const current = this._backoff.get(accountId) || 1;
			const next = Math.min(current * 3, 27); // Max 27x backoff (aggressive)
			this._backoff.set(accountId, next);
			this.logger.warn(`Progressive backoff for ${accountId}: x${next} (detected: "${message.substring(0, 60)}")`);
			DataService.addHealthEvent("rate_limiter", "fb_warning", `${accountId}: ${message.substring(0, 100)}`, "warn");

			// Global Circuit Breaker Logic
			const blockedAccounts = Array.from(this._backoff.values()).filter(val => val > 1).length;
			if (blockedAccounts >= 3) {
				this.logger.error("GLOBAL CIRCUIT BREAKER TERPICU! 3+ akun terkena peringatan. Jeda 1 jam aktif.");
				DataService.addHealthEvent("rate_limiter", "circuit_breaker", "3+ accounts restricted. Halting all actions.", "error");
				this.triggerGlobalPause(3600000); // 1 hour pause
			}

			return true;
		}
		return false;
	}

	triggerGlobalPause(ms) {
		this._globalPauseUntil = Date.now() + ms;
	}

	isGlobalPaused() {
		return this._globalPauseUntil && Date.now() < this._globalPauseUntil;
	}

	/**
	 * Reset backoff for an account (call on new session start).
	 * @param {string} accountId
	 */
	resetBackoff(accountId) {
		this._backoff.delete(accountId);
	}

	/**
	 * @private
	 * @param {string} accountId
	 * @returns {number}
	 */
	_getBackoff(accountId) {
		return this._backoff.get(accountId) || 1;
	}

	/**
	 * Get remaining budget for an account today.
	 */
	getRemainingBudget(accountId, actionType) {
		const budget = this._getBudget(actionType);
		const used = DataService.getActionCount(accountId, actionType);
		return Math.max(0, budget - used);
	}

	/**
	 * Get summary of budget vs usage for an account.
	 * @param {string} accountId
	 * @returns {Record<string, { budget: number, used: number, remaining: number }>}
	 */
	getBudgetSummary(accountId) {
		const summary = {};
		for (const actionType of Object.keys(this.defaultBudgets)) {
			summary[actionType] = {
				budget: this._getBudget(actionType),
				used: DataService.getActionCount(accountId, actionType),
				remaining: this.getRemainingBudget(accountId, actionType),
			};
		}
		return summary;
	}

	/**
	 * Reload budgets from config (call on config change).
	 */
	reloadFromConfig() {
		try {
			const config = DataService.getAppConfig();
			if (config.rate_limit_likes_per_day) this.defaultBudgets.like = parseInt(config.rate_limit_likes_per_day, 10);
			if (config.rate_limit_posts_per_day) this.defaultBudgets.post = parseInt(config.rate_limit_posts_per_day, 10);
			if (config.rate_limit_comments_per_day) this.defaultBudgets.comment = parseInt(config.rate_limit_comments_per_day, 10);
		} catch (_e) {
			this.logger.warn(`Gagal load rate limit config: ${_e.message}`);
		}
	}

	/**
	 * @private
	 * @param {string} actionType
	 * @returns {number}
	 */
	_getBudget(actionType) {
		const config = DataService.getAppConfig();
		const mapping = {
			like: "rate_limit_likes_per_day",
			post: "rate_limit_posts_per_day",
			comment: "rate_limit_comments_per_day",
		};
		const key = mapping[actionType];
		if (key && config[key] !== undefined && config[key] !== "") {
			return parseInt(config[key], 10);
		}
		return this.defaultBudgets[actionType] || 50;
	}
}

module.exports = new RateLimiter();
