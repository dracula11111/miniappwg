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
    this._selectedIndex = 0;
    this._selectEnabled = false;
    this._multipliers = [];
    this._spinning = false;
    this._spinTimer = null;
    this._rowBagSrcs = [[], [], [], [], []];
    this._forcedPickIndex = null;
    this._forcedMultiplier = null;
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  
  _fmtX(v) {
    const num = Number(v);
    if (!Number.isFinite(num)) return '1.1x';
    const isInt = Math.abs(num - Math.round(num)) < 1e-9;
    return (isInt ? String(Math.round(num)) : num.toFixed(1)) + 'x';
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


  _flashInsufficient(el) {
    try {
      if (typeof window.showInsufficientBalanceNotification === 'function') {
        window.showInsufficientBalanceNotification();
      }
    } catch (_) {}

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

  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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
    const idx = Math.floor(Math.random() * this._allBagSrcs.length);
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
              <div class="lr-mult">${this._fmtX(mult)}</div>
              <img class="lr-bag" src="${bagSrcs[i]}" alt="" draggable="false" />
            </button>
          `).join('')}
        </div>
        
        <div class="lr-bottom">
          <div class="lr-title" id="lrTitle">Choose your loot bag</div>
          <div class="lr-timer lr-timer-hidden" id="lrTimer">${this.options.durationSec}</div>
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

    
    //  Shift multipliers to match (also randomize for effect)
    const base = row * 4;
    const rowMults = this._multipliers.slice(base, base + 4);
    
    // Shift multipliers in opposite direction from direction for effect
    if (direction > 0) {
      rowMults.unshift(rowMults.pop());
    } else {
      rowMults.push(rowMults.shift());
    }

    for (let c = 0; c < 4; c++) {
      this._multipliers[base + c] = rowMults[c];
      const tile = this._tiles[base + c];
      const multEl = tile?.querySelector('.lr-mult');
      if (multEl) multEl.textContent = this._fmtX(rowMults[c]);
    }
  }

  _enableSelection() {
    this._selectEnabled = true;

    this._tiles.forEach((tile, i) => {
      tile.classList.add('lr-selectable');
      tile.onclick = () => {
        // Watch-only mode: no bet -> cannot select.
        if (this.options.hasBet === false) {
          this._flashInsufficient(tile);
          return;
        }
        // Server-fixed outcome: keep selection locked for everyone.
        if (Number.isInteger(this._forcedPickIndex)) return;
        if (!this._selectEnabled) return;
        this._selectedIndex = i;
        this._applySelection();
      };
    });

    this._selectedIndex = Number.isInteger(this._forcedPickIndex) ? this._forcedPickIndex : 0;
    this._applySelection();

    const timer = this.container.querySelector('#lrTimer');
    if (timer) {
      timer.classList.remove('lr-timer-hidden');
      setTimeout(() => timer.classList.add('lr-timer-visible'), 50);
    }
  }

  _applySelection() {
    this._tiles.forEach((t, i) => {
      if (i === this._selectedIndex) {
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
    return this._selectedIndex;
  }

  async _revealSequence(pickedIdx) {
    if (!this._running) return;
    this._selectEnabled = false;
    
    // 🔥 ОПТИМИЗИРОВАНО: Показываем все сразу без задержек
    this._tiles.forEach((tile, idx) => {
      if (tile) {
        // Убираем сумку (поднимаем вверх) и показываем множитель
        tile.classList.remove('lr-covered');
        tile.classList.add('lr-reveal');
        
        // Помечаем выбранную сумку
        if (idx === pickedIdx) {
          tile.classList.add('lr-picked', 'lr-winner');
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
      this._multipliers = this._buildMultipliersPool();
      this._shuffleArray(this._multipliers);

      if (Number.isFinite(this._forcedMultiplier)) {
        const targetIndex = Number.isInteger(this._forcedPickIndex) ? this._forcedPickIndex : 0;
        const srcIndex = this._multipliers.findIndex((v) => Number(v) === Number(this._forcedMultiplier));
        if (srcIndex >= 0 && srcIndex !== targetIndex) {
          const tmp = this._multipliers[targetIndex];
          this._multipliers[targetIndex] = this._multipliers[srcIndex];
          this._multipliers[srcIndex] = tmp;
        } else if (srcIndex < 0) {
          this._multipliers[targetIndex] = Number(this._forcedMultiplier);
        }
        this._forcedPickIndex = targetIndex;
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
      let pickedIdx = await this._runCountdown(ui.timer, effectiveDuration);
      if (Number.isInteger(this._forcedPickIndex)) {
        pickedIdx = this._forcedPickIndex;
        this._selectedIndex = pickedIdx;
        this._applySelection();
      }
      if (Number.isFinite(this._forcedMultiplier) && Number.isInteger(pickedIdx)) {
        this._multipliers[pickedIdx] = Number(this._forcedMultiplier);
      }
      if (this._aborted) return;

      await this._revealSequence(pickedIdx);
      if (this._aborted) return;


      chosenMult = Number.isFinite(this._forcedMultiplier)
        ? Number(this._forcedMultiplier)
        : (this._multipliers[pickedIdx] || 1.1);

      await this._wait(Math.max(200, 800 / speedupFactor));  // Сокращено с 1500

    } catch (e) {
      console.error('[LootRush] ❌ Error:', e);
    } finally {
      overlay.classList.add('bonus-overlay--leave');
      await this._wait(Math.max(100, 300 / speedupFactor));

      overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
      overlay.style.display = 'none';

      this.container.innerHTML = '';
      this._unlockScroll();
      this._running = false;

      this._clearGlobalBackHandler();
      this._forcedPickIndex = null;
      this._forcedMultiplier = null;

      if (this._aborted) {
        this.options.onComplete('cancelled', NaN);
      } else {
        this.options.onComplete(this._fmtX(chosenMult), chosenMult);
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
    const sessionKey = `LootRush:${bonusId || 'noid'}`;

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

        resolvePromise(xStr);
      }
    });

    sessions[sessionKey].instance = bonus;
    bonus.start();
    return p;
  };  console.log('[LootRush] ✅ startLootRushBonus function exported');
})();
