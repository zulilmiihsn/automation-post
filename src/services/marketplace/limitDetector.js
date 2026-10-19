const { SELECTORS } = require("../../core/constants");

async function checkLimit(page, engine, logger) {
	await engine.delay(1000, 2500);

	let restriction = null;
	restriction = await page.evaluate((indicators) => {
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

		const bodyText = (document.body.innerText || "").toLowerCase();
		for (const s of indicators) {
			if (s.length >= 10 && bodyText.includes(s.toLowerCase())) return s;
		}

		return null;
		}, SELECTORS.RESTRICTION_INDICATORS).catch(async (e) => {
			// Konteks hancur karena navigasi (misal redirect sukses Publish) = bukan error.
			if (/destroyed|detached|closed/i.test(e.message || "")) {
				await engine.delay(2000, 3000);
				try {
					return await page.evaluate((indicators) => {
						const bodyText = (document.body.innerText || "").toLowerCase();
						for (const s of indicators) {
							if (s.length >= 10 && bodyText.includes(s.toLowerCase())) return s;
						}
						return null;
					}, SELECTORS.RESTRICTION_INDICATORS);
				} catch (_e2) {
					return null;
				}
			}
			throw e;
		});

	if (restriction) {
		logger.warn(`STOP: Bot mendeteksi pembatasan: "${restriction}"`);
		throw new Error("ACCOUNT_LIMIT_REACHED");
	}
}

module.exports = { checkLimit };
