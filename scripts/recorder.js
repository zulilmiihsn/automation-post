const BrowserManager = require('../src/core/browserManager');
const DataService = require('../src/web/services/dataService');
const Logger = require('../src/utils/logger');
const path = require('node:path');

const logger = new Logger('RECORDER');

async function startRecording() {
    // 1. Dapatkan akun pertama yang aktif dan terhubung
    const accounts = await DataService.getAccounts();
    const activeAccount = accounts.find(a => a.linked && a.isActive);

    if (!activeAccount) {
        logger.error('Tidak ada akun aktif yang terhubung. Harap login dulu di Dashboard.');
        process.exit(1);
    }

    const profileDir = path.isAbsolute(activeAccount.profile) 
        ? activeAccount.profile 
        : path.join(__dirname, '..', activeAccount.profile);

    logger.info(`Memulai Recorder dengan akun: ${activeAccount.fbName || activeAccount.name}`);
    logger.info('Browser akan terbuka. Silakan lakukan aksi "Sundul" di browser.');
    logger.info('Semua elemen yang diklik akan direkam di console ini.');

    const browser = new BrowserManager({
        accountName: 'Recorder',
        userDataDir: profileDir
    });

    try {
        const page = await browser.init({ headless: false });

        // 2. Expose function ke browser untuk menerima klik
        await page.exposeFunction('onUserClick', (data) => {
            logger.success(`[USER CLICK] => ${data.selector}`);
            if (data.text) {
                logger.info(`  └─ Text: "${data.text}"`);
            }
            if (data.ariaLabel) {
                logger.info(`  └─ Aria-label: "${data.ariaLabel}"`);
            }
            if (data.role) {
                logger.info(`  └─ Role: "${data.role}"`);
            }
        });

        // 3. Inject listener setiap kali halaman dimuat/navigasi
        await page.addInitScript(() => {
            document.addEventListener('click', (e) => {
                const el = e.target;
                
                // Coba buat selector CSS sederhana
                let selector = el.tagName.toLowerCase();
                if (el.id) {
                    selector += `#${el.id}`;
                } else if (el.className && typeof el.className === 'string') {
                    selector += `.${el.className.split(' ').join('.')}`;
                }

                // Kumpulkan data tambahan
                const data = {
                    selector,
                    text: el.innerText ? el.innerText.trim().substring(0, 50) : '',
                    ariaLabel: el.getAttribute('aria-label') || (el.closest && el.closest('[aria-label]') ? el.closest('[aria-label]').getAttribute('aria-label') : ''),
                    role: el.getAttribute('role') || (el.closest && el.closest('[role]') ? el.closest('[role]').getAttribute('role') : '')
                };

                // Kirim ke Node
                window.onUserClick(data);
            }, true); // useCapture true supaya menangkap sebelum dihentikan oleh FB
        });

        // 4. Buka halaman target
        const targetUrl = 'https://www.facebook.com/marketplace/you/selling';
        logger.info(`Membuka URL: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

        logger.info('✅ MEREKAM... (Tekan Ctrl+C di terminal untuk berhenti)');

        // Biarkan tetap hidup sampai user Ctrl+C
        await new Promise(() => {}); 

    } catch (err) {
        logger.error('Kesalahan Recorder:', err);
    }
}

startRecording();
