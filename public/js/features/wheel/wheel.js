// wheel.js - FINAL VERSION - Test Mode with Balance Management

/* ===== CONFIG ===== */
const TEST_MODE = false;   // ← В ПРОДЕ false. Для теста руками поставь true.
window.TEST_MODE = TEST_MODE;


// Добавьте эти функции в ваш wheel.js после строки 10

/* ===== PERSISTENCE - Save/Load State ===== */
const WHEEL_STORAGE_KEY = 'wheel_game_state';

// Сохранить состояние игры
function saveWheelState() {
  try {
    const state = {
      bets: Array.from(betsMap.entries()), // Конвертируем Map в массив
      history: [], // Сохраняем историю
      currency: currentCurrency,
      amount: currentAmount,
      timestamp: Date.now()
    };
    
    // Получаем историю из DOM
    if (historyList) {
      const historyItems = Array.from(historyList.querySelectorAll('.history-item img'));
      state.history = historyItems.map(img => img.alt).slice(0, 20);
    }
    
    localStorage.setItem(WHEEL_STORAGE_KEY, JSON.stringify(state));
    console.log('[Wheel] 💾 State saved:', state);
  } catch (e) {
    console.warn('[Wheel] Failed to save state:', e);
  }
}

// Загрузить состояние игры
function loadWheelState() {
  try {
    const saved = localStorage.getItem(WHEEL_STORAGE_KEY);
    if (!saved) {
      console.log('[Wheel] No saved state found');
      return null;
    }
    
    const state = JSON.parse(saved);
    
    // Проверяем, не слишком ли старое состояние (например, старше 24 часов)
    const maxAge = 24 * 60 * 60 * 1000; // 24 часа
    if (Date.now() - state.timestamp > maxAge) {
      console.log('[Wheel] Saved state too old, clearing');
      localStorage.removeItem(WHEEL_STORAGE_KEY);
      return null;
    }
    
    console.log('[Wheel] 📂 State loaded:', state);
    return state;
  } catch (e) {
    console.warn('[Wheel] Failed to load state:', e);
    return null;
  }
}

// Очистить сохраненное состояние
function clearWheelState() {
  localStorage.removeItem(WHEEL_STORAGE_KEY);
  console.log('[Wheel] 🗑️ State cleared');
}

// Восстановить ставки из сохраненного состояния
function restoreBetsFromState(state) {
  if (!state || !state.bets) return;
  
  console.log('[Wheel] 🔄 Restoring bets from saved state');
  
  // Очищаем текущие ставки
  betsMap.clear();
  
  // Восстанавливаем ставки
  for (const [segment, amount] of state.bets) {
    if (amount > 0) {
      betsMap.set(segment, amount);
      
      // Обновляем UI для каждой ставки
      const tile = betTiles.find(t => {
        const seg = t.dataset.segment;
        return normSeg(seg) === normSeg(segment);
      });
      
      if (tile) {
        tile.classList.add('active', 'has-bet');
        setBetPill(tile, segment, amount, state.currency || currentCurrency);
      }
    }
  }
  
  // Показываем компактные карточки если есть ставки
  if (betsMap.size > 0) {
    showCompactBetCards();
  }
  
  console.log('[Wheel] ✅ Bets restored:', Array.from(betsMap.entries()));
}

// Восстановить историю из сохраненного состояния
function restoreHistoryFromState(state) {
  if (!state || !state.history || !historyList) return;
  
  console.log('[Wheel] 🔄 Restoring history from saved state');
  
  // Очищаем текущую историю
  historyList.innerHTML = '';
  
  // Восстанавливаем историю
  const historyIcons = {
    '1.1x': '/images/history/1.1x_small.png',
    '1.5x': '/images/history/1.5x_small.png',
    '5x': '/images/history/5x_small.png',
    '11x': '/images/history/11x_small.png',
    '50&50': '/images/history/50-50_small.png',
    'Loot Rush': '/images/history/loot_small.png',
    'Wild Time': '/images/history/wild_small.png'
  };
  
  for (const typeKey of state.history) {
    const item = document.createElement('div');
    item.className = 'history-item';
    const iconSrc = historyIcons[typeKey] || '/images/history/1.1x_small.png';
    item.innerHTML = `<img src="${iconSrc}" alt="${typeKey}" />`;
    historyList.appendChild(item);
  }
  
  console.log('[Wheel] ✅ History restored:', state.history.length, 'items');
}


// ===== Wheel WebSocket state (server-driven) =====
let wheelWs = null;
let wheelServerState = null;
let wheelLastRoundId = null;
let wheelSpinStartedForRound = null;

let wheelLastSettledKey = null;
let wheelPrevPhase = null;
let wheelPrevBonusId = null;
let wheelBonusOverlayActive = false;  // 🔥 отслеживает открыт ли оверлей
window.__bonusOverlayOpenedFor = null; // 🔥 ID бонуса для которого открыт оверлей
window.__wheelPayoutMode = window.__wheelPayoutMode || 'client';
let wheelPendingState = null;
let wheelStateRaf = 0;
let wheelPlayersRenderSig = null;
let wheelHistoryRenderSig = null;
let wheelMyBetsSig = null;

function queueWheelServerState(state) {
  wheelPendingState = state;
  if (wheelStateRaf) return;

  wheelStateRaf = requestAnimationFrame(() => {
    wheelStateRaf = 0;
    const next = wheelPendingState;
    wheelPendingState = null;
    if (next) applyWheelServerState(next);
  });
}

function buildHistorySignature(historyArr) {
  if (!Array.isArray(historyArr) || historyArr.length === 0) return '';
  return historyArr.slice(0, 20).map((seg) => normSeg(seg)).join('|');
}

function buildPlayersSignature(players) {
  if (!Array.isArray(players) || players.length === 0) return '';
  return players.map((p) => {
    const uid = String(p?.userId ?? '');
    const cur = String(p?.currency ?? '');
    const total = Number(p?.totalAmount || 0);
    const segs = Array.isArray(p?.segments)
      ? p.segments.map((segEntry) => {
          const segName = (typeof segEntry === 'string')
            ? segEntry
            : (segEntry?.segment || segEntry?.name || segEntry?.type);
          const amt = (typeof segEntry === 'object' && segEntry)
            ? Number(segEntry.amount || 0)
            : 0;
          return `${normSeg(segName)}:${Number.isFinite(amt) ? amt : 0}`;
        }).join(',')
      : '';
    return `${uid}:${cur}:${total}:${segs}`;
  }).join(';');
}

function buildMyBetsSignature(players) {
  const myId = String(getWheelUserId());
  const list = Array.isArray(players) ? players : [];
  const me = list.find((p) => String(p?.userId ?? '') === myId);
  if (!me || !Array.isArray(me.segments)) return '';

  const cur = String(me.currency || 'ton').toLowerCase();
  const segs = me.segments.map((segEntry) => {
    const segName = (typeof segEntry === 'string') ? segEntry : (segEntry?.segment || segEntry?.name || segEntry?.type);
    const key = normSeg(segName);
    const amt = (typeof segEntry === 'object' && segEntry) ? Number(segEntry.amount || 0) : 0;
    return `${key}:${Number.isFinite(amt) ? amt : 0}`;
  }).join(',');

  return `${cur}|${segs}`;
}


function connectWheelWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws/wheel`;

  wheelWs = new WebSocket(url);

  wheelWs.onopen = () => {
    console.log('[WheelWS] connected');
  };

  wheelWs.onclose = () => {
    console.log('[WheelWS] disconnected, reconnecting...');
    setTimeout(connectWheelWS, 1000);
  };

  wheelWs.onerror = (e) => {
    console.warn('[WheelWS] error', e);
  };

  wheelWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'wheelState') {
        queueWheelServerState(msg);
      }
      if (msg.type === 'error') {
        console.warn('[WheelWS] server error:', msg.message);
      }
    } catch (e) {
      console.warn('[WheelWS] bad message', e);
    }
  };
}

function wheelWsSend(payload) {
  if (wheelWs && wheelWs.readyState === WebSocket.OPEN) {
    wheelWs.send(JSON.stringify(payload));
  } else {
    console.warn('[WheelWS] Cannot send — socket not open (readyState=' + (wheelWs?.readyState ?? 'null') + '). Payload dropped:', payload);
  }
}

function setCountdownFromMs(msLeft) {
  if (!countdownBox || !countNumEl) return;

  if (msLeft == null) {
    countdownBox.classList.remove('visible');
    return;
  }

  const secLeft = Math.max(0, Math.ceil(msLeft / 1000));
  countNumEl.textContent = String(secLeft);
  countdownBox.classList.add('visible');
}

// ===== Live countdown interpolation (Crash-style) =====
// Server sends bettingLeftMs only on events; we interpolate locally to avoid "stuck at 9".
let wheelBettingLeftMs = null;
let wheelBettingLeftAt = 0;
let wheelLastTimerSec = null;

function cacheWheelCountdownFromState(state) {
  if (state && state.phase === 'betting' && typeof state.bettingLeftMs === 'number' && Number.isFinite(state.bettingLeftMs)) {
    wheelBettingLeftMs = state.bettingLeftMs;
    wheelBettingLeftAt = Date.now();
  } else {
    wheelBettingLeftMs = null;
    wheelBettingLeftAt = 0;
    wheelLastTimerSec = null;
    // hide immediately when not betting
    setCountdownFromMs(null);
  }
}

function getWheelBettingSecondsLeft() {
  if (!wheelServerState || wheelServerState.phase !== 'betting') return null;

  // Prefer "bettingLeftMs + receivedAt" for smoothness
  if (typeof wheelBettingLeftMs === 'number' && wheelBettingLeftAt) {
    const rem = Math.max(0, wheelBettingLeftMs - (Date.now() - wheelBettingLeftAt));
    return Math.ceil(rem / 1000);
  }

  // Fallback to phaseStart if needed
  if (wheelServerState.phaseStart && typeof wheelServerState.bettingTimeMs === 'number') {
    const rem = Math.max(0, wheelServerState.bettingTimeMs - (Date.now() - wheelServerState.phaseStart));
    return Math.ceil(rem / 1000);
  }

  return null;
}

function updateWheelCountdownUI() {
  if (!countdownBox || !countNumEl) return;

  const sec = getWheelBettingSecondsLeft();
  if (sec == null) {
    if (wheelLastTimerSec !== null) {
      wheelLastTimerSec = null;
      countdownBox.classList.remove('visible');
    }
    return;
  }

  // Only touch DOM when second changes
  if (sec !== wheelLastTimerSec) {
    wheelLastTimerSec = sec;
    countNumEl.textContent = String(sec);
    countdownBox.classList.add('visible');
  }
}

function renderWheelPlayersFromServer(players) {
 

  
  wheelPlayersList.innerHTML = '';

  if (!players || players.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'wheel-player__empty';
    empty.textContent = 'No bets yet';
    wheelPlayersList.appendChild(empty);
    return;
  }

  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'wheel-player';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '10px';

    const ava = document.createElement('img');
    ava.className = 'wheel-player__avatar';
    ava.src = p.avatar || '/images/default-avatar.png';
    ava.width = 34;
    ava.height = 34;
    ava.style.borderRadius = '50%';
    ava.style.objectFit = 'cover';

    const meta = document.createElement('div');

    const name = document.createElement('div');
    name.className = 'wheel-player__name';
    name.textContent = p.name || 'Player';

    const sum = document.createElement('div');
    sum.className = 'wheel-player__sum';
    const cur = (p.currency === 'stars') ? '⭐' : 'TON';
    sum.textContent = `${p.totalAmount} ${cur}`;

    meta.appendChild(name);
    meta.appendChild(sum);

    left.appendChild(ava);
    left.appendChild(meta);

    const segWrap = document.createElement('div');
    segWrap.className = 'wheel-player__segments';

    // просто картинки сегментов, без сумм
    const segs = p.segments || [];
    for (const segEntry of segs) {
      const segName = (typeof segEntry === 'string') ? segEntry : (segEntry?.segment || segEntry?.name);
      const key = normSeg(segName);
      if (!key) continue;

      const img = document.createElement('img');
      img.className = 'wheel-player__seg';
      img.src = __WHEEL_HISTORY_ICONS[key] || '/images/history/1.1x_small.png';
      img.alt = key;
      img.onerror = () => { img.src = '/images/history/1.1x_small.png'; };
      segWrap.appendChild(img);
    }

    row.appendChild(left);
    row.appendChild(segWrap);

    wheelPlayersList.appendChild(row);
  }
}

async function startSpinFromServer(spin) {
  if (!spin) return;

  // prevent double-start for same round
  if (wheelSpinStartedForRound === wheelServerState?.roundId) return;
  wheelSpinStartedForRound = wheelServerState?.roundId;

  setBetPanel(false);

  const accelMs = Number(spin.accelMs || 1200);
  const decelMs = Number(spin.decelMs || 6000);
  const totalMs = accelMs + decelMs;

  // If user refreshed mid-spin, try to fit animation into remaining time
  const startedAt = Number(spin.spinStartAt || 0);
  const elapsed = startedAt ? (Date.now() - startedAt) : 0;
  const remaining = Math.max(0, totalMs - Math.max(0, elapsed));

  try {
    if (elapsed > accelMs) {
      // already in decel part → skip accel
      const turns = Math.max(1, Math.round((spin.extraTurns || 4) * (remaining / totalMs)));
      setPhase('decelerate');
      await decelerateToSlice(
        spin.sliceIndex,
        Math.max(250, remaining || 250),
        turns,
        spin.type
      );
    } else {
      // start normally
      setPhase('accelerate');
      await accelerateTo(FAST_OMEGA, accelMs);
      await decelerateToSlice(
        spin.sliceIndex,
        decelMs,
        spin.extraTurns || 4,
        spin.type
      );
    }
  } catch (e) {
    console.error('[Wheel] spin failed', e);
  }
}

function applyWheelServerState(state) {
  const prevRoundId = wheelServerState?.roundId;
  const prevPhase = wheelServerState?.phase;
  const prevBonusId = wheelServerState?.bonus?.id;

  wheelServerState = state;
  window.__wheelPayoutMode = state?.payoutMode || 'client';

  // classes for CSS
  document.body.classList.toggle('is-betting', state.phase === 'betting');
  document.body.classList.toggle('is-spinning', state.phase !== 'betting');
  document.body.classList.toggle('is-bonus', state.phase === 'bonus');

  // server timer (interpolated locally)
  cacheWheelCountdownFromState(state);
  updateWheelCountdownUI();

  // new round hygiene (like Crash)
  if (typeof prevRoundId !== 'undefined' && prevRoundId !== state.roundId) {
    wheelSpinStartedForRound = null;
    // cancel any in-flight decel to avoid fighting the server
    decel = null;
    clearBets();

    // allow settlement again for the new round
    wheelLastSettledKey = null;
  }

  // Players list + History from server (so refresh does NOT reset UI)
  const playersSig = buildPlayersSignature(state.players);
  if (playersSig !== wheelPlayersRenderSig) {
    wheelPlayersRenderSig = playersSig;
    renderWheelPlayers(state.players);
  }

  const historySig = buildHistorySignature(state.history);
  if (historySig !== wheelHistoryRenderSig) {
    wheelHistoryRenderSig = historySig;
    renderWheelHistoryFromServer(state.history);
  }

  // Restore my bet pills after refresh / reconnect only when my server bet-state changed
  const myBetsSig = buildMyBetsSignature(state.players);
  if (myBetsSig !== wheelMyBetsSig) {
    wheelMyBetsSig = myBetsSig;
    restoreMyBetsFromServer(state.players);
  }

  // Phase-based UI
  if (state.phase === 'betting') {
    bettingLocked = false;
    setPhase('betting', { force: true });
    setOmega(IDLE_OMEGA, { force: true });
    setBetPanel(true);
    hideWheelBonusBar();
  } else if (state.phase === 'bonus') {
    bettingLocked = true;
    setBetPanel(false);
    setPhase('bonus_waiting', { force: true });
    setOmega(0, { force: true });

    // show glass "Watch" bar for everyone on wheel page
    if (state.bonus) showWheelBonusBar(state.bonus);
    else if (state.spin?.type) showWheelBonusBar({ type: state.spin.type, id: `fallback:${state.roundId}` });

    // 🔥 ИСПРАВЛЕНИЕ: проверяем новый бонус и автооткрытие с учётом истекшего времени
    const nowBonusId = state.bonus?.id;
    const isNewBonus = nowBonusId && nowBonusId !== prevBonusId;
    
    if (isNewBonus) {
      // Показываем уведомление только при новом бонусе
      try {
        if (typeof window.showBonusNotification === 'function') {
          window.showBonusNotification(normSeg(state.bonus.type));
        }
      } catch (_) {}

      // 🔥 КРИТИЧНО: автооткрытие для ВСЕХ игроков, даже без ставки
      // Используем elapsedMs или remainingMs с сервера для точной проверки
      const elapsedMs = state.bonus?.elapsedMs ?? getBonusElapsedMs(state.bonus);
      const hasEnoughTimeLeft = !Number.isFinite(elapsedMs) || elapsedMs < 2000;
      
      if (isWheelPageActive() && hasEnoughTimeLeft) {
        const myBet = getMyBetAmountFromServer(state.players, state.bonus.type);
        
        // 🔥 ИСПРАВЛЕНИЕ: открываем бонус для всех (даже с myBet = 0)
        window.__bonusOverlayOpenedFor = nowBonusId;
        
        setTimeout(() => {
          openBonusOverlay(state.bonus.type, myBet, state.bonus).catch(() => {});
        }, 500);
      }
    }
  }
  
    else {
    bettingLocked = true;
    setBetPanel(false);
    setPhase('result_waiting', { force: true });
    setOmega(0, { force: true });
    hideWheelBonusBar();

    // NOTE: do NOT force-close bonus overlays on phase switch.
    // Let the client-side bonus animation finish naturally based on remaining time.
    // (Fixes: bonus overlay getting cut off when server moves to result phase.)
  }

  // Start spin strictly by server
  if (state.phase === 'spin' && state.spin) {
    startSpinFromServer(state.spin);
  }

  // Settlement (legacy client mode only): pay once per round.
  const isServerPayoutMode = state?.payoutMode === 'server';
  const resultType = normSeg(state.spin?.type);
  if (!isServerPayoutMode && state.phase === 'result' && resultType) {
    const settleKey = `${state.roundId}:${resultType}:${currentCurrency}`;
    const isBonus = isWheelBonusType(resultType);

    if (!isBonus) {
      // normal segments: settle immediately on result phase
      if (wheelLastSettledKey !== settleKey) {
        wheelLastSettledKey = settleKey;
        void checkBetsAndShowResult(resultType);
      }
    } else {
      // 🔥 КРИТИЧНО: бонусные сегменты - выплата только ПОСЛЕ закрытия оверлея
      // Проверяем что бонус закончился (prevPhase === 'bonus')
      const bonusJustEnded = prevPhase === 'bonus' && state.phase === 'result';
      
      if (bonusJustEnded && wheelLastSettledKey !== settleKey) {
        wheelLastSettledKey = settleKey;
        
        // 🔥 ИСПРАВЛЕНИЕ: если оверлей был открыт - ждём его закрытия перед выплатой
        const wasOverlayOpened = window.__bonusOverlayOpenedFor === prevBonusId;
        
        if (wasOverlayOpened) {
          // Даём время на закрытие оверлея (300ms анимация + запас)
          setTimeout(() => {
            void checkBetsAndShowResult(resultType);
            window.__bonusOverlayOpenedFor = null;
          }, 500);
        } else {
          // Оверлей не открывался - выплачиваем сразу
          void checkBetsAndShowResult(resultType);
        }
      }
    }
  }

  if (isServerPayoutMode && state.phase === 'result' && resultType && state?.settlement) {
    const settlementType = normSeg(state?.settlement?.resultType || resultType);
    const settlementMultiplier = Number(state?.settlement?.multiplier || 0);
    const settleKey = `${state.roundId}:${settlementType}:${settlementMultiplier}:server`;

    if (wheelLastSettledKey !== settleKey) {
      wheelLastSettledKey = settleKey;

      const betInfo = getMyBetInfoFromServer(state.players, settlementType);
      const myBetAmount = Number(betInfo?.amount || 0);

      if (myBetAmount > 0 && Number.isFinite(settlementMultiplier) && settlementMultiplier > 0) {
        const rawWin = myBetAmount * settlementMultiplier;
        const winAmount = (betInfo.currency === 'stars')
          ? Math.round(rawWin)
          : +(rawWin.toFixed(2));

        showWinNotification(winAmount, {
          currency: betInfo.currency,
          deferIfBonusOverlay: true
        });
      }
    }
  }

  wheelPrevPhase = state.phase;
  wheelPrevBonusId = state.bonus?.id || null;
}


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
let wheelPlayersPanel, wheelPlayersList;

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
  console.log('[Wheel] 💸 DEDUCT START!', { 
    amount, 
    currency, 
    TEST_MODE,
    balanceBefore: {...userBalance}
  });
  // Всегда снимаем локально
  if (currency === 'ton') {
    userBalance.ton = Math.max(0, userBalance.ton - amount);
  } else {
    userBalance.stars = Math.max(0, userBalance.stars - amount);
  }
  
  updateTestBalance();
  
  console.log('[Wheel] ✅ Balance after deduction:', userBalance);
}




/* =====  ADD WIN AMOUNT ===== */
async function addWinAmount(amount, currency) {
  console.log('[Wheel] Adding win:', amount, currency);

  if (TEST_MODE) {
    if (currency === 'ton') {
      userBalance.ton += amount;
    } else {
      userBalance.stars += amount;
    }
    updateTestBalance();
    return;
  }

  // Server handles wheel payouts. Client just waits for live balance sync.
  console.log('[Wheel] Server payout mode active; client payout request skipped');
}

// Make sure it's exported globally
window.addWinAmount = addWinAmount;







/* =====  UPDATE TEST BALANCE UI ===== */
function updateTestBalance() {
  console.log('[Wheel] 📊 Updating balance UI:', userBalance);
  
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
      _testMode: TEST_MODE
    }
  }));
  
  console.log('[Wheel] ✅ Balance UI updated:', userBalance);
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
  wheelPlayersPanel = document.getElementById('wheelPlayersPanel');
  wheelPlayersList  = document.getElementById('wheelPlayersList');
  
  // 🔥 Скрываем счётчик при загрузке
  setTimeout(() => hidePlayersPanelCounter(), 100);
 
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
   
      initTestModeBalance();
    
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

  connectWheelWS();

  if (window.WT?.bus) {
    window.WT.bus.addEventListener('page:change', (e) => {
      if (e?.detail?.id === 'wheelPage') {
        refreshWheelBonusBarFromState();
      } else {
        hideWheelBonusBar();
      }
    });
  }


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

// Отдельная функция для белых иконок в badge (на компактных карточках)
function getCurrencyIconWhite(currency) {
  return currency === 'stars' ? '/icons/stars.svg' : '/icons/tgTonWhite.svg';
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

  if (iconEl) {
    iconEl.src = getCurrencyIconSrc(currency);
  }
  if (amountEl) {
    amountEl.textContent = String(amount);
  }

  pill.dataset.currency = currency;
  pill.dataset.segment = seg;

  // Keep pill visible even if old styles/classes hide it.
  pill.hidden = false;
  pill.style.display = 'flex';
  pill.style.opacity = '1';
  pill.style.visibility = 'visible';
  pill.style.zIndex = '100';

  // Subtle update pop only when pill already exists.
  if (!isNew) {
    pill.classList.remove('is-updating');
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
function initBettingUI(){

  console.log('[Wheel] 🎮 Init Betting UI, userBalance:', userBalance);
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
      // SEND BET TO SERVER FIRST (authoritative debit), then to shared WS state
      const tgApp = window.Telegram?.WebApp;
      const tgUser = tgApp?.initDataUnsafe?.user;
      const initData = tgApp?.initData || '';
      const userId = tgUser?.id ? String(tgUser.id) : 'guest';
      const roundId = Number(wheelServerState?.roundId || 0) || null;

      if (!TEST_MODE) {
        if (userId === 'guest' || !initData) {
          if (next === currentAmount) betsMap.delete(seg);
          else betsMap.set(seg, cur);
          showInsufficientBalanceNotification();
          return;
        }

        if (!wheelWs || wheelWs.readyState !== WebSocket.OPEN) {
          if (next === currentAmount) betsMap.delete(seg);
          else betsMap.set(seg, cur);
          showInsufficientBalanceNotification();
          return;
        }

        try {
          const response = await fetch('/api/deposit-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              amount: -currentAmount,
              currency: currentCurrency,
              type: 'wheel_bet',
              roundId,
              initData,
              depositId: `bet_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
              notify: false
            })
          });

          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.ok) {
            console.error('[Wheel] Server rejected bet:', result.error || response.status);
            if (next === currentAmount) betsMap.delete(seg);
            else betsMap.set(seg, cur);
            showInsufficientBalanceNotification();
            return;
          }
        } catch (error) {
          console.error('[Wheel] Failed to send bet to server:', error);
          if (next === currentAmount) betsMap.delete(seg);
          else betsMap.set(seg, cur);
          showInsufficientBalanceNotification();
          return;
        }
      }

      try {
        wheelWsSend({
          type: 'placeBet',
          userId,
          userName: tgUser?.username || tgUser?.first_name || 'Player',
          userAvatar: getWheelUserAvatar() || null,
          initData,
          segment: seg,
          amount: currentAmount,
          currency: currentCurrency,
          roundId
        });
      } catch (wsErr) {
        console.warn('[WheelWS] Failed to send placeBet:', wsErr);
        if (next === currentAmount) betsMap.delete(seg);
        else betsMap.set(seg, cur);
        showInsufficientBalanceNotification();
        return;
      }
      deductBetAmount(currentAmount, currentCurrency);
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

  // Keep betting countdown smooth even if server doesn't broadcast every second
  updateWheelCountdownUI();

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
        if (!wheelServerState) {
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
                clientRoundReset(typeFinished);
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

            clientRoundReset(typeFinished);
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
                clientRoundReset(typeFinished);
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

            clientRoundReset(typeFinished);
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
	                clientRoundReset(typeFinished);
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

	            clientRoundReset(typeFinished);
            }, 2000);
	        } else {
          // 🔥 NORMAL RESULT - NO BONUS
          setTimeout(() => {
            clientRoundReset(typeFinished);
            }, 3000);
        }
        }
      } else {
        if (!wheelServerState) clientRoundReset(null, { addHistory: false });
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







/* ===== Check bets and show result ===== */// Deterministic depositId (prevents double payout on refresh/reconnect)
function makeWheelPayoutId(kind, userId, resultType, currency) {
  const roundId = wheelServerState?.roundId ?? 'local';
  const seg = String(normSeg(resultType) || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
  const cur = String(currency || 'ton').toLowerCase() === 'stars' ? 'stars' : 'ton';
  return `${kind}_${userId}_${roundId}_${seg}_${cur}`;
}
async function checkBetsAndShowResult(resultType, opts = {}) {
  resultType = normSeg(resultType);

  const totalBets = Array.from(betsMap.values()).reduce((sum, val) => sum + val, 0);
  
  const isBonusRound = ['50&50', 'Loot Rush', 'Wild Time'].includes(resultType);
  
  // 🔥 FIX: Начисляем выигрыш за ставку на бонус ПЕРЕД запуском бонуса
  if (isBonusRound) {
    console.log('[Wheel] 🎰 BONUS ROUND!', resultType);
    
    // Показываем уведомление о бонусе
    if (window.BonusManager && window.BonusManager.isOnWheelPage()) {
      showBonusNotification(resultType);
    }
    
    // 🔥 НОВОЕ: Проверяем есть ли ставка на бонус
    const betOnBonus = betsMap.get(resultType) || 0;
    
    if (betOnBonus > 0) {
      // Множитель за попадание в бонус (возвращаем ставку + небольшой бонус)
      const multiplier = getMultiplier(resultType);
      const winAmount = betOnBonus * multiplier;
      
      console.log('[Wheel] 💰 Bonus bet win!', {
        bonus: resultType,
        betAmount: betOnBonus,
        multiplier,
        winAmount,
        testMode: TEST_MODE
      });
      
      if (!TEST_MODE) {
        console.log('[Wheel] Server payout mode active; bonus payout handled on backend');
      }
      
      // 🔥 Add win to balance in test mode
      if (TEST_MODE) {
        addWinAmount(winAmount, currentCurrency);
      }
      
      // Показываем уведомление о выигрыше за ставку
      showWinNotification(winAmount);
    }
    
    // Теперь можно запускать бонус
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
    
    if (!TEST_MODE) {
      console.log('[Wheel] Server payout mode active; win payout handled on backend');
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
 







/* ===== Countdown ===== */
let cInt = null;
let isCountdownActive = false;

function startCountdown(sec=9){

  console.log('[Wheel] startCountdown disabled (server-driven)');
  return;

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
    
    // 🔥 During spin show Players panel (Crash-style)
    if (!enabled) {
      showWheelPlayersPanel();
    } else {
      hideWheelPlayersPanel();
    }
  }

  // Лочим скролл только во время фазы ставок (чтобы не нужно было скроллить вниз)
  document.body.classList.toggle('wheel-lock', !!enabled);
}


/* ===== Players panel (Crash-style, shown while spinning) ===== */
const __WHEEL_HISTORY_ICONS = {
  '1.1x': '/images/history/1.1x_small.png',
  '1.5x': '/images/history/1.5x_small.png',
  '5x': '/images/history/5x_small.png',
  '11x': '/images/history/11x_small.png',
  '50&50': '/images/history/50-50_small.png',
  'Loot Rush': '/images/history/loot_small.png',
  'Wild Time': '/images/history/wild_small.png'
};

// ===== Bonus helpers + "Watch" liquid-glass bar =====
const __WHEEL_BONUS_TYPES = new Set(['50&50','Loot Rush','Wild Time']);

function isWheelBonusType(t) {
  const k = normSeg(t);
  return __WHEEL_BONUS_TYPES.has(k);
}

function wheelSlugSeg(t) {
  return String(normSeg(t) || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function isWheelPageActive() {
  const wp = document.getElementById('wheelPage');
  return !!(wp && wp.classList.contains('page-active'));
}

let __wheelBonusBarEl = null;
let __wheelBonusBarStyleDone = false;
let __wheelBonusBarShownForId = null;
let __wheelBonusBarTimer = null;

function getBonusEndsAt(bonus) {
  if (!bonus) return null;
  if (Number.isFinite(bonus.endsAt)) return bonus.endsAt;
  if (Number.isFinite(bonus.startedAt) && Number.isFinite(bonus.durationMs)) {
    return bonus.startedAt + bonus.durationMs;
  }
  return null;
}



function getBonusElapsedMs(bonus, now = Date.now()) {
  if (!bonus || !Number.isFinite(bonus.startedAt)) return null;
  return Math.max(0, now - bonus.startedAt);
}

function getBonusRemainingMs(bonus, now = Date.now()) {
  if (!bonus) return null;

  // Prefer absolute server timestamps to avoid frozen countdown when
  // remainingMs is a stale snapshot.
  if (Number.isFinite(bonus.endsAt)) {
    return Math.max(0, bonus.endsAt - now);
  }

  if (Number.isFinite(bonus.startedAt) && Number.isFinite(bonus.durationMs)) {
    const elapsed = now - bonus.startedAt;
    return Math.max(0, bonus.durationMs - elapsed);
  }

  if (Number.isFinite(bonus.remainingMs)) {
    return Math.max(0, bonus.remainingMs);
  }

  return null;
}

function formatBonusRemaining(remainingMs) {
  if (!Number.isFinite(remainingMs)) return '';
  const sec = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${sec}s left`;
}

function ensureWheelBonusBarStyles() {
  if (__wheelBonusBarStyleDone) return;
  __wheelBonusBarStyleDone = true;
  const st = document.createElement('style');
  st.id = 'wheel-bonus-bar-style';
  st.textContent = `
    #wheelBonusBar{
      position:absolute;
      left:50%;
      top:50%;
      transform: translate(60px, -50%);
      width: min(620px, 92vw);
      height: 66px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 22px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.18);
      box-shadow: 0 14px 38px rgba(0,0,0,0.35);
      backdrop-filter: blur(18px) saturate(1.4);
      -webkit-backdrop-filter: blur(18px) saturate(1.4);
      color: #fff;
      opacity: 0;
      pointer-events: none;
      z-index: 9999;
    }
    #wheelBonusBar.active{
      opacity: 1;
      pointer-events: auto;
      animation: wheelBonusBarIn .28s ease forwards;
    }
    @keyframes wheelBonusBarIn{
      from{ transform: translate(60px, -50%); opacity: 0; }
      to{ transform: translate(-50%, -50%); opacity: 1; }
    }
    #wheelBonusBar .wbb-left{ display:flex; align-items:center; gap: 12px; min-width: 0; }
    #wheelBonusBar .wbb-icon{ width: 42px; height: 42px; border-radius: 14px; object-fit: cover; flex: 0 0 auto; box-shadow: 0 8px 18px rgba(0,0,0,0.25); }
    #wheelBonusBar .wbb-text{ display:flex; flex-direction:column; min-width: 0; line-height: 1.05; }
    #wheelBonusBar .wbb-title{ font-weight: 700; font-size: 14px; letter-spacing: 0.3px; opacity: 0.95; }
    #wheelBonusBar .wbb-sub{ font-size: 12px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #wheelBonusBar .wbb-btn{
      border: 1px solid rgba(255,255,255,0.22);
      background: rgba(255,255,255,0.10);
      color:#fff;
      padding: 10px 14px;
      border-radius: 16px;
      font-weight: 700;
      letter-spacing: 0.2px;
      cursor:pointer;
      backdrop-filter: blur(18px) saturate(1.4);
      -webkit-backdrop-filter: blur(18px) saturate(1.4);
      transition: transform .08s ease, background .15s ease;
      user-select: none;
    }
    #wheelBonusBar .wbb-btn:active{ transform: scale(0.98); }
    #wheelBonusBar .wbb-btn:hover{ background: rgba(255,255,255,0.16); }
  `;
  document.head.appendChild(st);
}

function ensureWheelBonusBar() {
  if (__wheelBonusBarEl) return __wheelBonusBarEl;
  ensureWheelBonusBarStyles();

  const host = document.getElementById('wheelPage') || document.body;

  const el = document.createElement('div');
  el.id = 'wheelBonusBar';
  el.innerHTML = `
    <div class="wbb-left">
      <img class="wbb-icon" alt="bonus" />
      <div class="wbb-text">
        <div class="wbb-title">Bonus round in progress</div>
        <div class="wbb-sub">—</div>
      </div>
    </div>
    <button class="wbb-btn" type="button">Watch live</button>
  `;

  host.appendChild(el);
  __wheelBonusBarEl = el;
  return el;
}

function showWheelBonusBar(bonus) {
  if (!bonus || !bonus.type) return;
  if (!isWheelPageActive()) return;

  const el = ensureWheelBonusBar();
  const icon = el.querySelector('.wbb-icon');
  const sub = el.querySelector('.wbb-sub');
  const btn = el.querySelector('.wbb-btn');

  const type = normSeg(bonus.type);
  const iconSrc = __WHEEL_HISTORY_ICONS[type] || '/images/history/loot_small.png';
  if (icon) icon.src = iconSrc;
  const liveBonusNow = wheelServerState?.bonus || bonus;
  const remaining = formatBonusRemaining(getBonusRemainingMs(liveBonusNow));
  if (sub) sub.textContent = remaining ? `Bonus: ${type} • ${remaining}` : `Bonus: ${type}`;

  // bind click once per bonus id
  const bonusId = String(bonus.id || `${bonus.type}:${bonus.startedAt || ''}`);
  if (__wheelBonusBarShownForId !== bonusId) {
    __wheelBonusBarShownForId = bonusId;

    if (btn) {
      btn.onclick = async () => {
        try {
          // 🔥 ИСПРАВЛЕНИЕ: используем актуальное состояние из wheelServerState
          const currentBonus = wheelServerState?.bonus || bonus;
          const myBet = getMyBetAmountFromServer(wheelServerState?.players, type);
          await openBonusOverlay(type, myBet, currentBonus);
        } catch (e) {
          console.warn('[Wheel] Watch bonus failed', e);
        }
      };
    }
  }

  el.classList.add('active');

  if (__wheelBonusBarTimer) clearInterval(__wheelBonusBarTimer);
  __wheelBonusBarTimer = setInterval(() => {
    if (!wheelServerState || wheelServerState.phase !== 'bonus') {
      clearInterval(__wheelBonusBarTimer);
      __wheelBonusBarTimer = null;
      return;
    }
    const liveBonus = wheelServerState?.bonus || bonus;
    const nextRemaining = formatBonusRemaining(getBonusRemainingMs(liveBonus));
    if (sub && nextRemaining) sub.textContent = `Bonus: ${type} • ${nextRemaining}`;
  }, 1000);
}

function hideWheelBonusBar() {
  if (__wheelBonusBarEl) __wheelBonusBarEl.classList.remove('active');
  if (__wheelBonusBarTimer) {
    clearInterval(__wheelBonusBarTimer);
    __wheelBonusBarTimer = null;
  }
}

function refreshWheelBonusBarFromState() {
  if (!isWheelPageActive()) {
    hideWheelBonusBar();
    return;
  }
  if (wheelServerState?.phase === 'bonus') {
    if (wheelServerState.bonus) {
      showWheelBonusBar(wheelServerState.bonus);
    } else if (wheelServerState.spin?.type) {
      showWheelBonusBar({ type: wheelServerState.spin.type, id: `fallback:${wheelServerState.roundId}` });
    }
  } else {
    hideWheelBonusBar();
  }
}

function closeBonusOverlayIfOpen() {
  const overlay = document.getElementById('bonus5050Overlay');
  if (!overlay) return;
  if (!overlay.classList.contains('bonus-overlay--active')) return;
  overlay.classList.add('bonus-overlay--leave');
  setTimeout(() => {
    overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
    overlay.style.display = 'none';
    const container = overlay.querySelector('.bonus-container');
    if (container) container.innerHTML = '';
    document.documentElement.classList.remove('bonus-active');
    document.body.classList.remove('bonus-active');
  }, 260);
}

function getMyBetInfoFromServer(players, seg) {
  const myId = String(getWheelUserId());
  const list = Array.isArray(players) ? players : [];
  const me = list.find(p => String(p.userId) === myId);
  if (!me || !Array.isArray(me.segments)) {
    return { amount: 0, currency: 'ton' };
  }

  const target = normSeg(seg);
  let amt = 0;
  for (const segEntry of me.segments) {
    const segName = (typeof segEntry === 'string') ? segEntry : (segEntry?.segment || segEntry?.name);
    const key = normSeg(segName);
    if (key !== target) continue;
    const a = (typeof segEntry === 'object') ? Number(segEntry?.amount || 0) : 0;
    amt += Number.isFinite(a) ? a : 0;
  }

  const currency = String(me.currency || 'ton').toLowerCase() === 'stars' ? 'stars' : 'ton';
  const amount = currency === 'stars' ? Math.round(amt) : (Math.round(amt * 100) / 100);
  return { amount, currency };
}

function getMyBetAmountFromServer(players, seg) {
  return getMyBetInfoFromServer(players, seg).amount;
}

async function openBonusOverlay(type, betAmount = 0, bonusState = null) {
  const t = normSeg(type);
  
  const remainingMs = getBonusRemainingMs(bonusState);
  const remainingSec = Number.isFinite(remainingMs) ? Math.max(1, Math.ceil(remainingMs / 1000)) : null;
  
  // 🔥 КРИТИЧНО: передаём hasBet для корректной работы бонусов
  const hasBet = betAmount > 0;
  const bonusOpts = {
    bonusId: bonusState?.id ?? null,
    hasBet,
    durationSec: (bonusState?.durationMs ? Math.ceil(bonusState.durationMs / 1000) : 12),
    remainingSec: remainingSec || null,
    outcome: bonusState?.outcome || null
  };

  // We don't force-lock UI here — server already pauses the round
  if (t === '50&50' && typeof window.start5050Bonus === 'function') {
    await window.start5050Bonus(betAmount, bonusOpts);
    return;
  }

  if (t === 'Loot Rush' && typeof window.startLootRushBonus === 'function') {
    await window.startLootRushBonus(betAmount, bonusOpts);
    return;
  }

  if (t === 'Wild Time' && typeof window.startWildTimeBonus === 'function') {
    await window.startWildTimeBonus(betAmount, bonusOpts);
    return;
  }

  if (typeof window.showBonusNotification === 'function') {
    window.showBonusNotification(t);
  }
}


// ===== Server-controlled wheel helpers (Crash-style) =====
function isWheelServerControlled() {
  // If we have a live WS state from server — server is the source of truth.
  return !!wheelServerState && typeof wheelServerState.roundId !== 'undefined';
}

function clientRoundReset(typeFinished, opts = {}) {
  const { addHistory = true } = opts;
  if (isWheelServerControlled()) return; // server will drive next round
  if (addHistory && typeFinished) pushHistory(normSeg(typeFinished));
  clearBets();
  bettingLocked = false;
  setPhase('betting', { force: true });
  setOmega(IDLE_OMEGA, { force: true });
  setBetPanel(true);
}

function renderWheelHistoryFromServer(historyArr) {
  if (!historyList) return;
  const arr = Array.isArray(historyArr) ? historyArr.slice(0, 20) : [];
  historyList.innerHTML = '';

  for (const rawType of arr) {
    const typeKey = normSeg(rawType);
    const item = document.createElement('div');
    item.className = 'history-item';

    const img = document.createElement('img');
    img.alt = typeKey;

    // Use the same icon map as Players panel
    img.src = __WHEEL_HISTORY_ICONS[typeKey] || '/images/history/1.1x_small.png';
    img.onerror = () => { img.src = '/images/history/1.1x_small.png'; };

    item.appendChild(img);
    historyList.appendChild(item);
  }
}

function restoreMyBetsFromServer(players) {
  if (!betTiles || !betTiles.length) return;
  const myId = String(getWheelUserId());
  const list = Array.isArray(players) ? players : [];
  const me = list.find(p => String(p.userId) === myId);
  if (!me || !Array.isArray(me.segments)) return;

  // Build Map from server data
  const serverBets = new Map();
  for (const segEntry of me.segments) {
    const segName = typeof segEntry === 'string' ? segEntry : (segEntry?.segment || segEntry?.name);
    const amt = (typeof segEntry === 'object') ? Number(segEntry?.amount || 0) : null;
    const key = normSeg(segName);
    if (!key) continue;
    const a = (me.currency === 'stars') ? Math.round(Number(amt || 0)) : (Math.round(Number(amt || 0) * 100) / 100);
    if (a > 0) serverBets.set(key, a);
  }

  // If local already matches server — do nothing
  if (betsMap.size) {
    let same = true;
    if (betsMap.size !== serverBets.size) same = false;
    if (same) {
      for (const [k, v] of serverBets.entries()) {
        if (Number(betsMap.get(k) || 0) !== Number(v || 0)) { same = false; break; }
      }
    }
    if (same) {
      // If pills are missing from DOM, rebuild from server state
      let missingPill = false;
      for (const [seg] of serverBets.entries()) {
        const tile = Array.from(betTiles).find(t => normSeg(t?.dataset?.seg) === seg);
        if (tile && !tile.querySelector('.bet-pill')) {
          missingPill = true;
          break;
        }
      }
      if (!missingPill) return;
    }
  }

  // Replace local bets UI
  clearBets();
  if (me.currency && typeof setCurrency === 'function') setCurrency(me.currency);

  for (const [seg, amount] of serverBets.entries()) {
    betsMap.set(seg, amount);
    const tile = Array.from(betTiles).find(t => normSeg(t?.dataset?.seg) === seg);
    if (!tile) continue;
    tile.classList.add('active', 'has-bet');
    setBetPill(tile, seg, amount, me.currency || currentCurrency);
  }
}


function getWheelUserId() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'guest';
}

function getWheelUserName() {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const full = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
  return full || u?.username || 'Player';
}

function getWheelUserAvatar() {
  // Prefer already-rendered avatar (topbar), fallback to profile avatar.
  const top = document.getElementById('userAvatarImg');
  const prof = document.getElementById('profileAvatar');
  const src = (top?.getAttribute('src') || top?.src || prof?.getAttribute('src') || prof?.src || '').trim();
  if (!src) return null;
  // If it's the default avatar, treat as missing so we render initials.
  if (src.includes('avatar-default')) return null;
  return src;
}

function formatWheelAmount(amount, currency) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return '0';
  if (currency === 'stars') return String(Math.round(n));
  return n.toFixed(2);
}

function getWheelPlayersSnapshot() {
  // Right now wheel bets are local on client → показываем хотя бы текущего игрока.
  // Позже можно заменить на мультиплеер/WS и передавать массив игроков.
  const total = Array.from(betsMap.values()).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const segmentsOrdered = ['1.1x','1.5x','5x','11x','50&50','Loot Rush','Wild Time']
    .filter(seg => (betsMap.get(seg) || 0) > 0);

  if (total <= 0) return [];

  return [
    {
      userId: getWheelUserId(),
      name: getWheelUserName(),
      avatar: getWheelUserAvatar(),
      currency: currentCurrency,
      totalAmount: total,
      segments: segmentsOrdered
    }
  ];
}

function renderWheelPlayers(players) {
  if (!wheelPlayersList) return;
  wheelPlayersList.innerHTML = '';

  const list = Array.isArray(players) ? players : [];
 

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'wheel-players-panel__empty';
    empty.textContent = 'No bets in this round';
    wheelPlayersList.appendChild(empty);
    return;
  }

  for (const p of list) {
    const row = document.createElement('div');
    row.className = 'wheel-player-pill';
    row.setAttribute('data-userid', String(p.userId ?? ''));

    const initials = String(p.name || 'P').trim().slice(0, 1).toUpperCase();
    const avatarHtml = p.avatar
      ? `<img src="${p.avatar}" alt="" />`
      : `<span style="font-weight:900; color: rgba(255,255,255,.92); font-size: 14px;">${initials}</span>`;

    const curIcon = getCurrencyIconWhite(p.currency || currentCurrency);
    const sumText = formatWheelAmount(p.totalAmount, p.currency || currentCurrency);

    const segs = Array.isArray(p.segments) ? p.segments : [];
    const segIcons = segs.map(segEntry => {
      const segName = (typeof segEntry === 'string')
        ? segEntry
        : (segEntry?.segment || segEntry?.name || segEntry?.type);

      const key = normSeg(segName);
      if (!key) return '';

      const src = __WHEEL_HISTORY_ICONS[key] || '/images/history/1.1x_small.png';

      // Server can send per-segment amount (objects). We render it as a small badge.
      const hasAmt = (typeof segEntry === 'object') && segEntry && Number.isFinite(Number(segEntry.amount));
      const amt = hasAmt ? Number(segEntry.amount) : null;
      const cur = p.currency || currentCurrency;
      const amtText = hasAmt ? formatWheelAmount(amt, cur) : '';

      const title = key;

      return `
        <div class="wheel-player-pill__segIcon" title="${title}">
          <img src="${src}" alt="${key}" />
        </div>
      `;
    }).join('');

    row.innerHTML = `
      <div class="wheel-player-pill__left">
        <div class="wheel-player-pill__ava">${avatarHtml}</div>
        <div class="wheel-player-pill__meta">
          <div class="wheel-player-pill__name">${String(p.name || 'Player')}</div>
          <div class="wheel-player-pill__total">
            <img src="${curIcon}" alt="" />
            <span>${sumText}</span>
          </div>
        </div>
      </div>
      <div class="wheel-player-pill__segments" aria-label="Bet segments">
        ${segIcons}
      </div>
    `;

    wheelPlayersList.appendChild(row);
  }
}


// 🔥 Функция для скрытия счётчика игроков в правом углу панели
function hidePlayersPanelCounter() {
  if (!wheelPlayersPanel) return;
  
  // Ищем все возможные элементы счётчика
  const selectors = [
    '.wheel-players-panel__counter',
    '.wheel-players-panel__count',
    '.wheel-players-count',
    '.players-counter',
    '.players-count',
    '[class*="counter"]',
    '[class*="count"]'
  ];
  
  for (const selector of selectors) {
    const counters = wheelPlayersPanel.querySelectorAll(selector);
    counters.forEach(counter => {
      // Проверяем, не является ли это важным элементом
      const text = counter.textContent?.trim();
      if (text === '0' || text === '' || /^\d+$/.test(text)) {
        counter.style.display = 'none';
      }
    });
  }
  
  // Также проверяем прямые дочерние элементы панели
  if (wheelPlayersPanel.children) {
    Array.from(wheelPlayersPanel.children).forEach(child => {
      if (child !== wheelPlayersList && child.textContent?.trim() === '0') {
        child.style.display = 'none';
      }
    });
  }
}

function getWheelPlayersForPanel() {
  // Server is the source of truth when WS is connected.
  const serverPlayers = wheelServerState?.players;
  if (Array.isArray(serverPlayers)) return serverPlayers;

  // Fallback: show local snapshot (e.g. before WS connected)
  return getWheelPlayersSnapshot();
}

function showWheelPlayersPanel() {
  // CSS shows/hides the panel. Here we only render актуальные данные.
  if (!wheelPlayersPanel) return;
  const players = getWheelPlayersForPanel();
  renderWheelPlayers(players);

  // 🔥 Скрываем счётчик "0" в правом углу панели
  hidePlayersPanelCounter();
}

function hideWheelPlayersPanel() {
 
  if (wheelPlayersList) wheelPlayersList.innerHTML = '';
}

/* ===== 🔥 КОМПАКТНЫЕ КАРТОЧКИ СТАВОК (показываются при спине) ===== */

// Создаем/получаем контейнер для компактных карточек
function getCompactCardsContainer() {
  let container = document.getElementById('betCardsCompact');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'betCardsCompact';
    container.className = 'bet-cards-compact';
    
    // Добавляем в секцию wheel, чтобы карточки были ПОД колесом
    const wheelSection = document.querySelector('.wheel');
    if (wheelSection) {
      wheelSection.appendChild(container);
    } else {
      // Fallback - добавляем в body если wheel не найден
      document.body.appendChild(container);
    }
  }
  
  return container;
}

// Показываем компактные карточки с текущими ставками
function showCompactBetCards() {
  const container = getCompactCardsContainer();
  container.innerHTML = ''; // Очищаем
  
  // Собираем все ставки из betsMap
  const bets = Array.from(betsMap.entries()).filter(([seg, amount]) => amount > 0);
  
  if (bets.length === 0) {
    console.log('[Wheel] 🎴 No bets to show in compact view');
    return;
  }
  
  // Маппинг сегментов на иконки
  const segmentImages = {
    '1.1x': '/images/bets/1.1x.webp',
    '1.5x': '/images/bets/1.5x.webp',
    '5x': '/images/bets/5x.webp',
    '11x': '/images/bets/11x.webp',
    '50&50': '/images/bets/50-50.webp',
    'Loot Rush': '/images/bets/loot.webp',
    'Wild Time': '/images/bets/wild.webp'
  };
  
  // Иконка текущей валюты - используем белую версию для badge
  const currencyIcon = getCurrencyIconWhite(currentCurrency);
  
  console.log('[Wheel] 🎴 Creating compact cards for', bets.length, 'bets');
  
  // Создаем карточки (максимум 3 в ряд)
  bets.forEach(([segment, amount]) => {
    const card = document.createElement('div');
    card.className = 'bet-card-compact';
    card.dataset.segment = segment; // Для CSS селектора
    
    const imgSrc = segmentImages[segment] || '/images/bets/1.1x.webp';
    
    card.innerHTML = `
      <img class="bet-card-compact__img" src="${imgSrc}" alt="${segment}" />
      <div class="bet-card-compact__amount">
        <img src="${currencyIcon}" alt="" />
        <span>${amount}</span>
      </div>
      <div class="bet-card-compact__badge">
        <img class="bet-card-compact__badge-icon" src="${currencyIcon}" alt="" />
        <span class="bet-card-compact__badge-text">${amount}</span>
      </div>
    `;
    
    container.appendChild(card);
  });
  
  console.log('[Wheel] ✅ Compact cards created');
}

// Скрываем и очищаем компактные карточки
function hideCompactBetCards() {
  const container = document.getElementById('betCardsCompact');
  if (container) {
    // Плавное исчезновение через CSS transition
    setTimeout(() => {
      container.innerHTML = '';
    }, 500); // Задержка для анимации
  }
  console.log('[Wheel] 🎴 Compact cards hidden');
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
const __wheelWinToastQueue = [];
let __wheelWinToastTimer = null;

function isAnyWheelBonusOverlayActive() {
  const b5050 = document.getElementById('bonus5050Overlay');
  const b5050Active = !!(b5050 && b5050.classList.contains('bonus-overlay--active'));

  const wild = document.getElementById('wildTimeOverlay');
  const wildActive = !!(wild && (wild.classList.contains('wt-active') || wild.style.display === 'flex'));

  return b5050Active || wildActive;
}

function renderWinToast(winAmount, currency = currentCurrency) {
  const existing = document.getElementById('win-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'win-toast';

  const formattedAmount = currency === 'stars'
    ? Math.round(Number(winAmount || 0))
    : Number(winAmount || 0).toFixed(2);

  const iconSrc = currency === 'stars' ? '/icons/stars.svg' : '/icons/ton.svg';

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

function flushQueuedWinToasts() {
  if (__wheelWinToastTimer) return;

  const step = () => {
    __wheelWinToastTimer = null;

    if (!__wheelWinToastQueue.length) return;
    if (isAnyWheelBonusOverlayActive()) {
      __wheelWinToastTimer = setTimeout(step, 220);
      return;
    }

    const next = __wheelWinToastQueue.shift();
    renderWinToast(next.amount, next.currency);

    if (__wheelWinToastQueue.length) {
      __wheelWinToastTimer = setTimeout(step, 520);
    }
  };

  __wheelWinToastTimer = setTimeout(step, 120);
}

function showWinNotification(winAmount, opts = {}) {
  if (!isWheelPageActive()) return;

  const amount = Number(winAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const currency = String(opts?.currency || currentCurrency || 'ton').toLowerCase() === 'stars' ? 'stars' : 'ton';
  const deferIfBonusOverlay = opts?.deferIfBonusOverlay !== false;

  if (deferIfBonusOverlay && isAnyWheelBonusOverlayActive()) {
    __wheelWinToastQueue.push({ amount, currency });
    flushQueuedWinToasts();
    return;
  }

  renderWinToast(amount, currency);
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
    '1.5x': 1.5,
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
    if (overlay) {
      // Проверяем, есть ли кнопка Back, если нет - добавляем
      let backBtn = overlay.querySelector('.universal-back-btn');
      if (!backBtn) {
        const backdrop = overlay.querySelector('.bonus-overlay__blur-backdrop');
        backBtn = document.createElement('button');
        backBtn.className = 'universal-back-btn';
        backBtn.id = 'bonusBackBtn';
        backBtn.setAttribute('aria-label', 'Go back');
        backBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span class="universal-back-text">Back</span>
        `;
        
        // Добавляем кнопку после backdrop
        if (backdrop && backdrop.nextSibling) {
          overlay.insertBefore(backBtn, backdrop.nextSibling);
        } else {
          overlay.appendChild(backBtn);
        }
        
        // Привязываем обработчик
        backBtn.addEventListener('click', () => {
          try {
            if (typeof window.__bonusBackHandler === 'function') {
              window.__bonusBackHandler();
              return;
            }
          } catch (_) {}

          console.log('[Wheel] 🔙 Back: no active handler, closing overlay');

          // Фолбэк: просто закрываем оверлей (если бонус не зарегистрировал обработчик)
          overlay.classList.add('bonus-overlay--leave');

          setTimeout(() => {
            overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
            overlay.style.display = 'none';

            // Keep DOM so an in-progress bonus can resume if user re-opens it
            // const container = overlay.querySelector('.bonus-container');
            // if (container) container.innerHTML = '';
          }, 300);
        });
      }
      return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = 'bonus5050Overlay';
    overlay.className = 'bonus-overlay';
    overlay.innerHTML = `
      <div class="bonus-overlay__blur-backdrop"></div>
      
      <!-- Универсальная кнопка Back для всех бонусов -->
      <button class="universal-back-btn" id="bonusBackBtn" aria-label="Go back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span class="universal-back-text">Back</span>
      </button>
      
      <div class="bonus-container"></div>
    `;

    // BACK (универсальный): отдаём управление активному бонусу, иначе просто закрываем оверлей
    const backBtn = overlay.querySelector('#bonusBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        try {
          if (typeof window.__bonusBackHandler === 'function') {
            window.__bonusBackHandler();
            return;
          }
        } catch (_) {}

        console.log('[Wheel] 🔙 Back: no active handler, closing overlay');

        // Фолбэк: просто закрываем оверлей (если бонус не зарегистрировал обработчик)
        overlay.classList.add('bonus-overlay--leave');

        setTimeout(() => {
          overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
          overlay.style.display = 'none';

          // Keep DOM so an in-progress bonus can resume if user re-opens it
          // const container = overlay.querySelector('.bonus-container');
          // if (container) container.innerHTML = '';

          document.documentElement.classList.remove('bonus-active');
          document.body.classList.remove('bonus-active');
          const top = document.body.style.top;
          document.body.style.top = '';
          if (top) window.scrollTo(0, -parseInt(top, 10));
        }, 260);
      });
    }

    __wheelBonusMount().appendChild(overlay);
    return overlay;
  }

  // Экспортируем, чтобы другие бонус-скрипты могли создать/получить общий оверлей
  window.ensureBonusOverlay = ensureBonusOverlay;

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

  // 
  window.start5050Bonus = window.start5050Bonus || async function start5050Bonus(betAmount = 0, opts = {}) {
    const overlay = ensureBonusOverlay();
    const container = overlay.querySelector('.bonus-container') || overlay;

    const bonusId = opts?.bonusId ?? null;
    const sessions = window.__wheelBonusSessions || (window.__wheelBonusSessions = {});
    const sessionKey = `50&50:${bonusId || 'noid'}`;

    // ✅ Reuse running session: Back hides overlay, Watch should resume (no restart)
    const existing = sessions[sessionKey];
    if (existing && !existing.done) {
      wheelBonusOverlayActive = true;
      try { existing.instance?.show?.(); } catch (_) {}
      return existing.promise;
    }

    await ensureBonusClass();

    const hasBet = opts?.hasBet ?? (betAmount > 0);
    const durationSec = Number.isFinite(opts?.durationSec) ? Math.max(1, Math.ceil(opts.durationSec)) : 12;

    wheelBonusOverlayActive = true;

    let resolvePromise;
    const p = new Promise((resolve) => { resolvePromise = resolve; });

    sessions[sessionKey] = { promise: p, done: false, instance: null };

    const bonus = new window.Bonus5050(container, {
      boomSrc: 'images/boom.webp',
      particlesSrc: 'images/boomparticles.webp',
      lightningIcon: 'icons/lighting.webp',
      backIcon: 'icons/back.svg',
      hasBet,
      durationSec,
      remainingSec: opts?.remainingSec || null,
      outcome: opts?.outcome || null,

      onComplete: (result) => {
        console.log('[Wheel] 🎰 Bonus 50/50 finished, result:', result);
        wheelBonusOverlayActive = false;

        if (sessions[sessionKey]) {
          sessions[sessionKey].done = true;
          try { delete sessions[sessionKey]; } catch (_) {}
        }

        resolvePromise(result);
      },

      // ✅ Back now means "hide" (resume later), NOT cancel/restart
      onBack: () => {
        wheelBonusOverlayActive = false;
      }
    });

    sessions[sessionKey].instance = bonus;
    bonus.start();
    return p;
  };})();

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

