const express = require("express");
const path = require("node:path");
const fs = require("fs-extra");
const rateLimit = require("express-rate-limit");

const app = express();
app.disable("x-powered-by");

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	message: "Terlalu banyak request, coba lagi nanti.",
});
app.use("/api", limiter);

const ASSETS_DIR = path.join(__dirname, "../../assets");

// Pastikan folder assets ada
fs.ensureDirSync(ASSETS_DIR);

app.use(express.json());
app.use(express.static(path.join(__dirname, "client/dist")));
app.use("/assets", express.static(ASSETS_DIR));

const apiRoutes = require("./routes/api");
app.use("/api", apiRoutes);

// Error Handler Global
app.use((err, _req, res, _next) => {
	console.error("SERVER ERROR:", err.stack);
	res.status(500).json({ error: `Internal Server Error: ${err.message}` });
});

module.exports = app;
