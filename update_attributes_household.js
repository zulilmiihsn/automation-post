const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

try {
  db.prepare("BEGIN TRANSACTION").run();

  const listings = db.prepare("SELECT id, title, description FROM listings WHERE category = 'Peralatan rumah tangga'").all();
  const updateAttributes = db.prepare("UPDATE listings SET attributes = ? WHERE id = ?");

  let updatedCount = 0;
  for (const item of listings) {
    let merek = "Lainnya";
    const titleLower = item.title.toLowerCase();
    if (titleLower.includes('honda')) merek = 'Honda';
    else if (titleLower.includes('yamaha')) merek = 'Yamaha';
    else if (titleLower.includes('suzuki')) merek = 'Suzuki';
    else if (titleLower.includes('kawasaki')) merek = 'Kawasaki';

    let warna = "Lainnya";
    const warnaMatch = item.description.match(/Warna eksterior: (.*)/);
    if (warnaMatch) {
      warna = warnaMatch[1].trim();
      // validasi dengan opsi warna yg ada di fb, jika tidak cocok set 'Lainnya' atau biarkan
      // ["Hitam", "Putih", "Silver", "Abu-abu", "Merah", "Biru", "Hijau", "Kuning", "Cokelat", "Emas", "Lainnya"]
      const validColors = ["Hitam", "Putih", "Silver", "Abu-abu", "Merah", "Biru", "Hijau", "Kuning", "Cokelat", "Emas", "Lainnya"];
      if (!validColors.includes(warna)) {
        warna = "Lainnya";
      }
    }

    const attrs = {
      "Merek": merek,
      "Warna": warna
    };

    updateAttributes.run(JSON.stringify(attrs), item.id);
    updatedCount++;
  }

  db.prepare("COMMIT").run();
  console.log(`Success! Updated attributes for ${updatedCount} listings.`);
} catch (error) {
  db.prepare("ROLLBACK").run();
  console.error("Failed:", error);
}
