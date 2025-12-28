const express = require('express');
const http = require('http');
const {Server} = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

let rooms = {};

function createDeck() {
  let d = [];
  for (let s of SUITS) for (let v of RANKS) d.push({s, v});
  for (let i = d.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function sortCards(hand) {
  return hand.sort((a, b) => {
    if (a.s !== b.s) return SUITS.indexOf(a.s) - SUITS.indexOf(b.s);
    return RANKS.indexOf(b.v) - RANKS.indexOf(a.v);
  });
}

function getRoom(code) {
  if (!rooms[code]) {
    rooms[code] = {
      code: code,
      players: [], 
      phase: 'wait',
      hands: {},
      centerStack: [],
      contract: 100,
      leader: -1,
      turn: 0,
      passed: {},
      masterSuit: null,
      isNoMaster: false,
      playedCards: [],
      collectedCards: {0: [], 1: []},
      opener: 0,
      totalScores: [0, 0],
      proposalLog: [],
      roundPoints: {0: 0, 1: 0}
    };
  }
  return rooms[code];
}

function calculateScore(cards) {
  let p = Math.floor(cards.length / 4) * 5;
  for (let c of cards) {
    if (c.v === '5') p += 5;
    else if (c.v === '10') p += 10;
    else if (c.v === 'A') p += 10;
  }
  return p;
}

function startMatch(room) {
  let deck = createDeck();
  room.phase = 'propose';
  room.hands = {};
  room.centerStack = [];
  room.contract = 100;
  room.leader = -1;
  room.passed = {0: false, 1: false, 2: false, 3: false};
  room.masterSuit = null;
  room.isNoMaster = false;
  room.playedCards = [];
  room.collectedCards = {0: [], 1: []};
  room.turn = (room.opener + 1) % 4;
  room.proposalLog = [];
  room.roundPoints = {0: 0, 1: 0};

  for (let i = 0; i < 4; i++) {
    room.hands[i] = [];
    for (let j = 0; j < 12; j++) room.hands[i].push(deck.pop());
    room.hands[i] = sortCards(room.hands[i]);
  }
  for (let i = 0; i < 4; i++) room.centerStack.push(deck.pop());

  broadcastState(room);
}

function nextProposer(room) {
  let active = Object.values(room.passed).filter(p => !p).length;
  
  if (active === 1) {
    let winner = parseInt(Object.keys(room.passed).find(k => !room.passed[k]));
    
    if (room.leader === -1) { 
       startMatch(room);
       return;
    }
    
    room.leader = winner;
    room.phase = 'exchange';
    room.turn = room.leader;
    room.hands[room.leader] = sortCards(room.hands[room.leader].concat(room.centerStack));
    
    io.to(room.code).emit('leaderSelected', {
      leader: room.leader, 
      name: room.players[room.leader].name,
      contract: room.contract
    });
    
    broadcastState(room);
    return;
  }
  
  do {
    room.turn = (room.turn + 1) % 4;
  } while (room.passed[room.turn]);
  broadcastState(room);
}

function resolveRound(room) {
  let winnerIndex = 0;
  let best = room.playedCards[0].c;
  let leadSuit = best.s;

  for (let i = 1; i < 4; i++) {
    let c = room.playedCards[i].c;
    
    if (room.isNoMaster) {
      if (c.s === leadSuit && RANKS.indexOf(c.v) > RANKS.indexOf(best.v)) {
        winnerIndex = i;
        best = c;
      }
    } else {
      let cIsMaster = c.s === room.masterSuit;
      let bestIsMaster = best.s === room.masterSuit;
      
      if (cIsMaster && !bestIsMaster) {
        winnerIndex = i;
        best = c;
      } else if (cIsMaster && bestIsMaster) {
        if (RANKS.indexOf(c.v) > RANKS.indexOf(best.v)) {
          winnerIndex = i;
          best = c;
        }
      } else if (!cIsMaster && !bestIsMaster && c.s === leadSuit) {
        if (RANKS.indexOf(c.v) > RANKS.indexOf(best.v)) {
          winnerIndex = i;
          best = c;
        }
      }
    }
  }

  let w = room.playedCards[winnerIndex].p;
  let team = w % 2;
  let roundCards = room.playedCards.map(p => p.c);
  room.collectedCards[team].push(...roundCards);
  
  let points = calculateScore(roundCards);
  room.roundPoints[team] += points;
  
  io.to(room.code).emit('roundResult', {
    winner: w, 
    name: room.players[w].name,
    team: team,
    points: points,
    roundPoints: room.roundPoints
  });
  
  room.playedCards = [];
  room.turn = w;

  if (room.hands[0].length === 0) {
    let extraPoints = calculateScore(room.centerStack);
    room.roundPoints[team] += extraPoints;
    
    setTimeout(() => endMatch(room), 1000);
  } else {
    broadcastState(room);
  }
}

function endMatch(room) {
  let pts = [room.roundPoints[0], room.roundPoints[1]];
  let leaderTeam = room.leader % 2;
  let otherTeam = 1 - leaderTeam;
  let success = false;

  if (pts[leaderTeam] >= room.contract) {
    room.totalScores[leaderTeam] += pts[leaderTeam]; 
    success = true;
  } else {
    room.totalScores[leaderTeam] -= room.contract; 
  }
  
  room.totalScores[otherTeam] += pts[otherTeam];

  room.opener = (room.opener + 1) % 4;
  room.phase = 'finished';
  
  io.to(room.code).emit('matchEnded', {
    points: pts,
    totalScores: room.totalScores,
    leaderTeam,
    contract: room.contract,
    success: success
  });

  room.players.forEach(p => p.ready = false);
  
  io.to(room.code).emit('updatePlayerList', room.players.map((p, i) => ({
    name: p.name, ready: p.ready, index: i, connected: p.connected
  })));
}

function sendStateToPlayer(room, index) {
  if(!room.players[index]) return;
  io.to(room.players[index].id).emit('gameState', {
      phase: room.phase,
      hand: room.hands[index] || [],
      turn: room.turn,
      contract: room.contract,
      myIndex: index,
      leader: room.leader,
      masterSuit: room.masterSuit,
      isNoMaster: room.isNoMaster,
      playedCards: room.playedCards,
      passed: room.passed,
      proposalLog: room.proposalLog,
      handCounts: [0,1,2,3].map(x => room.hands[x]?.length || 0),
      collectedCounts: [Math.floor(room.collectedCards[0].length/4), Math.floor(room.collectedCards[1].length/4)],
      roundPoints: room.roundPoints,
      totalScores: room.totalScores
    });
}

function broadcastState(room) {
  room.players.forEach((p, i) => {
    if(p.connected) sendStateToPlayer(room, i);
  });
}

io.on('connection', socket => {
  let myRoom = null;
  let myIndex = -1;

  socket.on('join', ({code, name}) => {
    let room = getRoom(code);
    let existing = room.players.findIndex(p => p.name === name);

    if (existing !== -1) {
      if (room.players[existing].connected) {
         socket.emit('error', 'نام تکراری است');
         return;
      }
      let p = room.players[existing];
      p.id = socket.id;
      p.connected = true;
      myRoom = code;
      myIndex = existing;
      socket.join(code);
      socket.emit('joined', {index: myIndex, isRejoin: true});
      if (room.phase !== 'wait') sendStateToPlayer(room, myIndex);
    } else {
      if (room.players.length >= 4) {
        socket.emit('error', 'اتاق پر است');
        return;
      }
      myRoom = code;
      myIndex = room.players.length;
      room.players.push({id: socket.id, name, ready: false, connected: true});
      socket.join(code);
      socket.emit('joined', {index: myIndex, isRejoin: false});
    }

    io.to(code).emit('updatePlayerList', room.players.map((p, i) => ({
      name: p.name, ready: p.ready, index: i, connected: p.connected
    })));
  });

  socket.on('playerReady', () => {
    if (!myRoom) return;
    let room = rooms[myRoom];
    room.players[myIndex].ready = true;
    io.to(myRoom).emit('updatePlayerList', room.players.map((p, i) => ({
      name: p.name, ready: p.ready, index: i, connected: p.connected
    })));
    
    if (room.players.length === 4 && room.players.every(p => p.ready && p.connected)) {
      startMatch(room);
    }
  });

  socket.on('submitProposal', val => {
    if (!myRoom) return;
    let room = rooms[myRoom];
    if (room.phase !== 'propose' || room.turn !== myIndex) return;
    
    if (val > room.contract && val <= 165 && val % 5 === 0) { 
      room.contract = val;
      room.leader = myIndex;
      room.proposalLog.push({player: myIndex, action: 'call', value: val});
      io.to(myRoom).emit('proposalUpdate', {player: myIndex, action: 'call', value: val, name: room.players[myIndex].name});
      nextProposer(room);
    }
  });

  socket.on('passProposal', () => {
    if (!myRoom) return;
    let room = rooms[myRoom];
    if (room.phase !== 'propose' || room.turn !== myIndex) return;
    room.passed[myIndex] = true;
    room.proposalLog.push({player: myIndex, action: 'pass'});
    io.to(myRoom).emit('proposalUpdate', {player: myIndex, action: 'pass', name: room.players[myIndex].name});
    nextProposer(room);
  });

  socket.on('exchangeCards', cardIndices => {
    if (!myRoom) return;
    let room = rooms[myRoom];
    if (room.phase !== 'exchange' || myIndex !== room.leader) return;
    if (cardIndices.length !== 4) return;

    cardIndices.sort((a, b) => b - a);
    let hand = room.hands[myIndex];
    let exchanged = [];
    
    for (let i of cardIndices) {
      if (i >= 0 && i < hand.length) {
        exchanged.push(hand.splice(i, 1)[0]);
      }
    }
    
    room.centerStack = exchanged; 
    room.hands[myIndex] = sortCards(room.hands[myIndex]);
    room.phase = 'selectMode';
    
    broadcastState(room);
  });

  socket.on('selectMode', data => {
    if (!myRoom) return;
    let room = rooms[myRoom];
    if (room.phase !== 'selectMode' || myIndex !== room.leader) return;
    
    if (data.mode === 'noMaster') {
      room.masterSuit = null;
      room.isNoMaster = true;
    } else if (SUITS.includes(data.suit)) {
      room.masterSuit = data.suit;
      room.isNoMaster = false;
    } else {
      return;
    }
    
    room.phase = 'playing';
    room.turn = room.leader;
    
    io.to(myRoom).emit('modeSelected', {
      masterSuit: room.masterSuit, 
      isNoMaster: room.isNoMaster,
      leader: room.leader, 
      name: room.players[room.leader].name
    });
    broadcastState(room);
  });

  socket.on('playCard', cardIndex => {
    if (!myRoom) return;
    let room = rooms[myRoom];
    if (room.phase !== 'playing' || room.turn !== myIndex) return;

    let hand = room.hands[myIndex];
    if (cardIndex < 0 || cardIndex >= hand.length) return;

    let card = hand[cardIndex];
    
    if (room.playedCards.length > 0) {
      let leadSuit = room.playedCards[0].c.s;
      let hasSuit = hand.some(c => c.s === leadSuit);
      if (hasSuit && card.s !== leadSuit) {
        socket.emit('error', 'باید کارت مرتبط بازی کنید');
        return;
      }
    }

    hand.splice(cardIndex, 1);
    room.playedCards.push({p: myIndex, c: card});
    
    io.to(myRoom).emit('cardAction', {player: myIndex, card: card, name: room.players[myIndex].name});

    if (room.playedCards.length === 4) {
      setTimeout(() => resolveRound(room), 1500);
    } else {
      room.turn = (room.turn + 1) % 4;
      broadcastState(room);
    }
  });

  socket.on('disconnect', () => {
    if (myRoom && rooms[myRoom]) {
      let room = rooms[myRoom];
      if (room.players[myIndex]) {
        room.players[myIndex].connected = false;
        io.to(myRoom).emit('updatePlayerList', room.players.map((p, i) => ({
          name: p.name, ready: p.ready, index: i, connected: p.connected
        })));
        io.to(myRoom).emit('log', {msg: `${room.players[myIndex].name} قطع شد`});
      }
    }
  });
});

// Keep alive for free hosting
setInterval(() => {
  console.log('Keep alive ping');
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));