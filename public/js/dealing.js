class DealingAnimation {
  constructor() {
    this.isDealing = false;
    this.cardDelay = 80; // ms between each card
    this.playerDelay = 200; // ms between players
  }

  async start(myIndex, onComplete) {
    if (this.isDealing) return;
    this.isDealing = true;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'dealing-overlay';
    overlay.id = 'dealingOverlay';
    
    // Create deck pile
    const deck = document.createElement('div');
    deck.className = 'deck-pile';
    for (let i = 0; i < 5; i++) {
      const card = document.createElement('div');
      card.className = 'deck-card';
      card.style.transform = `translate(${i * 2}px, ${i * 2}px)`;
      deck.appendChild(card);
    }
    overlay.appendChild(deck);

    // Create message
    const msg = document.createElement('div');
    msg.className = 'dealing-message';
    msg.textContent = '🎴 در حال توزیع...';
    overlay.appendChild(msg);

    document.body.appendChild(overlay);

    // Player positions relative to myIndex
    const positions = this.getPositions(myIndex);
    
    // Deal to each player
    for (let p = 0; p < 4; p++) {
      const playerIdx = (myIndex + p) % 4;
      const pos = positions[playerIdx];
      
      // Fly 12 cards to this player
      for (let c = 0; c < 12; c++) {
        this.flyCard(pos.direction);
        await this.wait(this.cardDelay);
      }
      
      await this.wait(this.playerDelay);
    }

    // Remove overlay
    await this.wait(300);
    overlay.remove();
    
    this.isDealing = false;
    if (onComplete) onComplete();
  }

  getPositions(myIndex) {
    // Map player index to screen position
    const map = {};
    map[myIndex] = { direction: 'to-bottom', elem: 'myHand' };
    map[(myIndex + 1) % 4] = { direction: 'to-right', elem: 'playerRight' };
    map[(myIndex + 2) % 4] = { direction: 'to-top', elem: 'playerTop' };
    map[(myIndex + 3) % 4] = { direction: 'to-left', elem: 'playerLeft' };
    return map;
  }

  flyCard(direction) {
    const card = document.createElement('div');
    card.className = `flying-card ${direction}`;
    document.body.appendChild(card);
    
    setTimeout(() => card.remove(), 350);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Animate cards appearing in hand
  animateHand(handElement, cards, gameMode) {
    const existingCards = handElement.querySelectorAll('.card');
    existingCards.forEach((card, i) => {
      card.classList.add('dealing');
      card.style.animationDelay = `${i * 40}ms`;
    });
  }

  // Animate opponent cards appearing
  animateOpponent(element, count) {
    const container = element.querySelector('.opponent-cards');
    const cards = container.querySelectorAll('.card-back');
    cards.forEach((card, i) => {
      card.classList.add('dealing');
      card.style.animationDelay = `${i * 30}ms`;
    });
  }
}

const dealingAnimation = new DealingAnimation();