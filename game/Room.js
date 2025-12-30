const { createDeck, sortCards, SUITS } = require('./Deck');
const { calculateScore, resolveRoundWinner } = require('./Rules');
const BotAI = require('./BotAI');

class Room {
  constructor(code, password, hostName, scoreLimit) {
    this.code = code;
    this.password = password;
    this.hostIndex = 0;
    this.scoreLimit = scoreLimit || 500;
    this.players = [];
    this.phase = 'wait';
    this.hands = {};
    this.centerStack = [];
    this.contract = 100;
    this.leader = -1;
    this.turn = 0;
    this.passed = {};
    this.masterSuit = null;
    this.gameMode = 'hokm';
    this.playedCards = [];
    this.collectedCards = { 0: [], 1: [] };
    this.opener = 0;
    this.totalScores = [0, 0];
    this.proposalLog = [];
    this.roundPoints = { 0: 0, 1: 0 };
    
    // Game history
    this.gameHistory = [];
    this.matchHistory = [];
    
    // Timer system
    this.turnTimer = null;
    this.turnStartTime = null;
    this.turnDuration = 30000; // 30 seconds
    this.timerCallback = null;
    
    // Bot AI
    this.botAI = new BotAI();
  }

  // === Timer Methods ===
  
  startTurnTimer(callback) {
    this.clearTurnTimer();
    this.turnStartTime = Date.now();
    this.timerCallback = callback;
    
    this.turnTimer = setTimeout(() => {
      this.handleTimeout();
    }, this.turnDuration);
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
    // Bot plays for the timed-out player
    const playerIndex = this.turn;
    let result = null;

    switch (this.phase) {
      case 'propose':
        result = this.botPropose(playerIndex);
        break;
      case 'exchange':
        result = this.botExchange(playerIndex);
        break;
      case 'selectMode':
        result = this.botSelectMode(playerIndex);
        break;
      case 'playing':
        result = this.botPlayCard(playerIndex);
        break;
    }

    if (this.timerCallback) {
      this.timerCallback(playerIndex, result);
    }
  }

  // === Bot Actions ===
  
  botPropose(playerIndex) {
    const hand = this.hands[playerIndex];
    const decision = this.botAI.selectProposal(hand, this.contract, this.leader !== -1);
    
    if (decision.action === 'pass') {
      this.passProposal(playerIndex);
      return { action: 'pass' };
    } else {
      this.submitProposal(playerIndex, decision.value);
      return { action: 'call', value: decision.value };
    }
  }

  botExchange(playerIndex) {
    const hand = this.hands[playerIndex];
    const cardIndices = this.botAI.selectExchangeCards(hand);
    this.exchangeCards(playerIndex, cardIndices);
    return { action: 'exchange', indices: cardIndices };
  }

  botSelectMode(playerIndex) {
    const hand = this.hands[playerIndex];
    const decision = this.botAI.selectGameMode(hand);
    this.selectMode(playerIndex, decision.mode, decision.suit);
    return { action: 'selectMode', mode: decision.mode, suit: decision.suit };
  }

  botPlayCard(playerIndex) {
    const hand = this.hands[playerIndex];
    const cardIndex = this.botAI.selectCard(
      hand,
      this.playedCards,
      this.gameMode,
      this.masterSuit,
      playerIndex,
      this.leader
    );
    
    const card = this.playCard(playerIndex, cardIndex);
    return { action: 'playCard', cardIndex, card };
  }

  // === Original Methods (updated) ===

  addPlayer(id, name) {
    if (this.players.length >= 4) return false;
    this.players.push({ id, name, ready: false, connected: true });
    return true;
  }

  reconnectPlayer(index, newId) {
    if (this.players[index]) {
      this.players[index].id = newId;
      this.players[index].connected = true;
      return true;
    }
    return false;
  }

  setPlayerReady(index) {
    if (this.players[index]) {
      this.players[index].ready = true;
      return this.players.length === 4 && this.players.every(p => p.ready && p.connected);
    }
    return false;
  }

  startMatch() {
    this.clearTurnTimer();
    
    let deck = createDeck();
    this.phase = 'propose';
    this.hands = {};
    this.centerStack = [];
    this.contract = 100;
    this.leader = -1;
    this.passed = { 0: false, 1: false, 2: false, 3: false };
    this.masterSuit = null;
    this.gameMode = 'hokm';
    this.playedCards = [];
    this.collectedCards = { 0: [], 1: [] };
    this.turn = (this.opener + 1) % 4;
    this.proposalLog = [];
    this.roundPoints = { 0: 0, 1: 0 };

    for (let i = 0; i < 4; i++) {
      this.hands[i] = [];
      for (let j = 0; j < 12; j++) {
        this.hands[i].push(deck.pop());
      }
      this.hands[i] = sortCards(this.hands[i]);
    }
    for (let i = 0; i < 4; i++) {
      this.centerStack.push(deck.pop());
    }
  }

  submitProposal(playerIndex, value) {
    if (this.phase !== 'propose' || this.turn !== playerIndex) return false;
    const minValue = this.leader === -1 ? 100 : this.contract + 5;
    if (value >= minValue && value <= 165 && value % 5 === 0) {
      this.contract = value;
      this.leader = playerIndex;
      this.proposalLog.push({ player: playerIndex, action: 'call', value });
      this.clearTurnTimer();
      return true;
    }
    return false;
  }

  passProposal(playerIndex) {
    if (this.phase !== 'propose' || this.turn !== playerIndex) return false;
    this.passed[playerIndex] = true;
    this.proposalLog.push({ player: playerIndex, action: 'pass' });
    this.clearTurnTimer();
    return true;
  }

  getActiveProposers() {
    return Object.values(this.passed).filter(p => !p).length;
  }

  nextProposer() {
    let attempts = 0;
    do {
      this.turn = (this.turn + 1) % 4;
      attempts++;
      if (attempts > 4) break;
    } while (this.passed[this.turn]);
  }

  finishProposalPhase() {
    this.clearTurnTimer();
    if (this.leader === -1) return 'restart';
    let winner = parseInt(Object.keys(this.passed).find(k => !this.passed[k]));
    this.leader = winner;
    this.phase = 'exchange';
    this.turn = this.leader;
    this.hands[this.leader] = sortCards(this.hands[this.leader].concat(this.centerStack));
    return 'exchange';
  }

  exchangeCards(playerIndex, cardIndices) {
    if (this.phase !== 'exchange' || playerIndex !== this.leader) return false;
    if (cardIndices.length !== 4) return false;
    
    this.clearTurnTimer();
    
    cardIndices.sort((a, b) => b - a);
    let hand = this.hands[playerIndex];
    let exchanged = [];
    for (let i of cardIndices) {
      if (i >= 0 && i < hand.length) {
        exchanged.push(hand.splice(i, 1)[0]);
      }
    }
    if (exchanged.length !== 4) return false;
    this.centerStack = exchanged;
    this.hands[playerIndex] = sortCards(this.hands[playerIndex]);
    this.phase = 'selectMode';
    return true;
  }

  selectMode(playerIndex, mode, suit) {
    if (this.phase !== 'selectMode' || playerIndex !== this.leader) return false;
    const validModes = ['hokm', 'nars', 'asNars', 'sars'];
    if (!validModes.includes(mode)) return false;
    
    this.clearTurnTimer();
    
    if (mode === 'sars') {
      this.masterSuit = null;
      this.gameMode = 'sars';
    } else {
      if (!SUITS.includes(suit)) return false;
      this.masterSuit = suit;
      this.gameMode = mode;
    }
    for (let i = 0; i < 4; i++) {
      this.hands[i] = sortCards(this.hands[i], this.gameMode);
    }
    this.phase = 'playing';
    this.turn = this.leader;
    return true;
  }

  playCard(playerIndex, cardIndex) {
    if (this.phase !== 'playing' || this.turn !== playerIndex) return null;
    let hand = this.hands[playerIndex];
    if (cardIndex < 0 || cardIndex >= hand.length) return null;
    let card = hand[cardIndex];
    if (this.playedCards.length > 0) {
      let leadSuit = this.playedCards[0].c.s;
      let hasSuit = hand.some(c => c.s === leadSuit);
      if (hasSuit && card.s !== leadSuit) return null;
    }
    
    this.clearTurnTimer();
    
    hand.splice(cardIndex, 1);
    this.playedCards.push({ p: playerIndex, c: card });
    this.turn = (this.turn + 1) % 4;
    
    this.gameHistory.push({
      player: playerIndex,
      playerName: this.players[playerIndex].name,
      card: { ...card },
      timestamp: Date.now()
    });
    
    return card;
  }

  resolveRound() {
    this.clearTurnTimer();
    
    let winnerIndex = resolveRoundWinner(this.playedCards, this.gameMode, this.masterSuit);
    let w = this.playedCards[winnerIndex].p;
    let team = w % 2;
    let roundCards = this.playedCards.map(p => p.c);
    this.collectedCards[team].push(...roundCards);
    let points = calculateScore(roundCards);
    this.roundPoints[team] += points;

    const result = {
      winner: w,
      winnerName: this.players[w].name,
      team,
      points,
      roundPoints: { ...this.roundPoints },
      playedCards: this.playedCards.map(p => ({
        player: p.p,
        name: this.players[p.p].name,
        card: p.c,
        isWinner: p.p === w
      })),
      isLastRound: this.hands[0].length === 0
    };

    if (result.isLastRound) {
      let extraPoints = calculateScore(this.centerStack);
      this.roundPoints[team] += extraPoints;
      result.roundPoints = { ...this.roundPoints };
    }

    this.playedCards = [];
    this.turn = w;
    return result;
  }

  endMatch() {
    this.clearTurnTimer();
    
    let pts = [this.roundPoints[0], this.roundPoints[1]];
    let leaderTeam = this.leader % 2;
    let otherTeam = 1 - leaderTeam;
    let success = pts[leaderTeam] >= this.contract;

    if (success) {
      this.totalScores[leaderTeam] += pts[leaderTeam];
    } else {
      this.totalScores[leaderTeam] -= this.contract;
    }
    this.totalScores[otherTeam] += pts[otherTeam];

    this.matchHistory.push({
      contract: this.contract,
      leader: this.leader,
      leaderName: this.players[this.leader].name,
      gameMode: this.gameMode,
      masterSuit: this.masterSuit,
      points: [...pts],
      success,
      totalScores: [...this.totalScores],
      gameHistory: [...this.gameHistory]
    });

    this.gameHistory = [];
    this.opener = (this.opener + 1) % 4;

    const gameOver = this.totalScores[0] >= this.scoreLimit || this.totalScores[1] >= this.scoreLimit;
    
    if (gameOver) {
      this.phase = 'gameOver';
    } else {
      this.phase = 'finished';
      this.players.forEach(p => p.ready = false);
    }

    return {
      points: pts,
      totalScores: [...this.totalScores],
      leaderTeam,
      contract: this.contract,
      success,
      gameMode: this.gameMode,
      gameOver,
      winner: gameOver ? (this.totalScores[0] >= this.scoreLimit ? 0 : 1) : null,
      matchHistory: this.matchHistory,
      scoreLimit: this.scoreLimit
    };
  }

  resetGame() {
    this.clearTurnTimer();
    this.totalScores = [0, 0];
    this.matchHistory = [];
    this.gameHistory = [];
    this.phase = 'wait';
    this.players.forEach(p => p.ready = false);
  }

  getStateForPlayer(index) {
    return {
      phase: this.phase,
      hand: this.hands[index] || [],
      turn: this.turn,
      contract: this.contract,
      myIndex: index,
      leader: this.leader,
      masterSuit: this.masterSuit,
      gameMode: this.gameMode,
      playedCards: this.playedCards,
      passed: this.passed,
      proposalLog: this.proposalLog,
      handCounts: [0, 1, 2, 3].map(x => this.hands[x]?.length || 0),
      collectedCounts: [
        Math.floor(this.collectedCards[0].length / 4),
        Math.floor(this.collectedCards[1].length / 4)
      ],
      roundPoints: this.roundPoints,
      totalScores: this.totalScores,
      players: this.players.map(p => ({ name: p.name, connected: p.connected })),
      hostIndex: this.hostIndex,
      scoreLimit: this.scoreLimit,
      remainingTime: Math.ceil(this.getRemainingTime() / 1000)
    };
  }

  getPlayerList() {
    return this.players.map((p, i) => ({
      name: p.name,
      ready: p.ready,
      index: i,
      connected: p.connected,
      isHost: i === this.hostIndex
    }));
  }
}

module.exports = Room;