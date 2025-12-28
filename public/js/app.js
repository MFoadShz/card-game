const socket = io();
let myIndex = -1;
let state = {};
let selected = [];
let playerNames = [];
let selectedSuit = null;
let pendingMode = null;

// Socket event handlers
socket.on('log', d => log(d.msg));
socket.on('error', m => alert(m));

socket.on('joined', d => {
  myIndex = d.index;
  document.getElementById('playerList').style.display = 'block';
  if (d.isRejoin) {
    document.getElementById('readyBtn').disabled = true;
    log('اتصال مجدد برقرار شد');
  }
});

socket.on('updatePlayerList', ps => {
  playerNames = ps.map(p => p.name);
  let h = ps.map((p, i) => {
    let status = '';
    if (!p.connected) status = ' 📵';
    else if (p.ready) status = ' ✅';

    let cls = 'player ' + (i % 2 == 0 ? 'team0' : 'team1');
    if (!p.connected) cls += ' offline';
    else if (p.ready) cls += ' ready';

    return `<div class="${cls}">${i + 1}. ${p.name}${i === myIndex ? ' (شما)' : ''}${status}</div>`;
  }).join('');
  document.getElementById('players').innerHTML = h;
});

socket.on('proposalUpdate', d => log(d.action === 'call' ? `${d.name}: ${d.value}` : `${d.name}: پاس`));
socket.on('leaderSelected', d => log(`👑 ${d.name} حاکم شد (${d.contract})`));

socket.on('modeSelected', d => {
  let modeText = MODE_NAMES[d.gameMode] || d.gameMode;
  if (d.masterSuit) modeText += ` ${d.masterSuit}`;
  log(`🎯 حالت بازی: ${modeText}`);
  document.getElementById('modeModal').style.display = 'none';
  document.getElementById('confirmModal').style.display = 'none';
});

socket.on('cardAction', d => log(`${d.name}: ${d.card.v}${d.card.s}`));

socket.on('roundResult', d => {
  log(`🏆 ${d.name || d.winnerName} برد (+${d.points})`);
  document.getElementById('rs0').textContent = d.roundPoints[0];
  document.getElementById('rs1').textContent = d.roundPoints[1];
  showResultModal(d);
});

socket.on('gameState', d => {
  state = d;
  selected = [];
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('game').style.display = 'block';

  if (state.phase === 'selectMode' && state.leader === myIndex) {
    showModeModal();
  } else {
    document.getElementById('modeModal').style.display = 'none';
    document.getElementById('confirmModal').style.display = 'none';
  }
  render();
});

socket.on('matchEnded', d => {
  document.getElementById('resultModal').style.display = 'none';
  document.getElementById('s0').textContent = d.totalScores[0];
  document.getElementById('s1').textContent = d.totalScores[1];

  const modeText = MODE_NAMES[d.gameMode] || d.gameMode;

  let m = `🎮 پایان دست! (${modeText})\n\n`;
  m += d.success ? `✅ تیم حاکم موفق شد! (+${d.points[d.leaderTeam]})` : `❌ تیم حاکم موفق نشد! (-${d.contract})`;
  m += `\n📊 تیم حریف: +${d.points[1 - d.leaderTeam]}`;
  m += `\n\n🏆 مجموع کل:\nتیم۱: ${d.totalScores[0]}\nتیم۲: ${d.totalScores[1]}`;

  alert(m);
  document.getElementById('readyBtn').disabled = false;
  document.getElementById('lobby').style.display = 'block';
  document.getElementById('game').style.display = 'none';
  document.getElementById('players').innerHTML = '';
});

// User actions
function joinRoom() {
  const name = document.getElementById('name').value.trim();
  const room = document.getElementById('room').value.trim();
  if (!name || !room) return alert('نام و کد اتاق الزامی است');
  socket.emit('join', { code: room, name });
}

function setReady() {
  socket.emit('playerReady');
  document.getElementById('readyBtn').disabled = true;
}

function clickCard(i) {
  if (state.phase === 'exchange' && myIndex === state.leader) {
    if (selected.includes(i)) selected = selected.filter(x => x !== i);
    else if (selected.length < 4) selected.push(i);
    render();
  } else if (state.phase === 'playing' && state.turn === myIndex) {
    socket.emit('playCard', i);
  }
}

function submitProposal() {
  const v = parseInt(document.getElementById('propVal').value);
  if (v > state.contract && v <= 165 && v % 5 === 0) socket.emit('submitProposal', v);
}

function passProposal() {
  socket.emit('passProposal');
}

function doExchange() {
  if (selected.length === 4) {
    socket.emit('exchangeCards', selected);
    selected = [];
  }
}

function selectSuit(suit) {
  const selectedMode = document.querySelector('input[name="gameMode"]:checked');
  if (!selectedMode || !MODE_NEEDS_SUIT[selectedMode.value]) return;

  selectedSuit = suit;
  document.querySelectorAll('.suit-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.suit === suit);
  });

  const display = document.getElementById('selectedModeDisplay');
  const displayText = document.getElementById('selectedModeText');
  const confirmBtn = document.getElementById('confirmModeBtn');

  display.style.display = 'block';
  displayText.textContent = `${MODE_NAMES[selectedMode.value]} با حکم ${suit}`;
  confirmBtn.disabled = false;
  confirmBtn.textContent = '✅ تایید و شروع بازی';
}

function confirmMode() {
  const selectedMode = document.querySelector('input[name="gameMode"]:checked');
  if (!selectedMode) {
    alert('لطفا حالت بازی را انتخاب کنید');
    return;
  }

  const mode = selectedMode.value;

  if (MODE_NEEDS_SUIT[mode] && !selectedSuit) {
    alert('لطفا خال حکم را انتخاب کنید');
    return;
  }

  pendingMode = { mode, suit: selectedSuit };

  let modeInfo = MODE_NAMES[mode];
  if (MODE_NEEDS_SUIT[mode]) modeInfo += ` با حکم ${selectedSuit}`;

  document.getElementById('confirmModeInfo').textContent = modeInfo;
  document.getElementById('confirmModeDesc').textContent = MODE_DESCRIPTIONS[mode];
  document.getElementById('modeModal').style.display = 'none';
  document.getElementById('confirmModal').style.display = 'flex';
}

function finalConfirm() {
  if (!pendingMode) return;

  if (MODE_NEEDS_SUIT[pendingMode.mode]) {
    socket.emit('selectMode', { mode: pendingMode.mode, suit: pendingMode.suit });
  } else {
    socket.emit('selectMode', { mode: pendingMode.mode });
  }

  document.getElementById('confirmModal').style.display = 'none';
  pendingMode = null;
}

function cancelConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
  document.getElementById('modeModal').style.display = 'flex';
}

// Mode selection listeners
document.querySelectorAll('input[name="gameMode"]').forEach(radio => {
  radio.addEventListener('change', function () {
    const mode = this.value;
    const suitSelector = document.getElementById('suitSelectorWithTrump');
    const confirmBtn = document.getElementById('confirmModeBtn');
    const display = document.getElementById('selectedModeDisplay');
    const displayText = document.getElementById('selectedModeText');

    selectedSuit = null;
    document.querySelectorAll('.suit-btn').forEach(b => b.classList.remove('selected'));

    if (MODE_NEEDS_SUIT[mode]) {
      suitSelector.style.display = 'flex';
      suitSelector.style.flexWrap = 'wrap';
      display.style.display = 'block';
      displayText.textContent = `${MODE_NAMES[mode]} - خال حکم را انتخاب کنید`;
      confirmBtn.disabled = true;
      confirmBtn.textContent = '⚠️ خال حکم را انتخاب کنید';
    } else {
      suitSelector.style.display = 'none';
      display.style.display = 'block';
      displayText.textContent = MODE_NAMES[mode] + ' (بدون حکم)';
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✅ تایید و شروع بازی';
    }
  });
});