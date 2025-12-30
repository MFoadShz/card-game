const Room = require('./Room');

const rooms = {};

function getRoom(code) {
  return rooms[code] || null;
}

function createRoom(code, password, hostName, scoreLimit) {
  if (rooms[code]) return null;
  rooms[code] = new Room(code, password, hostName, scoreLimit);
  return rooms[code];
}

function broadcastState(io, room) {
  room.players.forEach((p, i) => {
    if (p.connected) {
      io.to(p.id).emit('gameState', room.getStateForPlayer(i));
    }
  });
}

function startTurnTimer(io, room, roomCode) {
  room.startTurnTimer((playerIndex, result) => {
    // Bot played for timed-out player
    io.to(roomCode).emit('botAction', {
      player: playerIndex,
      name: room.players[playerIndex].name,
      result
    });

    if (result.action === 'pass') {
      io.to(roomCode).emit('proposalUpdate', {
        player: playerIndex,
        action: 'pass',
        name: room.players[playerIndex].name,
        isBot: true
      });
      handleNextProposer(io, room, roomCode);
    } else if (result.action === 'call') {
      io.to(roomCode).emit('proposalUpdate', {
        player: playerIndex,
        action: 'call',
        value: result.value,
        name: room.players[playerIndex].name,
        isBot: true
      });
      handleNextProposer(io, room, roomCode);
    } else if (result.action === 'exchange') {
      broadcastState(io, room);
      startTurnTimer(io, room, roomCode);
    } else if (result.action === 'selectMode') {
      io.to(roomCode).emit('modeSelected', {
        masterSuit: room.masterSuit,
        gameMode: room.gameMode,
        leader: room.leader,
        name: room.players[room.leader].name,
        isBot: true
      });
      broadcastState(io, room);
      startTurnTimer(io, room, roomCode);
    } else if (result.action === 'playCard') {
      io.to(roomCode).emit('cardAction', {
        player: playerIndex,
        card: result.card,
        name: room.players[playerIndex].name,
        isBot: true
      });
      
      if (room.playedCards.length === 4) {
        handleRoundEnd(io, room, roomCode);
      } else {
        broadcastState(io, room);
        startTurnTimer(io, room, roomCode);
      }
    }
  });
  
  // Broadcast timer start
  io.to(roomCode).emit('timerStart', {
    player: room.turn,
    duration: 30
  });
}

function handleRoundEnd(io, room, roomCode) {
  setTimeout(() => {
    let result = room.resolveRound();
    io.to(roomCode).emit('roundResult', result);
    
    if (result.isLastRound) {
      setTimeout(() => {
        let endResult = room.endMatch();
        io.to(roomCode).emit('matchEnded', endResult);
        if (endResult.gameOver) {
          io.to(roomCode).emit('gameOver', endResult);
        }
        io.to(roomCode).emit('updatePlayerList', room.getPlayerList());
      }, 3000);
    } else {
      setTimeout(() => {
        broadcastState(io, room);
        startTurnTimer(io, room, roomCode);
      }, 2500);
    }
  }, 500);
}

function handleNextProposer(io, room, roomCode) {
  let active = room.getActiveProposers();
  
  if (active === 0 || (active === 1 && room.leader === -1)) {
    room.startMatch();
    io.to(roomCode).emit('proposalRestart', { reason: 'همه پاس کردند' });
    broadcastState(io, room);
    startTurnTimer(io, room, roomCode);
  } else if (active === 1) {
    let result = room.finishProposalPhase();
    if (result === 'restart') {
      room.startMatch();
      io.to(roomCode).emit('proposalRestart', { reason: 'پیشنهاد معتبر نبود' });
      broadcastState(io, room);
      startTurnTimer(io, room, roomCode);
    } else {
      io.to(roomCode).emit('leaderSelected', {
        leader: room.leader,
        name: room.players[room.leader].name,
        contract: room.contract
      });
      broadcastState(io, room);
      startTurnTimer(io, room, roomCode);
    }
  } else {
    room.nextProposer();
    broadcastState(io, room);
    startTurnTimer(io, room, roomCode);
  }
}

function setupSocketHandlers(io) {
  io.on('connection', socket => {
    let myRoom = null;
    let myIndex = -1;

    socket.on('createRoom', ({ code, name, password, scoreLimit }) => {
      if (!code || !name) {
        socket.emit('error', 'کد اتاق و نام الزامی است');
        return;
      }

      if (rooms[code]) {
        socket.emit('error', 'این کد اتاق قبلاً استفاده شده');
        return;
      }

      const room = createRoom(code, password || '', name, parseInt(scoreLimit) || 500);
      if (!room.addPlayer(socket.id, name)) {
        socket.emit('error', 'خطا در ایجاد اتاق');
        return;
      }

      myRoom = code;
      myIndex = 0;
      socket.join(code);
      socket.emit('roomCreated', { 
        code, 
        index: myIndex, 
        isHost: true,
        scoreLimit: room.scoreLimit 
      });
      io.to(code).emit('updatePlayerList', room.getPlayerList());
    });

    socket.on('joinRoom', ({ code, name, password }) => {
      if (!code || !name) {
        socket.emit('error', 'کد اتاق و نام الزامی است');
        return;
      }

      const room = getRoom(code);
      if (!room) {
        socket.emit('error', 'اتاق یافت نشد');
        return;
      }

      if (room.password && room.password !== password) {
        socket.emit('error', 'رمز عبور اشتباه است');
        return;
      }

      let existing = room.players.findIndex(p => p.name === name);
      if (existing !== -1) {
        if (room.players[existing].connected) {
          socket.emit('error', 'نام تکراری است');
          return;
        }
        room.reconnectPlayer(existing, socket.id);
        myRoom = code;
        myIndex = existing;
        socket.join(code);
        socket.emit('roomJoined', { 
          index: myIndex, 
          isRejoin: true, 
          isHost: myIndex === room.hostIndex,
          scoreLimit: room.scoreLimit
        });
        if (room.phase !== 'wait') {
          io.to(socket.id).emit('gameState', room.getStateForPlayer(myIndex));
        }
        socket.to(code).emit('playerRejoined', { index: myIndex });
      } else {
        if (!room.addPlayer(socket.id, name)) {
          socket.emit('error', 'اتاق پر است');
          return;
        }
        myRoom = code;
        myIndex = room.players.length - 1;
        socket.join(code);
        socket.emit('roomJoined', { 
          index: myIndex, 
          isRejoin: false, 
          isHost: false,
          scoreLimit: room.scoreLimit
        });
      }
      io.to(code).emit('updatePlayerList', room.getPlayerList());
    });

    socket.on('playerReady', () => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.setPlayerReady(myIndex)) {
        room.startMatch();
        broadcastState(io, room);
        startTurnTimer(io, room, myRoom);
      }
      io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
    });

    socket.on('submitProposal', val => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.submitProposal(myIndex, val)) {
        io.to(myRoom).emit('proposalUpdate', {
          player: myIndex,
          action: 'call',
          value: val,
          name: room.players[myIndex].name
        });
        handleNextProposer(io, room, myRoom);
      }
    });

    socket.on('passProposal', () => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.passProposal(myIndex)) {
        io.to(myRoom).emit('proposalUpdate', {
          player: myIndex,
          action: 'pass',
          name: room.players[myIndex].name
        });
        handleNextProposer(io, room, myRoom);
      }
    });

    socket.on('exchangeCards', cardIndices => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.exchangeCards(myIndex, cardIndices)) {
        broadcastState(io, room);
        startTurnTimer(io, room, myRoom);
      }
    });

    socket.on('selectMode', data => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.selectMode(myIndex, data.mode, data.suit)) {
        io.to(myRoom).emit('modeSelected', {
          masterSuit: room.masterSuit,
          gameMode: room.gameMode,
          leader: room.leader,
          name: room.players[room.leader].name
        });
        broadcastState(io, room);
        startTurnTimer(io, room, myRoom);
      }
    });

    socket.on('playCard', cardIndex => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      let card = room.playCard(myIndex, cardIndex);
      if (card) {
        io.to(myRoom).emit('cardAction', {
          player: myIndex,
          card: card,
          name: room.players[myIndex].name
        });
        
        if (room.playedCards.length === 4) {
          handleRoundEnd(io, room, myRoom);
        } else {
          broadcastState(io, room);
          startTurnTimer(io, room, myRoom);
        }
      } else {
        socket.emit('error', 'باید کارت همخال بازی کنید');
      }
    });

    socket.on('resetGame', () => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (myIndex !== room.hostIndex) {
        socket.emit('error', 'فقط رئیس می‌تواند بازی را ریست کند');
        return;
      }
      room.resetGame();
      io.to(myRoom).emit('gameReset');
      io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
    });

    // Voice chat signaling
    socket.on('voiceSignal', ({ to, signal }) => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.players[to] && room.players[to].connected) {
        io.to(room.players[to].id).emit('voiceSignal', {
          from: myIndex,
          signal
        });
      }
    });

    socket.on('voiceReady', () => {
      if (!myRoom) return;
      socket.to(myRoom).emit('voiceReady', { from: myIndex });
    });

    socket.on('disconnect', () => {
      if (myRoom && rooms[myRoom]) {
        let room = rooms[myRoom];
        if (room.players[myIndex]) {
          room.players[myIndex].connected = false;
          io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
          io.to(myRoom).emit('playerDisconnected', {
            index: myIndex,
            name: room.players[myIndex].name
          });
        }
      }
    });
  });
}

module.exports = { setupSocketHandlers };