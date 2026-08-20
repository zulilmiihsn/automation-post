const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

try {
  db.prepare("BEGIN TRANSACTION").run();

  // Update category
  db.prepare("UPDATE listings SET category = 'Peralatan rumah tangga' WHERE category = 'Lain-lain'").run();

  db.prepare("COMMIT").run();
  console.log("Success! Changed 'Lain-lain' to 'Peralatan rumah tangga'.");
} catch (error) {
  db.prepare("ROLLBACK").run();
  console.error("Failed:", error);
}
