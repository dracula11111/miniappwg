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
const ICON_TON = "/icons/tgTonWhite.svg";
  const ICON_STAR = "/icons/tgStarWhite.svg";

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
    const ls = (
      localStorage.getItem("currency") ||
      localStorage.getItem("selectedCurrency") ||
      localStorage.getItem("balanceCurrency") ||
      ""
    ).toLowerCase();

    if (ls === "stars" || ls === "star") return "stars";
    if (ls === "ton") return "ton";

    const src = (qs("#pillCurrencyIcon")?.getAttribute("src") || "").toLowerCase();
    if (src.includes("star")) return "stars";

    return "ton";
  }

  function currencyIcon(currency) {
    return currency === "stars" ? ICON_STAR : ICON_TON;
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
      const res = await fetch(`/api/balance?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
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
<div class="crash-card">
      <div class="crash-canvasWrap">
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
      </div>
      <div class="crash-players" id="crashPlayers"></div>
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

        <div class="crash-helpRow">
          <span id="${BET_LABEL_ID}" class="crash-betLabel">
            <img id="${BET_ICON_ID}" class="crash-ico" src="${ICON_TON}" alt="" />
            <span id="${BET_TEXT_ID}">Bet: 0.1</span>
          </span>
          <span id="${STATUS_ID}">Connecting…</span>
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

    const multEl = document.getElementById(MULT_ID);
    const buyBtn = document.getElementById(BUY_ID);
    const plusBtn = document.getElementById(PLUS_ID);
    const amountRow = document.getElementById(AMOUNT_ROW_ID);
    const betIconEl = document.getElementById(BET_ICON_ID);
    const betTextEl = document.getElementById(BET_TEXT_ID);
    const statusEl = document.getElementById(STATUS_ID);
    const playersEl = document.getElementById("crashPlayers");

    let dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    let W = 0;
    let H = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      W = Math.max(1, Math.floor(rect.width * dpr));
      H = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = W;
      canvas.height = H;
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const state = {
      phase: "betting",
      phaseStart: 0,
      roundId: 0,
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
      lastPlayerDomUpdate: 0
    };
    function isRunPhase(phase) {
      return phase === "run" || phase === "running" || phase === "inGame";
    }
    

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
          state.crashPoint = msg.crashPoint;
          state.serverMult = (typeof msg.currentMult === 'number' && Number.isFinite(msg.currentMult)) ? msg.currentMult : 1.0;
          state.players = msg.players || [];
          state.history = msg.history || [];

          // New round -> reset visuals so graph/multiplier doesn't "jump"
          if (state.roundId !== prevRoundId) {
            state.candles = [];
            state.displayMult = 1.0;
            state.lastCandleAt = 0;
            state.lastTimerSeconds = null;
          }

          // Phase transition hygiene
          if (state.phase === 'betting' && prevPhase !== 'betting') {
            state.displayMult = 1.0;
            state.serverMult = 1.0;
          }

          // Sync UI (heavy stuff only here, not on tick)
          renderPlayers();
          renderHistory();
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

              let payoutText = '';
              if (state.myBet && typeof state.myBet.amount === 'number' && Number.isFinite(state.myBet.amount)) {
                const amt = Number(state.myBet.amount);
                const cur = (state.myBet.currency === 'stars') ? '⭐' : 'TON';
                const decimals = (state.myBet.currency === 'stars') ? 0 : 2;
                const payout = amt * m;
                if (Number.isFinite(payout)) {
                  payoutText = ` • ${payout.toFixed(decimals)} ${cur}`;
                }
              }

              showToast(`✅ Claimed ${formatX(m)}${payoutText}`, { ttl: 2400 });
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
          setStatus(msg.message);
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

    function updateUIForPhase() {
      const myPlayer = state.players.find(p => p.userId === getUserId());
      state.myBet = myPlayer;

      switch (state.phase) {
        case 'betting':
          const seconds = getBettingSeconds() ?? 0;
          setTimer(seconds, true);
          
          const timerEl = document.getElementById('crashTimer');
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
          break;

          case 'run':
            case 'running':
            case 'inGame':
              setTimer(0, false);
              if (multEl) multEl.style.display = 'block';
            
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
          setMult(state.crashPoint, "red");
          
          const cardCrash = document.querySelector('.crash-card');
          if (cardCrash) cardCrash.classList.add('is-crashed');
          
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
          setTimer(0, false);
          if (multEl) multEl.style.display = 'block';

          const finalMult = (typeof state.crashPoint === 'number' && Number.isFinite(state.crashPoint))
            ? state.crashPoint
            : state.displayMult;

          setMult(finalMult, "red");

          const cardWait = document.querySelector('.crash-card');
          if (cardWait) cardWait.classList.add('is-crashed');

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

    function setStatus(text) {
      if (statusEl) statusEl.textContent = text;
    }

function showToast(text, opts = {}) {
  const host = document.getElementById(TOAST_HOST_ID);
  if (!host) return;

  const el = document.createElement("div");
  el.className = "crash-toast";
  el.textContent = String(text || "");

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
      const timerEl = document.getElementById('crashTimer');
      if (!timerEl) return;

      if (show) {
        timerEl.textContent = seconds;
        timerEl.style.display = 'block';
      } else {
        timerEl.style.display = 'none';
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

    function renderHistory() {
      const historyEl = document.getElementById('crashHistory');
      if (!historyEl) return;

      historyEl.innerHTML = state.history
        .slice(0, 15)
        .map(mult => {
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
    
    function renderPlayers() {
      if (!playersEl) return;

      const userId = getUserId();
      const sortedPlayers = [...state.players].sort((a, b) => {
        if (a.userId === userId) return -1;
        if (b.userId === userId) return 1;
        return (b.amount || 0) - (a.amount || 0);
      });

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

        if (state.phase === 'betting' || state.phase === 'wait') {
          statusHTML = `<span class="crash-player__status">Waiting</span>`;
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
                <div class="crash-amount__sub">
                  <img class="crash-ico" src="${icon}" alt="" />
                  Bet: ${player.amount}
                </div>
              </div>
            </div>
            <div class="crash-amount">
              ${statusHTML}
            </div>
          </div>
        `;
      }).join('');
      cachePlayerDomRefs();

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
      amountRow?.querySelectorAll(".crash-pill").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const amt = uiBetAmount();
      if (betTextEl) betTextEl.textContent = `Bet: ${amt}`;
    }

    amountRow?.addEventListener("click", (e) => {
      // Обработка input изменений
        const betInput = document.getElementById("crashBetInput");
        if (betInput) {
          betInput.addEventListener("input", () => {
            if (state.myBet && !state.myBet.claimed) {
              setStatus("Bet already placed");
              return;
            }
            
            const currency = detectCurrency();
            const val = parseNumber(betInput.value);
            
            // Форматирование в реальном времени
            if (val > 0) {
              const formatted = currency === "stars" 
                ? Math.floor(val).toString()
                : val.toFixed(2);
              
              if (betTextEl) {
                betTextEl.textContent = `Bet: ${formatted}`;
              }
            }
          });
          
          // Обработка потери фокуса - применяем минимум
          betInput.addEventListener("blur", () => {
            const currency = detectCurrency();
            const val = parseNumber(betInput.value);
            
            if (val > 0) {
              if (currency === "stars") {
                betInput.value = Math.max(10, Math.floor(val)).toString();
              } else {
                betInput.value = Math.max(0.1, Math.round(val * 100) / 100).toFixed(2);
              }
            } else if (betInput.value.trim() !== "") {
              // Если введено что-то некорректное
              betInput.value = currency === "stars" ? "10" : "0.1";
            }
            
            renderPills();
          });
        }

        // Обработка кнопки Max
        amountRow?.addEventListener("click", (e) => {
          const btn = e.target?.closest?.("button[data-amt='max']");
          if (!btn) return;
          
          if (state.myBet && !state.myBet.claimed) {
            setStatus("Bet already placed");
            return;
          }
          
          const input = document.getElementById("crashBetInput");
          const top = qs("#tonAmount");
          const cur = detectCurrency();
          const bal = parseNumber(top?.textContent || "0");
          
          if (input) {
            if (cur === "stars") {
              input.value = Math.max(10, Math.floor(bal)).toString();
            } else {
              input.value = Math.max(0.1, bal).toFixed(2);
            }
            renderPills();
          }
        }, { passive: true });



      setActivePill(btn);
    }, { passive: true });

    function setBuyMode(mode) {
      if (!buyBtn) return;

      buyBtn.disabled = state.actionLock || mode === "locked" || mode === "lost" || mode === "claimed";
      buyBtn.classList.remove("is-claim", "is-disabled", "is-lost");

      if (mode === "claim") {
        buyBtn.textContent = "Claim";
        buyBtn.classList.add("is-claim");
        return;
      }

      if (mode === "lost") {
        buyBtn.textContent = "Lost";
        buyBtn.classList.add("is-lost");
        buyBtn.disabled = true;
        return;
      }

      if (mode === "claimed") {
        buyBtn.textContent = "Claimed";
        buyBtn.classList.add("is-disabled");
        buyBtn.disabled = true;
        return;
      }

      if (mode === "locked") {
        buyBtn.textContent = "…";
        buyBtn.classList.add("is-disabled");
        buyBtn.disabled = true;
        return;
      }

      buyBtn.textContent = "Place Bet";
    }

    async function placeBet() {
      const currency = detectCurrency();
      renderPills();
    
      if (state.phase !== "betting") {
        setStatus("Wait next round");
        return;
      }
      if (state.myBet) {
        setStatus("Bet already placed");
        return;
      }
      const amt = uiBetAmount();
      if (!amt || amt <= 0) {
        setStatus("Invalid bet");
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
    
        const roundId = `crash_${state.roundId}_${getUserId()}`;
    
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
          userId: getUserId(),
          amount: rounded,
          currency,
          userName: getUserName(),
          userAvatar: getUserAvatar()
        });
    
        await refreshTopBalance();
    
      } catch (e) {
        setStatus(`Bet failed: ${e.message}`);
        setBuyMode("buy");
      } finally {
        state.actionLock = false;
      }
    }

    async function claim() {
      if (!state.myBet || state.myBet.claimed) return;
      if (state.phase !== "run") {
        setStatus("Can't claim now");
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
          
          showToast(`Succesfully Claimed! `, { ttl: 2400 });
          
          state.actionLock = false;
          return;
        }
    
        // Credit balance
        await apiDeposit({
          amount: payout,
          currency,
          type: "crash_win",
          roundId: `crash_${state.roundId}_${getUserId()}`,
          depositId: `crash_win_${getUserId()}_${state.roundId}_${Date.now()}`
        });
    
        // Send claim to server
        sendWS({
          type: 'claim',
          userId: getUserId()
        });
    
        await refreshTopBalance();
    
      } catch (e) {
        setStatus(`Claim failed: ${e.message}`);
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



  // ---------- crash vertical line ----------
  if (state.phase === "crash" || state.phase === "wait") {
    const n2 = (state.candles || []).length;
    if (n2 > 0) {
      const step = plotW / (state.maxCandles + 1);
      const x0 = leftPad + (plotW - step * n2) / 2;
      const lastX = x0 + step * (n2 - 1 + 0.5);

      const fromY = yOf(state.crashPoint || state.displayMult || 1.0);
      const toY = topPad + plotH; // прям в низ графика, не yOf(0)

      ctx.save();
      ctx.strokeStyle = "rgba(255,59,78,0.92)";
      ctx.lineWidth = Math.max(3 * dpr, 3);
      ctx.lineCap = "butt"; // не округлять
      ctx.beginPath();
      ctx.moveTo(px(lastX), px(fromY));
      ctx.lineTo(px(lastX), px(toY));
      ctx.stroke();
      ctx.restore();
    }
  }
}



    let lastCurrency = "";
    setInterval(() => {
      const cur = detectCurrency();
      if (cur !== lastCurrency) {
        lastCurrency = cur;
        renderPills();
      }
    }, 400);

    let raf = 0;
    let running = false;

    function loop(now) {
      if (!now) now = performance.now();
    
      if (!state.lastFrameAt) state.lastFrameAt = now;
      const dt = Math.min(50, now - state.lastFrameAt);
      state.lastFrameAt = now;
    
      // --- BETTING: обновление таймера ---
      if (state.phase === "betting") {
        const seconds = getBettingSeconds() ?? 0;
        
        // Обновляем только если изменилось значение
        if (seconds !== state.lastTimerSeconds) {
          state.lastTimerSeconds = seconds;
          setTimer(seconds, true);
          
          const timerEl = document.getElementById('crashTimer');
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
        if (now - (state.lastPlayerDomUpdate || 0) >= 120) 
          state.lastPlayerDomUpdate = now;
          updatePlayerDomLive();
        }
      } else {
        // НЕ run: не растим множитель и не двигаем прогресс свечи
        state.candleProgress = 0;
        state.lastCandleAt = 0;
    
        // если хочешь, чтобы в betting HUD не показывал старое:
        // (но ты и так скрываешь multEl в betting)
        // state.displayMult = 1.0;
      }
    
      // --- render ---
      draw();
    
      raf = requestAnimationFrame(loop);

    }
    
    function startLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      state.lastFrameAt = 0;
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
      renderPills();
      connectWebSocket();
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ws) ws.close();
    }

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
