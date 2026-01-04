const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { setupSocketHandlers } = require('./game/SocketHandlers');
const { setupDevHandlers } = require('./game/DevHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));
app.get('/dev', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dev.html'));
});

setupSocketHandlers(io);
setupDevHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
