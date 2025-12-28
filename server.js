const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { setupSocketHandlers } = require('./game/SocketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

setupSocketHandlers(io);

setInterval(() => console.log('Keep alive'), 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));