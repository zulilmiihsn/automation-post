process.env.NODE_ENV = "test";

const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");

jest.mock("node:child_process", () => ({ spawn: jest.fn() }));
jest.mock("../src/web/services/dataService", () => ({
	addLog: jest.fn(),
	addLogBatch: jest.fn(),
	setQueueState: jest.fn(),
	getAppConfig: jest.fn(() => ({})),
}));

const { spawn } = require("node:child_process");
const QueueService = require("../src/web/services/queueService");

function makeFakeProcess() {
	const proc = new EventEmitter();
	proc.stdout = new PassThrough();
	proc.stderr = new PassThrough();
	proc.pid = 4242;
	proc.kill = jest.fn();
	return proc;
}

describe("QueueService exclusive automation lock", () => {
	let procs;

	beforeEach(() => {
		procs = [];
		spawn.mockImplementation(() => {
			const proc = makeFakeProcess();
			procs.push(proc);
			return proc;
		});
	});

	afterEach(() => {
		for (const proc of procs) proc.emit("close", 0);
		procs = [];
		spawn.mockReset();
	});

	test("blocks a different automation mode while one is running", () => {
		const marketplace = QueueService.getQueue("marketplace");
		const viral = QueueService.getQueue("viral");

		expect(marketplace.startFullAutomation("marketplace")).toBe(true);
		expect(viral.startFullAutomation("viral")).toBe(false);

		expect(QueueService.getRunningModes()).toEqual(["marketplace"]);
		expect(QueueService.isAnyRunning()).toBe(true);
		expect(spawn).toHaveBeenCalledTimes(1);
	});

	test("keeps the lock until the child process closes after stop", () => {
		const marketplace = QueueService.getQueue("marketplace");

		expect(marketplace.startFullAutomation("marketplace")).toBe(true);
		expect(marketplace.stopAutomation()).toBe(true);

		// SIGTERM sudah dikirim, tetapi lock belum boleh dilepas.
		expect(procs[0].kill).toHaveBeenCalledWith("SIGTERM");
		expect(marketplace.isRunning).toBe(true);
		expect(QueueService.isAnyRunning()).toBe(true);

		procs[0].emit("close", 0);

		expect(marketplace.isRunning).toBe(false);
		expect(QueueService.isAnyRunning()).toBe(false);
		expect(QueueService.getRunningModes()).toEqual([]);
	});

	test("scraper uses the same lock and receives profile and group env", () => {
		const marketplace = QueueService.getQueue("marketplace");
		const scraper = QueueService.getQueue("scraper");

		expect(marketplace.startFullAutomation("marketplace")).toBe(true);
		expect(scraper.startScraper("https://www.facebook.com/item/1", "profiles/akun_1", 9)).toBe(false);

		procs[0].emit("close", 0);

		expect(scraper.startScraper("https://www.facebook.com/item/1", "profiles/akun_1", 9)).toBe(true);

		const spawnCall = spawn.mock.calls[1];
		expect(spawnCall[0]).toBe("node");
		expect(spawnCall[1][0]).toContain("scraper.js");
		expect(spawnCall[2].env.SCRAPER_PROFILE_DIR).toBe("profiles/akun_1");
		expect(spawnCall[2].env.SCRAPER_GROUP_ID).toBe("9");
	});
});
