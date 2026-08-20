const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');
db.prepare("UPDATE listings SET isActive = 1").run();
console.log("All listings set to isActive = 1");
