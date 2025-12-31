// game/Room.js
const { createDeck, sortCards, SUITS } = require('./Deck');
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
        this.gameMode = 'hokm';
        this.masterSuit = null;
        this.passed = {};
        this.proposalLog = [];
        this.matchHistory = [];
        this.gameHistory = [];
        this.botAI = new BotAI();
        this.turnTimer = null;
        this.turnDuration = 30000;
        this.turnStartTime = null;
        this.timerCallback = null;
        this.lastActivity = Date.now();
        this.timerLock = false; // جلوگیری از race condition
    }

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
            console.error('Timeout handler error:', e);
        }
    }

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

    startMatch() {
        this.phase = 'proposing';
        this.hands = [[], [], [], []];
        this.playedCards = [];
        this.collectedCards = [[], []];
        this.roundScores = [0, 0];
        this.centerStack = [];
        this.leader = -1;
        this.contract = 0;
        this.gameMode = 'hokm';
        this.masterSuit = null;
        this.passed = { 0: false, 1: false, 2: false, 3: false };
        this.proposalLog = [];
        this.gameHistory = [];

        let deck = createDeck();

        // تقسیم کارت
        for (let i = 0; i < 12; i++) {
            for (let p = 0; p < 4; p++) {
                if (deck.length > 0) {
                    this.hands[p].push(deck.pop());
                }
            }
        }

        // مرتب‌سازی
        for (let i = 0; i < 4; i++) {
            this.hands[i] = sortCards(this.hands[i]);
        }

        // 4 کارت وسط
        for (let i = 0; i < 4 && deck.length > 0; i++) {
            this.centerStack.push(deck.pop());
        }

        this.turn = 0;
    }

    submitProposal(playerIndex, value) {
        if (this.phase !== 'proposing') return false;
        if (this.turn !== playerIndex) return false;
        if (value <= this.contract || value < 100 || value > 165) return false;

        this.contract = value;
        this.proposalLog.push({ player: playerIndex, action: 'call', value });
        return true;
    }

    passProposal(playerIndex) {
        if (this.phase !== 'proposing') return false;
        if (this.turn !== playerIndex) return false;

        this.passed[playerIndex] = true;
        this.proposalLog.push({ player: playerIndex, action: 'pass' });
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

        let winner = parseInt(Object.keys(this.passed).find(k => !this.passed[k]));
        if (isNaN(winner)) return null;

        this.leader = winner;
        this.phase = 'exchanging';
        this.turn = winner;

        // دادن کارت‌های وسط به حاکم
        this.hands[this.leader] = sortCards(this.hands[this.leader].concat(this.centerStack));
        this.centerStack = [];

        return {
            leader: this.leader,
            name: this.players[this.leader]?.name || 'بازیکن',
            contract: this.contract
        };
    }

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

        // برداشتن کارت‌ها
        const exchanged = [];
        cardIndices.sort((a, b) => b - a);
        for (let i of cardIndices) {
            exchanged.push(hand.splice(i, 1)[0]);
        }
        this.centerStack = exchanged;

        this.hands[playerIndex] = sortCards(this.hands[playerIndex]);
        this.phase = 'selectMode';
        return true;
    }

    selectMode(playerIndex, mode, suit) {
        if (this.phase !== 'selectMode') return false;
        if (playerIndex !== this.leader) return false;

        const validModes = ['hokm', 'nars', 'asNars', 'sars'];
        if (!validModes.includes(mode)) return false;

        this.gameMode = mode;

        if (mode !== 'sars') {
            if (!suit || !SUITS.includes(suit)) return false;
            this.masterSuit = suit;
        } else {
            this.masterSuit = null;
        }

        // مرتب‌سازی مجدد با مد جدید
        for (let i = 0; i < 4; i++) {
            this.hands[i] = sortCards(this.hands[i], this.gameMode);
        }

        this.phase = 'playing';
        this.turn = this.leader;
        return true;
    }

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
        return card;
    }

    resolveRound() {
        if (this.playedCards.length !== 4) return null;

        let winnerIndex = resolveRoundWinner(this.playedCards, this.gameMode, this.masterSuit);
        let winner = winnerIndex;
        let team = winner % 2;

        let roundCards = this.playedCards.map(p => p.c);
        this.collectedCards[team].push(...roundCards);
        let points = calculateScore(roundCards);
        this.roundScores[team] += points;

        const result = {
            winner,
            winnerName: this.players[winner]?.name || 'بازیکن',
            team,
            points,
            playedCards: this.playedCards.map(p => ({
                player: p.p,
                card: p.c,
                isWinner: p.p === winner
            }))
        };

        this.playedCards = [];
        this.turn = winner;

        // آخرین دست - امتیاز کارت‌های وسط
        if (this.hands[0].length === 0) {
            let extraPoints = calculateScore(this.centerStack);
            this.roundScores[team] += extraPoints;
        }

        return result;
    }

    endMatch() {
        let leaderTeam = this.leader % 2;
        let leaderScore = this.roundScores[leaderTeam];
        let success = leaderScore >= this.contract;

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
    }

    getStateForPlayer(index) {
        return {
            phase: this.phase,
            hand: this.hands[index] || [],
            handCounts: [0, 1, 2, 3].map(x => this.hands[x]?.length || 0),
            playedCards: this.playedCards.map(p => ({ p: p.p, c: p.c })),
            turn: this.turn,
            leader: this.leader,
            contract: this.contract,
            gameMode: this.gameMode,
            masterSuit: this.masterSuit,
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