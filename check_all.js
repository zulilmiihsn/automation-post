const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');
console.log(db.prepare("SELECT id, title, category, isActive, postMarketplace FROM listings").all());
