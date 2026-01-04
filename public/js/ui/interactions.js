/**
 * Card Interactions Module
 * Handles drag, drop, click, and touch interactions
 */

const CardInteractions = {
  init() {
    this.setupDropZone();
  },
  
  setupDropZone() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;
    
    // Prevent default drag behaviors
    dropZone.addEventListener('dragover', e => e.preventDefault());
    dropZone.addEventListener('dragenter', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
  },
  
  /**
   * Attach interaction handlers to cards in hand
   */
  attachToCards() {
    const cards = document.querySelectorAll('#myHand .card');
    cards.forEach(card => {
      card.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
      card.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
      card.addEventListener('touchend', this.handleTouchEnd.bind(this));
      card.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
      card.addEventListener('mousedown', this.handleMouseDown.bind(this));
      card.addEventListener('click', this.handleClick.bind(this));
    });
  },
  
  handleClick(e) {
    const state = window.GameState;
    if (state.isTouchDevice || state.isDealing) return;
    
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('disabled')) return;
    
    const index = parseInt(card.dataset.index);
    if (isNaN(index)) return;
    
    this.onCardClick(index);
  },
  
  handleTouchStart(e) {
    const state = window.GameState;
    if (state.isDealing) return;
    
    state.isTouchDevice = true;
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('disabled')) return;
    
    e.preventDefault();
    state.touchStartTime = Date.now();
    state.draggedIndex = parseInt(card.dataset.index);
    if (isNaN(state.draggedIndex)) return;
    
    state.draggedCardEl = card;
    const touch = e.touches[0];
    const rect = card.getBoundingClientRect();
    card._offsetX = touch.clientX - rect.right + 10;
    card._offsetY = touch.clientY - rect.bottom + 10;
    card._startX = touch.clientX;
    card._startY = touch.clientY;
    card._moved = false;
  },
  
  handleTouchMove(e) {
    const state = window.GameState;
    if (state.draggedIndex < 0 || !state.draggedCardEl || state.isDealing) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - state.draggedCardEl._startX);
    const dy = Math.abs(touch.clientY - state.draggedCardEl._startY);
    
    if (dx > 10 || dy > 10) {
      state.draggedCardEl._moved = true;
      if (!state.draggedCard) {
        this.createGhost(state.draggedCardEl, touch);
      }
      if (state.draggedCard) {
        state.draggedCard.style.left = (touch.clientX - state.draggedCard.offsetWidth + 15) + 'px';
        state.draggedCard.style.top = (touch.clientY - state.draggedCard.offsetHeight + 15) + 'px';
      }
      this.checkDropZone(touch.clientX, touch.clientY);
    }
  },
  
  handleTouchEnd(e) {
    const state = window.GameState;
    if (state.draggedIndex < 0 || state.isDealing) {
      this.cleanup();
      return;
    }
    
    const touchDuration = Date.now() - state.touchStartTime;
    const wasDragging = state.draggedCardEl && state.draggedCardEl._moved;
    const dropZone = document.getElementById('dropZone');
    const wasOverDrop = dropZone && dropZone.classList.contains('drag-over');
    
    const index = state.draggedIndex;
    this.cleanup();
    
    if (wasDragging && wasOverDrop) {
      if (state.phase === 'playing' && state.isMyTurn) {
        this.onCardPlay(index);
      }
    } else if (!wasDragging && touchDuration < 300) {
      this.onCardClick(index);
    }
  },
  
  handleMouseDown(e) {
    const state = window.GameState;
    if (state.isTouchDevice || state.isDealing) return;
    
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('disabled')) return;
    if (state.phase !== 'playing' || !state.isMyTurn) return;
    
    e.preventDefault();
    state.draggedIndex = parseInt(card.dataset.index);
    if (isNaN(state.draggedIndex)) return;
    
    state.draggedCardEl = card;
    const rect = card.getBoundingClientRect();
    card._offsetX = e.clientX - rect.right + 10;
    card._offsetY = e.clientY - rect.bottom + 10;
    card._startX = e.clientX;
    card._startY = e.clientY;
    card._moved = false;
    
    document.addEventListener('mousemove', this._boundMouseMove = this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this._boundMouseUp = this.handleMouseUp.bind(this));
  },
  
  handleMouseMove(e) {
    const state = window.GameState;
    if (state.draggedIndex < 0 || !state.draggedCardEl || state.isDealing) return;
    
    const dx = Math.abs(e.clientX - state.draggedCardEl._startX);
    const dy = Math.abs(e.clientY - state.draggedCardEl._startY);
    
    if (dx > 5 || dy > 5) {
      state.draggedCardEl._moved = true;
      if (!state.draggedCard) {
        this.createGhost(state.draggedCardEl, e);
      }
      if (state.draggedCard) {
        state.draggedCard.style.left = (e.clientX - state.draggedCard.offsetWidth + 15) + 'px';
        state.draggedCard.style.top = (e.clientY - state.draggedCard.offsetHeight + 15) + 'px';
      }
      this.checkDropZone(e.clientX, e.clientY);
    }
  },
  
  handleMouseUp(e) {
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
    
    const state = window.GameState;
    if (state.draggedIndex < 0 || state.isDealing) {
      this.cleanup();
      return;
    }
    
    const wasDragging = state.draggedCardEl && state.draggedCardEl._moved;
    const dropZone = document.getElementById('dropZone');
    const wasOverDrop = dropZone && dropZone.classList.contains('drag-over');
    
    const index = state.draggedIndex;
    this.cleanup();
    
    if (wasDragging && wasOverDrop) {
      this.onCardPlay(index);
    }
  },
  
  createGhost(card, point) {
    const state = window.GameState;
    card.classList.add('dragging');
    
    state.draggedCard = card.cloneNode(true);
    state.draggedCard.classList.remove('selected', 'disabled', 'dragging');
    state.draggedCard.classList.add('card-ghost');
    state.draggedCard.style.width = card.offsetWidth + 'px';
    state.draggedCard.style.height = card.offsetHeight + 'px';
    state.draggedCard.style.left = (point.clientX - card.offsetWidth + 15) + 'px';
    state.draggedCard.style.top = (point.clientY - card.offsetHeight + 15) + 'px';
    document.body.appendChild(state.draggedCard);
  },
  
  checkDropZone(x, y) {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;
    
    const rect = dropZone.getBoundingClientRect();
    const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    dropZone.classList.toggle('drag-over', isOver);
  },
  
  cleanup() {
    const state = window.GameState;
    
    if (state.draggedCard) {
      state.draggedCard.remove();
      state.draggedCard = null;
    }
    if (state.draggedCardEl) {
      state.draggedCardEl.classList.remove('dragging');
      state.draggedCardEl = null;
    }
    
    const dropZone = document.getElementById('dropZone');
    if (dropZone) dropZone.classList.remove('drag-over');
    
    state.draggedIndex = -1;
  },
  
  // Callbacks - to be set by main app
  onCardClick: (index) => {},
  onCardPlay: (index) => {}
};

// Prevent scroll when dragging
document.addEventListener('touchmove', (e) => {
  if (window.GameState?.draggedCard) {
    e.preventDefault();
  }
}, { passive: false });

// Export
window.CardInteractions = CardInteractions;
