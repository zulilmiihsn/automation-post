const { FIELD_CONFIG, FIELD_MAP } = require("../../core/constants");
const InteractionEngine = require("../../core/interactionEngine");
const Logger = require("../../utils/logger");
const { checkLimit } = require("./limitDetector");
const { uploadMedia } = require("./mediaUploader");
const FieldFiller = require("./fieldFiller");
const {
	getCategoryForMap,
	normalizeFieldValue,
	getMappedFields,
	isCriticalField,
	isDuplicateAlias,
	resolveValueAliases,
} = require("./vehicleMapper");
const {
	parseMemberCount,
	selectGroups: selectGroupsHelper,
} = require("./groupSelector");

class MarketplaceService {
	constructor(page, accountName = "MARKETPLACE") {
		this.page = page;
		this.engine = new InteractionEngine(page, accountName);
		this.logger = new Logger(accountName);
		this.filler = new FieldFiller(page, this.engine, this.logger);
	}

	async checkLimit() {
		return checkLimit(this.page, this.engine, this.logger);
	}

	async uploadMedia(photoData) {
		return uploadMedia(this.page, this.engine, this.logger, photoData);
	}

	parseMemberCount(text) {
		return parseMemberCount(text);
	}

	resolveValueAliases(fieldName, value) {
		return resolveValueAliases(fieldName, value);
	}

	async selectDropdown(fieldName, value) {
		return this.filler.selectDropdown(fieldName, value);
	}

	async fillText(fieldName, value) {
		return this.filler.fillText(fieldName, value);
	}

	async fillLocation(loc) {
		return this.filler.fillLocation(loc);
	}

	async postListing(listing) {
		try {
			await this.checkLimit();

			this.logger.info(`Memulai posting listing: ${listing.title}`);
			await this.engine.withRetry(
				async () => {
					await this.uploadMedia(listing.photos || listing.photoData || listing.photoDir);
				},
				3,
				5000,
			);

			await this.engine.delay(1500);
			await this.checkLimit();

			await this.fillListingDetails(listing);
			await this.checkLimit();

			await this.finalize(listing.targetGroups || listing.targetGroup, listing.maxGroups);

			this.logger.success("Formulir berhasil diisi dan dipublikasikan!");
			return { success: true };
		} catch (err) {
			if (err.message !== "ACCOUNT_LIMIT_REACHED") {
				const cleanMsg = err.message.includes("Target page, context or browser has been closed")
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
			if (!ok) throw new Error(`Metode wajib gagal: ${label}`);
		};

		const url = this.page.url();
		const isVehicleForm = url.includes("/create/vehicle");
		const isItemForm = url.includes("/create/item");

		if (!isVehicleForm) {
			requireStep(await this.fillText("Judul", listing.title), "marketplace.text.title");
			await this.engine.delay(400);
		}

		requireStep(await this.fillText("Harga", listing.price), "marketplace.text.price");
		await this.engine.delay(500);

		if (isItemForm) {
			requireStep(await this.selectDropdown("Kategori", category), "marketplace.dropdown.category");
			await this.engine.delay(700);

			const condition = listing.condition || "Bekas - Baik";
			requireStep(await this.selectDropdown("Kondisi", condition), "marketplace.dropdown.condition");
			await this.engine.delay(700);
		}

		const attr = listing.attributes || {};
		const categoryForMap = getCategoryForMap(category, attr);
		const mappedFields = getMappedFields(categoryForMap, category);
		const filledFields = new Set(["Judul", "Harga", "Kategori", "Kondisi", "Deskripsi", "Lokasi"]);

		for (const fieldName of mappedFields) {
			const value = normalizeFieldValue(fieldName, listing, attr);
			if (value === undefined || value === null || value === "") continue;

			const config = FIELD_CONFIG[fieldName] || {};
			let type = config.type;
			if (isVehicleForm && fieldName === "Merek") type = "select";

			let ok = true;
			if (type === "select") ok = await this.selectDropdown(fieldName, value);
			else ok = await this.fillText(fieldName, value);

			if (isCriticalField(fieldName)) requireStep(ok, `marketplace.field.${fieldName}`);

			filledFields.add(fieldName);
			await this.engine.delay(400);
		}

		for (const [fieldName, value] of Object.entries(attr)) {
			if (filledFields.has(fieldName)) continue;
			if (value === undefined || value === null || value === "") continue;
			if (isVehicleForm && FIELD_MAP["Kendaraan"] && FIELD_MAP["Kendaraan"].includes(fieldName)) {
				continue;
			}
			if (isDuplicateAlias(fieldName)) continue;

			const config = FIELD_CONFIG[fieldName] || {};
			if (config.type === "select") await this.selectDropdown(fieldName, value);
			else await this.fillText(fieldName, value);
			await this.engine.delay(400);
		}

		if (listing.location && listing.location.trim()) {
			requireStep(await this.fillLocation(listing.location.trim()), "marketplace.location");
			await this.engine.delay(500);
		} else {
			this.logger.info("Lokasi kosong, melewati pengisian lokasi (pakai default akun).");
		}

		requireStep(await this.fillText("Deskripsi", listing.description), "marketplace.text.description");
	}

	async finalize(targetGroups = "", maxLimit = 20) {
		this.logger.info("Menyelesaikan postingan...");

		this.logger.method("TRY", "marketplace.next.onPoint");
		const nextBtn = this.page
			.locator('button, [role="button"]')
			.filter({ hasText: /Selanjutnya|Next|Berikutnya/i })
			.first();
		try {
			await nextBtn.click({ timeout: 5000 });
		} catch (_e) {
			const disabled = await nextBtn.getAttribute("aria-disabled").catch(() => null);
			const rawDisabled = await nextBtn.isDisabled().catch(() => false);
			if (disabled === "true" || rawDisabled) {
				throw new Error("Tombol Berikutnya nonaktif: form belum lengkap (cek foto terunggah + kolom wajib).");
			}
			throw new Error("Tombol Berikutnya tak bisa diklik (tak temu/timeout 5 detik).");
		}
		this.logger.method("SUCCESS", "marketplace.next.onPoint");

		await this.engine.delay(2000, 3000);

		if (targetGroups) {
			await this.selectGroups(targetGroups, maxLimit);
		}

		this.logger.info("Mempublikasikan listing ke Facebook...");
		this.logger.method("TRY", "marketplace.publish.onPoint");
		const urlBefore = this.page.url();
		const pubBtn = this.page
			.locator('button, [role="button"]')
			.filter({ hasText: /Terbitkan|Publish/i })
			.first();
		let published = false;
		try {
			await pubBtn.click({ timeout: 5000 });
			published = true;
		} catch (_e1) {
			// Lapis 2: fokus + Enter (bukan ulang klik sama)
			try {
				await pubBtn.focus({ timeout: 2000 }).catch(() => {});
				await this.page.keyboard.press("Enter");
				published = true;
				this.logger.method("SUCCESS", "marketplace.publish.focusEnter");
			} catch (_e2) {
				// Lapis 3: klik DOM langsung lewati cek actionability
				const ok = await pubBtn.evaluate((el) => {
					el.scrollIntoView({ block: "center" });
					el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
					el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
					el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
					return true;
				}).catch(() => false);
				if (ok) {
					published = true;
					this.logger.method("SUCCESS", "marketplace.publish.domClick");
				}
			}
		}
		if (!published) throw new Error("Tombol Terbitkan tak bisa diaktivasi (klik/fokus/DOM gagal).");
		this.logger.method("SUCCESS", "marketplace.publish.onPoint");

		await this.engine.delay(3000, 4000);
		// Pindah halaman setelah Publish = wajar (redirect sukses). Jangan anggap browser hancur.
		try {
			const urlAfter = this.page.url();
			if (urlAfter !== urlBefore) {
				this.logger.method("SUCCESS", "marketplace.publish.redirect", `navigasi terdeteksi`);
			}
		} catch (_e) {}
		await this.checkLimit();
		await this.engine.delay(1000, 2000);
	}

	async selectGroups(targetGroups, maxLimit = 20) {
		return selectGroupsHelper(this.page, this.engine, this.logger, targetGroups, maxLimit);
	}
}

module.exports = MarketplaceService;
