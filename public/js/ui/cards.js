/**
 * Card Rendering Module
 * Creates card HTML elements
 */

const CardRenderer = {
  /**
   * Create card HTML string
   */
  createHtml(card, sizeClass = '') {
    const color = ['♥', '♦'].includes(card.s) ? 'red' : 'black';
    const classes = ['card', color];
    if (sizeClass) classes.push(sizeClass);
    
    return `
      <div class="${classes.join(' ')}">
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
  
  /**
   * Create card DOM element
   */
  createElement(card, options = {}) {
    const {
      index = 0,
      angle = 0,
      fanRadius = 350,
      width = 60,
      height = 87,
      disabled = false,
      selected = false,
      animationDelay = 0
    } = options;
    
    const color = ['♥', '♦'].includes(card.s) ? 'red' : 'black';
    const classes = ['card', color];
    if (disabled) classes.push('disabled');
    if (selected) classes.push('selected');
    
    const el = document.createElement('div');
    el.className = classes.join(' ');
    el.dataset.index = index;
    el.style.cssText = `
      --angle: ${angle}deg;
      --fan-radius: ${fanRadius}px;
      width: ${width}px;
      height: ${height}px;
      z-index: ${index + 1};
      ${animationDelay ? `animation-delay: ${animationDelay}ms;` : ''}
    `;
    
    el.innerHTML = `
      <div class="corner corner-top">
        <span class="rank">${card.v}</span>
        <span class="suit-icon">${card.s}</span>
      </div>
      <span class="center-suit">${card.s}</span>
      <div class="corner corner-bottom">
        <span class="rank">${card.v}</span>
        <span class="suit-icon">${card.s}</span>
      </div>
    `;
    
    return el;
  },
  
  /**
   * Calculate fan layout for cards
   */
  calculateFanLayout(cardCount) {
    const viewportWidth = window.innerWidth;
    
    let cardWidth;
    if (viewportWidth < 350) cardWidth = 48;
    else if (viewportWidth < 400) cardWidth = 54;
    else if (viewportWidth < 500) cardWidth = 60;
    else cardWidth = 68;
    
    const cardHeight = Math.round(cardWidth * 1.45);
    const totalAngle = Math.min(55, 4 + cardCount * 4);
    const angleStep = cardCount > 1 ? totalAngle / (cardCount - 1) : 0;
    const startAngle = -totalAngle / 2;
    const fanRadius = Math.max(280, 400 - cardCount * 8);
    
    return {
      cardWidth,
      cardHeight,
      totalAngle,
      angleStep,
      startAngle,
      fanRadius,
      getAngle: (index) => startAngle + (index * angleStep)
    };
  }
};

// Export
window.CardRenderer = CardRenderer;
