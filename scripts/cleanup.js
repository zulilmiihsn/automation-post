const fs = require('fs-extra');
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '../data/database.sqlite'));
const scrapedDir = path.join(__dirname, '../assets/scraped');

async function cleanupOrphanedPhotos() {
    console.log('🔍 Memulai pembersihan file sampah (Orphaned Assets)...');
    
    try {
        // 1. Ambil semua file yang ada di folder
        if (!fs.existsSync(scrapedDir)) {
            console.log('❌ Folder scraped tidak ditemukan.');
            return;
        }
        
        const filesOnDisk = fs.readdirSync(scrapedDir);
        console.log(`📂 Total file di folder: ${filesOnDisk.length}`);

        // 2. Ambil semua path foto yang ada di database
        const rows = db.prepare('SELECT photos FROM listings').all();
        const activePhotos = new Set();
        
        rows.forEach(row => {
            if (row.photos) {
                const photos = JSON.parse(row.photos);
                photos.forEach(p => {
                    // Ambil nama filenya saja
                    activePhotos.add(path.basename(p));
                });
            }
        });
        console.log(`✅ Total file aktif di database: ${activePhotos.size}`);

        // 3. Bandingkan dan hapus yang tidak ada di database
        let deletedCount = 0;
        filesOnDisk.forEach(file => {
            if (!activePhotos.has(file)) {
                fs.unlinkSync(path.join(scrapedDir, file));
                deletedCount++;
            }
        });

        console.log(`\n✨ SELESAI!`);
        console.log(`🔥 Berhasil membasmi ${deletedCount} file sampah.`);
        
    } catch (err) {
        console.error('❌ Error pas bersih-bersih:', err.message);
    } finally {
        db.close();
    }
}

cleanupOrphanedPhotos();
