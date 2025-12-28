function renderOtherPlayers() {
  if (!state.handCounts || playerNames.length < 4) return;

  const positions = getRelativePositions(myIndex);

  ['top', 'left', 'right'].forEach(pos => {
    const playerIdx = positions[pos];
    const elemId = 'player' + pos.charAt(0).toUpperCase() + pos.slice(1);
    const elem = document.getElementById(elemId);
    if (!elem) return;
    
    const label = elem.querySelector('.player-label');
    const cardsBack = elem.querySelector('.cards-back');
    if (!label || !cardsBack) return;

    const name = playerNames[playerIdx] || '?';
    const count = state.handCounts[playerIdx] || 0;
    const isTurn = state.turn === playerIdx && state.phase === 'playing';
    const isLeader = state.leader === playerIdx;

    label.textContent = `${name} (${count})`;
    label.className = 'player-label' + (isTurn ? ' turn' : '') + (isLeader ? ' leader' : '');
    cardsBack.innerHTML = createCardBackHtml(count, pos !== 'top');
  });
}

function render() {
  if (!state || !state.phase) return;
  
  let info = '', ctrl = '', showProp = false, showRound = false;
  const tn = playerNames[state.turn] || '?';
  const ln = playerNames[state.leader] || '?';
  const my = state.turn === myIndex;

  if (state.phase === 'propose') {
    showProp = true;
    info = `📢 مرحله تعهد | نوبت: <b>${tn}</b>${my ? ' (شما)' : ''} | تعهد فعلی: <b>${state.contract}</b>`;
    if (my && !state.passed[myIndex]) {
      ctrl = `<input type="number" id="propVal" value="${state.contract + 5}" min="${state.contract + 5}" max="165" step="5" style="width:80px">
        <button onclick="submitProposal()">📣 اعلام</button>
        <button onclick="passProposal()" class="danger">❌ پاس</button>`;
    }
  } else if (state.phase === 'exchange') {
    info = `👑 <b>${ln}</b> حاکم است (تعهد: ${state.contract})`;
    if (myIndex === state.leader) {
      info += '<br>🔄 ۴ کارت را برای حذف انتخاب کنید (روی کارت کلیک کنید)';
      ctrl = selected.length === 4 
        ? '<button onclick="doExchange()">✅ تایید و حذف کارت‌ها</button>' 
        : `<span style="color:#ffd700">انتخاب شده: ${selected.length}/4</span>`;
    } else {
      info += '<br>⏳ حاکم در حال مرتب‌سازی دست...';
    }
  } else if (state.phase === 'selectMode') {
    info = `👑 <b>${ln}</b>`;
    info += myIndex === state.leader ? ' - در حال انتخاب نوع بازی...' : ' - منتظر انتخاب حاکم...';
  } else if (state.phase === 'playing') {
    showRound = true;
    const modeDisplay = getGameModeDisplay(state.gameMode, state.masterSuit);
    info = `${modeDisplay} | 👑 ${ln} (${state.contract}) | نوبت: <b>${tn}</b>${my ? ' - کارت بکشید!' : ''}`;
    info += `<br>📦 دست‌های برده: ت۱: ${state.collectedCounts[0]} | ت۲: ${state.collectedCounts[1]}`;
  }

  document.getElementById('info').innerHTML = info;
  document.getElementById('controls').innerHTML = ctrl;
  document.getElementById('propHistoryBox').style.display = showProp ? 'block' : 'none';
  document.getElementById('roundScoresBox').style.display = showRound ? 'block' : 'none';

  if (showProp && state.proposalLog) {
    document.getElementById('propHistory').innerHTML = state.proposalLog.map(b =>
      `<div class="prop-item ${b.action}">${playerNames[b.player]}: ${b.action === 'pass' ? '❌ پاس' : '📣 ' + b.value}</div>`
    ).join('');
  }

  if (showRound && state.roundPoints) {
    document.getElementById('rs0').textContent = state.roundPoints[0];
    document.getElementById('rs1').textContent = state.roundPoints[1];
  }

  // رندر دست من - در حالت exchange هم کلیک فعال باشد
  const canDrag = state.phase === 'playing' && state.turn === myIndex;
  const canClick = state.phase === 'exchange' || state.phase === 'playing';
  
  document.getElementById('myHand').innerHTML = state.hand.map((c, i) =>
    createCardHtml(c, i, selected.includes(i), canClick, canDrag)
  ).join('');
  document.getElementById('handCount').textContent = state.hand.length;

  // رندر کارت‌های بازی شده
  let ph = state.playedCards && state.playedCards.length 
    ? state.playedCards.map(p =>
      `<div class="played-card-container">
        <div class="player-name">${playerNames[p.p]}</div>
        ${createCardHtml(p.c, -1, false, false)}
      </div>`
    ).join('') 
    : '<span style="color:#777">🎴 کارت را اینجا رها کنید</span>';
  document.getElementById('played').innerHTML = ph;

  // رندر بازیکنان دیگر
  renderOtherPlayers();

  document.getElementById('s0').textContent = state.totalScores?.[0] || 0;
  document.getElementById('s1').textContent = state.totalScores?.[1] || 0;
}

function showModeModal() {
  document.getElementById('modeModal').style.display = 'flex';
  document.querySelectorAll('input[name="gameMode"]').forEach(r => r.checked = false);
  document.getElementById('suitSelectorWithTrump').style.display = 'none';
  document.getElementById('selectedModeDisplay').style.display = 'none';
  document.getElementById('confirmModeBtn').disabled = true;
  document.getElementById('confirmModeBtn').textContent = '⚠️ ابتدا حالت بازی را انتخاب کنید';
  selectedSuit = null;
  document.querySelectorAll('.suit-btn').forEach(b => b.classList.remove('selected'));
}

function showResultModal(d) {
  const modal = document.getElementById('resultModal');
  const cardsDiv = document.getElementById('resultCards');
  const infoDiv = document.getElementById('resultInfo');
  const countdownDiv = document.getElementById('countdown');

  let cardsHtml = d.playedCards.map(p => {
    const isRed = p.card.s === '♥' || p.card.s === '♦';
    const colorClass = isRed ? 'red' : 'black';
    return `
      <div class="result-card-item ${p.isWinner ? 'winner' : ''}">
        <div class="result-name">${p.name}${p.isWinner ? ' 👑' : ''}</div>
        <div class="card ${colorClass}">
          <div class="corner corner-top">
            <div class="rank">${p.card.v}</div>
            <div class="suit-small">${p.card.s}</div>
          </div>
          <div class="center-suit">${p.card.s}</div>
          <div class="corner corner-bottom">
            <div class="rank">${p.card.v}</div>
            <div class="suit-small">${p.card.s}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cardsDiv.innerHTML = cardsHtml;
  infoDiv.innerHTML = `✨ <b>${d.name || d.winnerName}</b> این دست را برد! (+${d.points} امتیاز)`;

  modal.style.display = 'flex';

  let remaining = 3;
  countdownDiv.textContent = `ادامه بازی در ${remaining} ثانیه...`;

  const interval = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      countdownDiv.textContent = `ادامه بازی در ${remaining} ثانیه...`;
    } else {
      clearInterval(interval);
      modal.style.display = 'none';
    }
  }, 1000);
}