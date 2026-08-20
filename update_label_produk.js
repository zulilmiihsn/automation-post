const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

try {
  db.prepare("BEGIN TRANSACTION").run();

  const listings = db.prepare("SELECT id, attributes FROM listings WHERE category = 'Peralatan rumah tangga'").all();
  const updateAttributes = db.prepare("UPDATE listings SET attributes = ? WHERE id = ?");

  let updatedCount = 0;
  for (const item of listings) {
    if (item.attributes) {
      let attrs = JSON.parse(item.attributes);
      if (attrs.Merek) {
        attrs["Label produk"] = attrs.Merek;
        delete attrs.Merek;
        updateAttributes.run(JSON.stringify(attrs), item.id);
        updatedCount++;
      }
    }
  }

  db.prepare("COMMIT").run();
  console.log(`Success! Updated attributes to use Label produk for ${updatedCount} listings.`);
} catch (error) {
  db.prepare("ROLLBACK").run();
  console.error("Failed:", error);
}
