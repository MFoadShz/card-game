const Room = require('./Room');

const rooms = {};

function getRoom(code) {
  if (!rooms[code]) {
    rooms[code] = new Room(code);
  }
  return rooms[code];
}

function broadcastState(io, room) {
  room.players.forEach((p, i) => {
    if (p.connected) {
      io.to(p.id).emit('gameState', room.getStateForPlayer(i));
    }
  });
}

function setupSocketHandlers(io) {
  io.on('connection', socket => {
    let myRoom = null;
    let myIndex = -1;

    socket.on('join', ({ code, name }) => {
      let room = getRoom(code);
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
        socket.emit('joined', { index: myIndex, isRejoin: true });
        if (room.phase !== 'wait') {
          io.to(socket.id).emit('gameState', room.getStateForPlayer(myIndex));
        }
        // اطلاع به بقیه برای اتصال مجدد voice
        socket.to(code).emit('playerRejoined', { index: myIndex });
      } else {
        if (!room.addPlayer(socket.id, name)) {
          socket.emit('error', 'اتاق پر است');
          return;
        }
        myRoom = code;
        myIndex = room.players.length - 1;
        socket.join(code);
        socket.emit('joined', { index: myIndex, isRejoin: false });
      }

      io.to(code).emit('updatePlayerList', room.getPlayerList());
    });

    socket.on('playerReady', () => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.setPlayerReady(myIndex)) {
        room.startMatch();
        broadcastState(io, room);
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
          setTimeout(() => {
            let result = room.resolveRound();
            io.to(myRoom).emit('roundResult', result);

            if (result.isLastRound) {
              setTimeout(() => {
                let endResult = room.endMatch();
                io.to(myRoom).emit('matchEnded', endResult);
                io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
              }, 3000);
            } else {
              setTimeout(() => broadcastState(io, room), 2500);
            }
          }, 500);
        } else {
          broadcastState(io, room);
        }
      } else {
        socket.emit('error', 'باید کارت همخال بازی کنید');
      }
    });

    // ==================== WebRTC Signaling ====================
    socket.on('voiceOffer', ({ to, offer }) => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.players[to] && room.players[to].connected) {
        io.to(room.players[to].id).emit('voiceOffer', {
          from: myIndex,
          offer
        });
      }
    });

    socket.on('voiceAnswer', ({ to, answer }) => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.players[to] && room.players[to].connected) {
        io.to(room.players[to].id).emit('voiceAnswer', {
          from: myIndex,
          answer
        });
      }
    });

    socket.on('voiceIceCandidate', ({ to, candidate }) => {
      if (!myRoom) return;
      let room = rooms[myRoom];
      if (room.players[to] && room.players[to].connected) {
        io.to(room.players[to].id).emit('voiceIceCandidate', {
          from: myIndex,
          candidate
        });
      }
    });

    socket.on('voiceReady', () => {
      if (!myRoom) return;
      // اطلاع به بقیه که این بازیکن آماده voice chat است
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

    function handleNextProposer(io, room, roomCode) {
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
            leader: room.leader,
            name: room.players[room.leader].name,
            contract: room.contract
          });
        }
      } else {
        room.nextProposer();
      }
      broadcastState(io, room);
    }
  });
}

module.exports = { setupSocketHandlers };