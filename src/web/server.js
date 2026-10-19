const http = require("node:http");
const app = require("./app");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(HOST.toLowerCase())) {
	throw new Error("Server menolak bind non-localhost karena API belum memakai autentikasi.");
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT harus antara 1 dan 65535.");

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
	console.log(`\n=========================================`);
	console.log(`   FB AUTOMATION WIZARD RUNNING        `);
	console.log(`   URL: http://${HOST}:${PORT}        `);
	console.log(`=========================================\n`);

	// Start cron scheduler
	try {
		const DataService = require('./services/dataService');
		const stale = DataService.clearStaleQueues();
		if (stale.length > 0) {
			console.log(`[BOOT] Antre yatim dari restart ditandai idle: ${stale.join(', ')}`);
		}
		const interruptedRuns = DataService.markInterruptedAutomationRuns();
		if (interruptedRuns?.changes > 0) {
			console.log(`[BOOT] ${interruptedRuns.changes} run automasi yatim ditandai interrupted`);
		}
		const hanging = DataService.resetHangingListings();
		if (hanging && hanging.changes > 0) {
			console.log(`[BOOT] ${hanging.changes} listing nyangkut 'posting' dikembalikan ke 'ready'`);
		}
		try {
			const { pruneDefaults } = require('../utils/retention');
			const pruned = pruneDefaults();
			const n = pruned.reduce((s, r) => s + (r.removed || 0), 0);
			if (n > 0) console.log(`[BOOT] Rotasi debug/recordings: ${n} file lama dihapus`);
		} catch (_e) {}
	} catch (err) {
		console.error('[Boot] Rekonsiliasi gagal:', err.message);
	}

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
