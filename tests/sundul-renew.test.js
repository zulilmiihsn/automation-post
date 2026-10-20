process.env.NODE_ENV = "test";
process.env.SUNDUL_VERIFY_RELOAD_DELAY_MS = "10";

jest.setTimeout(10000);

jest.mock("../src/utils/logger", () =>
	jest.fn().mockImplementation(() => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		success: jest.fn(),
	})),
);

jest.mock("../src/web/services/dataService", () => ({
	getRecentMarketplaceRenewals: jest.fn(() => []),
	getListings: jest.fn(async () => []),
	markMarketplaceRenewed: jest.fn(),
}));

jest.mock("../src/core/browserManager", () => jest.fn());

const { renewListing, selectTargets } = require("../scripts/sundul");

function createMenuElement(enabled) {
	return {
		isVisible: jest.fn(async () => true),
		innerText: jest.fn(async () => "Perbarui"),
		getAttribute: jest.fn(async (name) => {
			if (!enabled && name === "aria-disabled") return "true";
			if (!enabled && name === "disabled") return "";
			return null;
		}),
		click: jest.fn(async () => {}),
	};
}

function createMenuPage({ successSignal, renewEnabled = true, postReloadRenewEnabled = true } = {}) {
	const menus = [createMenuElement(renewEnabled), createMenuElement(postReloadRenewEnabled)];
	let menuIndex = 0;

	const optionElement = {
		scrollIntoViewIfNeeded: jest.fn(async () => {}),
		click: jest.fn(async () => {}),
	};

	const page = {
		url: jest.fn(() => "https://www.facebook.com/marketplace/you/selling"),
		goto: jest.fn(async () => {}),
		evaluate: jest.fn(async () => true),
		$$: jest.fn(async (selector) => {
			if (selector.includes('[role="menuitem"]')) {
				const menu = menus[Math.min(menuIndex, menus.length - 1)];
				menuIndex += 1;
				return [menu];
			}
			return [];
		}),
		evaluateHandle: jest.fn(async () => ({ asElement: () => optionElement })),
		waitForFunction: jest.fn(async (fn, arg) => {
			if (Array.isArray(arg)) {
				if (successSignal) return { dispose: async () => {} };
				throw new Error("success signal timeout");
			}
			return true;
		}),
		keyboard: { press: jest.fn(async () => {}) },
	};

	return { page, menus, menuElement: menus[0], optionElement };
}

describe("renewListing verification", () => {
	test("does not claim success when Facebook shows no success signal", async () => {
		const { page } = createMenuPage({ successSignal: false });

		const result = await renewListing(page, { title: "Honda Beat 2024" });

		expect(result).toEqual({ success: false, reason: "unverified" });
	});

	test("claims success only when Facebook shows a success signal", async () => {
		const { page } = createMenuPage({ successSignal: true });

		const result = await renewListing(page, { title: "Honda Beat 2024" });

		expect(result).toEqual({ success: true, reason: "menu-dropdown-success" });
	});

	test("verifies success via post-reload cooldown when no toast appears", async () => {
		const { page, menus } = createMenuPage({ successSignal: false, postReloadRenewEnabled: false });

		const result = await renewListing(page, { title: "Honda Beat 2024" });

		expect(result).toEqual({ success: true, reason: "post-reload-cooldown" });
		expect(menus[0].click).toHaveBeenCalled();
	});

	test("stays unverified when post-reload renew action is still enabled", async () => {
		const { page } = createMenuPage({ successSignal: false, postReloadRenewEnabled: true });

		const result = await renewListing(page, { title: "Honda Beat 2024" });

		expect(result).toEqual({ success: false, reason: "unverified" });
	});

	test("does not click renew while the menu action is in cooldown", async () => {
		const { page, menuElement } = createMenuPage({ successSignal: true, renewEnabled: false });

		const result = await renewListing(page, { title: "Honda Beat 2024" });

		expect(result).toEqual({ success: false, reason: "cooldown-active" });
		expect(menuElement.click).not.toHaveBeenCalled();
	});
});

describe("selectTargets dedupe", () => {
	const listing = {
		title: "Honda Beat 2024",
		listingId: "123",
		active: true,
		warning: null,
		ageText: "Ditawarkan 10 hari lalu",
	};

	test("selects the same Facebook listing only once for duplicate requested titles", () => {
		const result = selectTargets({
			autoMode: false,
			titles: ["Honda Beat 2024", "Honda Beat 2024"],
			listings: [listing],
			recentKeys: new Set(),
			localListings: [],
		});

		expect(result).toHaveLength(1);
	});

	test("dedupes duplicate Facebook cards by listing key in auto mode", () => {
		const result = selectTargets({
			autoMode: true,
			titles: [],
			listings: [listing, { ...listing }],
			recentKeys: new Set(),
			localListings: [],
		});

		expect(result).toHaveLength(1);
	});
});
