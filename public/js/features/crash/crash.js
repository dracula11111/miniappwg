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

  const ICON_TON = "/icons/tgTonWhite.svg";
  const ICON_STAR = "/icons/tgStarWhite.svg";

  const qs = (sel, root = document) => root.querySelector(sel);

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
    try {
      const tg = window.Telegram?.WebApp;
      const id = tg?.initDataUnsafe?.user?.id;
      if (id) return String(id);
    } catch (_) {}
    return localStorage.getItem("userId") || "guest_" + Date.now();
  }

  function getUserName() {
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
      candles: [],
      maxCandles: 15,
      lastCandleAt: 0,
      candleMs: 160,
      lastTimerSeconds: null,
      bettingTimeMs: 10000,
      bettingLeftMs: null,
      bettingLeftAt: 0,
      serverTimeOffset: 0,
      lastPlayerDomUpdate: 0,

    };

    // WebSocket connection
    let ws = null;
    let reconnectTimeout = null;

    function connectWebSocket() {
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
          state.phaseStart = msg.phaseStart;
          state.roundId = msg.roundId;
          state.crashPoint = msg.crashPoint;
          state.serverMult = (typeof msg.currentMult === 'number' && Number.isFinite(msg.currentMult)) ? msg.currentMult : 1.0;
          state.players = msg.players || [];
          state.history = msg.history || [];
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

            if (typeof msg.serverTime === 'number' && Number.isFinite(msg.serverTime)) {
              state.serverTimeOffset = Date.now() - msg.serverTime;
            }

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
          if (msg.roundId === state.roundId && state.phase === 'run') {
            if (typeof msg.currentMult === 'number' && Number.isFinite(msg.currentMult)) {
              // Never go backwards visually
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
    
      // если сервер прислал оставшиеся мс — используем это (самый надёжный вариант)
      if (typeof state.bettingLeftMs === 'number' && Number.isFinite(state.bettingLeftMs) && state.bettingLeftAt) {
        const rem = Math.max(0, state.bettingLeftMs - (Date.now() - state.bettingLeftAt));
        return Math.ceil(rem / 1000);
      }
    
      // fallback (если вдруг не пришло)
      const rem = Math.max(0, state.bettingTimeMs - (Date.now() - (state.phaseStart || 0)));
      return Math.ceil(rem / 1000);
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
    let playerDomRefs = new Map();

     

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
        cachePlayerDomRefs();

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
        } else if (state.phase === 'run') {
          traderClass += ' is-active';
          if (player.claimed) {
            const payout = (player.amount * player.claimMult).toFixed(player.currency === 'stars' ? 0 : 2);
            statusHTML = `
              <div class="crash-amount__top is-green">
                <img class="crash-ico" src="${icon}" alt="" />
                ${payout}
              </div>
              <div class="crash-amount__sub">${formatX(player.claimMult)}</div>
            `;
          } else {
            const currentValue = (player.amount * state.displayMult).toFixed(player.currency === 'stars' ? 0 : 2);
            statusHTML = `
              <div class="crash-amount__top">
                <img class="crash-ico" src="${icon}" alt="" />
                <span class="js-payout-value">${currentValue}</span>
              </div>
              <div class="crash-amount__sub">
                <span class="js-mult-value">${formatX(state.displayMult)}</span>
              </div>

              <div class="crash-amount__sub">${formatX(state.displayMult)}</div>
            `;
          }
        } else if (state.phase === 'crash') {
          if (player.claimed) {
            const payout = (player.amount * player.claimMult).toFixed(player.currency === 'stars' ? 0 : 2);
            statusHTML = `
              <div class="crash-amount__top is-green">
                <img class="crash-ico" src="${icon}" alt="" />
                ${payout}
              </div>
              <div class="crash-amount__sub">${formatX(player.claimMult)}</div>
            `;
          } else {
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
                <div class="crash-name">${player.name}${isCurrentUser ? ' (You)' : ''}</div>
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
    }


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
      if (state.phase !== 'run') return;
      const mult = Math.max(1.0, state.displayMult || 1.0);

      for (const p of (state.players || [])) {
        if (!p || p.claimed) continue;
        const ref = playerDomRefs.get(String(p.userId));
        if (!ref) continue;

        const decimals = (p.currency === 'stars') ? 0 : 2;
        if (ref.payout) ref.payout.textContent = (p.amount * mult).toFixed(decimals);
        if (ref.mult) ref.mult.textContent = formatX(mult);
      }
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

      buyBtn.textContent = "Place bet";
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
      const m = Math.max(1, state.serverMult);
      const prevClose = state.candles.length ? state.candles[state.candles.length - 1].close : 1.0;

      const target = state.serverMult;
      const drift = (target - prevClose) * 0.82;
      const dip = Math.random() < 0.08;

      let close = prevClose + drift + (Math.random() - 0.5) * (0.008 + target * 0.0005);
      if (dip) {
        close = prevClose - (0.01 + Math.random() * 0.025) * (1 + target * 0.005);
      }

      close = clamp(close, 0.995, Math.min(target, 1000));

      const open = prevClose;
      const isGreen = close >= open;
      const bodyAbs = Math.abs(close - open);
      const hammer = isGreen && Math.random() < 0.88;

      const upperWick = (0.005 + Math.random() * 0.02) + bodyAbs * (0.15 + Math.random() * 0.25);
      const lowerWick = hammer
        ? (0.06 + Math.random() * 0.15) + bodyAbs * (2.5 + Math.random() * 2.5)
        : (0.012 + Math.random() * 0.06) + bodyAbs * (0.7 + Math.random() * 0.8);

      const high = Math.max(open, close) + upperWick;
      const low = Math.max(0, Math.min(open, close) - lowerWick);

      state.candles.push({
        open,
        close,
        high,
        low,
        birthTime: performance.now()
      });
      if (state.candles.length > state.maxCandles) state.candles.shift();
    }

    function draw() {
      if (!W || !H) return;

      const topPad = 40 * dpr;
      const bottomPad = 40 * dpr;
      const leftPad = 40 * dpr;
      const rightPad = 40 * dpr;

      const plotW = W - leftPad - rightPad;
      const plotH = H - topPad - bottomPad;

      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5 * dpr;

      const rows = 5;
      for (let i = 0; i <= rows; i++) {
        const y = topPad + (plotH * i) / rows;
        ctx.beginPath();
        ctx.moveTo(leftPad, y);
        ctx.lineTo(W - rightPad, y);
        ctx.stroke();
      }
      ctx.restore();

      const cands = state.candles;
      const highs = cands.map(c => c.high);

      let maxV = Math.max(2.0, ...highs, state.serverMult * 1.15);
      maxV = Math.min(1000, maxV);
      const minV = 0.0;

      const yOf = (v) => {
        const t = (v - minV) / (maxV - minV);
        return topPad + plotH * (1 - t);
      };

      ctx.save();
      ctx.setLineDash([8 * dpr, 10 * dpr]);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1 * dpr;
      const y1 = yOf(1.0);
      ctx.beginPath();
      ctx.moveTo(leftPad, y1);
      ctx.lineTo(W - rightPad, y1);
      ctx.stroke();
      ctx.restore();

      const n = cands.length;
      if (n) {
        const step = plotW / (state.maxCandles + 1);
        const bodyW = Math.max(12 * dpr, step * 0.75);
        const wickW = Math.max(4 * dpr, bodyW * 0.22);

        const totalWidth = step * n;
        const offsetX = (plotW - totalWidth) / 2 + leftPad;

        for (let i = 0; i < n; i++) {
          const c = cands[i];
          const x = offsetX + step * (i + 0.5);

          const isGreen = c.close >= c.open;

          const age = performance.now() - (c.birthTime || 0);
          const animDuration = 400;
          const animProgress = Math.min(1, age / animDuration);
          const easeProgress = 1 - Math.pow(1 - animProgress, 3);

          const alpha = easeProgress;
          const scale = 0.7 + (easeProgress * 0.3);

          const col = isGreen ? "rgba(46,255,154,1)" : "rgba(255,59,78,1)";

          const yOpen = yOf(c.open);
          const yClose = yOf(c.close);
          const yHigh = yOf(c.high);
          const yLow = yOf(c.low);

          const centerY = (yOpen + yClose) / 2;

          ctx.save();
          ctx.globalAlpha = alpha;

          ctx.translate(x, centerY);
          ctx.scale(scale, scale);
          ctx.translate(-x, -centerY);

          ctx.strokeStyle = col;
          ctx.lineWidth = wickW;
          ctx.lineCap = "butt";
          ctx.beginPath();
          ctx.moveTo(x, yHigh);
          ctx.lineTo(x, yLow);
          ctx.stroke();

          const top = Math.min(yOpen, yClose);
          const h = Math.max(6 * dpr, Math.abs(yClose - yOpen));

          ctx.fillStyle = col;
          ctx.fillRect(x - bodyW / 2, top, bodyW, h);

          ctx.restore();
        }
      }

      if (state.phase === "crash" || state.phase === "wait") {
        const totalWidth = (plotW / state.maxCandles) * state.candles.length;
        const offsetX = (plotW - totalWidth) / 2 + leftPad;
        const lastX = offsetX + (plotW / state.maxCandles) * (state.candles.length - 0.5);
        const fromY = yOf(state.crashPoint);
        const toY = yOf(0.0);

        ctx.save();
        ctx.strokeStyle = "rgba(255,59,78,0.95)";
        ctx.lineWidth = 10 * dpr;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lastX, fromY);
        ctx.lineTo(lastX + 2 * dpr, toY);
        ctx.stroke();
        ctx.restore();
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
      if (!running) return;

      // Smooth local countdown (no need to spam full gameState)
      if (state.phase === 'betting') {
        const remaining = Math.max(0, 10000 - (Date.now() - state.phaseStart));
        const seconds = Math.ceil(remaining / 1000);

        if (seconds !== state.lastTimerSeconds) {
          state.lastTimerSeconds = seconds;
          setTimer(seconds, true);

          const timerEl = document.getElementById('crashTimer');
          if (timerEl) timerEl.classList.toggle('is-urgent', seconds <= 3);
        }
      } else if (state.lastTimerSeconds !== null) {
        // hide timer if we just left betting
        state.lastTimerSeconds = null;
        setTimer(0, false);

        const timerEl = document.getElementById('crashTimer');
        if (timerEl) timerEl.classList.remove('is-urgent');
      }

      if (!state.lastCandleAt) state.lastCandleAt = now;

      if (state.phase === "run") {
        if (now - state.lastCandleAt >= state.candleMs) {
          state.lastCandleAt = now;
          addCandle();
        }

        const lerpSpeed = 0.08;
        const target = Math.max(1.0, state.serverMult);
        state.displayMult += (target - state.displayMult) * lerpSpeed;
        state.displayMult = Math.max(1.0, state.displayMult);

        setMult(state.displayMult, "green");
        if (now - state.lastPlayerDomUpdate >= 120) {
          state.lastPlayerDomUpdate = now;
          updatePlayerDomLive();
        }
        
      }

      draw();
      raf = requestAnimationFrame(loop);
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
