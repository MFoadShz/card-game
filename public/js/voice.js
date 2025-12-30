class SimpleVoiceChat {
  constructor(socket, myIndex) {
    this.socket = socket;
    this.myIndex = myIndex;
    this.localStream = null;
    this.peers = {};
    this.isMuted = false;
    this.isInitialized = false;
    
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    this.setupListeners();
  }

  setupListeners() {
    this.socket.on('voiceSignal', async ({ from, signal }) => {
      if (signal.type === 'offer') {
        await this.handleOffer(from, signal);
      } else if (signal.type === 'answer') {
        await this.handleAnswer(from, signal);
      } else if (signal.candidate) {
        await this.handleCandidate(from, signal);
      }
    });

    this.socket.on('voiceReady', ({ from }) => {
      if (this.isInitialized && from > this.myIndex) {
        this.createConnection(from, true);
      }
    });

    this.socket.on('playerDisconnected', ({ index }) => {
      this.closeConnection(index);
    });

    this.socket.on('playerRejoined', ({ index }) => {
      if (this.isInitialized) {
        setTimeout(() => this.createConnection(index, true), 500);
      }
    });
  }

  async init() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
      
      this.isInitialized = true;
      this.updateStatus('آماده', false);
      this.socket.emit('voiceReady');
      return true;
    } catch (err) {
      console.error('Mic error:', err);
      this.updateStatus('خطا در میکروفون', true);
      return false;
    }
  }

  createConnection(targetIndex, isInitiator) {
    if (this.peers[targetIndex]) {
      this.peers[targetIndex].close();
    }

    const pc = new RTCPeerConnection(this.config);
    this.peers[targetIndex] = pc;

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

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          this.socket.emit('voiceSignal', {
            to: targetIndex,
            signal: pc.localDescription
          });
        });
    }

    return pc;
  }

  async handleOffer(from, offer) {
    const pc = this.createConnection(from, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit('voiceSignal', {
      to: from,
      signal: pc.localDescription
    });
  }

  async handleAnswer(from, answer) {
    const pc = this.peers[from];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async handleCandidate(from, candidate) {
    const pc = this.peers[from];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  playAudio(index, stream) {
    let audio = document.getElementById('audio-' + index);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'audio-' + index;
      audio.autoplay = true;
      document.getElementById('audioContainer').appendChild(audio);
    }
    audio.srcObject = stream;
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
    this.isInitialized = false;
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