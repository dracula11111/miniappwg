// bonus-5050.js — SLOT 50/50 (good vs bad reel)
// Flow:
// 1) Two reels spin down (slot-style). One reel has bad multipliers, one has good multipliers (side is random)
// 2) They stop, then results slide out left/right showing (bad x) and (good x)
// 3) Pause for user to see, then they fly into center + boom.webp
// 4) One result survives -> onComplete('<mult>x')

console.log('[Bonus5050] 📦 Loading SLOT 50/50 bonus module');

class Bonus5050 {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      introPngUrl: options.introPngUrl || '',
      boomSvgUrl: options.boomSvgUrl || '/images/boom.webp',
      onComplete: options.onComplete || (() => {}),
      ...options,
    };

    this.bad = [1.5, 2, 3, 4];
    this.good = [5, 7, 10, 15];

    this._running = false;
  }

  async start() {
    if (this._running) return;
    this._running = true;

    // Stop wheel completely (existing behavior)
    if (typeof window.omega !== 'undefined') window.omega = 0;
    if (typeof window.phase !== 'undefined') window.phase = 'bonus_waiting';

    const overlay = document.getElementById('bonus5050Overlay');
    if (!overlay) {
      console.error('[Bonus5050] ❌ Overlay not found!');
      this.options.onComplete('2x');
      this._running = false;
      return;
    }

    overlay.style.display = 'flex';
    overlay.classList.add('bonus-overlay--active');

    this.renderUI();

    // random side assignment
    const goodOnLeft = Math.random() < 0.5;
    const leftPool = goodOnLeft ? this.good : this.bad;
    const rightPool = goodOnLeft ? this.bad : this.good;

    const leftResult = leftPool[Math.floor(Math.random() * leftPool.length)];
    const rightResult = rightPool[Math.floor(Math.random() * rightPool.length)];

    // spin reels
    await this.spinReel('left', leftPool, leftResult);
    await this.spinReel('right', rightPool, rightResult);

    // show slide-out result pills (left = leftResult, right = rightResult)
    await this.showResults(leftResult, rightResult, goodOnLeft);

    // pause so user can see
    await this.wait(900);

    // collide + boom + pick final
    const finalMult = await this.collisionAndPick(leftResult, rightResult);

    // Hide overlay
    overlay.classList.remove('bonus-overlay--active');
    await this.wait(220);
    overlay.style.display = 'none';
    this.container.innerHTML = '';

    // Restore wheel state (fallback idle omega)
    if (typeof window.phase !== 'undefined') window.phase = 'betting';
    if (typeof window.omega !== 'undefined' && window.omega === 0) window.omega = 0.35;

    this.options.onComplete(`${finalMult}x`);

    this._running = false;
  }

  renderUI() {
    this.container.innerHTML = `
      <div class="b5050">
        <div class="b5050__title">50 / 50</div>

        <div class="b5050__reels">
          <div class="b5050__reel" data-reel="left">
            <div class="b5050__window"></div>
            <div class="b5050__track" id="b5050TrackLeft"></div>
          </div>

          <div class="b5050__vs">VS</div>

          <div class="b5050__reel" data-reel="right">
            <div class="b5050__window"></div>
            <div class="b5050__track" id="b5050TrackRight"></div>
          </div>
        </div>

        <div class="b5050__results">
          <div class="b5050__pill b5050__pill--left" id="b5050PillLeft" hidden></div>
          <div class="b5050__pill b5050__pill--right" id="b5050PillRight" hidden></div>
        </div>

        <div class="b5050__boom" id="b5050Boom" hidden>
          <img src="${this.options.boomSvgUrl}" alt="boom">
        </div>

        <div class="b5050__final" id="b5050Final" hidden></div>
        <div class="b5050__hint" id="b5050Hint">Spinning...</div>
      </div>
    `;
  }

  buildTrackHtml(pool) {
    // repeat to allow deep scroll
    const seq = [];
    for (let i = 0; i < 22; i++) seq.push(pool[i % pool.length]);
    return seq
      .map(v => `<div class="b5050__cell">${this.formatX(v)}</div>`)
      .join('');
  }

  async spinReel(side, pool, result) {
    const track = document.getElementById(side === 'left' ? 'b5050TrackLeft' : 'b5050TrackRight');
    if (!track) return;

    track.innerHTML = this.buildTrackHtml(pool);

    // Each cell is 54px (see CSS). Stop near bottom on the desired value.
    const cellH = 54;
    // find an index late in the list for smooth scroll
    const baseIndex = 18;
    const idxInPool = pool.indexOf(result);
    const stopIndex = baseIndex + (idxInPool >= 0 ? idxInPool : 0);

    // starting position
    track.style.transition = 'none';
    track.style.transform = `translateY(0px)`;
    // force reflow
    void track.offsetHeight;

    // spin down
    const distance = stopIndex * cellH;
    track.style.transition = 'transform 1200ms cubic-bezier(.12,.82,.12,1)';
    track.style.transform = `translateY(-${distance}px)`;

    await this.wait(1250);
  }

  async showResults(leftResult, rightResult, goodOnLeft) {
    const pillL = document.getElementById('b5050PillLeft');
    const pillR = document.getElementById('b5050PillRight');
    const hint = document.getElementById('b5050Hint');

    if (!pillL || !pillR) return;

    pillL.innerHTML = `
      <span class="b5050__pillTag ${goodOnLeft ? 'is-good' : 'is-bad'}">${goodOnLeft ? 'GOOD' : 'BAD'}</span>
      <span class="b5050__pillX">${this.formatX(leftResult)}</span>
    `;
    pillR.innerHTML = `
      <span class="b5050__pillTag ${goodOnLeft ? 'is-bad' : 'is-good'}">${goodOnLeft ? 'BAD' : 'GOOD'}</span>
      <span class="b5050__pillX">${this.formatX(rightResult)}</span>
    `;

    pillL.hidden = false;
    pillR.hidden = false;

    // animate slide-in
    pillL.classList.remove('show');
    pillR.classList.remove('show');
    void pillL.offsetHeight;

    pillL.classList.add('show');
    pillR.classList.add('show');

    if (hint) hint.textContent = 'Your multipliers:';
    await this.wait(380);
  }

  async collisionAndPick(leftResult, rightResult) {
    const pillL = document.getElementById('b5050PillLeft');
    const pillR = document.getElementById('b5050PillRight');
    const boom = document.getElementById('b5050Boom');
    const final = document.getElementById('b5050Final');
    const hint = document.getElementById('b5050Hint');

    if (!pillL || !pillR || !boom || !final) return leftResult;

    if (hint) hint.textContent = 'Deciding...';

    // fly to center
    pillL.classList.add('to-center');
    pillR.classList.add('to-center');
    await this.wait(380);

    // boom
    boom.hidden = false;
    boom.classList.add('pop');
    await this.wait(420);

    // choose winner (50/50)
    const pickLeft = Math.random() < 0.5;
    const chosen = pickLeft ? leftResult : rightResult;

    // hide losing pill
    (pickLeft ? pillR : pillL).classList.add('fade-out');
    await this.wait(220);

    // show final in center
    final.innerHTML = `${this.formatX(chosen)}`;
    final.hidden = false;
    final.classList.add('show');

    if (hint) hint.textContent = 'Result:';

    await this.wait(900);
    return chosen;
  }

  formatX(v) {
    // show 1.5x without trailing zeros
    return `${Number.isInteger(v) ? v : v.toString()}x`;
  }

  wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

window.Bonus5050 = Bonus5050;
console.log('[Bonus5050] ✅ SLOT 50/50 module ready');

// ============================
// Styles injected (self-contained)
// ============================
if (!document.getElementById('bonus5050-styles')) {
  const style = document.createElement('style');
  style.id = 'bonus5050-styles';
  style.textContent = `
    .bonus-overlay {
      position: fixed;
      inset: 0;
      z-index: 9000;
      display: none;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.25s ease;
      pointer-events: none;
    }
    .bonus-overlay--active { opacity: 1; pointer-events: auto; }
    .bonus-overlay__blur-backdrop{
      position:absolute; inset:0;
      background: rgba(0,0,0,.82);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    .bonus-container{ position:relative; z-index:1; width:min(360px, 92vw); }

    .b5050{
      width: 100%;
      text-align:center;
      color:#fff;
      padding: 14px 12px 6px;
    }
    .b5050__title{
      font-size: 40px;
      font-weight: 900;
      letter-spacing: 2px;
      margin-bottom: 14px;
      text-shadow: 0 0 24px rgba(255,255,255,.18);
    }

    .b5050__reels{
      display:flex;
      align-items:center;
      justify-content:center;
      gap: 14px;
      margin-bottom: 14px;
    }
    .b5050__vs{
      font-weight: 900;
      opacity:.7;
      letter-spacing: 2px;
    }

    .b5050__reel{
      width: 126px;
      height: 168px;
      border-radius: 18px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 18px 50px rgba(0,0,0,.45);
      overflow:hidden;
      position:relative;
    }
    .b5050__window{
      position:absolute; inset:0;
      background:
        linear-gradient(180deg, rgba(0,0,0,.65), rgba(0,0,0,0) 34%, rgba(0,0,0,0) 66%, rgba(0,0,0,.65));
      pointer-events:none;
    }
    .b5050__track{
      padding: 8px 10px;
      transform: translateY(0px);
      will-change: transform;
    }
    .b5050__cell{
      height: 54px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius: 14px;
      margin: 6px 0;
      font-weight: 900;
      font-size: 22px;
      background: rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    }

    .b5050__results{
      position: relative;
      height: 56px;
      margin: 4px 0 10px;
    }
    .b5050__pill{
      position:absolute;
      top: 0;
      height: 52px;
      width: 160px;
      border-radius: 999px;
      background: rgba(0,0,0,0.45);
      border: 1px solid rgba(255,255,255,0.10);
      display:flex;
      align-items:center;
      justify-content: space-between;
      padding: 0 14px;
      gap: 10px;
      box-shadow: 0 14px 40px rgba(0,0,0,.45);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity .28s ease, transform .28s ease;
    }
    .b5050__pill.show{
      opacity: 1;
      transform: translateY(0);
    }
    .b5050__pill--left{ left: 0; }
    .b5050__pill--right{ right: 0; }

    .b5050__pillTag{
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 1px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.12);
    }
    .b5050__pillTag.is-good{
      background: rgba(0,166,255,0.18);
      border-color: rgba(0,166,255,0.28);
    }
    .b5050__pillTag.is-bad{
      background: rgba(255,77,79,0.16);
      border-color: rgba(255,77,79,0.22);
    }

    .b5050__pillX{
      font-size: 20px;
      font-weight: 900;
      letter-spacing: .4px;
    }

    .b5050__pill.to-center{
      left: 50% !important;
      right: auto !important;
      transform: translate(-50%, 0) scale(0.98);
      transition: transform .34s cubic-bezier(.2,.8,.2,1), left .34s cubic-bezier(.2,.8,.2,1), right .34s cubic-bezier(.2,.8,.2,1);
    }
    .b5050__pill--right.to-center{
      right: auto !important;
      left: 50% !important;
    }

    .b5050__pill.fade-out{
      opacity: 0 !important;
      transform: translate(-50%, 0) scale(0.9) !important;
      transition: opacity .22s ease, transform .22s ease;
    }

    .b5050__boom{
      display:flex;
      justify-content:center;
      margin: 8px 0 6px;
    }
    .b5050__boom img{
      width: 110px;
      height: 110px;
      object-fit: contain;
      transform: scale(0.6);
      opacity: 0;
      transition: transform .18s ease, opacity .18s ease;
      filter: drop-shadow(0 18px 40px rgba(0,0,0,.55));
    }
    .b5050__boom.pop img{
      transform: scale(1);
      opacity: 1;
    }

    .b5050__final{
      font-size: 44px;
      font-weight: 900;
      margin-top: 2px;
      opacity: 0;
      transform: translateY(10px) scale(0.96);
      transition: opacity .24s ease, transform .24s ease;
      text-shadow: 0 0 30px rgba(0,166,255,0.18);
    }
    .b5050__final.show{
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .b5050__hint{
      margin-top: 8px;
      font-size: 14px;
      font-weight: 700;
      opacity: .75;
      letter-spacing: .4px;
    }

    @media (max-width: 380px){
      .b5050__title{ font-size: 34px; }
      .b5050__reel{ width: 118px; height: 160px; }
      .b5050__pill{ width: 150px; }
      .b5050__final{ font-size: 40px; }
    }
    @media (prefers-reduced-motion: reduce){
      *{ animation:none !important; transition:none !important; }
    }
  `;
  document.head.appendChild(style);
  console.log('[Bonus5050] ✅ Styles injected');
}
