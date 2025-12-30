const socket = io();
let myIndex = -1;
let state = null;
let selected = [];
let selectedSuit = null;
let playerNames = [];

// ==================== Socket Events ====================
socket.on('connect', () => console.log('Connected'));

socket.on('error', msg => {
  alert(msg);
});

socket.on('joined', data => {
  myIndex = data.index;
  document.getElementById('waitingRoom').style.display = 'block';
  if (data.isRejoin) {
    console.log('Rejoined as player', myIndex);
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
  addProposalHistory(data);
});

socket.on('leaderSelected', data => {
  hideModal('proposalModal');
  showStatus(`👑 ${data.name} حاکم شد - قرارداد: ${data.contract}`);
});

socket.on('modeSelected', data => {
  hideModal('modeModal');
});

socket.on('cardAction', data => {
  // Card played animation handled in render
});

socket.on('roundResult', data => {
  showRoundResult(data);
});

socket.on('matchEnded', data => {
  showMatchEnd(data);
});

socket.on('proposalRestart', data => {
  showStatus('⚠️ ' + data.reason);
});

socket.on('playerDisconnected', data => {
  showStatus(`❌ ${data.name} قطع شد`);
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
    // انتخاب کارت برای تعویض
    if (selected.includes(index)) {
      selected = selected.filter(i => i !== index);
    } else if (selected.length < 4) {
      selected.push(index);
    }
    render();
  } else if (state.phase === 'playing' && state.turn === state.myIndex) {
    // بازی کارت
    socket.emit('playCard', index);
  }
}

function doExchange() {
  if (selected.length !== 4) {
    alert('۴ کارت انتخاب کنید');
    return;
  }
  socket.emit('exchangeCards', selected);
  selected = [];
}

function submitProposal() {
  const val = parseInt(document.getElementById('proposalValue').value);
  if (val >= 100 && val <= 165 && val % 5 === 0) {
    socket.emit('submitProposal', val);
  } else {
    alert('مقدار نامعتبر');
  }
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
  
  // مودال‌ها
  if (state.phase === 'propose' && state.turn === state.myIndex) {
    showModal('proposalModal');
    updateProposalModal();
  } else if (state.phase === 'selectMode' && state.leader === state.myIndex) {
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
    (myIndex + 2) % 4, // top (روبرو)
    (myIndex + 3) % 4, // left
    (myIndex + 1) % 4  // right
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
    
    // پشت کارت‌ها
    const cardsContainer = elem.querySelector('.opponent-cards');
    const isHorizontal = pos === 'top';
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
  // 0 = me (bottom), 1 = right, 2 = top, 3 = left
  return diff;
}

function showModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function hideModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showStatus(msg) {
  document.getElementById('statusMessage').textContent = msg;
  setTimeout(() => {
    if (document.getElementById('statusMessage').textContent === msg) {
      document.getElementById('statusMessage').textContent = '';
    }
  }, 3000);
}

function updateProposalModal() {
  const minValue = state.leader === -1 ? 100 : state.contract + 5;
  const input = document.getElementById('proposalValue');
  input.min = minValue;
  input.value = minValue;
  
  // تاریخچه پیشنهادات
  const history = document.getElementById('proposalHistory');
  history.innerHTML = state.proposalLog.map(log => {
    const name = state.players[log.player]?.name || 'بازیکن';
    const cls = log.action === 'call' ? 'call' : 'pass';
    const text = log.action === 'call' ? log.value : 'پاس';
    return `<div class="proposal-item ${cls}">${name}: ${text}</div>`;
  }).join('');
}

function addProposalHistory(data) {
  const history = document.getElementById('proposalHistory');
  const cls = data.action === 'call' ? 'call' : 'pass';
  const text = data.action === 'call' ? data.value : 'پاس';
  history.innerHTML += `<div class="proposal-item ${cls}">${data.name}: ${text}</div>`;
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
});