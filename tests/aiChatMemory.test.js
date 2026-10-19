jest.mock("../src/services/aiClient", () => ({
	requestAICompletion: jest.fn(),
	resolveTimeout: (value, fallback) => Number(value) > 0 ? Number(value) : fallback,
}));
jest.mock("../src/web/services/dataService", () => ({
	getUserMemory: jest.fn().mockReturnValue("Eka tawar Beat"),
	saveOrUpdateMemory: jest.fn(),
}));

process.env.AI_PROVIDER = "groq";
process.env.GROQ_API_KEY = "test-key";
process.env.GROQ_MODEL_LIGHT = "openai/gpt-oss-120b";

const { requestAICompletion } = require("../src/services/aiClient");
const DataService = require("../src/web/services/dataService");
const AIChatService = require("../src/services/aiChatService");

describe("chat memory", () => {
	beforeEach(() => {
		requestAICompletion.mockReset();
		DataService.getUserMemory.mockClear();
		DataService.saveOrUpdateMemory.mockClear();
		AIChatService.logger.info = jest.fn();
		AIChatService.logger.warn = jest.fn();
	});

	test("baca memori masuk prompt, MEMO disimpan", async () => {
		requestAICompletion.mockResolvedValue("Masih ada bosku.\nMEMO: Eka tawar 16,8 cek sabtu");
		const reply = await AIChatService.generateReply("Masih ada?", {}, [], { username: "Eka" });
		expect(reply).toBe("Masih ada bosku.");
		expect(DataService.getUserMemory).toHaveBeenCalledWith("Eka");
		const prompt = requestAICompletion.mock.calls[0][1].messages[1].content;
		expect(prompt).toContain("Eka tawar Beat");
		expect(DataService.saveOrUpdateMemory).toHaveBeenCalledWith("Eka", "Eka tawar 16,8 cek sabtu");
	});

	test("tanpa MEMO tak simpan", async () => {
		requestAICompletion.mockResolvedValue("Masih ada bosku.");
		const reply = await AIChatService.generateReply("Masih ada?", {}, [], { username: "Eka" });
		expect(reply).toBe("Masih ada bosku.");
		expect(DataService.saveOrUpdateMemory).not.toHaveBeenCalled();
	});
});
