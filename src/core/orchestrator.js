const FacebookBot = require("./bot");
const DataService = require("../web/services/dataService");
const RateLimiter = require("../services/rateLimiter");
const Logger = require("../utils/logger");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

/**
 * Orchestrates Facebook automation workflows across multiple accounts and listings.
 * Handles queuing, rate limiting, and failure recovery.
 *
 * @class BotOrchestrator
 */
class BotOrchestrator {
	/**
	 * @param {string} [runMode="all"] "all", "viral", "marketplace", "comment", "chat"
	 * @param {string|null} [accountId=null] Target specific account, or null for all
	 * @param {string|null} [commentTargetUrl=null] Target specific post URL for comment mode
	 */
	constructor(runMode = "all", accountId = null, commentTargetUrl = null) {
		this.runMode = runMode;
		this.accountId = accountId;
		this.commentTargetUrl = commentTargetUrl;
		this.logger = new Logger("ORCHESTRATOR");
		this.runId = null;
		this.runStartedAt = null;
		this.stopped = false;
		this.activeBots = new Set();
		this.chatCycles = Number(process.env.CHAT_CYCLES || 0); // 0 = tanpa batas
		this.chatIntervalMs = Number(process.env.CHAT_INTERVAL_MS || 5000);
	}

	/**
	 * Minta loop berhenti + tutup browser aktif. Dipanggil dari SIGINT/SIGTERM.
	 */
	async requestStop() {
		this.stopped = true;
		for (const bot of Array.from(this.activeBots)) {
			try {
				await bot.close();
			} catch (_e) {}
		}
	}

	async _sleepInterruptible(ms) {
		const step = 100;
		let waited = 0;
		while (waited < ms && !this.stopped) {
			const chunk = Math.min(step, ms - waited);
			await new Promise((r) => setTimeout(r, chunk));
			waited += chunk;
		}
	}

	/**
	 * Run the main orchestrator loop based on current runMode.
	 * Discovers target accounts and active listings, then processes them sequentially.
	 *
	 * @returns {Promise<void>}
	 */
	async run() {
		this.runId = randomUUID();
		this.runStartedAt = Date.now();
		let runStatus = "completed";
		let runError = null;
		DataService.startAutomationRun({ runId: this.runId, mode: this.runMode });
		try {
			this.logger.info("Mencari listing aktif dan akun...");

			const activeListings = await this._getActiveListings();
			const linkedAccounts = await this._getLinkedAccounts();
			DataService.updateAutomationRunScope(this.runId, {
				accountsCount: linkedAccounts.length,
				listingsCount: activeListings.length,
			});

			this.logger.info(`Orchestrator: filter accountId = ${this.accountId || 'tidak ada'}. Akun terhubung ditemukan = ${linkedAccounts.map(a => `${a.fbName || a.name} (${a.id})`).join(', ')}`);

			if (this.runMode !== "chat" && activeListings.length === 0) {
				runStatus = "skipped";
				this.logger.warn("Tidak ada listing aktif untuk diposting.");
				return;
			}

			if (linkedAccounts.length === 0) {
				runStatus = "skipped";
				this.logger.error(
					"Tidak ada akun Facebook yang tertaut (linked). Mohon login dulu di Dashboard.",
				);
				return;
			}

			this.logger.info(
				`Ditemukan ${activeListings.length} listing aktif dan ${linkedAccounts.length} akun terhubung.`,
			);

			if (this.runMode === "chat") {
				this.logger.info("Memulai loop Balas Chat (stop: Ctrl+C / requestStop)...");
				await this._runChatMode(linkedAccounts);
				if (this.stopped) {
					runStatus = "stopped";
					this.logger.warn("Loop chat dihentikan user.");
				}
				return;
			}

			if (this.runMode === "viral") {
				this.logger.info("Memulai mode VIRAL SHARE (Berbasis Listing)...");
				await this._runViralMode(activeListings, linkedAccounts);
			} else {
				for (const account of linkedAccounts) {
					await this._processAccount(account, activeListings);
				}
			}

			this.logger.success("Semua antrean otomasi selesai.");
		} catch (err) {
			runStatus = "failed";
			runError = err.message || String(err);
			this.logger.error("Kesalahan fatal:", err);
		} finally {
			try {
				await DataService.resetHangingListings();
			} catch (_e) {
				this.logger.warn(`Gagal reset hanging listings: ${_e.message}`);
			}
			DataService.finishAutomationRun({
				runId: this.runId,
				status: runStatus,
				durationMs: Date.now() - this.runStartedAt,
				errorMessage: runError,
			});
		}
	}

	async _getActiveListings() {
		const listings = await DataService.getListings();
		let filtered = [];
		if (this.runMode === "comment" || this.runMode === "viral") {
			filtered = listings.filter((l) => l.isActive && l.autoFeed);
		} else if (this.runMode === "marketplace") {
			filtered = listings.filter((l) => l.isActive && l.postMarketplace !== false);
		} else {
			filtered = listings.filter((l) => l.isActive);
		}

		// Fisher-Yates Shuffle
		for (let i = filtered.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[filtered[i], filtered[j]] = [filtered[j], filtered[i]];
		}

		return filtered;
	}

	async _getLinkedAccounts() {
		const accounts = await DataService.getAccounts();
		const activeLinked = accounts.filter((a) => a.linked && a.isActive);
		if (this.runMode === "chat") {
			// Toggle per akun: kosong = semua. Mati = tanpa browser + polling.
			try {
				const cfg = DataService.getAppConfig();
				const raw = cfg.chat_enabled_accounts;
				if (raw) {
					const enabled = new Set(JSON.parse(raw));
					const scoped = activeLinked.filter((a) => enabled.has(String(a.id)));
					if (this.accountId) return scoped.filter((a) => String(a.id) === String(this.accountId));
					return scoped;
				}
			} catch (_e) {}
		}
		if (this.accountId) {
			const selected = activeLinked.filter((a) => String(a.id) === String(this.accountId));
			if (selected.length === 0) {
				this.logger.warn(`Akun dengan ID ${this.accountId} tidak aktif, tidak terhubung, atau tidak ditemukan.`);
			}
			return selected;
		}
		return activeLinked;
	}

	/**
	 * Process a single account's workload.
	 * Launches browser, executes tasks for listings, and handles persistence.
	 *
	 * @param {object} account The account object from DB
	 * @param {object[]} activeListings List of active listings to process
	 * @returns {Promise<void>}
	 */
	async _processAccount(account, activeListings) {
		const displayName = account.fbName || account.name;
		this.logger.info(`Memulai proses untuk akun: ${displayName}`);

		const bot = new FacebookBot({
			accountName: displayName,
			userDataDir: path.isAbsolute(account.profile)
				? account.profile
				: path.join(process.cwd(), account.profile),
		});
		this.activeBots.add(bot);

		try {
			if (this.stopped) return;
			await bot.init();

			if (this.runMode === "chat") {
				this.logger.info(`[${displayName}] Memeriksa inbox...`);
				try {
					const res = await bot.replyToChats({ pin: account.e2ee_pin });
					for (const t of (res && res.threads) || []) {
						if (t.status !== "replied" && t.status !== "failed") continue;
						try {
							DataService.recordAutomationEvent({
								actionType: "chat_reply",
								runId: this.runId,
								mode: "chat",
								accountId: account.id,
								result: t.status === "replied" ? "success" : "failed",
								message: `${t.buyer}: ${t.reply || t.reason || ""}`.slice(0, 200),
								metadata: { buyer: t.buyer, reply: t.reply || null },
							});
						} catch (_e) {}
					}
				} catch (e) {
					this.logger.error(`Error saat cek chat akun ${displayName}:`, e);
				}
				return;
			}

			// Load checkpoint for resume capability
			let startIndex = 0;
			try {
				const cfg = DataService.getAppConfig();
				const cpKey = `checkpoint_${account.id}_${this.runMode}`;
				if (cfg[cpKey]) {
					startIndex = parseInt(cfg[cpKey], 10) || 0;
					if (startIndex > 0 && startIndex < activeListings.length) {
						this.logger.info(`[${displayName}] Resuming from checkpoint: listing ${startIndex + 1}/${activeListings.length}`);
					} else {
						startIndex = 0;
					}
				}
			} catch (_e) {
				this.logger.warn(`Gagal baca checkpoint untuk ${account.id}: ${_e.message}`);
			}

			let count = startIndex;
			for (let i = startIndex; i < activeListings.length; i++) {
				if (this.stopped) break;
				const listing = activeListings[i];
				count++;
				let retries = 3;
				while (retries > 0) {
					try {
						await this._processListing(
							bot,
							account,
							listing,
							count,
							activeListings.length,
						);
						// Save checkpoint after each successful listing
						try {
							DataService.setAppConfig(`checkpoint_${account.id}_${this.runMode}`, String(i + 1));
						} catch (_e) {
							this.logger.warn(`Gagal simpan checkpoint: ${_e.message}`);
						}
						break;
					} catch (e) {
						const classification = this._classifyError(e);
						this.logger.warn(`[${displayName}] Error classified as ${classification}: ${e.message.substring(0, 80)}`);

						if (classification === "TRANSIENT" && retries > 1) {
							this.logger.warn(`Browser hancur/timeout. Menginisialisasi ulang... (sisa ${retries - 1} percobaan)`);
							await bot.close();
							await bot.init();
							retries--;
						} else if (classification === "FATAL") {
							throw e;
						} else {
							// PERMANENT: skip this listing, continue
							this.logger.warn(`[${displayName}] Skipping listing (permanent error).`);
							break;
						}
					}
				}
			}

			// Clear checkpoint after full completion
			try {
				DataService.setAppConfig(`checkpoint_${account.id}_${this.runMode}`, "0");
			} catch (_e) {
				this.logger.warn(`Gagal clear checkpoint: ${_e.message}`);
			}
		} catch (err) {
			if (err.message !== "ACCOUNT_LIMIT_REACHED" && err.message !== "BROWSER_CLOSED") {
				this.logger.error(`[${displayName}] Kesalahan:`, err);
			}
		} finally {
			this.activeBots.delete(bot);
			await bot.close();
		}
	}

	async _processListing(bot, account, listing, count, total) {
		const displayName = account.fbName || account.name;
		this.logger.info(
			`[${displayName}] [${count}/${total}] Memproses: ${listing.title} (autoFeed=${listing.autoFeed}, targetGroup=${listing.targetGroup || "TIDAK ADA"})`,
		);
		DataService.updateListingStatus(listing.id, "posting");

		// Select up to 2 photos with the least usage
		const originalPhotos = listing.photos || [];
		const photoUsage = listing.photoUsage || {};
		
		let selectedPhotos = originalPhotos;
		if (originalPhotos.length > 0) {
			const sortedPhotos = [...originalPhotos].sort((a, b) => {
				return (photoUsage[a] || 0) - (photoUsage[b] || 0);
			});
			selectedPhotos = sortedPhotos.slice(0, 2);
		}

		// Temporarily override listing.photos with the selected photos for this posting cycle
		listing.photos = selectedPhotos;
		listing.selectedPhotos = selectedPhotos;

		try {
			// Phase 1: Feed posting and sharing
			const isRestricted = await this._phase1FeedAndShare(
				bot,
				account,
				listing,
			);

			if (isRestricted) {
				DataService.updateListingStatus(listing.id, "failed");
				throw new Error("ACCOUNT_LIMIT_REACHED");
			}

			// Phase 2: Marketplace posting
			const marketplaceSuccess = await this._phase2Marketplace(bot, account, listing);

			if (marketplaceSuccess && listing.selectedPhotos && listing.selectedPhotos.length > 0) {
				listing.selectedPhotos.forEach(p => {
					photoUsage[p] = (photoUsage[p] || 0) + 1;
				});
				listing.photoUsage = photoUsage;
				// Update full original array back so we don't accidentally save only 2 photos to DB
				const updatedListingData = { ...listing, photos: originalPhotos };
				DataService.updateListingById(listing.id, updatedListingData);
				this.logger.info(`[${displayName}] Updated photo usage count for ${listing.selectedPhotos.length} photos.`);
			}

			// Phase 3: Comment attack (comment listing on target post URL)
			if (this.runMode === "all" || this.runMode === "comment") {
				if (listing.autoFeed && this.commentTargetUrl) {
					this.logger.info(`[${displayName}] Memulai Comment Attack ke post: ${this.commentTargetUrl}`);
					await bot.commentOnPost(this.commentTargetUrl, listing);
				} else if (!listing.autoFeed) {
					this.logger.info(`[${displayName}] Comment Attack dilewati: viral share (autoFeed) tidak aktif untuk listing ini`);
				} else {
					this.logger.warn(`[${displayName}] Comment Attack dilewati: commentTargetUrl kosong (tidak diberikan)`);
				}
			}

			DataService.updateListingStatus(listing.id, "success");
		} catch (error) {
			this._handleListingError(account, listing, error);
		}

		if (process.env.NODE_ENV !== "test") {
			const delayMs = 2000 + Math.random() * 3000;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	async _phase1FeedAndShare(bot, account, listing) {
		const displayName = account.fbName || account.name;
		let shareUrl = listing.existingPostUrl;
		let accountRestricted = false;

		if (
			listing.autoFeed &&
			(this.runMode === "all" || this.runMode === "viral")
		) {
			this.logger.method("TRY", "orchestrator.phase.feedAndShare", `listing=${listing.id}`);
			let postSuccess = false;
			let isNewPost = false;

			if (shareUrl) {
				this.logger.method("SUCCESS", "orchestrator.feedUrl.existingDb", `url=${shareUrl}`);
				this.logger.info(
					`[${displayName}] Menggunakan URL postingan yang sudah ada dari database: ${shareUrl}`,
				);
				postSuccess = true;
			} else {
				if (!RateLimiter.canAct(account.id, "post")) {
					this.logger.warn(`[${displayName}] Budget harian 'post' habis. Skip feed post.`);
					return false;
				}
				this.logger.method("TRY", "orchestrator.feedUrl.newFeedPost", `listing=${listing.id}`);
				const postResult = await this._postToFeed(bot, account, listing);
				shareUrl = postResult.url;
				postSuccess = postResult.success;
				if (postSuccess) {
					isNewPost = true;
					RateLimiter.recordAction(account.id, "post");
				}

				if (shareUrl) {
					this.logger.method("SUCCESS", "orchestrator.feedUrl.newFeedPost", `url=${shareUrl}`);
					listing.existingPostUrl = shareUrl;
					// Update DB secara paralel tanpa memblokir proses selanjutnya
					DataService.updateListingById(listing.id, listing)
						.then(() => {
							this.logger.success(
								`[${displayName}] Berhasil menyimpan link post baru ke DB: ${shareUrl}`,
							);
							// Emit flag agar frontend Listings.jsx tahu harus refresh UI paralel
							this.logger.info(`[SYSTEM] [REFRESH_UI] Data link berhasil disimpan`);
						})
						.catch((err) => {
							this.logger.error("Gagal menyimpan link ke DB", err);
						});
				}
				if (!postSuccess) {
					this.logger.method("FAIL", "orchestrator.feedUrl.newFeedPost", "postSuccess=false");
				} else if (!shareUrl) {
					this.logger.method("SKIP", "orchestrator.feedUrl.newFeedPost", "post sukses tapi URL tidak didapat");
				}
			}

			const shouldShare =
				(shareUrl || (listing.autoFeed && postSuccess)) && listing.targetGroup;

			if (shouldShare) {
				if (!RateLimiter.canAct(account.id, "share")) {
					this.logger.warn(`[${displayName}] Budget harian 'share' habis. Skip viral share.`);
				} else {
					this.logger.method(
						"TRY",
						"orchestrator.phase.shareToGroups",
						shareUrl ? "method=persisted-url" : "method=current-page-post",
					);
					accountRestricted = await this._shareToGroups(
						bot,
						account,
						listing,
						isNewPost ? null : shareUrl,
					);
					if (!accountRestricted) {
						RateLimiter.recordAction(account.id, "share");
						this.logger.method("SUCCESS", "orchestrator.phase.shareToGroups");
					}
				}
			} else if (!shareUrl && listing.autoFeed && !postSuccess) {
				this.logger.method("FAIL", "orchestrator.phase.shareToGroups", "feed post gagal dan URL kosong");
				this.logger.warn(
					`[${displayName}] Melewati viral share karena postUrl tidak ditemukan dan posting gagal.`,
				);
			} else {
				this.logger.method("SKIP", "orchestrator.phase.shareToGroups", "targetGroup kosong");
			}
			this.logger.method(
				accountRestricted ? "FAIL" : "SUCCESS",
				"orchestrator.phase.feedAndShare",
				accountRestricted ? "accountRestricted=true" : `listing=${listing.id}`,
			);
		}

		return accountRestricted;
	}

	async _postToFeed(bot, account, listing) {
		const displayName = account.fbName || account.name;
		this.logger.info(`[${displayName}] Memulai posting baru ke Feed...`);
		try {
			const feedContent = {
				text: listing.description || "",
				photos: listing.photos || [],
			};
			const feedResult = await bot.postToFeed(feedContent);

			if (feedResult.success) {
				DataService.recordAutomationEvent({
					actionType: "feed_post",
					runId: this.runId,
					mode: this.runMode,
					accountId: account.id,
					listingId: listing.id,
					result: "success",
					message: `Post Feed berhasil dibuat: ${listing.title}`,
					metadata: { postUrl: feedResult.postUrl || null },
				});
				if (feedResult.postUrl) {
					this.logger.success(
						`[${displayName}] Berhasil posting ke Feed. Link: ${feedResult.postUrl}`,
					);
				} else {
					this.logger.info(
						`[${displayName}] Post Feed baru berhasil. Menggunakan postingan di halaman saat ini.`,
					);
				}
				return { success: true, url: feedResult.postUrl };
			}
		} catch (feedError) {
			this.logger.error(
				`[${displayName}] Gagal posting ke Feed`,
				feedError,
			);
		}
		DataService.recordAutomationEvent({
			actionType: "feed_post",
			runId: this.runId,
			mode: this.runMode,
			accountId: account.id,
			listingId: listing.id,
			result: "failed",
			message: `Post Feed gagal: ${listing.title}`,
		});
		return { success: false, url: null };
	}

	async _shareToGroups(bot, account, listing, shareUrl) {
		const displayName = account.fbName || account.name;
		this.logger.info(
			`[${displayName}] Memulai proses share ke grup dengan kata kunci: ${listing.targetGroup}`,
		);
		try {
			const shareResults = await bot.sharePostToGroups(
				shareUrl,
				listing.targetGroup,
				listing.maxGroups || 20,
				listing.description || ""
			);
			for (const result of Array.isArray(shareResults) ? shareResults : []) {
				if (result.status !== "shared" && result.status !== "failed" && result.status !== "accountRestricted") continue;
				DataService.recordAutomationEvent({
					actionType: "group_share",
					runId: this.runId,
					mode: this.runMode,
					accountId: account.id,
					listingId: listing.id,
					result: result.status === "shared" ? "success" : "failed",
					message: result.status === "shared"
						? `Berhasil share ke grup ${result.group || ""}`.trim()
						: result.error || `Share grup gagal (${result.status})`,
					metadata: { group: result.group || null },
				});
			}

			if (
				Array.isArray(shareResults) &&
				shareResults.some((r) => r.status === "accountRestricted")
			) {
				const restriction = shareResults.find(
					(r) => r.status === "accountRestricted",
				).error;
				this.logger.warn(
					`[${displayName}] AKUN TERBATAS: "${restriction}". Menghentikan proses untuk akun ini.`,
				);
				return true;
			} else {
				const successCount = Array.isArray(shareResults)
					? shareResults.filter((r) => r.status === "shared").length
					: 0;
				this.logger.success(
					`[${displayName}] Selesai viral share. Berhasil ke ${successCount} grup.`,
				);
			}
		} catch (shareError) {
			DataService.recordAutomationEvent({
				actionType: "group_share",
				runId: this.runId,
				mode: this.runMode,
				accountId: account.id,
				listingId: listing.id,
				result: "failed",
				message: shareError.message,
			});
			this.logger.error(
				`[${displayName}] Gagal viral share`,
				shareError,
			);
		}
		return false;
	}

	async _phase2Marketplace(bot, account, listing) {
		const displayName = account.fbName || account.name;
		if (
			listing.postMarketplace !== false &&
			(this.runMode === "all" || this.runMode === "marketplace")
		) {
			if (!RateLimiter.canAct(account.id, "post")) {
				this.logger.warn(`[${displayName}] Budget harian 'post' habis. Skip marketplace.`);
				return false;
			}
			const isVehicleAliases = [
				"Jenis Kendaraan",
				"Jenis kendaraan",
				"Kendaraan",
				"Vehicles",
			];
			const isVehicle = isVehicleAliases.some(
				(alias) =>
					listing.category?.toLowerCase() === alias.toLowerCase() ||
					listing.attributes?.[alias],
			);

			const isRentAliases = [
				"Sewa",
				"Properti Sewa",
				"Property for Rent",
				"Disewakan",
				"Rental",
			];
			const isRent = isRentAliases.some(
				(alias) =>
					listing.category?.toLowerCase() === alias.toLowerCase() ||
					listing.attributes?.[alias],
			);

			let createUrl = "https://www.facebook.com/marketplace/create/item";
			if (isVehicle) {
				createUrl = "https://www.facebook.com/marketplace/create/vehicle";
			} else if (isRent) {
				createUrl = "https://www.facebook.com/marketplace/create/rental";
			}

			this.logger.info(`[${displayName}] Menuju Marketplace: ${createUrl}`);
			this.logger.method("TRY", "orchestrator.phase.marketplace", `createUrl=${createUrl}`);
			await bot.page.bringToFront();
			await bot.page.goto(createUrl, {
				waitUntil: "domcontentloaded",
				timeout: 60000,
			});

			const result = await bot.postListing({
				...listing,
				targetGroups: listing.targetGroup,
				maxGroups: Math.min(listing.maxGroups || 20, 20),
			});

			if (result?.success) {
				RateLimiter.recordAction(account.id, "post");
				DataService.recordAutomationEvent({
					actionType: "marketplace_post",
					runId: this.runId,
					mode: this.runMode,
					accountId: account.id,
					listingId: listing.id,
					result: "success",
					message: `Berhasil posting Marketplace: ${listing.title}`,
				});
				this.logger.method("SUCCESS", "orchestrator.phase.marketplace", `listing=${listing.id}`);
				this.logger.success(
					`[${displayName}] Berhasil posting Marketplace: ${listing.title}`,
				);
				return true;
			}
			DataService.recordAutomationEvent({
				actionType: "marketplace_post",
				runId: this.runId,
				mode: this.runMode,
				accountId: account.id,
				listingId: listing.id,
				result: "failed",
				message: `Marketplace tidak mengonfirmasi posting: ${listing.title}`,
			});
		} else {
			this.logger.method("SKIP", "orchestrator.phase.marketplace", `runMode=${this.runMode};postMarketplace=${listing.postMarketplace}`);
		}
		return false;
	}

	_handleListingError(account, listing, error) {
		const displayName = account.fbName || account.name;
		const classification = this._classifyError(error);
		DataService.recordAutomationEvent({
			actionType: "listing_error",
			runId: this.runId,
			mode: this.runMode,
			accountId: account.id,
			listingId: listing.id,
			result: "failed",
			message: `${listing.title}: ${error.message || "Kesalahan automasi"}`,
			metadata: { classification },
		});

		if (classification === "FATAL" || error.message === "ACCOUNT_LIMIT_REACHED") {
			this.logger.warn(
				`[${displayName}] STOP: AKUN INI MENCAPAI BATAS FACEBOOK.`,
			);
			DataService.updateListingStatus(listing.id, "failed");
			throw new Error("ACCOUNT_LIMIT_REACHED");
		} else {
			const isBrowserClosed = error.message.includes("Target page, context or browser has been closed");
			const cleanMsg = isBrowserClosed ? "Browser tertutup" : error.message.split("\n")[0];
			this.logger.error(
				`[${displayName}] Gagal: ${listing.title} (${cleanMsg}) [${classification}]`,
			);
			DataService.updateListingStatus(listing.id, "failed");

			if (isBrowserClosed || classification === "TRANSIENT") {
				throw new Error("BROWSER_CLOSED");
			}
		}
	}

	/**
	 * Classify errors into categories for recovery decisions.
	 * - TRANSIENT: retry after browser relaunch (browser crash, timeout, network)
	 * - PERMANENT: skip this listing, continue (validation, element not found)
	 * - FATAL: stop processing this account (rate limit, account restricted)
	 */
	_classifyError(error) {
		const msg = (error.message || "").toLowerCase();

		// FATAL: account-level issues
		const fatalPatterns = [
			"account_limit_reached",
			"account restricted",
			"akun terbatas",
			"temporarily blocked",
			"spam",
		];
		if (fatalPatterns.some(p => msg.includes(p))) return "FATAL";

		// TRANSIENT: infrastructure issues (retryable)
		const transientPatterns = [
			"browser_closed",
			"target page, context or browser has been closed",
			"net::",
			"timeout",
			"navigation failed",
			"execution context was destroyed",
			"frame was detached",
			"protocol error",
		];
		if (transientPatterns.some(p => msg.includes(p))) return "TRANSIENT";

		// Default: PERMANENT (skip this listing)
		return "PERMANENT";
	}

	async _getPooledBot(pool, account) {
		const key = String(account.id);
		let bot = pool.get(key);
		if (bot && bot.page && !bot.page.isClosed?.()) return bot;
		if (bot) {
			try {
				await bot.close();
			} catch (_e) {}
			this.activeBots.delete(bot);
			pool.delete(key);
		}
		const displayName = account.fbName || account.name;
		bot = new FacebookBot({
			accountName: displayName,
			userDataDir: path.isAbsolute(account.profile)
				? account.profile
				: path.join(process.cwd(), account.profile),
		});
		this.activeBots.add(bot);
		await bot.init();
		pool.set(key, bot);
		return bot;
	}

	async _closePool(pool) {
		for (const bot of pool.values()) {
			try {
				this.activeBots.delete(bot);
				await bot.close();
			} catch (_e) {}
		}
		pool.clear();
	}

	async _syncChatThreadList(bot, account) {
		try {
			const url = bot.page.url();
			if (!url.includes("/marketplace/inbox")) {
				await bot.page.goto("https://www.facebook.com/marketplace/inbox", { waitUntil: "domcontentloaded", timeout: 30000 });
				await new Promise((r) => setTimeout(r, 3000));
			}
			const rows = await bot.page.evaluate(() => {
				const out = [];
				for (const el of Array.from(document.querySelectorAll('div[role="button"], a[role="link"]'))) {
					const t = (el.innerText || "").trim();
					if (!t || t.length < 10 || t.length > 300 || !/·/.test(t)) continue;
					if (/pesan belum dibaca|dalam \d+\s*km|telusuri|notifikasi|pengaturan/i.test(t)) continue;
					const lines = t.split("\n").map((l) => l.trim()).filter((l) => l && l !== "·");
					const buyer = (lines[0] || "").slice(0, 80);
					if (!buyer || buyer.length > 40 || /[:\d]{4,}/.test(buyer)) continue;
					const topicLine = lines.find((l) => /·/.test(l)) || "";
					const topic = topicLine.replace(/^·\s*/, "").slice(0, 80);
					if (!/(19|20)\d{2}\s+[A-Za-z]/.test(topic)) continue;
					const line = t.slice(0, 150);
					if (out.some((o) => o.line === line)) continue;
					out.push({ buyer, topic, line });
					if (out.length >= 15) break;
				}
				return out;
			}).catch(() => []);
			for (const r of rows) {
				try {
					DataService.upsertThread({ accountId: account.id, buyer: r.buyer, topic: r.topic, lastMessage: r.line });
				} catch (_e) {}
			}
		} catch (_e) {}
	}

	async _runChatMode(linkedAccounts) {
		const pool = new Map();
		try {
			let cycles = 0;
			while (!this.stopped) {
				for (const account of linkedAccounts) {
					if (this.stopped) break;
					const displayName = account.fbName || account.name;
					try {
						const bot = await this._getPooledBot(pool, account);
						this.logger.info(`[${displayName}] Memeriksa inbox...`);
						await this._syncChatThreadList(bot, account); // daftar ikut segar tiap siklus
						await bot.replyToChats({ pin: account.e2ee_pin });
						// Follow-up sunyi 2 hari, maks 2 per thread
						try {
							const cands = DataService.getFollowupCandidates(account.id, 2, 2);
							if (cands.length > 0) {
								this.logger.info(`[${displayName}] Follow-up ${cands.length} thread sunyi...`);
								const results = await bot.followUpThreads(account, cands, { pin: account.e2ee_pin });
								for (const r of results) {
									if (r.status !== "replied" || !r.key) continue;
									try {
										DataService.bumpFollowup(r.key);
									} catch (_e) {}
									try {
										DataService.recordAutomationEvent({
											actionType: "chat_followup",
											runId: this.runId,
											mode: "chat",
											accountId: account.id,
											result: "success",
											message: `Follow-up ${r.buyer}: ${(r.reply || "").slice(0, 120)}`,
										});
									} catch (_e) {}
								}
							}
						} catch (e) {
							this.logger.warn(`Follow-up skip ${displayName}: ${e.message}`);
						}
					} catch (e) {
						this.logger.error(`Error saat cek chat akun ${displayName}:`, e);
						pool.delete(String(account.id));
					}
				}
				if (this.stopped) break;
				cycles++;
				if (this.chatCycles > 0 && cycles >= this.chatCycles) {
					this.logger.info(`Chat stop: batas ${this.chatCycles} siklus tercapai.`);
					break;
				}
				this.logger.info(`Semua akun selesai diperiksa. Ulang dalam ${Math.round(this.chatIntervalMs / 1000)} detik...`);
				await this._sleepInterruptible(this.chatIntervalMs);
			}
		} finally {
			await this._closePool(pool);
		}
	}

	async _runViralMode(activeListings, linkedAccounts) {
		let startIndex = 0;
		try {
			const cfg = DataService.getAppConfig();
			if (cfg[`checkpoint_viral`]) {
				startIndex = parseInt(cfg[`checkpoint_viral`], 10) || 0;
				if (startIndex >= activeListings.length) startIndex = 0;
			}
		} catch (e) {
			this.logger.warn(`Gagal baca checkpoint viral: ${e.message}`);
		}

		const pool = new Map();
		try {

		for (let i = startIndex; i < activeListings.length; i++) {
			if (this.stopped) break;
			const listing = activeListings[i];
			this.logger.info(`=== [VIRAL SHARE] [${i+1}/${activeListings.length}] Listing: ${listing.title} ===`);
			DataService.updateListingStatus(listing.id, "posting");
			
			let masterPostUrl = listing.existingPostUrl;
			
			// 1. Generate Master Post if it doesn't exist
			if (!masterPostUrl) {
				const randomIndex = Math.floor(Math.random() * linkedAccounts.length);
				const masterAccount = linkedAccounts[randomIndex];
				this.logger.info(`Master URL belum ada. Akun [${masterAccount.fbName || masterAccount.name}] dipilih secara ACAK (random) sebagai Master Poster.`);
				
				try {
					const bot = await this._getPooledBot(pool, masterAccount);
					
					const originalPhotos = listing.photos || [];
					const photoUsage = listing.photoUsage || {};
					let selectedPhotos = originalPhotos;
					if (originalPhotos.length > 0) {
						selectedPhotos = [...originalPhotos].sort((a, b) => (photoUsage[a] || 0) - (photoUsage[b] || 0)).slice(0, 2);
					}
					listing.photos = selectedPhotos;
					listing.selectedPhotos = selectedPhotos;

					const postResult = await this._postToFeed(bot, masterAccount, listing);
					if (postResult && postResult.success && postResult.url) {
						masterPostUrl = postResult.url;
						listing.existingPostUrl = masterPostUrl;
						
						if (listing.selectedPhotos && listing.selectedPhotos.length > 0) {
							listing.selectedPhotos.forEach(p => { photoUsage[p] = (photoUsage[p] || 0) + 1; });
							listing.photoUsage = photoUsage;
						}
						await DataService.updateListingById(listing.id, { ...listing, photos: originalPhotos });
						this.logger.success(`Master Post berhasil dibuat: ${masterPostUrl}`);
					} else {
						this.logger.warn("Gagal membuat Master Post atau URL tidak didapat.");
					}
				} catch (e) {
					this.logger.error("Error pembuatan Master Post:", e);
					pool.delete(String(masterAccount.id));
				}
			} else {
				this.logger.info(`Menggunakan Master Post dari database: ${masterPostUrl}`);
			}
			
			if (!masterPostUrl) {
				this.logger.warn(`Skip mass-share untuk ${listing.title} karena Master Post tidak ada.`);
				DataService.updateListingStatus(listing.id, "failed");
				DataService.recordAutomationEvent({
					actionType: "listing_error",
					runId: this.runId,
					mode: "viral",
					listingId: listing.id,
					result: "failed",
					message: `Tidak ada post sumber untuk share: ${listing.title}`,
				});
				continue;
			}

			// 2. Mass Share using all accounts
			for (const account of linkedAccounts) {
				if (this.stopped) break;
				if (!RateLimiter.canAct(account.id, "share")) {
					this.logger.warn(`Akun [${account.fbName || account.name}] kehabisan budget 'share'. Skip.`);
					continue;
				}

				try {
					const bot = await this._getPooledBot(pool, account);
					const isRestricted = await this._shareToGroups(bot, account, listing, masterPostUrl);
					if (isRestricted) {
						this.logger.warn(`Akun [${account.fbName || account.name}] terkena limit. Stop share untuk akun ini.`);
					} else {
					    RateLimiter.recordAction(account.id, "share");
					}
				} catch (e) {
					this.logger.error(`Error mass-share di akun [${account.fbName || account.name}]:`, e);
					pool.delete(String(account.id));
				}
			}
			
			DataService.updateListingStatus(listing.id, "success");
			
			// Checkpoint
			try {
				DataService.setAppConfig(`checkpoint_viral`, String(i + 1));
			} catch (e) {}
		}
		} finally {
			await this._closePool(pool);
		}
		
		try {
			DataService.setAppConfig(`checkpoint_viral`, "0");
		} catch (e) {}
	}
}

module.exports = BotOrchestrator;
