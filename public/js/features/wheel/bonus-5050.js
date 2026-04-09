// public/js/bonus-5050.js - DUAL REELS + Lightning Icon VS + slow collide + boom + particles + winner reveal
// Exports: window.Bonus5050 (class) for wheel.js

console.log('[Bonus5050] 🎰 loaded (dual VS slow collide boom+particles v2 - lightning icon)');

class Bonus5050 {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onComplete: typeof options.onComplete === 'function' ? options.onComplete : () => {},
      durationSec: Number.isFinite(options.durationSec) ? options.durationSec : 15,
      remainingSec: Number.isFinite(options.remainingSec) ? Math.max(1, Math.ceil(options.remainingSec)) : null,
      boomSrc: options.boomSrc || 'images/boom.webp',
      particlesSrc: options.particlesSrc || 'images/boomparticles.webp',
      lightningIcon: options.lightningIcon || 'icons/decor/lighting.webp',
      backIcon: options.backIcon || 'icons/ui/back.svg',
      ...options
    };
    

    this._scrollLocked = false;

    this._running = false;
    this._scrollY = 0;

    // Pools
    this.GOOD_XS = [5, 6, 7, 8, 9, 10, 12, 15];
    this.BAD_XS  = [1.5, 2, 3, 4];
  }

  _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  _fmtX(v) { return `${Number.isInteger(v) ? v : String(v)}x`; }
  _overlayEl() { return document.getElementById('bonus5050Overlay'); }

  _hashSeed(value) {
    const str = String(value || 'bonus5050');
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

  _lockScroll() {
    const wheelPage = document.getElementById('wheelPage');
    const isWheelActive = !!(wheelPage && wheelPage.classList.contains('page-active'));
    if (!isWheelActive) return; // don't lock the whole app if user isn't on wheel

    this._scrollLocked = true;
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


  // Soft show/hide (used for Back -> hide, and Watch -> resume)
  show() {
    const overlay = document.getElementById('bonus5050Overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.classList.add('bonus-overlay--active');
    this._lockScroll();
    this._setGlobalBackHandler();
  }

  hide() {
    const overlay = document.getElementById('bonus5050Overlay');
    if (!overlay) return;

    overlay.classList.remove('bonus-overlay--active');
    overlay.style.display = 'none';

    // Allow user to continue using the app while bonus continues in background
    this._unlockScroll();

    try {
      if (typeof this.options.onBack === 'function') this.options.onBack();
    } catch (_) {}
  }

  _fxRoot() {
    // Keep all FX (boom/particles/flying labels) inside the bonus overlay so it only appears on Wheel page
    return (this.container && this.container.closest && this.container.closest('#bonus5050Overlay')) || this.container || document.body;
  }

  _setGlobalBackHandler() {
    // единый обработчик для универсальной кнопки Back в оверлее
    this._backHandler = () => this.hide();
    window.__bonusBackHandler = this._backHandler;
  }

  _clearGlobalBackHandler() {
    if (window.__bonusBackHandler === this._backHandler) {
      window.__bonusBackHandler = null;
    }
    this._backHandler = null;
  }

  async _closeOverlayAndCleanup() {
    const overlay = this._overlayEl();
    if (!overlay) return;

    overlay.classList.add('bonus-overlay--leave');
    await this._wait(260);

    overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
    overlay.style.display = 'none';

    if (this.container) this.container.innerHTML = '';
    this._unlockScroll();
  }

  // Public: called by universal Back button via window.__bonusBackHandler
  abort() {
    if (!this._running || this._completed) return;
    this._aborted = true;
    this._running = false;
    // fire and forget
    this._abort('cancelled');
  }

  async _abort(val = 'cancelled') {
    if (this._completed) return;
    this._completed = true;

    await this._closeOverlayAndCleanup();
    this._clearGlobalBackHandler();
    this._running = false;

    if (typeof this.options.onBack === 'function') {
      this.options.onBack();
    } else {
      this.options.onComplete(val);
    }
  }

  _render() {
    const bulbs = Array.from({ length: 9 }).map(() => `<span class="b5050-bulb"></span>`).join('');

    this.container.innerHTML = `
      <div class="b5050-cutscene">
        <div class="b5050-machine" id="b5050Machine">
          <div class="b5050-bulbs b5050-bulbs--top">${bulbs}</div>

          <div class="b5050-dual" id="b5050Dual">
            <div class="b5050-unit b5050-unit--good" id="b5050UnitGood">
              <div class="b5050-unitframe">
                <div class="b5050-pointer b5050-pointer--left" aria-hidden="true"></div>
                <div class="b5050-pointer b5050-pointer--right" aria-hidden="true"></div>

                <div class="b5050-window" id="b5050WindowGood">
                  <div class="b5050-track" id="b5050TrackGood"></div>
                  <div class="b5050-centerline" aria-hidden="true"></div>
                </div>
              </div>
            </div>

            <div class="b5050-vs" id="b5050VS" aria-label="versus">
              <img src="${this.options.lightningIcon}" alt="VS" class="b5050-lightning-icon">
            </div>

            <div class="b5050-unit b5050-unit--bad" id="b5050UnitBad">
              <div class="b5050-unitframe">
                <div class="b5050-pointer b5050-pointer--left" aria-hidden="true"></div>
                <div class="b5050-pointer b5050-pointer--right" aria-hidden="true"></div>

                <div class="b5050-window" id="b5050WindowBad">
                  <div class="b5050-track" id="b5050TrackBad"></div>
                  <div class="b5050-centerline" aria-hidden="true"></div>
                </div>
              </div>
            </div>

            <div class="b5050-result" id="b5050Result" aria-hidden="true"></div>
          </div>

          <div class="b5050-bulbs b5050-bulbs--bottom">${bulbs}</div>
        
    `;

    return {
      machine: this.container.querySelector('#b5050Machine'),
      dual: this.container.querySelector('#b5050Dual'),
      vs: this.container.querySelector('#b5050VS'),
      result: this.container.querySelector('#b5050Result'),
      timer: this.container.querySelector('#b5050Timer'),
      good: {
        unit: this.container.querySelector('#b5050UnitGood'),
        windowEl: this.container.querySelector('#b5050WindowGood'),
        track: this.container.querySelector('#b5050TrackGood'),
      },
      bad: {
        unit: this.container.querySelector('#b5050UnitBad'),
        windowEl: this.container.querySelector('#b5050WindowBad'),
        track: this.container.querySelector('#b5050TrackBad'),
      }
    };
  }

  async _countdown(timerEl, seconds) {
    for (let t = seconds; t >= 1; t--) {
      if (!this._running) return;
      timerEl.textContent = String(t);
      timerEl.classList.remove('pop');
      void timerEl.offsetHeight;
      timerEl.classList.add('pop');
      await this._wait(1000);
    }
    timerEl.textContent = '';
  }

  _buildReel(stopValue, pool) {
    const total = 50;
    const stopIndex = 38;
    const arr = [];
    for (let i = 0; i < total; i++) arr.push(pool[i % pool.length]);
    arr[stopIndex] = stopValue;
    return { arr, stopIndex };
  }

  async _spinReel(reelUi, stopValue, pool, { durationMs = 6000 } = {}) {
    const { track, windowEl } = reelUi;

    const { arr, stopIndex } = this._buildReel(stopValue, pool);
    track.innerHTML = arr.map(v => `<div class="b5050-cell">${this._fmtX(v)}</div>`).join('');

    await new Promise(r => requestAnimationFrame(() => r()));

    const cells = Array.from(track.querySelectorAll('.b5050-cell'));
    if (cells.length < 2) return stopValue;

    const stride = Math.max(1, cells[1].offsetTop - cells[0].offsetTop);
    const cellH = cells[0].getBoundingClientRect().height || 56;
    const winH = windowEl.getBoundingClientRect().height || 150;
    const centerOffset = (winH / 2) - (cellH / 2);
    const finalY = Math.max(0, (stopIndex * stride) - centerOffset);

    track.style.transform = 'translate3d(0,0,0)';

    const a = track.animate(
      [{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(0,-${finalY}px,0)` }],
      { duration: durationMs, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'forwards' }
    );

    await a.finished;
    track.style.transform = `translate3d(0,-${finalY}px,0)`;

    const landed = cells[stopIndex];
    if (landed) landed.classList.add('is-win');

    return stopValue;
  }

  _center(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  _spawnFixedX(text, at, kind) {
    const el = document.createElement('div');
    el.className = `b5050-flyx b5050-flyx--${kind}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top  = `${at.y}px`;
    this._fxRoot().appendChild(el);
    return el;
  }

  async _holdThenCollide(ui, goodX, badX) {
    const startGood = this._center(ui.good.windowEl.getBoundingClientRect());
    const startBad  = this._center(ui.bad.windowEl.getBoundingClientRect());
    const end       = this._center(ui.vs.getBoundingClientRect());
  
    // 1) показать два X (у тебя уже без панелей)
    const xGood = this._spawnFixedX(this._fmtX(goodX), startGood, 'good');
    const xBad  = this._spawnFixedX(this._fmtX(badX),  startBad,  'bad');
  
    // лёгкое "дыхание" пока висят
    xGood.classList.add('b5050-flyx--idle');
    xBad.classList.add('b5050-flyx--idle');
  
    // 2) повисеть 2 секунды
    await this._wait(Math.max(500, 2000 / (this.speedupFactor || 1)));
  
    // перед движением: убираем idle
    xGood.classList.remove('b5050-flyx--idle');
    xBad.classList.remove('b5050-flyx--idle');
  
    // 3) стартуем BOOM/частицы не сразу, а когда они уже поехали (приятнее)
    const moveDuration = 950;
    const boomAt = 520; // когда примерно "почти сошлись"
  
    // запланировать взрыв в процессе движения
    const boomPromise = (async () => {
      await this._wait(Math.max(200, boomAt / (this.speedupFactor || 1)));
      await this._boomWithParticles(ui); // взрыв + частицы + флэш
    })();
  
    // 4) очень плавное сближение + красивый овершут
    const animOne = (el, start, dir = 1) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
  
      return el.animate(
        [
          // старт
          { transform: 'translate3d(-50%,-50%,0) scale(1) rotate(0deg)', opacity: 1, filter: 'blur(0px)' },
  
          // разгон (чуть наклоняем к центру)
          { transform: `translate3d(calc(-50% + ${dx*0.70}px), calc(-50% + ${dy*0.70}px), 0) scale(1.10) rotate(${dir*6}deg)`,
            opacity: 1, filter: 'blur(0.3px)', offset: 0.70 },
  
          // овершут в центр (как удар)
          { transform: `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) scale(1.28) rotate(${dir*2}deg)`,
            opacity: 1, filter: 'blur(0px)', offset: 0.92 },
  
          // оседание + исчезновение (чтобы не было видно "слипшихся")
          { transform: `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) scale(0.92) rotate(0deg)`,
            opacity: 0.0, filter: 'blur(0.6px)' }
        ],
        {
          duration: Math.max(400, moveDuration / (this.speedupFactor || 1)),
          easing: 'cubic-bezier(0.16, 0.9, 0.14, 1)', // очень приятное "подсасывание"
          fill: 'forwards'
        }
      ).finished;
    };
  
    // лёгкая встряска в момент удара (почти в конце)
    const shakePromise = (async () => {
      await this._wait(Math.max(0, (boomAt - 60) / (this.speedupFactor || 1)));
      ui.machine.classList.add('b5050-shake');
      await this._wait(Math.max(100, 240 / (this.speedupFactor || 1)));
      ui.machine.classList.remove('b5050-shake');
    })();
  
    await Promise.all([
      animOne(xGood, startGood,  1),
      animOne(xBad,  startBad,  -1),
      shakePromise
    ]);
  
    xGood.remove();
    xBad.remove();
  
    // дождаться, чтобы fx успели красиво доиграть
    await boomPromise;
  }

  
  
  async _boomWithParticles(ui) {
    const end = this._center(ui.vs.getBoundingClientRect());
  
    // BOOM (center)
    const boom = document.createElement('img');
    boom.className = 'b5050-boom';
    boom.src = this.options.boomSrc;
    boom.alt = '';
    boom.style.left = `${end.x}px`;
    boom.style.top  = `${end.y}px`;
    this._fxRoot().appendChild(boom);
  
    // PARTICLES (around)
    const particleCount = 14; // ✅ больше частиц
    const parts = [];
  
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('img');
      p.className = 'b5050-particle';
      p.src = this.options.particlesSrc;
      p.alt = '';
      p.style.left = `${end.x}px`;
      p.style.top  = `${end.y}px`;
  
      const ang = Math.random() * Math.PI * 2;
      const dist = 140 + Math.random() * 190;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist * 0.7;
  
      const size = 110 + Math.random() * 140;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
  
      this._fxRoot().appendChild(p);
      parts.push({ el: p, dx, dy });
    }
  
    // запускаем boom сразу
    boom.classList.add('is-on');
  
    // частицы стартуют сразу и летят наружу
    const particleAnims = parts.map(({ el, dx, dy }) =>
      el.animate(
        [
          { transform: 'translate3d(-50%,-50%,0) scale(0.45)', opacity: 0 },
          { transform: 'translate3d(-50%,-50%,0) scale(1)', opacity: 1, offset: 0.18 },
          { transform: `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) scale(1.05)`, opacity: 0 }
        ],
        { duration: 2900, easing: 'cubic-bezier(0.12, 0.9, 0.2, 1)', fill: 'forwards' }
      ).finished
    );
  
    // boom держим меньше (чтобы совпало с быстрым столкновением)
    await this._wait(650);
    boom.classList.add('is-off');
  
    await Promise.allSettled(particleAnims);
  
    for (const { el } of parts) el.remove();
  
    await this._wait(420);
    boom.remove();
  }
  

  async start() {
    if (this._running) return;
    this._running = true;
    this._aborted = false;
    this._completed = false;

    const overlay = this._overlayEl();
    if (!overlay || !this.container) {
      this._running = false;
      this.options.onComplete('2x');
      return;
    }

    overlay.style.display = 'flex';
    overlay.classList.add('bonus-overlay--active');

    this._setGlobalBackHandler();
    this._lockScroll();
    const ui = this._render();
    const forced = this.options?.outcome || null;
    const forcedGoodX = Number(forced?.goodX);
    const forcedBadX = Number(forced?.badX);
    const forcedPickGood = (typeof forced?.pickGood === 'boolean') ? forced.pickGood : null;
    const forcedMultiplier = Number(forced?.multiplier);
    const seedBase = String(this.options?.bonusId || this.options?.sessionKey || 'bonus5050');
    const rnd = this._makeRng(this._hashSeed(`${seedBase}:result`));

    const goodX = Number.isFinite(forcedGoodX)
      ? forcedGoodX
      : this.GOOD_XS[Math.floor(rnd() * this.GOOD_XS.length)];
    const badX = Number.isFinite(forcedBadX)
      ? forcedBadX
      : this.BAD_XS[Math.floor(rnd() * this.BAD_XS.length)];

    let pickGood = (forcedPickGood !== null) ? forcedPickGood : (rnd() < 0.5);
    if (Number.isFinite(forcedMultiplier)) {
      if (forcedMultiplier === goodX) pickGood = true;
      else if (forcedMultiplier === badX) pickGood = false;
    }

    const chosenX = pickGood ? goodX : badX;

    // chosen glow (optional)
    ui.good.unit.classList.toggle('is-picked', pickGood);
    ui.bad.unit.classList.toggle('is-picked', !pickGood);

    // 🔥 Используем оставшееся время если оно передано (для случая когда пользователь зашел в середине бонуса)
    const effectiveDuration = this.options.remainingSec || this.options.durationSec;
    const speedupFactor = this.options.durationSec / effectiveDuration; // > 1 если нужно ускорить
    this.speedupFactor = speedupFactor; // сохраняем для использования в других методах

    const cdPromise = this._countdown(ui.timer, effectiveDuration);

    try {
      await this._wait(Math.max(100, 450 / speedupFactor));
      if (this._aborted) return;


      await Promise.all([
        this._spinReel(ui.good, goodX, this.GOOD_XS, { durationMs: Math.max(1000, 6100 / speedupFactor) }),
        this._spinReel(ui.bad,  badX,  this.BAD_XS,  { durationMs: Math.max(1000, 5850 / speedupFactor) })
      ]);
      if (this._aborted) return;


      // пауза чтобы увидеть оба выпавших
      await this._wait(Math.max(200, 700 / speedupFactor));
      if (this._aborted) return;


      // (A) плавно убрать барабаны
      ui.machine.classList.add('b5050-machine--collapse');
      await this._wait(Math.max(200, 650 / speedupFactor)); // дать CSS красиво отработать
      if (this._aborted) return;


      await this._holdThenCollide(ui, goodX, badX);
      if (this._aborted) return;



      // (D) winner reveal (как раньше)
      ui.result.textContent = this._fmtX(chosenX);
      ui.machine.classList.add('b5050-machine--result');
      await this._wait(Math.max(200, 900 / speedupFactor));
      if (this._aborted) return;


      await cdPromise;
    } catch (e) {
      console.error('[Bonus5050] ❌ Error:', e);
    } finally {
      // если уже закрыли через abort() — не дублируем очистку/коллбэки
      if (this._completed) return;
      this._completed = true;

      overlay.classList.add('bonus-overlay--leave');
      await this._wait(260);

      overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
      overlay.style.display = 'none';

      this.container.innerHTML = '';
      this._unlockScroll();
      this._running = false;
      this._clearGlobalBackHandler();

      this.options.onComplete(this._fmtX(chosenX));
    }
  }
}

window.Bonus5050 = Bonus5050;
console.log('[Bonus5050] ✅ Class exported to window.Bonus5050');
