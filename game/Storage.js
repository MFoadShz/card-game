// game/Storage.js
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');

// اطمینان از وجود پوشه
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Storage {
    constructor() {
        this.sessions = this.load(DATA_FILE);
        
        // ذخیره خودکار هر 30 ثانیه
        setInterval(() => this.saveAll(), 30000);
        
        // پاکسازی سشن‌های قدیمی در شروع
        this.cleanupOldSessions();
    }

    load(file) {
        try {
            if (fs.existsSync(file)) {
                const data = fs.readFileSync(file, 'utf8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('[Storage] Load error:', e.message);
        }
        return {};
    }

    save(file, data) {
        try {
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('[Storage] Save error:', e.message);
        }
    }

    saveAll() {
        this.save(DATA_FILE, this.sessions);
    }

    createSession(deviceId, playerName) {
        const sessionId = this.generateId();
        this.sessions[deviceId] = {
            sessionId,
            playerName: playerName || '',
            roomCode: null,
            playerIndex: null,
            lastSeen: Date.now(),
            created: Date.now()
        };
        this.saveAll();
        console.log(`[Session] Created for device: ${deviceId.substring(0, 10)}...`);
        return sessionId;
    }

    getSession(deviceId) {
        const session = this.sessions[deviceId];
        if (session) {
            // سشن‌های قدیمی‌تر از 24 ساعت
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

    cleanupOldSessions() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000;
        let cleaned = 0;
        
        Object.keys(this.sessions).forEach(deviceId => {
            if (now - this.sessions[deviceId].lastSeen > maxAge) {
                delete this.sessions[deviceId];
                cleaned++;
            }
        });
        
        if (cleaned > 0) {
            console.log(`[Storage] Cleaned ${cleaned} old sessions`);
            this.saveAll();
        }
    }

    generateId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }
}

module.exports = new Storage();