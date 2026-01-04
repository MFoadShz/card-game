/**
 * Animations Module
 * Card dealing and game animations
 */

const Animations = {
  /**
   * Animate dealing cards to all players
   */
  async dealCards(state, myIndex, onComplete) {
    const handContainer = document.getElementById('myHand');
    const hand = state.hand || [];
    const layout = CardRenderer.calculateFanLayout(hand.length);
    
    // Clear all containers
    handContainer.innerHTML = '';
    ['Top', 'Left', 'Right'].forEach(pos => {
      const el = document.getElementById('player' + pos);
      if (el) el.querySelector('.opponent-cards').innerHTML = '';
    });
    
    // Show dealing message
    this.showDealingMessage();
    
    // Deal to me
    for (let i = 0; i < hand.length; i++) {
      const angle = layout.getAngle(i);
      const cardEl = CardRenderer.createElement(hand[i], {
        index: i,
        angle,
        fanRadius: layout.fanRadius,
        width: layout.cardWidth,
        height: layout.cardHeight,
        disabled: true
      });
      cardEl.classList.add('deal-anim');
      handContainer.appendChild(cardEl);
      await this.wait(80);
    }
    
    // Deal to opponents
    const positions = ['Right', 'Top', 'Left'];
    const relativeIndices = [
      (myIndex + 1) % 4,
      (myIndex + 2) % 4,
      (myIndex + 3) % 4
    ];
    
    for (let pi = 0; pi < 3; pi++) {
      await this.wait(200);
      const pIndex = relativeIndices[pi];
      const count = Math.min(state.handCounts[pIndex] || 0, 6);
      const container = document.getElementById('player' + positions[pi])?.querySelector('.opponent-cards');
      
      if (container) {
        for (let j = 0; j < count; j++) {
          const cardBack = document.createElement('div');
          cardBack.className = 'card-back deal-anim';
          container.appendChild(cardBack);
          await this.wait(40);
        }
      }
    }
    
    await this.wait(300);
    this.hideDealingMessage();
    
    if (onComplete) onComplete();
  },
  
  showDealingMessage() {
    const existing = document.getElementById('dealingMsg');
    if (existing) existing.remove();
    
    const msg = document.createElement('div');
    msg.id = 'dealingMsg';
    msg.className = 'dealing-message';
    msg.textContent = '🎴 در حال توزیع کارت‌ها...';
    document.body.appendChild(msg);
  },
  
  hideDealingMessage() {
    const msg = document.getElementById('dealingMsg');
    if (msg) msg.remove();
  },
  
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Animate card being played
   */
  playCard(cardEl, targetPosition) {
    return new Promise(resolve => {
      const rect = cardEl.getBoundingClientRect();
      const clone = cardEl.cloneNode(true);
      
      clone.style.position = 'fixed';
      clone.style.left = rect.left + 'px';
      clone.style.top = rect.top + 'px';
      clone.style.width = rect.width + 'px';
      clone.style.height = rect.height + 'px';
      clone.style.transition = 'all 0.3s ease-out';
      clone.style.zIndex = '1000';
      
      document.body.appendChild(clone);
      cardEl.style.opacity = '0';
      
      requestAnimationFrame(() => {
        clone.style.left = targetPosition.x + 'px';
        clone.style.top = targetPosition.y + 'px';
        clone.style.transform = 'scale(0.8)';
      });
      
      setTimeout(() => {
        clone.remove();
        resolve();
      }, 300);
    });
  },
  
  /**
   * Winner highlight animation
   */
  highlightWinner(playerPosition) {
    const card = document.querySelector(`.played-card.pos-${playerPosition} .card`);
    if (card) {
      card.classList.add('winner');
      setTimeout(() => card.classList.remove('winner'), 1500);
    }
  }
};

// Export
window.Animations = Animations;
