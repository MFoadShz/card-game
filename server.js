const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { redis, redisSub } = require('./db/redis');
const { setupSocketHandlers } = require('./game/SocketHandlers');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Redis adapter برای sync بین ماشین‌ها
io.adapter(createAdapter(redis, redisSub));

app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => res.send('ok'));

setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));