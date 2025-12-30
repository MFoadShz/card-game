const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_ORDERS = {
  hokm: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
  sars: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
  nars: ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'],
  asNars: ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A']
};

function createDeck() {
  let d = [];
  for (let s of SUITS) {
    for (let v of RANKS) {
      d.push({ s, v });
    }
  }
  // Shuffle
  for (let i = d.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function sortCards(hand, gameMode = 'hokm') {
  const rankOrder = RANK_ORDERS[gameMode] || RANK_ORDERS.hokm;
  return [...hand].sort((a, b) => {
    if (a.s !== b.s) return SUITS.indexOf(a.s) - SUITS.indexOf(b.s);
    return rankOrder.indexOf(b.v) - rankOrder.indexOf(a.v);
  });
}

module.exports = { SUITS, RANKS, RANK_ORDERS, createDeck, sortCards };