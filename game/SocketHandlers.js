// game/SocketHandlers.js
const Room = require('./Room');
const storage = require('./Storage');

const rooms = {};
const socketToDevice = new Map();

// === Helper Functions ===
function normalizeCode(code) {
    // حذف فاصله و تبدیل به حروف کوچک
    return code ? code.trim().toLowerCase() : '';
}

function getRoom(code) {
    const normalized = normalizeCode(code);
    return rooms[normalized] || null;
}

function createRoom(code, password, hostName, scoreLimit) {
    const normalized = normalizeCode(code);
    if (rooms[normalized]) return null;
    rooms[normalized] = new Room(normalized, password, hostName, scoreLimit);
    console.log(`[Room] Created: ${normalized}, Total rooms: ${Object.keys(rooms).length}`);
    return rooms[normalized];
}

function deleteRoom(code) {
    const normalized = normalizeCode(code);
    if (rooms[normalized]) {
        rooms[normalized].clearTurnTimer();
        delete rooms[normalized];
        console.log(`[Room] Deleted: ${normalized}, Remaining: ${Object.keys(rooms).length}`);
    }
}

function listRooms() {
    return Object.keys(rooms).map(code => ({
        code,
        players: rooms[code].players.length,
        phase: rooms[code].phase
    }));
}

function broadcastState(io, room) {
    room.players.forEach((p, i) => {
        if (p.connected && p.id) {
            io.to(p.id).emit('gameState', room.getStateForPlayer(i));
        }
    });
}

function startTurnTimer(io, room, roomCode) {
    const normalized = normalizeCode(roomCode);
    room.clearTurnTimer();
    
    room.startTurnTimer((playerIndex, result) => {
        if (!rooms[normalized]) return;
        
        io.to(normalized).emit('botAction', {
            player: playerIndex,
            name: room.players[playerIndex]?.name || 'بازیکن',
            type: result.type,
            result: result
        });

        if (result.type === 'proposal') {
            io.to(normalized).emit('proposalUpdate', {
                player: playerIndex,
                name: room.players[playerIndex]?.name,
                action: result.action,
                value: result.value
            });
            handleNextProposer(io, room, normalized);
        } else if (result.type === 'exchange') {
            broadcastState(io, room);
            startTurnTimer(io, room, normalized);
        } else if (result.type === 'mode') {
            io.to(normalized).emit('modeSelected', {
                name: room.players[playerIndex]?.name,
                mode: result.mode,
                suit: result.suit
            });
            broadcastState(io, room);
            startTurnTimer(io, room, normalized);
        } else if (result.type === 'play') {
            io.to(normalized).emit('cardAction', {
                player: playerIndex,
                card: result.card,
                turn: room.turn
            });
            if (room.playedCards.length === 4) {
                handleRoundEnd(io, room, normalized);
            } else {
                broadcastState(io, room);
                startTurnTimer(io, room, normalized);
            }
        }

        io.to(normalized).emit('timerStart', {
            player: room.turn,
            duration: room.turnDuration
        });
    });
}

function handleRoundEnd(io, room, roomCode) {
    const normalized = normalizeCode(roomCode);
    room.clearTurnTimer();
    
    setTimeout(() => {
        if (!rooms[normalized]) return;
        
        let result = room.resolveRound();
        io.to(normalized).emit('roundResult', result);

        if (room.hands[0].length === 0) {
            let endResult = room.endMatch();
            io.to(normalized).emit('matchEnded', endResult);

            if (endResult.gameOver) {
                io.to(normalized).emit('gameOver', endResult);
            } else {
                io.to(normalized).emit('nextMatchCountdown', { seconds: 10 });
                setTimeout(() => {
                    if (!rooms[normalized]) return;
                    room.startNextMatch();
                    io.to(normalized).emit('newMatchStarting');
                    broadcastState(io, room);
                    io.to(normalized).emit('updatePlayerList', room.getPlayerList());
                    startTurnTimer(io, room, normalized);
                }, 10000);
            }
        } else {
            broadcastState(io, room);
            startTurnTimer(io, room, normalized);
        }
    }, 1500);
}

function handleNextProposer(io, room, roomCode) {
    const normalized = normalizeCode(roomCode);
    if (!rooms[normalized]) return;
    
    let active = room.getActiveProposers();
    
    if (active === 0) {
        room.startMatch();
        io.to(normalized).emit('proposalRestart', { reason: 'همه پاس کردند' });
        broadcastState(io, room);
        startTurnTimer(io, room, normalized);
        return;
    }
    
    if (active === 1) {
        let result = room.finishProposalPhase();
        if (!result) {
            io.to(normalized).emit('proposalRestart', { reason: 'پیشنهاد معتبر نبود' });
            room.startMatch();
            broadcastState(io, room);
            startTurnTimer(io, room, normalized);
            return;
        }
        io.to(normalized).emit('leaderSelected', {
            leader: result.leader,
            name: result.name,
            contract: result.contract
        });
        broadcastState(io, room);
        startTurnTimer(io, room, normalized);
        return;
    }
    
    room.nextProposer();
    broadcastState(io, room);
    startTurnTimer(io, room, normalized);
}

// پاکسازی اتاق‌های خالی - فقط اگر همه قطع و غیرفعال باشند
function cleanupRooms() {
    const now = Date.now();
    const maxInactiveTime = 30 * 60 * 1000; // 30 دقیقه
    
    Object.keys(rooms).forEach(code => {
        const room = rooms[code];
        const allDisconnected = room.players.every(p => !p.connected);
        const inactive = now - (room.lastActivity || now) > maxInactiveTime;
        
        // فقط اگر همه قطع باشند و 30 دقیقه غیرفعال باشد
        if (allDisconnected && inactive) {
            console.log(`[Cleanup] Removing inactive room: ${code}`);
            deleteRoom(code);
        }
    });
}

// هر 5 دقیقه پاکسازی
setInterval(cleanupRooms, 5 * 60 * 1000);
setInterval(() => storage.cleanupOldSessions(), 60 * 60 * 1000);

function setupSocketHandlers(io) {
    io.on('connection', socket => {
        let myRoom = null;
        let myIndex = -1;
        let myDeviceId = null;

        console.log(`[Socket] Connected: ${socket.id}`);

        // === Debug: لیست اتاق‌ها ===
        socket.on('listRooms', () => {
            socket.emit('roomList', listRooms());
        });

        // === احراز هویت ===
        socket.on('authenticate', ({ deviceId, playerName }) => {
            myDeviceId = deviceId;
            socketToDevice.set(socket.id, deviceId);
            
            let session = storage.getSession(deviceId);
            
            if (!session) {
                storage.createSession(deviceId, playerName);
                socket.emit('authenticated', { 
                    isNew: true, 
                    hasActiveGame: false 
                });
            } else {
                const activeRoom = session.roomCode ? getRoom(session.roomCode) : null;
                
                if (activeRoom && session.playerIndex !== null) {
                    const playerInRoom = activeRoom.players[session.playerIndex];
                    
                    if (playerInRoom && playerInRoom.name === session.playerName) {
                        socket.emit('authenticated', {
                            isNew: false,
                            hasActiveGame: true,
                            roomCode: session.roomCode,
                            playerName: session.playerName
                        });
                    } else {
                        storage.clearSessionRoom(deviceId);
                        socket.emit('authenticated', { 
                            isNew: false, 
                            hasActiveGame: false,
                            playerName: session.playerName
                        });
                    }
                } else {
                    storage.clearSessionRoom(deviceId);
                    socket.emit('authenticated', { 
                        isNew: false, 
                        hasActiveGame: false,
                        playerName: session.playerName
                    });
                }
            }
        });

        // === اتصال مجدد خودکار ===
        socket.on('autoReconnect', ({ deviceId }) => {
            const session = storage.getSession(deviceId);
            if (!session || !session.roomCode) {
                socket.emit('reconnectFailed', { reason: 'بازی فعالی وجود ندارد' });
                return;
            }

            const room = getRoom(session.roomCode);
            if (!room) {
                storage.clearSessionRoom(deviceId);
                socket.emit('reconnectFailed', { reason: 'اتاق منقضی شده است' });
                return;
            }

            const playerIndex = session.playerIndex;
            const player = room.players[playerIndex];
            
            if (!player || player.name !== session.playerName) {
                storage.clearSessionRoom(deviceId);
                socket.emit('reconnectFailed', { reason: 'جایگاه از دست رفته' });
                return;
            }

            myRoom = session.roomCode;
            myIndex = playerIndex;
            myDeviceId = deviceId;
            
            room.reconnectPlayer(playerIndex, socket.id);
            socket.join(myRoom);
            
            socket.emit('reconnected', {
                roomCode: myRoom,
                index: myIndex,
                playerName: session.playerName,
                scoreLimit: room.scoreLimit
            });
            
            io.to(socket.id).emit('gameState', room.getStateForPlayer(myIndex));
            socket.to(myRoom).emit('playerRejoined', { 
                index: myIndex, 
                name: player.name 
            });
            
            io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
            
            console.log(`[Reconnect] ${session.playerName} -> ${myRoom}`);
        });

        // === ساخت اتاق ===
        socket.on('createRoom', ({ code, name, password, scoreLimit }) => {
            if (!code || !name) {
                socket.emit('error', 'کد اتاق و نام الزامی است');
                return;
            }

            const normalizedCode = normalizeCode(code);
            
            // بررسی تعداد اتاق‌های این کاربر
            if (myDeviceId) {
                const deviceRooms = Object.values(rooms).filter(r => 
                    r.players.some(p => socketToDevice.get(p.id) === myDeviceId)
                );
                if (deviceRooms.length >= 2) {
                    socket.emit('error', 'حداکثر ۲ اتاق می‌توانید داشته باشید');
                    return;
                }
            }

            if (getRoom(normalizedCode)) {
                socket.emit('error', 'این کد اتاق قبلاً استفاده شده');
                return;
            }

            const room = createRoom(normalizedCode, password || '', name, parseInt(scoreLimit) || 500);
            if (!room || !room.addPlayer(socket.id, name)) {
                socket.emit('error', 'خطا در ایجاد اتاق');
                return;
            }

            myRoom = normalizedCode;
            myIndex = 0;

            if (myDeviceId) {
                storage.updateSession(myDeviceId, {
                    playerName: name,
                    roomCode: normalizedCode,
                    playerIndex: 0
                });
            }

            socket.join(normalizedCode);
            socket.emit('roomCreated', {
                code: normalizedCode,
                index: 0,
                scoreLimit: room.scoreLimit
            });
            io.to(normalizedCode).emit('updatePlayerList', room.getPlayerList());
            
            console.log(`[Room] ${name} created room: ${normalizedCode}`);
        });

        // === ورود به اتاق ===
        socket.on('joinRoom', ({ code, name, password }) => {
            if (!code || !name) {
                socket.emit('error', 'کد اتاق و نام الزامی است');
                return;
            }

            const normalizedCode = normalizeCode(code);
            const room = getRoom(normalizedCode);
            
            if (!room) {
                console.log(`[Join] Room not found: ${normalizedCode}`);
                console.log(`[Join] Available rooms: ${Object.keys(rooms).join(', ') || 'none'}`);
                socket.emit('error', 'اتاق یافت نشد');
                return;
            }

            if (room.password && room.password !== password) {
                socket.emit('error', 'رمز عبور اشتباه است');
                return;
            }

            // چک کردن reconnect با نام یکسان
            let existing = room.players.findIndex(p => p.name === name);
            if (existing !== -1) {
                if (room.players[existing].connected) {
                    socket.emit('error', 'این نام در حال استفاده است');
                    return;
                }
                
                // Reconnect
                room.reconnectPlayer(existing, socket.id);
                myRoom = normalizedCode;
                myIndex = existing;

                if (myDeviceId) {
                    storage.updateSession(myDeviceId, {
                        playerName: name,
                        roomCode: normalizedCode,
                        playerIndex: existing
                    });
                }

                socket.join(normalizedCode);
                socket.emit('roomJoined', {
                    code: normalizedCode,
                    index: existing,
                    isReconnect: true,
                    scoreLimit: room.scoreLimit
                });
                io.to(socket.id).emit('gameState', room.getStateForPlayer(myIndex));
                socket.to(normalizedCode).emit('playerRejoined', { index: existing, name });
                io.to(normalizedCode).emit('updatePlayerList', room.getPlayerList());
                
                console.log(`[Join] ${name} reconnected to: ${normalizedCode}`);
                return;
            }

            // بازیکن جدید
            if (room.players.length >= 4) {
                socket.emit('error', 'اتاق پر است');
                return;
            }

            if (!room.addPlayer(socket.id, name)) {
                socket.emit('error', 'خطا در ورود به اتاق');
                return;
            }

            myRoom = normalizedCode;
            myIndex = room.players.length - 1;

            if (myDeviceId) {
                storage.updateSession(myDeviceId, {
                    playerName: name,
                    roomCode: normalizedCode,
                    playerIndex: myIndex
                });
            }

            socket.join(normalizedCode);
            socket.emit('roomJoined', {
                code: normalizedCode,
                index: myIndex,
                isReconnect: false,
                scoreLimit: room.scoreLimit
            });
            io.to(normalizedCode).emit('updatePlayerList', room.getPlayerList());
            
            console.log(`[Join] ${name} joined: ${normalizedCode} (${room.players.length}/4)`);
        });

        // === بررسی وجود اتاق ===
        socket.on('checkRoom', ({ code }) => {
            const normalizedCode = normalizeCode(code);
            const room = getRoom(normalizedCode);
            socket.emit('roomCheck', {
                exists: !!room,
                code: normalizedCode,
                players: room ? room.players.length : 0,
                isFull: room ? room.players.length >= 4 : false
            });
        });

        // === آماده بودن ===
        socket.on('playerReady', () => {
            const room = getRoom(myRoom);
            if (!room || myIndex === -1) return;

            room.lastActivity = Date.now();

            if (room.setPlayerReady(myIndex)) {
                room.startMatch();
                broadcastState(io, room);
                startTurnTimer(io, room, myRoom);
            }
            io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
        });

        // === پیشنهاد ===
        socket.on('submitProposal', val => {
            const room = getRoom(myRoom);
            if (!room || myIndex === -1) return;
            if (room.turn !== myIndex || room.phase !== 'proposing') return;

            room.lastActivity = Date.now();

            if (room.submitProposal(myIndex, val)) {
                io.to(myRoom).emit('proposalUpdate', {
                    player: myIndex,
                    name: room.players[myIndex].name,
                    action: 'call',
                    value: val
                });
                handleNextProposer(io, room, myRoom);
            }
        });

        socket.on('passProposal', () => {
            const room = getRoom(myRoom);
            if (!room || myIndex === -1) return;
            if (room.turn !== myIndex || room.phase !== 'proposing') return;

            room.lastActivity = Date.now();

            if (room.passProposal(myIndex)) {
                io.to(myRoom).emit('proposalUpdate', {
                    player: myIndex,
                    name: room.players[myIndex].name,
                    action: 'pass'
                });
                handleNextProposer(io, room, myRoom);
            }
        });

        // === تبادل کارت ===
        socket.on('exchangeCards', cardIndices => {
            const room = getRoom(myRoom);
            if (!room || myIndex === -1) return;
            if (room.phase !== 'exchanging' || room.leader !== myIndex) return;

            room.lastActivity = Date.now();

            if (room.exchangeCards(myIndex, cardIndices)) {
                broadcastState(io, room);
                startTurnTimer(io, room, myRoom);
            }
        });

        // === انتخاب مد ===
        socket.on('selectMode', data => {
            const room = getRoom(myRoom);
            if (!room || myIndex === -1) return;
            if (room.phase !== 'selectMode' || room.leader !== myIndex) return;

            room.lastActivity = Date.now();

            if (room.selectMode(myIndex, data.mode, data.suit)) {
                io.to(myRoom).emit('modeSelected', {
                    name: room.players[myIndex].name,
                    mode: data.mode,
                    suit: data.suit
                });
                broadcastState(io, room);
                startTurnTimer(io, room, myRoom);
            }
        });

        // === بازی کارت ===
        socket.on('playCard', cardIndex => {
            const room = getRoom(myRoom);
            if (!room || myIndex === -1) return;
            if (room.phase !== 'playing' || room.turn !== myIndex) return;

            room.lastActivity = Date.now();

            let card = room.playCard(myIndex, cardIndex);
            if (card) {
                io.to(myRoom).emit('cardAction', {
                    player: myIndex,
                    card: card,
                    turn: room.turn
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

        // === ریست بازی ===
        socket.on('resetGame', () => {
            const room = getRoom(myRoom);
            if (!room || myIndex !== 0) {
                socket.emit('error', 'فقط میزبان می‌تواند بازی را ریست کند');
                return;
            }

            room.resetGame();
            io.to(myRoom).emit('gameReset');
            io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
        });

        // === ترک بازی ===
        socket.on('leaveRoom', () => {
            if (myRoom && myDeviceId) {
                storage.clearSessionRoom(myDeviceId);
            }
            
            const room = getRoom(myRoom);
            if (room && myIndex !== -1) {
                room.players[myIndex].connected = false;
                socket.leave(myRoom);
                io.to(myRoom).emit('playerLeft', { 
                    index: myIndex, 
                    name: room.players[myIndex].name 
                });
                io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
            }
            
            myRoom = null;
            myIndex = -1;
        });

        // === صدا ===
        socket.on('voiceSignal', ({ to, signal }) => {
            const room = getRoom(myRoom);
            if (!room || !room.players[to]) return;
            
            io.to(room.players[to].id).emit('voiceSignal', {
                from: myIndex,
                signal
            });
        });

        socket.on('voiceReady', () => {
            if (myRoom) {
                socket.to(myRoom).emit('voiceReady', { from: myIndex });
            }
        });

        // === Ping/Pong ===
        socket.on('ping', () => {
            socket.emit('pong');
            const room = getRoom(myRoom);
            if (room) room.lastActivity = Date.now();
        });

        // === قطع اتصال ===
        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: ${socket.id}`);
            socketToDevice.delete(socket.id);

            const room = getRoom(myRoom);
            if (room && myIndex !== -1 && room.players[myIndex]) {
                room.players[myIndex].connected = false;
                room.players[myIndex].disconnectedAt = Date.now();
                
                io.to(myRoom).emit('playerDisconnected', {
                    index: myIndex,
                    name: room.players[myIndex].name
                });
                io.to(myRoom).emit('updatePlayerList', room.getPlayerList());
            }
        });
    });
}

module.exports = { setupSocketHandlers, getRoom, rooms };