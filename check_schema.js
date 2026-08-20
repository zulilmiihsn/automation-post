const Database = require('better-sqlite3');
const db = new Database('data/database.sqlite');

const tables = ['app_groups', 'accounts', 'listings', 'group_accounts'];
for (const table of tables) {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    console.log(`Table ${table}:`, info.map(c => c.name));
  } catch (e) {
    console.log(`Error reading ${table}`);
  }
}
