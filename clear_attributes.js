const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

try {
  db.prepare("BEGIN TRANSACTION").run();

  db.prepare("UPDATE listings SET attributes = '{}' WHERE category = 'Lain-lain'").run();

  db.prepare("COMMIT").run();
  console.log("Success! Cleared attributes for 'Lain-lain' listings.");
} catch (error) {
  db.prepare("ROLLBACK").run();
  console.error("Failed:", error);
}
