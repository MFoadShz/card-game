/**
 * Modal Management Module
 */

const Modals = {
  show(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
  },
  
  hide(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  },
  
  /**
   * Show round result
   */
  showRoundResult(data) {
    const modal = document.getElementById('resultModal');
    const title = document.getElementById('resultTitle');
    const cards = document.getElementById('resultCards');
    const points = document.getElementById('resultPoints');
    
    if (!modal || !title || !cards || !points) return;
    
    title.textContent = `🏆 ${data.winnerName} برد!`;
    
    cards.innerHTML = (data.playedCards || data.cards || []).map(pc => {
      const cls = pc.isWinner ? 'winner' : '';
      const card = pc.card || pc.c;
      return `<div class="${cls}">${CardRenderer.createHtml(card, 'small')}</div>`;
    }).join('');
    
    points.textContent = `امتیاز: ${data.points}`;
    
    this.show('resultModal');
    setTimeout(() => this.hide('resultModal'), 2500);
  },
  
  /**
   * Show match end
   */
  showMatchEnd(data, myIndex) {
    const modal = document.getElementById('endModal');
    const title = document.getElementById('endTitle');
    const details = document.getElementById('endDetails');
    
    if (!modal || !title || !details) return;
    
    const myTeam = myIndex % 2;
    const won = data.success ? data.leaderTeam === myTeam : data.leaderTeam !== myTeam;
    
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.className = 'modal-content end-modal ' + (won ? 'win' : 'lose');
    }
    
    title.textContent = won ? '🎉 این دست را بردید!' : '😔 این دست را باختید';
    
    const resultText = data.success ? 'قرارداد موفق ✅' : 'قرارداد ناموفق ❌';
    
    details.innerHTML = `
      <div style="font-size:16px;margin-bottom:10px">${resultText}</div>
      <div>قرارداد: ${data.contract}</div>
      <div>امتیاز تیم حاکم: ${data.leaderScore}</div>
      <div>امتیاز تیم مقابل: ${data.opponentScore}</div>
      <hr style="margin:10px 0;border-color:#444">
      <div style="font-size:18px;font-weight:bold">
        مجموع: تیم ۱: ${data.totalScores[0]} | تیم ۲: ${data.totalScores[1]}
      </div>
      <div style="margin-top:15px;color:var(--gold)">
        ⏳ دست بعدی به زودی شروع می‌شود...
      </div>
    `;
    
    this.show('endModal');
  },
  
  /**
   * Show game over
   */
  showGameOver(data, myIndex, isHost) {
    const modal = document.getElementById('gameOverModal');
    const title = document.getElementById('gameOverTitle');
    const details = document.getElementById('gameOverDetails');
    const history = document.getElementById('gameHistory');
    
    if (!modal || !title || !details) return;
    
    const myTeam = myIndex % 2;
    const won = data.winner === myTeam;
    
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.className = 'modal-content game-over-modal ' + (won ? 'win' : 'lose');
    }
    
    title.textContent = won ? '🏆 تبریک! شما برنده شدید!' : '😔 متأسفانه باختید';
    
    details.innerHTML = `
      <div class="final-scores">
        <div class="team-score ${data.winner === 0 ? 'winner' : ''}">
          <span class="label">تیم ۱</span>
          <span class="score">${data.totalScores[0]}</span>
        </div>
        <div class="vs">VS</div>
        <div class="team-score ${data.winner === 1 ? 'winner' : ''}">
          <span class="label">تیم ۲</span>
          <span class="score">${data.totalScores[1]}</span>
        </div>
      </div>
    `;
    
    if (history && data.matchHistory) {
      const modeNames = { hokm: 'حکم', nars: 'نرس', asNars: 'آس‌نرس', sars: 'سرس' };
      let historyHtml = '<h4>تاریخچه دست‌ها:</h4>';
      
      data.matchHistory.forEach((match, idx) => {
        historyHtml += `
          <div class="match-item ${match.success ? 'success' : 'failed'}">
            <div class="match-header">
              <span>دست ${idx + 1}</span>
              <span>${match.leaderName} - ${modeNames[match.gameMode] || match.gameMode}</span>
            </div>
            <div class="match-scores">
              قرارداد: ${match.contract} | 
              ${match.success ? '✅ موفق' : '❌ ناموفق'}
            </div>
          </div>
        `;
      });
      history.innerHTML = historyHtml;
    }
    
    const resetBtn = document.getElementById('resetGameBtn');
    if (resetBtn) {
      resetBtn.style.display = isHost ? 'block' : 'none';
    }
    
    this.show('gameOverModal');
  }
};

// Export
window.Modals = Modals;
