const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');
const listing = db.prepare("SELECT * FROM listings WHERE category = 'Kendaraan' LIMIT 1").get();
console.log("Listing:", listing);
