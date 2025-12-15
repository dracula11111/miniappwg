// public/js/lootrush.js - LOOT RUSH BONUS (CS:GO Style)
// 🎯 Timer moved to bottom
// 🎯 Rows shift like CS:GO cases (alternating directions)

console.log('[LootRush] 💼 Loading Loot Rush bonus system...');

class LootRush {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onComplete: typeof options.onComplete === 'function' ? options.onComplete : () => {},
      durationSec: Number.isFinite(options.durationSec) ? options.durationSec : 12,
      
      bagFolder: options.bagFolder || '/images/lootrush/',
      bagPrefix: options.bagPrefix || 'lootbag',
      bagExt: options.bagExt || '.png',
      bagSrc: options.bagSrc || '/images/bets/loot.png',
      
      multAppearDelay: 40,
      coverDelay: 30,
      spinFastMs: 2500,
      spinSlowMs: 1500,
      
      ...options
    };

    this._running = false;
    this._scrollY = 0;
    this._tiles = [];
    this._selectedIndex = 0;
    this._selectEnabled = false;
    this._multipliers = [];
    this._spinning = false;
    this._spinTimer = null;
    this._rowBagSrcs = [[], [], [], [], []];
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

  _buildMultipliersPool() {
    const pool = [];
    const pushN = (v, n) => { for (let i = 0; i < n; i++) pool.push(v); };
    
    pushN(1.1, 7);
    pushN(1.5, 6);
    pushN(2, 5);
    pushN(4, 3);
    pushN(8, 2);
    pushN(10, 1);
    pushN(25, 1);
    
    while (pool.length < 25) pool.push(1.1);
    return pool.slice(0, 25);
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
    for (let i = 0; i < 25; i++) {
      bagSrcs.push(this._getBagSrc(i));
    }

    // 🔥 FIXED LAYOUT: Grid first, then bottom section with title + timer
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
          <div class="lr-timer" id="lrTimer">${this.options.durationSec}</div>
        </div>
      </div>
    `;

    this._tiles = Array.from(this.container.querySelectorAll('.lr-tile'));
    
    for (let r = 0; r < 5; r++) {
      this._rowBagSrcs[r] = [];
      for (let c = 0; c < 5; c++) {
        this._rowBagSrcs[r].push(bagSrcs[r * 5 + c]);
      }
    }

    return {
      grid: this.container.querySelector('#lrGrid'),
      timer: this.container.querySelector('#lrTimer'),
      title: this.container.querySelector('#lrTitle')
    };
  }

  _rowMajorOrder() {
    return Array.from({ length: 25 }, (_, i) => i);
  }

  _colMajorOrder() {
    const order = [];
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        order.push(r * 5 + c);
      }
    }
    return order;
  }

  async _showMultipliers() {
    const order = this._rowMajorOrder();
    
    for (let k = 0; k < order.length; k++) {
      const idx = order[k];
      const tile = this._tiles[idx];
      if (tile) {
        tile.classList.add('lr-mult-show');
      }
      await this._wait(this.options.multAppearDelay);
    }
    
    await this._wait(2000);
  }

  async _coverWithBags() {
    const order = this._colMajorOrder();
    
    for (let k = 0; k < order.length; k++) {
      const idx = order[k];
      const tile = this._tiles[idx];
      if (tile) {
        tile.classList.add('lr-covered');
      }
      await this._wait(this.options.coverDelay);
    }
    
    await this._wait(300);
  }

  // 🎰 CS:GO Style Spinning with SMOOTH transitions
  async _spinRows() {
    this._spinning = true;
    this._tiles.forEach(t => t.classList.add('lr-spinning'));

    const startTime = Date.now();
    const duration = this.options.spinFastMs + this.options.spinSlowMs;
    
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

      // 🔥 Shift each row (CS:GO style - alternating directions)
      for (let r = 0; r < 5; r++) {
        const direction = (r % 2 === 0) ? 1 : -1; // Even rows right, odd rows left
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
    if (!srcs || srcs.length !== 5) return;

    // Shift bag sources
    if (direction > 0) {
      srcs.unshift(srcs.pop()); // Shift right
    } else {
      srcs.push(srcs.shift()); // Shift left
    }

    // 🔥 Update DOM with SMOOTH fade transition
    for (let c = 0; c < 5; c++) {
      const idx = row * 5 + c;
      const tile = this._tiles[idx];
      if (!tile) continue;

      const img = tile.querySelector('.lr-bag');
      if (img) {
        // Fade out
        img.style.transition = 'opacity 0.15s ease';
        img.style.opacity = '0';
        
        // Change source and fade in
        setTimeout(() => {
          img.src = srcs[c];
          img.style.opacity = '1';
        }, 75); // Half of transition time
      }
    }

    // 🔥 Shift multipliers to match
    const base = row * 5;
    const rowMults = this._multipliers.slice(base, base + 5);
    if (direction > 0) {
      rowMults.unshift(rowMults.pop());
    } else {
      rowMults.push(rowMults.shift());
    }

    for (let c = 0; c < 5; c++) {
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
        if (!this._selectEnabled) return;
        this._selectedIndex = i;
        this._applySelection();
      };
    });

    this._selectedIndex = 0;
    this._applySelection();
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
    this._selectEnabled = false;
    
    const order = this._rowMajorOrder();
    
    for (let k = 0; k < order.length; k++) {
      const idx = order[k];
      const tile = this._tiles[idx];
      if (tile) {
        tile.classList.add('lr-reveal');
        
        if (idx === pickedIdx) {
          setTimeout(() => {
            tile.classList.add('lr-picked', 'lr-winner');
          }, 200);
        }
      }
      await this._wait(30);
    }

    await this._wait(4000);
  }

  async start() {
    if (this._running) return;
    this._running = true;

    const overlay = this._overlayEl();
    if (!overlay || !this.container) {
      this._running = false;
      this.options.onComplete('1.1x', 1.1);
      return;
    }

    overlay.style.display = 'flex';
    overlay.classList.add('bonus-overlay--active');
    this._lockScroll();

    let chosenMult = 1.1;

    try {
      this._multipliers = this._buildMultipliersPool();
      this._shuffleArray(this._multipliers);

      const bagSrcs = Array.from({ length: 25 }, (_, i) => this._getBagSrc(i));
      await this._preloadImages(bagSrcs);

      const ui = this._render();
      await this._wait(300);

      await this._showMultipliers();
      await this._coverWithBags();
      await this._spinRows();

      this._enableSelection();
      if (ui.title) ui.title.classList.add('lr-show');

      const pickedIdx = await this._runCountdown(ui.timer, this.options.durationSec);
      await this._revealSequence(pickedIdx);

      chosenMult = this._multipliers[pickedIdx] || 1.1;

      await this._wait(1500);

    } catch (e) {
      console.error('[LootRush] ❌ Error:', e);
    } finally {
      overlay.classList.add('bonus-overlay--leave');
      await this._wait(300);

      overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
      overlay.style.display = 'none';

      this.container.innerHTML = '';
      this._unlockScroll();
      this._running = false;

      this.options.onComplete(this._fmtX(chosenMult), chosenMult);
    }
  }
}

window.LootRush = LootRush;
console.log('[LootRush] ✅ Class exported to window.LootRush');

(function() {
  window.startLootRushBonus = window.startLootRushBonus || async function startLootRushBonus(betAmount = 0) {
    console.log('[LootRush] 🎁 Starting bonus with bet:', betAmount);

    const overlay = document.getElementById('bonus5050Overlay');
    if (!overlay) {
      console.error('[LootRush] ❌ Overlay not found');
      return '1.1x';
    }

    const container = overlay.querySelector('.bonus-container') || 
                     overlay.querySelector('#bonus5050Container');

    if (!container) {
      console.error('[LootRush] ❌ Container not found');
      return '1.1x';
    }

    return new Promise((resolve) => {
      const bonus = new LootRush(container, {
        durationSec: 12,
        bagFolder: '/images/lootrush/',
        bagPrefix: 'lootbag',
        bagExt: '.png',

        onComplete: (xStr, mult) => {
          console.log('[LootRush] ✅ Completed:', xStr, 'multiplier:', mult);

          const currency = window.currentCurrency || 'ton';
          const m = Number(mult);
          const bet = Number(betAmount) || 0;

          if (bet > 0 && Number.isFinite(m)) {
            const rawWin = bet * m;
            const winAmount = (currency === 'stars') 
              ? Math.round(rawWin) 
              : +rawWin.toFixed(2);

            console.log('[LootRush] 💰 Win:', winAmount, currency);

            if (typeof window.showWinNotification === 'function') {
              try {
                window.showWinNotification(winAmount);
              } catch (e) {
                console.error('[LootRush] Notification error:', e);
              }
            }

            if (window.TEST_MODE && typeof window.addWinAmount === 'function') {
              try {
                window.addWinAmount(winAmount, currency);
              } catch (e) {
                console.error('[LootRush] Balance error:', e);
              }
            }
          }

          resolve(xStr);
        }
      });

      bonus.start();
    });
  };

  console.log('[LootRush] ✅ startLootRushBonus function exported');
})();