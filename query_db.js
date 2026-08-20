const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:", tables);

if (tables.some(t => t.name === 'listings')) {
  console.log("Listings:", db.prepare("SELECT title, category FROM listings LIMIT 10").all());
} else if (tables.some(t => t.name === 'products')) {
  console.log("Products:", db.prepare("SELECT title, category FROM products LIMIT 10").all());
}
