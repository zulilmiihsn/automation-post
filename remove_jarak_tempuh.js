const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

try {
  db.prepare("BEGIN TRANSACTION").run();

  const listings = db.prepare("SELECT id, description FROM listings WHERE category = 'Lain-lain'").all();
  const updateDesc = db.prepare("UPDATE listings SET description = ? WHERE id = ?");

  let updatedCount = 0;
  for (const item of listings) {
    // Regex to remove the line "Jarak Tempuh: [value]"
    if (item.description.includes('Jarak Tempuh:')) {
      const newDesc = item.description.replace(/Jarak Tempuh:.*\n?/g, '');
      updateDesc.run(newDesc, item.id);
      updatedCount++;
    }
  }

  db.prepare("COMMIT").run();
  console.log(`Success! Removed Jarak Tempuh from ${updatedCount} listings.`);
} catch (error) {
  db.prepare("ROLLBACK").run();
  console.error("Failed:", error);
}
