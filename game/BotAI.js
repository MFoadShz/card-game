// game/BotAI.js

const { RANK_ORDERS } = require('./Deck');

class BotAI {
    constructor() {
        this.cardValues = {
            'A': 14, 'K': 13, 'Q': 12, 'J': 11,
            '10': 10, '9': 9, '8': 8, '7': 7,
            '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
        };
    }

    // ========================================
    // انتخاب کارت برای بازی
    // ========================================
    
    selectCard(hand, playedCards, gameMode, masterSuit, myIndex, leader) {
        if (!hand || hand.length === 0) return 0;

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
        const suits = this.groupBySuit(hand);
        
        // اگر حکم داریم و قوی هستیم، حکم بزنیم
        if (masterSuit && suits[masterSuit]) {
            const trumps = suits[masterSuit];
            const highTrumps = trumps.filter(c => 
                rankOrder.indexOf(c.v) >= rankOrder.indexOf('Q')
            );
            
            if (highTrumps.length > 0 && trumps.length >= 3) {
                const idx = hand.findIndex(c => c.s === masterSuit && c.v === highTrumps[0].v);
                if (idx !== -1) return idx;
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

        // اگر خال قوی داریم، از بالاترین کارت شروع کنیم
        if (bestSuit && suits[bestSuit] && suits[bestSuit].length > 0) {
            const sortedCards = this.sortCardsByRank(suits[bestSuit], rankOrder);
            const highCard = sortedCards[0];
            
            if (rankOrder.indexOf(highCard.v) >= rankOrder.indexOf('K')) {
                const idx = hand.findIndex(c => c.s === highCard.s && c.v === highCard.v);
                if (idx !== -1) return idx;
            }
        }

        // از خال کوتاه و ضعیف شروع کنیم
        let shortestSuit = null;
        let shortestLen = 99;

        for (const [suit, cards] of Object.entries(suits)) {
            if (suit === masterSuit) continue;
            if (cards.length < shortestLen && cards.length > 0) {
                shortestLen = cards.length;
                shortestSuit = suit;
            }
        }

        if (shortestSuit && suits[shortestSuit] && suits[shortestSuit].length > 0) {
            const sortedCards = this.sortCardsByRank(suits[shortestSuit], rankOrder);
            const lowCard = sortedCards[sortedCards.length - 1];
            const idx = hand.findIndex(c => c.s === lowCard.s && c.v === lowCard.v);
            if (idx !== -1) return idx;
        }

        return 0;
    }

    /**
     * انتخاب کارت همخال
     */
    selectFollowCard(hand, playedCards, gameMode, masterSuit, rankOrder, myIndex) {
        const leadCard = playedCards[0].c;
        const leadSuit = leadCard.s;
        
        const sameSuitCards = hand.filter(c => c.s === leadSuit);
        
        if (sameSuitCards.length > 0) {
            return this.selectSameSuitCard(hand, sameSuitCards, playedCards, masterSuit, rankOrder, myIndex);
        }
        
        const trumpCards = masterSuit ? hand.filter(c => c.s === masterSuit) : [];
        
        if (trumpCards.length > 0) {
            return this.selectTrumpCard(hand, trumpCards, playedCards, masterSuit, rankOrder, myIndex);
        }
        
        return this.selectWeakestCard(hand, rankOrder);
    }

    /**
     * انتخاب کارت همخال
     */
    selectSameSuitCard(hand, sameSuitCards, playedCards, masterSuit, rankOrder, myIndex) {
        const leadSuit = playedCards[0].c.s;
        const sortedSameSuit = this.sortCardsByRank(sameSuitCards, rankOrder);
        
        let highestPlayedRank = -1;
        let winnerPlayerIndex = playedCards[0].p;
        
        for (let i = 0; i < playedCards.length; i++) {
            const pc = playedCards[i];
            if (pc.c.s === leadSuit) {
                const rank = rankOrder.indexOf(pc.c.v);
                if (rank > highestPlayedRank) {
                    highestPlayedRank = rank;
                    winnerPlayerIndex = pc.p;
                }
            }
        }

        // آیا هم‌تیمی برنده است؟
        const partnerIndex = (myIndex + 2) % 4;
        const partnerIsWinning = winnerPlayerIndex === partnerIndex;

        if (partnerIsWinning && playedCards.length >= 2) {
            const weakest = sortedSameSuit[sortedSameSuit.length - 1];
            const idx = hand.findIndex(c => c.s === weakest.s && c.v === weakest.v);
            return idx !== -1 ? idx : 0;
        }

        // آیا می‌توانیم ببریم؟
        const myHighest = sortedSameSuit[0];
        const canWin = rankOrder.indexOf(myHighest.v) > highestPlayedRank;

        if (canWin) {
            for (let i = sortedSameSuit.length - 1; i >= 0; i--) {
                if (rankOrder.indexOf(sortedSameSuit[i].v) > highestPlayedRank) {
                    const card = sortedSameSuit[i];
                    const idx = hand.findIndex(c => c.s === card.s && c.v === card.v);
                    if (idx !== -1) return idx;
                }
            }
        }

        const weakest = sortedSameSuit[sortedSameSuit.length - 1];
        const idx = hand.findIndex(c => c.s === weakest.s && c.v === weakest.v);
        return idx !== -1 ? idx : 0;
    }

    /**
     * انتخاب کارت حکم
     */
    selectTrumpCard(hand, trumpCards, playedCards, masterSuit, rankOrder, myIndex) {
        const sortedTrumps = this.sortCardsByRank(trumpCards, rankOrder);
        const playedTrumps = playedCards.filter(pc => pc.c.s === masterSuit);
        
        const currentWinner = this.findCurrentWinner(playedCards, masterSuit, rankOrder);
        const partnerIndex = (myIndex + 2) % 4;
        const partnerIsWinning = currentWinner && currentWinner.playerIndex === partnerIndex;

        if (partnerIsWinning) {
            return this.selectWeakestCard(hand, rankOrder, masterSuit);
        }

        const pointsOnTable = this.calculatePointsOnTable(playedCards);
        
        if (pointsOnTable < 10 && playedCards.length < 3) {
            return this.selectWeakestCard(hand, rankOrder, masterSuit);
        }

        if (playedTrumps.length > 0) {
            const highestTrumpRank = Math.max(...playedTrumps.map(pc => rankOrder.indexOf(pc.c.v)));
            const canBeat = sortedTrumps.some(c => rankOrder.indexOf(c.v) > highestTrumpRank);
            
            if (canBeat) {
                for (let i = sortedTrumps.length - 1; i >= 0; i--) {
                    if (rankOrder.indexOf(sortedTrumps[i].v) > highestTrumpRank) {
                        const card = sortedTrumps[i];
                        const idx = hand.findIndex(c => c.s === card.s && c.v === card.v);
                        if (idx !== -1) return idx;
                    }
                }
            }
            return this.selectWeakestCard(hand, rankOrder, masterSuit);
        }

        const lowestTrump = sortedTrumps[sortedTrumps.length - 1];
        const idx = hand.findIndex(c => c.s === lowestTrump.s && c.v === lowestTrump.v);
        return idx !== -1 ? idx : 0;
    }

    /**
     * انتخاب ضعیف‌ترین کارت
     */
    selectWeakestCard(hand, rankOrder, excludeSuit = null) {
        let weakestRank = 999;
        let weakestIndex = 0;

        hand.forEach((card, index) => {
            if (excludeSuit && card.s === excludeSuit) return;
            
            const rank = rankOrder.indexOf(card.v);
            const hasPoints = ['A', '10', '5'].includes(card.v);
            const adjustedRank = hasPoints ? rank + 50 : rank;
            
            if (adjustedRank < weakestRank) {
                weakestRank = adjustedRank;
                weakestIndex = index;
            }
        });

        return weakestIndex;
    }

    // ========================================
    // ✅ انتخاب پیشنهاد قرارداد - اصلاح شده
    // ========================================
    
    selectProposal(hand, currentContract, hasLeader) {
        const strength = this.evaluateHandStrength(hand);
        
        console.log(`[BotAI] Proposal - Strength: ${strength}, CurrentContract: ${currentContract}`);
        
        // ✅ اصلاح منطق minBid
        // اگر قرارداد فعلی 0 است، می‌توانیم 100 بزنیم
        // اگر قرارداد فعلی > 0، باید بالاتر بزنیم
        let minBid;
        if (currentContract === 0) {
            minBid = 100;
        } else {
            minBid = currentContract + 5;
        }
        
        // حداکثر پیشنهاد بر اساس قدرت دست
        let maxBid;
        if (strength >= 80) maxBid = 165;
        else if (strength >= 65) maxBid = 145;
        else if (strength >= 50) maxBid = 130;
        else if (strength >= 35) maxBid = 115;
        else if (strength >= 20) maxBid = 105;
        else maxBid = 100;
        
        // اگر قرارداد فعلی 0 است، حتماً یک پیشنهاد بده
        if (currentContract === 0) {
            console.log(`[BotAI] First bid: ${minBid}`);
            // ✅ فرمت درست
            return { pass: false, value: minBid };
        }
        
        // اگر minBid از maxBid بیشتر شد، پاس کن
        if (minBid > maxBid) {
            console.log(`[BotAI] Passing - minBid ${minBid} > maxBid ${maxBid}`);
            // ✅ فرمت درست
            return { pass: true };
        }
        
        // اگر minBid بیش از 165 شد، پاس کن
        if (minBid > 165) {
            console.log(`[BotAI] Passing - minBid ${minBid} > 165`);
            return { pass: true };
        }
        
        // پیشنهاد بده
        console.log(`[BotAI] Bidding: ${minBid}`);
        return { pass: false, value: minBid };
    }

    // ========================================
    // انتخاب کارت‌ها برای تعویض
    // ========================================
    
    selectExchangeCards(hand) {
        if (!hand || hand.length < 4) return [0, 1, 2, 3];
        
        const suits = this.groupBySuit(hand);
        const toDiscard = [];
        const rankOrder = RANK_ORDERS.hokm;
        
        // خال‌های کوتاه بدون آس را دور بریز
        const suitLengths = Object.entries(suits)
            .filter(([suit, cards]) => cards.length > 0)
            .map(([suit, cards]) => ({ suit, cards, length: cards.length }))
            .sort((a, b) => a.length - b.length);

        for (const { suit, cards } of suitLengths) {
            if (toDiscard.length >= 4) break;
            
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

        // اگر هنوز 4 تا نشده، ضعیف‌ترین‌ها را اضافه کن
        if (toDiscard.length < 4) {
            const sorted = hand
                .map((card, index) => ({ card, index }))
                .filter(item => !toDiscard.includes(item.index))
                .sort((a, b) => {
                    const aPoints = ['A', '10', '5'].includes(a.card.v) ? 100 : 0;
                    const bPoints = ['A', '10', '5'].includes(b.card.v) ? 100 : 0;
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

    // ========================================
    // انتخاب نوع بازی و خال حکم
    // ========================================
    
    selectGameMode(hand) {
        if (!hand || hand.length === 0) {
            return { mode: 'hokm', suit: '♠' };
        }
        
        const suits = this.groupBySuit(hand);
        const rankOrder = RANK_ORDERS.hokm;
        
        let bestSuit = '♠';
        let bestScore = -1;

        for (const [suit, cards] of Object.entries(suits)) {
            if (!cards || cards.length === 0) continue;
            const score = cards.length * 10 + this.evaluateSuitStrength(cards, rankOrder);
            if (score > bestScore) {
                bestScore = score;
                bestSuit = suit;
            }
        }

        const strength = this.evaluateHandStrength(hand);
        
        // تصمیم برای نوع بازی
        if (strength >= 50) {
            return { mode: 'hokm', suit: bestSuit };
        } else if (strength >= 30 && suits[bestSuit]?.length >= 4) {
            return { mode: 'hokm', suit: bestSuit };
        } else if (strength < 15) {
            return { mode: 'sars', suit: null };
        } else {
            return { mode: 'hokm', suit: bestSuit };
        }
    }

    // ========================================
    // توابع کمکی
    // ========================================

    groupBySuit(hand) {
        const suits = { '♠': [], '♥': [], '♦': [], '♣': [] };
        if (!hand) return suits;
        
        for (const card of hand) {
            if (card && card.s && suits[card.s]) {
                suits[card.s].push(card);
            }
        }
        return suits;
    }

    sortCardsByRank(cards, rankOrder) {
        if (!cards || cards.length === 0) return [];
        return [...cards].sort((a, b) => 
            rankOrder.indexOf(b.v) - rankOrder.indexOf(a.v)
        );
    }

    evaluateSuitStrength(cards, rankOrder) {
        if (!cards) return 0;
        let score = 0;
        for (const card of cards) {
            const rank = rankOrder.indexOf(card.v);
            const maxRank = rankOrder.length - 1;
            if (rank >= maxRank) score += 4;      // A
            else if (rank >= maxRank - 1) score += 3;  // K
            else if (rank >= maxRank - 2) score += 2;  // Q
            else if (rank >= maxRank - 3) score += 1;  // J
        }
        return score;
    }

    evaluateHandStrength(hand) {
        if (!hand || hand.length === 0) return 0;
        
        const suits = this.groupBySuit(hand);
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
            if (cards.length >= 5) score += (cards.length - 4) * 3;
            if (cards.length >= 4) score += 2;
        }

        return Math.min(100, score * 2.5);
    }

    findCurrentWinner(playedCards, masterSuit, rankOrder) {
        if (!playedCards || playedCards.length === 0) return null;

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
        if (!playedCards) return 0;
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