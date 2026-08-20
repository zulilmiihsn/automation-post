const BotOrchestrator = require("./src/core/orchestrator");

const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith("--mode="));
const RUN_MODE = modeArg ? modeArg.split("=")[1] : "all"; // all, viral, marketplace, comment

const accountIdArg = args.find((arg) => arg.startsWith("--accountId="));
const ACCOUNT_ID = accountIdArg ? accountIdArg.split("=")[1] : null;

const commentTargetUrlArg = args.find((arg) => arg.startsWith("--commentTargetUrl="));
const COMMENT_TARGET_URL = commentTargetUrlArg
	? commentTargetUrlArg.substring(commentTargetUrlArg.indexOf("=") + 1)
	: null;
const orchestrator = new BotOrchestrator(RUN_MODE, ACCOUNT_ID, COMMENT_TARGET_URL);

// Graceful Shutdown Handler (Anti-Zombie)
async function gracefulShutdown(signal) {
	console.log(`\n[SYSTEM] Menerima sinyal ${signal}. Menutup browser secara aman...`);
	try {
		if (orchestrator && orchestrator.bot) {
			await orchestrator.bot.close();
		}
	} catch (e) {
		console.error(`[ERROR] Gagal menutup browser saat shutdown: ${e.message}`);
	}
	process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", (err) => {
	console.error("[ERROR] Uncaught Exception:", err);
	gracefulShutdown("UNCAUGHT_EXCEPTION");
});

orchestrator.run();
