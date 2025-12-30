const { createDeck, sortCards } = require('./Deck');
const { resolveRoundWinner, calculateScore } = require('./Rules');

class DevRoom {
  constructor() {
    this.players = [
      { id: 'dev', name: 'توسعه‌دهنده', ready: true, connected: true },
      { id: 'bot1', name: 'بات ۱', ready: true, connected: true },
      { id: 'bot2', name: 'بات ۲', ready: true, connected: true },
      { id: 'bot3', name: 'بات ۳', ready: true, connected: true }
    ];
    this.phase = 'waiting';
    this.hands = [[], [], [], []];
    this.playedCards = [];
    this.collectedCards = [[], []];
    this.roundScores = [0, 0];
    this.totalScores = [0, 0];
    this.turn = 0;
    this.leader = 0;
    this.contract = 0;
    this.gameMode = null;
    this.masterSuit = null;
    this.centerStack = [];
    this.proposalLog = [];
    this.currentProposal = 0;
    this.passed = { 0: false, 1: false, 2: false, 3: false };
  }

  // شروع سریع بازی با فاز دلخواه
  quickStart(phase = 'playing', options = {}) {
    let deck = createDeck();
    
    // پخش کارت
    for (let i = 0; i < 4; i++) {
      this.hands[i] = [];
      for (let j = 0; j < 12; j++) {
        this.hands[i].push(deck.pop());
      }
    }
    
    // 4 کارت مرکز
    this.centerStack = [];
    for (let i = 0; i < 4; i++) {
      this.centerStack.push(deck.pop());
    }

    this.leader = options.leader || 0;
    this.turn = options.turn || 0;
    this.contract = options.contract || 100;
    this.gameMode = options.gameMode || 'hokm';
    this.masterSuit = options.masterSuit || '♠';
    this.phase = phase;

    // مرتب‌سازی دست‌ها
    for (let i = 0; i < 4; i++) {
      this.hands[i] = sortCards(this.hands[i], this.gameMode);
    }

    return this.getStateForPlayer(0);
  }

  // تنظیم فاز دستی
  setPhase(phase) {
    this.phase = phase;
    return this.getStateForPlayer(0);
  }

  // بازی کارت توسط بات‌ها
  botPlay() {
    if (this.phase !== 'playing' || this.turn === 0) return null;
    
    const botIndex = this.turn;
    const hand = this.hands[botIndex];
    if (hand.length === 0) return null;

    // انتخاب کارت معتبر
    let cardIndex = 0;
    if (this.playedCards.length > 0) {
      const leadSuit = this.playedCards[0].c.s;
      const suitCards = hand.map((c, i) => ({ c, i })).filter(x => x.c.s === leadSuit);
      if (suitCards.length > 0) {
        cardIndex = suitCards[Math.floor(Math.random() * suitCards.length)].i;
      }
    }

    const card = hand.splice(cardIndex, 1)[0];
    this.playedCards.push({ p: botIndex, c: card });

    // نوبت بعدی
    this.turn = (this.turn + 1) % 4;

    // اگر 4 کارت بازی شده، دور تمام
    if (this.playedCards.length === 4) {
      return { type: 'roundComplete', card, botIndex };
    }

    return { type: 'cardPlayed', card, botIndex };
  }

  // حل دور و شروع دور جدید
  resolveRound() {
    if (this.playedCards.length !== 4) return null;

    const winnerIndex = resolveRoundWinner(this.playedCards, this.gameMode, this.masterSuit);
    const team = winnerIndex % 2;
    const roundCards = this.playedCards.map(p => p.c);
    this.collectedCards[team].push(...roundCards);
    const points = calculateScore(roundCards);
    this.roundScores[team] += points;

    const result = {
      winner: winnerIndex,
      winnerName: this.players[winnerIndex].name,
      team,
      points,
      playedCards: this.playedCards.map(p => ({
        player: p.p,
        playerName: this.players[p.p].name,
        card: p.c,
        isWinner: p.p === winnerIndex
      }))
    };

    this.playedCards = [];
    this.turn = winnerIndex;

    // چک پایان بازی
    if (this.hands[0].length === 0) {
      this.phase = 'ended';
    }

    return result;
  }

  // بازی کارت توسط بازیکن
  playCard(cardIndex) {
    if (this.phase !== 'playing' || this.turn !== 0) return null;
    
    const hand = this.hands[0];
    if (cardIndex < 0 || cardIndex >= hand.length) return null;

    // چک کارت معتبر
    if (this.playedCards.length > 0) {
      const leadSuit = this.playedCards[0].c.s;
      const card = hand[cardIndex];
      const hasSuit = hand.some(c => c.s === leadSuit);
      if (hasSuit && card.s !== leadSuit) return false;
    }

    const card = hand.splice(cardIndex, 1)[0];
    this.playedCards.push({ p: 0, c: card });
    this.turn = (this.turn + 1) % 4;

    return card;
  }

  // شبیه‌سازی پیشنهاد
  simulateProposal() {
    this.phase = 'proposing';
    this.currentProposal = 100;
    this.proposalLog = [
      { player: 1, action: 'call', value: 100 },
      { player: 2, action: 'pass' },
      { player: 3, action: 'call', value: 105 },
    ];
    this.turn = 0;
    return this.getStateForPlayer(0);
  }

  // شبیه‌سازی تعویض کارت
  simulateExchange() {
    this.quickStart('exchanging');
    this.hands[0] = sortCards(this.hands[0].concat(this.centerStack), this.gameMode);
    this.centerStack = [];
    return this.getStateForPlayer(0);
  }

  // وضعیت برای بازیکن
  getStateForPlayer(index) {
    return {
      phase: this.phase,
      myIndex: index,
      hand: this.hands[index],
      playedCards: this.playedCards,
      turn: this.turn,
      leader: this.leader,
      contract: this.contract,
      gameMode: this.gameMode,
      masterSuit: this.masterSuit,
      roundScores: this.roundScores,
      totalScores: this.totalScores,
      proposalLog: this.proposalLog,
      currentProposal: this.currentProposal,
      handCounts: this.hands.map(h => h.length),
      wonRounds: [
        Math.floor(this.collectedCards[0].length / 4),
        Math.floor(this.collectedCards[1].length / 4)
      ],
      players: this.players.map(p => ({ name: p.name, connected: p.connected }))
    };
  }

  getPlayerList() {
    return this.players.map((p, i) => ({
      name: p.name,
      ready: p.ready,
      connected: p.connected,
      index: i
    }));
  }
}

module.exports = DevRoom;