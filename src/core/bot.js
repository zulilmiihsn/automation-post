const BrowserManager = require("./browserManager");
const Logger = require("../utils/logger");
const MarketplaceService = require("../services/marketplaceService");
const FeedService = require("../services/feedService");
const ShareService = require("../services/shareService");
const CommentService = require("../services/commentService");
const ChatService = require("../services/chatService");

/**
 * Full-featured Facebook automation bot.
 * Composes BrowserManager for browser lifecycle, adds automation sub-services.
 *
 * @class FacebookBot
 */
class FacebookBot {
	/**
	 * @param {{ accountName?: string, userDataDir?: string }} options
	 */
	constructor(options = {}) {
		this.accountName = options.accountName || "Bot";
		this.logger = new Logger(this.accountName);
		this._browser = new BrowserManager({
			accountName: this.accountName,
			userDataDir: options.userDataDir || "./fb-profile",
		});
		/** @type {import('playwright-core').Page | null} */
		this.page = null;
		/** @type {import('playwright-core').BrowserContext | null} */
		this.context = null;
		// Session-level typing speed variance
		this._typingSpeedFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2x
	}

	// --- ENGINE ---

	/**
	 * Initialize browser and all sub-services.
	 * @returns {Promise<void>}
	 */
	async init() {
		try {
			const headless = process.env.HEADLESS === "true";
			await this._browser.init({ headless });
			this.context = this._browser.context;
			this.page = this._browser.page;

			// Ensure browser is focused
			await this.page.bringToFront();
			await new Promise((r) => setTimeout(r, 500));

			// Initialize sub-services
			this.marketplace = new MarketplaceService(this.page, this.accountName);
			this.feed = new FeedService(this.page, this.accountName);
			this.share = new ShareService(this.page, this.accountName);
			this.comment = new CommentService(this.page, this.accountName);
			this.chat = new ChatService(this.page, this.accountName);
			this.logger.success("Engine bot siap.");
		} catch (err) {
			this.logger.error("Gagal menginisialisasi engine bot", err);
			throw err;
		}
	}

	/**
	 * Close browser and release resources.
	 * @returns {Promise<void>}
	 */
	async close() {
		try {
			await this._browser.close();
			this.context = null;
			this.page = null;
			this.logger.info("Engine bot ditutup.");
		} catch (e) {
			this.logger.warn(`Kesalahan saat menutup engine bot: ${e.message}`);
		}
	}

	/**
	 * Anti-detection: human-like mouse movement to target before clicking.
	 * @param {import('playwright-core').ElementHandle} element
	 * @returns {Promise<void>}
	 */
	async humanMoveTo(element) {
		try {
			const box = await element.boundingBox();
			if (!box) return;
			const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * box.width * 0.3;
			const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * box.height * 0.3;
			// Move with small random steps
			const steps = 3 + Math.floor(Math.random() * 5);
			for (let i = 0; i <= steps; i++) {
				const progress = i / steps;
				const x = targetX * progress + (1 - progress) * (targetX + (Math.random() - 0.5) * 100);
				const y = targetY * progress + (1 - progress) * (targetY + (Math.random() - 0.5) * 100);
				await this.page.mouse.move(x, y);
				await new Promise(r => setTimeout(r, 20 + Math.random() * 40));
			}
			await this.page.mouse.move(targetX, targetY);
		} catch (_e) {
			/* mouse jitter non-critical */
		}
	}

	// --- TASKS ---

	/**
	 * Post a listing to Facebook Marketplace.
	 * @param {object} listing
	 * @returns {Promise<{ success: boolean }>}
	 */
	async postListing(listing) {
		if (!this.page) throw new Error("Bot not initialized. Call init() first.");
		return await this.marketplace.postListing(listing);
	}

	/**
	 * Post content to Facebook feed.
	 * @param {{ text: string, photos?: string[] }} content
	 * @returns {Promise<{ success: boolean, postUrl?: string }>}
	 */
	async postToFeed(content) {
		if (!this.page) throw new Error("Bot not initialized. Call init() first.");
		return await this.feed.postToFeed(content);
	}

	/**
	 * Share a post to multiple Facebook groups.
	 * @param {string|null} postUrl
	 * @param {string} keyword
	 * @param {number} maxGroups
	 * @returns {Promise<Array<{ status: string, error?: string }>>}
	 */
	async sharePostToGroups(postUrl, keyword, maxGroups, caption = "") {
		if (!this.page) throw new Error("Bot not initialized. Call init() first.");
		return await this.share.shareToGroups(postUrl, keyword, maxGroups, caption);
	}

	/**
	 * Comment on a specific Facebook post.
	 * @param {string} postUrl
	 * @param {object} listing
	 * @returns {Promise<void>}
	 */
	async commentOnPost(postUrl, listing) {
		if (!this.page || (typeof this.page.isClosed === 'function' && this.page.isClosed())) {
			this.logger.warn("Browser page tertutup/belum siap. Menginisialisasi ulang...");
			await this.init();
		}
		return await this.comment.commentOnPost(postUrl, listing);
	}

	/**
	 * Reply to unread inbox chats.
	 * @param {{ pin?: string }} options
	 * @returns {Promise<void>}
	 */
	async replyToChats(options) {
		if (!this.page) throw new Error("Bot not initialized. Call init() first.");
		return await this.chat.replyToInbox(options);
	}
}

module.exports = FacebookBot;
