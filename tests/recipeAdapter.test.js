const { toListingVars, applyVarsToRecipe, filterByFeature, missingVars } = require("../src/services/recipeAdapter");
const { pruneDir } = require("../src/utils/retention");

describe("recipeAdapter E2E dry 1 flow marketplace", () => {
	test("variabel listing tersuntik, fitur tersaring, tak ada var hilang", () => {
		const recipe = {
			feature: "marketplace",
			steps: [
				{ seq: 1, aksi: "buka", url: "https://www.facebook.com/marketplace/create/item", feature: "marketplace" },
				{ seq: 2, aksi: "isi", value: "{{judul}}", primary: { kind: "role", role: "textbox", name: "Judul" }, feature: "marketplace" },
				{ seq: 3, aksi: "isi", value: "{{harga}}", primary: { kind: "role", role: "textbox", name: "Harga" }, feature: "marketplace" },
				{ seq: 4, aksi: "klik", primary: { kind: "role", role: "button", name: "Terbitkan" }, feature: "feed" },
			],
		};
		const listing = { title: "Motor Beat", price: 12000000, description: "Mulus", location: "Jakarta", category: "Kendaraan", condition: "Bekas - Baik", targetGroup: "jual beli", photos: ["a.jpg"] };
		const vars = toListingVars(listing);
		expect(vars.judul).toBe("Motor Beat");
		const scoped = filterByFeature(recipe, "marketplace");
		expect(scoped.steps.length).toBe(3);
		const filled = applyVarsToRecipe(scoped, vars);
		expect(filled.steps[1].value).toBe("Motor Beat");
		expect(filled.steps[2].value).toBe("12000000");
		expect(missingVars(scoped, vars)).toEqual([]);
	});

	test("pruneDir hapus file tua saja", () => {
		const fs = require("node:fs");
		const path = require("node:path");
		const dir = path.join(__dirname, "__tmp_retention__");
		fs.mkdirSync(dir, { recursive: true });
		const oldF = path.join(dir, "old.txt");
		const newF = path.join(dir, "new.txt");
		fs.writeFileSync(oldF, "x");
		fs.writeFileSync(newF, "y");
		const past = Date.now() - 10 * 24 * 3600 * 1000;
		fs.utimesSync(oldF, new Date(past), new Date(past));
		const r = pruneDir(dir, { maxAgeMs: 7 * 24 * 3600 * 1000, maxBytes: 1024 * 1024 });
		expect(r.removed).toBe(1);
		expect(fs.existsSync(newF)).toBe(true);
		fs.rmSync(dir, { recursive: true, force: true });
	});
});
