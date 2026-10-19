jest.mock("../src/web/services/queueService", () => {
	const startSundul = jest.fn();
	return {
		_startSundul: startSundul,
		getQueue: jest.fn(() => ({ startSundul })),
		getRunningModes: jest.fn(() => []),
		isAnyRunning: jest.fn(() => false),
	};
});

jest.mock("../src/web/services/dataService", () => ({
	getAccounts: jest.fn(async () => []),
	getListings: jest.fn(async () => []),
	getAppConfig: jest.fn(() => ({})),
}));

jest.mock("../src/core/browserManager", () => jest.fn());
jest.mock("../src/services/aiService", () => ({}));

const ApiController = require("../src/web/controllers/AutomationController");
const QueueService = require("../src/web/services/queueService");
const DataService = require("../src/web/services/dataService");
const startSundul = QueueService._startSundul;

function createResponse() {
	return {
		statusCode: 200,
		body: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(body) {
			this.body = body;
			return this;
		},
	};
}

describe("Sundul API", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		QueueService.isAnyRunning.mockReturnValue(false);
		startSundul.mockReturnValue(true);
		DataService.getAccounts.mockResolvedValue([]);
		DataService.getListings.mockResolvedValue([]);
		DataService.getAppConfig.mockReturnValue({});
	});

	test("starts true Facebook auto scan without local listing IDs", async () => {
		const req = { body: { autoMode: true } };
		const res = createResponse();

		await ApiController.runSundul(req, res);

		expect(res.statusCode).toBe(200);
		expect(res.body.success).toBe(true);
		expect(DataService.getListings).not.toHaveBeenCalled();
		expect(startSundul).toHaveBeenCalledWith(
			"auto",
			"Semua Akun Aktif",
			null,
			null,
		);
	});

	test("rejects sundul while another automation queue is running", async () => {
		QueueService.isAnyRunning.mockReturnValue(true);
		const req = { body: { autoMode: true } };
		const res = createResponse();

		await ApiController.runSundul(req, res);

		expect(res.statusCode).toBe(400);
		expect(startSundul).not.toHaveBeenCalled();
	});

	test("tells how many selected listings will run when capped by config", async () => {
		DataService.getListings.mockResolvedValue([
			{ id: "1", title: "Honda Beat 2024" },
			{ id: "2", title: "Vario 125 2025" },
		]);
		DataService.getAppConfig.mockReturnValue({ sundul_max_actions: "1" });
		const req = { body: { ids: ["1", "2"] } };
		const res = createResponse();

		await ApiController.runSundul(req, res);

		expect(res.statusCode).toBe(200);
		expect(res.body.message).toMatch(/1 dari 2/);
		expect(startSundul).toHaveBeenCalledWith(
			["Honda Beat 2024", "Vario 125 2025"],
			"Semua Akun Aktif",
			null,
			null,
		);
	});

	test("rejects selected account that is inactive or not linked", async () => {
		DataService.getAccounts.mockResolvedValue([
			{ id: "akun_1", name: "Akun 1", isActive: true, linked: false, profile: "profiles/akun_1" },
		]);
		const req = { body: { autoMode: true, accountId: "akun_1" } };
		const res = createResponse();

		await ApiController.runSundul(req, res);

		expect(res.statusCode).toBe(400);
		expect(res.body.error).toMatch(/belum tertaut/);
		expect(startSundul).not.toHaveBeenCalled();
	});
});
