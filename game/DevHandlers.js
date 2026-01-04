const DevRoom = require('./DevRoom');

let room = null;

function setupDevHandlers(io) {
  const devIo = io.of('/dev');

  devIo.on('connection', socket => {
    socket.on('devJoin', () => {
      if (!room) room = new DevRoom();
      socket.join('dev');
      socket.emit('joined', { index: 0 });
      socket.emit('gameState', room.getState());
    });

    socket.on('devStart', async () => {
      ensureRoom();

      // Step 1: deal and enter proposal phase
      devIo.to('dev').emit('gameState', room.prepareGame());

      // Step 2: fake auction so UI flows are visible
      const steps = room.runFakeAuction();
      steps.forEach((s, idx) => {
        setTimeout(() => devIo.to('dev').emit('proposalUpdate', s), idx * 600);
      });

      await wait(steps.length * 650);
      devIo.to('dev').emit('leaderSelected', {
        leader: room.leader,
        name: room.players[room.leader]?.name,
        contract: room.contract
      });

      // Step 3: stop at mode selection (player decides)
      room.phase = 'selectMode';
      room.turn = room.leader >= 0 ? room.leader : 0;
      devIo.to('dev').emit('gameState', room.getState());
    });

    socket.on('playCard', index => {
      if (!room) return;
      const card = room.playCard(index);
      
      if (card === false) {
        socket.emit('error', 'باید همخال بازی کنید');
        return;
      }
      if (!card) return;

      devIo.to('dev').emit('cardPlayed', { player: 0, card });
      devIo.to('dev').emit('gameState', room.getState());

      playBots(devIo);
    });

    socket.on('devReset', () => {
      ensureRoom();
      room.reset();
      devIo.to('dev').emit('gameState', room.getState());
    });

    socket.on('devSelectMode', data => {
      if (!room) return;
      const decision = room.selectMode(data.mode, data.suit);
      devIo.to('dev').emit('modeSelected', {
        name: room.players[room.leader]?.name,
        mode: decision.mode,
        suit: decision.suit
      });
      devIo.to('dev').emit('gameState', room.getState());
      if (room.turn !== 0) playBots(devIo);
    });
  });
}

function ensureRoom() {
  if (!room) room = new DevRoom();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function playBots(devIo) {
  const playNext = () => {
    if (!room || room.turn === 0) return;
    if (room.playedCards.length >= 4) {
      finishRound(devIo);
      return;
    }

    setTimeout(() => {
      const result = room.botPlay();
      if (result) {
        devIo.to('dev').emit('cardPlayed', { player: result.botIndex, card: result.card });
        devIo.to('dev').emit('gameState', room.getState());
        
        if (result.isRoundComplete) {
          finishRound(devIo);
        } else {
          playNext();
        }
      }
    }, 600);
  };
  
  playNext();
}

function finishRound(devIo) {
  setTimeout(() => {
    const result = room.resolveRound();
    devIo.to('dev').emit('roundResult', result);
    
    setTimeout(() => {
      devIo.to('dev').emit('gameState', room.getState());
      
      if (room.phase === 'playing' && room.turn !== 0) {
        playBots(devIo);
      }
    }, 1500);
  }, 500);
}

module.exports = { setupDevHandlers };