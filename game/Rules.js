const { RANK_ORDERS } = require('./Deck');

function calculateScore(cards) {
  let p = Math.floor(cards.length / 4) * 5;
  for (let c of cards) {
    if (c.v === '5') p += 5;
    else if (c.v === '10') p += 10;
    else if (c.v === 'A') p += 10;
  }
  return p;
}

function resolveRoundWinner(playedCards, gameMode, masterSuit) {
  let winnerIndex = 0;
  let best = playedCards[0].c;
  let leadSuit = best.s;
  const rankOrder = RANK_ORDERS[gameMode] || RANK_ORDERS.hokm;
  const hasTrump = gameMode !== 'sars' && masterSuit;

  for (let i = 1; i < 4; i++) {
    let c = playedCards[i].c;

    if (hasTrump) {
      let cIsMaster = c.s === masterSuit;
      let bestIsMaster = best.s === masterSuit;

      if (cIsMaster && !bestIsMaster) {
        winnerIndex = i;
        best = c;
      } else if (cIsMaster && bestIsMaster) {
        if (rankOrder.indexOf(c.v) > rankOrder.indexOf(best.v)) {
          winnerIndex = i;
          best = c;
        }
      } else if (!cIsMaster && !bestIsMaster && c.s === leadSuit) {
        if (rankOrder.indexOf(c.v) > rankOrder.indexOf(best.v)) {
          winnerIndex = i;
          best = c;
        }
      }
    } else {
      if (c.s === leadSuit && rankOrder.indexOf(c.v) > rankOrder.indexOf(best.v)) {
        winnerIndex = i;
        best = c;
      }
    }
  }

  return winnerIndex;
}

module.exports = { calculateScore, resolveRoundWinner };