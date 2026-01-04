/**
 * Timer Module
 * Handles turn timer UI
 */

const Timer = {
  interval: null,
  remaining: 30,
  element: null,
  
  init() {
    this.element = document.getElementById('turnTimer');
  },
  
  start(duration) {
    this.stop();
    this.remaining = Math.ceil(duration / 1000);
    this.update();
    
    this.interval = setInterval(() => {
      this.remaining--;
      this.update();
      
      if (this.remaining <= 0) {
        this.stop();
      }
    }, 1000);
  },
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    if (this.element) {
      this.element.style.display = 'none';
    }
  },
  
  update() {
    if (!this.element) this.init();
    if (!this.element) return;
    
    const state = window.GameState;
    if (!state?.state || !state.isMyTurn || state.isDealing) {
      this.element.style.display = 'none';
      return;
    }
    
    this.element.style.display = 'block';
    this.element.textContent = `⏱️ ${this.remaining}`;
    
    this.element.classList.remove('warning', 'critical');
    if (this.remaining <= 5) {
      this.element.classList.add('critical');
    } else if (this.remaining <= 10) {
      this.element.classList.add('warning');
    }
  }
};

// Countdown for next match
const Countdown = {
  interval: null,
  element: null,
  
  start(seconds) {
    this.stop();
    let remaining = seconds;
    this.updateDisplay(remaining);
    
    this.interval = setInterval(() => {
      remaining--;
      this.updateDisplay(remaining);
      if (remaining <= 0) {
        this.stop();
      }
    }, 1000);
  },
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    const el = document.getElementById('nextMatchCountdown');
    if (el) el.remove();
  },
  
  updateDisplay(seconds) {
    let el = document.getElementById('nextMatchCountdown');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nextMatchCountdown';
      el.className = 'countdown-display';
      document.body.appendChild(el);
    }
    
    el.innerHTML = `
      <div class="countdown-text">دست بعدی در</div>
      <div class="countdown-number">${seconds}</div>
      <div class="countdown-text">ثانیه</div>
    `;
  }
};

// Export
window.Timer = Timer;
window.Countdown = Countdown;
