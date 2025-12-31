// game/Deck.js

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// ترتیب قدرت کارت‌ها برای هر حالت بازی
// ایندکس بالاتر = قوی‌تر
const RANK_ORDERS = {
    // حکم: آس قوی‌ترین
    hokm: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
    
    // نَرس: دولو قوی‌ترین، آس ضعیف‌ترین
    nars: ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'],
    
    // آس‌نَرس: آس قوی‌ترین، بعد دولو، شاه ضعیف‌ترین
    asNars: ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'],
    
    // سَرس: مثل حکم ولی بدون خال برتر
    sars: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
};

function createDeck() {
    const deck = [];
    for (const s of SUITS) {
        for (const v of VALUES) {
            deck.push({ s, v });
        }
    }
    // شافل
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function sortCards(hand, gameMode = 'hokm') {
    const rankOrder = RANK_ORDERS[gameMode] || RANK_ORDERS.hokm;
    
    return [...hand].sort((a, b) => {
        // اول بر اساس خال مرتب کن
        if (a.s !== b.s) {
            return SUITS.indexOf(a.s) - SUITS.indexOf(b.s);
        }
        // بعد بر اساس قدرت کارت (قوی‌تر سمت چپ)
        return rankOrder.indexOf(b.v) - rankOrder.indexOf(a.v);
    });
}

function getCardPower(card, gameMode) {
    const rankOrder = RANK_ORDERS[gameMode] || RANK_ORDERS.hokm;
    return rankOrder.indexOf(card.v);
}

module.exports = { 
    createDeck, 
    sortCards, 
    getCardPower,
    SUITS, 
    VALUES, 
    RANK_ORDERS 
};