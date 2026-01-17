// wheel.js - FINAL VERSION - Test Mode with Balance Management

/* ===== CONFIG ===== */
const TEST_MODE = false;   // ← В ПРОДЕ false. Для теста руками поставь true.
window.TEST_MODE = TEST_MODE;

// Если TEST_MODE включен, экспортируем дополнительные функции
if (window.TEST_MODE) {
  console.log('[Wheel] 🔧 TEST MODE ACTIVE - Exporting admin functions');
  
  // Создаем глобальный объект для админских функций
  window.WheelAdmin = {
    // Текущие параметры
    getCurrentState: function() {
      return {
        testMode: window.TEST_MODE,
        balance: window.userBalance || { ton: 0, stars: 0 },
        currency: window.currentCurrency || 'ton',
        phase: window.phase || 'unknown',
        omega: window.omega || 0
      };
    },
    
    // Принудительное выпадение сегмента
    forceNextSegment: function(segmentName) {
      window.forcedNextSegment = segmentName;
      console.log('[WheelAdmin] Next segment forced to:', segmentName);
    },
    
    // Сброс принудительного выпадения
    clearForcedSegment: function() {
      window.forcedNextSegment = null;
      console.log('[WheelAdmin] Forced segment cleared');
    },
    
    // Изменение скорости колеса
    setWheelSpeed: function(speed) {
      if (speed === 'fast') {
        window.setOmega ? window.setOmega(9.0, { force: true }) : (window.omega = 9.0);
      } else if (speed === 'slow') {
        window.setOmega ? window.setOmega(0.35, { force: true }) : (window.omega = 0.35);
      } else {
        window.setOmega ? window.setOmega(parseFloat(speed) || 0.35, { force: true }) : (window.omega = parseFloat(speed) || 0.35);
      }
      console.log('[WheelAdmin] Wheel speed set to:', window.omega);
    },
    
    // Мгновенная остановка колеса
    stopWheel: function() {
      window.setOmega ? window.setOmega(0, { force: true }) : (window.omega = 0);
      window.setPhase ? window.setPhase('betting', { force: true }) : (window.phase = 'betting');
      console.log('[WheelAdmin] Wheel stopped');
    },
    
    // Запуск нового раунда
    startNewRound: function() {
      if (window.startCountdown) {
        window.startCountdown(9);
        console.log('[WheelAdmin] New round started');
      }
    },
    
    // Симуляция выпадения сегмента
    simulateSegmentWin: function(segmentName, betAmount = 1) {
      console.log('[WheelAdmin] Simulating win for:', segmentName, 'with bet:', betAmount);
      
      // Отправляем событие выпадения
      window.dispatchEvent(new CustomEvent('wheel:landed', {
        detail: {
          segment: segmentName,
          betAmount: betAmount,
          isSimulated: true
        }
      }));
      
      // Обрабатываем в зависимости от типа сегмента
      const multipliers = {
        '1.1x': 1.1,
        '1.5x': 1.5,
        '5x': 5,
        '11x': 11
      };
      
      if (multipliers[segmentName]) {
        // Обычный множитель
        const winAmount = betAmount * multipliers[segmentName];
        
        if (window.showWinNotification) {
          window.showWinNotification(winAmount);
        }
        
        // Добавляем к балансу
        if (window.TEST_MODE && window.addWinAmount) {
          window.addWinAmount(winAmount, window.currentCurrency || 'ton');
        }
        
      } else if (segmentName === '50&50') {
        // Запуск бонуса 50/50
        if (window.stopOnSegment) window.stopOnSegment('50&50');
        else if (window.bonusLockStart) {
        const wp = document.getElementById('wheelPage');
        if (wp && wp.classList.contains('page-active')) window.bonusLockStart();
      }

        if (window.start5050Bonus) {
          Promise.resolve(window.start5050Bonus(betAmount)).finally(() => {
            if (window.bonusLockEnd) window.bonusLockEnd({ phase: 'betting', omega: IDLE_OMEGA });
          });
        }
      } else if (segmentName === 'Loot Rush') {
        // Бонус Loot Rush (заглушка)
        console.log('[WheelAdmin] Loot Rush bonus not implemented yet');
        if (window.showBonusNotification) {
          window.showBonusNotification('Loot Rush');
        }
      } else if (segmentName === 'Wild Time') {
        console.log('[WheelAdmin] 🐾 Starting Wild Time bonus.');
        const betOnWildTime = betAmount || 0;

        (async () => {
          try {
            if (typeof window.bonusLockStart === 'function') window.bonusLockStart();
            if (typeof window.startWildTimeBonus === 'function') {
              await window.startWildTimeBonus(betOnWildTime);
            } else if (typeof window.showBonusNotification === 'function') {
              window.showBonusNotification('Wild Time');
            } else {
              console.warn('[WheelAdmin] startWildTimeBonus not found');
            }
          } catch (e) {
            console.warn('[WheelAdmin] Wild Time error', e);
          } finally {
            if (typeof window.bonusLockEnd === 'function') window.bonusLockEnd({ phase: 'betting', omega: IDLE_OMEGA });
          }
        })();
      }
      
      // Добавляем в историю
      this.addToHistory(segmentName);
    },
    

    
    // Добавление в историю
    addToHistory: function(segmentName) {
      const historyList = document.getElementById('historyList');
      if (!historyList) return;
      
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      
      const historyIcons = {
        '1.1x': '/images/history/1.1x_small.png',
        '1.5x': '/images/history/1.5x_small.png',
        '5x': '/images/history/5x_small.png',
        '11x': '/images/history/11x_small.png',
        '50&50': '/images/history/50-50_small.png',
        'Loot Rush': '/images/history/loot_small.png',
        'Wild Time': '/images/history/wild_small.png'
      };
      
      historyItem.innerHTML = `<img src="${historyIcons[segmentName] || '/images/history/1x_small.png'}" alt="${segmentName}" />`;
      historyList.insertBefore(historyItem, historyList.firstChild);
      
      // Ограничиваем историю 10 элементами
      while (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild);
      }
    },
    
    // Сброс баланса
    resetBalance: function() {
      if (window.TEST_MODE) {
        window.userBalance = { ton: 999, stars: 999 };
        
        if (window.WildTimeCurrency) {
          window.WildTimeCurrency.setBalance('ton', 999);
          window.WildTimeCurrency.setBalance('stars', 999);
        }
        
        if (window.updateTestBalance) {
          window.updateTestBalance();
        }
        
        console.log('[WheelAdmin] Balance reset to 999');
      }
    },
    
    // Очистка истории
    clearHistory: function() {
      const historyList = document.getElementById('historyList');
      if (historyList) {
        historyList.innerHTML = '';
        console.log('[WheelAdmin] History cleared');
      }
    },
    
    // Переключение валюты
    switchCurrency: function() {
      if (window.WildTimeCurrency) {
        const current = window.WildTimeCurrency.current;
        const newCurrency = current === 'ton' ? 'stars' : 'ton';
        window.WildTimeCurrency.switch(newCurrency);
        console.log('[WheelAdmin] Currency switched to:', newCurrency);
      }
    }
  };
  
  // Экспортируем глобальные переменные для админ-панели
  window.addEventListener('DOMContentLoaded', () => {
    // Делаем переменные доступными глобально после инициализации
    setTimeout(() => {
      if (typeof userBalance !== 'undefined') window.userBalance = userBalance;
      if (typeof currentCurrency !== 'undefined') window.currentCurrency = currentCurrency;
      if (typeof omega !== 'undefined') window.setOmega ? window.setOmega(omega, { force: true }) : (window.omega = omega);
      if (typeof phase !== 'undefined') window.setPhase ? window.setPhase(phase, { force: true }) : (window.phase = phase);
      if (typeof currentAngle !== 'undefined') window.currentAngle = currentAngle;
      if (typeof addWinAmount !== 'undefined') window.addWinAmount = addWinAmount;
      if (typeof showWinNotification !== 'undefined') window.showWinNotification = showWinNotification;
      if (typeof showBonusNotification !== 'undefined') window.showBonusNotification = showBonusNotification;
      if (typeof start5050Bonus !== 'undefined') window.start5050Bonus = start5050Bonus;
      if (typeof startCountdown !== 'undefined') window.startCountdown = startCountdown;
      if (typeof updateTestBalance !== 'undefined') window.updateTestBalance = updateTestBalance;
      
      console.log('[WheelAdmin] ✅ Admin functions exported successfully');
    }, 1000);
  });
}

// ===== КОНЕЦ ПАТЧА =====

const WHEEL_ORDER = [
  '1.1x','1.5x','Loot Rush','1.1x','5x','50&50','1.1x',
  '1.5x','11x','1.1x','1.5x','Loot Rush','1.1x','5x','50&50',
  '1.1x','1.5x','1.1x','Wild Time','11x','1.5x','1.1x','5x','50&50'
];
// ===== SEGMENT KEY NORMALIZER (compat with old keys) =====
const SEGMENT_ALIAS = {
  '1.1x': '1.1x',
  '5x': '5x',
};

function normSeg(s) {
  return SEGMENT_ALIAS[s] || s;
}


const COLORS = {
  '1.1x'       : { fill: '#6f6a00', text: '#fff' },
  '1.5x'       : { fill: '#6e4200', text: '#fff' },
  '5x'       : { fill: '#0f5a2e', text: '#fff' },
  '11x'      : { fill: '#0a3f64', text: '#fff' },
  '50&50'    : { fill: '#d9197a', text: '#fff' },
  'Loot Rush': { fill: '#6c2bd9', text: '#fff' },
  'Wild Time': { fill: '#c5161d', text: '#fff' }
};

const IMAGES = {
  '1.1x'       : '/images/wheel/1.1x.webp',
  '1.5x'       : '/images/wheel/1.5x.webp',
  '5x'       : '/images/wheel/5x.webp',
  '11x'      : '/images/wheel/11x.webp',
  '50&50'    : '/images/wheel/50-50.webp',
  'Loot Rush': '/images/wheel/loot.webp',
  'Wild Time': '/images/wheel/wild.webp'
};


const BONUS_TEXT_IMAGES = (window.WHEEL_BONUS_TEXT_IMAGES || {
  '50&50'    : '/images/wheel/50-50Text.webp',
  'Loot Rush': '/images/wheel/LootRushText.webp',
  'Wild Time': '/images/wheel/WildTimeText.webp'
});

// Настройки позиционирования вертикального текста бонусов поверх секторов
// heightFactor: 1.0 == "точно в сектор"; >1.0 == немного заходит на соседние сектора
const BONUS_TEXT_STYLE_DEFAULT = {
  heightFactor: 1.22,
  radialPos: 0.22,
  alpha: 1.0
};

const LABELS = { 
  '1.1x':'1.1×','1.5x':'1.5x','5x':'5×','11x':'11×',
  '50&50':'50&50','Loot Rush':'Loot','Wild Time':'Wild' 
};

/* ===== DOM refs ===== */
let canvas, ctx, DPR = 1;
let userBalance = { ton: 0, stars: 0 };
let betOverlay, historyList, countdownBox, countNumEl;
let amountBtns = [], betTiles = [];

/* ===== wheel state ===== */
let currentAngle = 0;
let rafId = 0;
let lastTs = 0;

const SLICE_COUNT   = WHEEL_ORDER.length;
const SLICE_ANGLE   = (2*Math.PI)/SLICE_COUNT;
const POINTER_ANGLE = -Math.PI/2;

const IDLE_OMEGA = 0.35;
const FAST_OMEGA = 9.0;
let omega = IDLE_OMEGA;

let phase = 'betting';
let decel = null;
/* ===== STATE HELPERS (single source of truth + bonus-safe setters) ===== */
function setOmega(value, opts = {}) {
  const { force = false } = opts;
  if (window.__bonusLock?.active && !force) return;
  omega = value;
  window.omega = omega;
}
function setPhase(value, opts = {}) {
  const { force = false } = opts;
  if (window.__bonusLock?.active && !force && value !== 'bonus_waiting') return;
  phase = value;
  window.phase = phase;
}

// Keep window.* in sync initially
window.omega = omega;
window.phase = phase;
window.setOmega = setOmega;
window.setPhase = setPhase;

/* ===== SNAP / STOP ON SEGMENT (for bonuses/admin/console) ===== */
function __normAngle(a) {
  const TAU = Math.PI * 2;
  a = a % TAU;
  return a < 0 ? a + TAU : a;
}
function __angleForSegmentAtPointer(segmentName) {
  const idx = WHEEL_ORDER.indexOf(segmentName);
  if (idx < 0) return null;
  const segCenter = (idx + 0.5) * SLICE_ANGLE;
  // Want: currentAngle + segCenter == POINTER_ANGLE  (mod 2π)
  return __normAngle(POINTER_ANGLE - segCenter);
}

/**
 * Hard stop the wheel on a given segment (snap angle + freeze).
 * Returns true if segment exists.
 */
window.stopOnSegment = function stopOnSegment(segmentName) {
  const a = __angleForSegmentAtPointer(segmentName);
  if (a == null) {
    console.warn('[Wheel] stopOnSegment: unknown segment', segmentName);
    return false;
  }

  // Freeze wheel through bonus lock if present (uses setOmega/setPhase internally)
  if (typeof window.bonusLockStart === 'function') {
    window.bonusLockStart();
  } else {
    setOmega(0, { force: true });
    setPhase('bonus_waiting', { force: true });
  }

  currentAngle = a;
  window.currentAngle = currentAngle;

  try { drawWheel(currentAngle); } catch (_) {}
  console.log('[Wheel] ✅ Stopped on segment:', segmentName);
  return true;
};


/* ===== BONUS LOCK (freeze wheel until bonus ends) ===== */
window.__bonusLock = window.__bonusLock || { active: false, prevOmega: null, prevPhase: null };

window.bonusLockStart = function bonusLockStart() {
  if (window.__bonusLock.active) return;
  window.__bonusLock.active = true;
  window.__bonusLock.prevOmega = omega;
  window.__bonusLock.prevPhase = phase;

  // Hard freeze
  setOmega(0, { force: true });
  setPhase('bonus_waiting', { force: true });

  if (typeof window.stopCountdown === 'function') {
    try { window.stopCountdown(); } catch (_) {}
  }

  console.log('[Wheel] 🧊 Bonus lock ON');
};

window.bonusLockEnd = function bonusLockEnd(next = {}) {
  if (!window.__bonusLock.active) return;
  window.__bonusLock.active = false;

  const restorePhase = (next.phase ?? 'betting');
  const restoreOmega = (typeof next.omega === 'number' ? next.omega : IDLE_OMEGA);

  setPhase(restorePhase, { force: true });
  setOmega(restoreOmega, { force: true });

  window.__bonusLock.prevOmega = null;
  window.__bonusLock.prevPhase = null;

  console.log('[Wheel] 🔥 Bonus lock OFF');
};

/* ===== Ставки ===== */
const betsMap = new Map();
let currentAmount = 0.5;
let currentCurrency = 'ton';
let lastRoundResult = null;
let bettingLocked = false;

/* ===== 🔥 TEST MODE BALANCE ===== */
function initTestModeBalance() {
  if (!TEST_MODE) return;
  
  console.log('[Wheel] 🧪 Initializing test mode with 999 TON and 999 Stars');
  
  userBalance.ton = 999;
  userBalance.stars = 999;
  
  // Update currency system
  if (window.WildTimeCurrency) {
    window.WildTimeCurrency.setBalance('ton', 999);
    window.WildTimeCurrency.setBalance('stars', 999);
  }
  
  // Update deposit modules
  if (window.WTTonDeposit) {
    window.WTTonDeposit.setBalance(999);
  }
  if (window.WTStarsDeposit) {
    window.WTStarsDeposit.setBalance(999);
  }
  
  // Dispatch event
  window.dispatchEvent(new CustomEvent('balance:update', {
    detail: { ton: 999, stars: 999 }
  }));
  
  console.log('[Wheel] ✅ Test balance set:', userBalance);
}

/* ===== 🔥 DEDUCT BET AMOUNT ===== */
function deductBetAmount(amount, currency) {
  if (!TEST_MODE) return;
  
  console.log('[Wheel] 💸 Deducting bet:', amount, currency);
  
  if (currency === 'ton') {
    userBalance.ton = Math.max(0, userBalance.ton - amount);
  } else {
    userBalance.stars = Math.max(0, userBalance.stars - amount);
  }
  
  updateTestBalance();
}




/* =====  ADD WIN AMOUNT ===== */
async function addWinAmount(amount, currency) {
  console.log('[Wheel] 💰 Adding win:', amount, currency);
  
  // 🔥 TEST MODE - update local balance
  if (TEST_MODE) {
    if (currency === 'ton') {
      userBalance.ton += amount;
    } else {
      userBalance.stars += amount;
    }
    updateTestBalance();
    return;
  }
  
  // 🔥 PRODUCTION MODE - send to server
  try {
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'guest';
    
    if (userId === 'guest') {
      console.log('[Wheel] ⚠️ Guest user, win not saved');
      return;
    }
    
    const response = await fetch('/api/deposit-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        amount: amount,
        currency: currency,
        type: 'wheel_win',
        depositId: `bonus_win_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        notify: false
      })
    });

    const result = await response.json();
    
    if (result.ok) {
      console.log('[Wheel] ✅ Bonus win sent to server:', result);
    } else {
      console.error('[Wheel] Server rejected bonus win:', result.error);
    }
  } catch (error) {
    console.error('[Wheel] Failed to send bonus win to server:', error);
  }
}

// 🔥 Make sure it's exported globally
window.addWinAmount = addWinAmount;







/* =====  UPDATE TEST BALANCE UI ===== */
function updateTestBalance() {
  if (!TEST_MODE) return;
  
  // Update currency system
  if (window.WildTimeCurrency) {
    window.WildTimeCurrency.setBalance('ton', userBalance.ton);
    window.WildTimeCurrency.setBalance('stars', userBalance.stars);
  }
  
  // Update deposit modules
  if (window.WTTonDeposit) {
    window.WTTonDeposit.setBalance(userBalance.ton);
  }
  if (window.WTStarsDeposit) {
    window.WTStarsDeposit.setBalance(userBalance.stars);
  }
  
  // Dispatch event
  window.dispatchEvent(new CustomEvent('balance:update', {
    detail: { 
      ton: userBalance.ton, 
      stars: userBalance.stars,
      _testMode: true
    }
  }));
  
  console.log('[Wheel] 📊 Test balance updated:', userBalance);
}



/* ===== Предзагрузка изображений ===== */
const loadedImages = new Map();
const loadedBonusTextImages = new Map();
let imagesLoaded = false;

function preloadImageMap(sourceObj, targetMap, opts = {}) {
  const warn = opts.warn !== false;
  if (!sourceObj) return [];
  return Object.entries(sourceObj).map(([key, src]) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        targetMap.set(key, img);
        resolve();
      };
      img.onerror = () => {
        if (warn) console.warn(`Failed to load image: ${src}`);
        resolve();
      };
      if (!src) { resolve(); return; }
      img.src = src;
    });
  });
}

function preloadImages() {
  const tasks = [
    ...preloadImageMap(IMAGES, loadedImages),
    ...preloadImageMap(BONUS_TEXT_IMAGES, loadedBonusTextImages, { warn: false })
  ];

  return Promise.all(tasks).then(() => {
    imagesLoaded = true;
    console.log('[Wheel] ✅ All wheel images loaded');
  });
}



/* ===== Init ===== */

window.addEventListener('DOMContentLoaded', async () => {
  canvas       = document.getElementById('wheelCanvas');
  betOverlay   = document.getElementById('betOverlay');
  historyList  = document.getElementById('historyList');
  countdownBox = document.getElementById('countdown');
  countNumEl   = document.getElementById('countNum') || countdownBox?.querySelector('span');
  // Берём элементы ставок только из оверлея (чтобы не цеплять элементы с других страниц)
  const __betScope = betOverlay || document;
  amountBtns = Array.from(__betScope.querySelectorAll('.amount-btn'));
  betTiles   = Array.from(__betScope.querySelectorAll('.bet-tile'));

  if (!canvas) return;



  // 🔥 TEST MODE INIT
  if (TEST_MODE) {
    console.log('[Wheel] 🧪 TEST MODE ACTIVE');
    showTestModeNotification();
    
    // Initialize test balance
    setTimeout(() => {
      initTestModeBalance();
    }, 500);
  }

  await preloadImages();

  prepareCanvas();
  drawWheel(currentAngle);

  initBettingUI();

  // Sync with currency system
  setTimeout(() => {
    syncWithCurrencySystem();
  }, 150);

  lastTs = performance.now();
  rafId = requestAnimationFrame(tick);

  startCountdown(9);

  window.addEventListener('resize', () => {
    prepareCanvas();
    drawWheel(currentAngle);
  });
  
  checkHistoryVisibility();
});




/* ===== CURRENCY SYNC ===== */
function syncWithCurrencySystem() {
  if (!window.WildTimeCurrency) {
    console.warn('[Wheel] ⚠️ Currency system not ready yet');
    return;
  }

  const savedCurrency = window.WildTimeCurrency.current;
  console.log('[Wheel] 🔄 Syncing with currency system:', savedCurrency);
  
  currentCurrency = savedCurrency;
  updateAmountButtonsUI(savedCurrency);
  
  console.log('[Wheel] ✅ Synced! Currency:', currentCurrency, 'Amount:', currentAmount);
}

function updateAmountButtonsUI(currency) {
  console.log('[Wheel] 💰 Updating bet buttons for:', currency);
  
  if (currency === 'ton') {
    const tonAmounts = [0.1, 0.5, 1, 2.5];
    amountBtns.forEach((btn, index) => {
      if (index < tonAmounts.length) {
        const amount = tonAmounts[index];
        btn.dataset.amount = amount;
        btn.innerHTML = `
          <img src="/icons/ton.svg" alt="" class="amount-icon" />
          <span class="amount-value">${amount}</span>
        `;
      }
    });
    
    const firstBtn = amountBtns[0];
    if (firstBtn) {
      firstBtn.classList.add('active');
      currentAmount = 0.1;
    }
    
  } else {
    const starsAmounts = [1, 5, 10, 25];
    amountBtns.forEach((btn, index) => {
      if (index < starsAmounts.length) {
        const amount = starsAmounts[index];
        btn.dataset.amount = amount;
        btn.innerHTML = `
          <img src="/icons/stars.svg" alt="" class="amount-icon" />
          <span class="amount-value">${amount}</span>
        `;
      }
    });
    
    const firstBtn = amountBtns[0];
    if (firstBtn) {
      firstBtn.classList.add('active');
      currentAmount = 1;
    }
  }
  
  console.log('[Wheel] ✅ Buttons updated, currentAmount:', currentAmount);
}

// ===========================
// Bet pill helpers (amount + currency icon)
// ===========================
function getCurrencyIconSrc(currency) {
  return currency === 'stars' ? '/icons/stars.svg' : '/icons/ton.svg';
}

function ensureBetPill(tile, seg) {
  // remove legacy badge if it exists
  const legacy = tile.querySelector('.bet-badge');
  if (legacy) legacy.remove();

  let pill = tile.querySelector('.bet-pill');
  const isNew = !pill;
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'bet-pill';
    pill.innerHTML = `
      <img class="bet-pill__icon" alt="" />
      <span class="bet-pill__amount"></span>
    `;
    tile.appendChild(pill);
  }

  pill.dataset.segment = seg;
  return { pill, isNew };
}

function setBetPill(tile, seg, amount, currency) {
  const { pill, isNew } = ensureBetPill(tile, seg);
  const iconEl = pill.querySelector('.bet-pill__icon');
  const amountEl = pill.querySelector('.bet-pill__amount');

  if (iconEl) iconEl.src = getCurrencyIconSrc(currency);
  if (amountEl) amountEl.textContent = String(amount);

  pill.dataset.currency = currency;
  pill.hidden = false;

  // subtle "update" pop only when pill already exists
  if (!isNew) {
    pill.classList.remove('is-updating');
    // force reflow so animation can restart
    void pill.offsetWidth;
    pill.classList.add('is-updating');
  } else {
    pill.classList.remove('is-updating');
  }
}

window.updateCurrentAmount = function(amount) {
  currentAmount = amount;
  console.log('[Wheel] 🎯 Current amount updated:', currentAmount);
};

/* ===== Betting UI ===== */
/* ===== Betting UI ===== */
function initBettingUI(){
  // ===== AMOUNT BUTTONS WITH SELECTION HIGHLIGHT =====
  amountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (phase !== 'betting') return;
      
      // Убираем selected со всех кнопок
      amountBtns.forEach(b => {
        b.classList.remove('selected');
        b.removeAttribute('data-selected');
      });
      
      // Добавляем selected к текущей кнопке
      btn.classList.add('selected');
      btn.setAttribute('data-selected', 'true');
      
      currentAmount = parseFloat(btn.dataset.amount);
      
      console.log('[Wheel] 🎯 Amount selected:', currentAmount, currentCurrency);
    });
  });

  // Balance events
  window.addEventListener('balance:loaded', (e) => {
    if (TEST_MODE) return;
    
    if (e.detail) {
      userBalance.ton = e.detail.ton || 0;
      userBalance.stars = e.detail.stars || 0;
      console.log('[Wheel] Balance loaded:', userBalance);
    }
  });

  window.addEventListener('balance:update', (e) => {
    if (TEST_MODE && !e.detail._testMode) return;
    
    if (e.detail) {
      if (e.detail.ton !== undefined) userBalance.ton = e.detail.ton;
      if (e.detail.stars !== undefined) userBalance.stars = e.detail.stars;
      console.log('[Wheel] Balance updated:', userBalance);
    }
  });

  // Currency change
  window.addEventListener('currency:changed', (e) => {
    if (e.detail && e.detail.currency) {
      const newCurrency = e.detail.currency;
      console.log('[Wheel] 🔄 Currency changed to:', newCurrency);
      currentCurrency = newCurrency;
      updateAmountButtonsUI(newCurrency);

      // update icons on already placed bets
      document.querySelectorAll('.bet-pill').forEach((pill) => {
        const icon = pill.querySelector('.bet-pill__icon');
        if (icon) icon.src = getCurrencyIconSrc(newCurrency);
        pill.dataset.currency = newCurrency;
      });
    }
  });

  // 🔥 BET TILES WITH TEST MODE BALANCE CHECK
  betTiles.forEach(tile => {
    tile.addEventListener('click', async () => {
      if (bettingLocked) {
        console.log('[Wheel] ⛔ Betting locked - waiting for history update');
        tile.classList.add('insufficient-balance');
        setTimeout(() => tile.classList.remove('insufficient-balance'), 300);
        return;
      }
      
      if (phase !== 'betting') return;
      
      const seg = normSeg(tile.dataset.seg);
      const cur = betsMap.get(seg) || 0;
      
      // 🔥 Balance check
      const balance = userBalance[currentCurrency] || 0;
      
      if (balance < currentAmount) {
        tile.classList.add('insufficient-balance');
        setTimeout(() => tile.classList.remove('insufficient-balance'), 800);
        showInsufficientBalanceNotification();
        return;
      }
  
      // ✅ Add bet locally
      const next = currentCurrency === 'stars' 
        ? Math.round(cur + currentAmount)
        : +(cur + currentAmount).toFixed(2);
      betsMap.set(seg, next);
  
      // 🔥 SEND BET TO SERVER (not just in test mode!)
      if (!TEST_MODE) {
        try {
          const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'guest';
          
          // Don't process guest bets on server
          if (userId !== 'guest') {
            const response = await fetch('/api/deposit-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: userId,
                amount: -currentAmount, // negative = deduct
                currency: currentCurrency,
                type: 'wheel_bet',
                depositId: `bet_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: Date.now(),
                notify: false // don't send telegram message for bets
              })
            });
  
            const result = await response.json();
            
            if (!result.ok) {
              console.error('[Wheel] Server rejected bet:', result.error);
              // Rollback bet
              if (next === currentAmount) {
                betsMap.delete(seg);
              } else {
                betsMap.set(seg, cur);
              }
              showInsufficientBalanceNotification();
              return;
            }
  
            console.log('[Wheel] ✅ Bet sent to server:', result);
          }
        } catch (error) {
          console.error('[Wheel] Failed to send bet to server:', error);
          // Don't rollback - allow offline mode
        }
      }
      
      // 🔥 Deduct balance in test mode
      if (TEST_MODE) {
        deductBetAmount(currentAmount, currentCurrency);
      }
  
      setBetPill(tile, seg, next, currentCurrency);
      tile.classList.add('has-bet');
      setTimeout(() => tile.classList.remove('active'), 160);
    });
  });
}



/* ===== Canvas ===== */
function prepareCanvas(){
  DPR = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 420;
  const cssH = canvas.clientHeight|| 420;
  canvas.width  = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  ctx = canvas.getContext('2d');
  ctx.setTransform(DPR,0,0,DPR,0,0);
}







function drawWheel(angle=0){
  if (!ctx) return;
  const w = canvas.width / DPR, h = canvas.height / DPR;
  const cx = w/2, cy = h/2, R  = Math.min(cx,cy) - 6;

  ctx.save();
  ctx.clearRect(0,0,w,h);

  const g = ctx.createRadialGradient(cx,cy,R*0.25, cx,cy,R);
  g.addColorStop(0,'rgba(0,170,255,.12)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = g; 
  ctx.fillRect(0,0,w,h);

  ctx.translate(cx,cy);
  ctx.rotate(angle);

  for (let i=0; i<SLICE_COUNT; i++){
    const key = WHEEL_ORDER[i];
    const col = COLORS[key] || { fill:'#333', text:'#fff' };
    const a0 = i*SLICE_ANGLE, a1 = a0+SLICE_ANGLE;

    ctx.save();
    
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.arc(0,0,R,a0,a1,false);
    ctx.closePath();
    
    if (imagesLoaded && loadedImages.has(key)) {
      const img = loadedImages.get(key);
      
      ctx.save();
      ctx.clip();
      
      const mid = a0 + SLICE_ANGLE/2;
      ctx.rotate(mid);
      
      const imgWidth = R * 1.15;
      const imgHeight = R * Math.tan(SLICE_ANGLE/2) * 2.4;
      
      ctx.drawImage(
        img, 
        0, -imgHeight/2,
        imgWidth, imgHeight
      );
      
      ctx.restore();
    } else {
      ctx.fillStyle = col.fill; 
      ctx.fill();
      
      const mid = a0 + SLICE_ANGLE/2;
      ctx.rotate(mid);
      ctx.textAlign='right';
      ctx.textBaseline='middle';
      ctx.fillStyle = col.text;
      ctx.font='bold 16px mf, system-ui, sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(LABELS[key] || key, R-16, 0);
      ctx.shadowBlur = 0;
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.stroke();
    
    ctx.restore();
  }


// --- Bonus vertical text overlays (рисуем поверх всех секторов; клип только по кругу)
if (imagesLoaded && loadedBonusTextImages && loadedBonusTextImages.size) {
  const TAU = Math.PI * 2;
  const sliceThickness = R * Math.tan(SLICE_ANGLE / 2) * 2;

const style = (window.WHEEL_BONUS_TEXT_STYLE && typeof window.WHEEL_BONUS_TEXT_STYLE === 'object')
  ? window.WHEEL_BONUS_TEXT_STYLE
  : BONUS_TEXT_STYLE_DEFAULT;

const heightFactor = (typeof style.heightFactor === 'number')
  ? style.heightFactor
  : BONUS_TEXT_STYLE_DEFAULT.heightFactor;
const radialPos = (typeof style.radialPos === 'number')
  ? style.radialPos
  : BONUS_TEXT_STYLE_DEFAULT.radialPos;
const alpha = (typeof style.alpha === 'number')
  ? style.alpha
  : BONUS_TEXT_STYLE_DEFAULT.alpha;

  const textHBase = sliceThickness * heightFactor;

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;

  for (let i = 0; i < SLICE_COUNT; i++) {
    const key = WHEEL_ORDER[i];
    if (!loadedBonusTextImages.has(key)) continue;

    const img = loadedBonusTextImages.get(key);
    if (!img) continue;

    const mid = i * SLICE_ANGLE + SLICE_ANGLE / 2;
    const aspect = (img.width && img.height) ? (img.width / img.height) : 0.25;

    const textH = textHBase;
    const textW = textH * aspect;

    ctx.save();
    ctx.rotate(mid);

    // x — насколько далеко от центра (0..R). y — центрируем по высоте.
    const x = R * radialPos;
    const y = -textH / 2;

    ctx.drawImage(img, x, y, textW, textH);
    ctx.restore();
  }

  ctx.globalAlpha = prevAlpha;
  ctx.restore();
}

  ctx.beginPath(); 
  ctx.arc(0,0,20,0,2*Math.PI);
  ctx.fillStyle='#121212'; 
  ctx.fill();
  ctx.lineWidth=2; 
  ctx.strokeStyle='rgba(255,255,255,.25)'; 
  ctx.stroke();

  ctx.restore();
}







/* ===== Animation loop ===== */
function tick(ts){
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.033, (ts - lastTs)/1000);
  lastTs = ts;

  if (phase === 'decelerate' && decel){
    const elapsed = ts - decel.t0;
    const t = Math.min(1, elapsed / decel.dur);
    const eased = easeOutCubic(t);
    currentAngle = decel.start + (decel.end - decel.start) * eased;

    if (t >= 1){
      currentAngle = decel.end;
      bettingLocked = true;
      const typeFinished = decel.resultType;
      const resolveFn = decel.resolve;
      decel = null;

      // 🔥 NEW: Set to result_waiting instead of betting
      setPhase('result_waiting');
      setOmega(0); // Keep wheel stopped
      setBetPanel(false); // Keep panel disabled

      if (typeFinished) {
        checkBetsAndShowResult(typeFinished);
        
        // 🔥 SPECIAL HANDLING FOR 50/50 BONUS
        if (typeFinished === '50&50') {
          setTimeout(async () => {
            console.log('[Wheel] 🎰 Starting 50/50 bonus...');
            const betOn5050 = betsMap.get('50&50') || 0;

            // 🔥 НОВАЯ ЛОГИКА: проверка ставки и автопереключение
            if (betOn5050 > 0 && window.BonusManager) {
              // 🎯 Есть ставка - используем BonusManager
              // Автоматически переключит на Wheel если нужно
              // Заблокирует навигацию
              await window.BonusManager.startBonus('50&50', betOn5050);
            } else {
              // 🎯 Нет ставки - показываем только если на wheel
              if (window.BonusManager && !window.BonusManager.isOnWheelPage()) {
                console.log('[Wheel] ⏭️ No bet on 50&50, skipping bonus on other page');
                pushHistory(typeFinished);
                clearBets();
                setPhase('betting', { force: true });
                setOmega(IDLE_OMEGA, { force: true });
                startCountdown(9);
                return;
              }

              // Обычный запуск (без BonusManager)
              if (window.bonusLockStart) {
        const wp = document.getElementById('wheelPage');
        if (wp && wp.classList.contains('page-active')) window.bonusLockStart();
      }

              if (window.start5050Bonus) {
                await window.start5050Bonus(betOn5050);
              }

              if (window.bonusLockEnd) {
                window.bonusLockEnd({ phase: 'betting', omega: IDLE_OMEGA });
              }
            }

            pushHistory(typeFinished);
            clearBets();
            setPhase('betting', { force: true });
            setOmega(IDLE_OMEGA, { force: true });
            startCountdown(9);
          }, 2000);
        } else if (typeFinished === 'Loot Rush') {
          setTimeout(async () => {
            console.log('[Wheel] 🎁 Starting Loot Rush bonus...');
            const betOnLootRush = betsMap.get('Loot Rush') || 0;

            // 🔥 НОВАЯ ЛОГИКА: проверка ставки и автопереключение
            if (betOnLootRush > 0 && window.BonusManager) {
              await window.BonusManager.startBonus('Loot Rush', betOnLootRush);
            } else {
              if (window.BonusManager && !window.BonusManager.isOnWheelPage()) {
                console.log('[Wheel] ⏭️ No bet on Loot Rush, skipping bonus on other page');
                pushHistory(typeFinished);
                clearBets();
                setPhase('betting', { force: true });
                setOmega(IDLE_OMEGA, { force: true });
                startCountdown(9);
                return;
              }

              if (window.bonusLockStart) {
        const wp = document.getElementById('wheelPage');
        if (wp && wp.classList.contains('page-active')) window.bonusLockStart();
      }

              if (window.startLootRushBonus) {
                await window.startLootRushBonus(betOnLootRush);
              } else {
                console.warn('[Wheel] ⚠️ startLootRushBonus is not defined');
              }

              if (window.bonusLockEnd) {
                window.bonusLockEnd({ phase: 'betting', omega: IDLE_OMEGA });
              }
            }

            pushHistory(typeFinished);
            clearBets();
            setPhase('betting', { force: true });
            setOmega(IDLE_OMEGA, { force: true });
            startCountdown(9);
          }, 2000);
	        } else if (typeFinished === 'Wild Time') {
	          setTimeout(async () => {
	            console.log('[Wheel] 🐾 Starting Wild Time bonus...');
	            const betOnWildTime = betsMap.get('Wild Time') || 0;

	            // 🔥 НОВАЯ ЛОГИКА: пробуем BonusManager (если поддерживает), иначе локальный бонус wildtime.js
	            if (betOnWildTime > 0 && window.BonusManager && typeof window.BonusManager.startBonus === 'function') {
	              try {
	                await window.BonusManager.startBonus('Wild Time', betOnWildTime);
	              } catch (e) {
	                console.warn('[Wheel] ⚠️ BonusManager Wild Time failed — fallback to local bonus', e);
	                if (window.startWildTimeBonus) {
	                  await window.startWildTimeBonus(betOnWildTime);
	                } else {
	                  console.warn('[Wheel] ⚠️ startWildTimeBonus is not defined');
	                }
	              }
	            } else {
	              if (window.BonusManager && typeof window.BonusManager.isOnWheelPage === 'function' && !window.BonusManager.isOnWheelPage()) {
	                console.log('[Wheel] ⏭️ No bet on Wild Time, skipping bonus on other page');
	                pushHistory(typeFinished);
	                clearBets();
	                setPhase('betting', { force: true });
	                setOmega(IDLE_OMEGA, { force: true });
	                startCountdown(9);
	                return;
	              }

	              if (window.bonusLockStart) {
	        const wp = document.getElementById('wheelPage');
	        if (wp && wp.classList.contains('page-active')) window.bonusLockStart();
	      }

	              if (window.startWildTimeBonus) {
	                await window.startWildTimeBonus(betOnWildTime);
	              } else {
	                console.warn('[Wheel] ⚠️ startWildTimeBonus is not defined');
	              }

	              if (window.bonusLockEnd) {
	                window.bonusLockEnd({ phase: 'betting', omega: IDLE_OMEGA });
	              }
	            }

	            pushHistory(typeFinished);
	            clearBets();
	            setPhase('betting', { force: true });
	            setOmega(IDLE_OMEGA, { force: true });
	            startCountdown(9);
	          }, 2000);
	        } else {
          // 🔥 NORMAL RESULT - NO BONUS
          setTimeout(() => {
            pushHistory(typeFinished);
            clearBets();
            setPhase('betting');
            setOmega(IDLE_OMEGA);
            startCountdown(9);
          }, 3000);
        }
      } else {
        clearBets();
        setPhase('betting');
        setOmega(IDLE_OMEGA);
        startCountdown(9);
      }

      if (resolveFn) resolveFn();
    }
  } else if (phase === 'betting' || phase === 'accelerate') {
    currentAngle += omega * dt;
  }
  // 🔥 NEW: Keep wheel frozen during result_waiting and bonus_waiting
  else if (phase === 'result_waiting' || phase === 'bonus_waiting') {
    // Do nothing - wheel stays at current angle
  }

  drawWheel(currentAngle);
  rafId = requestAnimationFrame(tick);
}







/* ===== Check bets and show result ===== */
async function checkBetsAndShowResult(resultType) {
  resultType = normSeg(resultType);

  const totalBets = Array.from(betsMap.values()).reduce((sum, val) => sum + val, 0);
  
  const isBonusRound = ['50&50', 'Loot Rush', 'Wild Time'].includes(resultType);
  
  if (isBonusRound) {
    console.log('[Wheel] 🎰 BONUS ROUND!', resultType);
    
    // 🔥 Используем BonusManager
    if (window.BonusManager && window.BonusManager.isOnWheelPage()) {
      showBonusNotification(resultType);
    }
    
    if (resultType === '50&50') {
      return;
    }
    
    return;
  }
  
  if (totalBets <= 0) {
    console.log('[Wheel] No bets placed');
    return;
  }

  const betOnResult = betsMap.get(resultType) || 0;
  
  if (betOnResult > 0) {
    const multiplier = getMultiplier(resultType);
    const winAmount = betOnResult * multiplier;
    
    console.log('[Wheel] 🎉 WIN!', {
      result: resultType,
      betAmount: betOnResult,
      multiplier,
      winAmount,
      totalBets,
      testMode: TEST_MODE
    });
    
    // 🔥 SEND WIN TO SERVER (production mode)
    if (!TEST_MODE) {
      try {
        const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'guest';
        
        if (userId !== 'guest') {
          const response = await fetch('/api/deposit-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: userId,
              amount: winAmount, // positive = add
              currency: currentCurrency,
              type: 'wheel_win',
              depositId: `win_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
              notify: false, // don't send telegram message
              roundId: `round_${Date.now()}`,
              bets: {
                result: resultType,
                betAmount: betOnResult,
                multiplier: multiplier,
                winAmount: winAmount
              }
            })
          });

          const result = await response.json();
          
          if (result.ok) {
            console.log('[Wheel] ✅ Win sent to server:', result);
          } else {
            console.error('[Wheel] Server rejected win:', result.error);
          }
        }
      } catch (error) {
        console.error('[Wheel] Failed to send win to server:', error);
      }
    }
    
    // 🔥 Add win to balance in test mode
    if (TEST_MODE) {
      addWinAmount(winAmount, currentCurrency);
    }
    
    showWinNotification(winAmount);
  } else {
    console.log('[Wheel]  LOSS', {
      result: resultType,
      yourBets: Array.from(betsMap.entries()).map(([k,v]) => `${k}: ${v}`),
      totalLost: totalBets,
      testMode: TEST_MODE
    });
  }
}
 






function getMultiplier(type) {
  const multipliers = {
    '1.1x': 1.1,
    '1.5x': 1.5,
    '5x': 5,
    '11x': 11,
    '50&50': 2,
    'Loot Rush': 5,
    'Wild Time': 10
  };
  return multipliers[type] || 1;
}




  
function showWinNotification(winAmount) {
  // 🔥 ИЗМЕНЕНО: проверка через BonusManager
  if (window.BonusManager && !window.BonusManager.isOnWheelPage()) {
    console.log('[Wheel] ⚠️ Win notification skipped - not on wheel page');
    return;
  }

  // Fallback (если BonusManager не подключён)
  if (!window.BonusManager) {
    const wheelPage = document.getElementById('wheelPage');
    const isWheelActive = wheelPage?.classList.contains('page-active');
    if (!isWheelActive) {
      console.log('[Wheel] ⚠️ Win notification skipped - not on wheel page');
      return;
    }
  }

  const existing = document.getElementById('win-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'win-toast';

  const formattedAmount = currentCurrency === 'stars'
    ? Math.round(winAmount)
    : winAmount.toFixed(2);

  const iconSrc = currentCurrency === 'ton' ? '/icons/ton.svg' : '/icons/stars.svg';

  toast.innerHTML = `
    <span>+${formattedAmount}</span>
    <img src="${iconSrc}" style="width: 22px; height: 22px;" />
  `;

  (document.getElementById('wheelPage') || document.body).appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'winSlideUp 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

function showInsufficientBalanceNotification() {
  const wheelPage = document.getElementById('wheelPage');
  const isWheelActive = wheelPage?.classList.contains('page-active');
  
  if (!isWheelActive) {
    console.log('[Wheel] ⚠️ Insufficient balance notification skipped - not on wheel page');
    return;
  }
  
  const existing = document.getElementById('insufficient-balance-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.id = 'insufficient-balance-toast';
  
  // 🔥 FIXED: Lowered position for fullscreen mode
  toast.style.cssText = `
    position: fixed;
    top: 120px;
    left: 50%;
    transform: translateX(-50%) translateY(-80px);
    z-index: 10000;
    background: linear-gradient(135deg, rgba(127, 29, 29, 0.15), rgba(153, 27, 27, 0.1));
    backdrop-filter: blur(16px);
    border: 1px solid rgba(185, 28, 28, 0.2);
    border-radius: 18px;
    padding: 14px 24px;
    font-size: 14px;
    font-weight: 600;
    color: #ef4444;
    animation: insufficientJellyIn 0.7s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
    pointer-events: none;
  `;
  toast.textContent = 'Insufficient balance';
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'insufficientJellyOut 0.5s cubic-bezier(0.6, -0.28, 0.735, 0.045) forwards';
    setTimeout(() => toast.remove(), 500);
  }, 2000);
}



// (removed duplicate showBonusNotification - superseded by clean version below)
function showTestModeNotification() {
  const existing = document.getElementById('test-mode-toast');
  if (existing) return;
  
  const toast = document.createElement('div');
  toast.id = 'test-mode-toast';
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.1));
    backdrop-filter: blur(16px);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 16px;
    padding: 12px 20px;
    font-size: 13px;
    font-weight: 600;
    color: #fbbf24;
    animation: testModeSlideIn 0.5s ease forwards;
    pointer-events: none;
  `;
  toast.textContent = '🧪 Test Mode: Unlimited Balance';
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'testModeSlideIn 0.3s ease reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/* ===== Countdown ===== */
let cInt = null;
let isCountdownActive = false;

function startCountdown(sec=9){
  if (!countdownBox || !countNumEl) return;
  if (isCountdownActive) return;

  stopCountdown();
  isCountdownActive = true;
  setPhase('betting');
  setOmega(IDLE_OMEGA);
  setBetPanel(true);

  countdownBox.classList.add('visible');
  let left = sec;
  countNumEl.textContent = String(left);

  cInt = setInterval(async () => {
    left--;
    
    if (left >= 0) {
      countNumEl.textContent = String(left);
      countdownBox.classList.remove('pulse'); 
      void countdownBox.offsetWidth; 
      countdownBox.classList.add('pulse');
    }
    
    if (left <= 0) {
      stopCountdown();

      // 🔥 Hide countdown during spin
      if (countdownBox) {
        countdownBox.classList.remove('visible');
      }

      setPhase('accelerate');
      setBetPanel(false);
      
      try {
        await accelerateTo(FAST_OMEGA, 1200);
        const { sliceIndex, type } = await fetchRoundOutcome();
        const dur = 5000 + Math.floor(Math.random()*2000);
        await decelerateToSlice(sliceIndex, dur, 4, type);
      } catch (error) {
        console.error('[Wheel] Error during spin:', error);
        setPhase('betting');
        setOmega(IDLE_OMEGA);
        setBetPanel(true);
        isCountdownActive = false;
        startCountdown(9);
      }
    }
  }, 1000);
}

function stopCountdown(){
  if (cInt) {
    clearInterval(cInt);
    cInt = null;
  }
  isCountdownActive = false;
}

/* ===== Accel/Decel ===== */
function accelerateTo(targetOmega=FAST_OMEGA, ms=1200){
  return new Promise(res=>{
    const start = omega;
    const t0 = performance.now();
    
    const step = ()=>{
      const elapsed = performance.now() - t0;
      const t = Math.min(1, elapsed / ms);
      const eased = easeInQuad(t);
      setOmega(start + (targetOmega - start) * eased);
      
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setOmega(targetOmega);
        res();
      }
    };
    requestAnimationFrame(step);
  });
}

function decelerateToSlice(sliceIndex, ms=6000, extraTurns=4, typeForHistory=null){
  return new Promise(resolve=>{
    // ✅ normalize server type (supports old keys)
    const serverType = typeForHistory ? normSeg(typeForHistory) : null;

    // ✅ auto-fix “off by one” if serverType matches neighbor
    let idx = sliceIndex;

    if (serverType && WHEEL_ORDER[idx] !== serverType) {
      const idxMinus = (idx - 1 + SLICE_COUNT) % SLICE_COUNT;
      const idxPlus  = (idx + 1) % SLICE_COUNT;

      if (WHEEL_ORDER[idxMinus] === serverType) idx = idxMinus;
      else if (WHEEL_ORDER[idxPlus] === serverType) idx = idxPlus;
      else idx = pickSliceIndexByLabel(serverType); // fallback: any same-type sector
    }

    const normalizedCurrent = currentAngle % (2 * Math.PI);
    const sliceCenter = idx * SLICE_ANGLE + SLICE_ANGLE / 2;

    let deltaToTarget = POINTER_ANGLE - normalizedCurrent - sliceCenter;
    while (deltaToTarget > Math.PI) deltaToTarget -= 2 * Math.PI;
    while (deltaToTarget < -Math.PI) deltaToTarget += 2 * Math.PI;

    const endAngle = currentAngle + deltaToTarget + extraTurns * 2 * Math.PI;

    const landedType = WHEEL_ORDER[idx];

    decel = {
      start: currentAngle,
      end: endAngle,
      t0: performance.now(),
      dur: ms,
      resolve,
      resultType: landedType,
      serverType,
      sliceIndex: idx
    };

    setPhase('decelerate');
    setOmega(0);
  });
}

/* ===== Manual bonus helper: stop ON 50&50 then run bonus ===== */
function pickSliceIndexByLabel(label) {
  const indices = [];
  for (let i = 0; i < WHEEL_ORDER.length; i++) {
    if (WHEEL_ORDER[i] === label) indices.push(i);
  }
  if (!indices.length) return 0;

  // берём "ближайший" по углу (чтобы докрутка была логичной)
  const normalizedCurrent = currentAngle % (2 * Math.PI);
  let best = indices[0];
  let bestAbs = Infinity;

  for (const idx of indices) {
    const sliceCenter = idx * SLICE_ANGLE + SLICE_ANGLE / 2;
    let delta = POINTER_ANGLE - normalizedCurrent - sliceCenter;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const abs = Math.abs(delta);
    if (abs < bestAbs) { bestAbs = abs; best = idx; }
  }
  return best;
}

window.run5050BonusManual = async function run5050BonusManual(betAmount = 0) {
  // 1) докрутить колесо до 50&50
  const idx = pickSliceIndexByLabel('50&50');

  // короткая докрутка, чтобы было видно, что оно реально встало на сектор
  await decelerateToSlice(idx, 1400, 1, '50&50');

  // 2) заморозить и запустить бонус
  if (window.bonusLockStart) {
        const wp = document.getElementById('wheelPage');
        if (wp && wp.classList.contains('page-active')) window.bonusLockStart();
      }

  try {
    if (window.start5050Bonus) {
      await window.start5050Bonus(betAmount);
    }
  } finally {
    // 3) вернуть колесо в обычный режим
    if (window.bonusLockEnd) window.bonusLockEnd({ phase: 'betting', omega: IDLE_OMEGA });
  }
};


/* ===== Server outcome ===== */
async function fetchRoundOutcome(){
  try{
    const r = await fetch('/api/round/start', { 
      cache: 'no-store',
      method: 'GET'
    });
    
    if (!r.ok) {
      console.error('[Wheel] Server returned error:', r.status);
      throw new Error('Server error');
    }
    
    const data = await r.json();
    
    if (data?.ok && typeof data.sliceIndex === 'number' && data.type) {
      return data;
    }
    
    throw new Error('Invalid response');
  } catch(e) {
    console.warn('[Wheel] Failed to fetch round, using fallback:', e);
  }
  
  const sliceIndex = Math.floor(Math.random() * SLICE_COUNT);
  const type = WHEEL_ORDER[sliceIndex];
  return { sliceIndex, type, ok: true };
}

/* ===== Helpers ===== */
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function easeInQuad(t){ return t*t; }

/* ===== Bet panel modes ===== */
function setBetPanel(enabled){
  // betOverlay может быть объявлен выше
  const overlay = (typeof betOverlay !== 'undefined' && betOverlay)
    ? betOverlay
    : document.querySelector('.bet-overlay');

  if (overlay) overlay.classList.toggle('disabled', !enabled);

  const app = document.querySelector('.app');
  if (app){
    // Ставки открыты → панель поднимается (is-betting)
    app.classList.toggle('is-betting', !!enabled);
    // Раунд крутится → панель опускается/темнеет (is-spinning)
    app.classList.toggle('is-spinning', !enabled);
  }

  // Лочим скролл только во время фазы ставок (чтобы не нужно было скроллить вниз)
  document.body.classList.toggle('wheel-lock', !!enabled);
}


/* ===== 🔥 HISTORY - ONLY ON WHEEL PAGE ===== */
function checkHistoryVisibility() {
  const wheelPage = document.getElementById('wheelPage');
  const historySection = document.querySelector('.history');
  
  if (!historySection) return;
  
  // Создаем observer для отслеживания видимости страницы колеса
  const observer = new MutationObserver(() => {
    const isWheelActive = wheelPage?.classList.contains('page-active');
    
    if (isWheelActive) {
      historySection.style.display = 'block';
    } else {
      historySection.style.display = 'none';
    }
  });
  
  // Наблюдаем за изменениями класса
  if (wheelPage) {
    observer.observe(wheelPage, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  
  // Начальная проверка
  const isWheelActive = wheelPage?.classList.contains('page-active');
  historySection.style.display = isWheelActive ? 'block' : 'none';
  
  console.log('[Wheel] 📜 History visibility tracking enabled');
}

function pushHistory(typeKey){
  if (!historyList) return;
  
  const historyIcons = {
    '1.1x': '/images/history/1.1x_small.png',
    '1.5x': '/images/history/1.5x_small.png',
    '5x': '/images/history/5x_small.png',
    '11x': '/images/history/11x_small.png',
    '50&50': '/images/history/50-50_small.png',
    'Loot Rush': '/images/history/loot_small.png',
    'Wild Time': '/images/history/wild_small.png'
  };
  
  const item = document.createElement('div');
  item.className = 'history-item';
  
  const iconSrc = historyIcons[typeKey] || '/images/history/1.1x_small.png';
  console.log('[History] Adding:', typeKey, '| Path:', iconSrc);
  
  item.innerHTML = `<img src="${iconSrc}" alt="${typeKey}" onerror="console.error('❌ Failed to load:', this.src)" />`;
  
  historyList.prepend(item);
  
  const all = historyList.querySelectorAll('.history-item');
  if (all.length > 20) all[all.length-1].remove();
  
  // 🔥 Разблокируем ставки после добавления в историю
  bettingLocked = false;
  console.log('[Wheel] ✅ Betting unlocked - history updated');
}

function clearBets(){
  console.log('[Wheel] 🧹 Clearing all bets');
  betsMap.clear();
  betTiles.forEach(tile=>{
    const pill = tile.querySelector('.bet-pill');
    if (pill) pill.remove();
    tile.classList.remove('active', 'has-bet');
  });
}

/* ===== Export для других модулей ===== */
window.WheelGame = {
  getCurrentCurrency: () => currentCurrency,
  getCurrentAmount: () => currentAmount,
  hasBets: () => {
    const total = Array.from(betsMap.values()).reduce((sum, val) => sum + val, 0);
    return total > 0;
  },
  clearBets: clearBets,
  
  // 🔥 FIXED: addWinAmount now works in both test and production
  addWinAmount: async function(amount, currency) {
    console.log('[WheelGame] 💰 Adding win via export:', amount, currency);
    await addWinAmount(amount, currency);
  }
};

console.log('[Wheel] ✅ WheelGame exported with fixed addWinAmount');

/* ===== Inject Animation Styles ===== */
if (!document.getElementById('wheel-animations')) {
  const style = document.createElement('style');
  style.id = 'wheel-animations';
  style.textContent = `
    /* Win notification */
    @keyframes winJellyOut {
      0% { 
        transform: translateX(-50%) translateY(0) scale(1);
        opacity: 1;
      }
      100% { 
        transform: translateX(-50%) translateY(-80px) scale(0.7);
        opacity: 0;
      }
    }
    
    /* Insufficient balance */
    @keyframes insufficientJellyIn {
      0% { 
        transform: translateX(-50%) translateY(-80px) scale(0.4);
        opacity: 0;
      }
      50% { 
        transform: translateX(-50%) translateY(0) scale(1.06);
        opacity: 1;
      }
      65% { 
        transform: translateX(-50%) translateY(0) scale(0.96);
      }
      80% { 
        transform: translateX(-50%) translateY(0) scale(1.02);
      }
      100% { 
        transform: translateX(-50%) translateY(0) scale(1);
        opacity: 1;
      }
    }
    
    @keyframes insufficientJellyOut {
      0% { 
        transform: translateX(-50%) translateY(0) scale(1);
        opacity: 1;
      }
      100% { 
        transform: translateX(-50%) translateY(-60px) scale(0.85);
        opacity: 0;
      }
    }
    
    /* Bonus trigger */
    @keyframes bonusTrigger {
      0% { 
        transform: translate(-50%, -50%) scale(0) rotate(-180deg);
        opacity: 0;
      }
      50% { 
        transform: translate(-50%, -50%) scale(1.15) rotate(10deg);
        opacity: 1;
      }
      70% {
        transform: translate(-50%, -50%) scale(0.95) rotate(-5deg);
      }
      85% {
        transform: translate(-50%, -50%) scale(1.05) rotate(2deg);
      }
      100% { 
        transform: translate(-50%, -50%) scale(1) rotate(0deg);
        opacity: 1;
      }
    }
    
    @keyframes bonusTriggerOut {
      0% { 
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      }
      100% { 
        transform: translate(-50%, -50%) scale(1.5);
        opacity: 0;
      }
    }
    
    /* Test mode notification */
    @keyframes testModeSlideIn {
      from { 
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
      to { 
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    
    /* History visibility transition */
    .history {
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    
    .history[style*="display: none"] {
      opacity: 0;
      transform: translateY(-10px);
      pointer-events: none;
    }
    
    .history[style*="display: block"] {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);
}
//  BONUS FIX



// Export functions for bonus



window.WheelGame.getCurrentCurrency = function() {
  return window.currentCurrency || 'ton';
};

console.log('[Wheel] ✅ Bonus integration ready');

// wheel.js - NOTIFICATION FUNCTIONS - Telegram Style

/* ===== 🔥 WIN NOTIFICATION - CLEAN STYLE ===== */
function showWinNotification(winAmount) {
  // 🔥 ИЗМЕНЕНО: проверка через BonusManager
  if (window.BonusManager && !window.BonusManager.isOnWheelPage()) {
    console.log('[Wheel] ⚠️ Win notification skipped - not on wheel page');
    return;
  }

  // Fallback (если BonusManager не подключён)
  if (!window.BonusManager) {
    const wheelPage = document.getElementById('wheelPage');
    const isWheelActive = wheelPage?.classList.contains('page-active');
    if (!isWheelActive) {
      console.log('[Wheel] ⚠️ Win notification skipped - not on wheel page');
      return;
    }
  }

  const existing = document.getElementById('win-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'win-toast';

  const formattedAmount = currentCurrency === 'stars'
    ? Math.round(winAmount)
    : winAmount.toFixed(2);

  const iconSrc = currentCurrency === 'ton' ? '/icons/ton.svg' : '/icons/stars.svg';

  toast.innerHTML = `
    <span>+${formattedAmount}</span>
    <img src="${iconSrc}" style="width: 22px; height: 22px;" />
  `;

  (document.getElementById('wheelPage') || document.body).appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'winSlideUp 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

/* ===== 🔥 INSUFFICIENT BALANCE - CLEAN ===== */
function showInsufficientBalanceNotification() {
  const wheelPage = document.getElementById('wheelPage');
  const isWheelActive = wheelPage?.classList.contains('page-active');
  
  if (!isWheelActive) return;
  
  const existing = document.getElementById('insufficient-balance-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.id = 'insufficient-balance-toast';
  toast.textContent = 'Insufficient balance';
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'errorFadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/* ===== 🔥 BONUS NOTIFICATION - CLEAN ===== */
function showBonusNotification(bonusType) {
  // 🔥 ИЗМЕНЕНО: проверка через BonusManager
  if (window.BonusManager && !window.BonusManager.isOnWheelPage()) {
    console.log('[Bonus] ⚠️ Bonus notification skipped - not on wheel page');
    return;
  }

  // Fallback (если BonusManager не подключён)
  if (!window.BonusManager) {
    const wheelPage = document.getElementById('wheelPage');
    const isWheelActive = wheelPage?.classList.contains('page-active');
    if (!isWheelActive) {
      console.log('[Bonus] ⚠️ Bonus notification skipped - not on wheel page');
      return;
    }
  }

  const existing = document.getElementById('bonus-trigger-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'bonus-trigger-toast';

  toast.innerHTML = `
    <div>${bonusType}</div>
    <div>Bonus Round</div>
  `;

  (document.getElementById('wheelPage') || document.body).appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'bonusFadeOut 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, 1500);
}

/* ===== 🔥 TEST MODE NOTIFICATION ===== */
function showTestModeNotification() {
  const existing = document.getElementById('test-mode-toast');
  if (existing) return;
  
  const toast = document.createElement('div');
  toast.id = 'test-mode-toast';
  toast.textContent = '🧪 Test Mode: Unlimited Balance';
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/* ===== 🔥 CHECK BETS AND SHOW RESULT - SIMPLIFIED ===== */
/* ===== 🔥 MULTIPLIER HELPER ===== */
function getMultiplier(type) {
  const multipliers = {
    '1.1x': 1.1,
    '1.5': 1.5,
    '5x': 5,
    '11x': 11,
    '50&50': 2,
    'Loot Rush': 5,
    'Wild Time': 10
  };
  return multipliers[type] || 1;
}


// ===== 50/50 BONUS: make sure it can start from wheel =====
(function () {
  function __wheelBonusMount() {
    // Mount all bonus UI inside wheelPage so it isn't visible on other pages
    const wheelPage = document.getElementById('wheelPage');
    return wheelPage || document.body;
  }

  function ensureBonusOverlay() {
    let overlay = document.getElementById('bonus5050Overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'bonus5050Overlay';
    overlay.className = 'bonus-overlay';
    overlay.innerHTML = `
      <div class="bonus-overlay__blur-backdrop"></div>
      <div class="bonus-container"></div>
    `;
    __wheelBonusMount().appendChild(overlay);
    return overlay;
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureBonusClass() {
    if (window.Bonus5050) return;

    // попробуем самые частые пути
    const candidates = ['/js/bonus-5050.js', '/public/js/bonus-5050.js', '/bonus-5050.js'];
    for (const src of candidates) {
      try {
        await loadScriptOnce(src);
        if (window.Bonus5050) return;
      } catch (e) {}
    }
    throw new Error('Bonus5050 class not loaded (bonus-5050.js path wrong)');
  }

  // ✅ вот этого как раз не хватало на обычном флоу колеса
  window.start5050Bonus = window.start5050Bonus || async function start5050Bonus(betAmount = 0) {
    const overlay = ensureBonusOverlay();
    const container = overlay.querySelector('.bonus-container') || overlay;

    await ensureBonusClass();

    return await new Promise((resolve) => {
      const bonus = new window.Bonus5050(container, {
        boomSrc: 'images/boom.webp',
        particlesSrc: 'images/boomparticles.webp',
        onComplete: (xStr) => {
          // ✅ Начисление выигрыша за бонус 50/50 + уведомление о выигрыше
          const mult = parseFloat(String(xStr).replace('x',''));
          if (betAmount > 0 && Number.isFinite(mult)) {
            const rawWin = betAmount * mult;
            const winAmount = (currentCurrency === 'stars')
              ? Math.round(rawWin)
              : +rawWin.toFixed(2);

            // Toast (только на странице колеса — внутри showWinNotification есть проверка)
            if (typeof showWinNotification === 'function') {
              try { showWinNotification(winAmount); } catch (_) {}
            }

            // Баланс (в этом проекте addWinAmount работает в TEST_MODE)
            if (window.TEST_MODE && typeof addWinAmount === 'function') {
              try { addWinAmount(winAmount, currentCurrency); } catch (_) {}
            }
          }
          resolve(xStr);
        }
      });
      bonus.start();
    });
  };
})();

console.log('[Wheel] ✅ Notification functions loaded');
console.log('[Wheel] ✅ Module loaded - Fixed version without duplication');


/* ===== BONUS UI VISIBILITY: keep overlays inside Wheel page ===== */
(function () {
  function __moveBonusUiToWheel(node) {
    const wheelPage = document.getElementById('wheelPage');
    if (!wheelPage || !node || node.nodeType !== 1) return;

    const id = (node.id || '').toLowerCase();
    const cls = (node.className || '').toString().toLowerCase();

    // Known toasts
    const isToast = id === 'win-toast' || id === 'bonus-trigger-toast';

    // Known overlays / modals (5050, loot rush, generic)
    const isOverlay =
      cls.includes('bonus-overlay') ||
      cls.includes('loot') && cls.includes('overlay') ||
      id.includes('bonus') && (id.includes('overlay') || id.includes('modal')) ||
      id.includes('lootrush');

    if (isToast || isOverlay) {
      // If already inside wheelPage — ok
      if (wheelPage.contains(node)) return;
      try { wheelPage.appendChild(node); } catch (_) {}
    }
  }

  // Move existing ones if any
  ['bonus5050Overlay', 'win-toast', 'bonus-trigger-toast'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) __moveBonusUiToWheel(el);
  });

  // Observe future injections (e.g., other bonus scripts)
  try {
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n && n.nodeType === 1) {
            __moveBonusUiToWheel(n);
            // also check children quickly
            const kids = n.querySelectorAll ? n.querySelectorAll('#bonus5050Overlay, #win-toast, #bonus-trigger-toast, .bonus-overlay') : [];
            kids.forEach(__moveBonusUiToWheel);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}
})();
