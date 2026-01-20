/*
  Crash (game + UI)
  - Visual candles: mostly green "hammers" (bigger bodies), occasional red dips
  - Game loop: Betting -> Run (mult grows) -> Crash (fast drop to 0) -> Betting
  - Balance: uses backend endpoint /api/deposit-notification

  Place file: /public/js/features/crash/crash.js
  Place css : /public/css/crash.css
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
  
    const ICON_TON = "/Icons/tgTonWhite.svg";
    const ICON_STAR = "/Icons/tgStarWhite.svg";
  
    // Game settings
    const HOUSE_EDGE = 0.07;      // (1 - 0.07) like in your formula screenshot
    const MAX_MULT = 1000;        // cap
    const BETTING_MS = 10000;       // small pause between rounds
    const CRASH_DROP_MS = 420;    // how fast the red line drops
    const WAIT_AFTER_CRASH_MS = 900;
  
    // ---------- DOM helpers ----------
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
  
      const fromLS = localStorage.getItem("userId") || localStorage.getItem("telegram_id") || "";
      return fromLS ? String(fromLS) : "guest";
    }
  
    function getInitData() {
      try {
        return window.Telegram?.WebApp?.initData || "";
      } catch (_) {
        return "";
      }
    }
  
    function detectCurrency() {
      // 1) localStorage hints (if your profile stores it)
      const ls = (
        localStorage.getItem("currency") ||
        localStorage.getItem("selectedCurrency") ||
        localStorage.getItem("balanceCurrency") ||
        localStorage.getItem("activeCurrency") ||
        ""
      ).toLowerCase();
  
      if (ls === "stars" || ls === "star" || ls === "tgstar") return "stars";
      if (ls === "ton" || ls === "tgton") return "ton";
  
      // 2) top balance icon (already switches in your app)
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
  
      // If you already have SSE updating balances, this is just a safe fallback.
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
      } catch (_) {
        // ignore
      }
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
                
                <!-- История раундов внизу карты -->
                <div class="crash-history" id="crashHistory"></div>
                </div>

                <div class="crash-panel">
            <div class="crash-panel__head">
              <div class="crash-panel__title">Players</div>
            </div>
            <div class="crash-players" id="crashPlayers"></div>
          </div>
          </div>
          
          <!-- Панель управления как часть страницы -->
          <div class="crash-controls">
            <div class="crash-controls__bar">
              <div class="crash-amountRow" id="${AMOUNT_ROW_ID}">
                <button class="crash-pill is-active" type="button" data-amt="0.5"></button>
                <button class="crash-pill" type="button" data-amt="1"></button>
                <button class="crash-pill" type="button" data-amt="5"></button>
                <button class="crash-pill" type="button" data-amt="10"></button>
                <button class="crash-pill" type="button" data-amt="max"></button>
              </div>

              <div class="crash-actions">
                <button class="crash-buy" id="${BUY_ID}" type="button">Buy</button>
                <button class="crash-plus" id="${PLUS_ID}" type="button" aria-label="Deposit">+</button>
              </div>

              <div class="crash-helpRow">
                <span id="${BET_LABEL_ID}" class="crash-betLabel">
                  <img id="${BET_ICON_ID}" class="crash-ico" src="${ICON_TON}" alt="" />
                  <span id="${BET_TEXT_ID}">Bet: 0.5</span>
                </span>
                <span id="${STATUS_ID}">Waiting…</span>
              </div>
            </div>
          </div>
        </section>
        </section>
      `;
const appRoot = qs(".app") || document.body;
      const bottomNav = qs(".bottom-nav", appRoot);
      if (bottomNav) appRoot.insertBefore(page, bottomNav);
      else appRoot.appendChild(page);
  
      return page;
    }
  
   
// ---------- Engine ----------
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
    



            const crashHistory = [];
            const MAX_HISTORY = 15;

            // Active players in current round
            const activePlayers = new Map(); // userId -> { name, avatar, amount, currency, claimed, claimMult }
                
       
  
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
        phase: "betting", // betting | run | crash | wait
        phaseStart: 0,
      
        candles: [],
        maxCandles: 15,
        candleMs: 160,
        lastCandleAt: 0,
      
        // True multiplier (monotonic)
        trueMult: 1.0,
        // Visual multiplier (can dip a bit)
        visMult: 1.0,
        // Displayed multiplier (smooth interpolation)
        displayMult: 1.0,
      
        crashPoint: 2.0,
        crashStart: 0,
        crashFrom: 1.0,
      
        bet: null, // { amount, currency, roundId, claimed, claimMult, payout }
        roundId: 0,
      
        actionLock: false
      };
  
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
      
      function getMultColor(mult) {
        if (mult < 1.5) {
          return 'color-1';
        } else if (mult < 2) {
          return 'color-2';
        } else if (mult < 5) {
          return 'color-3';
        } else if (mult < 20) {
          return 'color-4';
        } else {
          return 'color-5';
        }
      }
      
      function renderHistory() {
        const historyEl = document.getElementById('crashHistory');
        if (!historyEl) return;
      
        historyEl.innerHTML = crashHistory
          .slice(-MAX_HISTORY)
          .reverse()
          .map(mult => {
            const colorClass = getMultColor(mult);
            return `<div class="crash-history__item ${colorClass}">${formatX(mult)}</div>`;
          })
          .join('');
      }

      function renderPlayers() {
        if (!playersEl) return;
        
        const userId = getUserId();
        const sortedPlayers = Array.from(activePlayers.entries())
          .sort((a, b) => {
            // Current user first
            if (a[0] === userId) return -1;
            if (b[0] === userId) return 1;
            // Then by bet amount (descending)
            return (b[1].amount || 0) - (a[1].amount || 0);
          });
        
        if (sortedPlayers.length === 0) {
          playersEl.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--cr-text-dim); font-size: 13px;">
              No active players yet
            </div>
          `;
          return;
        }
        
        playersEl.innerHTML = sortedPlayers.map(([id, player]) => {
          const isCurrentUser = id === userId;
          const icon = player.currency === 'stars' ? ICON_STAR : ICON_TON;
          
          let statusHTML = '';
          let amountClass = '';
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
              amountClass = 'is-green';
            } else {
              const currentValue = (player.amount * state.displayMult).toFixed(player.currency === 'stars' ? 0 : 2);
              statusHTML = `
                <div class="crash-amount__top">
                  <img class="crash-ico" src="${icon}" alt="" />
                  ${currentValue}
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
              amountClass = 'is-green';
            } else {
              statusHTML = `
                <div class="crash-amount__top is-red">
                  <img class="crash-ico" src="${icon}" alt="" />
                  0
                </div>
                <div class="crash-amount__sub">Lost</div>
              `;
              amountClass = 'is-red';
            }
          }
          
          const avatarHTML = player.avatar 
            ? `<img src="${player.avatar}" alt="" />`
            : `<span style="font-size: 16px;">👤</span>`;
          
          return `
            <div class="${traderClass}">
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
  
      function sampleCrashPoint() {
        const r = (Math.floor(Math.random() * 1_000_000) + 1) / 1_000_000;
        const y = Math.max(1, (1 - HOUSE_EDGE) / r);
        return Math.min(MAX_MULT, y);
      }
  
      function roundToCurrency(val, currency) {
        if (currency === "stars") return Math.max(0, Math.trunc(val));
        return Math.max(0, Math.round(val * 100) / 100);
      }
  
      function uiBetAmount() {
        const btn = amountRow?.querySelector(".crash-pill.is-active");
        const v = btn?.getAttribute("data-amt") || "0.5";
        if (v === "max") {
          const top = qs("#tonAmount");
          const cur = detectCurrency();
          const bal = parseNumber(top?.textContent || "0");
          return cur === "stars" ? Math.floor(bal) : bal;
        }
        return Number(v) || 0;
      }
  
      function renderPills() {
        const currency = detectCurrency();
        const icon = currencyIcon(currency);
  
        betIconEl && betIconEl.setAttribute("src", icon);
  
        amountRow?.querySelectorAll(".crash-pill").forEach((b) => {
          const v = b.getAttribute("data-amt") || "";
          if (v === "max") {
            b.innerHTML = `<span class="crash-pill__v">Max</span>`;
          } else {
            b.innerHTML = `<img class="crash-ico" src="${icon}" alt="" /><span class="crash-pill__v">${v}</span>`;
          }
        });
  
        const amt = uiBetAmount();
        if (betTextEl) betTextEl.textContent = `Bet: ${amt}`;
      }
  
      function setActivePill(btn) {
        amountRow?.querySelectorAll(".crash-pill").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        const amt = uiBetAmount();
        if (betTextEl) betTextEl.textContent = `Bet: ${amt}`;
      }
  
      amountRow?.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("button[data-amt]");
        if (!btn) return;
        if (state.bet && !state.bet.claimed) {
          setStatus("Bet already placed");
          return;
        }
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
  
        buyBtn.textContent = "Buy";
      }
  
      function resetToBetting(now) {
        state.phase = "betting";
        state.phaseStart = now;
        state.candles.length = 0;
        state.lastCandleAt = 0;
      
        state.trueMult = 1.0;
        state.visMult = 1.0;
        state.displayMult = state.displayMult || 1.0;
        state.crashPoint = sampleCrashPoint();
      
        state.roundId = (state.roundId || 0) + 1;
        state.bet = null;
        // Clear all players for new round
        activePlayers.clear();
            
        // СКРЫВАЕМ надпись 1.00x во время обратного отсчёта
        if (multEl) multEl.style.display = 'none';
        
        setStatus("Waiting…");
        setBuyMode("buy");
      
        const card = document.querySelector('.crash-card');
        if (card) card.classList.remove('is-crashed');
      
        renderPills();
        renderPlayers();
        refreshTopBalance();
      }

  
      function startRun(now) {
        state.phase = "run";
        state.phaseStart = now;
        setStatus("Running…");
        setTimer(0, false);
        
        // ПОКАЗЫВАЕМ надпись обратно при старте раунда
        if (multEl) multEl.style.display = 'block';
      
        if (state.bet && !state.bet.claimed) setBuyMode("claim");
        else setBuyMode("buy");
      }
  
      function triggerCrash(now) {
        state.phase = "crash";
        state.crashStart = now;
        state.crashFrom = state.trueMult;
      
        crashHistory.push(state.crashFrom);
        if (crashHistory.length > MAX_HISTORY) {
          crashHistory.shift();
        }
        renderHistory();
      
        if (state.bet && !state.bet.claimed) {
          setStatus("CRASH! Lost");
          setBuyMode("lost");
        } else if (state.bet && state.bet.claimed) {
          setStatus("CRASH!" );
          setBuyMode("claimed");
        } else {
          setStatus("CRASH!");
          setBuyMode("buy");
        }
      
        setMult(state.crashFrom, "red");
        
        const card = document.querySelector('.crash-card');
        if (card) card.classList.add('is-crashed');
      }

      function enterWait(now) {
        state.phase = "wait";
        state.phaseStart = now;
        setMult(0, "red");
      }
  
      function addCandle() {
        const m = Math.max(1, state.trueMult);
        const baseRate = 0.008 + 0.002 * Math.log10(m + 1);
        const variance = Math.random() * 0.003;
        const rate = baseRate + variance;
        state.trueMult = Math.min(MAX_MULT, m * (1 + rate));
      
        const prevClose = state.candles.length ? state.candles[state.candles.length - 1].close : 1.0;
      
        const target = state.trueMult;
        const drift = (target - prevClose) * 0.82;
        const dip = Math.random() < 0.08;
      
        let close = prevClose + drift + (Math.random() - 0.5) * (0.008 + target * 0.0005);
        if (dip) {
          close = prevClose - (0.01 + Math.random() * 0.025) * (1 + target * 0.005);
        }
      
        close = clamp(close, 0.995, Math.min(target, MAX_MULT));
      
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
          
          state.visMult = close;
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
  
        let maxV = Math.max(2.0, ...highs, state.trueMult * 1.15);
        maxV = Math.min(MAX_MULT, maxV);
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
          const fromY = yOf(state.crashFrom);
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
  
      function roundRect(ctx2, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx2.moveTo(x + rr, y);
        ctx2.arcTo(x + w, y, x + w, y + h, rr);
        ctx2.arcTo(x + w, y + h, x, y + h, rr);
        ctx2.arcTo(x, y + h, x, y, rr);
        ctx2.arcTo(x, y, x + w, y, rr);
        ctx2.closePath();
      }
  
      async function placeBet() {
        const currency = detectCurrency();
        renderPills();
  
        if (state.phase !== "betting") {
          setStatus("Wait next round");
          return;
        }
        if (state.bet) {
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
          const roundId = `crash_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  
          await apiDeposit({
            amount: -rounded,
            currency,
            type: "bet",
            roundId,
            depositId: `crash_bet_${getUserId()}_${roundId}`
          });
  
          state.bet = {
            amount: rounded,
            currency,
            roundId,
            claimed: false,
            claimMult: null,
            payout: 0
          };
          
          // Add current user to players list
          const userId = getUserId();
          const tg = window.Telegram?.WebApp;
          const user = tg?.initDataUnsafe?.user;
          
          activePlayers.set(userId, {
            name: user?.first_name || user?.username || `Player ${userId.slice(0, 6)}`,
            avatar: user?.photo_url || null,
            amount: rounded,
            currency,
            claimed: false,
            claimMult: null
          });
          
          setStatus("Bet placed");
          setBuyMode("buy");
          
          if (state.phase === "run") setBuyMode("claim");
          
          renderPlayers();
          await refreshTopBalance();


        } catch (e) {
          setStatus(`Bet failed: ${e.message}`);
          setBuyMode("buy");
        } finally {
          state.actionLock = false;
        }
      }
  
      async function claim() {
        if (!state.bet || state.bet.claimed) return;
        if (state.phase !== "run") {
          setStatus("Can't claim now");
          return;
        }
  
        state.actionLock = true;
        setBuyMode("locked");
  
        const currency = state.bet.currency;
        const mult = clamp(state.trueMult, 1, MAX_MULT);
        const payoutRaw = state.bet.amount * mult;
        const payout = roundToCurrency(payoutRaw, currency);
  
        setStatus(`Claiming ${formatX(mult)}…`);
  
        try {
          await apiDeposit({
            amount: payout,
            currency,
            type: "crash_win",
            roundId: state.bet.roundId,
            depositId: `crash_win_${getUserId()}_${state.bet.roundId}`
          });
  
          state.bet.claimed = true;
          state.bet.claimMult = mult;
          state.bet.payout = payout;

          // Update player in list
            const userId = getUserId();
            const player = activePlayers.get(userId);
            if (player) {
            player.claimed = true;
            player.claimMult = mult;
            }

            setStatus(`Claimed: ${payout}`);
            setBuyMode("claimed");

            renderPlayers();
  
        
  
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
        if (state.bet && !state.bet.claimed) {
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
  
      function isActive() {
        return true;
      }
  
      function loop(now) {
        if (!running) return;
  
        if (!state.phaseStart) state.phaseStart = now;
        if (!state.lastCandleAt) state.lastCandleAt = now;
  
        if (state.phase === "betting") {
            const lerpSpeed = 0.12;
            state.displayMult += (1.0 - state.displayMult) * lerpSpeed;
            
            const elapsed = now - state.phaseStart;
            const remaining = Math.max(0, BETTING_MS - elapsed);
            const seconds = Math.ceil(remaining / 1000);
            setTimer(seconds, true);

            const timerEl = document.getElementById('crashTimer');
            if (timerEl) {
              if (seconds <= 3) {
                timerEl.classList.add('is-urgent');
              } else {
                timerEl.classList.remove('is-urgent');
              }
            }
            
            if (elapsed >= BETTING_MS) {
              startRun(now);
            }
          }
        
  
        if (state.phase === "run") {
            if (state.bet && !state.bet.claimed) setBuyMode(state.actionLock ? "locked" : "claim");
            else setBuyMode(state.actionLock ? "locked" : "buy");
          
            if (now - state.lastCandleAt >= state.candleMs) {
              state.lastCandleAt = now;
              addCandle();
          
              if (state.trueMult >= state.crashPoint) {
                triggerCrash(now);
              }
            }
          
            const lerpSpeed = 0.08;
            state.displayMult += (state.trueMult - state.displayMult) * lerpSpeed;
            setMult(state.displayMult, "green");
            // Update players display in real-time
            renderPlayers();
        }
  
        if (state.phase === "crash") {
            setMult(state.crashFrom, "red");
            if (now - state.crashStart >= CRASH_DROP_MS) {
              enterWait(now);
            }
          }
          
          if (state.phase === "wait") {
            setMult(state.crashFrom, "red");
            if (now - state.phaseStart >= WAIT_AFTER_CRASH_MS) {
              resetToBetting(now);
            }
          }
  
        draw();
        raf = requestAnimationFrame(loop);
      }
  
      function easeInCubic(t) {
        return t * t * t;
      }
  
      function start() {
        if (running) return;
        running = true;
        resize();
        renderPills();
        resetToBetting(performance.now());
        raf = requestAnimationFrame(loop);
      }
  
      function stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
  
      // Игра запускается один раз и работает всегда
       
  
      return { start, stop };
    }
  
    // Запуск игры при загрузке страницы
    
    // Запуск игры при загрузке страницы
    
    function boot() {
        const page = ensureCrashPage();
        const engine = createEngine(page);
        engine.start();
    }
    
    // Запускаем игру при загрузке DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  
  })();