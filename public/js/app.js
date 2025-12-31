// public/js/app.js - نسخه کامل و تصحیح شده

// === Socket Connection ===
const socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
});

// === Session Management ===
const DEVICE_ID_KEY = 'shelem_device_id';
const SESSION_KEY = 'shelem_session';

function getDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + 
                   '_' + Date.now().toString(36);
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

function saveSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        ...data,
        savedAt: Date.now()
    }));
}

function getSession() {
    try {
        const data = localStorage.getItem(SESSION_KEY);
        if (data) {
            const session = JSON.parse(data);
            if (Date.now() - session.savedAt > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return session;
        }
    } catch (e) {
        console.error('Session parse error:', e);
    }
    return null;
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// === State Variables ===
let state = null;
let myIndex = -1;
let myName = '';
let myRoom = '';
let scoreLimit = 500;
let isHost = false;
let selected = [];
let selectedSuit = null;
let playerNames = [];

// === Drag Variables ===
let draggedCard = null;
let draggedCardEl = null;
let draggedIndex = -1;
let touchStartTime = 0;
let isTouchDevice = false;

// === Timer Variables ===
let timerInterval = null;
let remainingTime = 30;
let countdownInterval = null;

// === Animation Variables ===
let isDealing = false;
let previousPhase = null;

// === Connection Handling ===
socket.on('connect', () => {
    console.log('Connected to server');
    
    const deviceId = getDeviceId();
    const session = getSession();
    
    socket.emit('authenticate', {
        deviceId,
        playerName: session?.playerName || ''
    });
});

socket.on('authenticated', (data) => {
    console.log('Authenticated:', data);
    
    if (data.hasActiveGame) {
        showReconnectPrompt(data.roomCode, data.playerName);
    } else if (data.playerName) {
        const createNameEl = document.getElementById('createName');
        const joinNameEl = document.getElementById('joinName');
        if (createNameEl) createNameEl.value = data.playerName;
        if (joinNameEl) joinNameEl.value = data.playerName;
    }
});

socket.on('reconnected', async (data) => {
    console.log('Reconnected to game:', data);
    
    myRoom = data.roomCode;
    myIndex = data.index;
    myName = data.playerName;
    scoreLimit = data.scoreLimit;
    
    saveSession({ roomCode: myRoom, playerName: myName, index: myIndex });
    hideReconnectPrompt();
    
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display = 'flex';
    
    addLog('🔄 اتصال مجدد برقرار شد', 'info');
    
    try {
        if (typeof initVoiceChat === 'function') {
            await initVoiceChat(socket, myIndex);
        }
    } catch (e) {
        console.error('Voice init failed:', e);
    }
});

socket.on('reconnectFailed', (data) => {
    console.log('Reconnect failed:', data.reason);
    clearSession();
    hideReconnectPrompt();
    alert(data.reason);
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    if (state && state.phase !== 'waiting') {
        addLog('⚠️ اتصال قطع شد...', 'info');
    }
    
    if (reason !== 'io client disconnect') {
        showConnectionLost();
    }
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

socket.on('error', msg => {
    alert(msg);
});

// === Reconnect UI ===
function showReconnectPrompt(roomCode, playerName) {
    const existing = document.getElementById('reconnectPrompt');
    if (existing) existing.remove();
    
    const prompt = document.createElement('div');
    prompt.id = 'reconnectPrompt';
    prompt.className = 'reconnect-prompt';
    prompt.innerHTML = `
        <div class="reconnect-content">
            <h3>🎮 بازی فعال</h3>
            <p>شما در اتاق <strong>${roomCode}</strong> بازی داشتید</p>
            <p>نام: <strong>${playerName}</strong></p>
            <button onclick="doAutoReconnect()">🔄 ادامه بازی</button>
            <button onclick="cancelReconnect()" class="secondary">❌ بازی جدید</button>
        </div>
    `;
    document.body.appendChild(prompt);
}

function hideReconnectPrompt() {
    const prompt = document.getElementById('reconnectPrompt');
    if (prompt) prompt.remove();
}

function cancelReconnect() {
    hideReconnectPrompt();
    clearSession();
}

function doAutoReconnect() {
    const deviceId = getDeviceId();
    socket.emit('autoReconnect', { deviceId });
    
    const prompt = document.getElementById('reconnectPrompt');
    if (prompt) {
        prompt.querySelector('.reconnect-content').innerHTML = `
            <div class="loading">در حال اتصال...</div>
        `;
    }
}

function showConnectionLost() {
    const existing = document.getElementById('connectionLost');
    if (existing) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'connectionLost';
    overlay.className = 'connection-lost';
    overlay.innerHTML = `
        <div class="connection-content">
            <div class="spinner"></div>
            <p>در حال اتصال مجدد...</p>
        </div>
    `;
    document.body.appendChild(overlay);
    
    socket.once('connect', () => {
        overlay.remove();
    });
}

// === Keep Alive ===
setInterval(() => {
    if (socket.connected) {
        socket.emit('ping');
    }
}, 25000);

// === Room Events ===
socket.on('roomCreated', async data => {
    myRoom = data.code;
    myIndex = data.index;
    isHost = true;
    scoreLimit = data.scoreLimit;
    myName = document.getElementById('createName').value.trim();
    
    saveSession({ roomCode: myRoom, playerName: myName, index: myIndex });
    showWaitingRoom();
    
    try {
        if (typeof initVoiceChat === 'function') {
            await initVoiceChat(socket, myIndex);
        }
    } catch (e) {
        console.error('Voice init error:', e);
    }
});

socket.on('roomJoined', async data => {
    myRoom = data.code;
    myIndex = data.index;
    isHost = data.index === 0;
    scoreLimit = data.scoreLimit;
    myName = document.getElementById('joinName').value.trim();
    
    saveSession({ roomCode: myRoom, playerName: myName, index: myIndex });
    
    if (data.isReconnect) {
        addLog('🔄 اتصال مجدد برقرار شد', 'info');
        hideReconnectPrompt();
    }
    
    showWaitingRoom();
    
    try {
        if (typeof initVoiceChat === 'function') {
            await initVoiceChat(socket, myIndex);
        }
    } catch (e) {
        console.error('Voice init error:', e);
    }
});

socket.on('updatePlayerList', players => {
    playerNames = players.map(p => p.name);
    renderPlayerList(players);
});

socket.on('gameState', data => {
    const wasWaiting = !state || state.phase === 'waiting' || state.phase === 'ended';
    const isNewGame = wasWaiting && (data.phase === 'proposing' || data.phase === 'playing');
    
    state = data;
    myIndex = data.myIndex;
    
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display = 'flex';
    
    if (isNewGame && !isDealing) {
        startDealingAnimation();
    } else if (!isDealing) {
        render();
    }
    
    previousPhase = data.phase;
});

// === Game Events ===
socket.on('proposalUpdate', data => {
    const text = data.action === 'pass'
        ? `❌ ${data.name} پاس کرد`
        : `📢 ${data.name}: ${data.value}`;
    const type = data.action === 'pass' ? 'pass' : 'call';
    addLog(text, type);
    updateProposalLogMini(data);
});

socket.on('leaderSelected', data => {
    hideProposalPanel();
    addLog(`👑 ${data.name} حاکم شد - قرارداد: ${data.contract}`, 'info');
});

socket.on('modeSelected', data => {
    hideModal('modeModal');
    const modeNames = { hokm: 'حکم', nars: 'نَرس', asNars: 'آس‌نَرس', sars: 'سَرس' };
    const modeName = modeNames[data.mode] || data.mode;
    const suitText = data.suit ? ` - ${data.suit}` : '';
    addLog(`🎯 ${data.name}: ${modeName}${suitText}`, 'info');
});

socket.on('cardAction', data => {
    render();
});

socket.on('timerStart', data => {
    startTimerUI(data.duration);
});

socket.on('botAction', data => {
    const actionText = '🤖';
    if (data.type === 'play') {
        addLog(`${actionText} ${data.name} کارت بازی کرد (خودکار)`, 'info');
    } else if (data.type === 'proposal') {
        if (data.result.action === 'pass') {
            addLog(`${actionText} ${data.name} پاس کرد (خودکار)`, 'pass');
        } else {
            addLog(`${actionText} ${data.name}: ${data.result.value} (خودکار)`, 'call');
        }
    } else if (data.type === 'exchange') {
        addLog(`${actionText} ${data.name} کارت تعویض کرد (خودکار)`, 'info');
    } else if (data.type === 'mode') {
        const modeNames = { hokm: 'حکم', nars: 'نَرس', asNars: 'آس‌نَرس', sars: 'سَرس' };
        addLog(`${actionText} ${data.name}: ${modeNames[data.result.mode]} (خودکار)`, 'info');
    }
});

socket.on('roundResult', data => {
    showRoundResult(data);
});

socket.on('matchEnded', data => {
    stopTimerUI();
    if (!data.gameOver) {
        showMatchEnd(data);
    }
});

socket.on('nextMatchCountdown', data => {
    startNextMatchCountdown(data.seconds);
});

socket.on('newMatchStarting', () => {
    hideModal('endModal');
    stopCountdown();
    isDealing = false;
});

socket.on('gameOver', data => {
    stopTimerUI();
    stopCountdown();
    showGameOver(data);
});

socket.on('gameReset', () => {
    hideModal('gameOverModal');
    hideModal('endModal');
    stopCountdown();
    stopTimerUI();
    clearSession();
    
    state = null;
    isDealing = false;
    previousPhase = null;
    
    document.getElementById('lobby').style.display = 'flex';
    document.getElementById('game').style.display = 'none';
    backToWelcome();
});

socket.on('proposalRestart', data => {
    hideProposalPanel();
    addLog('⚠️ ' + data.reason, 'info');
});

socket.on('playerDisconnected', data => {
    addLog(`⚠️ ${data.name} قطع شد - در انتظار اتصال مجدد...`, 'info');
});

socket.on('playerRejoined', data => {
    addLog(`✅ ${data.name} برگشت`, 'info');
});

socket.on('playerLeft', data => {
    addLog(`❌ ${data.name} بازی را ترک کرد`, 'info');
});

// === Countdown Functions ===
function startNextMatchCountdown(seconds) {
    stopCountdown();
    let remaining = seconds;
    updateCountdownDisplay(remaining);
    
    countdownInterval = setInterval(() => {
        remaining--;
        updateCountdownDisplay(remaining);
        if (remaining <= 0) {
            stopCountdown();
        }
    }, 1000);
}

function stopCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    const el = document.getElementById('nextMatchCountdown');
    if (el) el.remove();
}

function updateCountdownDisplay(seconds) {
    let el = document.getElementById('nextMatchCountdown');
    if (!el) {
        el = document.createElement('div');
        el.id = 'nextMatchCountdown';
        el.className = 'countdown-display';
        document.body.appendChild(el);
    }
    el.innerHTML = `
        <div class="countdown-text">دست بعدی در</div>
        <div class="countdown-number">${seconds}</div>
        <div class="countdown-text">ثانیه</div>
    `;
}

// === Dealing Animation ===
function startDealingAnimation() {
    isDealing = true;
    renderGameBoard();
    showDealingMessage();
    setTimeout(() => {
        renderCardsWithAnimation();
    }, 500);
}

function showDealingMessage() {
    const existing = document.getElementById('dealingMsg');
    if (existing) existing.remove();
    
    const msg = document.createElement('div');
    msg.id = 'dealingMsg';
    msg.className = 'dealing-message';
    msg.textContent = '🎴 در حال توزیع کارت‌ها...';
    document.body.appendChild(msg);
}

function hideDealingMessage() {
    const msg = document.getElementById('dealingMsg');
    if (msg) msg.remove();
}

function renderGameBoard() {
    const gameEl = document.getElementById('game');
    gameEl.classList.remove('my-turn');
    gameEl.classList.add('game-proposing');
    
    document.getElementById('score0').textContent = state.totalScores[0];
    document.getElementById('score1').textContent = state.totalScores[1];
    
    const scoreLimitGame = document.getElementById('scoreLimitGame');
    if (scoreLimitGame) {
        scoreLimitGame.textContent = `سقف: ${state.scoreLimit || 500}`;
    }
    
    document.getElementById('contractDisplay').textContent = '';
    document.getElementById('trumpDisplay').textContent = '';
    
    renderOpponentsInfo();
    
    document.getElementById('myHand').innerHTML = '';
    document.getElementById('playedCards').innerHTML = '';
    
    const displayName = playerNames[myIndex] || myName || 'شما';
    document.getElementById('myName').textContent = displayName;
    document.getElementById('turnIndicator').textContent = '';
    
    hideProposalPanel();
    const overlay = document.getElementById('proposalOverlay');
    if (overlay) overlay.style.display = 'none';
}

function renderOpponentsInfo() {
    if (!state) return;
    
    const positions = ['top', 'left', 'right'];
    const relativeIndices = [
        (myIndex + 2) % 4,
        (myIndex + 3) % 4,
        (myIndex + 1) % 4
    ];
    
    positions.forEach((pos, i) => {
        const pIndex = relativeIndices[i];
        const elemId = 'player' + pos.charAt(0).toUpperCase() + pos.slice(1);
        const elem = document.getElementById(elemId);
        if (!elem) return;
        
        const name = state.players[pIndex]?.name || '---';
        const count = state.handCounts[pIndex] || 0;
        const connected = state.players[pIndex]?.connected !== false;
        
        elem.classList.remove('turn', 'leader', 'disconnected');
        elem.classList.toggle('disconnected', !connected);
        
        elem.querySelector('.opponent-name').textContent = name;
        elem.querySelector('.card-count').textContent = count;
        elem.querySelector('.opponent-cards').innerHTML = '';
    });
}

function renderCardsWithAnimation() {
    if (!state) return;
    
    const hand = state.hand || [];
    const container = document.getElementById('myHand');
    
    const viewportWidth = window.innerWidth;
    let cardWidth;
    if (viewportWidth < 350) cardWidth = 48;
    else if (viewportWidth < 400) cardWidth = 54;
    else if (viewportWidth < 500) cardWidth = 60;
    else cardWidth = 68;
    
    const cardHeight = Math.round(cardWidth * 1.45);
    const cardCount = hand.length;
    const totalAngle = Math.min(55, 4 + cardCount * 4);
    const angleStep = cardCount > 1 ? totalAngle / (cardCount - 1) : 0;
    const startAngle = -totalAngle / 2;
    const fanRadius = Math.max(280, 400 - cardCount * 8);
    
    hand.forEach((card, i) => {
        setTimeout(() => {
            const angle = startAngle + (i * angleStep);
            const zIndex = i + 1;
            const color = ['♥', '♦'].includes(card.s) ? 'red' : 'black';
            
            const cardEl = document.createElement('div');
            cardEl.className = `card ${color} disabled deal-anim`;
            cardEl.dataset.index = i;
            cardEl.style.cssText = `
                --angle: ${angle}deg;
                --fan-radius: ${fanRadius}px;
                width: ${cardWidth}px;
                height: ${cardHeight}px;
                z-index: ${zIndex};
                animation-delay: 0ms;
            `;
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
        }, i * 80);
    });
    
    // Animate opponent cards
    const positions = ['Top', 'Left', 'Right'];
    const relativeIndices = [
        (myIndex + 2) % 4,
        (myIndex + 3) % 4,
        (myIndex + 1) % 4
    ];
    
    positions.forEach((pos, pi) => {
        const pIndex = relativeIndices[pi];
        const count = state.handCounts[pIndex] || 0;
        const displayCount = Math.min(count, 6);
        const elem = document.getElementById('player' + pos);
        if (!elem) return;
        
        const cardsContainer = elem.querySelector('.opponent-cards');
        
        for (let j = 0; j < displayCount; j++) {
            setTimeout(() => {
                const cardBack = document.createElement('div');
                cardBack.className = 'card-back deal-anim';
                cardBack.style.animationDelay = '0ms';
                cardsContainer.appendChild(cardBack);
            }, (pi * 300) + (j * 50));
        }
    });
    
    const totalDelay = Math.max(hand.length * 80, 3 * 300 + 6 * 50) + 500;
    
    setTimeout(() => {
        hideDealingMessage();
        isDealing = false;
        render();
    }, totalDelay);
}

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
    document.getElementById('waitingRoom').style.display = 'none';
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

    myName = name;
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

    myName = name;
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
    const btn = document.getElementById('readyBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ منتظر بقیه...';
    }
}

function leaveRoom() {
    if (confirm('آیا می‌خواهید بازی را ترک کنید؟')) {
        socket.emit('leaveRoom');
        clearSession();
        location.reload();
    }
}

// === Game Actions ===
function clickCard(index) {
    if (!state || isDealing) return;
    
    if (state.phase === 'exchanging' && myIndex === state.leader) {
        if (selected.includes(index)) {
            selected = selected.filter(i => i !== index);
        } else if (selected.length < 4) {
            selected.push(index);
        }
        render();
    } else if (state.phase === 'playing' && state.turn === myIndex) {
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
    selectedSuit = null;
}

function playAgain() {
    hideModal('endModal');
}

function resetGame() {
    socket.emit('resetGame');
}

// === Main Render Function ===
function render() {
    if (!state || isDealing) return;

    const gameEl = document.getElementById('game');
    const isMyTurn = state.turn === myIndex;
    const isProposing = state.phase === 'proposing';
    const isPlaying = state.phase === 'playing';
    const isExchanging = state.phase === 'exchanging';
    const isSelectMode = state.phase === 'selectMode';

    gameEl.classList.toggle('my-turn', isMyTurn && isPlaying);
    gameEl.classList.toggle('game-proposing', isProposing && state.turn !== myIndex);

    // Update scores
    document.getElementById('score0').textContent = state.totalScores[0];
    document.getElementById('score1').textContent = state.totalScores[1];

    const scoreLimitGame = document.getElementById('scoreLimitGame');
    if (scoreLimitGame) {
        scoreLimitGame.textContent = `سقف: ${state.scoreLimit || 500}`;
    }

    // Update contract display
    if (state.contract > 0) {
        document.getElementById('contractDisplay').textContent = `قرارداد: ${state.contract}`;
    } else {
        document.getElementById('contractDisplay').textContent = '';
    }

    // Update trump display
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

    // Drop hint
    const dropHint = document.getElementById('dropHint');
    if (dropHint) {
        dropHint.style.display = (isMyTurn && isPlaying && state.playedCards.length < 4) ? 'block' : 'none';
    }

    // Proposal overlay
    const overlay = document.getElementById('proposalOverlay');
    const waitingMsg = document.getElementById('waitingMessage');
    
    if (isProposing) {
        if (state.turn === myIndex) {
            if (overlay) overlay.style.display = 'none';
            showProposalPanel();
        } else {
            hideProposalPanel();
            if (overlay) overlay.style.display = 'flex';
            const currentPlayerName = state.players[state.turn]?.name || 'بازیکن';
            if (waitingMsg) {
                waitingMsg.innerHTML = `
                    <span class="player-name">${currentPlayerName}</span>
                    در حال انتخاب<span class="dots"></span>
                `;
            }
        }
    } else {
        hideProposalPanel();
        if (overlay) overlay.style.display = 'none';
    }

    // Mode selection
    if (isSelectMode && state.leader === myIndex) {
        showModal('modeModal');
    }
}

// === Render Helpers ===
function renderPlayerList(players) {
    const container = document.getElementById('playersList');
    if (!container) return;
    
    let html = '';
    for (let i = 0; i < 4; i++) {
        const p = players[i];
        if (p) {
            const classes = ['player-slot', 'filled'];
            if (p.ready) classes.push('ready');
            if (i === myIndex) classes.push('me');
            if (p.isHost) classes.push('host');
            if (!p.connected) classes.push('disconnected');
            
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
    if (!state) return;
    
    const positions = ['top', 'left', 'right'];
    const relativeIndices = [
        (myIndex + 2) % 4,
        (myIndex + 3) % 4,
        (myIndex + 1) % 4
    ];

    positions.forEach((pos, i) => {
        const pIndex = relativeIndices[i];
        const elemId = 'player' + pos.charAt(0).toUpperCase() + pos.slice(1);
        const elem = document.getElementById(elemId);
        if (!elem) return;
        
        const name = state.players[pIndex]?.name || '---';
        const count = state.handCounts[pIndex] || 0;
        const connected = state.players[pIndex]?.connected !== false;

        elem.classList.toggle('turn', state.turn === pIndex);
        elem.classList.toggle('leader', state.leader === pIndex);
        elem.classList.toggle('disconnected', !connected);

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
    if (!container || !state) return;
    
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
    if (!container || !state) return;
    
    const hand = state.hand || [];
    const cardCount = hand.length;
    const displayName = playerNames[myIndex] || myName || 'شما';

    document.getElementById('myName').textContent = displayName;
    
    const turnIndicator = document.getElementById('turnIndicator');
    if (turnIndicator) {
        turnIndicator.textContent = (state.turn === myIndex && state.phase === 'playing') 
            ? '🎯 نوبت شماست!' : '';
    }

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

    const isLeader = state.leader === myIndex;
    const isExchange = state.phase === 'exchanging' && isLeader;
    const isPlaying = state.phase === 'playing' && state.turn === myIndex;

    let html = '';
    hand.forEach((card, i) => {
        const isSelected = selected.includes(i);
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

// === Card Interactions ===
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
    if (isTouchDevice || isDealing) return;
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('disabled')) return;
    const index = parseInt(card.dataset.index);
    if (isNaN(index)) return;
    clickCard(index);
}

function handleTouchStart(e) {
    if (isDealing) return;
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
    if (draggedIndex < 0 || !draggedCardEl || isDealing) return;
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
    if (draggedIndex < 0 || isDealing) {
        cleanupDrag();
        return;
    }
    
    const touchDuration = Date.now() - touchStartTime;
    const wasDragging = draggedCardEl && draggedCardEl._moved;
    const dropZone = document.getElementById('dropZone');
    const wasOverDrop = dropZone && dropZone.classList.contains('drag-over');

    const index = draggedIndex;
    cleanupDrag();

    if (wasDragging && wasOverDrop) {
        if (state && state.phase === 'playing' && state.turn === myIndex) {
            playCard(index);
        }
    } else if (!wasDragging && touchDuration < 300) {
        clickCard(index);
    }
}

function handleMouseDown(e) {
    if (isTouchDevice || isDealing) return;
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('disabled')) return;
    if (!state || state.phase !== 'playing' || state.turn !== myIndex) return;
    
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
    if (draggedIndex < 0 || !draggedCardEl || isDealing) return;
    
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
    
    if (draggedIndex < 0 || isDealing) {
        cleanupDrag();
        return;
    }
    
    const wasDragging = draggedCardEl && draggedCardEl._moved;
    const dropZone = document.getElementById('dropZone');
    const wasOverDrop = dropZone && dropZone.classList.contains('drag-over');

    const index = draggedIndex;
    cleanupDrag();

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
    if (!dropZone) return;
    
    const rect = dropZone.getBoundingClientRect();
    const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    dropZone.classList.toggle('drag-over', isOver);
}

function cleanupDrag() {
    if (draggedCard) {
        draggedCard.remove();
        draggedCard = null;
    }
    if (draggedCardEl) {
        draggedCardEl.classList.remove('dragging');
        draggedCardEl = null;
    }
    
    const dropZone = document.getElementById('dropZone');
    if (dropZone) dropZone.classList.remove('drag-over');
    
    draggedIndex = -1;
}

// === Controls ===
function renderControls() {
    const container = document.getElementById('controls');
    if (!container || !state) return;
    
    if (state.phase === 'exchanging' && state.leader === myIndex) {
        container.innerHTML = `
            <button class="btn-primary" onclick="doExchange()">
                ✅ تایید تعویض (${selected.length}/4)
            </button>
        `;
    } else {
        container.innerHTML = '';
    }
}

// === Proposal Panel ===
function showProposalPanel() {
    if (isDealing || !state) return;
    
    const panel = document.getElementById('proposalPanel');
    if (!panel) return;
    
    panel.style.display = 'block';
    const grid = document.getElementById('proposalGrid');
    if (!grid) return;
    
    let html = '';
    for (let val = 100; val <= 165; val += 5) {
        const isDisabled = val <= state.contract;
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
    const panel = document.getElementById('proposalPanel');
    if (panel) panel.style.display = 'none';
}

function updateProposalLogMini(data) {
    const container = document.getElementById('proposalLogMini');
    if (!container) return;
    
    const type = data.action === 'call' ? 'call' : 'pass';
    const text = data.action === 'call' ? data.value : 'پاس';
    container.innerHTML += `<span class="log-item ${type}">${data.name}: ${text}</span>`;
}

function updateProposalLogMiniFromState() {
    const container = document.getElementById('proposalLogMini');
    if (!container || !state || !state.proposalLog) {
        if (container) container.innerHTML = '';
        return;
    }
    
    container.innerHTML = state.proposalLog.map(log => {
        const name = state.players[log.player]?.name || 'بازیکن';
        const type = log.action === 'call' ? 'call' : 'pass';
        const text = log.action === 'call' ? log.value : 'پاس';
        return `<span class="log-item ${type}">${name}: ${text}</span>`;
    }).join('');
}

// === Helper Functions ===
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
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

function addLog(msg, type = 'info') {
    const container = document.getElementById('gameLog');
    if (!container) return;
    
    const item = document.createElement('div');
    item.className = 'log-item ' + type;
    item.textContent = msg;
    
    while (container.children.length >= 5) {
        container.removeChild(container.firstChild);
    }
    
    container.appendChild(item);
    
    setTimeout(() => {
        if (item.parentNode === container) {
            item.remove();
        }
    }, 6000);
}

function updateModeButton() {
    const btn = document.getElementById('confirmModeBtn');
    if (!btn) return;
    
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

// === Result Modals ===
function showRoundResult(data) {
    const modal = document.getElementById('resultModal');
    const title = document.getElementById('resultTitle');
    const cards = document.getElementById('resultCards');
    const points = document.getElementById('resultPoints');
    
    if (!modal || !title || !cards || !points) return;

    title.textContent = `🏆 ${data.winnerName} برد!`;
    cards.innerHTML = data.playedCards.map(pc => {
        const cls = pc.isWinner ? 'winner' : '';
        return `<div class="${cls}">${createCardHtml(pc.card || pc.c, 'small')}</div>`;
    }).join('');
    
    points.textContent = `امتیاز: ${data.points}`;
    
    showModal('resultModal');
    setTimeout(() => hideModal('resultModal'), 2500);
}

function showMatchEnd(data) {
    const modal = document.getElementById('endModal');
    const title = document.getElementById('endTitle');
    const details = document.getElementById('endDetails');
    
    if (!modal || !title || !details) return;

    const myTeam = myIndex % 2;
    const won = data.success ? data.leaderTeam === myTeam : data.leaderTeam !== myTeam;

    const content = modal.querySelector('.modal-content');
    if (content) {
        content.className = 'modal-content end-modal ' + (won ? 'win' : 'lose');
    }
    
    title.textContent = won ? '🎉 این دست را بردید!' : '😔 این دست را باختید';

    const resultText = data.success ? 'قرارداد موفق ✅' : 'قرارداد ناموفق ❌';
    
    details.innerHTML = `
        <div style="font-size:16px;margin-bottom:10px">${resultText}</div>
        <div>قرارداد: ${data.contract}</div>
        <div>امتیاز تیم حاکم: ${data.leaderScore}</div>
        <div>امتیاز تیم مقابل: ${data.opponentScore}</div>
        <hr style="margin:10px 0;border-color:#444">
        <div style="font-size:18px;font-weight:bold">
            مجموع: تیم ۱: ${data.totalScores[0]} | تیم ۲: ${data.totalScores[1]}
        </div>
        <div style="margin-top:15px;color:var(--gold)">
            ⏳ دست بعدی به زودی شروع می‌شود...
        </div>
    `;

    showModal('endModal');
}

function showGameOver(data) {
    const modal = document.getElementById('gameOverModal');
    const title = document.getElementById('gameOverTitle');
    const details = document.getElementById('gameOverDetails');
    const history = document.getElementById('gameHistory');
    
    if (!modal || !title || !details) return;

    const myTeam = myIndex % 2;
    const won = data.winner === myTeam;

    const content = modal.querySelector('.modal-content');
    if (content) {
        content.className = 'modal-content game-over-modal ' + (won ? 'win' : 'lose');
    }
    
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
        <p>سقف امتیاز: ${state?.scoreLimit || 500}</p>
    `;

    if (history && data.matchHistory) {
        const modeNames = { hokm: 'حکم', nars: 'نرس', asNars: 'آس‌نرس', sars: 'سرس' };
        let historyHtml = '<h4>تاریخچه دست‌ها:</h4>';
        
        data.matchHistory.forEach((match, idx) => {
            historyHtml += `
                <div class="match-item ${match.success ? 'success' : 'failed'}">
                    <div class="match-header">
                        <span>دست ${idx + 1}</span>
                        <span>${match.leaderName} - ${modeNames[match.gameMode] || match.gameMode}</span>
                    </div>
                    <div class="match-scores">
                        قرارداد: ${match.contract} | 
                        ${match.success ? '✅ موفق' : '❌ ناموفق'}
                    </div>
                </div>
            `;
        });
        history.innerHTML = historyHtml;
    }

    const resetBtn = document.getElementById('resetGameBtn');
    if (resetBtn) {
        resetBtn.style.display = isHost ? 'block' : 'none';
        resetBtn.onclick = resetGame;
    }

    showModal('gameOverModal');
}

// === Timer Functions ===
function startTimerUI(duration) {
    stopTimerUI();
    remainingTime = Math.ceil(duration / 1000);
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
    
    const timerEl = document.getElementById('turnTimer');
    if (timerEl) timerEl.style.display = 'none';
}

function updateTimerDisplay() {
    const timerEl = document.getElementById('turnTimer');
    if (!timerEl) return;

    if (!state || state.turn !== myIndex || isDealing) {
        timerEl.style.display = 'none';
        return;
    }

    timerEl.style.display = 'block';
    timerEl.textContent = `⏱️ ${remainingTime}`;

    timerEl.classList.remove('warning', 'critical');
    if (remainingTime <= 5) {
        timerEl.classList.add('critical');
    } else if (remainingTime <= 10) {
        timerEl.classList.add('warning');
    }
}

// === DOM Event Listeners ===
document.addEventListener('DOMContentLoaded', () => {
    // Mode selection listeners
    document.querySelectorAll('input[name="gameMode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const suitSelector = document.getElementById('suitSelector');
            if (suitSelector) {
                if (this.value === 'sars') {
                    suitSelector.style.display = 'none';
                    selectedSuit = null;
                } else {
                    suitSelector.style.display = 'block';
                }
            }
            updateModeButton();
        });
    });

    // Prevent scroll when dragging
    document.addEventListener('touchmove', (e) => {
        if (draggedCard) {
            e.preventDefault();
        }
    }, { passive: false });

    // Resize handler
    window.addEventListener('resize', () => {
        if (state && !isDealing) {
            renderMyHand();
        }
    });
});

// === Visibility Change Handler ===
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket.connected) {
        socket.connect();
    }
});

// === Before Unload Warning ===
window.addEventListener('beforeunload', (e) => {
    if (state && state.phase !== 'waiting' && state.phase !== 'ended') {
        e.preventDefault();
        e.returnValue = 'بازی در حال اجراست. آیا مطمئن هستید؟';
        return e.returnValue;
    }
});