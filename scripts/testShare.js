const FacebookBot = require("../src/core/bot");

async function run() {
	console.log("Memulai test viral share...");
	const bot = new FacebookBot({
		accountName: "Test_Viral_Share",
		userDataDir: "D:\\Projects\\Automation Post\\profiles\\akun_1"
	});

	await bot.init();
	
	// Gunakan salah satu URL yang sudah ada di database dari log user
	// Misalnya: https://web.facebook.com/share/p/1XFHREgB6u/
	const testUrl = "https://web.facebook.com/share/p/1XFHREgB6u/";
	
	console.log(`Menjalankan sharePostToGroups untuk URL: ${testUrl}`);
	
	// Share ke 1 grup dengan keyword berau
	const results = await bot.sharePostToGroups(testUrl, "berau", 1);
	
	console.log("Hasil share:", results);
	
	await bot.close();
}

run().catch(console.error);
