// ===== UI Helper Functions =====

const UI = {
  // Create playing card HTML
  card(card, size = '', extraClass = '') {
    const color = ['♥', '♦'].includes(card.s) ? 'red' : 'black';
    const sizeClass = size === 'small' ? 'sm' : '';
    return `
      <div class="playing-card ${color} ${sizeClass} ${extraClass}">
        <div class="corner corner-top">
          <span class="rank">${card.v}</span>
          <span class="suit-icon">${card.s}</span>
        </div>
        <span class="center-suit">${card.s}</span>
        <div class="corner corner-bottom">
          <span class="rank">${card.v}</span>
          <span class="suit-icon">${card.s}</span>
        </div>
      </div>
    `;
  },

  // Create card back HTML
  cardBack(sizeClass = '') {
    return `<div class="card-back ${sizeClass}"></div>`;
  },

  // Show element
  show(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) {
      el.classList.remove('hidden');
      if (el.tagName === 'DIALOG') el.showModal();
    }
  },

  // Hide element
  hide(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) {
      el.classList.add('hidden');
      if (el.tagName === 'DIALOG') el.close();
    }
  },

  // Toggle class
  toggle(el, className, condition) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.classList.toggle(className, condition);
  },

  // Set text content
  text(el, content) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.textContent = content;
  },

  // Set innerHTML
  html(el, content) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.innerHTML = content;
  },

  // Add log item
  addLog(msg, type = 'info') {
    const container = document.getElementById('gameLog');
    if (!container) return;
    
    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    item.textContent = msg;
    
    if (container.children.length >= 5) {
      container.removeChild(container.firstChild);
    }
    
    container.appendChild(item);
    setTimeout(() => item.remove(), 8000);
  },

  // Create player slot
  playerSlot(player, index, myIndex) {
    const classes = ['bg-base-100 p-3 rounded-lg text-center border-2 transition-all'];
    
    if (player) {
      classes.push('border-primary');
      if (player.ready) classes.push('bg-primary/20');
      if (index === myIndex) classes.push('shadow-[0_0_15px_rgba(78,205,196,0.3)]');
      if (!player.connected) classes.push('opacity-50');
    } else {
      classes.push('border-transparent');
    }

    const name = player?.name || `بازیکن ${index + 1}`;
    const status = player ? (player.ready ? '✅' : '⏳') : '🎴';
    const hostBadge = player?.isHost ? ' 👑' : '';

    return `
      <div class="${classes.join(' ')}">
        <div class="font-bold">${name}${hostBadge}</div>
        <div class="text-xs opacity-60">${status}</div>
      </div>
    `;
  },

  // Get relative position for opponents
  getRelativePosition(playerIndex, myIndex) {
    const positions = ['bottom', 'right', 'top', 'left'];
    const relIndex = (playerIndex - myIndex + 4) % 4;
    return positions[relIndex];
  },

  // Calculate hand card styles
  getHandCardStyle(index, total, cardWidth) {
    const totalAngle = Math.min(55, 4 + total * 4);
    const angleStep = total > 1 ? totalAngle / (total - 1) : 0;
    const angle = -totalAngle / 2 + index * angleStep;
    const fanRadius = Math.max(280, 400 - total * 8);
    const height = Math.round(cardWidth * 1.45);

    return {
      '--angle': `${angle}deg`,
      '--fan-radius': `${fanRadius}px`,
      width: `${cardWidth}px`,
      height: `${height}px`,
      zIndex: index + 1
    };
  },

  // Format style object to string
  styleString(styleObj) {
    return Object.entries(styleObj)
      .map(([k, v]) => `${k}:${v}`)
      .join(';');
  },

  // Timer display
  updateTimer(seconds) {
    const el = document.getElementById('turnTimer');
    if (!el) return;

    el.textContent = `⏱️ ${seconds}`;
    el.classList.remove('hidden', 'warning', 'critical');

    if (seconds <= 5) {
      el.classList.add('critical');
    } else if (seconds <= 10) {
      el.classList.add('warning');
    }
  },

  hideTimer() {
    const el = document.getElementById('turnTimer');
    if (el) el.classList.add('hidden');
  },

  // Toast notification
  toast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgClass = {
      info: 'alert-info',
      success: 'alert-success', 
      error: 'alert-error',
      warning: 'alert-warning'
    }[type] || 'alert-info';

    toast.className = `alert ${bgClass} fixed bottom-4 left-4 right-4 z-[1000] animate-fly-up`;
    toast.innerHTML = `<span>${message}</span>`;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  // Countdown display
  showCountdown(seconds, text = 'دست بعدی') {
    let el = document.getElementById('nextMatchCountdown');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nextMatchCountdown';
      el.className = 'fixed bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2 ' +
                     'bg-base-300 p-6 rounded-2xl text-center z-[200] shadow-xl';
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div class="text-sm opacity-70 mb-1">${text}</div>
      <div class="text-3xl font-bold text-primary">${seconds}</div>
    `;
  },

  hideCountdown() {
    const el = document.getElementById('nextMatchCountdown');
    if (el) el.remove();
  },

  // Connection overlay
  showConnectionLost() {
    const existing = document.getElementById('connectionLost');
    if (existing) return;

    const overlay = document.createElement('div');
    overlay.id = 'connectionLost';
    overlay.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[300]';
    overlay.innerHTML = `
      <div class="bg-base-200 p-6 rounded-2xl text-center">
        <div class="loading loading-spinner loading-lg text-primary mb-4"></div>
        <p>در حال اتصال مجدد...</p>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  hideConnectionLost() {
    const el = document.getElementById('connectionLost');
    if (el) el.remove();
  },

  // Reconnect prompt
  showReconnectPrompt(roomCode, playerName, onReconnect, onCancel) {
    const existing = document.getElementById('reconnectPrompt');
    if (existing) existing.remove();

    const prompt = document.createElement('div');
    prompt.id = 'reconnectPrompt';
    prompt.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[300]';
    prompt.innerHTML = `
      <div class="bg-base-200 p-6 rounded-2xl text-center max-w-xs">
        <h3 class="text-lg font-bold mb-2">🎮 بازی فعال</h3>
        <p class="text-sm opacity-70 mb-4">
          شما در اتاق <strong class="text-primary">${roomCode}</strong> 
          با نام <strong class="text-primary">${playerName}</strong> هستید
        </p>
        <div class="space-y-2">
          <button class="btn btn-primary btn-block" id="btnReconnect">بازگشت به بازی</button>
          <button class="btn btn-ghost btn-block" id="btnCancel">شروع جدید</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(prompt);
    
    prompt.querySelector('#btnReconnect').onclick = onReconnect;
    prompt.querySelector('#btnCancel').onclick = onCancel;
  },

  hideReconnectPrompt() {
    const el = document.getElementById('reconnectPrompt');
    if (el) el.remove();
  }
};

// Export for use in app.js
window.UI = UI;