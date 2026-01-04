/**
 * Session Management Module
 * Handles device ID and session persistence
 */

const DEVICE_ID_KEY = 'shelem_device_id';
const SESSION_KEY = 'shelem_session';

const Session = {
  getDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + 
                 '_' + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  },
  
  save(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...data,
      savedAt: Date.now()
    }));
  },
  
  get() {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (data) {
        const session = JSON.parse(data);
        // Expire after 24 hours
        if (Date.now() - session.savedAt > 24 * 60 * 60 * 1000) {
          this.clear();
          return null;
        }
        return session;
      }
    } catch (e) {
      console.error('Session parse error:', e);
    }
    return null;
  },
  
  clear() {
    localStorage.removeItem(SESSION_KEY);
  }
};

// Export
window.Session = Session;
