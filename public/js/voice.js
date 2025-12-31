// public/js/voice.js
class SimpleVoiceChat {
    constructor(socket, myIndex) {
        this.socket = socket;
        this.myIndex = myIndex;
        this.peers = {};
        this.localStream = null;
        this.isMuted = false;
        
        // تنظیمات با bitrate پایین
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 2
        };
        
        // Audio constraints با کیفیت پایین برای کاهش لگ
        this.audioConstraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 8000,        // پایین‌ترین نرخ نمونه‌برداری
                sampleSize: 8,           // کیفیت پایین
                channelCount: 1,         // مونو
                latency: 0,              // کمترین تأخیر
                volume: 1.0
            }
        };
        
        this.setupListeners();
    }

    setupListeners() {
        this.socket.on('voiceSignal', async ({ from, signal }) => {
            try {
                if (signal.type === 'offer') {
                    await this.handleOffer(from, signal);
                } else if (signal.type === 'answer') {
                    await this.handleAnswer(from, signal);
                } else if (signal.candidate) {
                    await this.handleCandidate(from, signal);
                }
            } catch (e) {
                console.error('Voice signal error:', e);
            }
        });

        this.socket.on('voiceReady', ({ from }) => {
            if (from !== this.myIndex && !this.peers[from]) {
                setTimeout(() => this.createConnection(from, true), 100);
            }
        });

        this.socket.on('playerDisconnected', ({ index }) => {
            this.closeConnection(index);
        });

        this.socket.on('playerRejoined', ({ index }) => {
            this.closeConnection(index);
            setTimeout(() => this.createConnection(index, true), 500);
        });
    }

    async init() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(this.audioConstraints);
            
            // کاهش بیشتر کیفیت با AudioContext
            this.processAudio();
            
            this.updateStatus('آماده', false);
            this.socket.emit('voiceReady');
            return true;
        } catch (err) {
            console.error('Mic error:', err);
            this.updateStatus('خطا در میکروفون', true);
            return false;
        }
    }

    processAudio() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 8000,
                latencyHint: 'interactive'
            });
            
            const source = audioContext.createMediaStreamSource(this.localStream);
            const destination = audioContext.createMediaStreamDestination();
            
            // فیلتر lowpass برای کاهش پهنای باند
            const filter = audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 3000;
            
            // کمپرسور برای یکنواخت کردن صدا
            const compressor = audioContext.createDynamicsCompressor();
            compressor.threshold.value = -50;
            compressor.knee.value = 40;
            compressor.ratio.value = 12;
            compressor.attack.value = 0;
            compressor.release.value = 0.25;
            
            source.connect(filter);
            filter.connect(compressor);
            compressor.connect(destination);
            
            this.localStream = destination.stream;
        } catch (e) {
            console.log('Audio processing not available, using raw stream');
        }
    }

    createConnection(targetIndex, isInitiator) {
        if (this.peers[targetIndex]) {
            this.peers[targetIndex].close();
        }

        const pc = new RTCPeerConnection(this.config);
        this.peers[targetIndex] = pc;

        // تنظیمات codec برای کیفیت پایین
        if (pc.getTransceivers) {
            pc.getTransceivers().forEach(transceiver => {
                if (transceiver.sender.track?.kind === 'audio') {
                    const params = transceiver.sender.getParameters();
                    if (params.encodings && params.encodings.length > 0) {
                        params.encodings[0].maxBitrate = 8000; // 8 kbps
                    }
                    transceiver.sender.setParameters(params).catch(() => {});
                }
            });
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.socket.emit('voiceSignal', {
                    to: targetIndex,
                    signal: e.candidate
                });
            }
        };

        pc.ontrack = (e) => {
            this.playAudio(targetIndex, e.streams[0]);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                this.closeConnection(targetIndex);
            }
        };

        if (isInitiator) {
            pc.createOffer({
                offerToReceiveAudio: true,
                voiceActivityDetection: true
            })
            .then(offer => {
                // تغییر SDP برای کاهش bitrate
                offer.sdp = this.modifySdp(offer.sdp);
                return pc.setLocalDescription(offer);
            })
            .then(() => {
                this.socket.emit('voiceSignal', {
                    to: targetIndex,
                    signal: pc.localDescription
                });
            })
            .catch(e => console.error('Offer error:', e));
        }

        return pc;
    }

    modifySdp(sdp) {
        // تنظیم bitrate در SDP
        return sdp.replace(/a=fmtp:111 /g, 'a=fmtp:111 maxaveragebitrate=8000;stereo=0;sprop-stereo=0;useinbandfec=0;');
    }

    async handleOffer(from, offer) {
        const pc = this.createConnection(from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await pc.createAnswer();
        answer.sdp = this.modifySdp(answer.sdp);
        await pc.setLocalDescription(answer);
        
        this.socket.emit('voiceSignal', {
            to: from,
            signal: pc.localDescription
        });
    }

    async handleAnswer(from, answer) {
        const pc = this.peers[from];
        if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    async handleCandidate(from, candidate) {
        const pc = this.peers[from];
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                // Ignore errors for old candidates
            }
        }
    }

    playAudio(index, stream) {
        let audio = document.getElementById('audio-' + index);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = 'audio-' + index;
            audio.autoplay = true;
            audio.playsInline = true;
            document.getElementById('audioContainer').appendChild(audio);
        }
        audio.srcObject = stream;
        audio.play().catch(() => {});
    }

    closeConnection(index) {
        if (this.peers[index]) {
            this.peers[index].close();
            delete this.peers[index];
        }
        const audio = document.getElementById('audio-' + index);
        if (audio) audio.remove();
    }

    toggleMic() {
        if (!this.localStream) return;
        
        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
        
        const btn = document.getElementById('btnMic');
        if (btn) {
            btn.classList.toggle('muted', this.isMuted);
            btn.querySelector('.status').textContent = this.isMuted ? 'خاموش' : 'روشن';
        }
    }

    updateStatus(text, isError) {
        const el = document.getElementById('voiceStatus');
        if (el) {
            el.textContent = text;
            el.classList.toggle('error', isError);
        }
    }

    destroy() {
        Object.keys(this.peers).forEach(i => this.closeConnection(parseInt(i)));
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
        }
    }
}

let voiceChat = null;

async function initVoiceChat(socket, myIndex) {
    if (voiceChat) voiceChat.destroy();
    voiceChat = new SimpleVoiceChat(socket, myIndex);
    return voiceChat.init();
}

function toggleMic() {
    if (voiceChat) voiceChat.toggleMic();
}