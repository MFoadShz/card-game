/**
 * State Management Module
 * Centralized game state
 */

const GameState = {
  // Game state from server
  state: null,
  
  // Player info
  myIndex: -1,
  myName: '',
  myRoom: '',
  scoreLimit: 500,
  isHost: false,
  playerNames: [],
  
  // UI state
  selected: [],
  selectedSuit: null,
  
  // Animation state
  isDealing: false,
  previousPhase: null,
  
  // Drag state
  draggedCard: null,
  draggedCardEl: null,
  draggedIndex: -1,
  touchStartTime: 0,
  isTouchDevice: false,
  
  // Timer state
  timerInterval: null,
  remainingTime: 30,
  countdownInterval: null,
  
  // Methods
  update(newState) {
    this.previousPhase = this.state?.phase;
    this.state = newState;
    this.myIndex = newState.myIndex;
  },
  
  reset() {
    this.state = null;
    this.selected = [];
    this.selectedSuit = null;
    this.isDealing = false;
    this.previousPhase = null;
  },
  
  get isMyTurn() {
    return this.state?.turn === this.myIndex;
  },
  
  get phase() {
    return this.state?.phase;
  },
  
  get hand() {
    return this.state?.hand || [];
  },
  
  get myTeam() {
    return this.myIndex % 2;
  }
};

// Export
window.GameState = GameState;
