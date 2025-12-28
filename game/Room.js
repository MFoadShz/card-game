const { createDeck, sortCards, SUITS } = require('./Deck');
const { calculateScore, resolveRoundWinner } = require('./Rules');

class Room {
  constructor(code) {
    this.code = code;
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
  }

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
      for (let j = 0; j < 12; j++) this.hands[i].push(deck.pop());
      this.hands[i] = sortCards(this.hands[i]);
    }
    for (let i = 0; i < 4; i++) this.centerStack.push(deck.pop());
  }

  submitProposal(playerIndex, value) {
    if (this.phase !== 'propose' || this.turn !== playerIndex) return false;
    if (value > this.contract && value <= 165 && value % 5 === 0) {
      this.contract = value;
      this.leader = playerIndex;
      this.proposalLog.push({ player: playerIndex, action: 'call', value });
      return true;
    }
    return false;
  }

  passProposal(playerIndex) {
    if (this.phase !== 'propose' || this.turn !== playerIndex) return false;
    this.passed[playerIndex] = true;
    this.proposalLog.push({ player: playerIndex, action: 'pass' });
    return true;
  }

  getActiveProposers() {
    return Object.values(this.passed).filter(p => !p).length;
  }

  nextProposer() {
    do {
      this.turn = (this.turn + 1) % 4;
    } while (this.passed[this.turn]);
  }

  finishProposalPhase() {
    let winner = parseInt(Object.keys(this.passed).find(k => !this.passed[k]));
    if (this.leader === -1) return 'restart';

    this.leader = winner;
    this.phase = 'exchange';
    this.turn = this.leader;
    this.hands[this.leader] = sortCards(this.hands[this.leader].concat(this.centerStack));
    return 'exchange';
  }

  exchangeCards(playerIndex, cardIndices) {
    if (this.phase !== 'exchange' || playerIndex !== this.leader) return false;
    if (cardIndices.length !== 4) return false;

    cardIndices.sort((a, b) => b - a);
    let hand = this.hands[playerIndex];
    let exchanged = [];

    for (let i of cardIndices) {
      if (i >= 0 && i < hand.length) {
        exchanged.push(hand.splice(i, 1)[0]);
      }
    }

    this.centerStack = exchanged;
    this.hands[playerIndex] = sortCards(this.hands[playerIndex]);
    this.phase = 'selectMode';
    return true;
  }

  selectMode(playerIndex, mode, suit) {
    if (this.phase !== 'selectMode' || playerIndex !== this.leader) return false;

    const validModes = ['hokm', 'nars', 'asNars', 'sars'];
    if (!validModes.includes(mode)) return false;

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

    hand.splice(cardIndex, 1);
    this.playedCards.push({ p: playerIndex, c: card });

    return card;
  }

  resolveRound() {
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

    this.opener = (this.opener + 1) % 4;
    this.phase = 'finished';
    this.players.forEach(p => p.ready = false);

    return {
      points: pts,
      totalScores: [...this.totalScores],
      leaderTeam,
      contract: this.contract,
      success,
      gameMode: this.gameMode
    };
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
      totalScores: this.totalScores
    };
  }

  getPlayerList() {
    return this.players.map((p, i) => ({
      name: p.name,
      ready: p.ready,
      index: i,
      connected: p.connected
    }));
  }
}

module.exports = Room;