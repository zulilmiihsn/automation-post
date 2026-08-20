const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');
const listings = db.prepare("SELECT id, title, description FROM listings WHERE category = 'Lain-lain'").all();
console.log(JSON.stringify(listings, null, 2));
