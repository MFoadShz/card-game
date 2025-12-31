// game/Storage.js
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/sessions.json');
const ROOMS_FILE = path.join(__dirname, '../data/rooms.json');

// اطمینان از وجود پوشه data
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

class Storage {
    constructor() {
        this.sessions = this.load(DATA_FILE);
        this.roomsBackup = this.load(ROOMS_FILE);
        
        // ذخیره خودکار هر 30 ثانیه
        setInterval(() => this.saveAll(), 30000);
    }

    load(file) {
        try {
            if (fs.existsSync(file)) {
                return JSON.parse(fs.readFileSync(file, 'utf8'));
            }
        } catch (e) {
            console.error('Storage load error:', e);
        }
        return {};
    }

    save(file, data) {
        try {
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Storage save error:', e);
        }
    }

    saveAll() {
        this.save(DATA_FILE, this.sessions);
    }

    // --- Session Management ---
    
    createSession(deviceId, playerName) {
        const sessionId = this.generateId();
        this.sessions[deviceId] = {
            sessionId,
            playerName,
            roomCode: null,
            playerIndex: null,
            lastSeen: Date.now(),
            created: Date.now()
        };
        this.saveAll();
        return sessionId;
    }

    getSession(deviceId) {
        const session = this.sessions[deviceId];
        if (session) {
            // پاک کردن سشن‌های قدیمی‌تر از 24 ساعت
            if (Date.now() - session.lastSeen > 24 * 60 * 60 * 1000) {
                delete this.sessions[deviceId];
                return null;
            }
            session.lastSeen = Date.now();
        }
        return session;
    }

    updateSession(deviceId, updates) {
        if (this.sessions[deviceId]) {
            Object.assign(this.sessions[deviceId], updates, { lastSeen: Date.now() });
            this.saveAll();
        }
    }

    clearSessionRoom(deviceId) {
        if (this.sessions[deviceId]) {
            this.sessions[deviceId].roomCode = null;
            this.sessions[deviceId].playerIndex = null;
            this.saveAll();
        }
    }

    // --- Cleanup ---
    
    cleanupOldSessions() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 ساعت
        
        Object.keys(this.sessions).forEach(deviceId => {
            if (now - this.sessions[deviceId].lastSeen > maxAge) {
                delete this.sessions[deviceId];
            }
        });
        this.saveAll();
    }

    generateId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }
}

module.exports = new Storage();