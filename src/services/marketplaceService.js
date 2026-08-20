const _path = require("node:path");
const _fs = require("fs-extra");
const {
	FIELD_TRANSLATIONS,
	VALUE_TRANSLATIONS,
	SELECTORS,
	CATEGORY_TRANSLATIONS,
	CONDITION_TRANSLATIONS,
	FIELD_MAP,
	FIELD_CONFIG,
} = require("../core/constants");
const InteractionEngine = require("../core/interactionEngine");
const Logger = require("../utils/logger");

class MarketplaceService {
	constructor(page, accountName = "MARKETPLACE") {
		this.page = page;
		this.engine = new InteractionEngine(page, accountName);
		this.logger = new Logger(accountName);
	}

	async checkLimit() {
		await this.engine.delay(1000, 2500);

		const restriction = await this.page.evaluate((indicators) => {
			// Prioritas 1: cek elemen restriction resmi FB (dialog/alert/banner error)
			// Restriction genuine FB biasanya ada di dalam modal atau aria-live region
			const restrictionContainers = [
				...Array.from(document.querySelectorAll('[role="alert"], [role="dialog"] [role="status"]')),
				...Array.from(document.querySelectorAll('[data-testid*="error"], [data-testid*="restriction"], [data-testid*="blocked"]')),
			];

			for (const el of restrictionContainers) {
				const text = (el.innerText || "").toLowerCase();
				for (const s of indicators) {
					if (text.includes(s.toLowerCase())) return s;
				}
			}

			// Prioritas 2: fallback scan body, tapi HANYA jika semua frasa adalah
			// panjang & spesifik (bukan substring pendek yang bisa collide)
			const bodyText = (document.body.innerText || "").toLowerCase();
			for (const s of indicators) {
				// Hanya match jika frasa cukup panjang (>= 10 karakter) untuk hindari
				// false positive dari kata pendek yang bisa muncul di context lain
				if (s.length >= 10 && bodyText.includes(s.toLowerCase())) return s;
			}

			return null;
		}, SELECTORS.RESTRICTION_INDICATORS);

		if (restriction) {
			this.logger.warn(`STOP: Bot mendeteksi pembatasan: "${restriction}"`);
			throw new Error("ACCOUNT_LIMIT_REACHED");
		}
	}

	async postListing(listing) {
		try {
			await this.checkLimit();

			this.logger.info(`Memulai posting listing: ${listing.title}`);
			await this.engine.withRetry(
				async () => {
					await this.uploadMedia(
						listing.photos || listing.photoData || listing.photoDir,
					);
				},
				3,
				5000,
			);

			await this.engine.delay(1500);
			await this.checkLimit();

			await this.fillListingDetails(listing);
			await this.checkLimit();

			await this.finalize(
				listing.targetGroups || listing.targetGroup,
				listing.maxGroups,
			);

			this.logger.success("Formulir berhasil diisi dan dipublikasikan!");
			return { success: true };
		} catch (err) {
			if (err.message !== "ACCOUNT_LIMIT_REACHED") {
				const cleanMsg = err.message.includes(
					"Target page, context or browser has been closed",
				)
					? "Browser tertutup tiba-tiba"
					: err.message.split("\n")[0];
				this.logger.error(`Gagal: ${cleanMsg}`);
			}
			throw err;
		}
	}

	async fillListingDetails(listing) {
		this.logger.info(`Mengisi detail listing secara dinamis: ${listing.title}`);
		const category = listing.category || "Lain-lain";

		const requireStep = (ok, label) => {
			if (!ok) {
				throw new Error(`Metode wajib gagal: ${label}`);
			}
		};

		const url = this.page.url();
		const isVehicleForm = url.includes("/create/vehicle");
		const isItemForm = url.includes("/create/item");

		// 1. Judul (Title) - skip on vehicle form as it generates automatically
		if (!isVehicleForm) {
			requireStep(await this.fillText("Judul", listing.title), "marketplace.text.title");
			await this.engine.delay(400);
		}

		// 2. Harga (Price)
		requireStep(await this.fillText("Harga", listing.price), "marketplace.text.price");
		await this.engine.delay(500);

		// 3. Kategori & Kondisi (hanya di form generic item)
		if (isItemForm) {
			requireStep(await this.selectDropdown("Kategori", category), "marketplace.dropdown.category");
			await this.engine.delay(700);

			const condition = listing.condition || "Bekas - Baik";
			requireStep(await this.selectDropdown("Kondisi", condition), "marketplace.dropdown.condition");
			await this.engine.delay(700);
		}

		// 4. Isi kolom spesifik berdasarkan FIELD_MAP
		let categoryForMap = category;
		const attr = listing.attributes || {};
		if (category === "Kendaraan") {
			const jenisKendaraan = attr["Jenis kendaraan"] || attr["Vehicle type"];
			if (jenisKendaraan && FIELD_MAP[jenisKendaraan]) {
				categoryForMap = jenisKendaraan;
			}
		}
		
		const mappedFields = FIELD_MAP[categoryForMap] || FIELD_MAP[category] || [];
		const filledFields = new Set(["Judul", "Harga", "Kategori", "Kondisi", "Deskripsi", "Lokasi"]);

		for (const fieldName of mappedFields) {
			let value = attr[fieldName];
			
			// Fallback ke listing root properties untuk kemudahan (e.g. listing.year, listing.mileage)
			if (value === undefined || value === null || value === "") {
				if (fieldName === "Tahun") value = listing.year;
				else if (fieldName === "Merek") value = listing.make;
				else if (fieldName === "Model") value = listing.model;
				else if (fieldName === "Jarak Tempuh") value = listing.mileage;
				else if (fieldName === "Warna" || fieldName === "Warna eksterior") value = listing.color;
				else if (fieldName === "Jenis bahan bakar") value = listing.fuel;
				else if (fieldName === "Transmisi") value = listing.transmission;
				else if (fieldName === "Kondisi Kendaraan" && listing.condition) {
					// Map "Bekas - Baik" dsb ke opsi "Kondisi Kendaraan" ("Luar biasa baik", "Baik", dll)
					if (listing.condition.includes("Luar biasa")) value = "Luar biasa baik";
					else if (listing.condition.includes("Sangat baik")) value = "Sangat baik";
					else if (listing.condition.includes("Baik")) value = "Baik";
					else if (listing.condition.includes("Cukup")) value = "Cukup";
					else if (listing.condition.includes("Buruk")) value = "Buruk";
					else value = "Baik"; // Default
				}
			}

			if (value === undefined || value === null || value === "") {
				// Coba fallback terjemahan english jika ada di atribut
				if (fieldName === "Jenis kendaraan") value = attr["Vehicle type"] || "Sepeda Motor";
				else if (fieldName === "Tahun") value = attr["Year"];
				else if (fieldName === "Merek") value = attr["Make"];
				else if (fieldName === "Jarak Tempuh") value = attr["Mileage"];
				else if (fieldName === "Warna eksterior") value = attr["Warna Eksterior"] || attr["Exterior colour"];
				else if (fieldName === "Warna interior") value = attr["Exterior colour"] || attr["Warna dalam"];
				else if (fieldName === "Jenis bahan bakar") value = attr["Fuel type"];
				else if (fieldName === "Transmisi") value = attr["Transmission"];
			}

			if (value === undefined || value === null || value === "") {
				// Jarak Tempuh default fallback ke 300
				if (fieldName === "Jarak Tempuh") value = 300;
				else continue;
			}

			const config = FIELD_CONFIG[fieldName] || {};
			let type = config.type;

			if (isVehicleForm && fieldName === "Merek") {
				type = "select";
			}

			let ok = true;

			if (type === "select") {
				ok = await this.selectDropdown(fieldName, value);
			} else {
				ok = await this.fillText(fieldName, value);
			}

			// Validasi ketat kolom-kolom utama/kritis
			const criticalFields = ["Jenis kendaraan", "Tahun", "Merek", "Model", "Kategori", "Kondisi"];
			if (criticalFields.includes(fieldName)) {
				requireStep(ok, `marketplace.field.${fieldName}`);
			}

			filledFields.add(fieldName);
			await this.engine.delay(400);
		}

		// 5. Isi atribut tambahan lain yang tidak masuk di FIELD_MAP (opsional/fleksibel)
		for (const [fieldName, value] of Object.entries(attr)) {
			if (filledFields.has(fieldName)) continue;
			if (value === undefined || value === null || value === "") continue;

			// Jika ini form kendaraan, abaikan field yang secara eksplisit tidak ada di mappedFields
			// tapi merupakan bagian dari master Kendaraan (misal: Kondisi Kendaraan untuk Sepeda Motor)
			if (isVehicleForm && FIELD_MAP["Kendaraan"] && FIELD_MAP["Kendaraan"].includes(fieldName)) {
				continue;
			}

			// Hindari alias yang sudah diproses
			const isDuplicateAlias = [
				"Year", "Make", "Mileage", "Exterior colour", "Warna Eksterior", 
				"Fuel type", "Transmission", "Vehicle type"
			].includes(fieldName);
			if (isDuplicateAlias) continue;

			const config = FIELD_CONFIG[fieldName] || {};
			if (config.type === "select") {
				await this.selectDropdown(fieldName, value);
			} else {
				await this.fillText(fieldName, value);
			}
			await this.engine.delay(400);
		}

		// 6. Lokasi (Location) - Skip jika kosong
		if (listing.location && listing.location.trim()) {
			requireStep(await this.fillLocation(listing.location.trim()), "marketplace.location");
			await this.engine.delay(500);
		} else {
			this.logger.info("Lokasi kosong, melewati pengisian lokasi (pakai default akun).");
		}

		// 7. Deskripsi (Description)
		requireStep(await this.fillText("Deskripsi", listing.description), "marketplace.text.description");
	}

	async finalize(targetGroups = "", maxLimit = 20) {
		this.logger.info("Menyelesaikan postingan...");

		this.logger.method("TRY", "marketplace.next.onPoint");
		await this.page
			.locator('button, [role="button"]')
			.filter({ hasText: /Selanjutnya|Next|Berikutnya/i })
			.first()
			.click({ timeout: 5000 });
		this.logger.method("SUCCESS", "marketplace.next.onPoint");

		await this.engine.delay(2000, 3000);

		if (targetGroups) {
			await this.selectGroups(targetGroups, maxLimit);
		}

		this.logger.info("Mempublikasikan listing ke Facebook...");
		this.logger.method("TRY", "marketplace.publish.onPoint");
		await this.page
			.locator('button, [role="button"]')
			.filter({ hasText: /Terbitkan|Publish/i })
			.first()
			.click({ timeout: 5000 });
		this.logger.method("SUCCESS", "marketplace.publish.onPoint");

		await this.engine.delay(3000, 4000);
		await this.checkLimit(); // Check if limit appears after clicking publish
		await this.engine.delay(1000, 2000);
	}

	async selectGroups(targetGroups, maxLimit = 20) {
		let groupNames = [];
		try {
			if (Array.isArray(targetGroups)) groupNames = targetGroups;
			else if (typeof targetGroups === "string") {
				if (
					targetGroups.trim().startsWith("[") &&
					targetGroups.trim().endsWith("]")
				)
					groupNames = JSON.parse(targetGroups);
				else
					groupNames = targetGroups
						.split(",")
						.map((g) => g.trim())
						.filter((g) => g);
			}
		} catch (_e) {
			groupNames = String(targetGroups)
				.split(",")
				.map((g) => g.trim())
				.filter((g) => g);
		}

		if (groupNames.length === 0) return;

		this.logger.info(
			`Fase Penemuan: Mencari grup dengan kata kunci: ${groupNames.join(", ")}`,
		);

		const discoveredGroups = new Map();

		for (let i = 0; i < 10; i++) {
			const items = await this.page
				.locator('div[role="checkbox"], div[role="button"], [role="listitem"]')
				.all();

			for (const item of items) {
				const text = await item.innerText().catch(() => "");
				if (!text) continue;

				const lines = text
					.split("\n")
					.map((l) => l.trim())
					.filter((l) => l);
				if (lines.length >= 2) {
					const name = lines[0];
					const info = lines[1];

					const matchesKeyword = groupNames.some((kw) =>
						name.toLowerCase().includes(kw.toLowerCase()),
					);

					if (matchesKeyword && !discoveredGroups.has(name)) {
						const memberCount = this.parseMemberCount(info);
						discoveredGroups.set(name, {
							name,
							members: memberCount,
							rawText: info,
						});
					}
				}
			}

			await this.page.evaluate(() => {
				const modal = document.querySelector(
					'div[role="dialog"] [style*="overflow-y: auto"], div[role="dialog"] .scrollable',
				);
				if (modal) modal.scrollBy(0, 1000);
				else window.scrollBy(0, 1000);
			});
			await this.engine.delay(200, 300);
		}

		const sortedGroups = Array.from(discoveredGroups.values())
			.sort((a, b) => b.members - a.members)
			.slice(0, maxLimit);

		if (sortedGroups.length === 0) {
			this.logger.warn("Tidak ada grup yang ditemukan sesuai keyword.");
			return;
		}

		this.logger.success(
			`Ditemukan ${discoveredGroups.size} grup. Memilih Top ${sortedGroups.length} terbesar...`,
		);

		let selectedCount = 0;
		for (const group of sortedGroups) {
			try {
				let _found = false;
				// Dikurangi dari 5 → 2 retry agar grup tidak ketemu tidak buang waktu ~2s/grup
				for (let retry = 0; retry < 2; retry++) {
					const item = this.page
						.locator('div[role="checkbox"], div[role="button"]')
						.filter({ hasText: group.name })
						.first();

					if (await item.isVisible()) {
						const isChecked =
							(await item.getAttribute("aria-checked")) === "true";
						if (!isChecked) {
							await item.scrollIntoViewIfNeeded().catch(() => {});
							await item.click({ force: true }).catch(() => {});
							selectedCount++;
							this.logger.success(
								`[${selectedCount}/${sortedGroups.length}] Terpilih: ${group.name} (${group.rawText})`,
							);
						} else {
							selectedCount++;
						}
						_found = true;
						break;
					}

					await this.page.evaluate(() => {
						const modal = document.querySelector(
							'div[role="dialog"] [style*="overflow-y: auto"]',
						);
						if (modal) modal.scrollBy(0, 800);
					});
					await this.engine.delay(100, 200);
				}
			} catch (_err) {}
		}

		this.logger.info(`Selesai memilih grup. Total terpilih: ${selectedCount}`);
	}

	parseMemberCount(text) {
		if (!text) return 0;
		const clean = text.toLowerCase().replace(/,/g, ".");
		let num = parseFloat(clean.match(/[0-9.]+/)?.[0] || 0);

		if (
			clean.includes("jt") ||
			clean.includes("m") ||
			clean.includes("million")
		)
			num *= 1000000;
		else if (
			clean.includes("rb") ||
			clean.includes("k") ||
			clean.includes("thousand")
		)
			num *= 1000;

		return num;
	}

	resolveValueAliases(fieldName, value) {
		if (!value) return [];
		const normalizedFieldName = fieldName.trim();
		if (normalizedFieldName === "Kategori") {
			return CATEGORY_TRANSLATIONS[value] || [value];
		}
		if (normalizedFieldName === "Kondisi") {
			return CONDITION_TRANSLATIONS[value] || [value];
		}
		const valAliases = VALUE_TRANSLATIONS[value]
			? [...VALUE_TRANSLATIONS[value], value]
			: [value];
		for (const [key, aliases] of Object.entries(VALUE_TRANSLATIONS)) {
			if (aliases.some((a) => a.toLowerCase() === value.toLowerCase())) {
				valAliases.push(key);
			}
		}
		return valAliases;
	}

	async selectDropdown(fieldName, value) {
		if (!value) {
			this.logger.method("SKIP", `marketplace.dropdown.${fieldName}`, "value kosong");
			return true;
		}

		const aliases = FIELD_TRANSLATIONS[fieldName] || [fieldName];
		const regex = new RegExp(aliases.join("|"), "i");
		this.logger.info(`Memilih [${fieldName}] -> ${value}`);

		this.logger.method("TRY", `marketplace.dropdown.${fieldName}.labelCombobox`);
		const box = this.page
			.locator('label[role="combobox"]')
			.filter({ hasText: regex })
			.first();

		if (!(await box.isVisible())) {
			this.logger.method("FAIL", `marketplace.dropdown.${fieldName}.labelCombobox`);
			this.logger.method("TRY", `marketplace.dropdown.${fieldName}.ancestorFallback`);
			const labelText = this.page
				.locator("span, div")
				.filter({ hasText: regex })
				.first();
			const fallbackBox = labelText
				.locator(
					'xpath=./ancestor::label[@role="combobox"] | ./ancestor::div[@role="combobox"]',
				)
				.first();
			if (await fallbackBox.isVisible()) {
				await fallbackBox.scrollIntoViewIfNeeded();
				await fallbackBox.click();
				this.logger.method("SUCCESS", `marketplace.dropdown.${fieldName}.ancestorFallback`);
			} else {
				this.logger.error(`Dropdown [${fieldName}] tidak ditemukan`);
				this.logger.method("FAIL", `marketplace.dropdown.${fieldName}.ancestorFallback`);
				return false;
			}
		} else {
			await box.scrollIntoViewIfNeeded();
			await box.click();
			this.logger.method("SUCCESS", `marketplace.dropdown.${fieldName}.labelCombobox`);
		}

		await this.engine.delay(400, 900);

		const valueAliases = this.resolveValueAliases(fieldName, value);

		this.logger.method("TRY", `marketplace.dropdown.${fieldName}.optionMatch`, `value=${value}`);
		let optionSelected = await this.engine.selectFromDropdown(valueAliases);

		if (!optionSelected) {
			this.logger.info(`Mengetik dan Enter: ${value}`);
			await this.page.keyboard.type(value, { delay: 50 });
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
		const regex = new RegExp(aliases.join("|"), "i");
		this.logger.info(`Mengisi [${fieldName}] -> ${actualValue}`);

		this.logger.method("TRY", `marketplace.text.${fieldName}.labelField`);
		const container = this.page
			.locator("label")
			.filter({ hasText: regex })
			.first();
		let field = container.locator('input, textarea, [role="textbox"]').first();

		if (!(await field.isVisible())) {
			this.logger.method("FAIL", `marketplace.text.${fieldName}.labelField`);
			for (const alias of aliases) {
				this.logger.method("TRY", `marketplace.text.${fieldName}.ariaFallback`, `alias=${alias}`);
				const fallback = this.page
					.locator(
						`input[aria-label*="${alias}"], textarea[aria-label*="${alias}"], [role="textbox"][aria-label*="${alias}"]`,
					)
					.first();
				if (await fallback.isVisible()) {
					field = fallback;
					this.logger.method("SUCCESS", `marketplace.text.${fieldName}.ariaFallback`, `alias=${alias}`);
					break;
				}
				this.logger.method("FAIL", `marketplace.text.${fieldName}.ariaFallback`, `alias=${alias}`);
			}
		} else {
			this.logger.method("SUCCESS", `marketplace.text.${fieldName}.labelField`);
		}

		if (!field || !(await field.isVisible())) {
			this.logger.error(`Field [${fieldName}] tidak ditemukan`);
			if (fieldName === "Jarak Tempuh") {
				this.logger.warn("Skip Jarak Tempuh karena field tidak ditemukan di halaman");
				return true;
			}
			return false;
		}

		await field.scrollIntoViewIfNeeded();
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
		const regex = new RegExp(aliases.join("|"), "i");

		this.logger.method("TRY", "marketplace.location.labelField");
		let field = this.page
			.locator("label")
			.filter({ hasText: regex })
			.locator("input")
			.first();

		if (!(await field.isVisible())) {
			this.logger.method("FAIL", "marketplace.location.labelField");
			for (const alias of aliases) {
				this.logger.method("TRY", "marketplace.location.ariaFallback", `alias=${alias}`);
				const fallback = this.page
					.locator(`input[aria-label*="${alias}"]`)
					.first();
				if (await fallback.isVisible()) {
					field = fallback;
					this.logger.method("SUCCESS", "marketplace.location.ariaFallback", `alias=${alias}`);
					break;
				}
				this.logger.method("FAIL", "marketplace.location.ariaFallback", `alias=${alias}`);
			}
		} else {
			this.logger.method("SUCCESS", "marketplace.location.labelField");
		}

		if (!field || !(await field.isVisible())) {
			this.logger.error("Field Lokasi tidak ditemukan");
			return false;
		}

		await field.scrollIntoViewIfNeeded();
		await this.engine.clearInput(field);

		await this.page.keyboard.type(loc, { delay: 40 });

		const suggestion = this.page.locator('[role="option"]').first();
		this.logger.method("TRY", "marketplace.location.suggestion");
		try {
			// Tunggu dinamis maks 3 detik. Muncul cepat, klik cepat!
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

	async uploadMedia(photoData) {
		if (!photoData) {
			this.logger.method("SKIP", "marketplace.media.inputFiles", "photoData kosong");
			return;
		}

		const photoFiles = this.engine.resolvePhotoPaths(
			Array.isArray(photoData) ? photoData : [photoData],
		);
		if (photoFiles.length === 0) {
			this.logger.method("SKIP", "marketplace.media.inputFiles", "tidak ada file valid");
			return;
		}

		this.logger.info(`Mengunggah ${photoFiles.length} foto...`);

		await this.engine.withRetry(
			async () => {
				this.logger.method("TRY", "marketplace.media.inputFiles", `count=${photoFiles.length}`);
				const fileInput = await this.page
					.locator('input[type="file"][accept*="image"]')
					.first();
				await fileInput.setInputFiles(photoFiles);
				this.logger.method("SUCCESS", "marketplace.media.inputFiles", `count=${photoFiles.length}`);
			},
			3,
			5000,
		);

		await this.engine.delay(2000, 3000);

		const uploaded = await this.engine
			.waitForCondition(async () => {
				return await this.page.evaluate(() => {
					const previews = document.querySelectorAll(
						[
							'img[src^="blob:"]',
							'img[src^="https://scontent"]',
							'[aria-label="Remove"]',
							'[aria-label="Hapus"]',
							'div[data-visualcompletion="media-vc-image"] img',
						].join(","),
					);
					const isUploading =
						document.body.innerText.includes("Uploading") ||
						document.body.innerText.includes("Mengunggah");
					return previews.length > 0 && !isUploading;
				});
			}, 30000)
			.catch(() => true);

		if (!uploaded) {
			this.logger.warn("Batas waktu unggah foto habis.");
			this.logger.method("FAIL", "marketplace.media.previewReady");
		} else {
			this.logger.info("Foto berhasil diunggah.");
			this.logger.method("SUCCESS", "marketplace.media.previewReady");
		}
	}
}

module.exports = MarketplaceService;
