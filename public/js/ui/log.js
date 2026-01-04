/**
 * Game Log Module
 * Displays game messages and events
 */

const GameLog = {
  container: null,
  maxItems: 5,
  autoHideDelay: 6000,
  
  init() {
    this.container = document.getElementById('gameLog');
  },
  
  add(msg, type = 'info') {
    if (!this.container) this.init();
    if (!this.container) return;
    
    const item = document.createElement('div');
    item.className = 'log-item ' + type;
    item.textContent = msg;
    
    // Limit number of items
    while (this.container.children.length >= this.maxItems) {
      this.container.removeChild(this.container.firstChild);
    }
    
    this.container.appendChild(item);
    
    // Auto-hide after delay
    setTimeout(() => {
      if (item.parentNode === this.container) {
        item.remove();
      }
    }, this.autoHideDelay);
  },
  
  clear() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  },
  
  // Convenience methods
  info(msg) { this.add(msg, 'info'); },
  call(msg) { this.add(msg, 'call'); },
  pass(msg) { this.add(msg, 'pass'); }
};

// Export
window.GameLog = GameLog;
