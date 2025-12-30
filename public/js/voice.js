// public/js/voice.js - نسخه بهبود یافته

class VoiceChat {
  constructor(socket, myIndex) {
    this.socket = socket;
    this.myIndex = myIndex;
    this.localStream = null;
    this.peers = {};
    this.audioElements = {};
    this.isMicMuted = false;
    this.isSpeakerMuted = false;
    this.isInitialized = false;
    
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
    
    this.setupSocketListeners();
  }
  
  setupSocketListeners() {
    this.socket.on('voiceOffer', async ({ from, offer }) => {
      console.log('Received voice offer from', from);
      await this.handleOffer(from, offer);
    });
    
    this.socket.on('voiceAnswer', async ({ from, answer }) => {
      console.log('Received voice answer from', from);
      await this.handleAnswer(from, answer);
    });
    
    this.socket.on('voiceIceCandidate', async ({ from, candidate }) => {
      await this.handleIceCandidate(from, candidate);
    });
    
    this.socket.on('voiceReady', ({ from }) => {
      console.log('Player', from, 'is ready for voice');
      if (this.isInitialized && from < this.myIndex) {
        this.createOffer(from);
      }
    });
    
    this.socket.on('playerRejoined', ({ index }) => {
      console.log('Player', index, 'rejoined, reconnecting voice');
      if (this.isInitialized) {
        this.reconnectTo(index);
      }
    });
    
    this.socket.on('playerDisconnected', ({ index }) => {
      this.removePeer(index);
    });
  }
  
  async initialize() {
    // بررسی پشتیبانی مرورگر
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia not supported');
      this.updateStatus('پشتیبانی نمی‌شود', true);
      return false;
    }
    
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      
      this.isInitialized = true;
      this.updateStatus('متصل ✓', false);
      this.socket.emit('voiceReady');
      return true;
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      
      if (error.name === 'NotAllowedError') {
        this.updateStatus('دسترسی رد شد', true);
      } else if (error.name === 'NotFoundError') {
        this.updateStatus('میکروفون یافت نشد', true);
      } else {
        this.updateStatus('خطا در میکروفون', true);
      }
      
      return false;
    }
  }
  
  async createOffer(targetIndex) {
    if (!this.isInitialized) return;
    
    if (this.peers[targetIndex]) {
      this.peers[targetIndex].close();
    }
    
    const pc = this.createPeerConnection(targetIndex);
    this.peers[targetIndex] = pc;
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      this.socket.emit('voiceOffer', {
        to: targetIndex,
        offer: pc.localDescription
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }
  
  async handleOffer(fromIndex, offer) {
    if (!this.isInitialized) return;
    
    if (this.peers[fromIndex]) {
      this.peers[fromIndex].close();
    }
    
    const pc = this.createPeerConnection(fromIndex);
    this.peers[fromIndex] = pc;
    
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      this.socket.emit('voiceAnswer', {
        to: fromIndex,
        answer: pc.localDescription
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }
  
  async handleAnswer(fromIndex, answer) {
    const pc = this.peers[fromIndex];
    if (pc && pc.signalingState !== 'stable') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  }
  
  async handleIceCandidate(fromIndex, candidate) {
    const pc = this.peers[fromIndex];
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }
  
  createPeerConnection(targetIndex) {
    const pc = new RTCPeerConnection(this.config);
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('voiceIceCandidate', {
          to: targetIndex,
          candidate: event.candidate
        });
      }
    };
    
    pc.ontrack = (event) => {
      console.log('Received track from', targetIndex);
      this.setupAudioElement(targetIndex, event.streams[0]);
    };
    
    pc.onconnectionstatechange = () => {
      console.log('Connection state with', targetIndex, ':', pc.connectionState);
      this.updateVoiceIndicator(targetIndex, pc.connectionState === 'connected');
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log('ICE state with', targetIndex, ':', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        // تلاش مجدد
        console.log('ICE failed, attempting restart...');
        this.reconnectTo(targetIndex);
      }
    };
    
    return pc;
  }
  
  setupAudioElement(playerIndex, stream) {
    if (this.audioElements[playerIndex]) {
      this.audioElements[playerIndex].remove();
    }
    
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.srcObject = stream;
    audio.muted = this.isSpeakerMuted;
    
    const container = document.getElementById('audioContainer');
    if (container) {
      container.appendChild(audio);
    }
    
    this.audioElements[playerIndex] = audio;
    this.updateVoiceIndicator(playerIndex, true);
  }
  
  updateVoiceIndicator(playerIndex, isConnected) {
    const positions = ['top', 'left', 'right'];
    const relativeIndices = [
      (this.myIndex + 2) % 4,
      (this.myIndex + 3) % 4,
      (this.myIndex + 1) % 4
    ];
    
    const posIndex = relativeIndices.indexOf(playerIndex);
    if (posIndex !== -1) {
      const pos = positions[posIndex];
      const elem = document.getElementById('player' + pos.charAt(0).toUpperCase() + pos.slice(1));
      if (elem) {
        const indicator = elem.querySelector('.voice-indicator');
        if (indicator) {
          indicator.classList.toggle('speaking', isConnected);
        }
      }
    }
  }
  
  toggleMic() {
    if (!this.localStream) return false;
    
    this.isMicMuted = !this.isMicMuted;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMicMuted;
    });
    
    const btn = document.getElementById('btnMic');
    if (btn) {
      btn.classList.toggle('muted', this.isMicMuted);
      const status = btn.querySelector('.status');
      if (status) {
        status.textContent = this.isMicMuted ? 'خاموش' : 'روشن';
      }
    }
    
    return !this.isMicMuted;
  }
  
  toggleSpeaker() {
    this.isSpeakerMuted = !this.isSpeakerMuted;
    
    Object.values(this.audioElements).forEach(audio => {
      audio.muted = this.isSpeakerMuted;
    });
    
    const btn = document.getElementById('btnSpeaker');
    if (btn) {
      btn.classList.toggle('muted', this.isSpeakerMuted);
      const status = btn.querySelector('.status');
      if (status) {
        status.textContent = this.isSpeakerMuted ? 'خاموش' : 'روشن';
      }
    }
    
    return !this.isSpeakerMuted;
  }
  
  removePeer(playerIndex) {
    if (this.peers[playerIndex]) {
      this.peers[playerIndex].close();
      delete this.peers[playerIndex];
    }
    
    if (this.audioElements[playerIndex]) {
      this.audioElements[playerIndex].remove();
      delete this.audioElements[playerIndex];
    }
    
    this.updateVoiceIndicator(playerIndex, false);
  }
  
  async reconnectTo(playerIndex) {
    this.removePeer(playerIndex);
    
    // کمی صبر قبل از اتصال مجدد
    await new Promise(r => setTimeout(r, 500));
    
    if (playerIndex < this.myIndex) {
      await this.createOffer(playerIndex);
    }
  }
  
  updateStatus(text, isError) {
    const status = document.getElementById('voiceStatus');
    if (status) {
      status.textContent = text;
      status.classList.toggle('error', isError);
    }
  }
  
  destroy() {
    Object.keys(this.peers).forEach(index => {
      this.removePeer(parseInt(index));
    });
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    this.isInitialized = false;
  }
}

let voiceChat = null;

async function initVoiceChat(socket, myIndex) {
  if (voiceChat) {
    voiceChat.destroy();
  }
  
  voiceChat = new VoiceChat(socket, myIndex);
  return voiceChat.initialize();
}

function toggleMic() {
  if (voiceChat) {
    voiceChat.toggleMic();
  }
}

function toggleSpeaker() {
  if (voiceChat) {
    voiceChat.toggleSpeaker();
  }
}