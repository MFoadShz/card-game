const MODE_NAMES = {
  hokm: 'حکم',
  sars: 'سَرس',
  nars: 'نَرس',
  asNars: 'آس نَرس'
};

const MODE_DESCRIPTIONS = {
  hokm: 'حالت استاندارد با حکم - برش مجاز',
  sars: 'بدون حکم - برش نمی‌شود',
  nars: 'با حکم - دولو قوی‌ترین، آس ضعیف‌ترین',
  asNars: 'با حکم - آس قوی‌ترین، شاه ضعیف‌ترین'
};

const MODE_NEEDS_SUIT = {
  hokm: true,
  nars: true,
  asNars: true,
  sars: false
};

function log(msg) {
  const l = document.getElementById('log');
  l.innerHTML = `<div>📌 ${msg}</div>` + l.innerHTML;
  if (l.children.length > 20) l.removeChild(l.lastChild);
}

function getGameModeDisplay(gameMode, masterSuit) {
  switch (gameMode) {
    case 'hokm': return `👑 حکم ${masterSuit}`;
    case 'sars': return '🔄 سَرس (بدون حکم)';
    case 'nars': return `⬇️ نَرس ${masterSuit}`;
    case 'asNars': return `🅰️ آس نَرس ${masterSuit}`;
    default: return gameMode;
  }
}

function getRelativePositions(myIndex) {
  // محاسبه موقعیت نسبی بازیکنان
  return {
    top: (myIndex + 2) % 4,    // روبرو
    left: (myIndex + 1) % 4,   // چپ
    right: (myIndex + 3) % 4   // راست
  };
}