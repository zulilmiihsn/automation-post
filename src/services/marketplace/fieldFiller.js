const { FIELD_TRANSLATIONS } = require("../../core/constants");
const { resolveValueAliases } = require("./vehicleMapper");
const Health = require("../../core/selectorHealth");

function buildRegex(aliases) {
	return new RegExp(aliases.join("|"), "i");
}

function escapeAttr(s) {
	return String(s).replace(/"/g, '\\"');
}

class FieldFiller {
	constructor(page, engine, logger) {
		this.page = page;
		this.engine = engine;
		this.logger = logger;
	}

	async _findLabelInput(fieldName, inputSelector = 'input, textarea, [role="textbox"]') {
		const aliases = FIELD_TRANSLATIONS[fieldName] || [fieldName];
		const regex = buildRegex(aliases);
		const key = `marketplace.text.${fieldName}`;
		const container = this.page.locator("label").filter({ hasText: regex }).first();
		let field = container.locator(inputSelector).first();
		if (await field.isVisible().catch(() => false)) {
			Health.record(key, 0, 1 + aliases.length);
			return { field, via: "label" };
		}
		for (let i = 0; i < aliases.length; i++) {
			const alias = aliases[i];
			const fallback = this.page
				.locator(
					`input[aria-label*="${escapeAttr(alias)}"], textarea[aria-label*="${escapeAttr(alias)}"], [role="textbox"][aria-label*="${escapeAttr(alias)}"]`,
				)
				.first();
			if (await fallback.isVisible().catch(() => false)) {
				Health.record(key, 1 + i, 1 + aliases.length);
				return { field: fallback, via: `aria:${alias}` };
			}
		}
		Health.record(key, -1, 1 + aliases.length);
		return { field: null, via: null };
	}

	async _findCombobox(fieldName) {
		const aliases = FIELD_TRANSLATIONS[fieldName] || [fieldName];
		const regex = buildRegex(aliases);
		const key = `marketplace.dropdown.${fieldName}`;
		const box = this.page.locator('label[role="combobox"]').filter({ hasText: regex }).first();
		if (await box.isVisible().catch(() => false)) {
			Health.record(key, 0, 2);
			return { box, via: "labelCombobox" };
		}
		const labelText = this.page.locator("span, div").filter({ hasText: regex }).first();
		const fallbackBox = labelText
			.locator('xpath=./ancestor::label[@role="combobox"] | ./ancestor::div[@role="combobox"]')
			.first();
		if (await fallbackBox.isVisible().catch(() => false)) {
			Health.record(key, 1, 2);
			return { box: fallbackBox, via: "ancestorFallback" };
		}
		Health.record(key, -1, 2);
		return { box: null, via: null };
	}

	async selectDropdown(fieldName, value) {
		if (!value) {
			this.logger.method("SKIP", `marketplace.dropdown.${fieldName}`, "value kosong");
			return true;
		}

		this.logger.info(`Memilih [${fieldName}] -> ${value}`);
		this.logger.method("TRY", `marketplace.dropdown.${fieldName}.labelCombobox`);

		const { box, via } = await this._findCombobox(fieldName);
		if (!box) {
			this.logger.error(`Dropdown [${fieldName}] tidak ditemukan`);
			this.logger.method("FAIL", `marketplace.dropdown.${fieldName}.labelCombobox`);
			this.logger.method("FAIL", `marketplace.dropdown.${fieldName}.ancestorFallback`);
			return false;
		}
		await box.scrollIntoViewIfNeeded().catch(() => {});
		await box.click().catch(() => {});
		this.logger.method("SUCCESS", `marketplace.dropdown.${fieldName}.${via}`);

		await this.engine.delay(400, 900);

		const valueAliases = resolveValueAliases(fieldName, value);
		this.logger.method("TRY", `marketplace.dropdown.${fieldName}.optionMatch`, `value=${value}`);
		let optionSelected = await this.engine.selectFromDropdown(valueAliases);

		if (!optionSelected) {
			this.logger.info(`Mengetik dan Enter: ${value}`);
			await this.page.keyboard.type(String(value), { delay: 50 });
			await this.engine.delay(400);
			await this.page.keyboard.press("Enter");
			optionSelected = true;
		}

		if (!optionSelected) {
			this.logger.warn(`Opsi [${value}] tidak ditemukan`);
			this.logger.method("FAIL", `marketplace.dropdown.${fieldName}.optionMatch`, `value=${value}`);
			await this.page.keyboard.press("Escape").catch(() => {});
			return false;
		}
		this.logger.method("SUCCESS", `marketplace.dropdown.${fieldName}.optionMatch`, `value=${value}`);
		await this.engine.delay(900, 1400);
		return true;
	}

	async fillText(fieldName, value) {
		let actualValue = value;
		if (fieldName === "Jarak Tempuh" && (!actualValue || actualValue === "")) {
			actualValue = 300;
		}
		if (!actualValue) {
			this.logger.method("SKIP", `marketplace.text.${fieldName}`, "value kosong");
			return true;
		}

		const aliases = FIELD_TRANSLATIONS[fieldName] || [fieldName];
		this.logger.info(`Mengisi [${fieldName}] -> ${actualValue}`);
		this.logger.method("TRY", `marketplace.text.${fieldName}.labelField`);

		const { field, via } = await this._findLabelInput(fieldName);
		if (via) this.logger.method("SUCCESS", `marketplace.text.${fieldName}.${via === "label" ? "labelField" : "ariaFallback"}`);

		if (!field || !(await field.isVisible().catch(() => false))) {
			this.logger.error(`Field [${fieldName}] tidak ditemukan`);
			if (fieldName === "Jarak Tempuh") {
				this.logger.warn("Skip Jarak Tempuh karena field tidak ditemukan di halaman");
				return true;
			}
			return false;
		}

		await field.scrollIntoViewIfNeeded().catch(() => {});
		await this.engine.clearInput(field);
		await this.page.keyboard.type(actualValue.toString(), { delay: 25 });
		await this.engine.delay(300, 800);
		if (fieldName === "Label produk") {
			await this.page.keyboard.press("Enter");
		}
		this.logger.method("SUCCESS", `marketplace.text.${fieldName}.fill`);
		return true;
	}

	async fillLocation(loc) {
		this.logger.info(`Mengisi lokasi: ${loc}`);
		const aliases = FIELD_TRANSLATIONS.Lokasi || ["Lokasi", "Location", "Kota"];
		const regex = buildRegex(aliases);

		this.logger.method("TRY", "marketplace.location.labelField");
		let field = this.page.locator("label").filter({ hasText: regex }).locator("input").first();

		if (!(await field.isVisible().catch(() => false))) {
			this.logger.method("FAIL", "marketplace.location.labelField");
			for (const alias of aliases) {
				this.logger.method("TRY", "marketplace.location.ariaFallback", `alias=${alias}`);
				const fallback = this.page.locator(`input[aria-label*="${escapeAttr(alias)}"]`).first();
				if (await fallback.isVisible().catch(() => false)) {
					field = fallback;
					this.logger.method("SUCCESS", "marketplace.location.ariaFallback", `alias=${alias}`);
					break;
				}
				this.logger.method("FAIL", "marketplace.location.ariaFallback", `alias=${alias}`);
			}
		} else {
			this.logger.method("SUCCESS", "marketplace.location.labelField");
		}

		if (!field || !(await field.isVisible().catch(() => false))) {
			this.logger.error("Field Lokasi tidak ditemukan");
			return false;
		}

		await field.scrollIntoViewIfNeeded().catch(() => {});
		await this.engine.clearInput(field);
		await this.page.keyboard.type(loc, { delay: 40 });

		const suggestion = this.page.locator('[role="option"]').first();
		this.logger.method("TRY", "marketplace.location.suggestion");
		try {
			await suggestion.waitFor({ state: "visible", timeout: 3000 });
			await suggestion.click();
			this.logger.method("SUCCESS", "marketplace.location.suggestion");
		} catch (_err) {
			this.logger.warn("Saran lokasi tidak muncul");
			this.logger.method("FAIL", "marketplace.location.suggestion");
			this.logger.method("TRY", "marketplace.location.enterFallback");
			await this.page.keyboard.press("Enter");
			this.logger.method("SUCCESS", "marketplace.location.enterFallback");
		}
		await this.engine.delay(600);
		return true;
	}
}

module.exports = FieldFiller;
