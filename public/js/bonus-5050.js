// public/js/bonus-5050.js - DUAL REELS + Lightning Icon VS + slow collide + boom + particles + winner reveal
// Exports: window.Bonus5050 (class) for wheel.js

console.log('[Bonus5050] 🎰 loaded (dual VS slow collide boom+particles v2 - lightning icon)');

class Bonus5050 {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onComplete: typeof options.onComplete === 'function' ? options.onComplete : () => {},
      durationSec: Number.isFinite(options.durationSec) ? options.durationSec : 15,
      boomSrc: options.boomSrc || 'images/boom.webp',
      particlesSrc: options.particlesSrc || 'images/boomparticles.webp',
      lightningIcon: options.lightningIcon || 'icons/lighting.webp',
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

  _fxRoot() {
    // Keep all FX (boom/particles/flying labels) inside the bonus overlay so it only appears on Wheel page
    return (this.container && this.container.closest && this.container.closest('#bonus5050Overlay')) || this.container || document.body;
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
    await this._wait(2000);
  
    // перед движением: убираем idle
    xGood.classList.remove('b5050-flyx--idle');
    xBad.classList.remove('b5050-flyx--idle');
  
    // 3) стартуем BOOM/частицы не сразу, а когда они уже поехали (приятнее)
    const moveDuration = 950;
    const boomAt = 520; // когда примерно "почти сошлись"
  
    // запланировать взрыв в процессе движения
    const boomPromise = (async () => {
      await this._wait(boomAt);
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
          duration: moveDuration,
          easing: 'cubic-bezier(0.16, 0.9, 0.14, 1)', // очень приятное "подсасывание"
          fill: 'forwards'
        }
      ).finished;
    };
  
    // лёгкая встряска в момент удара (почти в конце)
    const shakePromise = (async () => {
      await this._wait(Math.max(0, boomAt - 60));
      ui.machine.classList.add('b5050-shake');
      await this._wait(240);
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

    const overlay = this._overlayEl();
    if (!overlay || !this.container) {
      this._running = false;
      this.options.onComplete('2x');
      return;
    }

    overlay.style.display = 'flex';
    overlay.classList.add('bonus-overlay--active');

    this._lockScroll();
    const ui = this._render();

    // 50/50 winner side
    const pickGood = Math.random() < 0.5;

    const goodX = this.GOOD_XS[Math.floor(Math.random() * this.GOOD_XS.length)];
    const badX  = this.BAD_XS[Math.floor(Math.random() * this.BAD_XS.length)];
    const chosenX = pickGood ? goodX : badX;

    // chosen glow (optional)
    ui.good.unit.classList.toggle('is-picked', pickGood);
    ui.bad.unit.classList.toggle('is-picked', !pickGood);

    const cdPromise = this._countdown(ui.timer, this.options.durationSec);

    try {
      await this._wait(450);

      await Promise.all([
        this._spinReel(ui.good, goodX, this.GOOD_XS, { durationMs: 6100 }),
        this._spinReel(ui.bad,  badX,  this.BAD_XS,  { durationMs: 5850 })
      ]);

      // пауза чтобы увидеть оба выпавших
      await this._wait(700);

      // (A) плавно убрать барабаны
      ui.machine.classList.add('b5050-machine--collapse');
      await this._wait(650); // дать CSS красиво отработать

      await this._holdThenCollide(ui, goodX, badX);


      // (D) winner reveal (как раньше)
      ui.result.textContent = this._fmtX(chosenX);
      ui.machine.classList.add('b5050-machine--result');
      await this._wait(900);

      await cdPromise;
    } catch (e) {
      console.error('[Bonus5050] ❌ Error:', e);
    } finally {
      overlay.classList.add('bonus-overlay--leave');
      await this._wait(260);

      overlay.classList.remove('bonus-overlay--active', 'bonus-overlay--leave');
      overlay.style.display = 'none';

      this.container.innerHTML = '';
      this._unlockScroll();
      this._running = false;

      this.options.onComplete(this._fmtX(chosenX));
    }
  }
}

window.Bonus5050 = Bonus5050;
console.log('[Bonus5050] ✅ Class exported to window.Bonus5050');