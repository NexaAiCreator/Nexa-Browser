const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, 'nexa_storage.json');

function loadDB() {
    if (!fs.existsSync(DB_FILE)) return { bookmarks: [], history: [], settings: { theme: 'dark', ai_model: 'gpt-4' } };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
    getBookmarks: () => {
        const db = loadDB();
        return db.bookmarks;
    },
    addBookmark: (url, title) => {
        const db = loadDB();
        db.bookmarks.push({ url, title, date: new Date().toISOString() });
        saveDB(db);
        return { status: 'success' };
    },
    getHistory: () => {
        const db = loadDB();
        return db.history;
    },
    addHistory: (url, title) => {
        const db = loadDB();
        db.history.unshift({ url, title, timestamp: new Date().toISOString() });
        db.history = db.history.slice(0, 100); // Keep last 100
        saveDB(db);
        return { status: 'success' };
    },
    getSettings: () => {
        const db = loadDB();
        return db.settings;
    },
    updateSetting: (key, value) => {
        const db = loadDB();
        db.settings[key] = value;
        saveDB(db);
        return { status: 'success' };
    }
};
