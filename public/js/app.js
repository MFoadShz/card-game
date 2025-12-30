const socket = io();

// === Global Variables ===
let myIndex = -1;
let state = null;
let selected = [];
let selectedSuit = null;
let playerNames = [];
let isHost = false;
let scoreLimit = 500;

// === Drag variables ===
let draggedCard = null;
let draggedCardEl = null;
let draggedIndex = -1;
let touchStartTime = 0;
let isTouchDevice = false;

// === Timer Variables (New) ===
let timerInterval = null;
let remainingTime = 30;
// Add after existing variables


// === Socket Connection ===
socket.on('connect', () => console.log('Connected'));

socket.on('error', msg => {
  alert(msg);
});

// === Room Events ===
socket.on('roomCreated', async data => {
  myIndex = data.index;
  isHost = data.isHost;
  scoreLimit = data.scoreLimit;
  showWaitingRoom();
  // فرض بر این است که initVoiceChat در فایل دیگری یا همین فایل تعریف شده است
  if (typeof initVoiceChat === 'function') {
      await initVoiceChat(socket, myIndex);
  }
});

socket.on('roomJoined', async data => {
  myIndex = data.index;
  isHost = data.isHost;
  scoreLimit = data.scoreLimit;
  showWaitingRoom();
  if (data.isRejoin) {
    addLog('اتصال مجدد برقرار شد', 'info');
  }
  if (typeof initVoiceChat === 'function') {
      await initVoiceChat(socket, myIndex);
  }
});

socket.on('updatePlayerList', players => {
  playerNames = players.map(p => p.name);
  renderPlayerList(players);
});

socket.on('gameState', data => {
  state = data;
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  render();
});

// === Game Events ===
socket.on('proposalUpdate', data => {
  const text = data.action === 'call' ? `${data.name}: ${data.value}` : `${data.name}: پاس`;
  const type = data.action === 'call' ? 'call' : 'pass';
  addLog(text, type);
  updateProposalLogMini(data);
});

socket.on('leaderSelected', data => {
  hideProposalPanel();
  addLog(`👑 ${data.name} حاکم شد - قرارداد: ${data.contract}`, 'info');
});

socket.on('modeSelected', data => {
  hideModal('modeModal');
  const modeNames = { hokm: 'حکم', nars: 'نرس', asNars: 'آس‌نرس', sars: 'سرس' };
  const modeName = modeNames[data.gameMode] || data.gameMode;
  const suitText = data.masterSuit ? ` - ${data.masterSuit}` : '';
  addLog(`🎯 ${data.name}: ${modeName}${suitText}`, 'info');
});

socket.on('cardAction', data => {
    // اگر لاجیک خاصی برای انیمیشن کارت‌ها دارید اینجا قرار می‌گیرد
});

// === Timer & Bot Events (New) ===
socket.on('timerStart', data => {
  startTimerUI(data.duration);
});

socket.on('botAction', data => {
  const actionText = data.result.isBot ? '🤖' : '';
  if (data.result.action === 'playCard') {
    addLog(`${actionText} ${data.name} (خودکار) کارت بازی کرد`, 'info');
  } else if (data.result.action === 'pass') {
    addLog(`${actionText} ${data.name} (خودکار) پاس کرد`, 'pass');
  } else if (data.result.action === 'call') {
    addLog(`${actionText} ${data.name} (خودکار): ${data.result.value}`, 'call');
  }
});

// === Result Events ===
socket.on('roundResult', data => {
  showRoundResult(data);
});

socket.on('matchEnded', data => {
  if (!data.gameOver) {
    showMatchEnd(data);
  }
});

socket.on('gameOver', data => {
  showGameOver(data);
});

socket.on('gameReset', () => {
  hideModal('gameOverModal');
  document.getElementById('lobby').style.display = 'flex';
  document.getElementById('game').style.display = 'none';
  showWaitingRoom();
});

socket.on('proposalRestart', data => {
  hideProposalPanel();
  addLog('⚠️ ' + data.reason, 'info');
});

socket.on('playerDisconnected', data => {
  addLog(`❌ ${data.name} قطع شد`, 'info');
});

// === Lobby Functions ===
function showCreateForm() {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('createForm').style.display = 'block';
}

function showJoinForm() {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('joinForm').style.display = 'block';
}

function backToWelcome() {
  document.getElementById('welcomeScreen').style.display = 'block';
  document.getElementById('createForm').style.display = 'none';
  document.getElementById('joinForm').style.display = 'none';
}

function createRoom() {
  const name = document.getElementById('createName').value.trim();
  const code = document.getElementById('createCode').value.trim();
  const password = document.getElementById('createPassword').value;
  const limit = document.getElementById('createScoreLimit').value;

  if (!name || !code) {
    alert('نام و کد اتاق الزامی است');
    return;
  }

  socket.emit('createRoom', { code, name, password, scoreLimit: limit });
}

function joinRoom() {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('joinCode').value.trim();
  const password = document.getElementById('joinPassword').value;

  if (!name || !code) {
    alert('نام و کد اتاق الزامی است');
    return;
  }

  socket.emit('joinRoom', { code, name, password });
}

function showWaitingRoom() {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('createForm').style.display = 'none';
  document.getElementById('joinForm').style.display = 'none';
  document.getElementById('waitingRoom').style.display = 'block';
  document.getElementById('scoreLimitDisplay').textContent = `سقف امتیاز: ${scoreLimit}`;
}

function setReady() {
  socket.emit('playerReady');
  document.getElementById('readyBtn').disabled = true;
  document.getElementById('readyBtn').textContent = '⏳ منتظر بقیه...';
}

// === Game Actions ===
function clickCard(index) {
  if (!state) return;
  if (state.phase === 'exchange' && state.myIndex === state.leader) {
    if (selected.includes(index)) {
      selected = selected.filter(i => i !== index);
    } else if (selected.length < 4) {
      selected.push(index);
    }
    render();
  } else if (state.phase === 'playing' && state.turn === state.myIndex) {
    playCard(index);
  }
}

function playCard(index) {
  socket.emit('playCard', index);
}

function doExchange() {
  if (selected.length !== 4) {
    alert('۴ کارت انتخاب کنید');
    return;
  }
  socket.emit('exchangeCards', selected);
  selected = [];
}

function submitProposalValue(value) {
  socket.emit('submitProposal', value);
}

function passProposal() {
  socket.emit('passProposal');
}

function selectSuit(suit) {
  selectedSuit = suit;
  document.querySelectorAll('.suit-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.suit === suit);
  });
  updateModeButton();
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
  hideModal('modeModal');
}

function playAgain() {
  hideModal('endModal');
  document.getElementById('readyBtn').disabled = false;
  document.getElementById('readyBtn').textContent = '✅ آماده‌ام!';
}

function resetGame() {
  socket.emit('resetGame');
}

// === Render Function (Updated) ===

function render(){
  if (!state) return;
  
  const gameEl = document.getElementById('game');
  const isMyTurn = state.turn === state.myIndex;
  const isProposing = state.phase === 'propose';

  gameEl.classList.toggle('my-turn', isMyTurn && state.phase === 'playing');
  gameEl.classList.toggle('game-proposing', isProposing && state.turn !== state.myIndex);

  document.getElementById('score0').textContent = state.totalScores[0];
  document.getElementById('score1').textContent = state.totalScores[1];
  
  if (document.getElementById('scoreLimitGame')) {
    document.getElementById('scoreLimitGame').textContent = `سقف: ${state.scoreLimit || 500}`;
  }

  if (state.contract > 100) {
    document.getElementById('contractDisplay').textContent = `قرارداد: ${state.contract}`;
  } else {
    document.getElementById('contractDisplay').textContent = '';
  }

  if (state.masterSuit) {
    const suitColor = ['♥', '♦'].includes(state.masterSuit) ? 'color:red' : '';
    document.getElementById('trumpDisplay').innerHTML = `حکم: <span style="${suitColor}">${state.masterSuit}</span>`;
  } else if (state.gameMode === 'sars') {
    document.getElementById('trumpDisplay').textContent = 'سَرس (بدون حکم)';
  } else {
    document.getElementById('trumpDisplay').textContent = '';
  }

  renderOpponents();
  renderPlayedCards();
  renderMyHand();
  renderControls();

  // Animate cards after dealing
  if (dealingAnimation.isDealing === false && isFirstRender) {
    isFirstRender = false;
    setTimeout(() => {
      dealingAnimation.animateHand(document.getElementById('myHand'));
      ['Top', 'Left', 'Right'].forEach(pos => {
        dealingAnimation.animateOpponent(document.getElementById('player' + pos));
      });
    }, 100);
  }

  const dropHint = document.getElementById('dropHint');
  if (dropHint) {
    if (isMyTurn && state.phase === 'playing' && state.playedCards.length < 4) {
      dropHint.style.display = 'block';
    } else {
      dropHint.style.display = 'none';
    }
  }

  if (state.phase === 'propose') {
    const overlay = document.getElementById('proposalOverlay');
    const waitingMsg = document.getElementById('waitingMessage');
    if (state.turn === state.myIndex) {
      overlay.style.display = 'none';
      showProposalPanel();
    } else {
      hideProposalPanel();
      overlay.style.display = 'flex';
      const currentPlayerName = state.players[state.turn]?.name || 'بازیکن';
      waitingMsg.innerHTML = `
        <span class="player-name">${currentPlayerName}</span>
        در حال انتخاب<span class="dots"></span>
      `;
    }
  } else {
    hideProposalPanel();
    const overlay = document.getElementById('proposalOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  if (state.phase === 'selectMode' && state.leader === state.myIndex) {
    showModal('modeModal');
  }
}
// === Rendering Helpers ===
function renderPlayerList(players) {
  const container = document.getElementById('playersList');
  let html = '';
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    if (p) {
      const classes = ['player-slot', 'filled'];
      if (p.ready) classes.push('ready');
      if (i === myIndex) classes.push('me');
      if (p.isHost) classes.push('host');
      html += `
        <div class="${classes.join(' ')}">
          <div class="name">${p.name} ${p.isHost ? '👑' : ''}</div>
          <div class="status">${p.ready ? '✅ آماده' : '⏳ منتظر'}</div>
        </div>
      `;
    } else {
      html += `
        <div class="player-slot">
          <div class="name">---</div>
          <div class="status">خالی</div>
        </div>
      `;
    }
  }
  container.innerHTML = html;
}

function renderOpponents() {
  const positions = ['top', 'left', 'right'];
  const relativeIndices = [
    (myIndex + 2) % 4,
    (myIndex + 3) % 4,
    (myIndex + 1) % 4
  ];

  positions.forEach((pos, i) => {
    const pIndex = relativeIndices[i];
    const elem = document.getElementById('player' + pos.charAt(0).toUpperCase() + pos.slice(1));
    const name = state.players[pIndex]?.name || '---';
    const count = state.handCounts[pIndex] || 0;

    elem.classList.toggle('turn', state.turn === pIndex);
    elem.classList.toggle('leader', state.leader === pIndex);

    elem.querySelector('.opponent-name').textContent = name;
    elem.querySelector('.card-count').textContent = count;

    const cardsContainer = elem.querySelector('.opponent-cards');
    const displayCount = Math.min(count, 6);
    let cardsHtml = '';
    for (let j = 0; j < displayCount; j++) {
      cardsHtml += '<div class="card-back"></div>';
    }
    cardsContainer.innerHTML = cardsHtml;
  });
}

function renderPlayedCards() {
  const container = document.getElementById('playedCards');
  if (!state.playedCards || state.playedCards.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  state.playedCards.forEach(pc => {
    const relPos = getRelativePosition(pc.p);
    const cardHtml = createCardHtml(pc.c, 'small');
    html += `<div class="played-card pos-${relPos}">${cardHtml}</div>`;
  });
  container.innerHTML = html;
}

function renderMyHand() {
  const container = document.getElementById('myHand');
  const hand = state.hand || [];
  const cardCount = hand.length;
  const myName = playerNames[myIndex] || 'شما';

  document.getElementById('myName').textContent = myName;
  document.getElementById('turnIndicator').textContent =
    (state.turn === state.myIndex && state.phase === 'playing') ? '🎯 نوبت شماست!' : '';

  if (cardCount === 0) {
    container.innerHTML = '';
    return;
  }

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

  let html = '';
  hand.forEach((card, i) => {
    const isSelected = selected.includes(i);
    const isLeader = state.leader === state.myIndex;
    const isExchange = state.phase === 'exchange' && isLeader;
    const isPlaying = state.phase === 'playing' && state.turn === state.myIndex;
    const canSelect = isExchange;
    const canPlay = isPlaying;
    const angle = startAngle + (i * angleStep);
    const zIndex = i + 1;
    const color = ['♥', '♦'].includes(card.s) ? 'red' : 'black';
    const classes = ['card', color];
    if (isSelected) classes.push('selected');
    if (!canSelect && !canPlay) classes.push('disabled');

    html += `
      <div class="${classes.join(' ')}"
           data-index="${i}"
           style="
             --angle: ${angle}deg;
             --fan-radius: ${fanRadius}px;
             width: ${cardWidth}px;
             height: ${cardHeight}px;
             z-index: ${zIndex};
           ">
        <div class="corner corner-top">
          <span class="rank">${card.v}</span>
          <span class="suit-icon">${card.s}</span>
        </div>
        <span class="center-suit">${card.s}</span>
        <div class="corner corner-bottom">
          <span class="rank">${card.v}</span>
          <span class="suit-icon">${card.s}</span>
        </div>
      </div>`;
  });
  container.innerHTML = html;
  setupCardInteractions();
}

// === Interaction Handlers ===
function setupCardInteractions() {
  const cards = document.querySelectorAll('#myHand .card');
  cards.forEach(card => {
    card.addEventListener('touchstart', handleTouchStart, { passive: false });
    card.addEventListener('touchmove', handleTouchMove, { passive: false });
    card.addEventListener('touchend', handleTouchEnd);
    card.addEventListener('touchcancel', handleTouchEnd);
    card.addEventListener('mousedown', handleMouseDown);
    card.addEventListener('click', handleCardClick);
  });
}

function handleCardClick(e) {
  if (isTouchDevice) return;
  const card = e.target.closest('.card');
  if (!card || card.classList.contains('disabled')) return;
  const index = parseInt(card.dataset.index);
  if (isNaN(index)) return;
  clickCard(index);
}

function handleTouchStart(e) {
  isTouchDevice = true;
  const card = e.target.closest('.card');
  if (!card || card.classList.contains('disabled')) return;
  e.preventDefault();
  touchStartTime = Date.now();
  draggedIndex = parseInt(card.dataset.index);
  if (isNaN(draggedIndex)) return;
  draggedCardEl = card;
  const touch = e.touches[0];
  const rect = card.getBoundingClientRect();
  card._offsetX = touch.clientX - rect.right + 10;
  card._offsetY = touch.clientY - rect.bottom + 10;
  card._startX = touch.clientX;
  card._startY = touch.clientY;
  card._moved = false;
}

function handleTouchMove(e) {
  if (draggedIndex < 0 || !draggedCardEl) return;
  e.preventDefault();
  const touch = e.touches[0];
  const dx = Math.abs(touch.clientX - draggedCardEl._startX);
  const dy = Math.abs(touch.clientY - draggedCardEl._startY);
  if (dx > 10 || dy > 10) {
    draggedCardEl._moved = true;
    if (!draggedCard) {
      createGhostCard(draggedCardEl, touch);
    }
    if (draggedCard) {
      draggedCard.style.left = (touch.clientX - draggedCard.offsetWidth + 15) + 'px';
      draggedCard.style.top = (touch.clientY - draggedCard.offsetHeight + 15) + 'px';
    }
    checkDropZone(touch.clientX, touch.clientY);
  }
}

function handleTouchEnd(e) {
  if (draggedIndex < 0) return;
  const touchDuration = Date.now() - touchStartTime;
  const wasDragging = draggedCardEl && draggedCardEl._moved;
  const dropZone = document.getElementById('dropZone');
  const wasOverDrop = dropZone.classList.contains('drag-over');

  if (draggedCard) {
    draggedCard.remove();
    draggedCard = null;
  }
  if (draggedCardEl) {
    draggedCardEl.classList.remove('dragging');
  }
  dropZone.classList.remove('drag-over');

  const index = draggedIndex;
  draggedIndex = -1;
  draggedCardEl = null;

  if (wasDragging && wasOverDrop) {
    if (state.phase === 'playing' && state.turn === state.myIndex) {
      playCard(index);
    }
  } else if (!wasDragging && touchDuration < 300) {
    clickCard(index);
  }
}

function handleMouseDown(e) {
  if (isTouchDevice) return;
  const card = e.target.closest('.card');
  if (!card || card.classList.contains('disabled')) return;
  if (state.phase !== 'playing' || state.turn !== state.myIndex) return;
  e.preventDefault();
  draggedIndex = parseInt(card.dataset.index);
  if (isNaN(draggedIndex)) return;
  draggedCardEl = card;
  const rect = card.getBoundingClientRect();
  card._offsetX = e.clientX - rect.right + 10;
  card._offsetY = e.clientY - rect.bottom + 10;
  card._startX = e.clientX;
  card._startY = e.clientY;
  card._moved = false;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
  if (draggedIndex < 0 || !draggedCardEl) return;
  const dx = Math.abs(e.clientX - draggedCardEl._startX);
  const dy = Math.abs(e.clientY - draggedCardEl._startY);
  if (dx > 5 || dy > 5) {
    draggedCardEl._moved = true;
    if (!draggedCard) {
      createGhostCard(draggedCardEl, e);
    }
    if (draggedCard) {
      draggedCard.style.left = (e.clientX - draggedCard.offsetWidth + 15) + 'px';
      draggedCard.style.top = (e.clientY - draggedCard.offsetHeight + 15) + 'px';
    }
    checkDropZone(e.clientX, e.clientY);
  }
}

function handleMouseUp(e) {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  if (draggedIndex < 0) return;
  const wasDragging = draggedCardEl && draggedCardEl._moved;
  const dropZone = document.getElementById('dropZone');
  const wasOverDrop = dropZone.classList.contains('drag-over');

  if (draggedCard) {
    draggedCard.remove();
    draggedCard = null;
  }
  if (draggedCardEl) {
    draggedCardEl.classList.remove('dragging');
  }
  dropZone.classList.remove('drag-over');

  const index = draggedIndex;
  draggedIndex = -1;
  draggedCardEl = null;

  if (wasDragging && wasOverDrop) {
    playCard(index);
  }
}

function createGhostCard(card, point) {
  card.classList.add('dragging');
  draggedCard = card.cloneNode(true);
  draggedCard.classList.remove('selected', 'disabled', 'dragging');
  draggedCard.classList.add('card-ghost');
  draggedCard.style.width = card.offsetWidth + 'px';
  draggedCard.style.height = card.offsetHeight + 'px';
  draggedCard.style.left = (point.clientX - card.offsetWidth + 15) + 'px';
  draggedCard.style.top = (point.clientY - card.offsetHeight + 15) + 'px';
  document.body.appendChild(draggedCard);
}

function checkDropZone(x, y) {
  const dropZone = document.getElementById('dropZone');
  const rect = dropZone.getBoundingClientRect();
  const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  dropZone.classList.toggle('drag-over', isOver);
}

function renderControls() {
  const container = document.getElementById('controls');
  if (state.phase === 'exchange' && state.leader === myIndex) {
    container.innerHTML = `
      <button class="btn-primary" onclick="doExchange()">
        ✅ تایید تعویض (${selected.length}/4)
      </button>
    `;
  } else {
    container.innerHTML = '';
  }
}

function showProposalPanel() {
  const panel = document.getElementById('proposalPanel');
  panel.style.display = 'block';
  const grid = document.getElementById('proposalGrid');
  let html = '';
  for (let val = 100; val <= 165; val += 5) {
    const isDisabled = val <= state.contract && state.leader !== -1;
    const isAvailable = !isDisabled;
    const classes = ['proposal-btn'];
    if (isAvailable) classes.push('available');
    html += `
      <button class="${classes.join(' ')}"
              ${isDisabled ? 'disabled' : ''}
              onclick="submitProposalValue(${val})">
        ${val}
      </button>
    `;
  }
  grid.innerHTML = html;
  updateProposalLogMiniFromState();
}

function hideProposalPanel() {
  document.getElementById('proposalPanel').style.display = 'none';
}

function updateProposalLogMini(data) {
  const container = document.getElementById('proposalLogMini');
  const type = data.action === 'call' ? 'call' : 'pass';
  const text = data.action === 'call' ? data.value : 'پاس';
  container.innerHTML += `<span class="log-item ${type}">${data.name}: ${text}</span>`;
}

function updateProposalLogMiniFromState() {
  const container = document.getElementById('proposalLogMini');
  if (!state || !state.proposalLog) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = state.proposalLog.map(log => {
    const name = state.players[log.player]?.name || 'بازیکن';
    const type = log.action === 'call' ? 'call' : 'pass';
    const text = log.action === 'call' ? log.value : 'پاس';
    return `<span class="log-item ${type}">${name}: ${text}</span>`;
  }).join('');
}

function createCardHtml(card, sizeClass = '') {
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
}

function getRelativePosition(playerIndex) {
  return (playerIndex - myIndex + 4) % 4;
}

function showModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function hideModal(id) {
  document.getElementById(id).style.display = 'none';
}

function addLog(msg, type = 'info') {
  const container = document.getElementById('gameLog');
  const item = document.createElement('div');
  item.className = 'log-item ' + type;
  item.textContent = msg;
  while (container.children.length >= 3) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(item);
  setTimeout(() => {
    if (item.parentNode === container) {
      item.remove();
    }
  }, 5000);
}

function updateModeButton() {
  const btn = document.getElementById('confirmModeBtn');
  const modeRadio = document.querySelector('input[name="gameMode"]:checked');
  if (!modeRadio) {
    btn.disabled = true;
    btn.textContent = 'حالت را انتخاب کنید';
    return;
  }
  const mode = modeRadio.value;
  if (mode === 'sars') {
    btn.disabled = false;
    btn.textContent = '✅ تایید سَرس';
  } else if (selectedSuit) {
    btn.disabled = false;
    btn.textContent = '✅ تایید انتخاب';
  } else {
    btn.disabled = true;
    btn.textContent = 'خال حکم را انتخاب کنید';
  }
}

function showRoundResult(data) {
  const modal = document.getElementById('resultModal');
  const title = document.getElementById('resultTitle');
  const cards = document.getElementById('resultCards');
  const points = document.getElementById('resultPoints');

  title.textContent = `🏆 ${data.winnerName} برد!`;
  cards.innerHTML = data.playedCards.map(pc => {
    const cls = pc.isWinner ? 'winner' : '';
    return `<div class="${cls}">${createCardHtml(pc.card, 'small')}</div>`;
  }).join('');
  points.innerHTML = `
    امتیاز این دست: ${data.points}<br>
    تیم ۱: ${data.roundPoints[0]} | تیم ۲: ${data.roundPoints[1]}
  `;
  showModal('resultModal');
  setTimeout(() => hideModal('resultModal'), 2500);
}

function showMatchEnd(data) {
  const modal = document.getElementById('endModal');
  const title = document.getElementById('endTitle');
  const details = document.getElementById('endDetails');

  const myTeam = myIndex % 2;
  const won = data.success ? data.leaderTeam === myTeam : data.leaderTeam !== myTeam;

  modal.querySelector('.modal-content').className = 'modal-content end-modal ' + (won ? 'win' : 'lose');
  title.textContent = won ? '🎉 برنده شدید!' : '😔 باختید';

  const resultText = data.success ? 'قرارداد موفق ✅' : 'قرارداد ناموفق ❌';
  details.innerHTML = `
    ${resultText}<br>
    قرارداد: ${data.contract}<br>
    امتیاز تیم ۱: ${data.points[0]} | تیم ۲: ${data.points[1]}<br>
    <hr style="margin:10px 0;border-color:#444">
    مجموع تیم ۱: ${data.totalScores[0]}<br>
    مجموع تیم ۲: ${data.totalScores[1]}
  `;

  showModal('endModal');
}

function showGameOver(data) {
  const modal = document.getElementById('gameOverModal');
  const title = document.getElementById('gameOverTitle');
  const details = document.getElementById('gameOverDetails');
  const history = document.getElementById('gameHistory');

  const myTeam = myIndex % 2;
  const won = data.winner === myTeam;

  modal.querySelector('.modal-content').className = 'modal-content game-over-modal ' + (won ? 'win' : 'lose');
  title.textContent = won ? '🏆 تبریک! شما برنده شدید!' : '😔 متأسفانه باختید';

  details.innerHTML = `
    <div class="final-scores">
      <div class="team-score ${data.winner === 0 ? 'winner' : ''}">
        <span class="label">تیم ۱</span>
        <span class="score">${data.totalScores[0]}</span>
      </div>
      <div class="vs">VS</div>
      <div class="team-score ${data.winner === 1 ? 'winner' : ''}">
        <span class="label">تیم ۲</span>
        <span class="score">${data.totalScores[1]}</span>
      </div>
    </div>
    <p>سقف امتیاز: ${data.scoreLimit}</p>
  `;

  // Render match history
  let historyHtml = '<h4>تاریخچه دست‌ها:</h4>';
  data.matchHistory.forEach((match, idx) => {
    const modeNames = { hokm: 'حکم', nars: 'نرس', asNars: 'آس‌نرس', sars: 'سرس' };
    historyHtml += `
      <div class="match-item ${match.success ? 'success' : 'failed'}">
        <div class="match-header">
          <span>دست ${idx + 1}</span>
          <span>${match.leaderName} - ${modeNames[match.gameMode]} ${match.masterSuit || ''}</span>
          <span>قرارداد: ${match.contract}</span>
        </div>
        <div class="match-scores">
          تیم ۱: ${match.points[0]} | تیم ۲: ${match.points[1]}
          ${match.success ? '✅' : '❌'}
        </div>
        <div class="match-cards">
          ${match.gameHistory.slice(0, 20).map(h => 
            `<span class="history-card ${['♥','♦'].includes(h.card.s) ? 'red' : 'black'}">${h.card.v}${h.card.s}</span>`
          ).join('')}
          ${match.gameHistory.length > 20 ? '...' : ''}
        </div>
      </div>
    `;
  });
  history.innerHTML = historyHtml;

  const resetBtn = document.getElementById('resetGameBtn');
  if (isHost) {
    resetBtn.style.display = 'block';
    resetBtn.onclick = resetGame;
  } else {
    resetBtn.style.display = 'none';
  }

  showModal('gameOverModal');
}

// === DOM & Window Events ===
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[name="gameMode"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const suitSelector = document.getElementById('suitSelector');
      if (this.value === 'sars') {
        suitSelector.style.display = 'none';
        selectedSuit = null;
      } else {
        suitSelector.style.display = 'block';
      }
      updateModeButton();
    });
  });

  document.addEventListener('touchmove', (e) => {
    if (draggedCard) {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('resize', () => {
    if (state) {
      renderMyHand();
    }
  });
});

// === Helper Functions for Timer (New) ===
function startTimerUI(duration) {
  stopTimerUI();
  remainingTime = duration;
  updateTimerDisplay();
  
  timerInterval = setInterval(() => {
    remainingTime--;
    updateTimerDisplay();
    
    if (remainingTime <= 0) {
      stopTimerUI();
    }
  }, 1000);
}

function stopTimerUI() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('turnTimer');
  if (!timerEl) return;
  
  // اگر نوبت ما نیست یا state نداریم، شاید بخواهیم تایمر را مخفی کنیم
  // اما در کد اصلی شما چک می‌کند که turn === myIndex باشد
  if (!state || state.turn !== state.myIndex) {
    timerEl.style.display = 'none';
    return;
  }
  
  timerEl.style.display = 'block';
  timerEl.textContent = `⏱️ ${remainingTime}`;
  
  // تغییر رنگ بر اساس زمان باقیمانده
  if (remainingTime <= 5) {
    timerEl.classList.add('critical');
    timerEl.classList.remove('warning');
  } else if (remainingTime <= 10) {
    timerEl.classList.add('warning');
    timerEl.classList.remove('critical');
  } else {
    timerEl.classList.remove('warning', 'critical');
  }
}