const Room = require('./Room');
const { saveRoom, getRoom, roomExists } = require('../db/redis');

// Cache محلی برای سرعت
const localRooms = {};

async function getOrLoadRoom(code) {
  if (localRooms[code]) return localRooms[code];
  const data = await getRoom(code);
  if (data) {
    const room = Object.assign(new Room(data.code, data.password, '', data.scoreLimit), data);
    localRooms[code] = room;
    return room;
  }
  return null;
}

async function saveRoomState(room) {
  localRooms[room.code] = room;
  await saveRoom(room.code, {
    code: room.code,
    password: room.password,
    hostIndex: room.hostIndex,
    scoreLimit: room.scoreLimit,
    players: room.players,
    phase: room.phase,
    hands: room.hands,
    centerStack: room.centerStack,
    contract: room.contract,
    leader: room.leader,
    turn: room.turn,
    passed: room.passed,
    masterSuit: room.masterSuit,
    gameMode: room.gameMode,
    playedCards: room.playedCards,
    collectedCards: room.collectedCards,
    opener: room.opener,
    totalScores: room.totalScores,
    proposalLog: room.proposalLog,
    roundPoints: room.roundPoints,
    matchHistory: room.matchHistory
  });
}

function broadcastState(io, room) {
  room.players.forEach((p, i) => {
    if (p.connected) {
      io.to(p.id).emit('gameState', room.getStateForPlayer(i));
    }
  });
}

function startTurnTimer(io, room, roomCode) {
  room.startTurnTimer(async (playerIndex, result) => {
    io.to(roomCode).emit('botAction', {
      player: playerIndex,
      name: room.players[playerIndex].name,
      result
    });

    if (result.action === 'pass') {
      io.to(roomCode).emit('proposalUpdate', {
        player: playerIndex, action: 'pass',
        name: room.players[playerIndex].name, isBot: true
      });
      await handleNextProposer(io, room, roomCode);
    } else if (result.action === 'call') {
      io.to(roomCode).emit('proposalUpdate', {
        player: playerIndex, action: 'call', value: result.value,
        name: room.players[playerIndex].name, isBot: true
      });
      await handleNextProposer(io, room, roomCode);
    } else if (result.action === 'exchange') {
      await saveRoomState(room);
      broadcastState(io, room);
      startTurnTimer(io, room, roomCode);
    } else if (result.action === 'selectMode') {
      io.to(roomCode).emit('modeSelected', {
        masterSuit: room.masterSuit, gameMode: room.gameMode,
        leader: room.leader, name: room.players[room.leader].name, isBot: true
      });
      await saveRoomState(room);
      broadcastState(io, room);
      startTurnTimer(io, room, roomCode);
    } else if (result.action === 'playCard') {
      io.to(roomCode).emit('cardAction', {
        player: playerIndex, card: result.card,
        name: room.players[playerIndex].name, isBot: true
      });
      if (room.playedCards.length === 4) {
        await handleRoundEnd(io, room, roomCode);
      } else {
        await saveRoomState(room);
        broadcastState(io, room);
        startTurnTimer(io, room, roomCode);
      }
    }
  });
  io.to(roomCode).emit('timerStart', { player: room.turn, duration: 30 });
}

async function handleRoundEnd(io, room, roomCode) {
  setTimeout(async () => {
    let result = room.resolveRound();
    io.to(roomCode).emit('roundResult', result);

    if (result.isLastRound) {
      setTimeout(async () => {
        let endResult = room.endMatch();
        io.to(roomCode).emit('matchEnded', endResult);

        if (endResult.gameOver) {
          io.to(roomCode).emit('gameOver', endResult);
        } else {
          io.to(roomCode).emit('nextMatchCountdown', { seconds: 10 });
          setTimeout(async () => {
            room.startNextMatch();
            io.to(roomCode).emit('newMatchStarting');
            await saveRoomState(room);
            broadcastState(io, room);
            startTurnTimer(io, room, roomCode);
          }, 10000);
        }
        await saveRoomState(room);
        io.to(roomCode).emit('updatePlayerList', room.getPlayerList());
      }, 3000);
    } else {
      setTimeout(async () => {
        await saveRoomState(room);
        broadcastState(io, room);
        startTurnTimer(io, room, roomCode);
      }, 2500);
    }
  }, 500);
}

async function handleNextProposer(io, room, roomCode) {
  let active = room.getActiveProposers();
  if (active === 0 || (active === 1 && room.leader === -1)) {
    room.startMatch();
    io.to(roomCode).emit('proposalRestart', { reason: 'همه پاس کردند' });
  } else if (active === 1) {
    let result = room.finishProposalPhase();
    if (result === 'restart') {
      room.startMatch();
      io.to(roomCode).emit('proposalRestart', { reason: 'پیشنهاد معتبر نبود' });
    } else {
      io.to(roomCode).emit('leaderSelected', {
        leader: room.leader, name: room.players[room.leader].name, contract: room.contract
      });
    }
  } else {
    room.nextProposer();
  }
  await saveRoomState(room);
  broadcastState(io, room);
  startTurnTimer(io, room, roomCode);
}

function setupSocketHandlers(io) {
  io.on('connection', socket => {
    let myRoom = null;
    let myIndex = -1;

    socket.on('createRoom', async ({ code, name, password, scoreLimit }) => {
      if (!code || !name) return socket.emit('error', 'کد اتاق و نام الزامی است');
      if (await roomExists(code)) return socket.emit('error', 'این کد اتاق قبلاً استفاده شده');

      const room = new Room(code, password || '', name, parseInt(scoreLimit) || 500);
      room.addPlayer(socket.id, name);
      localRooms[code] = room;
      await saveRoomState(room);

      myRoom = code;
      myIndex = 0;
      socket.join(code);
      socket.emit('roomCreated', { code, index: 0, isHost: true, scoreLimit: room.scoreLimit });
      io.to(code).emit('updatePlayerList', room.getPlayerList());
    });

    socket.on('joinRoom', async ({ code, name, password }) => {
      if (!code || !name) return socket.emit('error', 'کد اتاق و نام الزامی است');

      const room = await getOrLoadRoom(code);
      if (!room) return socket.emit('error', 'اتاق یافت نشد');
      if (room.password && room.password !== password) return socket.emit('error', 'رمز عبور اشتباه');

      let existing = room.players.findIndex(p => p.name === name);
      if (existing !== -1) {
        if (room.players[existing].connected) return socket.emit('error', 'نام تکراری است');
        room.reconnectPlayer(existing, socket.id);
        myIndex = existing;
        socket.emit('roomJoined', { index: myIndex, isRejoin: true, isHost: myIndex === room.hostIndex, scoreLimit: room.scoreLimit });
        if (room.phase !== 'wait') socket.emit('gameState', room.getStateForPlayer(myIndex));
        socket.to(code).emit('playerRejoined', { index: myIndex });
      } else {
        if (!room.addPlayer(socket.id, name)) return socket.emit('error', 'اتاق پر است');
        myIndex = room.players.length - 1;
        socket.emit('roomJoined', { index: myIndex, isRejoin: false, isHost: false, scoreLimit: room.scoreLimit });
      }

      myRoom = code;
      socket.join(code);
      await saveRoomState(room);
      io.to(code).emit('updatePlayerList', room.getPlayerList());
    });

    socket.on('playerReady', async () => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (!room) return;

      if (room.setPlayerReady(myIndex)) {
        room.startMatch();
        await saveRoomState(room);
        broadcastState(io, room);
        startTurnTimer(io, room, myRoom);
      }
      io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
    });

    socket.on('submitProposal', async val => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (room?.submitProposal(myIndex, val)) {
        io.to(myRoom).emit('proposalUpdate', { player: myIndex, action: 'call', value: val, name: room.players[myIndex].name });
        await handleNextProposer(io, room, myRoom);
      }
    });

    socket.on('passProposal', async () => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (room?.passProposal(myIndex)) {
        io.to(myRoom).emit('proposalUpdate', { player: myIndex, action: 'pass', name: room.players[myIndex].name });
        await handleNextProposer(io, room, myRoom);
      }
    });

    socket.on('exchangeCards', async cardIndices => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (room?.exchangeCards(myIndex, cardIndices)) {
        await saveRoomState(room);
        broadcastState(io, room);
        startTurnTimer(io, room, myRoom);
      }
    });

    socket.on('selectMode', async data => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (room?.selectMode(myIndex, data.mode, data.suit)) {
        io.to(myRoom).emit('modeSelected', { masterSuit: room.masterSuit, gameMode: room.gameMode, leader: room.leader, name: room.players[room.leader].name });
        await saveRoomState(room);
        broadcastState(io, room);
        startTurnTimer(io, room, myRoom);
      }
    });

    socket.on('playCard', async cardIndex => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (!room) return;

      let card = room.playCard(myIndex, cardIndex);
      if (card) {
        io.to(myRoom).emit('cardAction', { player: myIndex, card, name: room.players[myIndex].name });
        if (room.playedCards.length === 4) {
          await handleRoundEnd(io, room, myRoom);
        } else {
          await saveRoomState(room);
          broadcastState(io, room);
          startTurnTimer(io, room, myRoom);
        }
      } else {
        socket.emit('error', 'باید کارت همخال بازی کنید');
      }
    });

    socket.on('resetGame', async () => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (!room || myIndex !== room.hostIndex) return socket.emit('error', 'فقط رئیس می‌تواند ریست کند');

      room.resetGame();
      await saveRoomState(room);
      io.to(myRoom).emit('gameReset');
      io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
    });

    socket.on('voiceSignal', async ({ to, signal }) => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (room?.players[to]?.connected) {
        io.to(room.players[to].id).emit('voiceSignal', { from: myIndex, signal });
      }
    });

    socket.on('voiceReady', () => {
      if (myRoom) socket.to(myRoom).emit('voiceReady', { from: myIndex });
    });

    socket.on('disconnect', async () => {
      if (!myRoom) return;
      const room = await getOrLoadRoom(myRoom);
      if (room?.players[myIndex]) {
        room.players[myIndex].connected = false;
        await saveRoomState(room);
        io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
        io.to(myRoom).emit('playerDisconnected', { index: myIndex, name: room.players[myIndex].name });
      }
    });
  });
}

module.exports = { setupSocketHandlers };