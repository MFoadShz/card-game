const DevRoom = require('./DevRoom');

let devRoom = null;

function setupDevHandlers(io) {
  io.on('connection', socket => {
    socket.on('devJoin', () => {
      devRoom = new DevRoom();
      socket.join('dev');
      socket.emit('joined', { index: 0, isRejoin: false });
      socket.emit('updatePlayerList', devRoom.getPlayerList());
    });

    socket.on('devQuickStart', (options = {}) => {
      if (!devRoom) return;
      const state = devRoom.quickStart(options.phase || 'playing', options);
      socket.emit('gameState', state);
    });

    socket.on('devSetPhase', phase => {
      if (!devRoom) return;
      const state = devRoom.setPhase(phase);
      socket.emit('gameState', state);
    });

    socket.on('devBotPlay', () => {
      if (!devRoom) return;
      const result = devRoom.botPlay();
      if (result) {
        socket.emit('cardAction', {
          player: result.botIndex,
          name: `بات ${result.botIndex}`,
          card: result.card
        });
        
        if (result.type === 'roundComplete') {
          setTimeout(() => {
            const roundResult = devRoom.resolveRound();
            socket.emit('roundResult', roundResult);
            setTimeout(() => {
              socket.emit('gameState', devRoom.getStateForPlayer(0));
            }, 500);
          }, 300);
        } else {
          socket.emit('gameState', devRoom.getStateForPlayer(0));
        }
      }
    });

    socket.on('devBotPlayAll', () => {
      if (!devRoom) return;
      
      const playNext = () => {
        if (devRoom.turn === 0 || devRoom.playedCards.length === 4) return;
        
        const result = devRoom.botPlay();
        if (result) {
          socket.emit('cardAction', {
            player: result.botIndex,
            name: `بات ${result.botIndex}`,
            card: result.card
          });
          
          if (result.type === 'roundComplete') {
            setTimeout(() => {
              const roundResult = devRoom.resolveRound();
              socket.emit('roundResult', roundResult);
              setTimeout(() => {
                socket.emit('gameState', devRoom.getStateForPlayer(0));
              }, 500);
            }, 300);
          } else {
            setTimeout(playNext, 400);
          }
        }
      };
      
      playNext();
    });

    socket.on('playCard', cardIndex => {
      if (!devRoom) return;
      const card = devRoom.playCard(cardIndex);
      if (card) {
        socket.emit('cardAction', {
          player: 0,
          name: 'توسعه‌دهنده',
          card
        });
        socket.emit('gameState', devRoom.getStateForPlayer(0));
        
        // اگر 4 کارت شد
        if (devRoom.playedCards.length === 4) {
          setTimeout(() => {
            const result = devRoom.resolveRound();
            socket.emit('roundResult', result);
            setTimeout(() => {
              socket.emit('gameState', devRoom.getStateForPlayer(0));
            }, 500);
          }, 300);
        }
      } else if (card === false) {
        socket.emit('error', 'باید کارت همخال بازی کنید');
      }
    });

    socket.on('devSimulateProposal', () => {
      if (!devRoom) return;
      const state = devRoom.simulateProposal();
      socket.emit('gameState', state);
    });

    socket.on('devSimulateExchange', () => {
      if (!devRoom) return;
      const state = devRoom.simulateExchange();
      socket.emit('gameState', state);
    });

    socket.on('devRefresh', () => {
      if (!devRoom) return;
      socket.emit('gameState', devRoom.getStateForPlayer(0));
    });
  });
}

module.exports = { setupDevHandlers };