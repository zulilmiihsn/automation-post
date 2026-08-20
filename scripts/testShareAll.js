const FacebookBot = require("../src/core/bot");

async function run() {
	console.log("Memulai test viral share untuk semua akun (2 iterasi masing-masing)...");
	const accounts = ["akun_1", "akun_2", "akun_3", "akun_4", "akun_5"];
	// Gunakan URL postingan publik atau yang bisa diakses
	const testUrl = "https://web.facebook.com/share/p/1XFHREgB6u/";

	for (const acc of accounts) {
		console.log(`\n\n=== Menguji Akun: ${acc} ===`);
		const bot = new FacebookBot({
			accountName: acc,
			userDataDir: `D:\\Projects\\Automation Post\\profiles\\${acc}`
		});

		try {
			await bot.init();
			console.log(`Menjalankan sharePostToGroups untuk URL: ${testUrl}`);
			// Share ke 5 grup dengan keyword berau
			const results = await bot.sharePostToGroups(testUrl, "berau", 5);
			console.log(`Hasil share ${acc}:`, results);
		} catch (e) {
			console.error(`Error pada ${acc}:`, e.message);
		} finally {
			await bot.close();
		}
	}
}

run().catch(console.error);
