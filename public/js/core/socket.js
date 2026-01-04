/**
 * Socket Connection Module
 * Handles all socket.io communication
 */

const socket = io({
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

// Keep-alive ping
setInterval(() => {
  if (socket.connected) {
    socket.emit('ping');
  }
}, 25000);

// Re-connect on visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket.connected) {
    socket.connect();
  }
});

// Export for use in other modules
window.GameSocket = socket;
