function parseMemberCount(text) {
	if (!text) return 0;
	const clean = String(text).toLowerCase().replace(/,/g, ".");
	let num = parseFloat(clean.match(/[0-9.]+/)?.[0] || 0);

	if (clean.includes("jt") || clean.includes("m") || clean.includes("million"))
		num *= 1000000;
	else if (clean.includes("rb") || clean.includes("k") || clean.includes("thousand"))
		num *= 1000;

	return num;
}

function parseGroupNames(targetGroups) {
	if (!targetGroups) return [];
	try {
		if (Array.isArray(targetGroups)) return targetGroups;
		if (typeof targetGroups === "string") {
			const t = targetGroups.trim();
			if (t.startsWith("[") && t.endsWith("]")) return JSON.parse(t);
			return t
				.split(",")
				.map((g) => g.trim())
				.filter((g) => g);
		}
	} catch (_e) {
		return String(targetGroups)
			.split(",")
			.map((g) => g.trim())
			.filter((g) => g);
	}
	return [];
}

async function discoverGroups(page, engine, logger, groupNames) {
	const discovered = new Map();

	for (let i = 0; i < 10; i++) {
		const items = await page
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

				const matches = groupNames.some((kw) =>
					name.toLowerCase().includes(kw.toLowerCase()),
				);

				if (matches && !discovered.has(name)) {
					discovered.set(name, {
						name,
						members: parseMemberCount(info),
						rawText: info,
					});
				}
			}
		}

		await page.evaluate(() => {
			const modal = document.querySelector(
				'div[role="dialog"] [style*="overflow-y: auto"], div[role="dialog"] .scrollable',
			);
			if (modal) modal.scrollBy(0, 1000);
			else window.scrollBy(0, 1000);
		});
		await engine.delay(200, 300);
	}

	return discovered;
}

async function selectGroups(page, engine, logger, targetGroups, maxLimit = 20) {
	const groupNames = parseGroupNames(targetGroups);
	if (groupNames.length === 0) return { selected: 0, total: 0 };

	logger.info(`Fase Penemuan: Mencari grup dengan kata kunci: ${groupNames.join(", ")}`);

	const discoveredGroups = await discoverGroups(page, engine, logger, groupNames);

	const sorted = Array.from(discoveredGroups.values())
		.sort((a, b) => b.members - a.members)
		.slice(0, maxLimit);

	if (sorted.length === 0) {
		logger.warn("Tidak ada grup yang ditemukan sesuai keyword.");
		return { selected: 0, total: 0 };
	}

	logger.success(`Ditemukan ${discoveredGroups.size} grup. Memilih Top ${sorted.length} terbesar...`);

	let selectedCount = 0;
	for (const group of sorted) {
		try {
			let _found = false;
			for (let retry = 0; retry < 2; retry++) {
				const item = page
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
						logger.success(`[${selectedCount}/${sorted.length}] Terpilih: ${group.name} (${group.rawText})`);
					} else {
						selectedCount++;
					}
					_found = true;
					break;
				}

				await page.evaluate(() => {
					const modal = document.querySelector(
						'div[role="dialog"] [style*="overflow-y: auto"]',
					);
					if (modal) modal.scrollBy(0, 800);
				});
				await engine.delay(100, 200);
			}
		} catch (_err) {}
	}

	logger.info(`Selesai memilih grup. Total terpilih: ${selectedCount}`);
	return { selected: selectedCount, total: sorted.length };
}

module.exports = {
	parseMemberCount,
	parseGroupNames,
	discoverGroups,
	selectGroups,
};
