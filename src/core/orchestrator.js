const FacebookBot = require("./bot");
const DataService = require("../web/services/dataService");
const RateLimiter = require("../services/rateLimiter");
const Logger = require("../utils/logger");
const path = require("node:path");

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
	}

	/**
	 * Run the main orchestrator loop based on current runMode.
	 * Discovers target accounts and active listings, then processes them sequentially.
	 *
	 * @returns {Promise<void>}
	 */
	async run() {
		try {
			this.logger.info("Mencari listing aktif dan akun...");

			const activeListings = await this._getActiveListings();
			const linkedAccounts = await this._getLinkedAccounts();

			this.logger.info(`Orchestrator: filter accountId = ${this.accountId || 'tidak ada'}. Akun terhubung ditemukan = ${linkedAccounts.map(a => `${a.fbName || a.name} (${a.id})`).join(', ')}`);

			if (this.runMode !== "chat" && activeListings.length === 0) {
				this.logger.warn("Tidak ada listing aktif untuk diposting.");
				return;
			}

			if (linkedAccounts.length === 0) {
				this.logger.error(
					"Tidak ada akun Facebook yang tertaut (linked). Mohon login dulu di Dashboard.",
				);
				return;
			}

			this.logger.info(
				`Ditemukan ${activeListings.length} listing aktif dan ${linkedAccounts.length} akun terhubung.`,
			);

			if (this.runMode === "chat") {
				this.logger.info("Memulai loop Balas Chat berkelanjutan...");
				while (true) {
					for (const account of linkedAccounts) {
						await this._processAccount(account, activeListings);
					}
					this.logger.info("Semua akun selesai diperiksa. Mengulang antrean dalam 5 detik...");
					await new Promise(resolve => setTimeout(resolve, 5000));
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
			this.logger.error("Kesalahan fatal:", err);
		} finally {
			try {
				await DataService.resetHangingListings();
			} catch (_e) {
				this.logger.warn(`Gagal reset hanging listings: ${_e.message}`);
			}
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

		try {
			await bot.init();

			if (this.runMode === "chat") {
				this.logger.info(`[${displayName}] Memeriksa inbox...`);
				try {
					await bot.replyToChats({ pin: account.e2ee_pin });
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
				this.logger.method("SUCCESS", "orchestrator.phase.marketplace", `listing=${listing.id}`);
				this.logger.success(
					`[${displayName}] Berhasil posting Marketplace: ${listing.title}`,
				);
				return true;
			}
		} else {
			this.logger.method("SKIP", "orchestrator.phase.marketplace", `runMode=${this.runMode};postMarketplace=${listing.postMarketplace}`);
		}
		return false;
	}

	_handleListingError(account, listing, error) {
		const displayName = account.fbName || account.name;
		const classification = this._classifyError(error);

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

		for (let i = startIndex; i < activeListings.length; i++) {
			const listing = activeListings[i];
			this.logger.info(`=== [VIRAL SHARE] [${i+1}/${activeListings.length}] Listing: ${listing.title} ===`);
			DataService.updateListingStatus(listing.id, "posting");
			
			let masterPostUrl = listing.existingPostUrl;
			
			// 1. Generate Master Post if it doesn't exist
			if (!masterPostUrl) {
				const randomIndex = Math.floor(Math.random() * linkedAccounts.length);
				const masterAccount = linkedAccounts[randomIndex];
				this.logger.info(`Master URL belum ada. Akun [${masterAccount.fbName || masterAccount.name}] dipilih secara ACAK (random) sebagai Master Poster.`);
				
				const bot = new FacebookBot({
					accountName: masterAccount.fbName || masterAccount.name,
					userDataDir: path.isAbsolute(masterAccount.profile) ? masterAccount.profile : path.join(process.cwd(), masterAccount.profile)
				});
				
				try {
					await bot.init();
					
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
				} finally {
					await bot.close();
				}
			} else {
				this.logger.info(`Menggunakan Master Post dari database: ${masterPostUrl}`);
			}
			
			if (!masterPostUrl) {
				this.logger.warn(`Skip mass-share untuk ${listing.title} karena Master Post tidak ada.`);
				DataService.updateListingStatus(listing.id, "failed");
				continue;
			}

			// 2. Mass Share using all accounts
			for (const account of linkedAccounts) {
				if (!RateLimiter.canAct(account.id, "share")) {
					this.logger.warn(`Akun [${account.fbName || account.name}] kehabisan budget 'share'. Skip.`);
					continue;
				}

				const bot = new FacebookBot({
					accountName: account.fbName || account.name,
					userDataDir: path.isAbsolute(account.profile) ? account.profile : path.join(process.cwd(), account.profile)
				});

				try {
					await bot.init();
					const isRestricted = await this._shareToGroups(bot, account, listing, masterPostUrl);
					if (isRestricted) {
						this.logger.warn(`Akun [${account.fbName || account.name}] terkena limit. Stop share untuk akun ini.`);
					} else {
					    RateLimiter.recordAction(account.id, "share");
					}
				} catch (e) {
					this.logger.error(`Error mass-share di akun [${account.fbName || account.name}]:`, e);
				} finally {
					await bot.close();
				}
			}
			
			DataService.updateListingStatus(listing.id, "success");
			
			// Checkpoint
			try {
				DataService.setAppConfig(`checkpoint_viral`, String(i + 1));
			} catch (e) {}
		}
		
		try {
			DataService.setAppConfig(`checkpoint_viral`, "0");
		} catch (e) {}
	}
}

module.exports = BotOrchestrator;
