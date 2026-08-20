const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

try {
  db.prepare("BEGIN TRANSACTION").run();

  // Matikan semua listing yang BUKAN Lain-lain
  db.prepare("UPDATE listings SET isActive = 0 WHERE category != 'Lain-lain'").run();

  // Pastikan yang Lain-lain tetap nyala
  db.prepare("UPDATE listings SET isActive = 1 WHERE category = 'Lain-lain'").run();

  db.prepare("COMMIT").run();
  console.log("Success! Only 'Lain-lain' listings are active now.");
} catch (error) {
  db.prepare("ROLLBACK").run();
  console.error("Failed:", error);
}
