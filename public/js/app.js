const socket = io();
let myIndex = -1;
let state = null;
let selected = [];
let selectedSuit = null;
let playerNames = [];
let draggedCard = null;
let draggedIndex = -1;
let dragOffset = { x: 0, y: 0 };

// ==================== Socket Events ====================
socket.on('connect', () => console.log('Connected'));

socket.on('error', msg => {
  alert(msg);
});

socket.on('joined', async data => {
  myIndex = data.index;
  document.getElementById('waitingRoom').style.display = 'block';
  
  if (data.isRejoin) {
    addLog('اتصال مجدد برقرار شد', 'info');
  }
  
  // شروع Voice Chat
  const voiceInitialized = await initVoiceChat(socket, myIndex);
  if (!voiceInitialized) {
    console.warn('Voice chat not initialized');
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
  // انیمیشن کارت بازی شده
});

socket.on('roundResult', data => {
  showRoundResult(data);
});

socket.on('matchEnded', data => {
  showMatchEnd(data);
});

socket.on('proposalRestart', data => {
  hideProposalPanel();
  addLog('⚠️ ' + data.reason, 'info');
});

socket.on('playerDisconnected', data => {
  addLog(`❌ ${data.name} قطع شد`, 'info');
});

// ==================== Actions ====================
function joinRoom() {
  const name = document.getElementById('nameInput').value.trim();
  const room = document.getElementById('roomInput').value.trim();
  if (!name || !room) {
    alert('نام و کد اتاق را وارد کنید');
    return;
  }
  socket.emit('join', { code: room, name });
}

function setReady() {
  socket.emit('playerReady');
  document.getElementById('readyBtn').disabled = true;
  document.getElementById('readyBtn').textContent = '⏳ منتظر بقیه...';
}

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

// ==================== Rendering ====================
function render() {
  if (!state) return;
  
  const gameEl = document.getElementById('game');
  const isMyTurn = state.turn === state.myIndex;
  const isProposing = state.phase === 'propose';
  
  // کلاس‌های حالت
  gameEl.classList.toggle('my-turn', isMyTurn && state.phase === 'playing');
  gameEl.classList.toggle('game-proposing', isProposing && state.turn !== state.myIndex);
  
  // امتیازات
  document.getElementById('score0').textContent = state.totalScores[0];
  document.getElementById('score1').textContent = state.totalScores[1];
  
  // قرارداد و حکم
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
  
  // بازیکنان دیگر
  renderOpponents();
  
  // کارت‌های بازی شده
  renderPlayedCards();
  
  // دست من
  renderMyHand();
  
  // کنترل‌ها
  renderControls();
  
  // Drop zone hint
  const dropHint = document.getElementById('dropHint');
  if (isMyTurn && state.phase === 'playing' && state.playedCards.length < 4) {
    dropHint.style.display = 'block';
  } else {
    dropHint.style.display = 'none';
  }
  
  // مودال‌ها و پیشنهاد
  if (state.phase === 'propose') {
    const overlay = document.getElementById('proposalOverlay');
    const waitingMsg = document.getElementById('waitingMessage');
    
    if (state.turn === state.myIndex) {
      // نوبت من - نمایش منوی پیشنهاد
      overlay.style.display = 'none';
      showProposalPanel();
    } else {
      // نوبت دیگران - نمایش پیام انتظار
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
    document.getElementById('proposalOverlay').style.display = 'none';
  }
  
  if (state.phase === 'selectMode' && state.leader === state.myIndex) {
    showModal('modeModal');
  }
}

function renderPlayerList(players) {
  const container = document.getElementById('playersList');
  let html = '';
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    if (p) {
      const classes = ['player-slot', 'filled'];
      if (p.ready) classes.push('ready');
      if (i === myIndex) classes.push('me');
      html += `
        <div class="${classes.join(' ')}">
          <div class="name">${p.name}</div>
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
    const cardHtml = createCardHtml(pc.c, -1, false, 'small');
    html += `<div class="played-card pos-${relPos}">${cardHtml}</div>`;
  });
  container.innerHTML = html;
}

function renderMyHand() {
  const container = document.getElementById('myHand');
  const myName = state.players[myIndex]?.name || 'شما';
  
  document.getElementById('myName').textContent = myName;
  document.getElementById('turnIndicator').textContent = 
    state.turn === myIndex ? '🎯 نوبت شما' : '';
  
  const canSelect = state.phase === 'exchange' && state.leader === myIndex;
  const canPlay = state.phase === 'playing' && state.turn === myIndex;
  
  let html = '';
  (state.hand || []).forEach((card, i) => {
    const isSelected = selected.includes(i);
    const classes = [];
    if (isSelected) classes.push('selected');
    if (!canSelect && !canPlay) classes.push('disabled');
    
    html += createCardHtml(card, i, isSelected, '', classes.join(' '));
  });
  container.innerHTML = html;
  
  // Setup drag events
  if (canPlay) {
    setupDragEvents();
  }
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

// ==================== Proposal Panel ====================
function showProposalPanel() {
  const panel = document.getElementById('proposalPanel');
  panel.style.display = 'block';
  
  // ساخت grid اعداد
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
  
  // لاگ کوچک
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

// ==================== Drag & Drop ====================
function setupDragEvents() {
  const cards = document.querySelectorAll('#myHand .card:not(.disabled)');
  
  cards.forEach(card => {
    // Touch events
    card.addEventListener('touchstart', handleDragStart, { passive: false });
    card.addEventListener('touchmove', handleDragMove, { passive: false });
    card.addEventListener('touchend', handleDragEnd);
    card.addEventListener('touchcancel', handleDragEnd);
    
    // Mouse events
    card.addEventListener('mousedown', handleDragStart);
  });
  
  document.addEventListener('mousemove', handleDragMove);
  document.addEventListener('mouseup', handleDragEnd);
}

function handleDragStart(e) {
  if (!state || state.phase !== 'playing' || state.turn !== myIndex) return;
  
  const card = e.target.closest('.card');
  if (!card || card.classList.contains('disabled')) return;
  
  e.preventDefault();
  
  draggedIndex = parseInt(card.dataset.index);
  if (isNaN(draggedIndex)) return;
  
  const rect = card.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  
  dragOffset.x = point.clientX - rect.left;
  dragOffset.y = point.clientY - rect.top;
  
  // ساخت ghost card
  draggedCard = card.cloneNode(true);
  draggedCard.classList.add('card-ghost');
  draggedCard.style.width = rect.width + 'px';
  draggedCard.style.height = rect.height + 'px';
  document.body.appendChild(draggedCard);
  
  updateGhostPosition(point);
  
  card.style.opacity = '0.3';
}

function handleDragMove(e) {
  if (!draggedCard) return;
  
  e.preventDefault();
  
  const point = e.touches ? e.touches[0] : e;
  updateGhostPosition(point);
  
  // Check if over drop zone
  const dropZone = document.getElementById('dropZone');
  const dropRect = dropZone.getBoundingClientRect();
  
  if (point.clientX >= dropRect.left && point.clientX <= dropRect.right &&
      point.clientY >= dropRect.top && point.clientY <= dropRect.bottom) {
    dropZone.classList.add('drag-over');
  } else {
    dropZone.classList.remove('drag-over');
  }
}

function handleDragEnd(e) {
  if (!draggedCard) return;
  
  const dropZone = document.getElementById('dropZone');
  const wasOverDrop = dropZone.classList.contains('drag-over');
  
  // Cleanup
  dropZone.classList.remove('drag-over');
  draggedCard.remove();
  draggedCard = null;
  
  // Reset original card opacity
  const cards = document.querySelectorAll('#myHand .card');
  cards.forEach(c => c.style.opacity = '1');
  
  // Play card if dropped in zone
  if (wasOverDrop && draggedIndex >= 0) {
    playCard(draggedIndex);
  }
  
  draggedIndex = -1;
}

function updateGhostPosition(point) {
  if (!draggedCard) return;
  
  draggedCard.style.left = (point.clientX - dragOffset.x) + 'px';
  draggedCard.style.top = (point.clientY - dragOffset.y) + 'px';
}

// ==================== Helpers ====================
function createCardHtml(card, index, isSelected = false, sizeClass = '', extraClass = '') {
  const color = ['♥', '♦'].includes(card.s) ? 'red' : 'black';
  const classes = ['card', color, sizeClass, extraClass].filter(Boolean).join(' ');
  const onclick = index >= 0 ? `onclick="clickCard(${index})"` : '';
  
  return `
    <div class="${classes}" data-index="${index}" ${onclick}>
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
  const diff = (playerIndex - myIndex + 4) % 4;
  return diff;
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
  
  // حداکثر 3 لاگ
  while (container.children.length >= 3) {
    container.removeChild(container.firstChild);
  }
  
  container.appendChild(item);
  
  // پاک کردن بعد از 5 ثانیه
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
    return `<div class="${cls}">${createCardHtml(pc.card, -1, false, 'small')}</div>`;
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

// ==================== Event Listeners ====================
document.addEventListener('DOMContentLoaded', () => {
  // Mode selection
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
  
  // Prevent default touch behaviors
  document.addEventListener('touchmove', (e) => {
    if (draggedCard) {
      e.preventDefault();
    }
  }, { passive: false });
});