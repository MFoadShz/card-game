// ===== Socket Setup =====
const socket = io({
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 10000
});

// ===== Constants =====
const DEVICE_ID_KEY = 'shelem_device_id';
const SESSION_KEY = 'shelem_session';

// ===== State =====
let state = null;
let myIndex = -1;
let myRoom = '';
let myName = '';
let scoreLimit = 500;
let playerNames = [];
let selected = [];
let selectedSuit = null;

// ===== Drag State =====
let draggedIndex = -1;
let draggedCard = null;
let draggedCardEl = null;
let isDragging = false;
let touchStartTime = 0;

// ===== Timer State =====
let timerInterval = null;
let remainingTime = 0;
let countdownInterval = null;

// ===== Device & Session =====
function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
}

function getSession() {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;
    const session = JSON.parse(data);
    if (Date.now() - session.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ===== Socket Events =====
socket.on('connect', () => {
  console.log('Connected to server');
  const deviceId = getDeviceId();
  const session = getSession();
  socket.emit('authenticate', { deviceId, playerName: session?.playerName || '' });
});

socket.on('authenticated', (data) => {
  console.log('Authenticated:', data);
  if (data.hasActiveGame) {
    UI.showReconnectPrompt(data.roomCode, data.playerName, doAutoReconnect, cancelReconnect);
  } else {
    const nameEl = document.getElementById('createName') || document.getElementById('joinName');
    if (nameEl && data.playerName) nameEl.value = data.playerName;
  }
});

socket.on('reconnected', async (data) => {
  console.log('Reconnected:', data);
  myIndex = data.playerIndex;
  myRoom = data.roomCode;
  myName = data.playerName;
  
  saveSession({ roomCode: myRoom, playerName: myName, index: myIndex });
  UI.hideReconnectPrompt();
  
  UI.hide('lobby');
  UI.show('game');
  UI.addLog('🔄 اتصال مجدد برقرار شد', 'info');
  
  try {
    await initVoiceChat(socket, myIndex);
  } catch (e) {
    console.error('Voice init failed:', e);
  }
});

socket.on('reconnectFailed', (data) => {
  console.log('Reconnect failed:', data.reason);
  clearSession();
  UI.hideReconnectPrompt();
  UI.toast(data.reason, 'error');
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  if (myRoom) {
    UI.addLog('⚠️ اتصال قطع شد...', 'info');
    UI.showConnectionLost();
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

socket.on('error', msg => UI.toast(msg, 'error'));

// ===== Room Events =====
socket.on('roomCreated', async (data) => {
  myRoom = data.code;
  myIndex = data.index;
  scoreLimit = data.scoreLimit || 500;
  myName = document.getElementById('createName').value.trim();
  
  saveSession({ roomCode: myRoom, playerName: myName, index: myIndex });
  showWaitingRoom();
  
  try {
    await initVoiceChat(socket, myIndex);
  } catch (e) {
    console.error('Voice init error:', e);
  }
});

socket.on('roomJoined', async (data) => {
  myRoom = data.code;
  myIndex = data.index;
  scoreLimit = data.scoreLimit || 500;
  myName = document.getElementById('joinName').value.trim();
  
  saveSession({ roomCode: myRoom, playerName: myName, index: myIndex });
  showWaitingRoom();
  
  try {
    await initVoiceChat(socket, myIndex);
  } catch (e) {
    console.error('Voice init error:', e);
  }
});

socket.on('updatePlayerList', (players) => {
  playerNames = players.map(p => p.name);
  renderPlayerList(players);
});

// ===== Game Events =====
socket.on('gameState', (data) => {
  const wasWaiting = !state || state.phase === 'waiting';
  state = data;
  
  if (wasWaiting && data.phase !== 'waiting') {
    UI.hide('lobby');
    document.getElementById('game').classList.remove('hidden');
    document.getElementById('game').classList.add('flex');
    startDealingAnimation();
  } else {
    render();
  }
});

socket.on('proposalUpdate', (data) => {
  const text = data.action === 'call' 
    ? `📢 ${data.name}: ${data.value}`
    : `❌ ${data.name} پاس کرد`;
  UI.addLog(text, data.action);
  updateProposalLogMini(data);
});

socket.on('leaderSelected', (data) => {
  UI.hide('proposalPanel');
  UI.addLog(`👑 ${data.name} حاکم شد - قرارداد: ${data.contract}`, 'info');
});

socket.on('modeSelected', (data) => {
  UI.hide('modeModal');
  const modeNames = { hokm: 'حکم', nars: 'نَرس', asNars: 'آس‌نَرس', sars: 'سَرس' };
  const suitText = data.suit ? ` (${data.suit})` : '';
  UI.addLog(`🎯 ${data.name}: ${modeNames[data.mode]}${suitText}`, 'info');
});

socket.on('cardAction', (data) => {
  render();
});

socket.on('timerStart', (data) => {
  startTimerUI(data.duration);
});

socket.on('botAction', (data) => {
  const modeNames = { hokm: 'حکم', nars: 'نَرس', asNars: 'آس‌نَرس', sars: 'سَرس' };
  const actionText = '🤖';
  
  switch (data.action) {
    case 'playCard':
      UI.addLog(`${actionText} ${data.name} کارت بازی کرد (خودکار)`, 'info');
      break;
    case 'pass':
      UI.addLog(`${actionText} ${data.name} پاس کرد (خودکار)`, 'pass');
      break;
    case 'propose':
      UI.addLog(`${actionText} ${data.name}: ${data.result.value} (خودکار)`, 'call');
      break;
    case 'exchange':
      UI.addLog(`${actionText} ${data.name} کارت تعویض کرد (خودکار)`, 'info');
      break;
    case 'selectMode':
      UI.addLog(`${actionText} ${data.name}: ${modeNames[data.result.mode]} (خودکار)`, 'info');
      break;
  }
});

socket.on('roundResult', (data) => showRoundResult(data));
socket.on('matchEnded', (data) => {
  stopTimerUI();
  showMatchEnd(data);
});
socket.on('nextMatchCountdown', (data) => startNextMatchCountdown(data.seconds));
socket.on('newMatchStarting', () => {
  UI.hide('endModal');
  stopCountdown();
});
socket.on('gameOver', (data) => showGameOver(data));
socket.on('gameReset', () => {
  UI.hide('gameOverModal');
  document.getElementById('game').classList.add('hidden');
  document.getElementById('lobby').classList.remove('hidden');
  backToWelcome();
});
socket.on('proposalRestart', (data) => UI.addLog('⚠️ ' + data.reason, 'info'));
socket.on('playerDisconnected', (data) => UI.addLog(`⚠️ ${data.name} قطع شد`, 'info'));
socket.on('playerRejoined', (data) => UI.addLog(`✅ ${data.name} برگشت`, 'info'));
socket.on('playerLeft', (data) => UI.addLog(`❌ ${data.name} ترک کرد`, 'info'));

// ===== Reconnect Functions =====
function doAutoReconnect() {
  const deviceId = getDeviceId();
  const prompt = document.getElementById('reconnectPrompt');
  if (prompt) {
    prompt.querySelector('.bg-base-200').innerHTML = `
      <div class="loading loading-spinner loading-lg text-primary mb-4"></div>
      <p>در حال اتصال...</p>
    `;
  }
  socket.emit('autoReconnect', { deviceId });
}

function cancelReconnect() {
  clearSession();
  UI.hideReconnectPrompt();
}

// ===== Lobby Functions =====
function showCreateForm() {
  UI.hide('welcomeScreen');
  document.getElementById('createForm').classList.remove('hidden');
}

function showJoinForm() {
  UI.hide('welcomeScreen');
  document.getElementById('joinForm').classList.remove('hidden');
}

function backToWelcome() {
  document.getElementById('welcomeScreen').classList.remove('hidden');
  document.getElementById('createForm').classList.add('hidden');
  document.getElementById('joinForm').classList.add('hidden');
  document.getElementById('waitingRoom').classList.add('hidden');
}

function createRoom() {
  const name = document.getElementById('createName').value.trim();
  const code = document.getElementById('createCode').value.trim();
  const password = document.getElementById('createPassword').value;
  const limit = document.getElementById('createScoreLimit').value;
  
  if (!name || !code) {
    UI.toast('نام و کد اتاق الزامی است', 'error');
    return;
  }
  
  socket.emit('createRoom', { code, name, password, scoreLimit: limit });
}

function joinRoom() {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('joinCode').value.trim();
  const password = document.getElementById('joinPassword').value;
  
  if (!name || !code) {
    UI.toast('نام و کد اتاق الزامی است', 'error');
    return;
  }
  
  socket.emit('joinRoom', { code: code.toLowerCase(), name, password });
}

function showWaitingRoom() {
  UI.hide('createForm');
  UI.hide('joinForm');
  document.getElementById('waitingRoom').classList.remove('hidden');
  UI.text('scoreLimitDisplay', `سقف امتیاز: ${scoreLimit}`);
}

function setReady() {
  socket.emit('playerReady');
  const btn = document.getElementById('readyBtn');
  btn.textContent = '⏳ در انتظار...';
  btn.disabled = true;
  btn.classList.add('btn-disabled');
}

function leaveRoom() {
  if (confirm('آیا می‌خواهید بازی را ترک کنید؟')) {
    socket.emit('leaveRoom');
    clearSession();
    location.reload();
  }
}

// ===== Render Functions =====
function renderPlayerList(players) {
  const container = document.getElementById('playersList');
  container.innerHTML = [0, 1, 2, 3].map(i => UI.playerSlot(players[i], i, myIndex)).join('');
}

function render() {
  if (!state) return;
  
  const gameEl = document.getElementById('game');
  const isMyTurn = state.turn === myIndex;
  const isPlaying = state.phase === 'playing';
  const isProposing = state.phase === 'proposing';
  
  UI.toggle(gameEl, 'my-turn', isMyTurn && isPlaying);
  
  // Scores
  UI.text('score0', state.totalScores[0]);
  UI.text('score1', state.totalScores[1]);
  
  if (state.scoreLimit) {
    UI.text('scoreLimitGame', `سقف: ${state.scoreLimit}`);
  }
  
  // Contract & Trump
  if (state.contract) {
    UI.text('contractDisplay', `قرارداد: ${state.contract}`);
  }
  
  if (state.masterSuit) {
    const color = ['♥', '♦'].includes(state.masterSuit) ? 'text-card-red' : '';
    UI.html('trumpDisplay', `حکم: <span class="${color}">${state.masterSuit}</span>`);
  } else if (state.gameMode === 'sars') {
    UI.text('trumpDisplay', 'سَرس (بدون حکم)');
  }
  
  renderOpponents();
  renderPlayedCards();
  renderMyHand();
  renderControls();
  
  // Drop hint
  UI.toggle('dropHint', 'hidden', !(isMyTurn && isPlaying));
  UI.toggle('dropZone', 'drop-zone-active', isMyTurn && isPlaying);
  
  // Proposal overlay
  const overlay = document.getElementById('proposalOverlay');
  if (isProposing && state.turn !== myIndex) {
    overlay.classList.remove('hidden');
    UI.html('waitingMessage', `
      <span class="text-primary font-bold">${playerNames[state.turn] || 'بازیکن'}</span>
      <span> در حال انتخاب</span>
      <span class="loading loading-dots loading-sm mr-2"></span>
    `);
  } else {
    overlay.classList.add('hidden');
  }
  
  // Show panels
  if (isProposing && isMyTurn) {
    showProposalPanel();
  } else if (state.phase === 'modeSelection' && state.leader === myIndex) {
    UI.show('modeModal');
  }
}

function renderOpponents() {
  const positions = ['Right', 'Top', 'Left'];
  const indices = [(myIndex + 1) % 4, (myIndex + 2) % 4, (myIndex + 3) % 4];
  
  positions.forEach((pos, i) => {
    const pIndex = indices[i];
    const player = state.players[pIndex];
    const elem = document.getElementById('player' + pos);
    
    elem.querySelector('.opponent-name').textContent = player?.name || '';
    elem.querySelector('.card-count').textContent = state.handCounts[pIndex];
    
    UI.toggle(elem, 'turn', state.turn === pIndex);
    UI.toggle(elem, 'leader', state.leader === pIndex);
    
    // Render card backs
    const cardsContainer = elem.querySelector('.opponent-cards');
    const count = Math.min(state.handCounts[pIndex], 6);
    const cardClass = pos === 'Top' ? 'opponent-card-top' : 'opponent-card-side';
    cardsContainer.innerHTML = Array(count).fill(`<div class="card-back ${cardClass}"></div>`).join('');
  });
}

function renderPlayedCards() {
  const container = document.getElementById('playedCards');
  container.innerHTML = state.playedCards.map(pc => {
    const relPos = UI.getRelativePosition(pc.p, myIndex);
    const posIndex = ['bottom', 'right', 'top', 'left'].indexOf(relPos);
    return `<div class="played-card pos-${posIndex}">${UI.card(pc.c, 'small')}</div>`;
  }).join('');
}

function renderMyHand() {
  const hand = state.hand || [];
  const container = document.getElementById('myHand');
  const isMyTurn = state.turn === myIndex;
  const isPlaying = state.phase === 'playing';
  const isExchange = state.phase === 'modeSelection' && state.leader === myIndex;
  const leadSuit = state.playedCards[0]?.c.s;
  
  // Turn indicator
  const turnText = isMyTurn && isPlaying ? '🎯 نوبت شما' : 
                   isExchange ? '🔄 ۴ کارت انتخاب کنید' : '';
  UI.text('turnIndicator', turnText);
  
  const cardWidth = window.innerWidth < 400 ? 50 : 60;
  
  container.innerHTML = hand.map((card, i) => {
    const style = UI.getHandCardStyle(i, hand.length, cardWidth);
    const isSelected = selected.includes(i);
    
    let canPlay = isPlaying && isMyTurn;
    if (canPlay && leadSuit && hand.some(c => c.s === leadSuit)) {
      canPlay = card.s === leadSuit;
    }
    
    const canSelect = isExchange && selected.length < 4;
    const classes = ['playing-card', 'hand-card'];
    const color = ['♥', '♦'].includes(card.s) ? 'red' : 'black';
    classes.push(color);
    
    if (isSelected) classes.push('selected');
    if (!canSelect && !canPlay) classes.push('disabled');
    
    return `
      <div class="${classes.join(' ')}" 
           data-index="${i}" 
           style="${UI.styleString(style)}">
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
  }).join('');
  
  setupCardInteractions();
}

function renderControls() {
  const container = document.getElementById('controls');
  const isExchange = state.phase === 'modeSelection' && state.leader === myIndex;
  
  if (isExchange && selected.length === 4) {
    container.innerHTML = `<button class="btn btn-success" onclick="doExchange()">✅ تعویض کارت‌ها</button>`;
  } else {
    container.innerHTML = '';
  }
}

// ===== Card Interactions =====
function setupCardInteractions() {
  const cards = document.querySelectorAll('#myHand .hand-card');
  cards.forEach(card => {
    card.addEventListener('touchstart', handleTouchStart, { passive: false });
    card.addEventListener('touchmove', handleTouchMove, { passive: false });
    card.addEventListener('touchend', handleTouchEnd);
    card.addEventListener('mousedown', handleMouseDown);
    card.addEventListener('click', handleCardClick);
  });
}

function handleCardClick(e) {
  if (isDragging) return;
  const card = e.target.closest('.hand-card');
  if (!card || card.classList.contains('disabled')) return;
  
  const index = parseInt(card.dataset.index);
  if (isNaN(index)) return;
  clickCard(index);
}

function clickCard(index) {
  const isExchange = state.phase === 'modeSelection' && state.leader === myIndex;
  
  if (isExchange) {
    if (selected.includes(index)) {
      selected = selected.filter(i => i !== index);
    } else if (selected.length < 4) {
      selected.push(index);
    }
    render();
  } else {
    playCard(index);
  }
}

function playCard(index) {
  socket.emit('playCard', index);
}

function handleTouchStart(e) {
  const card = e.target.closest('.hand-card');
  if (!card || card.classList.contains('disabled')) return;
  
  e.preventDefault();
  touchStartTime = Date.now();
  draggedIndex = parseInt(card.dataset.index);
  draggedCardEl = card;
  
  const touch = e.touches[0];
  card._startX = touch.clientX;
  card._startY = touch.clientY;
}

function handleTouchMove(e) {
  if (draggedIndex === -1 || !draggedCardEl) return;
  e.preventDefault();
  
  const touch = e.touches[0];
  const dx = Math.abs(touch.clientX - draggedCardEl._startX);
  const dy = Math.abs(touch.clientY - draggedCardEl._startY);
  
  if (!isDragging && (dx > 10 || dy > 10)) {
    isDragging = true;
    createGhostCard(draggedCardEl, touch);
  }
  
  if (isDragging && draggedCard) {
    draggedCard.style.left = touch.clientX + 'px';
    draggedCard.style.top = touch.clientY + 'px';
    checkDropZone(touch.clientX, touch.clientY);
  }
}

function handleTouchEnd(e) {
  const wasOverDrop = document.getElementById('dropZone')?.classList.contains('drop-zone-hover');
  const touchDuration = Date.now() - touchStartTime;
  
  if (isDragging && wasOverDrop && draggedIndex >= 0) {
    playCard(draggedIndex);
  } else if (!isDragging && touchDuration < 300 && draggedIndex >= 0) {
    clickCard(draggedIndex);
  }
  
  cleanupDrag();
}

function handleMouseDown(e) {
  const card = e.target.closest('.hand-card');
  if (!card || card.classList.contains('disabled')) return;
  
  draggedIndex = parseInt(card.dataset.index);
  draggedCardEl = card;
  card._startX = e.clientX;
  card._startY = e.clientY;
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
  if (draggedIndex === -1 || !draggedCardEl) return;
  
  const dx = Math.abs(e.clientX - draggedCardEl._startX);
  const dy = Math.abs(e.clientY - draggedCardEl._startY);
  
  if (!isDragging && (dx > 10 || dy > 10)) {
    isDragging = true;
    createGhostCard(draggedCardEl, e);
  }
  
  if (isDragging && draggedCard) {
    draggedCard.style.left = e.clientX + 'px';
    draggedCard.style.top = e.clientY + 'px';
    checkDropZone(e.clientX, e.clientY);
  }
}

function handleMouseUp(e) {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  
  const wasOverDrop = document.getElementById('dropZone')?.classList.contains('drop-zone-hover');
  if (isDragging && wasOverDrop && draggedIndex >= 0) {
    playCard(draggedIndex);
  }
  
  cleanupDrag();
}

function createGhostCard(card, point) {
  card.classList.add('opacity-30');
  draggedCard = card.cloneNode(true);
  draggedCard.className = 'playing-card fixed pointer-events-none z-[300] -rotate-3 scale-110 shadow-xl';
  draggedCard.style.left = point.clientX + 'px';
  draggedCard.style.top = point.clientY + 'px';
  draggedCard.style.transform = 'translate(-50%, -50%) rotate(-5deg) scale(1.1)';
  document.body.appendChild(draggedCard);
}

function checkDropZone(x, y) {
  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;
  
  const rect = dropZone.getBoundingClientRect();
  const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  dropZone.classList.toggle('drop-zone-hover', isOver);
}

function cleanupDrag() {
  if (draggedCard) draggedCard.remove();
  if (draggedCardEl) draggedCardEl.classList.remove('opacity-30');
  
  const dropZone = document.getElementById('dropZone');
  if (dropZone) dropZone.classList.remove('drop-zone-hover');
  
  draggedCard = null;
  draggedCardEl = null;
  draggedIndex = -1;
  isDragging = false;
}

// ===== Proposal Functions =====
function showProposalPanel() {
  const panel = document.getElementById('proposalPanel');
  panel.classList.remove('hidden');
  
  const grid = document.getElementById('proposalGrid');
  const minValue = (state.contract || 95) + 5;
  
  grid.innerHTML = '';
  for (let v = 100; v <= 165; v += 5) {
    const isAvailable = v >= minValue;
    const classes = ['proposal-btn'];
    if (isAvailable) classes.push('available');
    
    grid.innerHTML += `
      <button class="${classes.join(' ')}" 
              onclick="submitProposalValue(${v})" 
              ${!isAvailable ? 'disabled' : ''}>
        ${v}
      </button>
    `;
  }
  
  updateProposalLogMiniFromState();
}

function submitProposalValue(value) {
  socket.emit('submitProposal', value);
  UI.hide('proposalPanel');
}

function passProposal() {
  socket.emit('passProposal');
  UI.hide('proposalPanel');
}

function updateProposalLogMini(data) {
  const container = document.getElementById('proposalLogMini');
  if (!container) return;
  
  const text = data.action === 'call' ? `${data.name}: ${data.value}` : `${data.name}: پاس`;
  container.innerHTML += `<div class="log-item ${data.action}">${text}</div>`;
}

function updateProposalLogMiniFromState() {
  if (!state?.proposalLog) return;
  const container = document.getElementById('proposalLogMini');
  container.innerHTML = state.proposalLog.map(log => {
    const text = log.action === 'call' 
      ? `${playerNames[log.player]}: ${log.value}` 
      : `${playerNames[log.player]}: پاس`;
    return `<div class="log-item ${log.action}">${text}</div>`;
  }).join('');
}

// ===== Mode Selection =====
function selectSuit(suit) {
  selectedSuit = suit;
  document.querySelectorAll('.suit-btn').forEach(btn => {
    btn.classList.toggle('btn-primary', btn.dataset.suit === suit);
  });
  updateModeButton();
}

function updateModeButton() {
  const btn = document.getElementById('confirmModeBtn');
  const modeRadio = document.querySelector('input[name="gameMode"]:checked');
  
  if (!modeRadio) {
    btn.disabled = true;
    btn.textContent = 'انتخاب کنید';
    return;
  }
  
  const mode = modeRadio.value;
  const needsSuit = mode !== 'sars';
  
  document.getElementById('suitSelector').classList.toggle('hidden', !needsSuit);
  
  btn.disabled = needsSuit && !selectedSuit;
  btn.textContent = btn.disabled ? 'خال حکم را انتخاب کنید' : 'تایید';
}

function confirmMode() {
  const modeRadio = document.querySelector('input[name="gameMode"]:checked');
  if (!modeRadio) return;
  
  const mode = modeRadio.value;
  if (mode === 'sars') {
    socket.emit('selectMode', { mode });
  } else if (selectedSuit) {
    socket.emit('selectMode', { mode, suit: selectedSuit });
  }
  
  UI.hide('modeModal');
  selectedSuit = null;
}

function doExchange() {
  if (selected.length !== 4) {
    UI.toast('۴ کارت انتخاب کنید', 'error');
    return;
  }
  socket.emit('exchangeCards', selected);
  selected = [];
}

// ===== Result Modals =====
function showRoundResult(data) {
  UI.text('resultTitle', `🏆 ${data.winnerName} برد!`);
  UI.html('resultCards', data.playedCards.map(pc => {
    const cls = pc.isWinner ? 'ring-2 ring-accent' : '';
    return `<div class="${cls}">${UI.card(pc.card || pc.c, 'small')}</div>`;
  }).join(''));
  UI.text('resultPoints', `امتیاز: ${data.points}`);
  
  UI.show('resultModal');
  setTimeout(() => UI.hide('resultModal'), 2500);
}

function showMatchEnd(data) {
  const myTeam = myIndex % 2;
  const isWin = data.success === (myTeam === data.leaderTeam);
  
  UI.text('endTitle', isWin ? '🎉 پیروز شدید!' : '😢 باختید');
  UI.html('endDetails', `
    <div class="text-lg mb-2">قرارداد: ${data.contract}</div>
    <div class="flex justify-center gap-8">
      <div class="text-team1">تیم ۱: ${data.scores[0]}</div>
      <div class="text-team2">تیم ۲: ${data.scores[1]}</div>
    </div>
  `);
  
  const modal = document.querySelector('#endModal .modal-box');
  modal.classList.toggle('border-2', true);
  modal.classList.toggle('border-success', isWin);
  modal.classList.toggle('border-error', !isWin);
  
  UI.show('endModal');
}

function showGameOver(data) {
  const myTeam = myIndex % 2;
  const isWin = data.winnerTeam === myTeam;
  
  UI.text('gameOverTitle', isWin ? '🏆 تبریک! بردید!' : '💔 متأسفانه باختید');
  UI.html('gameOverDetails', `
    <div class="flex justify-center items-center gap-4 my-4">
      <div class="text-center p-4 rounded-lg ${data.winnerTeam === 0 ? 'bg-success/20' : 'bg-base-300'}">
        <div class="text-sm opacity-70">تیم ۱</div>
        <div class="text-2xl font-bold text-team1">${data.finalScores[0]}</div>
      </div>
      <div class="text-2xl">⚔️</div>
      <div class="text-center p-4 rounded-lg ${data.winnerTeam === 1 ? 'bg-success/20' : 'bg-base-300'}">
        <div class="text-sm opacity-70">تیم ۲</div>
        <div class="text-2xl font-bold text-team2">${data.finalScores[1]}</div>
      </div>
    </div>
  `);
  
  document.getElementById('resetGameBtn').classList.toggle('hidden', myIndex !== 0);
  
  UI.show('gameOverModal');
}

function playAgain() {
  UI.hide('endModal');
}

function resetGame() {
  socket.emit('resetGame');
}

// ===== Timer Functions =====
function startTimerUI(duration) {
  stopTimerUI();
  remainingTime = Math.ceil(duration / 1000);
  UI.updateTimer(remainingTime);
  
  timerInterval = setInterval(() => {
    remainingTime--;
    if (remainingTime <= 0) {
      stopTimerUI();
    } else {
      UI.updateTimer(remainingTime);
    }
  }, 1000);
}

function stopTimerUI() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  UI.hideTimer();
}

function startNextMatchCountdown(seconds) {
  stopCountdown();
  let remaining = seconds;
  UI.showCountdown(remaining);
  
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      stopCountdown();
    } else {
      UI.showCountdown(remaining);
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
  UI.hideCountdown();
}

// ===== Dealing Animation =====
function startDealingAnimation() {
  renderGameBoard();
  showDealingMessage();
  
  setTimeout(() => {
    renderCardsWithAnimation();
  }, 500);
}

function showDealingMessage() {
  const msg = document.createElement('div');
  msg.id = 'dealingMsg';
  msg.className = 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ' +
                  'bg-base-300 px-6 py-4 rounded-2xl text-lg z-[100] animate-pulse';
  msg.textContent = '🎴 در حال پخش کارت...';
  document.body.appendChild(msg);
}

function hideDealingMessage() {
  const msg = document.getElementById('dealingMsg');
  if (msg) msg.remove();
}

function renderGameBoard() {
  const gameEl = document.getElementById('game');
  gameEl.classList.remove('my-turn');
  
  UI.text('score0', state.totalScores[0]);
  UI.text('score1', state.totalScores[1]);
  
  if (state.scoreLimit) {
    UI.text('scoreLimitGame', `سقف: ${state.scoreLimit}`);
  }
  
  UI.text('contractDisplay', '');
  UI.text('trumpDisplay', '');
  
  // Clear
  document.getElementById('myHand').innerHTML = '';
  document.getElementById('playedCards').innerHTML = '';
  document.getElementById('proposalOverlay').classList.add('hidden');
  
  // Render opponent info without cards
  const positions = ['Right', 'Top', 'Left'];
  const indices = [(myIndex + 1) % 4, (myIndex + 2) % 4, (myIndex + 3) % 4];
  
  positions.forEach((pos, i) => {
    const pIndex = indices[i];
    const player = state.players[pIndex];
    const elem = document.getElementById('player' + pos);
    
    elem.querySelector('.opponent-name').textContent = player?.name || '';
    elem.querySelector('.card-count').textContent = state.handCounts[pIndex];
    elem.querySelector('.opponent-cards').innerHTML = '';
  });
  
  // My name
  UI.text('myName', playerNames[myIndex] || 'شما');
  UI.text('turnIndicator', '');
}

function renderCardsWithAnimation() {
  const hand = state.hand || [];
  const container = document.getElementById('myHand');
  const cardWidth = window.innerWidth < 400 ? 50 : 60;
  
  hand.forEach((card, i) => {
    const style = UI.getHandCardStyle(i, hand.length, cardWidth);
    const color = ['♥', '♦'].includes(card.s) ? 'red' : 'black';
    
    const cardEl = document.createElement('div');
    cardEl.className = `playing-card hand-card ${color} animate-fly-up`;
    cardEl.dataset.index = i;
    cardEl.style.cssText = UI.styleString(style);
    cardEl.style.animationDelay = `${i * 80}ms`;
    
    cardEl.innerHTML = `
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
    
    container.appendChild(cardEl);
  });
  
  // Opponent cards with animation
  const positions = ['Right', 'Top', 'Left'];
  const indices = [(myIndex + 1) % 4, (myIndex + 2) % 4, (myIndex + 3) % 4];
  
  positions.forEach((pos, pi) => {
    const pIndex = indices[pi];
    const count = Math.min(state.handCounts[pIndex], 6);
    const elem = document.getElementById('player' + pos);
    const cardsContainer = elem.querySelector('.opponent-cards');
    const cardClass = pos === 'Top' ? 'opponent-card-top' : 'opponent-card-side';
    
    for (let i = 0; i < count; i++) {
      const cardBack = document.createElement('div');
      cardBack.className = `card-back ${cardClass} animate-fly-up`;
      cardBack.style.animationDelay = `${pi * 300 + i * 50}ms`;
      cardsContainer.appendChild(cardBack);
    }
  });
  
  const totalDelay = Math.max(hand.length * 80, 3 * 300 + 6 * 50) + 500;
  setTimeout(() => {
    hideDealingMessage();
    render();
  }, totalDelay);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  // Mode selection listeners
  document.querySelectorAll('input[name="gameMode"]').forEach(radio => {
    radio.addEventListener('change', updateModeButton);
  });
  
  // Prevent scroll during drag
  document.addEventListener('touchmove', (e) => {
    if (isDragging) e.preventDefault();
  }, { passive: false });
  
  // Handle visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && socket.connected) {
      socket.emit('ping');
    }
  });
});

// Ping to keep connection alive
setInterval(() => {
  if (socket.connected) socket.emit('ping');
}, 25000);

socket.on('pong', () => {});