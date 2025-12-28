let draggedCard = null;
let draggedIndex = -1;

function createCardHtml(c, i, sel, clickable = true, draggable = false) {
  const isRed = c.s === '♥' || c.s === '♦';
  const colorClass = isRed ? 'red' : 'black';
  const selectedClass = sel ? ' selected' : '';
  const dragAttr = draggable ? 'draggable="true"' : '';
  const dataIndex = i >= 0 ? `data-index="${i}"` : '';
  
  // اضافه کردن onclick برای کلیک روی کارت
  const onClickAttr = (clickable && i >= 0) ? `onclick="clickCard(${i})"` : '';

  return `
    <div class="card ${colorClass}${selectedClass}" ${dataIndex} ${dragAttr} ${onClickAttr}>
      <div class="corner corner-top">
        <div class="rank">${c.v}</div>
        <div class="suit-small">${c.s}</div>
      </div>
      <div class="center-suit">${c.s}</div>
      <div class="corner corner-bottom">
        <div class="rank">${c.v}</div>
        <div class="suit-small">${c.s}</div>
      </div>
    </div>
  `;
}

function createCardBackHtml(count, horizontal = false) {
  let html = '';
  for (let i = 0; i < Math.min(count, 6); i++) {
    html += '<div class="card-back"></div>';
  }
  if (count > 6) {
    html += `<span style="font-size:10px;margin:3px">+${count - 6}</span>`;
  }
  return html;
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('dropZone');
  const myHand = document.getElementById('myHand');

  if (!dropZone || !myHand) return;

  // Touch events for mobile
  myHand.addEventListener('touchstart', handleTouchStart, { passive: false });
  myHand.addEventListener('touchmove', handleTouchMove, { passive: false });
  myHand.addEventListener('touchend', handleTouchEnd, { passive: false });

  // Mouse events for desktop
  myHand.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // Drop zone visual feedback
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (draggedIndex >= 0) {
      playCardByIndex(draggedIndex);
    }
  });
}

function handleTouchStart(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  
  // در حالت exchange فقط انتخاب کنیم، drag نکنیم
  if (state.phase === 'exchange') {
    return; // اجازه بده onclick کار کند
  }
  
  if (!canPlayCard()) return;

  e.preventDefault();
  draggedIndex = parseInt(card.dataset.index);
  if (isNaN(draggedIndex)) return;

  draggedCard = card.cloneNode(true);
  draggedCard.classList.add('dragging');
  draggedCard.style.position = 'fixed';
  draggedCard.style.pointerEvents = 'none';
  document.body.appendChild(draggedCard);

  updateDragPosition(e.touches[0]);
  card.style.opacity = '0.3';
}

function handleTouchMove(e) {
  if (!draggedCard) return;
  e.preventDefault();
  updateDragPosition(e.touches[0]);
  checkDropZone(e.touches[0]);
}

function handleTouchEnd(e) {
  if (!draggedCard) return;

  const dropZone = document.getElementById('dropZone');
  const touch = e.changedTouches[0];
  const dropRect = dropZone.getBoundingClientRect();

  if (touch.clientX >= dropRect.left && touch.clientX <= dropRect.right &&
      touch.clientY >= dropRect.top && touch.clientY <= dropRect.bottom) {
    playCardByIndex(draggedIndex);
  }

  cleanupDrag();
}

function handleMouseDown(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  
  // در حالت exchange فقط انتخاب کنیم، drag نکنیم
  if (state.phase === 'exchange') {
    return; // اجازه بده onclick کار کند
  }
  
  if (!canPlayCard()) return;

  draggedIndex = parseInt(card.dataset.index);
  if (isNaN(draggedIndex)) return;

  e.preventDefault(); // جلوگیری از انتخاب متن
  
  draggedCard = card.cloneNode(true);
  draggedCard.classList.add('dragging');
  draggedCard.style.position = 'fixed';
  draggedCard.style.pointerEvents = 'none';
  document.body.appendChild(draggedCard);

  updateDragPosition(e);
  card.style.opacity = '0.3';
}

function handleMouseMove(e) {
  if (!draggedCard) return;
  updateDragPosition(e);
  checkDropZone(e);
}

function handleMouseUp(e) {
  if (!draggedCard) return;

  const dropZone = document.getElementById('dropZone');
  const dropRect = dropZone.getBoundingClientRect();

  if (e.clientX >= dropRect.left && e.clientX <= dropRect.right &&
      e.clientY >= dropRect.top && e.clientY <= dropRect.bottom) {
    playCardByIndex(draggedIndex);
  }

  cleanupDrag();
}

function updateDragPosition(point) {
  if (!draggedCard) return;
  draggedCard.style.left = (point.clientX - 26) + 'px';
  draggedCard.style.top = (point.clientY - 37) + 'px';
}

function checkDropZone(point) {
  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;
  
  const dropRect = dropZone.getBoundingClientRect();

  if (point.clientX >= dropRect.left && point.clientX <= dropRect.right &&
      point.clientY >= dropRect.top && point.clientY <= dropRect.bottom) {
    dropZone.classList.add('drag-over');
  } else {
    dropZone.classList.remove('drag-over');
  }
}

function cleanupDrag() {
  if (draggedCard) {
    draggedCard.remove();
    draggedCard = null;
  }

  document.querySelectorAll('.card').forEach(c => c.style.opacity = '1');
  
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.classList.remove('drag-over');
  }
  
  draggedIndex = -1;
}

function canPlayCard() {
  return state && state.phase === 'playing' && state.turn === myIndex;
}

function playCardByIndex(index) {
  if (canPlayCard() && index >= 0) {
    socket.emit('playCard', index);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', setupDragAndDrop);