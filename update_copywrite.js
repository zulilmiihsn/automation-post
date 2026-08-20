const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

try {
  db.prepare("BEGIN TRANSACTION").run();

  const listings = db.prepare("SELECT id, title, description, price FROM listings WHERE category = 'Lain-lain'").all();
  const updateListing = db.prepare("UPDATE listings SET title = ?, description = ? WHERE id = ?");

  let updatedCount = 0;
  for (const item of listings) {
    // Basic info extraction
    const origTitle = item.title.replace(/Bismillah(\.\.\.)? /i, '').trim();
    let specs = '';
    const specsMatch = item.description.match(/Spesifikasi:\n([\s\S]*)$/);
    if (specsMatch) {
      specs = specsMatch[1].trim();
    }
    
    // New Title
    const newTitle = `[READY BERAU] ${origTitle} - Mulus Siap Pakai`;

    // New Description
    const newDesc = `Masuk lagi nih bosku! 🔥
${origTitle}

Kondisi super istimewa, mesin halus no rembes, bukan motor capek. Body rapi, siap gas keliling Tanjung Redeb atau buat kerja harian!

✅ Surat-surat aman & lengkap
✅ Mesin & CVT/Rantai sehat
✅ Kelistrikan normal semua

Harga Rp ${new Intl.NumberFormat('id-ID').format(item.price)}, nego santai sambil ngopi di lokasi (Berau). 
Jangan sampai keduluan, bosku! Langsung inbox atau pantau unitnya sekarang juga.

====================
Spesifikasi Singkat:
${specs}
====================`;

    updateListing.run(newTitle, newDesc, item.id);
    updatedCount++;
  }

  db.prepare("COMMIT").run();
  console.log(`Success! Updated copywrite for ${updatedCount} listings.`);
} catch (error) {
  db.prepare("ROLLBACK").run();
  console.error("Failed:", error);
}
