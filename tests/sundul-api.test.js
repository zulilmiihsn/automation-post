jest.mock("../src/web/services/queueService", () => {
	const startSundul = jest.fn();
	return {
		_startSundul: startSundul,
		getQueue: jest.fn(() => ({ startSundul })),
		isAnyRunning: jest.fn(() => false),
	};
});

jest.mock("../src/web/services/dataService", () => ({
	getAccounts: jest.fn(async () => []),
	getListings: jest.fn(async () => []),
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
