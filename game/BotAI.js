const { RANK_ORDERS } = require('./Deck');

class BotAI {
  constructor() {
    // امتیاز کارت‌ها برای ارزیابی دست
    this.cardValues = {
      'A': 14, 'K': 13, 'Q': 12, 'J': 11,
      '10': 10, '9': 9, '8': 8, '7': 7,
      '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
    };
  }

  /**
   * انتخاب کارت برای بازی
   */
  selectCard(hand, playedCards, gameMode, masterSuit, myIndex, leader) {
    if (hand.length === 0) return -1;

    const rankOrder = RANK_ORDERS[gameMode] || RANK_ORDERS.hokm;
    const isLeadPlayer = playedCards.length === 0;
    
    if (isLeadPlayer) {
      return this.selectLeadCard(hand, gameMode, masterSuit, rankOrder, myIndex, leader);
    } else {
      return this.selectFollowCard(hand, playedCards, gameMode, masterSuit, rankOrder, myIndex);
    }
  }

  /**
   * انتخاب کارت شروع‌کننده (اولین بازیکن دور)
   */
  selectLeadCard(hand, gameMode, masterSuit, rankOrder, myIndex, leader) {
    // گروه‌بندی کارت‌ها بر اساس خال
    const suits = this.groupBySuit(hand);
    
    // اگر حکم داریم و قوی هستیم، حکم بزنیم
    if (masterSuit && suits[masterSuit]) {
      const trumps = suits[masterSuit];
      const highTrumps = trumps.filter(c => 
        rankOrder.indexOf(c.v) >= rankOrder.indexOf('Q')
      );
      
      // اگر آس یا شاه حکم داریم
      if (highTrumps.length > 0 && trumps.length >= 3) {
        return hand.findIndex(c => c.s === masterSuit && c.v === highTrumps[0].v);
      }
    }

    // پیدا کردن قوی‌ترین خال غیرحکم
    let bestSuit = null;
    let bestScore = -1;

    for (const [suit, cards] of Object.entries(suits)) {
      if (suit === masterSuit) continue;
      
      const score = this.evaluateSuitStrength(cards, rankOrder);
      if (score > bestScore) {
        bestScore = score;
        bestSuit = suit;
      }
    }

    // اگر خال قوی داریم، از بالاترین کارت آن شروع کنیم
    if (bestSuit && suits[bestSuit]) {
      const sortedCards = this.sortCardsByRank(suits[bestSuit], rankOrder);
      const highCard = sortedCards[0];
      
      // اگر آس یا شاه داریم، بزنیم
      if (rankOrder.indexOf(highCard.v) >= rankOrder.indexOf('K')) {
        return hand.findIndex(c => c.s === highCard.s && c.v === highCard.v);
      }
    }

    // وگرنه از خال کوتاه و ضعیف شروع کنیم (برای خالی کردن)
    let shortestSuit = null;
    let shortestLen = 99;

    for (const [suit, cards] of Object.entries(suits)) {
      if (suit === masterSuit) continue;
      if (cards.length < shortestLen && cards.length > 0) {
        shortestLen = cards.length;
        shortestSuit = suit;
      }
    }

    if (shortestSuit) {
      const sortedCards = this.sortCardsByRank(suits[shortestSuit], rankOrder);
      const lowCard = sortedCards[sortedCards.length - 1];
      return hand.findIndex(c => c.s === lowCard.s && c.v === lowCard.v);
    }

    // پیش‌فرض: اولین کارت
    return 0;
  }

  /**
   * انتخاب کارت همخال (بازیکنان بعدی)
   */
  selectFollowCard(hand, playedCards, gameMode, masterSuit, rankOrder, myIndex) {
    const leadCard = playedCards[0].c;
    const leadSuit = leadCard.s;
    
    // کارت‌های همخال
    const sameSuitCards = hand.filter(c => c.s === leadSuit);
    
    // آیا باید همخال بزنیم؟
    if (sameSuitCards.length > 0) {
      return this.selectSameSuitCard(hand, sameSuitCards, playedCards, masterSuit, rankOrder, myIndex);
    }
    
    // همخال نداریم
    const trumpCards = masterSuit ? hand.filter(c => c.s === masterSuit) : [];
    
    if (trumpCards.length > 0) {
      return this.selectTrumpCard(hand, trumpCards, playedCards, masterSuit, rankOrder, myIndex);
    }
    
    // نه همخال داریم نه حکم - ضعیف‌ترین کارت را بزنیم
    return this.selectWeakestCard(hand, rankOrder);
  }

  /**
   * انتخاب کارت همخال
   */
  selectSameSuitCard(hand, sameSuitCards, playedCards, masterSuit, rankOrder, myIndex) {
    const leadSuit = playedCards[0].c.s;
    const sortedSameSuit = this.sortCardsByRank(sameSuitCards, rankOrder);
    
    // پیدا کردن بالاترین کارت بازی شده از این خال
    let highestPlayed = null;
    let highestPlayedRank = -1;
    let winnerIndex = 0;
    
    for (let i = 0; i < playedCards.length; i++) {
      const pc = playedCards[i];
      if (pc.c.s === leadSuit) {
        const rank = rankOrder.indexOf(pc.c.v);
        if (rank > highestPlayedRank) {
          highestPlayedRank = rank;
          highestPlayed = pc.c;
          winnerIndex = i;
        }
      }
    }

    // آیا هم‌تیمی برنده است؟
    const partnerIndex = (myIndex + 2) % 4;
    const partnerIsWinning = playedCards[winnerIndex]?.p === partnerIndex;

    // اگر هم‌تیمی برنده است، ضعیف‌ترین را بزنیم
    if (partnerIsWinning && playedCards.length >= 2) {
      const weakest = sortedSameSuit[sortedSameSuit.length - 1];
      return hand.findIndex(c => c.s === weakest.s && c.v === weakest.v);
    }

    // آیا می‌توانیم ببریم؟
    const myHighest = sortedSameSuit[0];
    const canWin = rankOrder.indexOf(myHighest.v) > highestPlayedRank;

    if (canWin) {
      // کوچک‌ترین کارت برنده را بزنیم
      for (let i = sortedSameSuit.length - 1; i >= 0; i--) {
        if (rankOrder.indexOf(sortedSameSuit[i].v) > highestPlayedRank) {
          const card = sortedSameSuit[i];
          return hand.findIndex(c => c.s === card.s && c.v === card.v);
        }
      }
    }

    // نمی‌توانیم ببریم، ضعیف‌ترین را بزنیم
    const weakest = sortedSameSuit[sortedSameSuit.length - 1];
    return hand.findIndex(c => c.s === weakest.s && c.v === weakest.v);
  }

  /**
   * انتخاب کارت حکم (وقتی همخال نداریم)
   */
  selectTrumpCard(hand, trumpCards, playedCards, masterSuit, rankOrder, myIndex) {
    const sortedTrumps = this.sortCardsByRank(trumpCards, rankOrder);
    
    // آیا حکم بازی شده؟
    const playedTrumps = playedCards.filter(pc => pc.c.s === masterSuit);
    
    // آیا هم‌تیمی برنده است؟
    const currentWinner = this.findCurrentWinner(playedCards, masterSuit, rankOrder);
    const partnerIndex = (myIndex + 2) % 4;
    const partnerIsWinning = currentWinner.playerIndex === partnerIndex;

    // اگر هم‌تیمی برنده است، حکم نزنیم
    if (partnerIsWinning) {
      return this.selectWeakestCard(hand, rankOrder, masterSuit);
    }

    // محاسبه امتیاز روی میز
    const pointsOnTable = this.calculatePointsOnTable(playedCards);
    
    // اگر امتیاز کم است و این آخرین نفر نیست، حکم نزنیم
    if (pointsOnTable < 10 && playedCards.length < 3) {
      return this.selectWeakestCard(hand, rankOrder, masterSuit);
    }

    // اگر حکم بازی شده، باید بالاتر بزنیم
    if (playedTrumps.length > 0) {
      const highestTrumpRank = Math.max(...playedTrumps.map(pc => rankOrder.indexOf(pc.c.v)));
      
      // آیا می‌توانیم بالاتر بزنیم؟
      const canBeat = sortedTrumps.some(c => rankOrder.indexOf(c.v) > highestTrumpRank);
      
      if (canBeat) {
        // کوچک‌ترین حکم برنده
        for (let i = sortedTrumps.length - 1; i >= 0; i--) {
          if (rankOrder.indexOf(sortedTrumps[i].v) > highestTrumpRank) {
            const card = sortedTrumps[i];
            return hand.findIndex(c => c.s === card.s && c.v === card.v);
          }
        }
      }
      
      // نمی‌توانیم ببریم
      return this.selectWeakestCard(hand, rankOrder, masterSuit);
    }

    // حکم بازی نشده، کوچک‌ترین حکم را بزنیم
    const lowestTrump = sortedTrumps[sortedTrumps.length - 1];
    return hand.findIndex(c => c.s === lowestTrump.s && c.v === lowestTrump.v);
  }

  /**
   * انتخاب ضعیف‌ترین کارت
   */
  selectWeakestCard(hand, rankOrder, excludeSuit = null) {
    let weakest = null;
    let weakestRank = 999;
    let weakestIndex = 0;

    hand.forEach((card, index) => {
      if (excludeSuit && card.s === excludeSuit) return;
      
      const rank = rankOrder.indexOf(card.v);
      // اولویت: کارت‌های بدون امتیاز و ضعیف
      const hasPoints = ['A', '10', '5'].includes(card.v);
      const adjustedRank = hasPoints ? rank + 20 : rank;
      
      if (adjustedRank < weakestRank) {
        weakestRank = adjustedRank;
        weakest = card;
        weakestIndex = index;
      }
    });

    return weakestIndex;
  }

  /**
   * انتخاب پیشنهاد قرارداد
   */
  selectProposal(hand, currentContract, hasLeader) {
    const strength = this.evaluateHandStrength(hand);
    
    // قدرت دست: 0-100
    // 0-20: پاس
    // 20-40: 100-110
    // 40-60: 110-125
    // 60-80: 125-145
    // 80-100: 145-165

    const minBid = hasLeader ? currentContract + 5 : 100;
    
    if (strength < 20) {
      return { action: 'pass' };
    }

    let maxBid;
    if (strength < 40) maxBid = 110;
    else if (strength < 60) maxBid = 125;
    else if (strength < 80) maxBid = 145;
    else maxBid = 165;

    if (maxBid < minBid) {
      return { action: 'pass' };
    }

    // پیشنهاد حداقل مقدار ممکن
    return { action: 'call', value: minBid };
  }

  /**
   * انتخاب کارت‌ها برای تعویض
   */
  selectExchangeCards(hand) {
    // 16 کارت داریم، باید 4 تا بدهیم
    const suits = this.groupBySuit(hand);
    const toDiscard = [];
    
    // اولویت‌بندی برای دور ریختن:
    // 1. خال‌های تکی یا دوتایی ضعیف (برای خالی کردن)
    // 2. کارت‌های ضعیف از خال‌های بلند
    
    // پیدا کردن خال‌های کوتاه
    const suitLengths = Object.entries(suits)
      .map(([suit, cards]) => ({ suit, cards, length: cards.length }))
      .sort((a, b) => a.length - b.length);

    for (const { suit, cards } of suitLengths) {
      if (toDiscard.length >= 4) break;
      
      // خال‌های 1 یا 2 تایی بدون آس را دور بریزیم
      if (cards.length <= 2 && !cards.some(c => c.v === 'A')) {
        for (const card of cards) {
          if (toDiscard.length >= 4) break;
          const idx = hand.findIndex(c => c.s === card.s && c.v === card.v);
          if (idx !== -1 && !toDiscard.includes(idx)) {
            toDiscard.push(idx);
          }
        }
      }
    }

    // اگر هنوز 4 تا نشده، ضعیف‌ترین‌ها را اضافه کنیم
    if (toDiscard.length < 4) {
      const rankOrder = RANK_ORDERS.hokm;
      const sorted = hand
        .map((card, index) => ({ card, index }))
        .filter(item => !toDiscard.includes(item.index))
        .sort((a, b) => {
          // کارت‌های بدون امتیاز اول
          const aPoints = ['A', '10', '5'].includes(a.card.v) ? 1 : 0;
          const bPoints = ['A', '10', '5'].includes(b.card.v) ? 1 : 0;
          if (aPoints !== bPoints) return aPoints - bPoints;
          
          return rankOrder.indexOf(a.card.v) - rankOrder.indexOf(b.card.v);
        });

      for (const item of sorted) {
        if (toDiscard.length >= 4) break;
        toDiscard.push(item.index);
      }
    }

    return toDiscard.slice(0, 4);
  }

  /**
   * انتخاب نوع بازی و خال حکم
   */
  selectGameMode(hand) {
    const suits = this.groupBySuit(hand);
    const rankOrder = RANK_ORDERS.hokm;
    
    // پیدا کردن بهترین خال برای حکم
    let bestSuit = null;
    let bestScore = -1;

    for (const [suit, cards] of Object.entries(suits)) {
      const score = cards.length * 10 + this.evaluateSuitStrength(cards, rankOrder);
      if (score > bestScore) {
        bestScore = score;
        bestSuit = suit;
      }
    }

    // تصمیم برای نوع بازی
    // اگر دست قوی است: حکم
    // اگر دست متوسط است و خال بلند داریم: حکم
    // اگر دست ضعیف است: سرس یا نرس
    
    const strength = this.evaluateHandStrength(hand);
    
    if (strength > 50) {
      return { mode: 'hokm', suit: bestSuit };
    } else if (strength > 30 && suits[bestSuit]?.length >= 4) {
      return { mode: 'hokm', suit: bestSuit };
    } else if (strength < 20) {
      // دست خیلی ضعیف - سرس
      return { mode: 'sars', suit: null };
    } else {
      return { mode: 'hokm', suit: bestSuit };
    }
  }

  // === توابع کمکی ===

  groupBySuit(hand) {
    const suits = {};
    for (const card of hand) {
      if (!suits[card.s]) suits[card.s] = [];
      suits[card.s].push(card);
    }
    return suits;
  }

  sortCardsByRank(cards, rankOrder) {
    return [...cards].sort((a, b) => 
      rankOrder.indexOf(b.v) - rankOrder.indexOf(a.v)
    );
  }

  evaluateSuitStrength(cards, rankOrder) {
    let score = 0;
    for (const card of cards) {
      const rank = rankOrder.indexOf(card.v);
      if (rank >= rankOrder.indexOf('A')) score += 4;
      else if (rank >= rankOrder.indexOf('K')) score += 3;
      else if (rank >= rankOrder.indexOf('Q')) score += 2;
      else if (rank >= rankOrder.indexOf('J')) score += 1;
    }
    return score;
  }

  evaluateHandStrength(hand) {
    const suits = this.groupBySuit(hand);
    const rankOrder = RANK_ORDERS.hokm;
    let score = 0;

    // امتیاز برای کارت‌های بالا
    for (const card of hand) {
      if (card.v === 'A') score += 4;
      else if (card.v === 'K') score += 3;
      else if (card.v === 'Q') score += 2;
      else if (card.v === 'J') score += 1;
    }

    // امتیاز برای خال بلند
    for (const [suit, cards] of Object.entries(suits)) {
      if (cards.length >= 5) score += (cards.length - 4) * 2;
      if (cards.length >= 4) score += 2;
    }

    // نرمال‌سازی به 0-100
    return Math.min(100, score * 2.5);
  }

  findCurrentWinner(playedCards, masterSuit, rankOrder) {
    if (playedCards.length === 0) return null;

    let winnerIndex = 0;
    let winnerCard = playedCards[0].c;
    const leadSuit = winnerCard.s;

    for (let i = 1; i < playedCards.length; i++) {
      const card = playedCards[i].c;
      const isTrump = masterSuit && card.s === masterSuit;
      const winnerIsTrump = masterSuit && winnerCard.s === masterSuit;

      if (isTrump && !winnerIsTrump) {
        winnerIndex = i;
        winnerCard = card;
      } else if (isTrump && winnerIsTrump) {
        if (rankOrder.indexOf(card.v) > rankOrder.indexOf(winnerCard.v)) {
          winnerIndex = i;
          winnerCard = card;
        }
      } else if (!isTrump && !winnerIsTrump && card.s === leadSuit) {
        if (rankOrder.indexOf(card.v) > rankOrder.indexOf(winnerCard.v)) {
          winnerIndex = i;
          winnerCard = card;
        }
      }
    }

    return { playerIndex: playedCards[winnerIndex].p, card: winnerCard };
  }

  calculatePointsOnTable(playedCards) {
    let points = 0;
    for (const pc of playedCards) {
      if (pc.c.v === 'A') points += 10;
      else if (pc.c.v === '10') points += 10;
      else if (pc.c.v === '5') points += 5;
    }
    return points;
  }
}

module.exports = BotAI;