const { createDeck, sortCards } = require('./Deck');
const { resolveRoundWinner, calculateScore } = require('./Rules');
const BotAI = require('./BotAI');

class DevRoom {
  constructor() {
    this.players = [
      { id: 'dev', name: 'شما', connected: true },
      { id: 'bot1', name: 'بات ۱', connected: true },
      { id: 'bot2', name: 'بات ۲', connected: true },
      { id: 'bot3', name: 'بات ۳', connected: true }
    ];
    this.botAI = new BotAI();
    this.reset();
  }

  reset() {
    this.phase = 'waiting';
    this.hands = [[], [], [], []];
    this.playedCards = [];
    this.collectedCards = [[], []];
    this.roundScores = [0, 0];
    this.totalScores = [0, 0];
    this.turn = 0;
    this.leader = -1;
    this.contract = 0;
    this.gameMode = 'hokm';
    this.masterSuit = null;
    this.centerStack = [];
    this.proposalLog = [];
  }

  startGame() {
    // Legacy: keep a direct start for playing-only mode if ever used
    this.prepareGame();
    this.phase = 'playing';
    this.turn = 0;
    if (!this.masterSuit) this.masterSuit = '♠';
    return this.getState();
  }

  prepareGame() {
    const deck = createDeck();
    for (let i = 0; i < 4; i++) {
      this.hands[i] = sortCards(deck.splice(0, 12), this.gameMode);
    }
    this.centerStack = deck.splice(0, 4);
    this.phase = 'proposing';
    this.contract = 0;
    this.leader = -1;
    this.turn = 0;
    return this.getState();
  }

  runFakeAuction() {
    // Simulate a quick auction to surface the UI
    const steps = [];
    const names = this.players.map(p => p.name);

    // Bot 1 opens 100
    this.contract = 100;
    this.leader = 1;
    steps.push({ player: 1, name: names[1], action: 'call', value: 100 });

    // Bot 2 raises to 110
    this.contract = 110;
    this.leader = 2;
    steps.push({ player: 2, name: names[2], action: 'call', value: 110 });

    // You raise to 115
    this.contract = 115;
    this.leader = 0;
    steps.push({ player: 0, name: names[0], action: 'call', value: 115 });

    // Remaining bot passes
    steps.push({ player: 3, name: names[3], action: 'pass' });

    this.proposalLog = steps;
    this.phase = 'selectMode';
    this.turn = this.leader;

    return steps;
  }

  selectMode(mode, suit) {
    this.gameMode = mode || 'hokm';
    this.masterSuit = this.gameMode === 'sars' ? null : (suit || '♠');
    this.phase = 'playing';
    this.turn = this.leader >= 0 ? this.leader : 0;
    return { mode: this.gameMode, suit: this.masterSuit };
  }

  playCard(index) {
    if (this.turn !== 0 || index < 0 || index >= this.hands[0].length) return null;
    
    // Check suit rule
    if (this.playedCards.length > 0) {
      const leadSuit = this.playedCards[0].c.s;
      const card = this.hands[0][index];
      if (this.hands[0].some(c => c.s === leadSuit) && card.s !== leadSuit) {
        return false;
      }
    }
    
    const card = this.hands[0].splice(index, 1)[0];
    this.playedCards.push({ p: 0, c: card });
    this.turn = 1;
    return card;
  }

  botPlay() {
    if (this.turn === 0 || this.playedCards.length >= 4) return null;
    
    const botIndex = this.turn;
    const cardIndex = this.botAI.selectCard(
      this.hands[botIndex],
      this.playedCards,
      this.gameMode,
      this.masterSuit,
      botIndex,
      this.leader
    );
    
    const card = this.hands[botIndex].splice(cardIndex, 1)[0];
    this.playedCards.push({ p: botIndex, c: card });
    this.turn = (this.turn + 1) % 4;
    
    return { botIndex, card, isRoundComplete: this.playedCards.length === 4 };
  }

  resolveRound() {
    const winnerIdx = resolveRoundWinner(this.playedCards, this.gameMode, this.masterSuit);
    const winner = this.playedCards[winnerIdx].p;
    const team = winner % 2;
    const cards = this.playedCards.map(p => p.c);
    
    this.collectedCards[team].push(...cards);
    const points = calculateScore(cards);
    this.roundScores[team] += points;
    
    const result = {
      winner,
      winnerName: this.players[winner].name,
      team,
      points,
      cards: this.playedCards.map(p => ({ ...p, isWinner: p.p === winner }))
    };
    
    this.playedCards = [];
    this.turn = winner;
    
    if (this.hands[0].length === 0) {
      this.roundScores[team] += calculateScore(this.centerStack);
      this.totalScores[0] += this.roundScores[0];
      this.totalScores[1] += this.roundScores[1];
      this.phase = 'ended';
    }
    
    return result;
  }

  getState() {
    return {
      phase: this.phase,
      myIndex: 0,
      hand: this.hands[0],
      playedCards: this.playedCards,
      turn: this.turn,
      leader: this.leader,
      contract: this.contract,
      gameMode: this.gameMode,
      masterSuit: this.masterSuit,
      roundScores: this.roundScores,
      totalScores: this.totalScores,
      handCounts: this.hands.map(h => h.length),
      players: this.players.map(p => ({ name: p.name, connected: true }))
    };
  }
}

module.exports = DevRoom;