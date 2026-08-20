const {
	buildListingKey,
	evaluateListingEligibility,
	findBestListingMatch,
	isRenewVerified,
	parseListingAgeDays,
	titleMatchScore,
} = require("../src/services/sundulRules");
const { parseCliArgs } = require("../scripts/sundul");

describe("Sundul rules", () => {
	const now = new Date(2026, 6, 18, 12, 0, 0);

	test("parses Indonesian and English relative ages", () => {
		expect(parseListingAgeDays("Ditawarkan 6 hari lalu", now)).toBe(6);
		expect(parseListingAgeDays("Ditawarkan 7 hari lalu", now)).toBe(7);
		expect(parseListingAgeDays("Listed 2 weeks ago", now)).toBe(14);
		expect(parseListingAgeDays("Diperbarui hari ini", now)).toBe(0);
		expect(parseListingAgeDays("Renewed today", now)).toBe(0);
		expect(parseListingAgeDays("Listed yesterday", now)).toBe(1);
	});

	test("parses localized numeric and named dates in English and Indonesian", () => {
		expect(parseListingAgeDays("Ditawarkan pada 10/7", now)).toBe(8);
		expect(parseListingAgeDays("Listed on 7/10", now)).toBe(8);
		expect(parseListingAgeDays("Listed on 17/07", now)).toBe(1);
		expect(parseListingAgeDays("Listed on 10 July", now)).toBe(8);
		expect(parseListingAgeDays("Ditawarkan pada 10 Juli", now)).toBe(8);
		expect(parseListingAgeDays("Listed on July 10, 2026", now)).toBe(8);
	});

	test("does not treat unknown age as eligible", () => {
		const result = evaluateListingEligibility(
			{ title: "Honda Beat 2024", active: true, warning: null, ageText: "" },
			{ now },
		);
		expect(result).toMatchObject({ eligible: false, reason: "unknown-age" });
	});

	test("rejects active listings newer than seven days before opening options", () => {
		const result = evaluateListingEligibility(
			{
				title: "Honda Beat 2024",
				listingId: "123",
				active: true,
				warning: null,
				ageText: "Ditawarkan 3 hari lalu",
			},
			{ now },
		);
		expect(result).toMatchObject({
			eligible: false,
			reason: "too-new",
			ageDays: 3,
			key: "123",
		});
	});

	test("accepts clean active listing at seven days", () => {
		const result = evaluateListingEligibility(
			{
				title: "Yamaha NMAX 2024",
				href: "https://www.facebook.com/marketplace/item/987654321/",
				active: true,
				warning: null,
				ageText: "Ditawarkan 1 minggu lalu",
			},
			{ now },
		);
		expect(result).toMatchObject({ eligible: true, reason: "eligible", key: "987654321" });
	});

	test("blocks listing recorded as renewed in the last seven days", () => {
		const listing = {
			title: "Yamaha NMAX 2024",
			listingId: "987",
			active: true,
			warning: null,
			ageText: "Ditawarkan 2 minggu lalu",
		};
		const result = evaluateListingEligibility(listing, {
			now,
			recentKeys: new Set([buildListingKey(listing)]),
		});
		expect(result).toMatchObject({ eligible: false, reason: "recently-renewed" });
	});

	test("requires matching numeric tokens in fuzzy title matching", () => {
		expect(titleMatchScore("Yamaha Aerox 2019", "Yamaha Aerox 2024")).toBe(0);
		expect(titleMatchScore("Honda Vario Tahun 2025", "Honda Vario 2025")).toBe(1);
	});

	test("returns exact target and rejects ambiguous equal candidates", () => {
		const exact = findBestListingMatch("Honda Beat Deluxe 2024", [
			{ title: "Honda Beat Deluxe 2023" },
			{ title: "Honda Beat Deluxe 2024" },
		]);
		expect(exact.listing.title).toBe("Honda Beat Deluxe 2024");

		const ambiguous = findBestListingMatch("Honda Beat 2024", [
			{ title: "Honda Beat 2024 Samarinda" },
			{ title: "Honda Beat 2024 Balikpapan" },
		]);
		expect(ambiguous).toBeNull();
	});

	test("never reports renew success without Facebook or post-reload evidence", () => {
		expect(isRenewVerified()).toBe(false);
		expect(isRenewVerified({ successSignal: true })).toBe(true);
		expect(isRenewVerified({ renewUnavailable: true })).toBe(true);
	});

	test("parses safe live-test controls", () => {
		expect(parseCliArgs(["--auto", "--dry-run", "--max=1"])).toMatchObject({
			autoMode: true,
			dryRun: true,
			maxActions: 1,
		});
	});
});
