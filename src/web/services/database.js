const fs = require("fs-extra");
const path = require("node:path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.NODE_ENV === "test"
	? path.join(__dirname, "../../../data/test_database.sqlite")
	: path.join(__dirname, "../../../data/database.sqlite");

fs.ensureDirSync(path.dirname(DB_PATH));

const db = new Database(DB_PATH, { verbose: null });
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

module.exports = { db, DB_PATH };
