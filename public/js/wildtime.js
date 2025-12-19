// wildtime.js — Wild Time bonus (3 pointers + triple result + cups shuffle)
// Exposes: window.startWildTimeBonus(betAmount?: number, opts?: object) -> Promise<{all:string[], choice:string, multiplier:number, winAmount:number, pickedIndex:number}>

(() => {
    'use strict';
  
    const STYLE_ID = 'wildtimeStyles';
    const OVERLAY_ID = 'wildtimeOverlay';
  
    // Doubled multipliers (1x,3x,7x,11x) -> (2x,6x,14x,22x)
    const MULTS = [2, 6, 14, 22];
    const SEGMENTS = Array.from({ length: 24 }, (_, i) => `${MULTS[i % MULTS.length]}x`);
  
    // Pointer angles around the wheel (radians)
    // Top, bottom-right, bottom-left (120° steps)
    const POINTER_ANGLES = [
      -Math.PI / 2,
      -Math.PI / 2 + (2 * Math.PI) / 3,
      -Math.PI / 2 + (4 * Math.PI) / 3,
    ];
  
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  
    function rand01() {
      try {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] / 0xffffffff;
      } catch {
        return Math.random();
      }
    }
  
    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        html.wt-active, body.wt-active{ height:100%; overflow:hidden; }
  
        #wheelPage.wt-swipe-left{
          transform: translateX(-35%);
          opacity: 0;
          filter: blur(2px);
          transition: transform 420ms cubic-bezier(.2,.9,.2,1), opacity 420ms ease, filter 420ms ease;
        }
  
        #${OVERLAY_ID}{
          position: fixed; inset: 0;
          z-index: 100000;
          display: none;
          opacity: 0;
          transform: translateX(100%);
          transition: transform 420ms cubic-bezier(.2,.9,.2,1), opacity 420ms ease;
          background:
            radial-gradient(1200px 700px at 50% -240px, rgba(21,32,51,.95) 0%, rgba(13,14,15,.98) 55%),
            linear-gradient(180deg, rgba(15,20,28,.98), rgba(13,14,15,.98));
          color: #fff;
          overflow: hidden;
        }
        #${OVERLAY_ID}.wt-open{ display:flex; }
        #${OVERLAY_ID}.wt-enter{ opacity: 1; transform: translateX(0); }
        #${OVERLAY_ID} *{ box-sizing:border-box; }
  
        .wt-screen{
          position: relative;
          width: 100%;
          height: 100%;
          display:flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 18px 14px 24px;
        }
  
        .wt-top{
          width: 100%;
          display:flex;
          align-items:center;
          justify-content: space-between;
          margin-top: calc(var(--safe-top, 0px) + 6px);
        }
        .wt-title{
          font: 900 18px/1.1 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          letter-spacing: .4px;
        }
        .wt-sub{
          margin-top: 4px;
          font: 600 12px/1.2 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          opacity: .76;
        }
        .wt-pill{
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.22);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          font: 800 12px/1 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          letter-spacing:.2px;
        }
  
        .wt-wheelWrap{
          position: relative;
          width: min(420px, 86vw);
          aspect-ratio: 1 / 1;
          margin-top: 18px;
          border-radius: 24px;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .wt-wheelCanvas{
          width: 100%;
          height: 100%;
          border-radius: 999px;
          box-shadow: 0 18px 60px rgba(0,0,0,.55);
          border: 1px solid rgba(255,255,255,.08);
        }
        .wt-pointer{
          position:absolute;
          left: 50%;
          top: 50%;
          width: 0; height: 0;
          border-left: 12px solid transparent;
          border-right: 12px solid transparent;
          border-top: 20px solid rgba(255,255,255,.95);
          filter: drop-shadow(0 8px 12px rgba(0,0,0,.45));
          transform: translate(-50%, -50%) rotate(var(--rot, 0deg)) translateY(-190px);
        }
        @media (max-width: 420px){
          .wt-pointer{
            transform: translate(-50%, -50%) rotate(var(--rot, 0deg)) translateY(-155px);
          }
        }
  
        .wt-status{
          margin-top: 14px;
          min-height: 20px;
          font: 800 13px/1.2 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          opacity: .9;
          text-align:center;
        }
        .wt-help{
          margin-top: 6px;
          font: 600 12px/1.35 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          opacity: .68;
          text-align:center;
          max-width: 520px;
        }
  
        /* Modal overlay (step 5-6) */
        .wt-modal{
          position: absolute;
          inset: 0;
          display: none;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,.35);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .wt-modal.open{ display:flex; }
        .wt-panel{
          width: min(520px, calc(100vw - 28px));
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(16,18,22,.86);
          box-shadow: 0 26px 80px rgba(0,0,0,.55);
          padding: 16px 14px 14px;
        }
        .wt-panelTitle{
          font: 900 16px/1.1 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          letter-spacing:.3px;
        }
        .wt-panelSub{
          margin-top: 4px;
          font: 650 12px/1.35 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          opacity: .76;
        }
  
        .wt-row{
          position: relative;
          margin-top: 14px;
          height: 210px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.20);
          overflow: hidden;
        }
        .wt-cupGroup{
          position: absolute;
          top: 22px;
          left: 50%;
          width: 130px;
          height: 170px;
          transform: translate(-50%, 0) translateX(var(--x, 0px));
          transition: transform 520ms cubic-bezier(.2,.9,.2,1);
          cursor: pointer;
          user-select: none;
        }
        .wt-cupGroup.disabled{ pointer-events:none; }
  
        .wt-multBadge{
          position: absolute;
          left: 50%;
          top: 120px;
          transform: translate(-50%, 0);
          padding: 9px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.28);
          font: 1000 18px/1 mf, mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          letter-spacing: .3px;
          opacity: 1;
        }
  
        .wt-cup{
          position: absolute;
          left: 50%;
          top: 0;
          width: 130px;
          height: 150px;
          transform: translate(-50%, -18px) scale(.92);
          opacity: 0;
          transition: transform 520ms cubic-bezier(.2,.9,.2,1), opacity 320ms ease;
          filter: drop-shadow(0 18px 22px rgba(0,0,0,.55));
        }
        .wt-cupGroup.covered .wt-cup{ opacity: 1; transform: translate(-50%, 0) scale(1); }
  
        .wt-cupGroup .wt-multBadge{ transition: opacity 200ms ease, filter 200ms ease; }
        .wt-cupGroup.covered .wt-multBadge{ opacity: .08; filter: blur(6px); }
  
        .wt-cupGroup.picked{ z-index: 5; }
        .wt-cupGroup.picked .wt-cup{ transform: translate(-50%, -72px) rotate(-7deg) scale(1); }
        .wt-cupGroup.picked .wt-multBadge{ opacity: 1; filter: none; }
  
        .wt-cupGroup.revealOther .wt-cup{ transform: translate(-50%, -58px) rotate(6deg) scale(1); }
        .wt-cupGroup.revealOther .wt-multBadge{ opacity: 1; filter: none; }
  
        .wt-cupGroup.winGlow .wt-multBadge{
          box-shadow: 0 0 0 3px rgba(0,166,255,.22), 0 20px 45px rgba(0,166,255,.18);
          border-color: rgba(0,166,255,.45);
        }
  
        .wt-foot{
          margin-top: 12px;
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
        }
        .wt-msg{
          font: 800 12px/1.25 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          opacity: .86;
        }
        .wt-btn{
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.08);
          font: 900 12px/1 mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          letter-spacing: .2px;
        }
  
        /* Drop animation badges */
        .wt-drop{
          position: absolute;
          padding: 10px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.28);
          font: 1000 18px/1 mf, mf, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          box-shadow: 0 18px 60px rgba(0,0,0,.45);
          transform: translate(-50%, -50%);
          pointer-events: none;
          will-change: transform, opacity;
        }
      `;
      document.head.appendChild(style);
    }
  
    function cupDataUri() {
      // simple "cup" SVG as a fallback; you can swap to /images/wildtime/cup.png in production
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="260" height="300" viewBox="0 0 260 300">
          <defs>
            <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#f2f5ff" stop-opacity=".96"/>
              <stop offset="1" stop-color="#b9c2d6" stop-opacity=".96"/>
            </linearGradient>
            <linearGradient id="g2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#ffffff" stop-opacity=".85"/>
              <stop offset="1" stop-color="#aeb7cb" stop-opacity=".85"/>
            </linearGradient>
            <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="16" stdDeviation="10" flood-color="#000" flood-opacity=".35"/>
            </filter>
          </defs>
          <g filter="url(#s)">
            <!-- rim -->
            <path d="M34 70h192c8 0 14 7 12 15l-5 26c-1 6-6 11-12 11H40c-6 0-11-5-12-11l-5-26c-2-8 4-15 12-15z" fill="url(#g2)"/>
            <!-- body -->
            <path d="M48 118h164l-18 162c-1 9-8 16-17 16H83c-9 0-16-7-17-16L48 118z" fill="url(#g)"/>
            <!-- highlight -->
            <path d="M78 132h26l-14 146h-26l14-146z" fill="#ffffff" opacity=".16"/>
          </g>
        </svg>
      `;
      const cleaned = svg
        .replace(/\n\s+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleaned)}`;
    }
  
    function ensureOverlay() {
      let overlay = document.getElementById(OVERLAY_ID);
      if (overlay) return overlay;
  
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.className = 'wt-overlay';
  
      overlay.innerHTML = `
            <div class="wt-screen">
          <div class="wt-top">
            <div>
              <div class="wt-title">WILD TIME</div>
                  <div class="wt-sub">3 поинтера • выбери множитель</div>
            </div>
            <div class="wt-pill" id="wtBetPill">—</div>
          </div>
  
          <div class="wt-wheelWrap">
            <canvas class="wt-wheelCanvas wt-wheelCanvas" id="wtCanvas" width="420" height="420" aria-label="Wild Time wheel"></canvas>
            <div class="wt-pointer" style="--rot: 0deg" aria-hidden="true"></div>
            <div class="wt-pointer" style="--rot: 120deg" aria-hidden="true"></div>
            <div class="wt-pointer" style="--rot: 240deg" aria-hidden="true"></div>
          </div>
  
              <div class="wt-status" id="wtStatus">Крутим…</div>
              <div class="wt-help">После прокрута выпадут 3 множителя. Затем стаканчики накроют их и перемешаются — выбери один.</div>
  
          <div class="wt-modal" id="wtModal" aria-hidden="true">
                <div class="wt-panel">
                  <div class="wt-panelTitle">Выбери стаканчик</div>
                  <div class="wt-panelSub">Вот 3 выпавших множителя. Стаканчики накроют их и перемешаются — выбери свой.</div>
  
              <div class="wt-row" id="wtRow"></div>
  
                  <div class="wt-foot">
                    <div class="wt-msg" id="wtMsg">Смотри перемешивание…</div>
                    <button class="wt-btn" id="wtSkipBtn" type="button">Пропустить</button>
                  </div>
            </div>
          </div>
        </div>
      `;
  
      // Append to body so it stays visible even if wheelPage is swiped/hidden
      document.body.appendChild(overlay);
  
      return overlay;
    }
  
    function setupHiDpiCanvas(canvas) {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const rect = canvas.getBoundingClientRect();
      const size = Math.round(Math.min(rect.width, rect.height));
      const px = Math.max(280, Math.min(520, size));
      canvas.width = px * dpr;
      canvas.height = px * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, size: px };
    }
  
    function drawWheel(ctx, size, angleRad) {
      const n = SEGMENTS.length;
      const slice = (2 * Math.PI) / n;
      const r = size / 2;
      const cx = r;
      const cy = r;
  
      ctx.clearRect(0, 0, size, size);
  
      // Base shadow ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fill();
      ctx.restore();
  
      const colors = [
        { fill: 'rgba(0,166,255,.35)', stroke: 'rgba(0,166,255,.22)' },
        { fill: 'rgba(70,255,180,.28)', stroke: 'rgba(70,255,180,.18)' },
        { fill: 'rgba(255,200,80,.26)', stroke: 'rgba(255,200,80,.16)' },
        { fill: 'rgba(255,90,180,.24)', stroke: 'rgba(255,90,180,.14)' },
      ];
  
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angleRad);
  
      for (let i = 0; i < n; i++) {
        const start = i * slice - Math.PI / 2;
        const end = start + slice;
        const c = colors[i % colors.length];
  
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r - 8, start, end);
        ctx.closePath();
        ctx.fillStyle = c.fill;
        ctx.fill();
        ctx.strokeStyle = c.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
  
        // Text
        const label = SEGMENTS[i];
        const mid = (start + end) / 2;
        ctx.save();
        ctx.rotate(mid);
        ctx.translate(0, -(r - 60));
        ctx.rotate(-mid);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.font = '900 22px mf, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
  
      // Center cap
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.lineWidth = 2;
      ctx.stroke();
  
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '1000 14px mf, system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('WILD', 0, -7);
      ctx.fillText('TIME', 0, 10);
  
      ctx.restore();
    }
  
    function normAngle(a) {
      const two = 2 * Math.PI;
      a = a % two;
      if (a < 0) a += two;
      return a;
    }
  
    function segmentAtPointer(wheelAngle, pointerAngle) {
      const n = SEGMENTS.length;
      const slice = (2 * Math.PI) / n;
  
      // Our draw starts slice0 at (angle - pi/2).
      // Pointer sees the wheel at (pointerAngle). Solve for index.
      const rel = normAngle(pointerAngle + Math.PI / 2 - wheelAngle);
      const idx = Math.floor(rel / slice);
      return SEGMENTS[idx % n];
    }
  
    async function animateSpin(canvas, statusEl) {
      const { ctx, size } = setupHiDpiCanvas(canvas);
  
      const baseTurns = 8 + Math.floor(rand01() * 4); // 8..11 turns
      const finalAngle = rand01() * 2 * Math.PI;
      const total = baseTurns * 2 * Math.PI + finalAngle;
      const duration = 3200 + Math.floor(rand01() * 600);
  
      const t0 = performance.now();
      let done = false;
  
      await new Promise((resolve) => {
        const tick = (now) => {
          const t = clamp01((now - t0) / duration);
          const eased = easeOutCubic(t);
          const angle = total * eased;
          drawWheel(ctx, size, angle);
          if (t >= 1) {
            done = true;
            resolve(angle);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
  
      // Compute results at final angle
      const results = POINTER_ANGLES.map((pa) => segmentAtPointer(total, pa));
      statusEl.textContent = `Выпали: ${results.join('  •  ')}`;
      return { angle: total, results };
    }
  
    async function dropBadges(overlay, results) {
      const wrap = overlay.querySelector('.wt-wheelWrap');
      const wheelRect = wrap.getBoundingClientRect();
      const centerX = wheelRect.left + wheelRect.width / 2;
      const centerY = wheelRect.top + wheelRect.height / 2;
  
      const destRow = overlay.querySelector('#wtRow');
      const rowRect = destRow.getBoundingClientRect();
  
      const spread = Math.min(140, Math.max(95, rowRect.width / 3.15));
      const destXs = [rowRect.left + rowRect.width / 2 - spread, rowRect.left + rowRect.width / 2, rowRect.left + rowRect.width / 2 + spread];
      const destY = rowRect.top + 52;
  
      const r = wheelRect.width / 2 - 14;
  
      const anims = results.map((xStr, i) => {
        const badge = document.createElement('div');
        badge.className = 'wt-drop';
        badge.textContent = xStr;
        overlay.appendChild(badge);
  
        const a = POINTER_ANGLES[i];
        const sx = centerX + r * Math.cos(a);
        const sy = centerY + r * Math.sin(a);
        badge.style.left = `${sx}px`;
        badge.style.top = `${sy}px`;
        badge.style.opacity = '0.0';
  
        const keyframes = [
          { transform: 'translate(-50%, -50%) scale(.85)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.02)', opacity: 1, offset: 0.18 },
          { transform: `translate(${destXs[i] - sx - 0}px, ${destY - sy}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
        ];
        const anim = badge.animate(keyframes, { duration: 780, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'forwards' });
        anim.finished.finally(() => badge.remove());
        return anim.finished;
      });
  
      await Promise.allSettled(anims);
    }
  
    function buildCupsRow(rowEl, results) {
      rowEl.innerHTML = '';
      const spread = Math.min(140, Math.max(95, rowEl.clientWidth / 3.15));
      const pos = [-spread, 0, spread];
      const cupSrc = '/images/wildtime/cup.png';
      const fallback = cupDataUri();
  
      const groups = results.map((xStr, i) => {
        const g = document.createElement('div');
        g.className = 'wt-cupGroup';
        g.style.setProperty('--x', `${pos[i]}px`);
        g.dataset.mult = xStr;
        g.dataset.slot = String(i);
  
        const badge = document.createElement('div');
        badge.className = 'wt-multBadge';
        badge.textContent = xStr;
  
        const img = document.createElement('img');
        img.className = 'wt-cup';
        img.alt = 'Cup';
        img.src = cupSrc;
        img.onerror = () => { img.src = fallback; };
  
        g.appendChild(badge);
        g.appendChild(img);
        rowEl.appendChild(g);
        return g;
      });
  
      return { groups, spread };
    }
  
    async function coverAndShuffle(rowEl, groups, msgEl, skipBtn) {
      // Cover
      groups.forEach((g) => g.classList.add('covered'));
      msgEl.textContent = 'Смотри перемешивание…';
      await sleep(520);
  
      // Shuffle helper (swap positions)
      const base = groups.map((_, i) => i); // position index per group
      const spread = Math.min(140, Math.max(95, rowEl.clientWidth / 3.15));
      const pos = [-spread, 0, spread];
  
      let isSkipped = false;
      const onSkip = () => { isSkipped = true; };
      skipBtn.addEventListener('click', onSkip, { once: true });
  
      const swap = (a, b) => {
        const t = base[a];
        base[a] = base[b];
        base[b] = t;
        groups.forEach((g, gi) => {
          g.style.setProperty('--x', `${pos[base[gi]]}px`);
        });
      };
  
      // Perform 4 random swaps (unless skipped)
      for (let k = 0; k < 4; k++) {
        if (isSkipped) break;
        const a = Math.floor(rand01() * 3);
        let b = Math.floor(rand01() * 3);
        if (b === a) b = (b + 1) % 3;
        swap(a, b);
        await sleep(560);
      }
  
      // End
      msgEl.textContent = 'Выбери стаканчик.';
      return base; // mapping groupIndex -> positionIndex
    }
  
    async function pickCup(groups, msgEl) {
      groups.forEach((g) => g.classList.remove('disabled'));
  
      return await new Promise((resolve) => {
        const onPick = (ev) => {
          const g = ev.currentTarget;
          groups.forEach((x) => x.classList.add('disabled'));
          const pickedIndex = groups.indexOf(g);
          const choice = g.dataset.mult || '';
  
          // Reveal picked
          g.classList.add('picked', 'winGlow');
          msgEl.textContent = `Вы выбрали ${choice}`;
  
          // Reveal others after a beat
          setTimeout(() => {
            groups.forEach((o) => {
              if (o !== g) o.classList.add('revealOther');
            });
          }, 520);
  
          setTimeout(() => resolve({ pickedIndex, choice }), 920);
        };
  
        groups.forEach((g) => {
          g.addEventListener('click', onPick, { once: true });
        });
      });
    }
  
    async function closeOverlay(overlay) {
      const wheelPage = document.getElementById('wheelPage');
  
      overlay.classList.remove('wt-enter');
      overlay.style.transform = 'translateX(100%)';
      overlay.style.opacity = '0';
  
      // Restore wheel page
      if (wheelPage) {
        wheelPage.classList.remove('wt-swipe-left');
        wheelPage.style.visibility = '';
        wheelPage.style.pointerEvents = '';
      }
  
      document.documentElement.classList.remove('wt-active');
      document.body.classList.remove('wt-active');
  
      await sleep(460);
      overlay.classList.remove('wt-open');
      overlay.style.transform = '';
      overlay.style.opacity = '';
    }
  
    let running = false;
  
    window.startWildTimeBonus = window.startWildTimeBonus || async function startWildTimeBonus(betAmount = 0, opts = {}) {
      if (running) return { all: [], choice: '', multiplier: 0, winAmount: 0, pickedIndex: -1 };
      running = true;
  
      injectStyles();
      const overlay = ensureOverlay();
      const wheelPage = document.getElementById('wheelPage');
  
      const betPill = overlay.querySelector('#wtBetPill');
      const statusEl = overlay.querySelector('#wtStatus');
      const modal = overlay.querySelector('#wtModal');
      const rowEl = overlay.querySelector('#wtRow');
      const msgEl = overlay.querySelector('#wtMsg');
      const skipBtn = overlay.querySelector('#wtSkipBtn');
      const canvas = overlay.querySelector('#wtCanvas');
  
      // Reset modal
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      rowEl.innerHTML = '';
      msgEl.textContent = 'Смотри перемешивание…';
      statusEl.textContent = 'Крутим…';
  
      // UI bet pill
      const curr = window.currentCurrency || (opts && opts.currency) || 'ton';
      const shown = (curr === 'stars') ? `${Math.round(Number(betAmount || 0))} ⭐` : `${Number(betAmount || 0).toFixed(2)} TON`;
      betPill.textContent = betAmount > 0 ? `Ставка: ${shown}` : 'Без ставки';
  
      // Lock scroll
      document.documentElement.classList.add('wt-active');
      document.body.classList.add('wt-active');
  
      // Swipe out wheel page
      if (wheelPage) {
        wheelPage.classList.add('wt-swipe-left');
        wheelPage.style.pointerEvents = 'none';
        setTimeout(() => { if (wheelPage) wheelPage.style.visibility = 'hidden'; }, 420);
      }
  
      // Show overlay (enter from right)
      overlay.classList.add('wt-open');
      await sleep(20);
      overlay.classList.add('wt-enter');
  
      try {
        // Spin
        await sleep(140);
        const { results } = await animateSpin(canvas, statusEl);
  
        // Step 5: Blur overlay + show results, cover & shuffle
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
  
        // Drop badges from pointers into row
        await dropBadges(overlay, results);
  
        const { groups } = buildCupsRow(rowEl, results);
        await sleep(260);
        await coverAndShuffle(rowEl, groups, msgEl, skipBtn);
  
        // Step 6: pick cup
        const picked = await pickCup(groups, msgEl);
  
        // Compute win
        const mult = parseFloat(String(picked.choice).replace('x', '')) || 0;
        let winAmount = 0;
        if (betAmount > 0 && Number.isFinite(mult) && mult > 0) {
          const raw = Number(betAmount) * mult;
          winAmount = (curr === 'stars') ? Math.round(raw) : +raw.toFixed(2);
  
          if (typeof window.showWinNotification === 'function') {
            try { window.showWinNotification(winAmount); } catch (_) {}
          }
          if (window.TEST_MODE && typeof window.addWinAmount === 'function') {
            try { window.addWinAmount(winAmount, curr); } catch (_) {}
          }
        }
  
        // Small pause for UX
        await sleep(900);
  
        return {
          all: results,
          choice: picked.choice,
          multiplier: mult,
          winAmount,
          pickedIndex: picked.pickedIndex,
        };
      } finally {
        await closeOverlay(overlay);
        running = false;
      }
    };
  })();
  