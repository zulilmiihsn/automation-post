const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("node:path");
const fs = require("fs-extra");

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

const ASSETS_DIR = path.join(__dirname, "../../../assets");
fs.ensureDirSync(ASSETS_DIR);

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const storage = multer.diskStorage({
	destination: (_req, _file, cb) => cb(null, ASSETS_DIR),
	filename: (_req, file, cb) => {
		const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		cb(null, uniqueSuffix + path.extname(file.originalname));
	},
});
const upload = multer({
	storage,
	limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
	fileFilter: (_req, file, cb) => {
		if (ALLOWED_MIMES.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(
				new Error(
					`Tipe file tidak didukung: ${file.mimetype}. Hanya JPEG, PNG, GIF, WebP.`,
				),
			);
		}
	},
});

router.get("/accounts", AccountController.getAccounts);
router.put("/accounts/:id", AccountController.updateAccountById);
router.post("/accounts", AccountController.createAccount);
router.post("/accounts/:id/toggle", AccountController.toggleAccount);
router.post("/accounts/:id/link", AccountController.loginAccount);
router.post("/accounts/:id/logout", AccountController.logoutAccount);
router.delete("/accounts/:id", AccountController.deleteAccountById);
router.get("/listings", ListingController.getListings);
router.post("/listings", ListingController.createListing);
router.post("/listings/generate-tags", ListingController.generateTags);
router.post("/listings/generate-fields", ListingController.generateFields);
router.post("/listings/bulk-active", ListingController.bulkUpdateListingsActive);
router.post("/listings/bulk-feed", ListingController.bulkUpdateListingsFeed);
router.post("/listings/bulk-update", ListingController.bulkUpdateListings);
router.post("/listings/bulk-delete", ListingController.bulkDeleteListings);
router.post("/listings/clear-urls", ListingController.clearAllListingsUrls);
router.post("/listings/clone-to-appliance", ListingController.cloneToAppliance);
router.put("/listings/:id", ListingController.updateListingById);
router.delete("/listings/:id", ListingController.deleteListingById);
router.get("/config", SettingsController.getConfig);
router.post("/config", SettingsController.setConfig);
router.post("/upload", upload.array("photos", 10), ListingController.uploadImages);

router.post("/run-automation", AutomationController.runAutomation);
router.post("/stop-automation", AutomationController.stopAutomation);
router.get("/automation-status", AutomationController.getAutomationStatus);
router.post("/run-sundul", AutomationController.runSundul);
router.get("/stream-logs", LogController.streamLogs);
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

// Analytics & Reports
router.get("/analytics/activity", AnalyticsController.getAnalyticsActivity);
router.get("/analytics/listing-stats", AnalyticsController.getListingStats);
router.get("/reports/daily", AnalyticsController.getDailyReports);
router.post("/reports/generate", AnalyticsController.generateReport);

// Notification stream
router.get("/notifications/stream", LogController.streamNotifications);

module.exports = router;
