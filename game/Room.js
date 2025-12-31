// game/Room.js
const { createDeck, sortCards, SUITS, RANK_ORDERS } = require('./Deck');
const { calculateScore, resolveRoundWinner } = require('./Rules');
const BotAI = require('./BotAI');

class Room {
    constructor(code, password, hostName, scoreLimit = 500) {
        this.code = code;
        this.password = password;
        this.hostName = hostName;
        this.scoreLimit = scoreLimit;
        this.players = [];
        this.phase = 'waiting';
        this.hands = [[], [], [], []];
        this.centerStack = [];
        this.playedCards = [];
        this.collectedCards = [[], []];
        this.roundScores = [0, 0];
        this.totalScores = [0, 0];
        this.turn = 0;
        this.leader = -1;
        this.contract = 0;
        this.gameMode = 'hokm';  // پیش‌فرض - بعداً توسط حاکم تغییر می‌کند
        this.masterSuit = null;
        this.passed = {};
        this.proposalLog = [];
        this.matchHistory = [];
        this.gameHistory = [];
        this.botAI = new BotAI();
        this.turnTimer = null;
        this.turnDuration = 5000; // 5 ثانیه
        this.turnStartTime = null;
        this.timerCallback = null;
        this.lastActivity = Date.now();
        this.timerLock = false;
    }

    // === Timer Methods ===
    
    startTurnTimer(callback) {
        if (this.timerLock) return;
        this.timerLock = true;
        
        this.clearTurnTimer();
        this.turnStartTime = Date.now();
        this.timerCallback = callback;

        this.turnTimer = setTimeout(() => {
            this.timerLock = false;
            this.handleTimeout();
        }, this.turnDuration);
        
        this.timerLock = false;
    }

    clearTurnTimer() {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
        this.turnStartTime = null;
    }

    getRemainingTime() {
        if (!this.turnStartTime) return this.turnDuration;
        const elapsed = Date.now() - this.turnStartTime;
        return Math.max(0, this.turnDuration - elapsed);
    }

    handleTimeout() {
        if (this.phase === 'waiting' || this.phase === 'ended') return;
        
        const playerIndex = this.turn;
        let result = null;

        try {
            if (this.phase === 'proposing') {
                result = this.botPropose(playerIndex);
            } else if (this.phase === 'exchanging') {
                result = this.botExchange(playerIndex);
            } else if (this.phase === 'selectMode') {
                result = this.botSelectMode(playerIndex);
            } else if (this.phase === 'playing') {
                result = this.botPlayCard(playerIndex);
            }

            if (this.timerCallback && result) {
                this.timerCallback(playerIndex, result);
            }
        } catch (e) {
            console.error('[Room] Timeout handler error:', e);
        }
    }

    // === Bot AI Methods ===
    
    botPropose(playerIndex) {
        const hand = this.hands[playerIndex];
        if (!hand || hand.length === 0) {
            this.passProposal(playerIndex);
            return { type: 'proposal', action: 'pass' };
        }
        
        const decision = this.botAI.selectProposal(hand, this.contract, this.leader !== -1);
        if (decision.pass) {
            this.passProposal(playerIndex);
            return { type: 'proposal', action: 'pass' };
        } else {
            this.submitProposal(playerIndex, decision.value);
            return { type: 'proposal', action: 'call', value: decision.value };
        }
    }

    botExchange(playerIndex) {
        const hand = this.hands[playerIndex];
        if (!hand || hand.length < 4) {
            return { type: 'exchange' };
        }
        
        const cardIndices = this.botAI.selectExchangeCards(hand);
        this.exchangeCards(playerIndex, cardIndices);
        return { type: 'exchange' };
    }

    botSelectMode(playerIndex) {
        const hand = this.hands[playerIndex];
        if (!hand) {
            this.selectMode(playerIndex, 'hokm', '♠');
            return { type: 'mode', mode: 'hokm', suit: '♠' };
        }
        
        const decision = this.botAI.selectGameMode(hand);
        this.selectMode(playerIndex, decision.mode, decision.suit);
        return { type: 'mode', mode: decision.mode, suit: decision.suit };
    }

    botPlayCard(playerIndex) {
        const hand = this.hands[playerIndex];
        if (!hand || hand.length === 0) {
            return { type: 'play', card: null };
        }
        
        const cardIndex = this.botAI.selectCard(
            hand,
            this.playedCards,
            this.gameMode,
            this.masterSuit,
            playerIndex,
            this.leader
        );
        
        const card = this.playCard(playerIndex, cardIndex >= 0 ? cardIndex : 0);
        return { type: 'play', card };
    }

    // === Player Management ===
    
    addPlayer(id, name) {
        if (this.players.length >= 4) return false;
        this.players.push({ 
            id, 
            name, 
            ready: false, 
            connected: true,
            joinedAt: Date.now()
        });
        return true;
    }

    reconnectPlayer(index, newId) {
        if (this.players[index]) {
            this.players[index].id = newId;
            this.players[index].connected = true;
            delete this.players[index].disconnectedAt;
        }
    }

    setPlayerReady(index) {
        if (this.players[index]) {
            this.players[index].ready = true;
        }
        return this.players.length === 4 && this.players.every(p => p.ready && p.connected);
    }

    // === Game Flow ===
    
    startMatch() {
        this.phase = 'proposing';
        this.hands = [[], [], [], []];
        this.playedCards = [];
        this.collectedCards = [[], []];
        this.roundScores = [0, 0];
        this.centerStack = [];
        this.leader = -1;
        this.contract = 0;
        this.gameMode = 'hokm';  // ریست به پیش‌فرض - حاکم بعداً تغییر می‌دهد
        this.masterSuit = null;
        this.passed = { 0: false, 1: false, 2: false, 3: false };
        this.proposalLog = [];
        this.gameHistory = [];

        let deck = createDeck();

        // تقسیم کارت - 12 کارت برای هر بازیکن
        for (let i = 0; i < 12; i++) {
            for (let p = 0; p < 4; p++) {
                if (deck.length > 0) {
                    this.hands[p].push(deck.pop());
                }
            }
        }

        // مرتب‌سازی با حالت پیش‌فرض
        for (let i = 0; i < 4; i++) {
            this.hands[i] = sortCards(this.hands[i], 'hokm');
        }

        // 4 کارت وسط
        for (let i = 0; i < 4 && deck.length > 0; i++) {
            this.centerStack.push(deck.pop());
        }

        this.turn = 0;
        this.lastActivity = Date.now();
        
        console.log(`[Room ${this.code}] Match started`);
    }

    // === Proposal Phase ===
    
    submitProposal(playerIndex, value) {
        if (this.phase !== 'proposing') return false;
        if (this.turn !== playerIndex) return false;
        if (value <= this.contract || value < 100 || value > 165) return false;

        this.contract = value;
        this.proposalLog.push({ player: playerIndex, action: 'call', value });
        this.lastActivity = Date.now();
        
        console.log(`[Room ${this.code}] Player ${playerIndex} proposed ${value}`);
        return true;
    }

    passProposal(playerIndex) {
        if (this.phase !== 'proposing') return false;
        if (this.turn !== playerIndex) return false;

        this.passed[playerIndex] = true;
        this.proposalLog.push({ player: playerIndex, action: 'pass' });
        this.lastActivity = Date.now();
        
        console.log(`[Room ${this.code}] Player ${playerIndex} passed`);
        return true;
    }

    getActiveProposers() {
        return Object.values(this.passed).filter(p => !p).length;
    }

    nextProposer() {
        let next = (this.turn + 1) % 4;
        let count = 0;
        while (this.passed[next] && count < 4) {
            next = (next + 1) % 4;
            count++;
        }
        this.turn = next;
    }

    finishProposalPhase() {
        if (this.contract < 100) return null;

        // پیدا کردن برنده پیشنهاد
        const winnerKey = Object.keys(this.passed).find(k => !this.passed[k]);
        if (winnerKey === undefined) return null;
        
        const winner = parseInt(winnerKey);

        this.leader = winner;
        this.phase = 'exchanging';
        this.turn = winner;

        // دادن کارت‌های وسط به حاکم
        this.hands[this.leader] = sortCards(
            this.hands[this.leader].concat(this.centerStack),
            'hokm'
        );
        this.centerStack = [];

        console.log(`[Room ${this.code}] Leader: Player ${winner}, Contract: ${this.contract}`);

        return {
            leader: this.leader,
            name: this.players[this.leader]?.name || 'بازیکن',
            contract: this.contract
        };
    }

    // === Exchange Phase ===
    
    exchangeCards(playerIndex, cardIndices) {
        if (this.phase !== 'exchanging') return false;
        if (playerIndex !== this.leader) return false;
        if (!Array.isArray(cardIndices) || cardIndices.length !== 4) return false;

        const hand = this.hands[playerIndex];
        if (!hand) return false;

        // بررسی اعتبار ایندکس‌ها
        const uniqueIndices = [...new Set(cardIndices)];
        if (uniqueIndices.length !== 4) return false;
        if (uniqueIndices.some(i => i < 0 || i >= hand.length)) return false;

        // برداشتن کارت‌ها (از آخر به اول برای حفظ ایندکس‌ها)
        const exchanged = [];
        const sortedIndices = [...cardIndices].sort((a, b) => b - a);
        for (const i of sortedIndices) {
            exchanged.push(hand.splice(i, 1)[0]);
        }
        this.centerStack = exchanged;

        this.hands[playerIndex] = sortCards(this.hands[playerIndex], 'hokm');
        this.phase = 'selectMode';
        this.lastActivity = Date.now();
        
        console.log(`[Room ${this.code}] Player ${playerIndex} exchanged 4 cards`);
        return true;
    }

    // === Mode Selection Phase ===
    
    selectMode(playerIndex, mode, suit) {
        if (this.phase !== 'selectMode') {
            console.log(`[Room ${this.code}] selectMode failed: wrong phase (${this.phase})`);
            return false;
        }
        if (playerIndex !== this.leader) {
            console.log(`[Room ${this.code}] selectMode failed: not leader`);
            return false;
        }

        const validModes = ['hokm', 'nars', 'asNars', 'sars'];
        if (!validModes.includes(mode)) {
            console.log(`[Room ${this.code}] selectMode failed: invalid mode (${mode})`);
            return false;
        }

        // ✅ تغییر gameMode
        this.gameMode = mode;
        console.log(`[Room ${this.code}] Game mode set to: ${mode}`);

        // تنظیم خال حکم
        if (mode !== 'sars') {
            if (!suit || !SUITS.includes(suit)) {
                console.log(`[Room ${this.code}] selectMode failed: invalid suit (${suit})`);
                return false;
            }
            this.masterSuit = suit;
            console.log(`[Room ${this.code}] Master suit set to: ${suit}`);
        } else {
            this.masterSuit = null;
            console.log(`[Room ${this.code}] No master suit (sars mode)`);
        }

        // ✅ مرتب‌سازی مجدد کارت‌ها با ترتیب جدید
        for (let i = 0; i < 4; i++) {
            this.hands[i] = sortCards(this.hands[i], this.gameMode);
        }

        this.phase = 'playing';
        this.turn = this.leader;
        this.lastActivity = Date.now();
        
        console.log(`[Room ${this.code}] Phase changed to: playing`);
        return true;
    }

    // === Playing Phase ===
    
    playCard(playerIndex, cardIndex) {
        if (this.phase !== 'playing') return null;
        if (this.turn !== playerIndex) return null;

        const hand = this.hands[playerIndex];
        if (!hand || cardIndex < 0 || cardIndex >= hand.length) return null;

        const card = hand[cardIndex];
        const leadSuit = this.playedCards.length > 0 ? this.playedCards[0].c.s : null;

        // بررسی همخالی
        if (leadSuit) {
            const hasSuit = hand.some(c => c.s === leadSuit);
            if (hasSuit && card.s !== leadSuit) {
                console.log(`[Room ${this.code}] Must follow suit!`);
                return null;
            }
        }

        hand.splice(cardIndex, 1);
        this.playedCards.push({ p: playerIndex, c: card });

        this.gameHistory.push({
            player: playerIndex,
            card: card,
            round: Math.floor(this.gameHistory.length / 4) + 1,
            timestamp: Date.now()
        });

        this.turn = (this.turn + 1) % 4;
        this.lastActivity = Date.now();
        
        console.log(`[Room ${this.code}] Player ${playerIndex} played ${card.v}${card.s}`);
        return card;
    }

    // === Round Resolution ===
    
    resolveRound() {
        if (this.playedCards.length !== 4) return null;

        // ✅ استفاده از gameMode فعلی
        console.log(`[Room ${this.code}] Resolving round with mode: ${this.gameMode}, trump: ${this.masterSuit}`);
        
        let winnerPlayerIndex = resolveRoundWinner(
            this.playedCards, 
            this.gameMode,      // ← حالت بازی فعلی
            this.masterSuit     // ← خال حکم
        );
        
        let team = winnerPlayerIndex % 2;

        let roundCards = this.playedCards.map(p => p.c);
        this.collectedCards[team].push(...roundCards);
        let points = calculateScore(roundCards);
        this.roundScores[team] += points;

        const result = {
            winner: winnerPlayerIndex,
            winnerName: this.players[winnerPlayerIndex]?.name || 'بازیکن',
            team,
            points,
            playedCards: this.playedCards.map(p => ({
                player: p.p,
                card: p.c,
                isWinner: p.p === winnerPlayerIndex
            }))
        };

        console.log(`[Room ${this.code}] Round winner: Player ${winnerPlayerIndex} (${result.winnerName}), Points: ${points}`);

        this.playedCards = [];
        this.turn = winnerPlayerIndex;

        // آخرین دست - امتیاز کارت‌های وسط به تیم برنده
        if (this.hands[0].length === 0) {
            let extraPoints = calculateScore(this.centerStack);
            this.roundScores[team] += extraPoints;
            console.log(`[Room ${this.code}] Last trick bonus: ${extraPoints} to team ${team}`);
        }

        return result;
    }

    // === Match End ===
    
    endMatch() {
        const leaderTeam = this.leader % 2;
        const leaderScore = this.roundScores[leaderTeam];
        const success = leaderScore >= this.contract;

        if (success) {
            this.totalScores[leaderTeam] += leaderScore;
        } else {
            this.totalScores[1 - leaderTeam] += this.contract;
        }

        this.matchHistory.push({
            leader: this.leader,
            leaderName: this.players[this.leader]?.name,
            contract: this.contract,
            leaderScore,
            opponentScore: this.roundScores[1 - leaderTeam],
            success,
            gameMode: this.gameMode,
            masterSuit: this.masterSuit
        });

        this.phase = 'ended';

        const gameOver = this.totalScores[0] >= this.scoreLimit || 
                         this.totalScores[1] >= this.scoreLimit;

        console.log(`[Room ${this.code}] Match ended - Success: ${success}, Scores: ${this.totalScores}`);

        return {
            success,
            leaderTeam,
            leaderScore,
            opponentScore: this.roundScores[1 - leaderTeam],
            contract: this.contract,
            totalScores: [...this.totalScores],
            gameOver,
            winner: gameOver ? (this.totalScores[0] >= this.scoreLimit ? 0 : 1) : null,
            matchHistory: this.matchHistory
        };
    }

    startNextMatch() {
        this.startMatch();
    }

    resetGame() {
        this.phase = 'waiting';
        this.totalScores = [0, 0];
        this.matchHistory = [];
        this.players.forEach(p => p.ready = false);
        this.clearTurnTimer();
        console.log(`[Room ${this.code}] Game reset`);
    }

    // === State ===
    
    getStateForPlayer(index) {
        return {
            phase: this.phase,
            hand: this.hands[index] || [],
            handCounts: [0, 1, 2, 3].map(x => this.hands[x]?.length || 0),
            playedCards: this.playedCards.map(p => ({ p: p.p, c: p.c })),
            turn: this.turn,
            leader: this.leader,
            contract: this.contract,
            gameMode: this.gameMode,         // ← حالت بازی
            masterSuit: this.masterSuit,     // ← خال حکم
            roundScores: [...this.roundScores],
            totalScores: [...this.totalScores],
            collectedRounds: [
                Math.floor(this.collectedCards[0].length / 4),
                Math.floor(this.collectedCards[1].length / 4)
            ],
            proposalLog: this.proposalLog,
            players: this.players.map(p => ({ 
                name: p.name, 
                connected: p.connected 
            })),
            myIndex: index,
            scoreLimit: this.scoreLimit,
            remainingTime: Math.ceil(this.getRemainingTime() / 1000)
        };
    }

    getPlayerList() {
        return this.players.map((p, i) => ({
            name: p.name,
            ready: p.ready,
            connected: p.connected,
            isHost: i === 0
        }));
    }
}

module.exports = Room;