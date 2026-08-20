const { spawn } = require("child_process");
const path = require("path");

console.log("Starting backend and frontend...");

// Start express server
const server = spawn("node", [path.join(__dirname, "../src/web/server.js")], {
	stdio: "inherit",
});

// Start vite dev server
const client = spawn("npm", ["run", "dev"], {
	cwd: path.join(__dirname, "../src/web/client"),
	stdio: "inherit",
	shell: true,
});

// Handle exit
process.on("SIGINT", () => {
	server.kill();
	client.kill();
	process.exit();
});
process.on("SIGTERM", () => {
	server.kill();
	client.kill();
	process.exit();
});
