const Database = require('better-sqlite3');
const fs = require('fs-extra');
const { ensureSchema } = require('../src/web/services/databaseSchema');
const { runMigrations } = require('../src/web/services/dataMigrations');

describe('database schema and versioned migrations', () => {
    test('fresh schema initializes and migration runs idempotently', () => {
        const db = new Database(':memory:');
        const legacyFiles = {
            accounts: 'test-fixtures/no-accounts-file.json',
            listings: 'test-fixtures/no-listings-file.json',
        };

        try {
            ensureSchema(db);
            runMigrations(db, fs, legacyFiles);
            runMigrations(db, fs, legacyFiles);

            const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
            expect(versions.map(row => row.version)).toEqual([1, 2, 3, 4, 5]);
            expect(db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get('automation_events')).toBeDefined();
            expect(db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get('automation_runs')).toBeDefined();
            expect(db.pragma('table_info(automation_events)').some(column => column.name === 'run_id')).toBe(true);
            expect(db.pragma('foreign_key_check')).toEqual([]);
        } finally {
            db.close();
        }
    });
});
