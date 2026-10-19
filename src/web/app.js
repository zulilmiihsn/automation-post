const express = require("express");
const path = require("node:path");
const fs = require("fs-extra");
const rateLimit = require("express-rate-limit");

const app = express();
app.disable("x-powered-by");

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
app.use((req, res, next) => {
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

	// Etalase publik boleh diakses luar (GET saja). Sisanya tetap localhost.
	const isPublicCatalog = req.path === "/api/catalog" && req.method === "GET";
	if (isPublicCatalog) return next();

	const hostname = String(req.hostname || "").toLowerCase();
	if (!LOCAL_HOSTNAMES.has(hostname)) {
		return res.status(421).json({ error: "Akses hanya diizinkan melalui localhost." });
	}

	const origin = req.get("origin");
	if (origin) {
		try {
			const originUrl = new URL(origin);
			if (!LOCAL_HOSTNAMES.has(originUrl.hostname.toLowerCase())) {
				return res.status(403).json({ error: "Cross-origin request ditolak." });
			}
		} catch {
			return res.status(403).json({ error: "Origin request tidak valid." });
		}
	}
	return next();
});

const limiter = rateLimit({
		windowMs: 15 * 60 * 1000, // 15 minutes
		max: 10000, // 10,000 requests per 15 min for local web app
	standardHeaders: true,
	legacyHeaders: false,
	skip: (req) => req.path.startsWith("/automation-status"),
	message: { error: "Terlalu banyak request, coba lagi nanti." },
});
app.use("/api", limiter);

const ASSETS_DIR = path.join(__dirname, "../../assets");

// Pastikan folder assets ada
fs.ensureDirSync(ASSETS_DIR);

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "client/dist")));
app.use("/assets", express.static(ASSETS_DIR));

// Record API mutations in same live/persisted console as automation output.
app.use("/api", (req, res, next) => {
	if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
	const startedAt = Date.now();
	res.on("finish", () => {
		try {
			const QueueService = require("./services/queueService");
			const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
			const route = req.originalUrl.split("?")[0];
			const message = `${req.method} ${route} → ${res.statusCode} (${Date.now() - startedAt}ms)`;
			const tag = level === "error" ? "ERROR" : level === "warn" ? "WARN" : "INFO";
			QueueService.getQueue("all").addLog(`[${tag}] [APP] ${message}`);
		} catch (error) {
			console.warn("Console audit log failed:", error.message);
		}
	});
	next();
});

const apiRoutes = require("./routes/api");
app.use("/api", apiRoutes);

// Error Handler Global
app.use((err, _req, res, _next) => {
	console.error("SERVER ERROR:", err.stack);
	const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
	const exposeDetails = process.env.NODE_ENV !== "production" || status < 500;
	res.status(status).json({ error: exposeDetails ? err.message : "Internal Server Error" });
});

module.exports = app;
