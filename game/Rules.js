// game/Rules.js

const { RANK_ORDERS } = require('./Deck');

/**
 * محاسبه امتیاز کارت‌ها
 * - هر 4 کارت = 5 امتیاز (روت)
 * - هر 5 = 5 امتیاز
 * - هر 10 = 10 امتیاز  
 * - هر A = 10 امتیاز
 */
function calculateScore(cards) {
    if (!cards || cards.length === 0) return 0;
    
    // امتیاز روت (هر 4 کارت = 5 امتیاز)
    let points = Math.floor(cards.length / 4) * 5;
    
    // امتیاز کارت‌های خاص
    for (const card of cards) {
        if (card.v === '5') points += 5;
        else if (card.v === '10') points += 10;
        else if (card.v === 'A') points += 10;
    }
    
    return points;
}

/**
 * تعیین برنده یک دست
 * @param {Array} playedCards - کارت‌های بازی شده [{p: playerIndex, c: card}, ...]
 * @param {string} gameMode - حالت بازی: hokm, nars, asNars, sars
 * @param {string|null} masterSuit - خال حکم (null برای sars)
 * @returns {number} - ایندکس برنده (0-3)
 */
function resolveRoundWinner(playedCards, gameMode, masterSuit) {
    if (!playedCards || playedCards.length === 0) return 0;
    if (playedCards.length !== 4) {
        console.warn('[Rules] playedCards.length !== 4:', playedCards.length);
        return 0;
    }
    
    // ترتیب قدرت کارت‌ها بر اساس حالت بازی
    const rankOrder = RANK_ORDERS[gameMode] || RANK_ORDERS.hokm;
    
    // خال اول (lead suit) - خالی که نفر اول بازی کرده
    const leadSuit = playedCards[0].c.s;
    
    // آیا حکم داریم؟ (در سَرس حکم نداریم)
    const hasTrump = gameMode !== 'sars' && masterSuit;
    
    let winnerIndex = 0;
    let winningCard = playedCards[0].c;
    let winnerIsTrump = hasTrump && winningCard.s === masterSuit;
    
    for (let i = 1; i < 4; i++) {
        const currentCard = playedCards[i].c;
        const currentIsTrump = hasTrump && currentCard.s === masterSuit;
        
        let currentWins = false;
        
        if (hasTrump) {
            // === حالت با حکم (hokm, nars, asNars) ===
            
            if (currentIsTrump && !winnerIsTrump) {
                // کارت فعلی حکم است و برنده فعلی حکم نیست
                // حکم همیشه از غیر حکم می‌برد
                currentWins = true;
            } else if (currentIsTrump && winnerIsTrump) {
                // هر دو حکم هستند - مقایسه قدرت
                if (rankOrder.indexOf(currentCard.v) > rankOrder.indexOf(winningCard.v)) {
                    currentWins = true;
                }
            } else if (!currentIsTrump && !winnerIsTrump) {
                // هیچکدام حکم نیستند
                // فقط اگر خال یکسان با خال اول باشد می‌تواند ببرد
                if (currentCard.s === leadSuit && winningCard.s === leadSuit) {
                    // هر دو همخال اول هستند - مقایسه قدرت
                    if (rankOrder.indexOf(currentCard.v) > rankOrder.indexOf(winningCard.v)) {
                        currentWins = true;
                    }
                } else if (currentCard.s === leadSuit && winningCard.s !== leadSuit) {
                    // کارت فعلی همخال اول است ولی برنده فعلی نیست
                    currentWins = true;
                }
                // اگر کارت فعلی همخال اول نباشد، نمی‌تواند ببرد
            }
            // اگر برنده حکم باشد و کارت فعلی حکم نباشد، برنده عوض نمی‌شود
            
        } else {
            // === حالت سَرس (بدون حکم) ===
            
            // فقط کارت‌های همخال اول می‌توانند برنده شوند
            if (currentCard.s === leadSuit) {
                if (winningCard.s !== leadSuit) {
                    // برنده فعلی همخال اول نیست (نباید اتفاق بیفتد)
                    currentWins = true;
                } else if (rankOrder.indexOf(currentCard.v) > rankOrder.indexOf(winningCard.v)) {
                    currentWins = true;
                }
            }
        }
        
        if (currentWins) {
            winnerIndex = i;
            winningCard = currentCard;
            winnerIsTrump = currentIsTrump;
        }
    }
    
    // تبدیل ایندکس در playedCards به ایندکس بازیکن
    return playedCards[winnerIndex].p;
}

/**
 * بررسی اینکه آیا بازیکن می‌تواند این کارت را بازی کند
 */
function canPlayCard(hand, card, leadSuit) {
    if (!leadSuit) return true; // اولین کارت دست
    
    // اگر بازیکن خال اول را دارد، باید همان را بازی کند
    const hasLeadSuit = hand.some(c => c.s === leadSuit);
    
    if (hasLeadSuit) {
        return card.s === leadSuit;
    }
    
    // اگر خال اول را ندارد، هر کارتی می‌تواند بازی کند
    return true;
}

/**
 * گرفتن کارت‌های قابل بازی
 */
function getPlayableCards(hand, leadSuit) {
    if (!leadSuit) return hand; // همه کارت‌ها قابل بازی
    
    const sameSuitCards = hand.filter(c => c.s === leadSuit);
    
    if (sameSuitCards.length > 0) {
        return sameSuitCards; // فقط کارت‌های همخال
    }
    
    return hand; // همه کارت‌ها قابل بازی
}

module.exports = { 
    calculateScore, 
    resolveRoundWinner,
    canPlayCard,
    getPlayableCards
};