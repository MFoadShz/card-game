const { io } = require('socket.io-client');

const ROOM = 'TEST123';
const NAMES = ['A','B','C','D'];

function makeClient(name, idx) {
  const socket = io('http://localhost:3000');

  socket.on('connect', () => {
    console.log(name, 'connected', socket.id);
    socket.emit('join', { code: ROOM, name });
  });

  socket.on('joined', d => {
    console.log(name, 'joined as', d.index, 'rejoin?', d.isRejoin);
    setTimeout(() => {
      socket.emit('playerReady');
    }, 200 + idx * 100);
  });

  socket.on('gameState', s => {
    console.log(name, 'gameState phase=', s.phase, 'handCount=', s.hand.length);
  });

  socket.on('updatePlayerList', pl => {
    console.log(name, 'playerList', pl.map(p => p.name + (p.ready ? '(R)' : '')).join(', '));
  });

  socket.on('proposalUpdate', p => console.log(name, 'proposalUpdate', p));
  socket.on('leaderSelected', l => console.log(name, 'leaderSelected', l));
  socket.on('modeSelected', m => console.log(name, 'modeSelected', m));
  socket.on('roundResult', r => console.log(name, 'roundResult', r));
  socket.on('matchEnded', e => console.log(name, 'matchEnded', e));
  socket.on('error', e => console.log(name, 'error', e));

  socket.on('disconnect', () => console.log(name, 'disconnected'));

  return socket;
}

(async () => {
  const clients = NAMES.map((n, i) => makeClient(n, i));

  // Let test run for some time
  setTimeout(() => {
    console.log('Test finished, disconnecting clients');
    clients.forEach(c => c.disconnect());
    process.exit(0);
  }, 10000);
})();
