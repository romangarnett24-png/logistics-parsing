const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Determine correct AppData/home directory for cross-platform support, specially important when compiled to binary
const appDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.local/share');
const dbDir = path.join(appDataPath, 'track-checker');

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.join(dbDir, 'history.db'));

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS tracking_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    carrier TEXT NOT NULL,
    track_number TEXT NOT NULL,
    status_text TEXT,
    history_json TEXT,
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_delivered INTEGER DEFAULT 0,
    UNIQUE(carrier, track_number)
  )
`);

const deliveredKeywords = ['доставлен', 'вручен', 'получен', 'выдан'];

function isDelivered(statusText) {
    if (!statusText) return false;
    const lowerStatus = statusText.toLowerCase();
    return deliveredKeywords.some(keyword => lowerStatus.includes(keyword));
}

function addOrUpdateRecord(carrier, trackNumber, statusText, historyArray) {
    const delivered = isDelivered(statusText) ? 1 : 0;
    const historyStr = JSON.stringify(historyArray || []);

    const stmt = db.prepare(`
        INSERT INTO tracking_history (carrier, track_number, status_text, history_json, is_delivered, last_update)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(carrier, track_number) DO UPDATE SET
            status_text = excluded.status_text,
            history_json = excluded.history_json,
            is_delivered = excluded.is_delivered,
            last_update = CURRENT_TIMESTAMP
    `);

    stmt.run(carrier, trackNumber, statusText, historyStr, delivered);
}

function getAllRecords() {
    const rows = db.prepare('SELECT * FROM tracking_history ORDER BY last_update DESC').all();
    return rows.map(row => ({
        ...row,
        history: JSON.parse(row.history_json || '[]'),
        is_delivered: Boolean(row.is_delivered)
    }));
}

function getUndeliveredRecords() {
    return db.prepare('SELECT carrier, track_number FROM tracking_history WHERE is_delivered = 0').all();
}

function deleteRecord(carrier, trackNumber) {
    db.prepare('DELETE FROM tracking_history WHERE carrier = ? AND track_number = ?').run(carrier, trackNumber);
}

module.exports = {
    addOrUpdateRecord,
    getAllRecords,
    getUndeliveredRecords,
    deleteRecord,
    isDelivered
};
