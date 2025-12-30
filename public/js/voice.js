// ==================== Voice Chat با WebRTC ====================

class VoiceChat {
  constructor(socket, myIndex) {
    this.socket = socket;
    this.myIndex = myIndex;
    this.localStream = null;
    this.peers = {}; // {playerIndex: RTCPeerConnection}
    this.audioElements = {}; // {playerIndex: HTMLAudioElement}
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
        // فقط بازیکن با index کمتر offer می‌دهد
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
    try {
      // درخواست دسترسی به میکروفون
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
      
      // اطلاع به بقیه که آماده‌ایم
      this.socket.emit('voiceReady');
      
      return true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.updateStatus('خطا در میکروفون', true);
      return false;
    }
  }
  
  async createOffer(targetIndex) {
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
    if (pc) {
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
    
    // اضافه کردن track‌های صوتی
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    
    // دریافت ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('voiceIceCandidate', {
          to: targetIndex,
          candidate: event.candidate
        });
      }
    };
    
    // دریافت stream از بازیکن دیگر
    pc.ontrack = (event) => {
      console.log('Received track from', targetIndex);
      this.setupAudioElement(targetIndex, event.streams[0]);
    };
    
    pc.onconnectionstatechange = () => {
      console.log('Connection state with', targetIndex, ':', pc.connectionState);
      this.updateVoiceIndicator(targetIndex, pc.connectionState === 'connected');
    };
    
    return pc;
  }
  
  setupAudioElement(playerIndex, stream) {
    // حذف المنت قبلی اگر وجود داشت
    if (this.audioElements[playerIndex]) {
      this.audioElements[playerIndex].remove();
    }
    
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.srcObject = stream;
    audio.muted = this.isSpeakerMuted;
    
    document.getElementById('audioContainer').appendChild(audio);
    this.audioElements[playerIndex] = audio;
    
    // نمایش voice indicator
    this.updateVoiceIndicator(playerIndex, true);
  }
  
  updateVoiceIndicator(playerIndex, isConnected) {
    // پیدا کردن المنت بازیکن
    const positions = ['top', 'left', 'right'];
    const myIndex = this.myIndex;
    const relativeIndices = [
      (myIndex + 2) % 4,
      (myIndex + 3) % 4,
      (myIndex + 1) % 4
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
    btn.classList.toggle('muted', this.isMicMuted);
    btn.querySelector('.status').textContent = this.isMicMuted ? 'خاموش' : 'روشن';
    
    return !this.isMicMuted;
  }
  
  toggleSpeaker() {
    this.isSpeakerMuted = !this.isSpeakerMuted;
    
    Object.values(this.audioElements).forEach(audio => {
      audio.muted = this.isSpeakerMuted;
    });
    
    const btn = document.getElementById('btnSpeaker');
    btn.classList.toggle('muted', this.isSpeakerMuted);
    btn.querySelector('.status').textContent = this.isSpeakerMuted ? 'خاموش' : 'روشن';
    
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
    
    if (playerIndex < this.myIndex) {
      // ما باید offer بدهیم
      await this.createOffer(playerIndex);
    }
    // در غیر این صورت منتظر offer از طرف مقابل می‌مانیم
  }
  
  updateStatus(text, isError) {
    const status = document.getElementById('voiceStatus');
    if (status) {
      status.textContent = text;
      status.classList.toggle('error', isError);
    }
  }
  
  destroy() {
    // قطع همه اتصالات
    Object.keys(this.peers).forEach(index => {
      this.removePeer(parseInt(index));
    });
    
    // توقف stream محلی
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    this.isInitialized = false;
  }
}

// Global instance
let voiceChat = null;

function initVoiceChat(socket, myIndex) {
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