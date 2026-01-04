const socket = io('/dev');
let state = null;
let dealing = false;
let selectedMode = null;
let selectedSuit = null;

socket.on('connect', () => socket.emit('devJoin'));
socket.on('error', msg => alert(msg));

socket.on('gameState', s => {
  const wasWaiting = !state || state.phase === 'waiting' || state.phase === 'ended';
  const isDealtPhase = ['proposing','selectMode','playing'].includes(s.phase);
  state = s;

   if (wasWaiting && s.phase === 'proposing') {
    selectedMode = null;
    selectedSuit = null;
  }

  if (wasWaiting && isDealtPhase && !dealing) {
    dealCards();
  } else if (!dealing) {
    render();
  }
});

socket.on('proposalUpdate', data => addLog(data.action === 'pass'
  ? `❌ ${data.name} پاس کرد`
  : `📢 ${data.name}: ${data.value}`));

socket.on('leaderSelected', data => addLog(`👑 ${data.name} حاکم شد - قرارداد ${data.contract}`));

socket.on('modeSelected', data => {
  const modeNames = { hokm: 'حکم', nars: 'نرس', asNars: 'آس‌نرس', sars: 'سَرس' };
  const suitText = data.suit ? ` (${data.suit})` : '';
  addLog(`🎯 ${data.name}: ${modeNames[data.mode] || data.mode}${suitText}`);
  hideModal('modePanel');
});

socket.on('roundResult', data => {
  document.getElementById('resultTitle').textContent = `🏆 ${data.winnerName} برد!`;
  document.getElementById('resultCards').innerHTML = data.cards.map(p => 
    `<div class="${p.isWinner?'winner':''}">${cardHtml(p.c,'small')}</div>`
  ).join('');
  document.getElementById('resultPoints').textContent = `امتیاز: ${data.points}`;
  showModal('resultModal');
  setTimeout(() => hideModal('resultModal'), 1500);
});

function startGame() { if(!dealing) socket.emit('devStart'); }
function resetGame() { if(!dealing) { selectedMode = null; selectedSuit = null; socket.emit('devReset'); } }

async function dealCards() {
  dealing = true;
  const delay = 80; // ms per card
  const playerDelay = 300; // ms between players
  
  // Clear everything first
  document.getElementById('myHand').innerHTML = '';
  document.getElementById('centerCards').innerHTML = '';
  ['Top','Left','Right'].forEach(p => {
    document.getElementById('player'+p).querySelector('.opponent-cards').innerHTML = '';
  });
  
  // Deal order: 0(me), 1(right), 2(top), 3(left)
  const positions = ['myHand', 'playerRight', 'playerTop', 'playerLeft'];
  const counts = [state.handCounts[0], state.handCounts[1], state.handCounts[2], state.handCounts[3]];
  
  for (let p = 0; p < 4; p++) {
    const count = counts[p];
    
    if (p === 0) {
      // My hand - deal one by one
      for (let i = 0; i < count; i++) {
        addMyCard(i, count, i * delay);
        await wait(delay);
      }
    } else {
      // Opponents - deal one by one
      const container = document.getElementById(positions[p]).querySelector('.opponent-cards');
      for (let i = 0; i < Math.min(count, 6); i++) {
        const card = document.createElement('div');
        card.className = 'card-back deal';
        card.style.animationDelay = `${i * 30}ms`;
        container.appendChild(card);
        await wait(30);
      }
    }
    await wait(playerDelay);
  }
  
  // Show center cards (4 cards)
  await wait(200);
  const centerEl = document.getElementById('centerCards');
  for (let i = 0; i < 4; i++) {
    const card = document.createElement('div');
    card.className = 'card-back deal';
    card.style.animationDelay = `${i * 100}ms`;
    card.style.width = '40px';
    card.style.height = '58px';
    centerEl.appendChild(card);
    await wait(100);
  }
  
  await wait(500);
  dealing = false;
  render();
}

function addMyCard(index, total, delayMs) {
  const hand = state.hand;
  if (!hand[index]) return;
  
  const c = hand[index];
  const w = window.innerWidth < 400 ? 50 : 60;
  const angle = Math.min(50, total * 4);
  const step = total > 1 ? angle/(total-1) : 0;
  const a = -angle/2 + index*step;
  const color = ['♥','♦'].includes(c.s) ? 'red' : 'black';
  
  const cardEl = document.createElement('div');
  cardEl.className = `card ${color} deal`;
  cardEl.setAttribute('data-i', index);
  cardEl.style.cssText = `--angle:${a}deg;--fan-radius:350px;width:${w}px;height:${w*1.45}px;z-index:${index+1};animation-delay:${delayMs}ms`;
  cardEl.onclick = () => play(index);
  cardEl.innerHTML = `
    <div class="corner corner-top"><span class="rank">${c.v}</span><span class="suit-icon">${c.s}</span></div>
    <span class="center-suit">${c.s}</span>
    <div class="corner corner-bottom"><span class="rank">${c.v}</span><span class="suit-icon">${c.s}</span></div>
  `;
  document.getElementById('myHand').appendChild(cardEl);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function render() {
  if (!state) return;
  
  document.getElementById('score0').textContent = state.totalScores[0];
  document.getElementById('score1').textContent = state.totalScores[1];
  document.getElementById('contractDisplay').textContent = state.contract ? `قرارداد: ${state.contract}` : '';
  document.getElementById('trumpDisplay').innerHTML = `حکم: <span style="color:${['♥','♦'].includes(state.masterSuit)?'red':'#fff'}">${state.masterSuit || '-'}</span>`;
  document.getElementById('turnIndicator').textContent = state.turn === 0 ? '🎯 نوبت شما' : '';
  document.getElementById('game').classList.toggle('my-turn', state.turn === 0 && state.phase === 'playing');
  
  // Hide center cards during play
  document.getElementById('centerCards').innerHTML = '';

  // Opponents
  [['Top',2],['Left',3],['Right',1]].forEach(([pos,idx]) => {
    const el = document.getElementById('player'+pos);
    el.querySelector('.opponent-name').textContent = state.players[idx]?.name || '';
    el.querySelector('.card-count').textContent = state.handCounts[idx];
    el.classList.toggle('turn', state.turn === idx && state.phase === 'playing');
    el.querySelector('.opponent-cards').innerHTML = Array(Math.min(state.handCounts[idx],6)).fill('<div class="card-back"></div>').join('');
  });

  // Played cards
  document.getElementById('playedCards').innerHTML = state.playedCards.map(pc => 
    `<div class="played-card pos-${pc.p}">${cardHtml(pc.c,'small')}</div>`
  ).join('');

  // My hand
  renderMyHand();

  // Mode selection UI
  updateModePanel();
}

function renderMyHand() {
  const hand = state.hand || [];
  const w = window.innerWidth < 400 ? 50 : 60;
  const angle = Math.min(50, hand.length * 4);
  const step = hand.length > 1 ? angle/(hand.length-1) : 0;
  
  document.getElementById('myHand').innerHTML = hand.map((c,i) => {
    const a = -angle/2 + i*step;
    const color = ['♥','♦'].includes(c.s) ? 'red' : 'black';
    const disabled = state.phase !== 'playing' || state.turn !== 0 ? 'disabled' : '';
    return `<div class="card ${color} ${disabled}" data-i="${i}" 
      style="--angle:${a}deg;--fan-radius:350px;width:${w}px;height:${w*1.45}px;z-index:${i+1}" 
      onclick="play(${i})">
      <div class="corner corner-top"><span class="rank">${c.v}</span><span class="suit-icon">${c.s}</span></div>
      <span class="center-suit">${c.s}</span>
      <div class="corner corner-bottom"><span class="rank">${c.v}</span><span class="suit-icon">${c.s}</span></div>
    </div>`;
  }).join('');
}

function play(i) { if (state?.phase === 'playing' && state?.turn === 0 && !dealing) socket.emit('playCard', i); }
function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function hideModal(id) { document.getElementById(id).style.display = 'none'; }
function cardHtml(c, size='') {
  const color = ['♥','♦'].includes(c.s) ? 'red' : 'black';
  return `<div class="card ${color} ${size}">
    <div class="corner corner-top"><span class="rank">${c.v}</span><span class="suit-icon">${c.s}</span></div>
    <span class="center-suit">${c.s}</span>
    <div class="corner corner-bottom"><span class="rank">${c.v}</span><span class="suit-icon">${c.s}</span></div>
  </div>`;
}

function addLog(text) {
  const log = document.getElementById('gameLog');
  const item = document.createElement('div');
  item.className = 'log-item';
  item.textContent = text;
  log.prepend(item);
}

function updateModePanel() {
  const panel = document.getElementById('modePanel');
  const confirmBtn = document.getElementById('confirmMode');
  if (!panel || !state) return;

  if (state.phase === 'selectMode' && state.turn === 0) {
    panel.style.display = 'flex';
    confirmBtn.disabled = !selectedMode;
    const suitRow = document.getElementById('suitRow');
    suitRow.style.display = selectedMode && selectedMode !== 'sars' ? 'flex' : 'none';
  } else {
    panel.style.display = 'none';
  }
}

function selectMode(mode) {
  selectedMode = mode;
  // Auto-pick suit if needed
  if (mode === 'sars') {
    selectedSuit = null;
  } else if (!selectedSuit) {
    selectedSuit = '♠';
  }
  highlightModeButtons();
  highlightSuitButtons();
  updateModePanel();
}

function selectSuit(suit) {
  selectedSuit = suit;
  highlightSuitButtons();
}

function confirmMode() {
  if (!selectedMode) return;
  const suit = selectedMode === 'sars' ? null : (selectedSuit || '♠');
  socket.emit('devSelectMode', { mode: selectedMode, suit });
  document.getElementById('confirmMode').disabled = true;
}

function highlightModeButtons() {
  document.querySelectorAll('#modePanel .mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === selectedMode);
  });
}

function highlightSuitButtons() {
  document.querySelectorAll('#modePanel .suit-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.suit === selectedSuit);
  });
}

// Keyboard shortcuts
 document.addEventListener('keydown', e => {
   if (e.key === 's') startGame();
   if (e.key === 'r') resetGame();
 });

// Mode panel event bindings
function initModePanel() {
  document.querySelectorAll('#modePanel .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => selectMode(btn.dataset.mode));
  });
  document.querySelectorAll('#modePanel .suit-btn').forEach(btn => {
    btn.addEventListener('click', () => selectSuit(btn.dataset.suit));
  });
  const confirmBtn = document.getElementById('confirmMode');
  if (confirmBtn) confirmBtn.addEventListener('click', confirmMode);
}

document.addEventListener('DOMContentLoaded', initModePanel);
