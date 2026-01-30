// js/wildtime.js
// Wild Time bonus (gold wheel + 3 pointers + jar mini-game)
//
// FIXES in this version:
// - Multipliers + jars are truly centered (no "at the bottom").
// - Jars wait for images to load before measuring/positioning.
// - Shuffling is stronger (full permutations + faster end).
// - After timer/pick: jars lift -> fade out -> multipliers stay 3-4s.
//
// Paths used (adjust if your folders differ):
// - wheel sector images: images/Wildtime/2x.png, 6x.png, 14x.png, 22x.png (1800x550)
// - jar images: images/Wildtime/jar1.png ... jar9.png
// - pointer image: images/pointer.png

(function () {
  "use strict";

  const CFG = {
    overlayId: "wildTimeOverlay",
    canvasId: "wildTimeCanvas",

    // wheel
    sectorsCount: 24,
    multipliers: [2, 6, 14, 22],
    balancedDistribution: true,

    appearWaitMs: 3000,
    accelMs: 600,          // было 900 - быстрее ускорение
    fastOmega: 9.5,        // было 7.5 - быстрее вращение
    idleOmega: 0.0,
    
    decelMsMin: 4500,      // было 11000 - быстрее остановка
    decelMsMax: 6500,      // было 15000 - быстрее остановка
    extraTurnsMin: 2,      // было 3 - меньше оборотов
    extraTurnsMax: 4,      // было 5 - меньше оборотов

    pointerOffsetSectors: 2, // ±2 sectors => ±30deg

    // jar game
    jarPool: 9,
    jarPickCount: 3,
    jarAppearMs: 380,
    jarCoverDelayMs: 120,
    preShowXsMs: 1200,

    jarShuffleSteps: 16,
    jarShuffleMsStart: 420,
    jarShuffleMsEnd: 95,

    pickCountdownSec: 5,

    // reveal / close
    revealShowMs: 3600,
    winPopupMs: 900,
    closeFadeMs: 260
  };

  const TAU = Math.PI * 2;
  const POINTER_ANGLE = -Math.PI / 2; // top

  // state
  let overlay, canvas, ctx, DPR = 1;
  let raf = 0, lastTs = 0;

  let angle = 0;
  let omega = CFG.idleOmega;
  let phase = "idle"; // idle | accel | decel | stopped
  let decel = null;

  let sectors = []; // 24 values of 2/6/14/22
  let multImgs = new Map(); // multiplier -> Image | null
  let imagesLoaded = false;

  let betAmount_ = 0;
  let resolve_ = null;
  let aborted = false;

  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const mod = (n, m) => ((n % m) + m) % m;

  const easeInQuad = (t) => t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // helper: promise that resolves when <img> is loaded (or already complete)
  const waitImg = (imgEl) =>
    new Promise((res) => {
      if (!imgEl) return res();
      if (imgEl.complete && imgEl.naturalWidth > 0) return res();
      const done = () => res();
      imgEl.addEventListener("load", done, { once: true });
      imgEl.addEventListener("error", done, { once: true });
    });

  // IMPORTANT: mount to body so fixed overlay is truly full-screen even if #wheelPage is transformed
  function mountRoot() {
      return document.getElementById("wheelPage") || document.body;
    }
    

  function ensureOverlay() {
    let el = document.getElementById(CFG.overlayId);
    if (el) return el;

    const offsetDeg = (360 / CFG.sectorsCount) * CFG.pointerOffsetSectors; // 30deg

    el = document.createElement("div");
    el.id = CFG.overlayId;
    el.className = "wt-overlay";
    el.style.display = "none";

    el.innerHTML = `
      <div class="wt-backdrop"></div>

      <!-- Universal Back button -->
      <button class="universal-back-btn" type="button" aria-label="Go back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span class="universal-back-text">Back</span>
      </button>

      <div class="wt-container">
        <!-- WHEEL STAGE -->
        <div class="wt-stage" id="wildTimeStage">
          <canvas id="${CFG.canvasId}"></canvas>

          <img class="wt-pointer" style="--ang:${-offsetDeg}deg" src="images/pointer.png" alt="">
          <img class="wt-pointer" style="--ang:0deg" src="images/pointer.png" alt="">
          <img class="wt-pointer" style="--ang:${offsetDeg}deg" src="images/pointer.png" alt="">
        </div>

        <!-- JAR GAME SCREEN -->
        <div class="wt-jarGame" id="wildTimeJarGame" aria-hidden="true">
          <div class="wt-jarRow" id="wildTimeJarRow">
            <div class="wt-slot" data-slot="0"><div class="wt-mult" data-mult="0"></div></div>
            <div class="wt-slot" data-slot="1"><div class="wt-mult" data-mult="1"></div></div>
            <div class="wt-slot" data-slot="2"><div class="wt-mult" data-mult="2"></div></div>
          </div>

          <div class="wt-hint" id="wildTimeHint"></div>
          <div class="wt-countdown" id="wildTimeCountdown"></div>
          <div class="wt-win" id="wildTimeWin"></div>
        </div>
      </div>
    `;

    // bind universal Back button to global handler
    const backBtn = el.querySelector('.universal-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (typeof window.__bonusBackHandler === 'function') {
          window.__bonusBackHandler();
        }
      });
    }

    mountRoot().appendChild(el);
    return el;
  }

  function openOverlay() {
    overlay.style.display = "flex";
    overlay.classList.remove("wt-leave");
    document.documentElement.classList.add("bonus-active");
    document.body.classList.add("bonus-active");
    requestAnimationFrame(() => overlay.classList.add("wt-active"));
  }

  function closeOverlay() {
    overlay.classList.remove("wt-active");
    overlay.classList.add("wt-leave");
    document.documentElement.classList.remove("bonus-active");
    document.body.classList.remove("bonus-active");

    return new Promise((res) => {
      setTimeout(() => {
        overlay.style.display = "none";
        overlay.classList.remove("wt-leave");
        res();
      }, CFG.closeFadeMs);
    });
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTs = 0;
  }

  function resetScreens() {
    const stage = overlay.querySelector("#wildTimeStage");
    const game = overlay.querySelector("#wildTimeJarGame");
    const hint = overlay.querySelector("#wildTimeHint");
    const cd = overlay.querySelector("#wildTimeCountdown");
    const winEl = overlay.querySelector("#wildTimeWin");
    const row = overlay.querySelector("#wildTimeJarRow");

    stage?.classList.remove("wt-stage--hide");

    if (game) {
      game.classList.remove("wt-jarGame--show");
      game.classList.remove("wt-jarGame--reveal");
      game.setAttribute("aria-hidden", "true");
    }

    if (hint) hint.textContent = "";
    if (cd) {
      cd.textContent = "";
      cd.classList.remove("wt-countdown--show");
    }
    if (winEl) {
      winEl.textContent = "";
      winEl.classList.remove("wt-win--show");
    }

    // remove jars
    row?.querySelectorAll(".wt-jarBtn").forEach((n) => n.remove());

    // reset multipliers
    overlay.querySelectorAll(".wt-mult").forEach((m) => {
      m.textContent = "";
      m.classList.remove("wt-mult--hidden");
      m.classList.remove("wt-mult--selected");
    });
  }

  // ---- wheel data ----
  function buildSectors() {
      // Красивый паттерн: светлый-темный-светлый чередование
      // 2 (светлый), 6 (темный), 14 (светлый), 6 (темный), 2, 6, 14, 22 (темный)
      const pattern = [2, 6, 14, 6, 2, 6, 14, 22];
      
      // Повторяем паттерн 3 раза для 24 секторов
      const arr = [];
      const repeats = Math.floor(CFG.sectorsCount / pattern.length);
      
      for (let i = 0; i < repeats; i++) {
        arr.push(...pattern);
      }
      
      return arr;
    }

  function preloadMultiplierImages() {
    imagesLoaded = false;
    multImgs.clear();

    return Promise.all(
      CFG.multipliers.map((m) => {
        const src = `images/Wildtime/${m}x.png`;
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { multImgs.set(m, img); resolve(); };
          img.onerror = () => { console.warn("[WildTime] missing:", src); multImgs.set(m, null); resolve(); };
          img.src = src;
        });
      })
    ).then(() => { imagesLoaded = true; });
  }

  // ---- canvas ----
  function prepareCanvas() {
    DPR = window.devicePixelRatio || 1;

    const cssW = canvas.clientWidth || 720;
    const cssH = canvas.clientHeight || 720;

    canvas.width = Math.round(cssW * DPR);
    canvas.height = Math.round(cssH * DPR);

    ctx = canvas.getContext("2d");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const stage = overlay.querySelector("#wildTimeStage");
    const R = Math.min(cssW, cssH) / 2 - 10;
    stage?.style.setProperty("--ptr-r", `${Math.round(R + 16)}px`);
  }

  function drawRings(R) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.lineWidth = Math.max(3, R * 0.03);
    ctx.strokeStyle = "rgba(255, 214, 120, 0.35)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, R * 0.88, 0, TAU);
    ctx.lineWidth = Math.max(2, R * 0.012);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();

    ctx.restore();
  }

  function drawHub(R) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(0, 0, R * 0.11, 0, TAU);
    const g = ctx.createRadialGradient(0, 0, R * 0.01, 0, 0, R * 0.12);
    g.addColorStop(0, "#2b220d");
    g.addColorStop(0.55, "#0a0703");
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.stroke();

    ctx.restore();
  }

  // 1800x550 into sector with cover-scale + wedge clipping
  function drawWheel() {
    if (!ctx) return;

    const w = canvas.width / DPR;
    const h = canvas.height / DPR;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R);
    bg.addColorStop(0, "rgba(255, 215, 120, 0.06)");
    bg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    const N = sectors.length;
    const step = TAU / N;

    const inner = R * 0.18;
    const outer = R * 0.98;
    const radialLen = outer - inner;

    for (let i = 0; i < N; i++) {
      const a0 = i * step;
      const a1 = a0 + step;
      const mid = a0 + step / 2;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0, a1);
      ctx.closePath();
      ctx.clip();

      const alt = (i % 2 === 0);
      ctx.fillStyle = alt ? "rgba(255, 215, 130, 0.22)" : "rgba(160, 105, 20, 0.22)";
      ctx.fillRect(-R, -R, R * 2, R * 2);

      const mult = sectors[i];
      const img = imagesLoaded ? multImgs.get(mult) : null;

      if (img) {
        ctx.save();
        ctx.rotate(mid);

        const wedgeThicknessOuter = 2 * outer * Math.tan(step / 2);
        const targetW = radialLen * 1.08;
        const targetH = wedgeThicknessOuter * 1.22;

        const scale = Math.max(targetW / img.width, targetH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;

        ctx.drawImage(img, inner + radialLen * -0.15, -dh / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.save();
        ctx.rotate(mid);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `900 ${Math.round(R * 0.08)}px system-ui, Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${mult}x`, inner + radialLen * 0.55, 0);
        ctx.restore();
      }

      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0, a1);
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.stroke();
      ctx.restore();
    }

    drawRings(R);
    drawHub(R);

    ctx.restore();
  }

  // ---- animation loop ----
  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;

    if (phase === "decel" && decel) {
      const t = Math.min(1, (ts - decel.t0) / decel.dur);
      const eased = easeOutCubic(t);
      angle = decel.start + (decel.end - decel.start) * eased;

      if (t >= 1) {
        angle = decel.end;
        phase = "stopped";
        omega = 0;

        const centerIdx = decel.centerIdx;
        decel = null;
        onStopped(centerIdx);
      }
    } else if (phase === "idle" || phase === "accel") {
      angle += omega * dt;
    }

    drawWheel();
    raf = requestAnimationFrame(tick);
  }

  function accelerateTo(targetOmega, ms) {
    return new Promise((resolve) => {
      const startOmega = omega;
      const t0 = performance.now();

      const step = () => {
        if (aborted) return resolve();
        const t = Math.min(1, (performance.now() - t0) / ms);
        omega = startOmega + (targetOmega - startOmega) * easeInQuad(t);
        if (t < 1) requestAnimationFrame(step);
        else { omega = targetOmega; resolve(); }
      };

      requestAnimationFrame(step);
    });
  }

  function decelerateToCenterIndex(centerIdx, durMs, extraTurns) {
    const N = sectors.length;
    const step = TAU / N;

    const normalized = mod(angle, TAU);
    const sliceCenter = centerIdx * step + step / 2;

    let delta = POINTER_ANGLE - normalized - sliceCenter;
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;

    const end = angle + delta + extraTurns * TAU;

    decel = { start: angle, end, t0: performance.now(), dur: durMs, centerIdx };
    phase = "decel";
    omega = 0;
  }

  // ---- 3 pointer results ----
  function getTriResults(centerIdx) {
    const N = sectors.length;
    const off = CFG.pointerOffsetSectors;

    const leftIdx = mod(centerIdx - off, N);
    const rightIdx = mod(centerIdx + off, N);

    return {
      left: { idx: leftIdx, mult: sectors[leftIdx] },
      center: { idx: centerIdx, mult: sectors[centerIdx] },
      right: { idx: rightIdx, mult: sectors[rightIdx] }
    };
  }

  // ---- close handlers ----
  function bindClose() {
    const onClick = async (e) => {
      if (e.target === overlay || e.target.classList.contains("wt-backdrop")) {
        await abortClose("closed");
      }
    };
    const onKey = async (e) => {
      if (e.key === "Escape") await abortClose("closed");
    };

    overlay.__wt_click = onClick;
    overlay.__wt_key = onKey;
    overlay.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
  }

  function unbindClose() {
    if (overlay?.__wt_click) overlay.removeEventListener("click", overlay.__wt_click);
    if (overlay?.__wt_key) window.removeEventListener("keydown", overlay.__wt_key);
    overlay.__wt_click = null;
    overlay.__wt_key = null;
  }

  async function abortClose(val) {
    aborted = true;

    const r = resolve_;
    resolve_ = null;

    if (window.__bonusBackHandler) window.__bonusBackHandler = null;

    stopLoop();
    unbindClose();

    try {
      if (overlay?.__wt_resize) window.removeEventListener("resize", overlay.__wt_resize);
      overlay.__wt_resize = null;
    } catch (_) {}

    await closeOverlay();
    if (typeof r === 'function') r(val);
  }

  // ---- payout ----
  function payout(betAmount, chosenMult) {
    const bet = Number(betAmount) || 0;
    const mult = Number(chosenMult) || 0;

    const currency = (window.WheelGame?.getCurrentCurrency?.() ?? window.currentCurrency) || "ton";
    const raw = bet * mult;
    const winAmount = currency === "stars" ? Math.round(raw) : +raw.toFixed(2);

    // If bet is 0, still return computed value (0) but skip balance changes
    if (bet > 0 && mult > 0) {
      if (typeof window.showWinNotification === "function") {
        try { window.showWinNotification(winAmount); } catch (_) {}
      }
      if (window.TEST_MODE && typeof window.addWinAmount === "function") {
        try { window.addWinAmount(winAmount, currency); } catch (_) {}
      }
    }

    return { winAmount, currency };
  }

  // ---- jar game helpers ----
  function pickUniqueJars() {
    const arr = Array.from({ length: CFG.jarPool }, (_, i) => i + 1);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, CFG.jarPickCount);
  }

  function setMults(gameEl, vals) {
    for (let i = 0; i < 3; i++) {
      const el = gameEl.querySelector(`.wt-mult[data-mult="${i}"]`);
      if (el) el.textContent = `${vals[i]}x`;
    }
  }

  function setMultsHidden(gameEl, hidden) {
    gameEl.querySelectorAll(".wt-mult").forEach((m) => {
      m.classList.toggle("wt-mult--hidden", hidden);
    });
  }

  function highlightMult(gameEl, slotIndex) {
    gameEl.querySelectorAll(".wt-mult").forEach((m) => m.classList.remove("wt-mult--selected"));
    const el = gameEl.querySelector(`.wt-mult[data-mult="${slotIndex}"]`);
    if (el) el.classList.add("wt-mult--selected");
  }

  function setJarVars(el, x, y, rotDeg, liftPx, opacity) {
    el.style.setProperty("--x", `${x}px`);
    el.style.setProperty("--y", `${y}px`);
    el.style.setProperty("--rot", `${rotDeg}deg`);
    el.style.setProperty("--lift", `${liftPx}px`);
    if (opacity != null) el.style.opacity = String(opacity);
  }

  async function tweenJar(el, x, y, rotDeg, ms) {
    el.style.transition = `transform ${ms}ms cubic-bezier(0.22,0.75,0.12,1), opacity 220ms ease`;
    setJarVars(el, x, y, rotDeg, 0, 1);
    await sleep(ms);
    el.style.transition = "";
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---- jar game main ----
  async function runJarGameWithPreShow(tri) {
    const stage = overlay.querySelector("#wildTimeStage");
    const game = overlay.querySelector("#wildTimeJarGame");
    const row = overlay.querySelector("#wildTimeJarRow");
    const hint = overlay.querySelector("#wildTimeHint");
    const countdownEl = overlay.querySelector("#wildTimeCountdown");
    const winEl = overlay.querySelector("#wildTimeWin");

    // Show jar screen, hide wheel
    stage?.classList.add("wt-stage--hide");
    game.classList.add("wt-jarGame--show");
    game.setAttribute("aria-hidden", "false");
    game.classList.remove("wt-jarGame--reveal");

    // Left/Center/Right results initially visible
    const base = [tri.left.mult, tri.center.mult, tri.right.mult];
    setMults(game, base);

    // remove old jars
    row.querySelectorAll(".wt-jarBtn").forEach((n) => n.remove());

    // PRE-SHOW Xs (visible)
    hint.textContent = "";
    countdownEl.textContent = "";
    countdownEl.classList.remove("wt-countdown--show");
    setMultsHidden(game, false);

    await sleep(CFG.preShowXsMs);
    if (aborted) return "aborted";

    // capture exact centers/bottoms of the visible multipliers (so jars land perfectly over them)
    const rowRectPre = row.getBoundingClientRect();
    const multRects = [0, 1, 2].map((i) => {
      const el = row.querySelector(`.wt-mult[data-mult="${i}"]`);
      const r = el.getBoundingClientRect();
      return {
        cx: (r.left + r.right) / 2 - rowRectPre.left,
        bottom: r.bottom - rowRectPre.top
      };
    });
    const slotXs = multRects.map((m) => m.cx);

    // AFTER PRE-SHOW: cover (hide mults) + drop jars
    await sleep(CFG.jarCoverDelayMs);
    setMultsHidden(game, true);

    const jarNum = randInt(1, CFG.jarPool);
    const jars = [];

    // Create jars (each jar "carries" its mult with it, like shells)
    for (let i = 0; i < 3; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wt-jarBtn";
      btn.disabled = true;
      btn.innerHTML = `<img class="wt-jarImg" src="images/Wildtime/jar${jarNum}.png" alt="">`;
      row.appendChild(btn);

      jars.push({ el: btn, pos: i, mult: base[i] });

      btn.style.opacity = "0";
      setJarVars(btn, 0, 0, 0, 0, 0);
    }

    // wait for jar images to load BEFORE measuring
    await Promise.all(jars.map((j) => waitImg(j.el.querySelector("img"))));
    await sleep(0);

    const rowRect = row.getBoundingClientRect();
    const jarRect = jars[0]?.el.getBoundingClientRect();
    const jarW = jarRect?.width || 180;
    const jarH = jarRect?.height || 230;

    // y for each slot: bottom of text -> jar bottom slightly lower (covers text fully)
    const coverPad = clamp(jarH * 0.06, 10, 18);
    const slotYs = multRects.map((m) => clamp(m.bottom - jarH + coverPad, 0, rowRect.height - jarH));

    // appear / drop
    for (const j of jars) {
      const x = slotXs[j.pos] - jarW / 2;
      const y = slotYs[j.pos];
      j.el.style.opacity = "1";
      await tweenJar(j.el, x, y - 22, 0, 130);
      await tweenJar(j.el, x, y, 0, CFG.jarAppearMs);
    }

    // SHUFFLE (stronger)
    hint.textContent = "Shuffling...";
    jars.forEach((j) => j.el.classList.add("wt-jarBtn--shuffling"));

    // we shuffle by applying full random permutations each step
    for (let s = 0; s < CFG.jarShuffleSteps; s++) {
      if (aborted) return "aborted";

      const t = s / Math.max(1, CFG.jarShuffleSteps - 1);
      let ms = Math.round(CFG.jarShuffleMsStart + (CFG.jarShuffleMsEnd - CFG.jarShuffleMsStart) * t);

      // last steps are extra fast
      if (s > CFG.jarShuffleSteps - 5) ms = Math.max(70, ms - 25);

      const perm = shuffleArray([0, 1, 2]); // which slot each jar goes to
      jars.forEach((j, idx) => { j.pos = perm[idx]; });

      const kick = (Math.random() * 2 - 1) * clamp(jarH * 0.08, 10, 18);

      await Promise.all(
        jars.map((j, idx) => {
          const x = slotXs[j.pos] - jarW / 2;
          const y = slotYs[j.pos] + kick * (idx - 1) * 0.55;
          const rot = (Math.random() * 34 - 17);
          return tweenJar(j.el, x, y, rot, ms);
        })
      );
    }

    jars.forEach((j) => j.el.classList.remove("wt-jarBtn--shuffling"));

    // PICK phase (RULE: jars lift ONLY when timer ends)
    hint.textContent = "Pick a jar";

    let selectedJar = null;
    let finished = false;

    jars.forEach((j) => {
      j.el.disabled = false;
      j.el.onclick = () => {
        if (aborted || finished) return;
        selectedJar = j;
        jars.forEach((x) => x.el.classList.remove("wt-jarBtn--picked"));
        j.el.classList.add("wt-jarBtn--picked");
      };
    });

    // countdown
    let sec = CFG.pickCountdownSec;
    countdownEl.textContent = String(sec);
    countdownEl.classList.add("wt-countdown--show");

    let pickedMult = null;
    let pickedSlot = null;

    let pickDoneResolve;
    const pickDone = new Promise((res) => { pickDoneResolve = res; });

    const endReveal = async () => {
      if (finished || aborted) return;
      finished = true;

      // lock interaction
      jars.forEach((x) => { x.el.disabled = true; x.el.onclick = null; });

      // auto-pick if user didn't choose
      if (!selectedJar) {
        selectedJar = jars[(Math.random() * jars.length) | 0];
        jars.forEach((x) => x.el.classList.remove("wt-jarBtn--picked"));
        selectedJar.el.classList.add("wt-jarBtn--picked");
      }

      countdownEl.classList.remove("wt-countdown--show");

      // mapping by current slot positions (after shuffle)
      const valsBySlot = [null, null, null];
      jars.forEach((jj) => { valsBySlot[jj.pos] = jj.mult; });

      // reveal multipliers in correct order
      setMults(game, valsBySlot);
      setMultsHidden(game, false);
      game.classList.add("wt-jarGame--reveal");

      // lift jars ONLY NOW (timer ended)
      const liftChosen = clamp(Math.round(jarH * 0.62), 150, 220);
      const liftOther = clamp(Math.round(jarH * 0.48), 110, 180);

      jars.forEach((jj) => {
        jj.el.classList.add("wt-jarBtn--lift");
        jj.el.style.setProperty("--lift", `${jj === selectedJar ? liftChosen : liftOther}px`);
        if (jj === selectedJar) jj.el.classList.add("wt-jarBtn--chosen");
      });

      // highlight chosen multiplier and store result
      pickedMult = selectedJar.mult;
      pickedSlot = selectedJar.pos;

      highlightMult(game, pickedSlot);

      // after lift, fade jars away and leave multipliers visible
      await sleep(620);
      jars.forEach((jj) => {
        jj.el.style.transition = "opacity 260ms ease";
        jj.el.style.opacity = "0";
      });
      await sleep(280);
      jars.forEach((jj) => jj.el.remove());

      // keep multipliers visible 3-4s
      await sleep(CFG.revealShowMs);

      // Payout at the END (after reveal)
      // Payout at the END (after reveal)
      const pay = payout(betAmount_, pickedMult);
      // winEl display removed - using base notification instead

      await sleep(CFG.revealShowMs); // используем время показа множителей вместо winPopupMs          
      if (pickDoneResolve) pickDoneResolve(true);
    };

    const timer = setInterval(() => {
      if (aborted || finished) { clearInterval(timer); return; }
      sec -= 1;
      countdownEl.textContent = String(Math.max(0, sec));
      if (sec <= 0) {
        clearInterval(timer);
        endReveal();
      }
    }, 1000);

    // wait for timer end reveal
    while (!finished && !aborted) await sleep(50);
    if (aborted) {
      clearInterval(timer);
      if (pickDoneResolve) pickDoneResolve(false);
      return "aborted";
    }

    // Wait until reveal animation finishes (otherwise overlay closes immediately)
    await pickDone;

    return {
      chosenMult: pickedMult,
      chosenSlot: pickedSlot
    };
  }

  // ---- stop -> show pre Xs -> jars -> shuffle -> pick -> reveal -> close ----
  async function onStopped(centerIdx) {
    if (aborted) return;

    const tri = getTriResults(centerIdx);
    const jarRes = await runJarGameWithPreShow(tri);

    if (aborted) return;
    if (!resolve_) return;

    const r = resolve_;
    resolve_ = null;

    if (window.__bonusBackHandler) window.__bonusBackHandler = null;

    stopLoop();
    unbindClose();

    try {
      if (overlay?.__wt_resize) window.removeEventListener("resize", overlay.__wt_resize);
      overlay.__wt_resize = null;
    } catch (_) {}

    await closeOverlay();
    r({ tri, jar: jarRes });
  }

  // ---- public API ----
  window.startWildTimeBonus = async function startWildTimeBonus(betAmount = 0, opts = {}) {
    const prevPickCountdownSec = CFG.pickCountdownSec;
    const prevAppearWaitMs = CFG.appearWaitMs;
    const remainingSec = Number.isFinite(opts?.remainingSec) ? Math.max(1, Math.ceil(opts.remainingSec)) : null;

    if (remainingSec) {
      CFG.pickCountdownSec = Math.min(prevPickCountdownSec, remainingSec);
      CFG.appearWaitMs = remainingSec <= 3 ? 0 : Math.min(prevAppearWaitMs, 1000);
    }

    try {
      overlay = ensureOverlay();
      canvas = overlay.querySelector(`#${CFG.canvasId}`);
      if (!canvas) return "error";

      betAmount_ = betAmount;
      aborted = false;
      resetScreens();

      sectors = buildSectors();
      await preloadMultiplierImages();

      openOverlay();
      bindClose();
      window.__bonusBackHandler = () => { abortClose('closed'); };

      prepareCanvas();
      drawWheel();

      const onResize = () => { if (!aborted) { prepareCanvas(); drawWheel(); } };
      window.addEventListener("resize", onResize, { passive: true });
      overlay.__wt_resize = onResize;

      stopLoop();
      phase = "idle";
      omega = CFG.idleOmega;
      lastTs = performance.now();
      raf = requestAnimationFrame(tick);

      // wait before spin
      await sleep(CFG.appearWaitMs);
      if (aborted) return "closed";

      // accelerate
      phase = "accel";
      await accelerateTo(CFG.fastOmega, CFG.accelMs);
      if (aborted) return "closed";

      // choose stop index
      const centerIdx = (Math.random() * sectors.length) | 0;
      const dur = randInt(CFG.decelMsMin, CFG.decelMsMax);
      const extra = randInt(CFG.extraTurnsMin, CFG.extraTurnsMax);

      decelerateToCenterIndex(centerIdx, dur, extra);

      return await new Promise((resolve) => {
        resolve_ = (val) => resolve(val);
      });
    } finally {
      CFG.pickCountdownSec = prevPickCountdownSec;
      CFG.appearWaitMs = prevAppearWaitMs;
    }
  };
})();
