const express = require("express");
const router = express.Router();
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const path = require("node:path");
const crypto = require("node:crypto");
const fsPromises = require("node:fs/promises");
const fs = require("fs-extra");
const { IMAGE_MIME_EXTENSIONS, isValidImageBuffer } = require("../../utils/imageTypes");

const AccountController = require("../controllers/AccountController");
const ListingController = require("../controllers/ListingController");
const SettingsController = require("../controllers/SettingsController");
const AutomationController = require("../controllers/AutomationController");
const AgentController = require("../controllers/AgentController");
const LogController = require("../controllers/LogController");
const HealthController = require("../controllers/HealthController");
const GroupController = require("../controllers/GroupController");
const ScheduleController = require("../controllers/ScheduleController");
const AnalyticsController = require("../controllers/AnalyticsController");
const ChatController = require("../controllers/ChatController");
const CatalogController = require("../controllers/CatalogController");

const ASSETS_DIR = path.join(__dirname, "../../../assets");
fs.ensureDirSync(ASSETS_DIR);

const storage = multer.diskStorage({
	destination: (_req, _file, cb) => cb(null, ASSETS_DIR),
	filename: (_req, file, cb) => {
		cb(null, `${crypto.randomUUID()}${IMAGE_MIME_EXTENSIONS[file.mimetype]}`);
	},
});
const upload = multer({
	storage,
	limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 10, fieldSize: 64 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (IMAGE_MIME_EXTENSIONS[file.mimetype]) {
			cb(null, true);
		} else {
			cb(new Error("Tipe file tidak didukung. Gunakan JPEG, PNG, GIF, atau WebP."));
		}
	},
});

function receiveImages(req, res, next) {
	upload.array("photos", 10)(req, res, (error) => {
		if (!error) return next();
		const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
		return res.status(status).json({ error: status === 413 ? "Ukuran setiap foto maksimal 10 MB." : error.message });
	});
}

async function validateImageSignatures(req, res, next) {
	const files = req.files || [];
	try {
		for (const file of files) {
			const handle = await fsPromises.open(file.path, "r");
			let buffer;
			try {
				buffer = Buffer.alloc(12);
				const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
				buffer = buffer.subarray(0, bytesRead);
			} finally {
				await handle.close();
			}
			if (!isValidImageBuffer(buffer, file.mimetype)) {
				await Promise.all(files.map((item) => fsPromises.unlink(item.path).catch(() => {})));
				return res.status(400).json({ error: "Isi file tidak cocok dengan format gambar." });
			}
		}
		return next();
	} catch (_error) {
		await Promise.all(files.map((item) => fsPromises.unlink(item.path).catch(() => {})));
		return res.status(400).json({ error: "Gagal memvalidasi file gambar." });
	}
}

const logStreamLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 30,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Terlalu banyak koneksi log. Coba lagi sebentar." },
});

router.get("/accounts", AccountController.getAccounts);
router.put("/accounts/:id", AccountController.updateAccountById);
router.post("/accounts", AccountController.createAccount);
router.post("/accounts/:id/toggle", AccountController.toggleAccount);
router.post("/accounts/:id/link", AccountController.loginAccount);
router.post("/accounts/:id/logout", AccountController.logoutAccount);
router.delete("/accounts/:id", AccountController.deleteAccountById);
router.get("/listings", ListingController.getListings);
router.get("/listings/photo-health", ListingController.getPhotoHealth);
router.post("/listings/reset-failed", ListingController.resetFailedListings);
router.delete("/photos", ListingController.deletePhoto);
router.post("/listings", ListingController.createListing);
router.post("/listings/generate-tags", ListingController.generateTags);
router.post("/listings/generate-fields", ListingController.generateFields);
router.post("/listings/bulk-active", ListingController.bulkUpdateListingsActive);
router.post("/listings/bulk-feed", ListingController.bulkUpdateListingsFeed);
router.post("/listings/bulk-update", ListingController.bulkUpdateListings);
router.post("/listings/bulk-delete", ListingController.bulkDeleteListings);
router.post("/listings/trash", ListingController.trashListings);
router.post("/listings/restore", ListingController.restoreTrash);
router.get("/listings/trash", ListingController.listTrash);
router.post("/listings/trash/delete", ListingController.deleteTrashPermanent);
router.get("/photos/orphans", ListingController.listOrphans);
router.post("/photos/clean", ListingController.cleanOrphans);
router.post("/listings/clear-urls", ListingController.clearAllListingsUrls);
router.post("/listings/clone-to-appliance", ListingController.cloneToAppliance);
router.put("/listings/:id", ListingController.updateListingById);
router.delete("/listings/:id", ListingController.deleteListingById);
router.get("/config", SettingsController.getConfig);
router.post("/config", SettingsController.setConfig);
router.post("/upload", receiveImages, validateImageSignatures, ListingController.uploadImages);

router.post("/run-automation", AutomationController.runAutomation);
router.post("/stop-automation", AutomationController.stopAutomation);
router.get("/automation-status", AutomationController.getAutomationStatus);
router.post("/run-sundul", AutomationController.runSundul);
router.get("/stream-logs", logStreamLimiter, LogController.streamLogs);
router.post("/scrape", AutomationController.runScraper);

// AI Agent
router.post("/run-agent", AgentController.runAgent);
router.post("/stop-agent", AgentController.stopAgent);
router.get("/agent/stats", AgentController.getAgentStats);
router.get("/agent/interactions", AgentController.getAgentInteractions);
router.get("/agent/memories", AgentController.getAgentMemories);

// AI Intelligence
router.post("/listings/suggest-price", ListingController.suggestPrice);
router.post("/listings/detect-duplicates", ListingController.detectDuplicates);

// Persistent Logs
router.get("/logs", LogController.getLogs);
router.delete("/logs", LogController.clearLogs);
router.get("/logs/stats", LogController.getLogStats);

// Health
router.get("/health", HealthController.getHealth);
router.get("/health/action-budget", HealthController.getActionBudget);

// Groups
router.get("/groups", GroupController.getGroups);
router.post("/groups", GroupController.addGroup);
router.put("/groups/:id", GroupController.updateGroup);
router.delete("/groups/:id", GroupController.deleteGroup);
router.post("/groups/:id/toggle", GroupController.toggleGroup);
router.post("/groups/:id/activate-exclusive", GroupController.activateGroupExclusive);
router.post("/groups/:id/listings", GroupController.addListingToGroup);
router.delete("/groups/:id/listings/:listingId", GroupController.removeListingFromGroup);

// Schedules
router.get("/schedules", ScheduleController.getSchedules);
router.post("/schedules", ScheduleController.addSchedule);
router.put("/schedules/:id", ScheduleController.updateSchedule);
router.delete("/schedules/:id", ScheduleController.deleteSchedule);

// Notifications
router.get("/notifications", LogController.getNotifications);
router.get("/notifications/unread-count", LogController.getUnreadCount);
router.post("/notifications/:id/read", LogController.markNotificationRead);
router.post("/notifications/read-all", LogController.markAllNotificationsRead);
router.delete("/notifications", LogController.clearNotifications);

// Analytics & Reports
router.get("/analytics/activity", AnalyticsController.getAnalyticsActivity);
router.get("/analytics/listing-stats", AnalyticsController.getListingStats);
router.get("/reports/daily", AnalyticsController.getDailyReports);
router.get("/reports/daily/:date", AnalyticsController.getDailyReportDetails);
router.post("/reports/generate", AnalyticsController.generateReport);

// Katalog publik (etalase, field aman saja)
router.get("/catalog", CatalogController.getCatalog);

// Chat inbox
router.get("/chat/threads", ChatController.listThreads);
router.get("/chat/threads/:key/messages", ChatController.getThreadMessages);
router.post("/chat/sync", ChatController.syncInbox);
router.post("/chat/followup", ChatController.runFollowup);
router.post("/chat/threads/:key/read", ChatController.readThread);
router.post("/chat/send", ChatController.sendMessage);
router.post("/chat/drafts/approve", ChatController.approveDraft);

// Notification stream
router.get("/notifications/stream", LogController.streamNotifications);

module.exports = router;
