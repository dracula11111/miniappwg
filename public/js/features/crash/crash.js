/*
  Crash Game - Client-side (WebSocket version)
  - Connects to server via WebSocket
  - Receives real-time game state
  - All players see the same game
  - Place file: /public/js/features/crash/crash.js
*/

(() => {
  const PAGE_ID = "crashPage";
  const CANVAS_ID = "crashCanvas";
  const MULT_ID = "crashMult";
  const BUY_ID = "crashBuyBtn";
  const PLUS_ID = "crashPlusBtn";
  const AMOUNT_ROW_ID = "crashAmountRow";
  const BET_LABEL_ID = "crashBetLabel";
  const BET_ICON_ID = "crashBetIcon";
  const BET_TEXT_ID = "crashBetText";
  const STATUS_ID = "crashStatus";

  const TOAST_HOST_ID = "crashToastHost";
const ICON_TON = "/icons/currency/tgTonWhite.svg";
  const ICON_STAR = "/icons/currency/tgStarWhite.svg";
  let lastAppNoticeKey = "";
  let lastAppNoticeAt = 0;

  const qs = (sel, root = document) => root.querySelector(sel);
  // Detect localhost test mode
    const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function formatX(v) {
    if (!Number.isFinite(v)) return "0.00x";
    return `${v.toFixed(2)}x`;
  }

  function parseNumber(text) {
    const t = String(text ?? "").replace(/\s/g, "").replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }

  function getUserId() {
    if (IS_LOCALHOST) return "test_user_1";
    try {
      const tg = window.Telegram?.WebApp;
      const id = tg?.initDataUnsafe?.user?.id;
      if (id) return String(id);
    } catch (_) {}
    return localStorage.getItem("userId") || "guest_" + Date.now();
  }
  
  function getUserName() {
    if (IS_LOCALHOST) return "Test Player";
    try {
      const tg = window.Telegram?.WebApp;
      const user = tg?.initDataUnsafe?.user;
      if (user) {
        return user.first_name || user.username || `User ${String(user.id).slice(0, 6)}`;
      }
    } catch (_) {}
    return "Guest";
  }


  function getUserAvatar() {
    try {
      const tg = window.Telegram?.WebApp;
      return tg?.initDataUnsafe?.user?.photo_url || null;
    } catch (_) {}
    return null;
  }

  function getInitData() {
    try {
      return window.Telegram?.WebApp?.initData || "";
    } catch (_) {
      return "";
    }
  }

  function detectCurrency() {
    try {
      const active = String(window.WildTimeCurrency?.current || "").toLowerCase();
      if (active === "ton" || active === "stars") return active;
    } catch (_) {}

    const wtSaved = (localStorage.getItem("wt-currency") || "").toLowerCase();
    if (wtSaved === "ton" || wtSaved === "stars") return wtSaved;

    const src = (qs("#pillCurrencyIcon")?.getAttribute("src") || "").toLowerCase();
    if (src.includes("star")) return "stars";
    if (src.includes("ton")) return "ton";

    // Legacy keys as a last-resort fallback only.
    const legacy = (
      localStorage.getItem("currency") ||
      localStorage.getItem("selectedCurrency") ||
      localStorage.getItem("balanceCurrency") ||
      ""
    ).toLowerCase();
    if (legacy === "stars" || legacy === "star") return "stars";
    if (legacy === "ton") return "ton";

    return "ton";
  }

  function currencyIcon(currency) {
    return currency === "stars" ? ICON_STAR : ICON_TON;
  }

  function formatCurrencyAmount(value, currency) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    if (currency === "stars") return String(Math.max(0, Math.round(n)));
    return (Math.round(Math.max(0, n) * 100) / 100).toFixed(2);
  }

  function normalizeActionMessage(message, fallback = "Action failed") {
    const raw = String(message ?? "").trim();
    if (!raw) return fallback;

    const msg = raw.toLowerCase();
    if (/(insufficient|not enough|недостат)/i.test(msg)) return "Insufficient balance";
    if (/(wait next round|next round|betting.*closed|round.*closed|round.*finished|not betting|late bet|phase)/i.test(msg)) {
      return "Wait next round";
    }
    if (/(already.*bet|bet.*already|already.*placed|duplicate)/i.test(msg)) return "Bet already placed";
    if (/(invalid.*bet|invalid.*amount|min bet|minimum bet|amount too low)/i.test(msg)) return "Invalid bet";
    if (/(can't claim|cannot claim|claim.*closed|claim.*not)/i.test(msg)) return "Can't claim now";
    if (/(telegram auth required|auth required|init data|unauthorized)/i.test(msg)) return "Open game from Telegram";

    return fallback ? `${fallback}: ${raw}` : raw;
  }

  function detectNoticeVariant(message) {
    const text = String(message || "").toLowerCase();
    if (!text) return "warning";
    if (/(wait|next round|already|invalid|can't claim|cannot claim|open game from telegram)/i.test(text)) return "warning";
    if (/(success|claimed|placed)/i.test(text)) return "success";
    return "error";
  }

  function showAppNotice(message, opts = {}) {
    const text = String(message ?? "").trim();
    if (!text) return false;

    const dedupeMs = Number.isFinite(Number(opts.dedupeMs)) ? Math.max(0, Number(opts.dedupeMs)) : 900;
    const dedupeKey = String(opts.key || text).trim().toLowerCase();
    const now = Date.now();
    if (dedupeMs > 0 && dedupeKey && dedupeKey === lastAppNoticeKey && (now - lastAppNoticeAt) < dedupeMs) {
      return false;
    }
    lastAppNoticeKey = dedupeKey;
    lastAppNoticeAt = now;

    const ttl = Number.isFinite(Number(opts.ttl)) ? Math.max(900, Number(opts.ttl)) : 2200;
    const variant = String(opts.variant || detectNoticeVariant(text)).trim();
    const toastOpts = { ttl, variant };
    if (typeof opts.translate === "boolean") toastOpts.translate = opts.translate;

    try {
      if (typeof window.showToast === "function") {
        window.showToast(text, toastOpts);
        return true;
      }
      if (typeof window.notify === "function") {
        window.notify(text, toastOpts);
        return true;
      }
    } catch (_) {}

    try {
      showToast(text, { ttl });
      return true;
    } catch (_) {}

    return false;
  }

  async function apiDeposit({ amount, currency, type, roundId, depositId }) {
    const userId = getUserId();
    const initData = getInitData();

    const body = {
      amount,
      currency,
      userId,
      initData: initData || undefined,
      type,
      roundId,
      depositId,
      notify: false
    };

    const res = await fetch("/api/deposit-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      const msg = data?.error || data?.details || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return data;
  }

  async function refreshTopBalance() {
    const userId = getUserId();
    const elAmount = qs("#tonAmount");
    if (!elAmount) return;

    try {
      const initData = getInitData();
      const res = await fetch(`/api/balance?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
        headers: initData ? { "x-telegram-init-data": initData } : undefined
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) return;

      const cur = detectCurrency();
      if (cur === "stars") {
        elAmount.textContent = String(parseInt(data.stars, 10) || 0);
      } else {
        const v = Number(data.ton || 0);
        elAmount.textContent = v.toFixed(2);
      }
    } catch (_) {}
  }

  function ensureCrashPage() {
    let page = document.getElementById(PAGE_ID);
    if (page) return page;

    page = document.createElement("main");
    page.id = PAGE_ID;
    page.className = "page";

    page.innerHTML = `
  <section class="crash">
        <div class="crash-toastHost" id="${TOAST_HOST_ID}" aria-live="polite" aria-atomic="true"></div>
<div class="crash-card" data-theme="crypto">
      <div class="crash-canvasWrap">
        <div class="crash-spaceLayer" id="crashSpaceLayer" aria-hidden="true">
          <canvas id="crashSpaceCanvas" class="crash-spaceCanvas"></canvas>
          <div class="crash-spaceClouds" id="crashSpaceClouds"></div>
          <div class="crash-spaceGrass"></div>
          <div class="rocket" id="crashRocket"></div>
          <div class="crash-boomFx" id="crashRocketBoom"></div>
        </div>
        <canvas id="${CANVAS_ID}" aria-label="Crash chart"></canvas>
        <div class="crash-hud" aria-hidden="true">
          <div id="${MULT_ID}" class="crash-mult is-green">1.00x</div>
          <div id="crashTimer" class="crash-timer">10</div>
        </div>
      </div>
      <div class="crash-history" id="crashHistory"></div>
    </div>

    <div class="crash-panel">
      <div class="crash-panel__head">
        <div class="crash-panel__title">Players</div>
        <div class="crash-panel__game" id="crashGameCounter">Game #1</div>
      </div>
      <div class="crash-players" id="crashPlayers"></div>
      <div class="crash-panel__foot">
        <button class="crash-panel__hash" id="crashRoundHashCopy" type="button" aria-label="Copy round hash">
          <img class="crash-panel__hashIcon" src="/icons/ui/copy.svg" alt="" aria-hidden="true" />
          <span class="crash-panel__hashText" id="crashRoundHashLabel">Hash #--</span>
        </button>
      </div>
    </div>

    <div class="crash-controls">
      <div class="crash-controls__bar">
        <div class="crash-amountRow" id="${AMOUNT_ROW_ID}">
          <div class="crash-inputWrap">
            <input 
              type="text" 
              inputmode="decimal" 
              id="crashBetInput" 
              class="crash-betInput" 
              placeholder="0.1"
            />
          </div>
          <button class="crash-pill crash-maxBtn" type="button" data-amt="max">
            <span class="crash-pill__v">Max</span>
          </button>
        </div>

        <div class="crash-actions">
          <button class="crash-buy" id="${BUY_ID}" type="button">Place bet</button>
          <button class="crash-plus" id="${PLUS_ID}" type="button" aria-label="Deposit">+</button>
        </div>
      </div>
    </div>
  </section>

    `;

    const appRoot = qs(".app") || document.body;
    const bottomNav = qs(".bottom-nav", appRoot);
    if (bottomNav) appRoot.insertBefore(page, bottomNav);
    else appRoot.appendChild(page);

    return page;
  }

  function createEngine(page) {
    const canvas = document.getElementById(CANVAS_ID);
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    const cardEl = page?.querySelector(".crash-card");
    const canvasWrapEl = page?.querySelector(".crash-canvasWrap");

    const multEl = document.getElementById(MULT_ID);
    const buyBtn = document.getElementById(BUY_ID);
    const plusBtn = document.getElementById(PLUS_ID);
    const amountRow = document.getElementById(AMOUNT_ROW_ID);
    const betIconEl = document.getElementById(BET_ICON_ID);
    const betTextEl = document.getElementById(BET_TEXT_ID);
    const statusEl = document.getElementById(STATUS_ID);
    const playersEl = document.getElementById("crashPlayers");
    const gameCounterEl = document.getElementById("crashGameCounter");
    const roundHashCopyBtn = document.getElementById("crashRoundHashCopy");
    const roundHashLabelEl = document.getElementById("crashRoundHashLabel");
    const spaceLayerEl = document.getElementById("crashSpaceLayer");
    const spaceCanvas = document.getElementById("crashSpaceCanvas");
    const spaceCtx = spaceCanvas?.getContext("2d", { alpha: true, desynchronized: true }) || null;
    const spaceCloudsEl = document.getElementById("crashSpaceClouds");
    const rocketEl = document.getElementById("crashRocket");
    const boomEl = document.getElementById("crashRocketBoom");
    const timerEl = document.getElementById("crashTimer");
    const rootEl = document.documentElement;
    const pointerCoarse = (() => {
      try { return !!window.matchMedia?.("(pointer: coarse)")?.matches; } catch { return false; }
    })();
    const touchDevice = pointerCoarse || ((navigator?.maxTouchPoints || 0) > 0);
    const cpuCores = Number(navigator?.hardwareConcurrency || 0);
    const deviceMemory = Number(navigator?.deviceMemory || 0);
    const lowPowerDevice = touchDevice && (
      (Number.isFinite(cpuCores) && cpuCores > 0 && cpuCores <= 6) ||
      (Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4)
    );
    const spacePerf = {
      isTouch: touchDevice,
      lowPower: lowPowerDevice,
      dprCapSpace: lowPowerDevice ? 1.35 : (touchDevice ? 1.55 : 2.5),
      dprCapDefault: touchDevice ? 2 : 2.5,
      cloudCount: lowPowerDevice ? 7 : (touchDevice ? 9 : 12),
      cloudTickMs: lowPowerDevice ? 42 : (touchDevice ? 34 : 20),
      cssVarsTickMs: lowPowerDevice ? 46 : (touchDevice ? 34 : 20),
      starsTickMs: lowPowerDevice ? 44 : (touchDevice ? 34 : 18),
      maxStarsLite: lowPowerDevice ? 20 : (touchDevice ? 26 : 38),
      maxStarsFull: lowPowerDevice ? 28 : (touchDevice ? 36 : 68),
      starPoolSize: lowPowerDevice ? 44 : (touchDevice ? 56 : 96),
      spaceFps: lowPowerDevice ? 30 : (touchDevice ? 36 : 55),
      forceLiteStars: touchDevice
    };
    try {
      document.body?.classList?.toggle?.("crash-space-perf-lite", !!touchDevice);
    } catch (_) {}
    const ROCKET_SPRITES = Object.freeze([
      "/images/crash/rocketSpaceTheme1.webp",
      "/images/crash/rocketSpaceTheme2.webp",
      "/images/crash/rocketSpaceTheme3.webp",
      "/images/crash/rocketSpaceTheme4.webp"
    ]);

    function ensureTopbarThemeSwitch() {
      let root = document.getElementById("crashTopThemeSwitch");
      if (root) return root;

      const topbar = document.querySelector(".topbar");
      if (!topbar) return null;

      root = document.createElement("div");
      root.id = "crashTopThemeSwitch";
      root.className = "crash-topThemeSwitch";
      root.setAttribute("role", "group");
      root.setAttribute("aria-label", "Crash theme");
      root.setAttribute("data-active-theme", "crypto");
      root.innerHTML = `
        <button class="crash-topThemeBtn crash-topThemeBtn--crypto is-active" type="button" data-theme="crypto" aria-label="Crypto theme">
          <span class="crash-topThemeIco crash-topThemeIco--crypto" aria-hidden="true"></span>
        </button>
        <button class="crash-topThemeBtn crash-topThemeBtn--space" type="button" data-theme="space" aria-label="Space theme">
          <span class="crash-topThemeIco crash-topThemeIco--space" aria-hidden="true"></span>
        </button>
      `;

      const balanceRoot = topbar.querySelector(".balance");
      if (balanceRoot) topbar.insertBefore(root, balanceRoot);
      else topbar.appendChild(root);
      return root;
    }

    const topThemeSwitchEl = ensureTopbarThemeSwitch();

    let dpr = Math.max(1, Math.min(spacePerf.dprCapDefault, window.devicePixelRatio || 1));
    let W = 0;
    let H = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dprCap = (state.theme === "space") ? spacePerf.dprCapSpace : spacePerf.dprCapDefault;
      dpr = Math.max(1, Math.min(dprCap, window.devicePixelRatio || 1));
      W = Math.max(1, Math.floor(rect.width * dpr));
      H = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = W;
      canvas.height = H;
      if (spaceCanvas) {
        spaceCanvas.width = W;
        spaceCanvas.height = H;
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const state = {
      phase: "betting",
      phaseStart: 0,
      roundId: 0,
      gameCounter: 0,
      roundHash: "",
      crashPoint: 2.0,
      serverMult: 1.0,
      displayMult: 1.0,
      players: [],
      history: [],
      myBet: null,
      actionLock: false,

      gridShiftX: 0,
     
      gridBaseX: 0,

      gridTargetX: 0,

      gridScrollX: 0,        // накапливаемый скролл (мировые пиксели)
      lastFrameAt: 0 ,       // для dt
      scaleMinV: 0.9,
      scaleMaxV: 2.0,



      candles: [],
      maxCandles: 12, // bigger candles
      lastCandleAt: 0,
      candleMs: 220, // slower, more readable
      lastTimerSeconds: null,
      bettingTimeMs: 10000,
      bettingLeftMs: null,
      bettingLeftAt: 0,
      lastPlayerDomUpdate: 0,
      seenPlayerIds: new Set(),
      crashFxRoundId: -1,
      crashFxAt: 0,
      theme: "crypto",
      rocketAngleDeg: 0,
      rocketX: 0.50,
      rocketY: 0.72,
      rocketHidden: true,
      rocketSpriteRoundId: -1,
      rocketSprite: ROCKET_SPRITES[0],
      boomAt: 0,
      boomRoundId: -1,
      boomActive: false,
      stars: [],
      spaceMix: 0,
      spaceStars: 0,
      rocketReturnActive: false,
      rocketReturnRoundId: -1,
      rocketReturnStartAt: 0,
      rocketReturnDurationMs: 2600,
      rocketReturnFromY: 0.52,
      rocketReturnFromAngle: -12,
      rocketReturnFromMix: 0,
      rocketReturnFromStars: 0,
      cloudLayoutRoundId: -1,
      cloudFlow: [],
      cloudFlowLastAt: 0,
      lastRenderAt: 0,
      lastSpaceVarsAt: 0,
      lastSpaceStarsAt: 0,
      lastSpaceStarsAlpha: 0,
      lastSpaceStage: 0,
      spaceVarCache: Object.create(null)

    };

    let lastRenderedMetaKey = null;
    let lastRenderedHistoryKey = null;
    let lastRenderedPlayersKey = null;
    let lastUiPhaseKey = null;
    let lastStatusText = null;
    let lastTimerText = null;
    let lastTimerVisible = null;

    function formatHashPreview(hash) {
      const raw = String(hash || "").trim();
      if (!raw) return "Hash #--";
      if (raw.length <= 10) return `Hash #${raw}`;
      return `Hash #${raw.slice(0, 4)}...${raw.slice(-3)}`;
    }

    async function copyToClipboard(text) {
      const value = String(text || "").trim();
      if (!value) return false;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (_) {}

      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(ta);
        return !!copied;
      } catch (_) {
        return false;
      }
    }

    function renderPlayersPanelMeta(force = false) {
      const gameNo = Number.isFinite(Number(state.gameCounter)) && Number(state.gameCounter) > 0
        ? Math.trunc(Number(state.gameCounter))
        : Math.max(0, Math.trunc(Number(state.roundId) || 0));

      const nextGameText = `Game #${Math.max(1, gameNo || 1)}`;
      const nextHashText = formatHashPreview(state.roundHash);
      const nextMetaKey = `${nextGameText}|${nextHashText}`;

      if (!force && nextMetaKey === lastRenderedMetaKey) return;
      lastRenderedMetaKey = nextMetaKey;

      if (gameCounterEl) {
        if (gameCounterEl.textContent !== nextGameText) {
          gameCounterEl.textContent = nextGameText;
        }
      }

      if (roundHashLabelEl) {
        if (roundHashLabelEl.textContent !== nextHashText) {
          roundHashLabelEl.textContent = nextHashText;
        }
      }
    }

    function isRunPhase(phase) {
      return phase === "run" || phase === "running" || phase === "inGame";
    }

    function isCrashPageVisible() {
      if (document.hidden) return false;
      const pageActive = page?.classList?.contains("page-active");
      return !!(pageActive || document.body?.classList?.contains("page-crash"));
    }

    function isLiteRuntime() {
      return !!(rootEl?.classList?.contains("wt-lite") || rootEl?.classList?.contains("wt-reduced-motion"));
    }

    function getTargetFrameIntervalMs() {
      if (isCrashPageVisible()) {
        if (state.theme === "space") {
          return 1000 / Math.max(24, Number(spacePerf.spaceFps) || 36);
        }
        return isLiteRuntime() ? (1000 / 36) : (1000 / 55);
      }
      return hasActiveCrashBet() ? (1000 / 6) : (1000 / 1);
    }

    function makeStarPool(count = 96) {
      const stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          radius: 0.6 + Math.random() * 1.9,
          drift: 0.18 + Math.random() * 0.82,
          twinkle: 0.7 + Math.random() * 2.2,
          phase: Math.random() * Math.PI * 2,
          color: Math.random() > 0.86 ? "rgba(164,216,255,1)" : "rgba(255,255,255,1)"
        });
      }
      return stars;
    }

    function getSpaceStage(mult) {
      const m = Math.max(1, Number(mult) || 1);
      if (m < 2) return 1;
      if (m < 5) return 2;
      if (m < 10) return 3;
      return 4;
    }

    function getVisualMultiplier() {
      if (state.phase === "crash" || state.phase === "wait") {
        const crash = Number(state.crashPoint);
        if (Number.isFinite(crash) && crash > 0) return crash;
      }
      return Math.max(1, Number(state.displayMult) || Number(state.serverMult) || 1);
    }

    function clearSpaceCanvas() {
      if (!spaceCtx || !spaceCanvas) return;
      spaceCtx.clearRect(0, 0, spaceCanvas.width, spaceCanvas.height);
    }

    function applyRocketSprite(spritePath) {
      if (!rocketEl) return;
      const nextSprite = (typeof spritePath === "string" && spritePath) ? spritePath : ROCKET_SPRITES[0];
      rocketEl.style.backgroundImage = `url("${nextSprite}")`;
    }

    function applyRandomRocketSprite(force = false) {
      const roundKey = Number(state.roundId);
      const safeRoundKey = Number.isFinite(roundKey) ? roundKey : -1;

      if (!force && state.rocketSpriteRoundId === safeRoundKey) {
        applyRocketSprite(state.rocketSprite);
        return state.rocketSprite;
      }

      let nextSprite = ROCKET_SPRITES[Math.floor(Math.random() * ROCKET_SPRITES.length)] || ROCKET_SPRITES[0];

      if (ROCKET_SPRITES.length > 1 && nextSprite === state.rocketSprite) {
        const prevIdx = Math.max(0, ROCKET_SPRITES.indexOf(state.rocketSprite));
        const step = 1 + Math.floor(Math.random() * (ROCKET_SPRITES.length - 1));
        nextSprite = ROCKET_SPRITES[(prevIdx + step) % ROCKET_SPRITES.length];
      }

      state.rocketSprite = nextSprite;
      state.rocketSpriteRoundId = safeRoundKey;
      applyRocketSprite(nextSprite);
      return nextSprite;
    }

    function ensureFlowClouds(force = false) {
      if (!spaceCloudsEl) return;
      const desired = Math.max(5, Number(spacePerf.cloudCount) || 9);

      if (force) {
        for (const cloud of state.cloudFlow) cloud?.el?.remove?.();
        state.cloudFlow = [];
      }

      while (state.cloudFlow.length < desired) {
        const el = document.createElement("div");
        el.className = "crash-spaceCloud";
        spaceCloudsEl.appendChild(el);
        state.cloudFlow.push({
          el,
          x: 0,
          y: 0,
          dir: 1,
          speed: 0.06,
          size: 36,
          scale: 1,
          alpha: 0.65,
          margin: 0.42,
          lane: null,
          _left: NaN,
          _top: NaN,
          _scale: NaN
        });
      }

      while (state.cloudFlow.length > desired) {
        const cloud = state.cloudFlow.pop();
        cloud?.el?.remove?.();
      }
    }

    function makeCloudLanes() {
      const rnd = (min, max) => min + Math.random() * (max - min);
      const flowDir = Math.random() < 0.5 ? 1 : -1;
      return [
        {
          count: 4,
          y: rnd(0.10, 0.13),
          jitterY: 0.016,
          dir: flowDir,
          speedMin: 0.016,
          speedMax: 0.026,
          sizeMin: 18,
          sizeMax: 28,
          scaleMin: 0.76,
          scaleMax: 0.92,
          alphaMin: 0.22,
          alphaMax: 0.38
        },
        {
          count: 5,
          y: rnd(0.17, 0.22),
          jitterY: 0.020,
          dir: -flowDir,
          speedMin: 0.023,
          speedMax: 0.035,
          sizeMin: 24,
          sizeMax: 36,
          scaleMin: 0.88,
          scaleMax: 1.04,
          alphaMin: 0.32,
          alphaMax: 0.56
        },
        {
          count: 3,
          y: rnd(0.25, 0.31),
          jitterY: 0.022,
          dir: flowDir,
          speedMin: 0.030,
          speedMax: 0.044,
          sizeMin: 30,
          sizeMax: 44,
          scaleMin: 1.02,
          scaleMax: 1.16,
          alphaMin: 0.42,
          alphaMax: 0.72
        }
      ];
    }

    function applyFlowCloudStyle(cloud) {
      cloud.el.style.width = `${cloud.size.toFixed(2)}%`;
      cloud.el.style.height = `${(cloud.size * 0.62).toFixed(2)}%`;
      cloud.el.style.opacity = clamp(cloud.alpha, 0, 1).toFixed(3);
      cloud.el.style.zIndex = cloud.scale > 1.00 ? "3" : "2";
    }

    function placeFlowCloud(cloud, lane, slot = 0, total = 1, startVisible = false, phase = 0) {
      const rnd = (min, max) => min + Math.random() * (max - min);
      const safeTotal = Math.max(1, Number(total) || 1);
      const lanePhase = ((Number(phase) % 1) + 1) % 1;

      cloud.lane = lane;
      cloud.dir = lane.dir;
      cloud.size = rnd(lane.sizeMin, lane.sizeMax);
      cloud.scale = rnd(lane.scaleMin, lane.scaleMax);
      cloud.alpha = rnd(lane.alphaMin, lane.alphaMax);
      cloud.speed = rnd(lane.speedMin, lane.speedMax);
      cloud.y = clamp(lane.y + rnd(-lane.jitterY, lane.jitterY), 0.06, 0.36);
      cloud.margin = 0.22 + cloud.size / 170;

      if (startVisible) {
        const span = 1 + cloud.margin * 2;
        const xNorm = (slot + lanePhase) / safeTotal;
        cloud.x = -cloud.margin + xNorm * span;
      } else {
        const off = rnd(0.04, 0.26);
        cloud.x = cloud.dir > 0 ? -cloud.margin - off : 1 + cloud.margin + off;
      }

      applyFlowCloudStyle(cloud);
    }

    function resetOneFlowCloud(cloud, startVisible = false) {
      const lane = cloud.lane || makeCloudLanes()[1];
      placeFlowCloud(cloud, lane, 0, 1, startVisible, Math.random());
    }

    function updateCloudFlow(now, force = false) {
      if (!state.cloudFlow.length) return;
      if (!force) {
        const elapsedMs = now - (Number(state.cloudFlowLastAt) || 0);
        if (Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs < spacePerf.cloudTickMs) {
          return;
        }
      }

      const prev = Number(state.cloudFlowLastAt) || now;
      let dt = (now - prev) / 1000;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.10);
      state.cloudFlowLastAt = now;
      const runNow = isRunPhase(state.phase);
      const flightBoost = runNow ? (1 + clamp(Number(state.spaceMix) || 0, 0, 1) * 2.6) : 1;
      const passScale = runNow ? (1 + clamp(Number(state.spaceMix) || 0, 0, 1) * 0.18) : 1;

      for (const cloud of state.cloudFlow) {
        if (!force) cloud.x += cloud.dir * cloud.speed * flightBoost * dt;

        const outLeft = cloud.x < -cloud.margin - 0.40;
        const outRight = cloud.x > 1 + cloud.margin + 0.40;
        if (outLeft || outRight) resetOneFlowCloud(cloud, false);

        const nextLeft = cloud.x * 100;
        const nextTop = cloud.y * 100;
        const nextScale = cloud.scale * passScale;

        if (force || !Number.isFinite(cloud._left) || Math.abs(nextLeft - cloud._left) >= 0.075) {
          cloud._left = nextLeft;
          cloud.el.style.left = `${nextLeft.toFixed(3)}%`;
        }
        if (force || !Number.isFinite(cloud._top) || Math.abs(nextTop - cloud._top) >= 0.02) {
          cloud._top = nextTop;
          cloud.el.style.top = `${nextTop.toFixed(3)}%`;
        }
        if (force || !Number.isFinite(cloud._scale) || Math.abs(nextScale - cloud._scale) >= 0.0025) {
          cloud._scale = nextScale;
          cloud.el.style.transform = `translate(-50%, -50%) scale(${nextScale.toFixed(3)})`;
        }
      }
    }

    function randomizeCloudLayout(force = false) {
      if (!spaceCloudsEl) return;
      const roundKey = Number(state.roundId);
      const safeRoundKey = Number.isFinite(roundKey) ? roundKey : -1;
      if (!force && state.cloudLayoutRoundId === safeRoundKey) return;
      state.cloudLayoutRoundId = safeRoundKey;

      ensureFlowClouds(true);
      const lanes = makeCloudLanes();
      let idx = 0;

      for (const lane of lanes) {
        const count = Math.max(1, Number(lane.count) || 1);
        const phase = Math.random();
        for (let i = 0; i < count && idx < state.cloudFlow.length; i++) {
          placeFlowCloud(state.cloudFlow[idx], lane, i, count, true, phase);
          idx += 1;
        }
      }

      const fallbackLane = lanes[1] || lanes[0];
      while (idx < state.cloudFlow.length) {
        placeFlowCloud(state.cloudFlow[idx], fallbackLane, idx, state.cloudFlow.length, true, Math.random());
        idx += 1;
      }

      state.cloudFlowLastAt = performance.now();
      updateCloudFlow(state.cloudFlowLastAt, true);
    }

    function startBettingRocketReturn(force = false) {
      if (state.theme !== "space") return;
      const roundKey = Number(state.roundId);
      const safeRoundKey = Number.isFinite(roundKey) ? roundKey : -1;
      if (!force && state.rocketReturnRoundId === safeRoundKey) return;

      state.rocketReturnRoundId = safeRoundKey;
      state.rocketReturnActive = true;
      state.rocketReturnStartAt = performance.now();
      state.rocketReturnFromY = clamp(Number(state.rocketY) || 0.52, 0.34, 0.86);
      state.rocketReturnFromAngle = Number.isFinite(Number(state.rocketAngleDeg)) ? Number(state.rocketAngleDeg) : -12;
      state.rocketReturnFromMix = clamp(Number(state.spaceMix) || 0, 0, 1);
      state.rocketReturnFromStars = clamp(Number(state.spaceStars) || 0, 0, 1);
      state.rocketHidden = true;
      rocketEl?.classList.add("is-hidden");

      if (boomEl) {
        state.boomActive = false;
        boomEl.classList.remove("is-on");
        boomEl.style.opacity = "0";
      }
    }

    function resetSpaceRoundVisuals() {
      state.rocketHidden = true;
      state.rocketReturnActive = false;
      state.rocketReturnRoundId = -1;
      state.boomActive = false;
      state.boomAt = 0;
      state.spaceMix = 0;
      state.spaceStars = 0;
      state.lastSpaceVarsAt = 0;
      state.lastSpaceStage = 0;
      state.spaceVarCache = Object.create(null);
      if (rocketEl) rocketEl.classList.add("is-hidden");
      if (boomEl) {
        boomEl.classList.remove("is-on");
        boomEl.style.opacity = "0";
      }
      if (canvasWrapEl) {
        canvasWrapEl.style.setProperty("--space-mix", "0");
        canvasWrapEl.style.setProperty("--space-stars", "0");
        canvasWrapEl.style.setProperty("--space-grass", "1");
        canvasWrapEl.style.setProperty("--space-grass-shift", "0%");
        canvasWrapEl.style.setProperty("--space-cloud", "0.88");
        canvasWrapEl.style.setProperty("--space-cloud-shift", "0%");
        canvasWrapEl.style.setProperty("--space-cloud-scale", "1");
      }
    }

    function triggerRocketExplosion() {
      if (state.theme !== "space") return;
      if (!rocketEl || !boomEl) return;
      if (state.boomRoundId === state.roundId) return;

      state.boomRoundId = state.roundId;
      state.boomAt = performance.now();
      state.boomActive = true;
      state.rocketHidden = true;

      rocketEl.classList.add("is-hidden");
      boomEl.classList.add("is-on");
      boomEl.style.left = `${(state.rocketX * 100).toFixed(2)}%`;
      boomEl.style.top = `${(state.rocketY * 100).toFixed(2)}%`;
      boomEl.style.opacity = "1";
      boomEl.style.transform = "translate(-50%, -50%) scale(0.72)";
    }

    function setSpaceThemeVariables(mult) {
      const m = Math.max(1, Number(mult) || 1);
      let mixTarget = clamp(Number(state.spaceMix) || 0, 0, 1);
      let starsTarget = clamp(Number(state.spaceStars) || 0, 0, 1);
      const ease = (t) => {
        const x = clamp(t, 0, 1);
        return x * x * (3 - 2 * x);
      };

      const inRun = isRunPhase(state.phase);
      const inBetting = state.phase === "betting" || state.phase === "waiting";
      const inCrashHold = state.phase === "crash" || state.phase === "wait";
      const phaseStart = Number(state.phaseStart) || 0;
      const runProgress = (inRun && phaseStart > 0)
        ? clamp((Date.now() - phaseStart) / 4200, 0, 1)
        : 0;
      const runEase = ease(runProgress);
      const returnProgressRaw = (inBetting && state.rocketReturnActive)
        ? clamp((performance.now() - state.rocketReturnStartAt) / Math.max(1200, state.rocketReturnDurationMs), 0, 1)
        : 0;
      const returnProgress = returnProgressRaw * returnProgressRaw * (3 - 2 * returnProgressRaw);

      if (inRun) {
        if (m < 1.6) {
          mixTarget = 0;
        } else if (m < 2.5) {
          mixTarget = 0.06 + ease((m - 1.6) / 0.9) * 0.12;
        } else if (m < 5) {
          mixTarget = 0.18 + ease((m - 2.5) / 2.5) * 0.28;
        } else if (m < 10) {
          mixTarget = 0.46 + ease((m - 5) / 5) * 0.38;
        } else {
          mixTarget = 0.84 + ease((Math.min(m, 20) - 10) / 10) * 0.16;
        }

        if (m < 1.9) {
          starsTarget = 0;
        } else if (m < 5) {
          starsTarget = 0.02 + ease((m - 1.9) / 3.1) * 0.28;
        } else if (m < 10) {
          starsTarget = 0.30 + ease((m - 5) / 5) * 0.45;
        } else {
          starsTarget = 0.75 + ease((Math.min(m, 20) - 10) / 10) * 0.20;
        }

        // Time keeps the ascent moving toward deep space even on low crash points.
        mixTarget = Math.max(mixTarget, runEase * 0.98);
        starsTarget = Math.max(starsTarget, clamp((runEase - 0.18) / 0.82, 0, 0.68));

        // Stars appear only after we are past clouds and the sky is already dark.
        const cloudOpacityTarget = clamp(0.88 - mixTarget * 1.12, 0, 0.88);
        const cloudExitGate = ease((0.08 - cloudOpacityTarget) / 0.08);
        const darkSkyGate = ease((mixTarget - 0.74) / 0.22);
        const deepSpaceGate = Math.min(cloudExitGate, darkSkyGate);
        starsTarget *= deepSpaceGate;
      } else if (inBetting) {
        if (state.rocketReturnActive) {
          mixTarget = state.rocketReturnFromMix * (1 - returnProgress);
          starsTarget = state.rocketReturnFromStars * (1 - returnProgress);
        } else {
          mixTarget = 0;
          starsTarget = 0;
        }
      } else if (!inCrashHold) {
        mixTarget = 0;
        starsTarget = 0;
      }

      state.spaceMix += (mixTarget - state.spaceMix) * (inRun ? 0.014 : (inBetting ? 0.020 : 0.05));
      state.spaceStars += (starsTarget - state.spaceStars) * (inRun ? 0.016 : (inBetting ? 0.022 : 0.06));
      const mix = clamp(state.spaceMix, 0, 1);
      const stars = clamp(state.spaceStars, 0, 1);
      const grassFadeT = Math.max(inRun ? runEase * 0.95 : 0, mix * 0.68);
      const grass = clamp(1 - grassFadeT * 1.95, 0, 1);
      const grassShift = clamp((inRun ? runEase * 240 : 0) + mix * 130, 0, 430);
      const clouds = clamp(0.88 - mix * 1.12, 0, 0.88);
      const cloudShift = clamp((inRun ? runEase * 78 : mix * 44), 0, 96);
      const cloudScale = 1 + (inRun ? runEase : mix) * 0.14;

      const varsNow = performance.now();
      const shouldPushVars = !state.lastSpaceVarsAt || (varsNow - state.lastSpaceVarsAt) >= spacePerf.cssVarsTickMs;
      const varCache = state.spaceVarCache || (state.spaceVarCache = Object.create(null));

      if (canvasWrapEl && shouldPushVars) {
        const setVar = (name, value, threshold = 0.001) => {
          const prev = Number(varCache[name]);
          if (Number.isFinite(prev) && Math.abs(value - prev) < threshold) return;
          varCache[name] = value;
          if (name.includes("shift")) {
            canvasWrapEl.style.setProperty(name, `${value.toFixed(2)}%`);
          } else {
            canvasWrapEl.style.setProperty(name, value.toFixed(3));
          }
        };

        setVar("--space-mix", mix, 0.0015);
        setVar("--space-stars", stars, 0.0015);
        setVar("--space-grass", grass, 0.0015);
        setVar("--space-grass-shift", grassShift, 0.2);
        setVar("--space-cloud", clouds, 0.0015);
        setVar("--space-cloud-shift", cloudShift, 0.2);
        setVar("--space-cloud-scale", cloudScale, 0.0015);
        state.lastSpaceVarsAt = varsNow;
      }

      if (shouldPushVars) {
        try {
          const prevProgress = Number(varCache["--crash-space-progress"]);
          if (!Number.isFinite(prevProgress) || Math.abs(mix - prevProgress) >= 0.002) {
            varCache["--crash-space-progress"] = mix;
            document.documentElement.style.setProperty("--crash-space-progress", mix.toFixed(3));
          }
        } catch (_) {}
      }

      if (cardEl) {
        const stage = getSpaceStage(m);
        if (stage !== state.lastSpaceStage) {
          state.lastSpaceStage = stage;
          cardEl.setAttribute("data-space-stage", String(stage));
        }
      }
      if (inBetting && state.rocketReturnActive && returnProgressRaw >= 1) {
        state.rocketReturnActive = false;
      }
    }

    function renderSpaceStars(now, mult) {
      if (!spaceCtx || !spaceCanvas || state.theme !== "space") return;
      const intensity = clamp(Number(state.spaceStars) || 0, 0, 1);
      if (intensity <= 0.02) {
        if ((state.lastSpaceStarsAlpha || 0) > 0.02) {
          spaceCtx.clearRect(0, 0, spaceCanvas.width, spaceCanvas.height);
        }
        state.lastSpaceStarsAlpha = 0;
        state.lastSpaceStarsAt = now;
        return;
      }

      const elapsed = now - (Number(state.lastSpaceStarsAt) || 0);
      const alphaDelta = Math.abs(intensity - (Number(state.lastSpaceStarsAlpha) || 0));
      if (state.lastSpaceStarsAt && elapsed < spacePerf.starsTickMs && alphaDelta < 0.08) {
        return;
      }
      state.lastSpaceStarsAt = now;
      state.lastSpaceStarsAlpha = intensity;
      spaceCtx.clearRect(0, 0, spaceCanvas.width, spaceCanvas.height);

      const w = spaceCanvas.width;
      const h = spaceCanvas.height;
      const liteMode = isLiteRuntime() || !!spacePerf.forceLiteStars;
      const maxCount = Math.min(liteMode ? spacePerf.maxStarsLite : spacePerf.maxStarsFull, state.stars.length);
      const count = Math.max(4, Math.round(6 + maxCount * Math.pow(intensity, 1.05)));
      const t = now * 0.001;
      const inRun = isRunPhase(state.phase);
      const phaseStart = Number(state.phaseStart) || 0;
      const runProgress = (inRun && phaseStart > 0)
        ? clamp((Date.now() - phaseStart) / 5600, 0, 1)
        : 0;
      const runEase = runProgress * runProgress * (3 - 2 * runProgress);
      const runRamp = Math.pow(runEase, 1.45);
      const multBoost = clamp((Math.max(1, Number(mult) || 1) - 1) / 9, 0, 1);
      const speedMin = 0.014 + intensity * 0.022;
      const speedMax = 0.098 + intensity * 0.27 + multBoost * 0.14;
      const speed = speedMin + (speedMax - speedMin) * (inRun ? runRamp : 0.16);
      const tailBoost = inRun ? (0.36 + runRamp * 0.64) : 0.30;

      for (let i = 0; i < count; i++) {
        const s = state.stars[i];
        if (!s) continue;

        const d = 0.36 + s.drift * 0.9;
        const vx = -(0.12 + speed * 0.75) * d;
        const vy = (0.24 + speed * 1.35) * d;

        const nx = ((s.x + t * vx) % 1 + 1) % 1;
        const ny = ((s.y + t * vy) % 1 + 1) % 1;
        const x = nx * w;
        const y = ny * h;

        const tw = 0.45 + 0.55 * Math.sin(now * 0.0012 * s.twinkle + s.phase);
        const alpha = clamp((0.18 + tw * 0.82) * Math.pow(intensity, 1.25), 0, 1);
        const tailLen = (6 + intensity * 22 + multBoost * 8) * (0.55 + s.drift * 0.8) * tailBoost;
        const n = Math.hypot(vx, vy) || 1;
        const tx = vx / n;
        const ty = vy / n;
        const x2 = x - tx * tailLen;
        const y2 = y - ty * tailLen;

        if (liteMode) {
          spaceCtx.strokeStyle = `rgba(214,234,255,${(alpha * 0.68).toFixed(3)})`;
        } else {
          const grad = spaceCtx.createLinearGradient(x, y, x2, y2);
          grad.addColorStop(0, `rgba(255,255,255,${(alpha * 0.90).toFixed(3)})`);
          grad.addColorStop(0.32, `rgba(188,222,255,${(alpha * 0.58).toFixed(3)})`);
          grad.addColorStop(1, "rgba(140,190,255,0)");
          spaceCtx.strokeStyle = grad;
        }
        spaceCtx.lineWidth = 0.8 + intensity * 1.3;
        spaceCtx.beginPath();
        spaceCtx.moveTo(x, y);
        spaceCtx.lineTo(x2, y2);
        spaceCtx.stroke();

        spaceCtx.fillStyle = `rgba(255,255,255,${(alpha * 0.95).toFixed(3)})`;
        spaceCtx.beginPath();
        spaceCtx.arc(x, y, 0.9 + intensity * 1.1, 0, Math.PI * 2);
        spaceCtx.fill();
      }
    }

    function updateRocket(now) {
      if (!rocketEl || state.theme !== "space") return;
      const x = 0.50;
      const inBetting = state.phase === "betting" || state.phase === "waiting";
      if (inBetting && state.rocketReturnActive) {
        const tRaw = clamp((now - state.rocketReturnStartAt) / Math.max(1200, state.rocketReturnDurationMs), 0, 1);
        const t = tRaw * tRaw * (3 - 2 * tRaw);
        const fromY = clamp(Number(state.rocketReturnFromY) || 0.52, 0.34, 0.86);
        const fromAngle = Number.isFinite(Number(state.rocketReturnFromAngle)) ? Number(state.rocketReturnFromAngle) : -12;
        const y = fromY + (0.72 - fromY) * t;
        const angle = fromAngle + (-28 - fromAngle) * t;

        state.rocketAngleDeg = angle;
        state.rocketX = x;
        state.rocketY = y;

        rocketEl.style.left = `${(x * 100).toFixed(2)}%`;
        rocketEl.style.top = `${(y * 100).toFixed(2)}%`;
        rocketEl.style.transform = `translate(-50%, -50%) rotate(${angle.toFixed(2)}deg)`;
        if (tRaw >= 1) state.rocketReturnActive = false;
        return;
      }

      const mix = clamp(Number(state.spaceMix) || 0, 0, 1);
      const enterT = (() => {
        const t = clamp((mix - 0.46) / 0.30, 0, 1);
        return t * t * (3 - 2 * t);
      })();
      const y = 0.72 - enterT * 0.20; // move toward center when entering deep space
      const angle = -28 + enterT * 16; // slight right turn on space-entry

      state.rocketAngleDeg = angle;
      state.rocketX = x;
      state.rocketY = y;

      rocketEl.style.left = `${(x * 100).toFixed(2)}%`;
      rocketEl.style.top = `${(y * 100).toFixed(2)}%`;
      rocketEl.style.transform = `translate(-50%, -50%) rotate(${angle.toFixed(2)}deg)`;
    }

    function updateExplosion(now) {
      if (!boomEl) return;
      if (!state.boomActive) {
        boomEl.classList.remove("is-on");
        return;
      }
      const elapsed = now - state.boomAt;
      const duration = 980;
      const t = clamp(elapsed / duration, 0, 1);
      const alpha = 1 - t;
      const scale = 0.72 + t * 0.72;
      boomEl.style.opacity = alpha.toFixed(3);
      boomEl.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      if (t >= 1) {
        state.boomActive = false;
        boomEl.classList.remove("is-on");
      }
    }

    function updateSpaceScene(now) {
      if (state.theme !== "space") {
        clearSpaceCanvas();
        if (rocketEl) rocketEl.classList.add("is-hidden");
        return;
      }

      const mult = getVisualMultiplier();
      setSpaceThemeVariables(mult);

      const runNow = isRunPhase(state.phase);

      if (runNow && !state.rocketHidden) {
        rocketEl?.classList.remove("is-hidden");
        updateRocket(now);
      } else if (!state.boomActive) {
        rocketEl?.classList.add("is-hidden");
      }

      updateCloudFlow(now);
      renderSpaceStars(now, mult);
      updateExplosion(now);
    }

    function setTheme(nextTheme, persist = true) {
      const theme = nextTheme === "space" ? "space" : "crypto";
      state.theme = theme;
      if (cardEl) cardEl.setAttribute("data-theme", theme);
      try {
        document.body.classList.toggle("crash-space-ui", theme === "space");
      } catch (_) {}
      if (spaceLayerEl) {
        spaceLayerEl.classList.toggle("is-active", theme === "space");
      }
      if (topThemeSwitchEl) {
        topThemeSwitchEl.setAttribute("data-active-theme", theme);
        topThemeSwitchEl.querySelectorAll(".crash-topThemeBtn").forEach((btn) => {
          btn.classList.toggle("is-active", btn.dataset.theme === theme);
        });
      }
      if (persist) {
        try { localStorage.setItem("crashTheme", theme); } catch (_) {}
      }
      if (theme !== "space") {
        try { document.documentElement.style.setProperty("--crash-space-progress", "0"); } catch (_) {}
        resetSpaceRoundVisuals();
        clearSpaceCanvas();
        state.lastSpaceStarsAlpha = 0;
        state.lastSpaceStarsAt = 0;
      } else {
        randomizeCloudLayout();
        resetSpaceRoundVisuals();
        applyRandomRocketSprite();
        if (isRunPhase(state.phase)) {
          state.rocketHidden = false;
          rocketEl?.classList.remove("is-hidden");
        }
      }
      setSpaceThemeVariables(getVisualMultiplier());
      resize();
    }

    state.stars = makeStarPool(spacePerf.starPoolSize);
    const savedTheme = (() => {
      try { return localStorage.getItem("crashTheme"); } catch (_) { return null; }
    })();
    setTheme(savedTheme === "crypto" ? "crypto" : "space", false);

    topThemeSwitchEl?.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const btn = target?.closest?.(".crash-topThemeBtn");
      if (!btn) return;
      setTheme(btn.dataset.theme || "crypto");
      if (btn.dataset.theme === "space") {
        setStatus("Space theme enabled");
      } else {
        setStatus("Crypto theme enabled");
      }
    });
    

    // WebSocket connection
    let ws = null;
    let reconnectTimeout = null;

    // Localhost test mode simulator
let testModeInterval = null;

function startTestMode() {
  console.log('[Crash] Test mode enabled on localhost');
  setStatus("Test mode - Ready");
  
  // Simulate initial game state
  state.phase = 'betting';
  state.phaseStart = Date.now();
  state.roundId = 1;
  state.bettingTimeMs = 10000;
  state.bettingLeftMs = 10000;
  state.bettingLeftAt = Date.now();
  state.crashPoint = 2.0;
  state.serverMult = 1.0;
  state.players = [];
  state.history = [2.34, 1.56, 3.78, 1.23, 5.67];
  randomizeCloudLayout(true);
  applyRandomRocketSprite(true);
  
  renderHistory();
  updateUIForPhase();
  
  // Start test game loop
  runTestGameLoop();
}

function runTestGameLoop() {
  if (testModeInterval) clearInterval(testModeInterval);
  
  testModeInterval = setInterval(() => {
    if (state.phase === 'betting') {
      const elapsed = Date.now() - state.phaseStart;
      const remaining = state.bettingTimeMs - elapsed;
      
      if (remaining <= 0) {
        // Start run phase
        state.phase = 'run';
        updateUIForPhase();
        renderPlayers(); // чтобы сразу обновился список

        state.phaseStart = Date.now();
        state.serverMult = 1.0;
        state.displayMult = 1.0;
        state.candles = [];
        state.lastCandleAt = 0;
        
        // Generate random crash point (1.01 to 10.0)
        state.crashPoint = Math.max(1.01, 1 + Math.random() * Math.random() * 9);
        
        console.log(`[Test] Round ${state.roundId} started, crash point: ${state.crashPoint.toFixed(2)}x`);
        updateUIForPhase();
        
        // Simulate multiplier growth
        simulateMultiplierGrowth();
      } else {
        state.bettingLeftMs = remaining;
        state.bettingLeftAt = Date.now();
      }
    }
  }, 100);
}

function simulateMultiplierGrowth() {
  const startTime = Date.now();
  const growthInterval = setInterval(() => {
    if (state.phase !== 'run') {
      clearInterval(growthInterval);
      return;
    }
    
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    // Exponential growth: mult = e^(0.5 * t)
    const calculatedMult = Math.exp(0.1 * elapsed);
    state.serverMult = Math.min(calculatedMult, state.crashPoint);
    
    // Check if crashed
    if (state.serverMult >= state.crashPoint) {
      clearInterval(growthInterval);
      handleTestCrash();
    }
  }, 50);
}

function handleTestCrash() {
  console.log(`[Test] Crashed at ${state.crashPoint.toFixed(2)}x`);
  
  state.phase = 'crash';
  state.serverMult = state.crashPoint;
  state.displayMult = state.crashPoint;
  
  // Mark unclaimed bets as lost
  state.players.forEach(p => {
    if (!p.claimed) {
      console.log(`[Test] ${p.name} lost`);
    }
  });
  
  updateUIForPhase();
  
  // Wait phase
  setTimeout(() => {
    state.phase = 'wait';
    updateUIForPhase();
    
    // Add to history
    state.history.unshift(state.crashPoint);
    state.history = state.history.slice(0, 15);
    renderHistory();
    
    // Start new round after 3 seconds
    setTimeout(() => {
      state.roundId++;
      randomizeCloudLayout(true);
      applyRandomRocketSprite(true);
      state.phase = 'betting';
      state.phaseStart = Date.now();
      state.bettingLeftMs = state.bettingTimeMs;
      state.bettingLeftAt = Date.now();
      state.players = [];
      state.myBet = null;
      state.candles = [];
      state.displayMult = 1.0;
      state.serverMult = 1.0;
      
      renderPlayers();
      updateUIForPhase();
    }, 3000);
  }, 2000);
}

    function connectWebSocket() {
        if (IS_LOCALHOST) {
          startTestMode();
          return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/crash`;
        
        setStatus("Connecting…");
        
        ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Crash WS] Connected');
        setStatus("Connected");
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (e) {
          console.error('[Crash WS] Parse error:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('[Crash WS] Error:', err);
        setStatus("Connection error");
      };

      ws.onclose = () => {
        console.log('[Crash WS] Disconnected');
        setStatus("Disconnected");
        ws = null;
        
        // Reconnect after 3 seconds
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            console.log('[Crash WS] Reconnecting...');
            connectWebSocket();
          }, 3000);
        }
      };
    }

    function sendWS(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }

    function handleServerMessage(msg) {
      switch (msg.type) {
        case 'gameState': {
          const prevRoundId = state.roundId;
          const prevPhase = state.phase;

          // Update state from server
          state.phase = msg.phase;
          state.phaseStart = (typeof msg.phaseStart === 'number' && Number.isFinite(msg.phaseStart))
            ? msg.phaseStart
            : (Number(msg.phaseStart) || 0);

          if (typeof msg.bettingTimeMs === 'number' && Number.isFinite(msg.bettingTimeMs)) {
            state.bettingTimeMs = msg.bettingTimeMs;
          }

          if (typeof msg.bettingLeftMs === 'number' && Number.isFinite(msg.bettingLeftMs)) {
            state.bettingLeftMs = msg.bettingLeftMs;
            state.bettingLeftAt = Date.now();
          }
          state.roundId = msg.roundId;
          state.gameCounter = Number.isFinite(Number(msg.gameCounter)) && Number(msg.gameCounter) > 0
            ? Math.trunc(Number(msg.gameCounter))
            : Math.max(0, Math.trunc(Number(msg.roundId) || 0));
          state.roundHash = typeof msg.roundHash === "string" ? String(msg.roundHash).trim() : "";
          state.crashPoint = msg.crashPoint;
          state.serverMult = (typeof msg.currentMult === 'number' && Number.isFinite(msg.currentMult)) ? msg.currentMult : 1.0;
          state.players = msg.players || [];
          state.history = msg.history || [];
          const isRoundChanged = state.roundId !== prevRoundId;
          const isPhaseChanged = state.phase !== prevPhase;

          // New round -> reset visuals so graph/multiplier doesn't "jump"
          if (isRoundChanged) {
            state.candles = [];
            state.displayMult = 1.0;
            state.lastCandleAt = 0;
            state.lastTimerSeconds = null;
            state.boomRoundId = -1;
            randomizeCloudLayout(true);
            applyRandomRocketSprite(true);
            if (state.theme === "space") {
              state.rocketHidden = true;
              if (rocketEl) rocketEl.classList.add("is-hidden");
              if (state.phase === "betting" || state.phase === "waiting") startBettingRocketReturn(true);
              else {
                state.rocketReturnActive = false;
                state.boomActive = false;
                if (boomEl) {
                  boomEl.classList.remove("is-on");
                  boomEl.style.opacity = "0";
                }
              }
            } else if (state.theme !== "space") {
              resetSpaceRoundVisuals();
            }
          }

          // Phase transition hygiene
          if (state.phase === 'betting' && prevPhase !== 'betting') {
            state.displayMult = 1.0;
            state.serverMult = 1.0;
          }

          // Sync UI: avoid re-rendering heavy blocks when snapshot data is unchanged.
          renderPlayersPanelMeta(isRoundChanged);
          renderPlayers(isRoundChanged || isPhaseChanged);
          renderHistory(isRoundChanged);
          updateUIForPhase();
          break;
        }

        case 'betPlaced':
          if (msg.userId === getUserId()) {
            setStatus("Bet placed!");
            updateUIForPhase();
          }
          break;

        case 'claimed':
          if (msg.userId === getUserId()) {
            setStatus(`Claimed ${formatX(msg.mult)}!`);
            try {
              const mult = (typeof msg.mult === 'number' && Number.isFinite(msg.mult)) ? msg.mult : Number(msg.mult);
              const m = Number.isFinite(mult) ? mult : 1.0;
              const toastAmount = (state.myBet && typeof state.myBet.amount === "number" && Number.isFinite(state.myBet.amount))
                ? Number(state.myBet.amount) * m
                : NaN;
              const toastCurrency = state.myBet?.currency === "stars" ? "stars" : "ton";
              showToast("Successfully Claimed!", {
                ttl: 2400,
                amount: toastAmount,
                currency: Number.isFinite(toastAmount) ? toastCurrency : ""
              });
            } catch (_) {}
            if (state.myBet) {
              state.myBet.claimed = true;
              state.myBet.claimMult = msg.mult;
            }
            refreshTopBalance();
            updateUIForPhase();
          }
          break;

        case 'error':
          {
            const normalizedError = normalizeActionMessage(msg?.message, "Action failed");
            setStatus(normalizedError);
            showAppNotice(normalizedError, {
              variant: detectNoticeVariant(normalizedError),
              key: `ws-error:${normalizedError}`
            });
          }
          state.actionLock = false;
          updateUIForPhase();
          break;

        case 'pong':
          // Heartbeat response
          break;
        
          case 'tick': {
            // если сервер прислал phase в tick — синкаем
            if (msg.phase && msg.phase !== state.phase) {
              state.phase = msg.phase;
              // когда фаза поменялась — надо перерисовать список, иначе останется Waiting
              renderPlayers();
              updateUIForPhase();
            }
          
            if (msg.roundId === state.roundId && isRunPhase(state.phase)) {
              if (typeof msg.currentMult === 'number' && Number.isFinite(msg.currentMult)) {
                state.serverMult = Math.max(state.serverMult, msg.currentMult);
              }
            }
            break;
          }
          
      }
    }

    function updateUIForPhase(force = false) {
      const myPlayer = state.players.find(p => p.userId === getUserId());
      state.myBet = myPlayer;

      const myAmount = Number(myPlayer?.amount);
      const myClaimMult = Number(myPlayer?.claimMult);
      const myPlayerKey = myPlayer
        ? [
            String(myPlayer.userId ?? ""),
            myPlayer.claimed ? "1" : "0",
            Number.isFinite(myAmount) ? myAmount.toFixed(4) : "0.0000",
            Number.isFinite(myClaimMult) ? myClaimMult.toFixed(4) : "0.0000"
          ].join(":")
        : "none";
      const nextUiPhaseKey = `${state.roundId}|${state.phase}|${state.actionLock ? 1 : 0}|${myPlayerKey}`;
      if (!force && nextUiPhaseKey === lastUiPhaseKey) return;
      lastUiPhaseKey = nextUiPhaseKey;

      switch (state.phase) {
        case 'waiting':
          setTimer("WAITING", true);
          if (timerEl) timerEl.classList.remove('is-urgent');
          if (multEl) multEl.style.display = 'none';

          setStatus("Waiting for first bet");
          setBuyMode("buy");

          const cardWaiting = document.querySelector('.crash-card');
          if (cardWaiting) cardWaiting.classList.remove('is-crashed');
          if (state.theme === "space") {
            state.rocketHidden = true;
            if (rocketEl) rocketEl.classList.add("is-hidden");
            startBettingRocketReturn();
          } else {
            resetSpaceRoundVisuals();
          }
          break;

        case 'betting':
          const seconds = getBettingSeconds() ?? 0;
          setTimer(seconds, true);
          
          if (timerEl) {
            timerEl.classList.toggle('is-urgent', seconds <= 3);
          }
          
          if (multEl) multEl.style.display = 'none';
          
          if (myPlayer) {
            setStatus("Bet placed");
            setBuyMode("buy");
          } else {
            setStatus("Place your bet");
            setBuyMode("buy");
          }
          
          const card = document.querySelector('.crash-card');
          if (card) card.classList.remove('is-crashed');
          if (state.theme === "space") {
            state.rocketHidden = true;
            if (rocketEl) rocketEl.classList.add("is-hidden");
            startBettingRocketReturn();
          } else {
            resetSpaceRoundVisuals();
          }
          break;

          case 'run':
            case 'running':
            case 'inGame':
              setTimer(0, false);
              if (multEl) multEl.style.display = 'block';
              if (state.theme === "space") {
                state.rocketReturnActive = false;
                state.rocketHidden = false;
                rocketEl?.classList.remove("is-hidden");
              }
            
              if (myPlayer && !myPlayer.claimed) {
                setStatus("Running…");
                setBuyMode(state.actionLock ? "locked" : "claim");
              } else if (myPlayer && myPlayer.claimed) {
                setStatus(`Claimed ${formatX(myPlayer.claimMult)}`);
                setBuyMode("claimed");
              } else {
                setStatus("Running…");
                setBuyMode("buy");
              }
              break;
            

        case 'crash':
          applyPlayersLossStyles();
          setMult(state.crashPoint, "red");
          
          const cardCrash = document.querySelector('.crash-card');
          if (cardCrash) cardCrash.classList.add('is-crashed');
          triggerRocketExplosion();
          
          if (myPlayer && !myPlayer.claimed) {
            setStatus("CRASH! Lost");
            setBuyMode("lost");
          } else if (myPlayer && myPlayer.claimed) {
            setStatus(`CRASH! Won ${formatX(myPlayer.claimMult)}`);
            setBuyMode("claimed");
          } else {
            setStatus("CRASH!");
            setBuyMode("buy");
          }
          break;

        case 'wait': {
          applyPlayersLossStyles();
          setTimer(0, false);
          if (multEl) multEl.style.display = 'block';

          const finalMult = (typeof state.crashPoint === 'number' && Number.isFinite(state.crashPoint))
            ? state.crashPoint
            : state.displayMult;

          setMult(finalMult, "red");

          const cardWait = document.querySelector('.crash-card');
          if (cardWait) cardWait.classList.add('is-crashed');
          triggerRocketExplosion();

          if (myPlayer && !myPlayer.claimed) {
            setStatus("CRASH! Lost");
            setBuyMode("lost");
          } else if (myPlayer && myPlayer.claimed) {
            setStatus(`CRASH! Won ${formatX(myPlayer.claimMult)}`);
            setBuyMode("claimed");
          } else {
            setStatus("Next round soon…");
            setBuyMode("buy");
          }
          break;
        }
      }
    }
    function applyPlayersLossStyles() {
      if (!playersEl) return;
      if (state.phase !== 'crash' && state.phase !== 'wait') return;
    
      const userId = getUserId();
    
      for (const p of (state.players || [])) {
        // проигрыш = участвовал и НЕ claimed
        const lost = !!p && (p.userId !== undefined) && (p.amount > 0) && !p.claimed;
    
        const row = playersEl.querySelector(`.crash-trader[data-userid="${String(p.userId)}"]`);
        if (!row) continue;
    
        row.classList.toggle('is-lost', lost);
        row.classList.toggle('is-won', !!p.claimed); // опционально, если нужно
    
        // если в DOM осталось is-green — убираем, чтобы не было зелёного
        const top = row.querySelector('.crash-amount__top');
        if (top) {
          if (lost) {
            top.classList.remove('is-green');
            top.classList.add('is-red');
          }
        }
      }
    }
    

    function setStatus(text) {
      if (!statusEl) return;
      const nextText = String(text ?? "");
      if (nextText === lastStatusText) return;
      lastStatusText = nextText;
      statusEl.textContent = nextText;
    }

function showToast(text, opts = {}) {
  const host = document.getElementById(TOAST_HOST_ID);
  if (!host) return;

  const el = document.createElement("div");
  el.className = "crash-toast";

  const textEl = document.createElement("span");
  textEl.className = "crash-toastText";
  textEl.textContent = String(text || "");
  el.appendChild(textEl);

  const toastCurrencyRaw = String(opts.currency || "").toLowerCase();
  const toastCurrency = toastCurrencyRaw === "stars" ? "stars" : (toastCurrencyRaw === "ton" ? "ton" : "");
  const toastAmount = Number(opts.amount);

  if (toastCurrency && Number.isFinite(toastAmount)) {
    const metaEl = document.createElement("span");
    metaEl.className = "crash-toastMeta";

    const amountEl = document.createElement("span");
    amountEl.className = "crash-toastAmount";
    amountEl.textContent = formatCurrencyAmount(toastAmount, toastCurrency);

    const iconEl = document.createElement("img");
    iconEl.className = "crash-toastCurrency";
    iconEl.src = currencyIcon(toastCurrency);
    iconEl.alt = toastCurrency === "stars" ? "Stars" : "TON";

    metaEl.appendChild(amountEl);
    metaEl.appendChild(iconEl);
    el.appendChild(metaEl);
  }

  host.appendChild(el);

  // start animation next frame
  requestAnimationFrame(() => el.classList.add("is-in"));

  const ttl = Math.max(800, Math.min(6000, Number(opts.ttl ?? 2200)));

  setTimeout(() => {
    el.classList.add("is-out");
    el.classList.remove("is-in");

    const rm = () => el.remove();
    el.addEventListener("transitionend", rm, { once: true });
    // hard fallback
    setTimeout(rm, 700);
  }, ttl);
}


    function setMult(v, mode) {
      if (!multEl) return;
      multEl.textContent = formatX(v);
      multEl.classList.remove("is-green", "is-red");
      multEl.classList.add(mode === "red" ? "is-red" : "is-green");
    }

    function setTimer(seconds, show) {
      if (!timerEl) return;

      const shouldShow = !!show;
      const nextText = shouldShow ? String(seconds ?? "") : "";
      const isNumericTimer = shouldShow && /^\d+$/.test(nextText.trim());

      if (shouldShow && nextText !== lastTimerText) {
        lastTimerText = nextText;
        timerEl.textContent = nextText;
      }

      timerEl.classList.toggle('is-label', shouldShow && !isNumericTimer);

      if (lastTimerVisible !== shouldShow) {
        // Safari/iOS can mis-center absolutely-positioned block elements.
        // Keep countdown as shrink-to-content so left:50% + translateX(-50%) stays exact.
        timerEl.style.display = shouldShow ? 'inline-flex' : 'none';
        if (shouldShow) {
          timerEl.style.left = '50%';
          timerEl.style.transform = 'translate(-50%, -50%)';
        }
        lastTimerVisible = shouldShow;
      }
    }

    function getBettingSeconds() {
      if (state.phase !== 'betting') return null;

      // Prefer server-provided remaining ms (more reliable than phaseStart clocks)
      if (typeof state.bettingLeftMs === 'number' && Number.isFinite(state.bettingLeftMs) && state.bettingLeftAt) {
        const rem = Math.max(0, state.bettingLeftMs - (Date.now() - state.bettingLeftAt));
        return Math.ceil(rem / 1000);
      }

      // Fallback
      const rem = Math.max(0, state.bettingTimeMs - (Date.now() - (state.phaseStart || 0)));
      return Math.ceil(rem / 1000);
    }

    // Lightweight live updates for players during RUN (avoid full rerender)
    let playerDomRefs = new Map();

    function cachePlayerDomRefs() {
      playerDomRefs = new Map();
      if (!playersEl) return;
      playersEl.querySelectorAll('.crash-trader[data-userid]').forEach(row => {
        const uid = row.getAttribute('data-userid');
        const payout = row.querySelector('.js-payout-value');
        const mult = row.querySelector('.js-mult-value');
        playerDomRefs.set(String(uid), { payout, mult });
      });
    }

    function updatePlayerDomLive() {
      if (!isRunPhase(state.phase)) return;

      const mult = Math.max(1.0, state.displayMult || 1.0);

      for (const p of (state.players || [])) {
        if (!p || p.claimed) continue; // do not touch claimed (it stays fixed/green)
        const ref = playerDomRefs.get(String(p.userId));
        if (!ref) continue;

        const decimals = (p.currency === 'stars') ? 0 : 2;
        if (ref.payout) ref.payout.textContent = (Number(p.amount || 0) * mult).toFixed(decimals);
        if (ref.mult) ref.mult.textContent = formatX(mult);
      }
    }

    function getMultColor(mult) {
      if (mult < 1.5) return 'color-1';
      if (mult < 2) return 'color-2';
      if (mult < 5) return 'color-3';
      if (mult < 20) return 'color-4';
      return 'color-5';
    }

    function renderHistory(force = false) {
      const historyEl = document.getElementById('crashHistory');
      if (!historyEl) return;

      const view = (state.history || []).slice(0, 15).map((mult) => {
        const n = Number(mult);
        return Number.isFinite(n) ? n : 0;
      });
      const nextHistoryKey = view.map((mult) => mult.toFixed(2)).join("|");
      if (!force && nextHistoryKey === lastRenderedHistoryKey) return;
      lastRenderedHistoryKey = nextHistoryKey;

      historyEl.innerHTML = view
        .map((mult) => {
          const colorClass = getMultColor(mult);
          return `<div class="crash-history__item ${colorClass}">${formatX(mult)}</div>`;
        })
        .join('');
    }
    function ensureRunPlayersRendered() {
      if (!isRunPhase(state.phase)) return;
      if (!playersEl) return;
    
      // Если хоть где-то ещё висит "Waiting" — значит список от betting/wait, надо пересобрать разметку
      if (playersEl.querySelector('.crash-player__status')) {
        renderPlayers(); // создаст .js-payout-value и .js-mult-value
      }
    }
    
    function renderPlayers(force = false) {
      if (!playersEl) return;

      const userId = getUserId();
      const sortedPlayers = [...state.players].sort((a, b) => {
        if (a.userId === userId) return -1;
        if (b.userId === userId) return 1;
        const byAmount = (b.amount || 0) - (a.amount || 0);
        if (Math.abs(byAmount) > 1e-9) return byAmount;
        return String(a?.userId ?? "").localeCompare(String(b?.userId ?? ""));
      });

      const nextPlayersKey = `${state.phase}|${sortedPlayers.map((player) => {
        const amount = Number(player?.amount);
        const claimMult = Number(player?.claimMult);
        return [
          String(player?.userId ?? ""),
          Number.isFinite(amount) ? amount.toFixed(4) : "0.0000",
          player?.currency === "stars" ? "s" : "t",
          player?.claimed ? "1" : "0",
          Number.isFinite(claimMult) ? claimMult.toFixed(4) : "0.0000",
          String(player?.name ?? player?.username ?? ""),
          String(player?.avatar ?? "")
        ].join(":");
      }).join("|")}`;
      if (!force && nextPlayersKey === lastRenderedPlayersKey) return;
      lastRenderedPlayersKey = nextPlayersKey;

      if (sortedPlayers.length === 0) {
        playersEl.innerHTML = `
          <div style="padding: 20px; text-align: center; color: var(--cr-text-dim); font-size: 13px;">
            No active players yet
          </div>
        `;
        return;
      }

      playersEl.innerHTML = sortedPlayers.map(player => {
        const isCurrentUser = player.userId === userId;
        const icon = player.currency === 'stars' ? ICON_STAR : ICON_TON;

        let statusHTML = '';
        let traderClass = 'crash-trader';

        const pid = String(player.userId);
        const isNew = !state.seenPlayerIds.has(pid);
        if (isNew) traderClass += ' is-enter';


        if (state.phase === 'betting' || state.phase === 'waiting' || state.phase === 'wait') {
          const betAmt = typeof player.amount === 'number' && player.amount > 0
            ? player.amount.toFixed(player.currency === 'stars' ? 0 : 2)
            : null;
          statusHTML = betAmt
            ? `<div class="crash-amount__top"><img class="crash-ico" src="${icon}" alt="" /><span>${betAmt}</span></div>`
            : `<span class="crash-player__status">Waiting</span>`;
        } else if (isRunPhase(state.phase)) {
          if (player.claimed) {
            const payout = (player.amount * player.claimMult).toFixed(player.currency === 'stars' ? 0 : 2);
            statusHTML = `
              <div class="crash-amount__top is-green">
                <img class="crash-ico" src="${icon}" alt="" />
                <span class="js-payout-value">${payout}</span>
              </div>
              <div class="crash-amount__sub"><span class="js-mult-value">${formatX(player.claimMult)}</span></div>
            `;
          } else {
            const currentValue = (player.amount * state.displayMult).toFixed(player.currency === 'stars' ? 0 : 2);
            statusHTML = `
              <div class="crash-amount__top">
                <img class="crash-ico" src="${icon}" alt="" />
                <span class="js-payout-value">${currentValue}</span>
              </div>
              <div class="crash-amount__sub"><span class="js-mult-value">${formatX(state.displayMult)}</span></div>
            `;
          }
        } 
        else if (state.phase === 'crash') {
          if (player.claimed) {
            const payout = (player.amount * player.claimMult).toFixed(player.currency === 'stars' ? 0 : 2);
            statusHTML = `
              <div class="crash-amount__top is-green">
                <img class="crash-ico" src="${icon}" alt="" />
                <span class="js-payout-value">${payout}</span>
              </div>
              <div class="crash-amount__sub"><span class="js-mult-value">${formatX(player.claimMult)}</span></div>
            `;
          } else {
            traderClass += ' is-lost'; // <-- ВАЖНО: подсветка строки проигравшего
            statusHTML = `
              <div class="crash-amount__top is-red">
                <img class="crash-ico" src="${icon}" alt="" />
                0
              </div>
              <div class="crash-amount__sub">Lost</div>
            `;
          }
        }
        

        const avatarHTML = player.avatar
          ? `<img src="${player.avatar}" alt="" />`
          : `<span style="font-size: 16px;">👤</span>`;

        return `
          <div class="${traderClass}" data-userid="${String(player.userId)}">
            <div class="crash-trader__left">
              <div class="crash-ava">${avatarHTML}</div>
              <div>
                <div class="crash-name">${(player.name ?? player.username ?? ('Player ' + player.userId))}${isCurrentUser ? ' (You)' : ''}</div>
                
              </div>
            </div>
            <div class="crash-amount">
              ${statusHTML}
            </div>
          </div>
        `;
      }).join('');
      cachePlayerDomRefs();
      // mark all currently rendered players as "seen"
      for (const p of sortedPlayers) {
        state.seenPlayerIds.add(String(p.userId));
      }

      // cleanup enter class so it won't re-trigger on re-render
      setTimeout(() => {
        playersEl.querySelectorAll('.crash-trader.is-enter')
          .forEach(el => el.classList.remove('is-enter'));
      }, 260);


    }

    function roundToCurrency(val, currency) {
      if (currency === "stars") return Math.max(0, Math.trunc(val));
      return Math.max(0, Math.round(val * 100) / 100);
    }

    function uiBetAmount() {
      const input = document.getElementById("crashBetInput");
      const currency = detectCurrency();
      
      if (!input) return currency === "stars" ? 10 : 0.1;
      
      const text = input.value.trim();
      if (!text) return currency === "stars" ? 10 : 0.1;
      
      const val = parseNumber(text);
      
      // Минимальные значения
      if (currency === "stars") {
        return Math.max(10, Math.floor(val));
      } else {
        return Math.max(0.1, Math.round(val * 100) / 100);
      }
    }

    function renderPills() {
      const currency = detectCurrency();
      const icon = currencyIcon(currency);
      const input = document.getElementById("crashBetInput");
      const maxBtn = amountRow?.querySelector(".crash-maxBtn");
    
      betIconEl && betIconEl.setAttribute("src", icon);
    
      // Обновляем placeholder и минимум
      if (input) {
        if (currency === "stars") {
          input.placeholder = "10";
          input.setAttribute("min", "10");
        } else {
          input.placeholder = "0.1";
          input.setAttribute("min", "0.1");
          input.setAttribute("step", "0.01");
        }
        
        // Обновляем значение если оно меньше минимума
        const currentVal = parseNumber(input.value);
        if (currentVal > 0) {
          if (currency === "stars" && currentVal < 10) {
            input.value = "10";
          } else if (currency === "ton" && currentVal < 0.1) {
            input.value = "0.1";
          }
        }
      }
    
      // Обновляем иконку на кнопке Max
      if (maxBtn) {
        maxBtn.innerHTML = `
          <img class="crash-ico" src="${icon}" alt="" />
          <span class="crash-pill__v">Max</span>
        `;
      }
    
      const amt = uiBetAmount();
      if (betTextEl) {
        const formatted = currency === "stars" ? Math.floor(amt) : amt.toFixed(2);
        betTextEl.textContent = `Bet: ${formatted}`;
      }
    }


    
    function setActivePill(btn) {
      if (!btn) return;
      amountRow?.querySelectorAll(".crash-pill").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const amt = uiBetAmount();
      if (betTextEl) {
        const cur = detectCurrency();
        const formatted = cur === "stars" ? String(Math.floor(amt)) : amt.toFixed(2);
        betTextEl.textContent = `Bet: ${formatted}`;
      }
    }

    const betInput = document.getElementById("crashBetInput");
    if (betInput) {
      betInput.addEventListener("input", () => {
        if (state.myBet && !state.myBet.claimed) {
          setStatus("Bet already placed");
          return;
        }
        const cur = detectCurrency();
        const val = parseNumber(betInput.value);
        if (val <= 0) return;
        const formatted = cur === "stars" ? Math.floor(val).toString() : val.toFixed(2);
        if (betTextEl) betTextEl.textContent = `Bet: ${formatted}`;
      });

      betInput.addEventListener("blur", () => {
        const cur = detectCurrency();
        const val = parseNumber(betInput.value);
        if (val > 0) {
          if (cur === "stars") {
            betInput.value = Math.max(10, Math.floor(val)).toString();
          } else {
            betInput.value = Math.max(0.1, Math.round(val * 100) / 100).toFixed(2);
          }
        } else if (betInput.value.trim() !== "") {
          betInput.value = cur === "stars" ? "10" : "0.1";
        }
        renderPills();
      });
    }

    amountRow?.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button[data-amt='max']");
      if (!btn) return;

      if (state.myBet && !state.myBet.claimed) {
        setStatus("Bet already placed");
        return;
      }

      const top = qs("#tonAmount");
      const cur = detectCurrency();
      const bal = parseNumber(top?.textContent || "0");
      if (betInput) {
        if (cur === "stars") {
          betInput.value = Math.max(10, Math.floor(bal)).toString();
        } else {
          betInput.value = Math.max(0.1, bal).toFixed(2);
        }
      }

      renderPills();
      setActivePill(btn);
    }, { passive: true });

    function setBuyMode(mode) {
      if (!buyBtn) return;

      const bar = document.querySelector('.crash-controls__bar');

      buyBtn.disabled = state.actionLock || mode === "locked" || mode === "lost" || mode === "claimed";
      buyBtn.classList.remove("is-claim", "is-disabled", "is-lost");

      if (mode === "claim") {
        buyBtn.textContent = "Claim";
        buyBtn.classList.add("is-claim");
        if (bar) { bar.classList.remove("is-bet-placed"); bar.classList.add("is-running"); }
        return;
      }

      if (mode === "lost") {
        buyBtn.textContent = "Lost";
        buyBtn.classList.add("is-lost");
        buyBtn.disabled = true;
        if (bar) { bar.classList.remove("is-bet-placed", "is-running"); }
        return;
      }

      if (mode === "claimed") {
        buyBtn.textContent = "Claimed";
        buyBtn.classList.add("is-disabled");
        buyBtn.disabled = true;
        if (bar) { bar.classList.remove("is-bet-placed", "is-running"); }
        return;
      }

      if (mode === "locked") {
        buyBtn.textContent = "…";
        buyBtn.classList.add("is-disabled");
        buyBtn.disabled = true;
        if (bar) { bar.classList.remove("is-bet-placed", "is-running"); }
        return;
      }

      // mode === "buy"
      buyBtn.textContent = "Place Bet";

      // если ставка уже сделана — схлопываем панель
      if (state.myBet && (state.phase === 'betting' || state.phase === 'waiting')) {
        if (bar) { bar.classList.add("is-bet-placed"); bar.classList.remove("is-running"); }
      } else {
        if (bar) { bar.classList.remove("is-bet-placed", "is-running"); }
      }
    }

    async function placeBet() {
      const currency = detectCurrency();
      renderPills();
    
      if (state.phase !== "betting" && state.phase !== "waiting") {
        const msg = "Wait next round";
        setStatus(msg);
        showAppNotice(msg, { variant: "warning", key: "wait-next-round" });
        return;
      }
      if (state.myBet) {
        const msg = "Bet already placed";
        setStatus(msg);
        showAppNotice(msg, { variant: "warning", key: "bet-already-placed" });
        return;
      }
      const amt = uiBetAmount();
      if (!amt || amt <= 0) {
        const msg = "Invalid bet";
        setStatus(msg);
        showAppNotice(msg, { variant: "warning", key: "invalid-bet" });
        return;
      }
    
      state.actionLock = true;
      setBuyMode("locked");
      setStatus("Placing bet…");
    
      try {
        const rounded = roundToCurrency(amt, currency);
    
        if (IS_LOCALHOST) {
          // Test mode - just add player locally
          const newPlayer = {
            userId: getUserId(),
            name: getUserName(),
            username: getUserName(),
            avatar: null,
            amount: rounded,
            currency: currency,
            claimed: false,
            claimMult: 0
          };
          
          state.players.push(newPlayer);
          state.myBet = newPlayer;
          renderPlayers();
          setStatus("Bet placed!");
          setBuyMode("buy");
          state.actionLock = false;
          updateUIForPhase();
          return;
        }
    
        const userId = getUserId();
        const initData = getInitData();
        if (!initData) {
          throw new Error("Telegram auth required");
        }

        const roundId = `crash_${state.roundId}_${userId}`;
    
        // Deduct balance
        await apiDeposit({
          amount: -rounded,
          currency,
          type: "bet",
          roundId,
          depositId: `crash_bet_${getUserId()}_${state.roundId}_${Date.now()}`
        });
    
        // Send bet to server
        sendWS({
          type: 'placeBet',
          userId,
          initData,
          roundId,
          amount: rounded,
          currency,
          userName: getUserName(),
          userAvatar: getUserAvatar()
        });
    
        await refreshTopBalance();
    
      } catch (e) {
        const msg = normalizeActionMessage(e?.message, "Bet failed");
        setStatus(msg);
        showAppNotice(msg, {
          variant: detectNoticeVariant(msg),
          key: `bet-failed:${msg}`
        });
        setBuyMode("buy");
      } finally {
        state.actionLock = false;
      }
    }

    async function claim() {
      if (!state.myBet || state.myBet.claimed) return;
      if (state.phase !== "run") {
        const msg = "Can't claim now";
        setStatus(msg);
        showAppNotice(msg, { variant: "warning", key: "cant-claim-now" });
        return;
      }
    
      state.actionLock = true;
      setBuyMode("locked");
    
      const currency = state.myBet.currency;
      const mult = clamp(state.serverMult, 1, 1000);
      const payoutRaw = state.myBet.amount * mult;
      const payout = roundToCurrency(payoutRaw, currency);
    
      setStatus(`Claiming ${formatX(mult)}…`);
    
      try {
        if (IS_LOCALHOST) {
          // Test mode - just mark as claimed
          state.myBet.claimed = true;
          state.myBet.claimMult = mult;
          
          console.log(`[Test] Claimed at ${formatX(mult)}, payout: ${payout} ${currency}`);
          
          renderPlayers();
          updateUIForPhase();
          
          showToast("Successfully Claimed!", { ttl: 2400, amount: payout, currency });
          
          state.actionLock = false;
          return;
        }
    
        const userId = getUserId();
        const initData = getInitData();
        if (!initData) {
          throw new Error("Telegram auth required");
        }

        // Send claim to server
        sendWS({
          type: 'claim',
          userId,
          initData,
          roundId: `crash_${state.roundId}_${userId}`
        });
    
      } catch (e) {
        const msg = normalizeActionMessage(e?.message, "Claim failed");
        setStatus(msg);
        showAppNotice(msg, {
          variant: detectNoticeVariant(msg),
          key: `claim-failed:${msg}`
        });
        setBuyMode("claim");
      } finally {
        state.actionLock = false;
      }
    }


    buyBtn?.addEventListener("click", () => {
      if (state.actionLock) return;
      if (state.myBet && !state.myBet.claimed) {
        claim();
      } else {
        placeBet();
      }
    });

    plusBtn?.addEventListener("click", () => {
      setStatus("Deposit");
      const opener = document.querySelector("[data-open-deposit]");
      opener?.click?.();
    });

    roundHashCopyBtn?.addEventListener("click", async () => {
      const hash = String(state.roundHash || "").trim();
      if (!hash) return;
      const copied = await copyToClipboard(hash);
      setStatus(copied ? "Hash copied" : "Copy failed");
      showAppNotice(copied ? "Hash copied" : "Copy failed", {
        key: copied ? "crash-hash-copied" : "crash-hash-copy-failed",
        dedupeMs: 600,
        ttl: 1600,
        variant: copied ? "success" : "warning",
        translate: false
      });
    });

    // Render visual candles based on serverMult
    function addCandle() {
      const prevClose = state.candles.length ? state.candles[state.candles.length - 1].close : 1.0;
    
      const target = Math.max(1, state.serverMult); // куда тянется раунд
      const open = prevClose;
    
      // планируем close на эту свечу (чуть шум + иногда маленький откат)
      const drift = (target - open) * (0.75 + Math.random() * 0.18);
      const dip = Math.random() < 0.12;
    
      let closePlan = open + drift + (Math.random() - 0.5) * (0.010 + target * 0.0012);
      if (dip) {
        closePlan = open - (0.008 + Math.random() * 0.020) * (1 + target * 0.02);
      }
    
      closePlan = clamp(closePlan, 0.995, Math.min(target, 1000));
    
      const bodyAbs = Math.max(0.0001, Math.abs(closePlan - open));
    
      // фитили: нормальные, “молотки” редко
      const makeHammer = Math.random() < 0.06;
      const makeInvHammer = Math.random() < 0.05;
    
      let upper = (0.003 + Math.random() * 0.012) + bodyAbs * (0.35 + Math.random() * 0.55);
      let lower = (0.003 + Math.random() * 0.012) + bodyAbs * (0.35 + Math.random() * 0.55);
    
      if (makeHammer) {
        lower = (0.015 + Math.random() * 0.06) + bodyAbs * (1.6 + Math.random() * 1.6);
        upper = (0.002 + Math.random() * 0.006) + bodyAbs * (0.12 + Math.random() * 0.18);
      }
      if (makeInvHammer) {
        upper = (0.015 + Math.random() * 0.06) + bodyAbs * (1.6 + Math.random() * 1.6);
        lower = (0.002 + Math.random() * 0.006) + bodyAbs * (0.12 + Math.random() * 0.18);
      }
    
      const highPlan = Math.max(open, closePlan) + upper;
      const lowPlan  = Math.max(0.90, Math.min(open, closePlan) - lower);
    
      state.candles.push({
        open,
        close: open,   // стартуем с open (для плавного роста)
        high: open,
        low: open,
    
        targetClose: closePlan,
        targetHigh: highPlan,
        targetLow: lowPlan,
    
        isLive: true
      });
    
      if (state.candles.length > state.maxCandles) state.candles.shift();
    }
    
    function draw() {
  if (!ctx || !W || !H) return;

  // ---------- helpers ----------
  const px = (v) => (Math.round(v) + 0.5);            // crisp lines
  const clamp01 = (t) => Math.max(0, Math.min(1, t));


  const roundRect = (c, x, y, w, h, r) => {
    // Safe rounded-rect helper (works even if CanvasRoundRect is missing)
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (typeof c.roundRect === "function") {
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      return;
    }
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  };

  // ---------- layout ----------
  const leftPad  = 18 * dpr;
  const rightPad = 16 * dpr;
  const topPad   = 14 * dpr;
  const botPad   = 12 * dpr;

  const plotW = Math.max(1, W - leftPad - rightPad);
  const plotH = Math.max(1, H - topPad - botPad);

  // ---------- clear ----------
  ctx.clearRect(0, 0, W, H);

  // Space theme: chart candles/hammers are disabled, scene is rendered by the space layer.
  if (state.theme === "space") {
    return;
  }

// ---------- world grid (camera scroll) ----------
{
  const grid = Math.max(16 * dpr, plotW / (state.maxCandles + 1)); // = step, но с защитой
  const major = grid * 4;

  // камера: во время run — используем накопленный scroll, иначе стоим
  const scroll = (state.phase === "run") ? (Number(state.gridScrollX) || 0) : 0;


  // оффсет = остаток, чтобы линии “зацикливались” бесконечно
  const ox = scroll % grid;
  const oxMajor = scroll % major;

  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1, Math.round(1 * dpr));

  // minor
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let x = leftPad - ox; x <= W - rightPad; x += grid) {
    ctx.beginPath();
    ctx.moveTo(px(x), topPad);
    ctx.lineTo(px(x), topPad + plotH);
    ctx.stroke();
  }

  // horizontal minor (СТАТИЧНЫЕ — чтобы не трясло по Y)
  for (let y = topPad; y <= topPad + plotH; y += grid) {
    ctx.beginPath();
    ctx.moveTo(leftPad, px(y));
    ctx.lineTo(W - rightPad, px(y));
    ctx.stroke();
  }

  // major
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  for (let x = leftPad - oxMajor; x <= W - rightPad; x += major) {
    ctx.beginPath();
    ctx.moveTo(px(x), topPad);
    ctx.lineTo(px(x), topPad + plotH);
    ctx.stroke();
  }
  for (let y = topPad; y <= topPad + plotH; y += major) {
    ctx.beginPath();
    ctx.moveTo(leftPad, px(y));
    ctx.lineTo(W - rightPad, px(y));
    ctx.stroke();
  }

  ctx.restore();
}



const cands = state.candles || [];

// берём только последние свечи для масштаба (камера как в TV)
const N = Math.min(cands.length, 6);
const recent = N ? cands.slice(-N) : [];

const rHigh = recent.length ? Math.max(...recent.map(c => Number(c.high))) : 2.0;
const rLow  = recent.length ? Math.min(...recent.map(c => Number(c.low)))  : 1.0;

// центр камеры = текущий мультипликатор
const mid = Math.max(1.0, Number(state.displayMult) || 1.0);

// базовый “зум” (меньше = свечи крупнее)
let ratio = 1.35;                // 1.25..1.6 = крупно и читаемо
ratio = Math.min(1.9, Math.max(1.22, ratio)); // жёсткий clamp

// держим mid по центру в ЛОГ шкале и расширяем, если последние свечи не влезают
let targetMinV = Math.max(0.9, mid / ratio);
let targetMaxV = mid * ratio;

const needMax = rHigh * 1.04;
const needMin = Math.max(0.9, rLow * 0.98);

// если верх не влез — расширяем симметрично
if (needMax > targetMaxV) {
  ratio = needMax / mid;
  ratio = Math.min(2.1, Math.max(1.22, ratio));
  targetMinV = Math.max(0.9, mid / ratio);
  targetMaxV = mid * ratio;
}

// если низ не влез — расширяем симметрично
if (needMin < targetMinV) {
  ratio = mid / needMin;
  ratio = Math.min(2.1, Math.max(1.22, ratio));
  targetMinV = Math.max(0.9, mid / ratio);
  targetMaxV = mid * ratio;
}

// плавное сглаживание шкалы (чтобы не дёргалось)
const SMOOTH = 0.12;
state.scaleMinV += (targetMinV - state.scaleMinV) * SMOOTH;
state.scaleMaxV += (targetMaxV - state.scaleMaxV) * SMOOTH;

const minV = state.scaleMinV;
const maxV = state.scaleMaxV;

// лог-шкала (mid реально остаётся в центре)
const logMin = Math.log(minV);
const logMax = Math.log(maxV);

const yOf = (v) => {
  const lv = Math.log(Math.max(1e-6, v));
  const t = (lv - logMin) / (logMax - logMin);
  return topPad + plotH * (1 - t);
};





  // ---------- 1.00x dashed baseline ----------
  ctx.save();
  ctx.setLineDash([6 * dpr, 7 * dpr]);
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = Math.max(1, Math.round(1 * dpr));
  const y1 = yOf(1.0);
  ctx.beginPath();
  ctx.moveTo(leftPad, px(y1));
  ctx.lineTo(W - rightPad, px(y1));
  ctx.stroke();
  ctx.restore();

  // ---------- candles (TradingView-like, crisp) ----------
  const n = cands.length;
  if (n) {
    const step = plotW / (state.maxCandles + 1);
    const x0 = leftPad + (plotW - step * n) / 2;

    // Canvas работает в device-px (canvas.width уже умножен на dpr),
    // поэтому толщина линий = dpr соответствует ~1 CSS px.
    const wickW = Math.max(1, Math.round(1 * dpr));      // ~1px
    const bodyStrokeW = Math.max(1, Math.round(1 * dpr));// ~1px
    const gap = Math.max(3 * dpr, Math.floor(step * 0.22));
    const bodyW = clamp(Math.floor(step - gap), Math.round(6 * dpr), Math.floor(step * 0.92));

    // TradingView default (dark theme-like)
    const upFill = "rgba(8,153,129,1)";
    const downFill = "rgba(242,54,69,1)";

    const dojiH = Math.max(2 * dpr, 2);

    // crisp helper: для нечётной толщины линии центр на .5, для чётной — на целых
    const pxFor = (v, lw) => {
      const r = Math.round(v);
      return (lw % 2) ? (r + 0.5) : r;
    };

    for (let i = 0; i < n; i++) {
      const c = cands[i];
      if (!c) continue;

      const x = x0 + step * (i + 0.5);
      const isUp = c.close >= c.open;

      const fill = isUp ? upFill : downFill;

      const yHigh = yOf(c.high);
      const yLow  = yOf(c.low);
      const yOpen = yOf(c.open);
      const yClose= yOf(c.close);

      // wick
      ctx.save();
      ctx.strokeStyle = fill;
      ctx.lineWidth = wickW;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(pxFor(x, wickW), pxFor(yHigh, wickW));
      ctx.lineTo(pxFor(x, wickW), pxFor(yLow, wickW));
      ctx.stroke();

      // body
      let top = Math.min(yOpen, yClose);
      let h   = Math.abs(yClose - yOpen);

      // doji: рисуем тонкую черту вместо огромной "капсулы"
      if (h < dojiH) {
        const y = (yOpen + yClose) / 2;
        const lw = bodyStrokeW;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(Math.round(x - bodyW / 2), pxFor(y, lw));
        ctx.lineTo(Math.round(x + bodyW / 2), pxFor(y, lw));
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const bx = Math.round(x - bodyW / 2);
      const by = Math.round(top);
      const bw = Math.round(bodyW);
      const bh = Math.max(1, Math.round(h));

      ctx.fillStyle = fill;
      ctx.fillRect(bx, by, bw, bh);

      // лёгкая тёмная обводка (похожа на TV на тёмной теме)
      ctx.lineWidth = bodyStrokeW;
      ctx.strokeStyle = fill;
      const o = (bodyStrokeW % 2) ? 0.5 : 0;
      ctx.strokeRect(bx + o, by + o, bw, bh);

      ctx.restore();
    }
  }
  // ---------- tracking dashed horizontal line (live) ----------
  if (isRunPhase(state.phase)) {

  const yTrack = yOf(Math.max(1.0, state.displayMult || 1.0));

  ctx.save();

  // пунктир + лёгкая анимация "бега"
  ctx.setLineDash([6 * dpr, 8 * dpr]);
  ctx.lineDashOffset = -((Date.now() / 30) % 200);

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(1, Math.round(1 * dpr));
  ctx.lineCap = "butt";

  ctx.beginPath();
  ctx.moveTo(leftPad, px(yTrack));
  ctx.lineTo(W - rightPad, px(yTrack));
  ctx.stroke();

  ctx.restore();
}



  // ---------- crash vertical line (enhanced FX) ----------
  if (state.phase === "crash" || state.phase === "wait") {
    const n2 = (state.candles || []).length;
    if (n2 > 0) {
      const step = plotW / (state.maxCandles + 1);
      const x0 = leftPad + (plotW - step * n2) / 2;
      const lastX = x0 + step * (n2 - 1 + 0.5);
      const gap = Math.max(3 * dpr, Math.floor(step * 0.22));
      const bodyW = clamp(Math.floor(step - gap), Math.round(6 * dpr), Math.floor(step * 0.92));

      const fromY = yOf(state.crashPoint || state.displayMult || 1.0);
      const toY = topPad + plotH;
      const nowMs = Date.now();

      if (state.crashFxRoundId !== state.roundId) {
        state.crashFxRoundId = state.roundId;
        state.crashFxAt = nowMs;
      }

      ctx.save();
      // Main crash bar with candle-like width, placed after the last candle.
      const barTop = Math.round(fromY);
      const barH = Math.max(2, Math.round(toY - fromY));
      const barW = Math.max(2, Math.round(bodyW));
      const prevBodyRight = Math.round(lastX + bodyW / 2);
      const minGap = Math.max(2, Math.round(1 * dpr));
      let barX = Math.round(lastX + step - barW / 2);
      const minBarX = prevBodyRight + minGap;
      const maxBarX = Math.round(W - rightPad - barW - minGap);
      if (barX < minBarX) barX = minBarX;
      if (barX > maxBarX) barX = maxBarX;
      const barCx = barX + barW / 2;

      const barGrad = ctx.createLinearGradient(barCx, fromY, barCx, toY);
      barGrad.addColorStop(0, "rgba(198,74,96,0.86)");
      barGrad.addColorStop(0.32, "rgba(174,57,82,0.90)");
      barGrad.addColorStop(1, "rgba(144,42,66,0.93)");
      ctx.fillStyle = barGrad;
      ctx.fillRect(barX, barTop, barW, barH);

      const strokeW = Math.max(1, Math.round(1 * dpr));
      const strokeOffset = (strokeW % 2) ? 0.5 : 0;
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = "rgba(214,110,136,0.28)";
      ctx.strokeRect(barX + strokeOffset, barTop + strokeOffset, barW, barH);
      ctx.restore();
    }
  }
}



    let lastCurrency = "";
    let currencyPollTimer = 0;

    function syncCrashCurrency(force = false) {
      const cur = detectCurrency();
      if (force || cur !== lastCurrency) {
        lastCurrency = cur;
        renderPills();
      }
    }

    function startCurrencyPolling() {
      if (currencyPollTimer) return;
      syncCrashCurrency(true);
      currencyPollTimer = setInterval(() => {
        if (document.hidden) return;
        syncCrashCurrency(false);
      }, 1200);
    }

    function stopCurrencyPolling() {
      if (!currencyPollTimer) return;
      clearInterval(currencyPollTimer);
      currencyPollTimer = 0;
    }

    let rafId = 0;
    let running = false;
    const onVisibilityChange = () => {
      state.lastFrameAt = 0;
      state.lastRenderAt = 0;
    };
    document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });

    function loop(now) {
      if (!now) now = performance.now();

      const frameInterval = getTargetFrameIntervalMs();
      if (state.lastRenderAt && (now - state.lastRenderAt) < frameInterval) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      state.lastRenderAt = now;

      if (!state.lastFrameAt) state.lastFrameAt = now;
      state.lastFrameAt = now;
    
      // --- BETTING: обновление таймера ---
      if (state.phase === "betting") {
        const seconds = getBettingSeconds() ?? 0;
        
        // Обновляем только если изменилось значение
        if (seconds !== state.lastTimerSeconds) {
          state.lastTimerSeconds = seconds;
          setTimer(seconds, true);
          
          if (timerEl) {
            timerEl.classList.toggle('is-urgent', seconds <= 3);
          }
        }
      }
    
      // --- RUN: плавный множитель + свечи ---
      if (isRunPhase(state.phase)) {

        // 1) Плавно тянем displayMult к serverMult
        const target = Math.max(1.0, Number(state.serverMult) || 1.0);
    
        // адаптивная скорость (чуть быстрее при большом разрыве)
        const diff = target - (state.displayMult || 1.0);
        const base = 0.08; // базовая плавность
        const k = Math.max(0.08, Math.min(0.22, base + Math.abs(diff) * 0.02));
    
        state.displayMult = (state.displayMult || 1.0) + diff * k;
        if (!Number.isFinite(state.displayMult)) state.displayMult = 1.0;
        state.displayMult = Math.max(1.0, state.displayMult);
    
        // HUD multiplier
        setMult(state.displayMult, "green");
    
        // 2) Таймер свечи (0..1 прогресс внутри текущей свечи)
        if (!state.lastCandleAt) state.lastCandleAt = now;
        const elapsed = now - state.lastCandleAt;
    
        state.candleProgress = clamp(elapsed / state.candleMs, 0, 1);
    
        // 3) Гарантия: первая свеча сразу при старте RUN
        if (!state.candles || state.candles.length === 0) {
          state.candles = [];
          addCandle();
        }
    
        // 4) Плавное “оживление” последней свечи каждый кадр
        const last = state.candles[state.candles.length - 1];
        if (last && last.isLive) {
          const t = state.candleProgress;      // 0..1
          const smoothC = 0.10 + 0.22 * t;     // close
          const smoothW = 0.08 + 0.18 * t;     // wicks

          // close не должен обгонять текущий displayMult
          const cap = Math.max(last.open, state.displayMult);
          const tc = Math.min(last.targetClose, cap);

          last.close += (tc - last.close) * smoothC;

          // фитили плавно “доезжают” к запланированным значениям
          last.high += (last.targetHigh - last.high) * smoothW;
          last.low  += (last.targetLow  - last.low ) * smoothW;

          // консистентность
          last.close = Math.max(last.open, last.close);
          last.high = Math.max(last.high, last.open, last.close);
          last.low  = Math.min(last.low,  last.open, last.close);
        }

    
        // 5) Закрытие свечи и создание новой
        if (elapsed >= state.candleMs) {
          // фиксируем предыдущую свечу
          const prev = state.candles[state.candles.length - 1];
          if (prev) prev.isLive = false;
    
          state.lastCandleAt = now;
          addCandle();
    
          // если хочешь синхрон-скролл сетки "как мир":
          // (оставь если ты это используешь в draw())
          if (typeof state.gridBaseX === "number") {
            const leftPad = 18 * dpr;
            const rightPad = 16 * dpr;
            const plotW = Math.max(1, W - leftPad - rightPad);
            const step = plotW / (state.maxCandles + 1);
            state.gridBaseX += step;
          }
        }
        
        // если используешь gridScrollX (камера мира)
        if (typeof state.gridBaseX === "number") {
          const leftPad = 18 * dpr;
          const rightPad = 16 * dpr;
          const plotW = Math.max(1, W - leftPad - rightPad);
          const step = plotW / (state.maxCandles + 1);
          state.gridScrollX = state.gridBaseX + state.candleProgress * step;
        }
        if (isRunPhase(state.phase)) {
          ensureRunPlayersRendered();   // <-- ДО updatePlayerDomLive()
        
        // 6) Лайв-обновление игроков (не каждый кадр)
        if (now - (state.lastPlayerDomUpdate || 0) >= 120) {
          state.lastPlayerDomUpdate = now;
          updatePlayerDomLive();
        }
        }
      } else {
        // НЕ run: не растим множитель и не двигаем прогресс свечи
        state.candleProgress = 0;
        state.lastCandleAt = 0;
    
        // если хочешь, чтобы в betting HUD не показывал старое:
        // (но ты и так скрываешь multEl в betting)
        // state.displayMult = 1.0;
      }

      updateSpaceScene(now);
    
      // --- render ---
      draw();
    
      rafId = requestAnimationFrame(loop);

    }
    
    function startLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      state.lastFrameAt = 0;
      state.lastRenderAt = 0;
      rafId = requestAnimationFrame(loop);
    }
    
    function stopLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    
    function start() {
      if (running) return;
      running = true;
      resize();
      renderPlayersPanelMeta();
      renderPills();
      startCurrencyPolling();
      connectWebSocket();
      startLoop();
    }

    function stop() {
      running = false;
      stopLoop();
      stopCurrencyPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (ws) ws.close();
    }

    function hasActiveCrashBet() {
      const myId = String(getUserId());
      const me = (state.players || []).find(p => String(p?.userId) === myId) || state.myBet;
      if (!me || me.claimed) return false;
      return state.phase === 'waiting' || state.phase === 'betting' || isRunPhase(state.phase) || state.phase === 'crash' || state.phase === 'wait';
    }

    window.CrashGame = window.CrashGame || {};
    window.CrashGame.hasActiveBet = hasActiveCrashBet;
    window.CrashGame.getPhase = () => state.phase;

    return { start, stop };
  }

  function boot() {
    const page = ensureCrashPage();
    const engine = createEngine(page);
    engine.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();

