async function uploadMedia(page, engine, logger, photoData) {
	if (!photoData) {
		logger.method("SKIP", "marketplace.media.inputFiles", "photoData kosong");
		return;
	}

	const photoFiles = engine.resolvePhotoPaths(
		Array.isArray(photoData) ? photoData : [photoData],
	);
	if (photoFiles.length === 0) {
		logger.method("SKIP", "marketplace.media.inputFiles", "tidak ada file valid");
		const given = Array.isArray(photoData) ? photoData.length : 1;
		if (given > 0) {
			throw new Error(`Foto listing tak ada di disk (${given} path, 0 valid). Perbaiki foto listing dulu.`);
		}
		return;
	}

	logger.info(`Mengunggah ${photoFiles.length} foto...`);

	await engine.withRetry(
		async () => {
			logger.method("TRY", "marketplace.media.inputFiles", `count=${photoFiles.length}`);
			const fileInput = await page
				.locator('input[type="file"][accept*="image"]')
				.first();
			await fileInput.setInputFiles(photoFiles);
			logger.method("SUCCESS", "marketplace.media.inputFiles", `count=${photoFiles.length}`);
		},
		3,
		5000,
	);

	await engine.delay(2000, 3000);

	const uploaded = await engine
		.waitForCondition(async () => {
			return await page.evaluate(() => {
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
		logger.warn("Batas waktu unggah foto habis.");
		logger.method("FAIL", "marketplace.media.previewReady");
	} else {
		logger.info("Foto berhasil diunggah.");
		logger.method("SUCCESS", "marketplace.media.previewReady");
	}
}

module.exports = { uploadMedia };
