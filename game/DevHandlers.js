const DevRoom = require('./DevRoom');

let room = null;

function setupDevHandlers(io) {
  io.on('connection', socket => {
    socket.on('devJoin', () => {
      room = new DevRoom();
      socket.join('dev');
      socket.emit('joined', { index: 0 });
    });

    socket.on('devStart', () => {
      if (!room) return;
      socket.emit('gameState', room.startGame());
    });

    socket.on('playCard', index => {
      if (!room) return;
      const card = room.playCard(index);
      
      if (card === false) {
        socket.emit('error', 'باید همخال بازی کنید');
        return;
      }
      if (!card) return;

      socket.emit('cardPlayed', { player: 0, card });
      socket.emit('gameState', room.getState());

      // Auto-play bots
      playBots(socket);
    });

    socket.on('devReset', () => {
      if (!room) return;
      room.reset();
      socket.emit('gameState', room.startGame());
    });
  });
}

function playBots(socket) {
  const playNext = () => {
    if (!room || room.turn === 0) return;
    if (room.playedCards.length >= 4) {
      finishRound(socket);
      return;
    }

    setTimeout(() => {
      const result = room.botPlay();
      if (result) {
        socket.emit('cardPlayed', { player: result.botIndex, card: result.card });
        socket.emit('gameState', room.getState());
        
        if (result.isRoundComplete) {
          finishRound(socket);
        } else {
          playNext();
        }
      }
    }, 600);
  };
  
  playNext();
}

function finishRound(socket) {
  setTimeout(() => {
    const result = room.resolveRound();
    socket.emit('roundResult', result);
    
    setTimeout(() => {
      socket.emit('gameState', room.getState());
      
      // If it's bot's turn, continue
      if (room.phase === 'playing' && room.turn !== 0) {
        playBots(socket);
      }
    }, 1500);
  }, 500);
}

module.exports = { setupDevHandlers };