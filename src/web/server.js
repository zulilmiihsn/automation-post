const http = require("node:http");
const app = require("./app");

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

server.listen(PORT, () => {
	console.log(`\n=========================================`);
	console.log(`   FB AUTOMATION WIZARD RUNNING        `);
	console.log(`   URL: http://localhost:${PORT}        `);
	console.log(`=========================================\n`);

	// Start cron scheduler
	try {
		const scheduler = require('../services/schedulerService');
		scheduler.start();
	} catch (err) {
		console.error('[Scheduler] Failed to start:', err.message);
	}

	// Start health monitor
	try {
		const healthService = require('../services/healthService');
		healthService.startMonitoring();
	} catch (err) {
		console.error('[HealthService] Failed to start:', err.message);
	}
});

server.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		console.error(
			`\n[ERROR] Port ${PORT} sudah dipakai. Tutup proses lain lalu coba lagi.\n`,
		);
	} else {
		console.error("[SERVER ERROR]", err);
	}
	process.exit(1);
});
