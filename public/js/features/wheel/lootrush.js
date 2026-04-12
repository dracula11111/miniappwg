// public/js/lootrush.js - LOOT RUSH BONUS (CS:GO Style)
// 🎯 Timer moved to bottom and HIDDEN until selection
// 🎯 Rows shift randomly (not just shift)
// 🎯 Time reduced to 10 seconds

console.log('[LootRush] 💼 Loading Loot Rush bonus system...');

class LootRush {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onComplete: typeof options.onComplete === 'function' ? options.onComplete : () => {},
      onBack: typeof options.onBack === 'function' ? options.onBack : () => {},
      durationSec: Number.isFinite(options.durationSec) ? options.durationSec : 10,
      remainingSec: Number.isFinite(options.remainingSec) ? Math.max(1, Math.ceil(options.remainingSec)) : null,
      hasBet: options.hasBet !== false,
      
      bagFolder: options.bagFolder || '/images/lootrush/',
      bagPrefix: options.bagPrefix || 'lootbag',
      bagExt: options.bagExt || '.png',
      bagSrc: options.bagSrc || '/images/bets/loot.png',
      
      multAppearDelay: 40,
      coverDelay: 20,  // Ускорено с 30
      spinFastMs: 1500,  // Ускорено с 2500
      spinSlowMs: 1000,   // Ускорено с 1500
      
      ...options
    };
    
    // 🔥 Пул всех сумок для рандомизации
    this._allBagSrcs = [];

    this._running = false;
    this._aborted = false;
    this._scrollY = 0;
    this._tiles = [];
    this._selectedIndex = -1;
    this._selectEnabled = false;
    this._selectionLocked = false;
    this._lastSelectionAt = 0;
    this._multipliers = [];
    this._spinning = false;
    this._spinTimer = null;
    this._rowBagSrcs = [[], [], [], [], []];
    this._forcedPickIndex = null;
    this._forcedMultiplier = null;
    this._sharedWinnerIndex = 0;
    this._seedBase = String(this.options?.bonusId || this.options?.sessionKey || 'lootrush');
    this._layoutRand = Math.random;
    this._bagRand = Math.random;
    this._lastNoBetToastAt = 0;
    this._noBetOverlayTimer = null;
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  
  _fmtX(v) {
    const num = Number(v);
    if (!Number.isFinite(num)) return '1.1x';
    const isInt = Math.abs(num - Math.round(num)) < 1e-9;
    return (isInt ? String(Math.round(num)) : num.toFixed(1)) + 'x';
  }

  _hashSeed(value) {
    const str = String(value || 'lootrush');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  _makeRng(seedInt) {
    let a = (seedInt >>> 0) || 0x9e3779b9;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _buildDeterministicRandom(scope = 'default') {
    const seed = this._hashSeed(`${this._seedBase}:${scope}`);
    return this._makeRng(seed);
  }

  _pickSharedWinnerIndex(totalTiles = 24) {
    const max = Math.max(1, Number(totalTiles) || 24);
    const pickRand = this._buildDeterministicRandom('winner');
    return Math.floor(pickRand() * max);
  }

  _overlayEl() { 
    return document.getElementById('bonus5050Overlay');
  }

  _lockScroll() {
    this._scrollY = window.scrollY || 0;
    document.documentElement.classList.add('bonus-active');
    document.body.classList.add('bonus-active');
    document.body.style.top = `-${this._scrollY}px`;
  }

  _unlockScroll() {
    document.documentElement.classList.remove('bonus-active');
    document.body.classList.remove('bonus-active');
    const top = document.body.style.top;
    document.body.style.top = '';
    window.scrollTo(0, top ? -parseInt(top, 10) : this._scrollY);
  }


  _flashDenied(el) {
    if (!el) return;
    const _prevBox = el.style.boxShadow;
    const _prevTf = el.style.transform;
    el.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 0.95) inset, 0 0 18px rgba(239, 68, 68, 0.25)';
    el.style.transform = 'scale(1.03)';
    el.classList.add('insufficient-balance');
    setTimeout(() => {
      el.classList.remove('insufficient-balance');
      el.style.boxShadow = _prevBox;
      el.style.transform = _prevTf;
    }, 800);
  }

  _notifyNoBet(el) {
    this._flashDenied(el);

    const now = Date.now();
    if (now - this._lastNoBetToastAt < 700) return;
    this._lastNoBetToastAt = now;
    this._showNoBetOverlayNotice('\u0412\u044b \u043d\u0435 \u043f\u043e\u0441\u0442\u0430\u0432\u0438\u043b\u0438 \u043d\u0430 Loot Rush');

    try {
      const msg = 'Вы не поставили на Loot Rush';
      if (typeof window.showToast === 'function') {
        window.showToast(msg, { variant: 'warning', ttl: 1800, translate: false });
      } else if (typeof window.notify === 'function') {
        window.notify(msg, { variant: 'warning', ttl: 1800, translate: false });
      } else if (typeof window.showInsufficientBalanceNotification === 'function') {
        // Fallback toast if global showToast is not available.
        window.showInsufficientBalanceNotification();
      }
    } catch (_) {}

    try {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('warning');
    } catch (_) {}
  }

  _showNoBetOverlayNotice(message) {
    const notice = this.container?.querySelector('#lrNoBetNotice');
    if (!notice) return false;

    notice.textContent = message;
    notice.classList.remove('lr-overlay-notice--visible');
    void notice.offsetWidth;
    notice.classList.add('lr-overlay-notice--visible');

    if (this._noBetOverlayTimer) {
      clearTimeout(this._noBetOverlayTimer);
      this._noBetOverlayTimer = null;
    }
    this._noBetOverlayTimer = setTimeout(() => {
      notice.classList.remove('lr-overlay-notice--visible');
      this._noBetOverlayTimer = null;
    }, 2200);

    return true;
  }

  // Soft show/hide (Back hides overlay; Watch resumes)
  show() {
    const overlay = this._overlayEl();
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.classList.add('bonus-overlay--active');
    this._setGlobalBackHandler();
    this._lockScroll();
  }

  hide() {
    const overlay = this._overlayEl();
    if (!overlay) return;

    overlay.classList.remove('bonus-overlay--active');
    overlay.style.display = 'none';

    // Allow user to continue using the app while bonus continues in background
    this._unlockScroll();

    try {
      if (typeof this.options.onBack === 'function') this.options.onBack();
    } catch (_) {}
  }


  _setGlobalBackHandler() {
    this._backHandler = () => this.hide();
    window.__bonusBackHandler = this._backHandler;
  }

  _clearGlobalBackHandler() {
    if (window.__bonusBackHandler === this._backHandler) {
      window.__bonusBackHandler = null;
    }
    this._backHandler = null;
  }

  // Public: called by universal Back button
  // Public: called by universal Back button
  abort() {
    if (!this._running) return;
    
    // 🔥 Вызываем callback onBack - он может прервать закрытие
    try {
      this.options.onBack();
    } catch (e) {
      console.error('[LootRush] onBack error:', e);
    }
    
    this._aborted = true;
    this._running = false;
    this._selectEnabled = false;
    this._spinning = false;

    if (this._spinTimer) {
      clearTimeout(this._spinTimer);
      this._spinTimer = null;
    }
  }
  _buildMultipliersPool() {
    const pool = [];
    const pushN = (v, n) => { for (let i = 0; i < n; i++) pool.push(v); };
    
    // 🎯 4x6 grid = 24 tiles
    pushN(1.1, 8);
    pushN(1.5, 6);
    pushN(2, 4);
    pushN(4, 3);
    pushN(8, 2);
    pushN(25, 1);
    
    while (pool.length < 24) pool.push(1.1);
    return pool.slice(0, 24);
  }

  _shuffleArray(arr, randFn = this._layoutRand) {
    const rnd = (typeof randFn === 'function') ? randFn : Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  _getBagSrc(i) {
    const n = i + 1;
    return `${this.options.bagFolder}${this.options.bagPrefix}${n}${this.options.bagExt}`;
  }
  
  // 🔥 Get random bag from pool (4x4 = 16 bags)
  _getRandomBagSrc() {
    if (this._allBagSrcs.length === 0) return this._getBagSrc(0);
    const idx = Math.floor(this._bagRand() * this._allBagSrcs.length);
    return this._allBagSrcs[idx];
  }

  async _preloadImages(srcs) {
    const promises = srcs.map(src => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => {
          console.warn(`[LootRush] ⚠️ Failed to load: ${src}`);
          resolve(false);
        };
        img.src = src;
      });
    });
    
    await Promise.all(promises);
  }

  _render() {
    const bagSrcs = [];
    for (let i = 0; i < 24; i++) {
      bagSrcs.push(this._getBagSrc(i));
    }
    
    // 🔥 Initialize pool of all bags (24 for 4x6)
    this._allBagSrcs = [...bagSrcs];

    // 🔥 FIXED LAYOUT: Grid first, then bottom section with title + timer (СКРЫТ)
    this.container.innerHTML = `
      <div class="lr-cutscene">
        <div class="lr-grid" id="lrGrid">
          ${this._multipliers.map((mult, i) => `
            <button type="button" class="lr-tile" data-index="${i}">
              <div class="lr-mult"></div>
              <img class="lr-bag" src="${bagSrcs[i]}" alt="" draggable="false" />
            </button>
          `).join('')}
        </div>
        
        <div class="lr-bottom">
          <div class="lr-title" id="lrTitle">Choose your loot bag</div>
          <div class="lr-timer lr-timer-hidden" id="lrTimer">${this.options.durationSec}</div>
          <div class="lr-overlay-notice" id="lrNoBetNotice" role="status" aria-live="polite"></div>
        </div>
      </div>
    `;

    this._tiles = Array.from(this.container.querySelectorAll('.lr-tile'));
    
    for (let r = 0; r < 6; r++) {
      this._rowBagSrcs[r] = [];
      for (let c = 0; c < 4; c++) {
        this._rowBagSrcs[r].push(bagSrcs[r * 4 + c]);
      }
    }

    return {
      grid: this.container.querySelector('#lrGrid'),
      timer: this.container.querySelector('#lrTimer'),
      title: this.container.querySelector('#lrTitle')
    };
  }

  _rowMajorOrder() {
    return Array.from({ length: 24 }, (_, i) => i);
  }

  _colMajorOrder() {
    const order = [];
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 6; r++) {
        order.push(r * 4 + c);
      }
    }
    return order;
  }

  async _showMultipliers() {
    // 🔥 УБРАНО: Множители НЕ показываются в начале для честности игры
    // Они будут видны только во время reveal
    if (!this._running) return;
    await this._wait(100);
  }

  async _coverWithBags() {
    if (!this._running) return;
    const order = this._colMajorOrder();
    
    for (let k = 0; k < order.length; k++) {
      if (!this._running) return;
      const idx = order[k];
      const tile = this._tiles[idx];
      if (tile) {
        tile.classList.add('lr-covered');
      }
      await this._wait(Math.max(10, this.options.coverDelay / (this.speedupFactor || 1)));
    }
    
    await this._wait(Math.max(100, 300 / (this.speedupFactor || 1)));
  }

  // 🎰 CS:GO Style Spinning with SMOOTH transitions
  async _spinRows() {
    this._spinning = true;
    this._tiles.forEach(t => t.classList.add('lr-spinning'));

    const startTime = Date.now();
    const duration = Math.max(500, (this.options.spinFastMs + this.options.spinSlowMs) / (this.speedupFactor || 1));
    
    let currentSpeed = 120; // Start speed (ms per shift)
    const minSpeed = 50;     // Fastest speed
    const maxSpeed = 300;    // Slowest speed (at end)

    const tick = () => {
      if (!this._spinning) return;

      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      // 🎯 Speed curve: slow -> fast -> slow
      if (progress < 0.3) {
        // Accelerate
        currentSpeed = 120 - (progress / 0.3) * (120 - minSpeed);
      } else if (progress < 0.7) {
        // Maintain fast speed
        currentSpeed = minSpeed;
      } else {
        // Decelerate
        const slowProgress = (progress - 0.7) / 0.3;
        currentSpeed = minSpeed + slowProgress * (maxSpeed - minSpeed);
      }

     
    // Shift each row (CS:GO style - alternating directions)
    for (let r = 0; r < 6; r++) {
      const direction = (r % 2 === 0) ? 1 : -1;
      this._shiftRow(r, direction);
    }

      if (progress >= 1) {
        this._spinning = false;
        this._tiles.forEach(t => t.classList.remove('lr-spinning'));
        return;
      }

      this._spinTimer = setTimeout(tick, Math.floor(currentSpeed));
    };

    tick();

    await this._wait(duration + 100);
    
    if (this._spinTimer) {
      clearTimeout(this._spinTimer);
      this._spinTimer = null;
    }
    
    this._spinning = false;
    this._tiles.forEach(t => t.classList.remove('lr-spinning'));
  }

  _shiftRow(row, direction) {
    const srcs = this._rowBagSrcs[row];
    if (!srcs || srcs.length !== 4) return;

    // 🔥 RANDOMIZATION: instead of shifting array, generate random bags
    for (let c = 0; c < 4; c++) {
      srcs[c] = this._getRandomBagSrc();
    }

    // 🔥 Update DOM with SMOOTH fade transition
    for (let c = 0; c < 4; c++) {
      const idx = row * 4 + c;

      const tile = this._tiles[idx];
      if (!tile) continue;

      const img = tile.querySelector('.lr-bag');
      if (img) {
        // Fade out
        img.style.transition = 'opacity 0.12s ease, transform 0.12s ease';
        img.style.opacity = '0';
        img.style.transform = 'scale(0.9)';
        
        // Change source and fade in
        setTimeout(() => {
          img.src = srcs[c];
          img.style.opacity = '1';
          img.style.transform = 'scale(1)';
        }, 60);
      }
    }

  }

  _enableSelection() {
    this._selectEnabled = true;
    this._selectionLocked = false;
    this._selectedIndex = -1;

    this._tiles.forEach((tile, i) => {
      tile.classList.add('lr-selectable');
      const handleSelect = (ev) => {
        if (ev && typeof ev.preventDefault === 'function' && ev.cancelable) ev.preventDefault();
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();

        // Watch-only mode: no bet -> cannot select.
        if (this.options.hasBet === false) {
          this._notifyNoBet(tile);
          return;
        }
        if (!this._selectEnabled || this._selectionLocked) return;
        this._selectedIndex = i;
        this._lastSelectionAt = Date.now();
        this._applySelection();
      };

      // Mobile-safe: pointer/touch fires immediately, click can be delayed in WebView.
      tile.onpointerdown = handleSelect;
      tile.ontouchstart = handleSelect;
      tile.onclick = handleSelect;
    });

    this._applySelection();

    const timer = this.container.querySelector('#lrTimer');
    if (timer) {
      timer.classList.remove('lr-timer-hidden');
      setTimeout(() => timer.classList.add('lr-timer-visible'), 50);
    }
  }

  _applySelection() {
    this._tiles.forEach((t, i) => {
      if (Number.isInteger(this._selectedIndex) && this._selectedIndex >= 0 && i === this._selectedIndex) {
        t.classList.add('lr-selected');
      } else {
        t.classList.remove('lr-selected');
      }
    });
  }

  async _runCountdown(timerEl, seconds) {
    let left = Math.max(0, Math.floor(seconds));
    
    const tick = async () => {
      if (!this._running) return;
      
      if (timerEl) {
        timerEl.textContent = String(left);
        timerEl.classList.remove('lr-timer-pulse');
        void timerEl.offsetWidth;
        timerEl.classList.add('lr-timer-pulse');
      }
      
      if (left <= 0) return;
      
      left--;
      await this._wait(1000);
      await tick();
    };

    await tick();

    // Freeze selected index at timer end so late click events cannot overwrite it.
    this._selectionLocked = true;
    this._selectEnabled = false;
    this._tiles.forEach((tile) => {
      if (tile) tile.classList.remove('lr-selectable');
    });
    return this._selectedIndex;
  }

  async _revealSequence(winnerIdx) {
    if (!this._running) return;
    this._selectEnabled = false;
    
    // 🔥 ОПТИМИЗИРОВАНО: Показываем все сразу без задержек
    this._tiles.forEach((tile, idx) => {
      if (tile) {
        // Убираем сумку (поднимаем вверх) и показываем множитель
        const multEl = tile.querySelector('.lr-mult');
        if (multEl) multEl.textContent = this._fmtX(this._multipliers[idx]);
        tile.classList.remove('lr-covered');
        tile.classList.add('lr-reveal');
        
        // Помечаем выбранную сумку
        if (idx === winnerIdx) {
          tile.classList.add('lr-picked', 'lr-winner');
        } else {
          tile.classList.remove('lr-picked', 'lr-winner');
        }
      }
    });
  
    await this._wait(2000); // Сокращено с 4000 до 2000
  }

  async start() {
    if (this._running) return;
    this._running = true;
    this._aborted = false;

    const overlay = this._overlayEl();
    if (!overlay || !this.container) {
      this._running = false;
      this.options.onComplete('1.1x', 1.1);
      return;
    }

    overlay.style.display = 'flex';
    overlay.classList.add('bonus-overlay--active');
    this._setGlobalBackHandler();
    this._lockScroll();
    
    // 🔥 Вычисляем speedupFactor заранее для ускорения всех анимаций
    const effectiveDuration = this.options.remainingSec || this.options.durationSec;
    const speedupFactor = this.options.durationSec / effectiveDuration;
    this.speedupFactor = speedupFactor;

    const forcedOutcome = this.options?.outcome || null;
    const forcedMultiplierNum = Number(forcedOutcome?.multiplier);
    this._forcedMultiplier = Number.isFinite(forcedMultiplierNum) ? forcedMultiplierNum : null;

    const forcedIndexRaw = Number(forcedOutcome?.pickedIndex);
    this._forcedPickIndex = Number.isInteger(forcedIndexRaw) && forcedIndexRaw >= 0 && forcedIndexRaw < 24
      ? forcedIndexRaw
      : null;

    let chosenMult = 1.1;

    try {
      this._seedBase = String(this.options?.bonusId || this.options?.sessionKey || 'lootrush');
      this._layoutRand = this._buildDeterministicRandom('layout');
      this._bagRand = this._buildDeterministicRandom('bags');

      this._multipliers = this._buildMultipliersPool();
      this._shuffleArray(this._multipliers, this._layoutRand);

      const deterministicWinner = this._pickSharedWinnerIndex(this._multipliers.length);
      const winnerIndex = Number.isInteger(this._forcedPickIndex)
        ? this._forcedPickIndex
        : deterministicWinner;
      this._sharedWinnerIndex = winnerIndex;

      if (Number.isFinite(this._forcedMultiplier)) {
        const targetIndex = this._sharedWinnerIndex;
        const srcIndex = this._multipliers.findIndex((v) => Number(v) === Number(this._forcedMultiplier));
        if (srcIndex >= 0 && srcIndex !== targetIndex) {
          const tmp = this._multipliers[targetIndex];
          this._multipliers[targetIndex] = this._multipliers[srcIndex];
          this._multipliers[srcIndex] = tmp;
        } else if (srcIndex < 0) {
          this._multipliers[targetIndex] = Number(this._forcedMultiplier);
        }
        this._sharedWinnerIndex = targetIndex;
      }

      const bagSrcs = Array.from({ length: 24 }, (_, i) => this._getBagSrc(i));
      await this._preloadImages(bagSrcs);

      const ui = this._render();
      await this._wait(Math.max(100, 300 / speedupFactor));
      if (this._aborted) return;


      await this._showMultipliers();
      if (this._aborted) return;

      await this._coverWithBags();
      if (this._aborted) return;

      await this._spinRows();
      if (this._aborted) return;


      this._enableSelection();
      if (ui.title) ui.title.classList.add('lr-show');

      // 🔥 Используем оставшееся время если оно передано (для случая когда пользователь зашел в середине бонуса)
      const pickedRaw = await this._runCountdown(ui.timer, effectiveDuration);
      let pickedIdx = (
        Number.isInteger(pickedRaw) &&
        pickedRaw >= 0 &&
        pickedRaw < this._tiles.length
      ) ? pickedRaw : null;

      // Watch-only players must never get an auto-picked/highlighted bag.
      if (this.options.hasBet === false) {
        pickedIdx = null;
      }

      const serverPayoutMode = window.__wheelPayoutMode === 'server';
      const hasServerOutcome = Number.isFinite(this._forcedMultiplier) || Number.isInteger(this._forcedPickIndex);
      const hasPickedIndex = Number.isInteger(pickedIdx);
      const revealIndex = hasPickedIndex ? pickedIdx : this._sharedWinnerIndex;

      // Keep server-authoritative payout, but always reveal/highlight the bag chosen by player.
      // We remap multiplier into picked slot so visual pick and outcome never diverge.
      if (
        serverPayoutMode &&
        hasServerOutcome &&
        hasPickedIndex &&
        Number.isInteger(this._sharedWinnerIndex) &&
        this._sharedWinnerIndex >= 0 &&
        this._sharedWinnerIndex < this._multipliers.length &&
        pickedIdx !== this._sharedWinnerIndex
      ) {
        const tmp = this._multipliers[pickedIdx];
        this._multipliers[pickedIdx] = this._multipliers[this._sharedWinnerIndex];
        this._multipliers[this._sharedWinnerIndex] = tmp;
      }

      if (this._aborted) return;

      await this._revealSequence(revealIndex);
      if (this._aborted) return;


      chosenMult = Number.isInteger(revealIndex)
        ? Number(this._multipliers[revealIndex] || 1.1)
        : NaN;

      await this._wait(Math.max(200, 800 / speedupFactor));  // Сокращено с 1500

    } catch (e) {
      console.error('[LootRush] ❌ Error:', e);
    } finally {
      overlay.classList.add('bonus-overlay--leave');
      await this._wait(Math.max(100, 300 / speedupFactor));

      overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
      overlay.style.display = 'none';

      if (this._noBetOverlayTimer) {
        clearTimeout(this._noBetOverlayTimer);
        this._noBetOverlayTimer = null;
      }

      this.container.innerHTML = '';
      this._unlockScroll();
      this._running = false;

      this._clearGlobalBackHandler();
      this._forcedPickIndex = null;
      this._forcedMultiplier = null;
      this._sharedWinnerIndex = 0;

      if (this._aborted) {
        this.options.onComplete('cancelled', NaN);
      } else {
        if (Number.isFinite(chosenMult)) {
          this.options.onComplete(this._fmtX(chosenMult), chosenMult);
        } else {
          this.options.onComplete('no_pick', NaN);
        }
      }
    }
  }
}

window.LootRush = LootRush;
console.log('[LootRush] ✅ Class exported to window.LootRush');

(function() {
  window.startLootRushBonus = window.startLootRushBonus || async function startLootRushBonus(betAmount = 0, opts = {}) {
    console.log('[LootRush] 🎁 Starting bonus with bet:', betAmount);

    const bonusId = opts?.bonusId ?? null;
    const sessions = window.__wheelBonusSessions || (window.__wheelBonusSessions = {});
    const explicitSessionKey = (opts && typeof opts.sessionKey === 'string' && opts.sessionKey.trim())
      ? opts.sessionKey.trim()
      : null;
    const randomSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const sessionKey = explicitSessionKey || (bonusId ? `LootRush:${bonusId}` : `LootRush:local:${randomSuffix}`);

    // ✅ Reuse running session: Back hides overlay, Watch should resume (no restart)
    const existing = sessions[sessionKey];
    if (existing && !existing.done) {
      try { existing.instance?.show?.(); } catch (_) {}
      return existing.promise;
    }

    // ВСЕГДА вызываем ensureBonusOverlay для проверки/создания кнопки Back
    let overlay;
    if (typeof window.ensureBonusOverlay === 'function') {
      overlay = window.ensureBonusOverlay();
    } else {
      overlay = document.getElementById('bonus5050Overlay');
    }

    if (!overlay) {
      console.error('[LootRush] ❌ Overlay not found');
      return '1.1x';
    }

    // Debug: проверяем наличие кнопки Back
    const backBtn = overlay.querySelector('.universal-back-btn');
    console.log('[LootRush] 🔍 Back button check:', backBtn ? '✅ Found' : '❌ Not found');
    if (backBtn) {
      console.log('[LootRush] 🔍 Back button styles:', {
        display: window.getComputedStyle(backBtn).display,
        opacity: window.getComputedStyle(backBtn).opacity,
        zIndex: window.getComputedStyle(backBtn).zIndex
      });
    }

    const container = overlay.querySelector('.bonus-container') || 
                     overlay.querySelector('#bonus5050Container');

    if (!container) {
      console.error('[LootRush] ❌ Container not found');
      return '1.1x';
    }

    const hasBet = opts?.hasBet ?? (betAmount > 0);
    const durationSec = Number.isFinite(opts?.durationSec) ? Math.max(1, Math.ceil(opts.durationSec)) : 10;
    const remainingSec = Number.isFinite(opts?.remainingSec) ? Math.max(1, Math.ceil(opts.remainingSec)) : null;

    let resolvePromise;
    const p = new Promise((resolve) => { resolvePromise = resolve; });

    sessions[sessionKey] = { promise: p, done: false, instance: null };

    const bonus = new LootRush(container, {
      durationSec: durationSec,
      remainingSec: remainingSec,
      hasBet,
      bonusId: bonusId,
      sessionKey: sessionKey,
      outcome: opts?.outcome || null,

      bagFolder: '/images/lootrush/',
      bagPrefix: 'lootbag',
      bagExt: '.png',

      // Back = hide (resume later) — do not resolve/cancel
      onBack: () => {},

      onComplete: (xStr, mult) => {
        console.log('[LootRush] ✅ Completed:', xStr, 'multiplier:', mult);

        const serverPayoutMode = window.__wheelPayoutMode === 'server';
        const currency = window.currentCurrency || 'ton';
        const m = Number(mult);
        const bet = Number(betAmount) || 0;

        if (!serverPayoutMode && bet > 0 && Number.isFinite(m)) {
          const rawWin = bet * m;
          const winAmount = (currency === 'stars') 
            ? Math.round(rawWin) 
            : +rawWin.toFixed(2);

          console.log('[LootRush] 💰 Win:', winAmount, currency);

          if (typeof window.showWinNotification === 'function') {
            try {
              window.showWinNotification(winAmount);
            } catch (e) {
              console.error('[LootRush] showWinNotification error:', e);
            }
          }

          if (typeof window.addWinAmount === 'function') {
            try {
              window.addWinAmount(winAmount, currency);
            } catch (e) {
              console.error('[LootRush] Balance error:', e);
            }
          }
        }

        // mark session done
        if (sessions[sessionKey]) {
          sessions[sessionKey].done = true;
          try { delete sessions[sessionKey]; } catch (_) {}
        }

        try {
          if (bonusId && typeof window.__notifyBonusOverlayDone === 'function') {
            window.__notifyBonusOverlayDone(bonusId);
          }
        } catch (_) {}

        resolvePromise(xStr);
      }
    });

    sessions[sessionKey].instance = bonus;
    bonus.start();
    return p;
  };  console.log('[LootRush] ✅ startLootRushBonus function exported');
})();
