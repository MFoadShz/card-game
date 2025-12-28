class VoiceChat {
  constructor() {
    this.peer = null;
    this.stream = null;
    this.connections = {};
  }

  async init() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.peer = new Peer();

      this.peer.on('open', (id) => {
        console.log('Peer ID:', id);
        socket.emit('voice-join', id);
      });

      this.peer.on('call', (call) => {
        call.answer(this.stream);
        call.on('stream', (remoteStream) => {
          this.addAudioStream(remoteStream);
        });
      });

      socket.on('voice-peer', (peerId) => {
        if (!this.connections[peerId]) {
          const call = this.peer.call(peerId, this.stream);
          call.on('stream', (remoteStream) => {
            this.addAudioStream(remoteStream);
          });
          this.connections[peerId] = call;
        }
      });
    } catch (err) {
      console.error('Error initializing voice chat:', err);
    }
  }

  addAudioStream(stream) {
    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    document.body.appendChild(audio);
  }

  toggleMic() {
    if (this.stream) {
      const enabled = this.stream.getAudioTracks()[0].enabled;
      this.stream.getAudioTracks()[0].enabled = !enabled;
      console.log(enabled ? 'Microphone muted' : 'Microphone unmuted');
    }
  }
}

const voiceChat = new VoiceChat();
voiceChat.init();

function toggleMic() {
  voiceChat.toggleMic();
}