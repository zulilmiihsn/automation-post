const BrowserManager = require('../src/core/browserManager');
const ScraperService = require('../src/services/scraperService');
const DataService = require('../src/web/services/dataService');
const Logger = require('../src/utils/logger');
require('dotenv').config();

const logger = new Logger('SCRAPER');

async function scrapeSinglePost() {
    const url = process.argv[2];
    if (!url) {
        logger.error('Usage: node scraper_fb.js <url>');
        process.exit(1);
    }

    const profileDir = process.env.SCRAPER_PROFILE_DIR;
    if (!profileDir) {
        logger.error('SCRAPER_PROFILE_DIR belum diset. Pilih Akun Scraper dari dashboard.');
        process.exit(1);
    }
    logger.method('SUCCESS', 'scraper.profile.selected', `dir=${profileDir}`);

    const browser = new BrowserManager({ 
        accountName: 'Scraper',
        userDataDir: profileDir
    });

    // Graceful Shutdown Handler
    async function gracefulShutdown(signal) {
        logger.info(`Menerima sinyal ${signal}. Menutup browser...`);
        try {
            await browser.close();
        } catch (e) {}
        process.exit(0);
    }
    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);

    try {
        const isHeadless = process.env.HEADLESS === "true";
        const page = await browser.init({ headless: isHeadless });
        const scraper = new ScraperService(page, 'BOT');
        
        logger.info(`Membuka link Facebook...`);
        const result = await scraper.scrapeListing(url);

        if (result) {
            const groupId = process.env.SCRAPER_GROUP_ID ? parseInt(process.env.SCRAPER_GROUP_ID, 10) : null;
            await DataService.addListing({
                ...result,
                isActive: true
            }, groupId);
            logger.success('Berhasil! Data sudah masuk ke Database.');
        }
    } catch (err) {
        logger.error('Gagal mengambil data', err);
    } finally {
        await browser.close();
    }
}

scrapeSinglePost();
