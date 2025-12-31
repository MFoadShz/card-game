// game/SocketHandlers.js
const Room = require('./Room');
const storage = require('./Storage');

const rooms = {};
const socketToDevice = new Map(); // socket.id -> deviceId

function getRoom(code) {
    return rooms[code] || null;
}

function createRoom(code, password, hostName, scoreLimit) {
    if (rooms[code]) return null;
    rooms[code] = new Room(code, password, hostName, scoreLimit);
    return rooms[code];
}

function deleteRoom(code) {
    if (rooms[code]) {
        rooms[code].clearTurnTimer();
        delete rooms[code];
        console.log(`Room ${code} deleted`);
    }
}

function broadcastState(io, room) {
    room.players.forEach((p, i) => {
        if (p.connected && p.id) {
            io.to(p.id).emit('gameState', room.getStateForPlayer(i));
        }
    });
}

function startTurnTimer(io, room, roomCode) {
    room.clearTurnTimer(); // اول پاک کن
    
    room.startTurnTimer((playerIndex, result) => {
        if (!rooms[roomCode]) return; // اتاق حذف شده
        
        io.to(roomCode).emit('botAction', {
            player: playerIndex,
            name: room.players[playerIndex]?.name || 'بازیکن',
            type: result.type,
            result: result
        });

        if (result.type === 'proposal') {
            io.to(roomCode).emit('proposalUpdate', {
                player: playerIndex,
                name: room.players[playerIndex]?.name,
                action: result.action,
                value: result.value
            });
            handleNextProposer(io, room, roomCode);
        } else if (result.type === 'exchange') {
            broadcastState(io, room);
            startTurnTimer(io, room, roomCode);
        } else if (result.type === 'mode') {
            io.to(roomCode).emit('modeSelected', {
                name: room.players[playerIndex]?.name,
                mode: result.mode,
                suit: result.suit
            });
            broadcastState(io, room);
            startTurnTimer(io, room, roomCode);
        } else if (result.type === 'play') {
            io.to(roomCode).emit('cardAction', {
                player: playerIndex,
                card: result.card,
                turn: room.turn
            });
            if (room.playedCards.length === 4) {
                handleRoundEnd(io, room, roomCode);
            } else {
                broadcastState(io, room);
                startTurnTimer(io, room, roomCode);
            }
        }

        io.to(roomCode).emit('timerStart', {
            player: room.turn,
            duration: room.turnDuration
        });
    });
}

function handleRoundEnd(io, room, roomCode) {
    room.clearTurnTimer();
    
    setTimeout(() => {
        if (!rooms[roomCode]) return;
        
        let result = room.resolveRound();
        io.to(roomCode).emit('roundResult', result);

        if (room.hands[0].length === 0) {
            let endResult = room.endMatch();
            io.to(roomCode).emit('matchEnded', endResult);

            if (endResult.gameOver) {
                io.to(roomCode).emit('gameOver', endResult);
            } else {
                io.to(roomCode).emit('nextMatchCountdown', { seconds: 10 });
                setTimeout(() => {
                    if (!rooms[roomCode]) return;
                    room.startNextMatch();
                    io.to(roomCode).emit('newMatchStarting');
                    broadcastState(io, room);
                    io.to(roomCode).emit('updatePlayerList', room.getPlayerList());
                    startTurnTimer(io, room, roomCode);
                }, 10000);
            }
        } else {
            broadcastState(io, room);
            startTurnTimer(io, room, roomCode);
        }
    }, 1500);
}

function handleNextProposer(io, room, roomCode) {
    if (!rooms[roomCode]) return;
    
    let active = room.getActiveProposers();
    
    if (active === 0) {
        room.startMatch();
        io.to(roomCode).emit('proposalRestart', { reason: 'همه پاس کردند' });
        broadcastState(io, room);
        startTurnTimer(io, room, roomCode);
        return;
    }
    
    if (active === 1) {
        let result = room.finishProposalPhase();
        if (!result) {
            io.to(roomCode).emit('proposalRestart', { reason: 'پیشنهاد معتبر نبود' });
            room.startMatch();
            broadcastState(io, room);
            startTurnTimer(io, room, roomCode);
            return;
        }
        io.to(roomCode).emit('leaderSelected', {
            leader: result.leader,
            name: result.name,
            contract: result.contract
        });
        broadcastState(io, room);
        startTurnTimer(io, room, roomCode);
        return;
    }
    
    room.nextProposer();
    broadcastState(io, room);
    startTurnTimer(io, room, roomCode);
}

// پاکسازی اتاق‌های خالی
function cleanupRooms() {
    const now = Date.now();
    Object.keys(rooms).forEach(code => {
        const room = rooms[code];
        const allDisconnected = room.players.every(p => !p.connected);
        const inactive = now - (room.lastActivity || now) > 30 * 60 * 1000;
        
        if (allDisconnected && inactive) {
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

        console.log('New connection:', socket.id);

        // --- احراز هویت با deviceId ---
        socket.on('authenticate', ({ deviceId, playerName }) => {
            myDeviceId = deviceId;
            socketToDevice.set(socket.id, deviceId);
            
            let session = storage.getSession(deviceId);
            
            if (!session) {
                // سشن جدید
                storage.createSession(deviceId, playerName);
                socket.emit('authenticated', { 
                    isNew: true, 
                    hasActiveGame: false 
                });
            } else {
                // سشن موجود - چک کردن بازی فعال
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

        // --- اتصال مجدد خودکار ---
        socket.on('autoReconnect', ({ deviceId }) => {
            const session = storage.getSession(deviceId);
            if (!session || !session.roomCode) {
                socket.emit('reconnectFailed', { reason: 'بازی فعالی وجود ندارد' });
                return;
            }

            const room = getRoom(session.roomCode);
            if (!room) {
                storage.clearSessionRoom(deviceId);
                socket.emit('reconnectFailed', { reason: 'اتاق پیدا نشد' });
                return;
            }

            const playerIndex = session.playerIndex;
            const player = room.players[playerIndex];
            
            if (!player || player.name !== session.playerName) {
                storage.clearSessionRoom(deviceId);
                socket.emit('reconnectFailed', { reason: 'جایگاه از دست رفته' });
                return;
            }

            // اتصال مجدد موفق
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
            
            console.log(`Player ${session.playerName} auto-reconnected to ${myRoom}`);
        });

        // --- ساخت اتاق ---
        socket.on('createRoom', ({ code, name, password, scoreLimit }) => {
            if (!code || !name) {
                socket.emit('error', 'کد اتاق و نام الزامی است');
                return;
            }

            // محدودیت تعداد اتاق
            const deviceRooms = Object.values(rooms).filter(r => 
                r.players.some(p => socketToDevice.get(p.id) === myDeviceId)
            );
            if (deviceRooms.length >= 2) {
                socket.emit('error', 'حداکثر ۲ اتاق می‌توانید داشته باشید');
                return;
            }

            if (getRoom(code)) {
                socket.emit('error', 'این کد اتاق قبلاً استفاده شده');
                return;
            }

            const room = createRoom(code, password || '', name, parseInt(scoreLimit) || 500);
            if (!room.addPlayer(socket.id, name)) {
                socket.emit('error', 'خطا در ایجاد اتاق');
                return;
            }

            myRoom = code;
            myIndex = 0;

            // ذخیره در سشن
            if (myDeviceId) {
                storage.updateSession(myDeviceId, {
                    playerName: name,
                    roomCode: code,
                    playerIndex: 0
                });
            }

            socket.join(code);
            socket.emit('roomCreated', {
                code,
                index: 0,
                scoreLimit: room.scoreLimit
            });
            io.to(code).emit('updatePlayerList', room.getPlayerList());
            
            console.log(`Room ${code} created by ${name}`);
        });

        // --- ورود به اتاق ---
        socket.on('joinRoom', ({ code, name, password }) => {
            if (!code || !name) {
                socket.emit('error', 'کد اتاق و نام الزامی است');
                return;
            }

            const room = getRoom(code);
            if (!room) {
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
                myRoom = code;
                myIndex = existing;

                if (myDeviceId) {
                    storage.updateSession(myDeviceId, {
                        playerName: name,
                        roomCode: code,
                        playerIndex: existing
                    });
                }

                socket.join(code);
                socket.emit('roomJoined', {
                    code,
                    index: existing,
                    isReconnect: true,
                    scoreLimit: room.scoreLimit
                });
                io.to(socket.id).emit('gameState', room.getStateForPlayer(myIndex));
                socket.to(code).emit('playerRejoined', { index: existing, name });
                io.to(code).emit('updatePlayerList', room.getPlayerList());
                
                console.log(`Player ${name} reconnected to ${code}`);
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

            myRoom = code;
            myIndex = room.players.length - 1;

            if (myDeviceId) {
                storage.updateSession(myDeviceId, {
                    playerName: name,
                    roomCode: code,
                    playerIndex: myIndex
                });
            }

            socket.join(code);
            socket.emit('roomJoined', {
                code,
                index: myIndex,
                isReconnect: false,
                scoreLimit: room.scoreLimit
            });
            io.to(code).emit('updatePlayerList', room.getPlayerList());
            
            console.log(`Player ${name} joined ${code}`);
        });

        // --- آماده بودن ---
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

        // --- پیشنهاد ---
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

        // --- تبادل کارت ---
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

        // --- انتخاب مد ---
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

        // --- بازی کارت ---
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

        // --- ریست بازی ---
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

        // --- ترک بازی ---
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

        // --- صدا ---
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

        // --- قطع اتصال ---
        socket.on('disconnect', () => {
            console.log('Disconnected:', socket.id);
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

                // اگر نوبت این بازیکن بود، تایمر ادامه پیدا می‌کند
                // و بات جای او بازی می‌کند
            }
        });

        // --- Ping/Pong برای Keep-Alive ---
        socket.on('ping', () => {
            socket.emit('pong');
            const room = getRoom(myRoom);
            if (room) room.lastActivity = Date.now();
        });
    });
}

module.exports = { setupSocketHandlers, getRoom, rooms };