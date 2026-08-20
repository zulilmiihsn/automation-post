jest.mock("node-cron", () => ({
	validate: jest.fn(() => true),
	schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock("../src/utils/logger", () => {
	return jest.fn().mockImplementation(() => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}));
});

jest.mock("../src/web/services/dataService", () => ({
	addNotification: jest.fn(),
	getAccounts: jest.fn(async () => []),
	markScheduleRun: jest.fn(),
}));

jest.mock("../src/web/services/queueService", () => {
	const startSundul = jest.fn(() => true);
	const startFullAutomation = jest.fn(() => true);
	const once = jest.fn();
	return {
		_startSundul: startSundul,
		_startFullAutomation: startFullAutomation,
		_once: once,
		getQueue: jest.fn(() => ({ startSundul, startFullAutomation, once })),
	};
});

const scheduler = require("../src/services/schedulerService");
const DataService = require("../src/web/services/dataService");
const QueueService = require("../src/web/services/queueService");
const startSundul = QueueService._startSundul;
const startFullAutomation = QueueService._startFullAutomation;

describe("Sundul scheduler", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		startSundul.mockReturnValue(true);
	});

	test("routes sundul schedule to dedicated auto sundul process", async () => {
		await scheduler._executeSchedule({
			id: 41,
			name: "Auto Sundul",
			mode: "sundul",
			account_id: null,
		});

		expect(startSundul).toHaveBeenCalledWith("auto", "Semua Akun Aktif", null, null);
		expect(startFullAutomation).not.toHaveBeenCalled();
		expect(DataService.markScheduleRun).toHaveBeenCalledWith(41);
	});
});
