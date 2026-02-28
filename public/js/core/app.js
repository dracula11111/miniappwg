// public/js/app.js
(() => {
  // Telegram bootstrap
  const tg = window.Telegram?.WebApp;
  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {}

  // Disable Telegram haptics globally while keeping existing calls safe.
  try {
    if (tg) {
      const noop = () => {};
      const haptic = tg.HapticFeedback || {};
      haptic.impactOccurred = noop;
      haptic.notificationOccurred = noop;
      haptic.selectionChanged = noop;
      tg.HapticFeedback = haptic;
    }
  } catch {}

  // Простые утилы
  function crc16Xmodem(bytes){
    let crc=0xffff;
    for (const b of bytes){
      crc^=(b<<8);
      for(let i=0;i<8;i++){
        crc=(crc&0x8000)?((crc<<1)^0x1021):(crc<<1);
        crc&=0xffff;
      }
    }
    return crc;
  }

  function rawToFriendly(raw,{bounceable=true,testOnly=false}={}) {
    const m = raw?.match?.(/^(-?\d+):([a-fA-F0-9]{64})$/);
    if(!m) return raw||"";
    const wc = parseInt(m[1],10);
    const hash = Uint8Array.from(m[2].match(/.{2}/g).map(h=>parseInt(h,16)));
    const tag = (bounceable?0x11:0x51) | (testOnly?0x80:0);
    const body=new Uint8Array(34); body[0]=tag; body[1]=(wc&0xff); body.set(hash,2);
    const crc=crc16Xmodem(body); const out=new Uint8Array(36);
    out.set(body,0); out[34]=(crc>>8)&0xff; out[35]=crc&0xff;
    let s=btoa(String.fromCharCode(...out));
    return s.replace(/\+/g,"-").replace(/\//g,"_");
  }

  const ensureFriendly = (addr,opts) => !addr ? "" : (/^[UE]Q/.test(addr) ? addr : rawToFriendly(addr,opts));
  const shortAddr = (addr) => addr ? `${addr.slice(0,4)}…${addr.slice(-4)}` : "Not connected";

  // Глобальчик с утилитами и простым “event bus”
  window.WT = window.WT || {};
  WT.utils = { crc16Xmodem, rawToFriendly, ensureFriendly, shortAddr };
  WT.bus   = new EventTarget();

  // ===== Global liquid-glass notifications =====
  const TOAST_HOST_ID = 'wt-toast-host';
  let toastTimer = null;

  function ensureToastHost() {
    let host = document.getElementById(TOAST_HOST_ID);
    if (host) return host;

    host = document.createElement('div');
    host.id = TOAST_HOST_ID;
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
    return host;
  }

  function showLiquidToast(message, opts = {}) {
    const text = String(message ?? '').trim();
    if (!text) return;

    const ttl = Number.isFinite(Number(opts.ttl)) ? Math.max(1000, Number(opts.ttl)) : 2600;
    const host = ensureToastHost();
    const variant = String(opts.variant || '').trim();

    host.classList.remove('wt-toast--market');
    if (variant === 'market') host.classList.add('wt-toast--market');

    host.textContent = text;
    host.classList.remove('is-out');
    host.classList.add('is-in');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      host.classList.remove('is-in');
      host.classList.add('is-out');
    }, ttl);

    return true;
  }

  window.showToast = showLiquidToast;
  window.notify = (message, opts) => showLiquidToast(message, opts);

  const nativeAlert = typeof window.alert === 'function' ? window.alert.bind(window) : null;
  window.alert = (message) => {
    const shown = showLiquidToast(message);
    if (!shown && nativeAlert) nativeAlert(message);
  };


  // ===== Games hub =====
  const GAMES_PAGE_ID = "gamesPage";
  const PAGE_HISTORY_KEY = "__wtPage";
  const GAMES_CHILD_PAGES = new Set(["wheelPage", "crashPage", "casesPage"]);

  // какие страницы считаем "внутри Games" (в навбаре подсвечиваем Games)
  const NAV_ALIAS = {
    crashPage: GAMES_PAGE_ID,
    casesPage: GAMES_PAGE_ID,
    wheelPage: GAMES_PAGE_ID
  };
  const navKeyForPage = (id) => NAV_ALIAS[id] || id;
  const getActivePageId = () => document.querySelector(".page.page-active")?.id || null;
  const readHistoryPage = (state = window.history?.state) => {
    const id = state?.[PAGE_HISTORY_KEY];
    return (typeof id === "string" && id) ? id : null;
  };

  function writeHistoryPage(id, { replace = false } = {}) {
    if (!id || !window.history) return;

    const baseState = (window.history.state && typeof window.history.state === "object")
      ? window.history.state
      : {};
    const nextState = { ...baseState, [PAGE_HISTORY_KEY]: id };

    try {
      if (replace && typeof window.history.replaceState === "function") {
        window.history.replaceState(nextState, "", window.location.href);
      } else if (!replace && typeof window.history.pushState === "function") {
        window.history.pushState(nextState, "", window.location.href);
      }
    } catch {}
  }


  function ensureGamesPage() {
    let page = document.getElementById(GAMES_PAGE_ID);
    if (page) return page;

    page = document.createElement("main");
    page.id = GAMES_PAGE_ID;
    page.className = "page";

    page.innerHTML = `
      <section class="games">
        <header class="games__head">
          <h1 class="games__title">Games</h1>
        </header>

        <div class="games-grid">
          <button class="game-tile game-tile--wheel" type="button" data-go="wheelPage" aria-label="Open Wheel">
            
          </button>

          <button class="game-tile game-tile--crash" type="button" data-go="crashPage" aria-label="Open Crash">
           
          </button>

          <button class="game-tile game-tile--cases" type="button" data-go="casesPage" aria-label="Open Cases">
            
          </button>

          <button class="game-tile game-tile--soon" type="button" disabled aria-disabled="true">
           
          </button>
        </div>
      </section>
    `;

    const appRoot = document.querySelector(".app") || document.body;
    const bottomNav = appRoot.querySelector(".bottom-nav") || document.querySelector(".bottom-nav");
    if (bottomNav) appRoot.insertBefore(page, bottomNav);
    else appRoot.appendChild(page);

    // клики по постерам -> открываем выбранную игру
    page.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-go");
        if (!target) return;
        if (!document.getElementById(target)) {
          console.warn(`[WT] Page not found: ${target}`);
          return;
        }
        activatePage(target);
      });
    });

    return page;
  }

  // Навигация между страницами
  function activatePage(id, options = {}){
    const { fromHistory = false } = options;
    const pg = document.getElementById(id);
    if (!pg) {
      console.warn(`[WT] Page not found: ${id}`);
      return;
    }

    const currentId = getActivePageId();

    if (
      !fromHistory &&
      id === GAMES_PAGE_ID &&
      GAMES_CHILD_PAGES.has(currentId) &&
      readHistoryPage() === currentId &&
      typeof window.history?.back === "function"
    ) {
      window.history.back();
      return;
    }

    document.querySelectorAll(".page").forEach(p=>p.classList.remove("page-active"));
    pg.classList.add("page-active");

    // выставляем класс страницы на body (для page-specific CSS)
    // пример: wheelPage -> body.page-wheel
    try {
      const body = document.body;
      // удаляем старые page-* классы
      body.className = body.className
        .split(/\s+/)
        .filter(c => c && !c.startsWith('page-'))
        .join(' ');

      const pageKey = String(id)
        .replace(/Page$/,'')
        .replace(/Page/i,'')
        .toLowerCase();
      body.classList.add(`page-${pageKey}`);
    } catch {}

    // nav highlight (Crash/Cases/Wheel -> Games)
    const navKey = navKeyForPage(id);
    document.querySelectorAll(".bottom-nav .nav-item").forEach(i=>i.classList.remove("active"));
    document.querySelector(`.bottom-nav .nav-item[data-target="${navKey}"]`)?.classList.add("active");

    if (!fromHistory) {
      const shouldPush = GAMES_CHILD_PAGES.has(id);
      const currentHistoryPage = readHistoryPage();

      if (shouldPush) {
        if (currentHistoryPage !== id) {
          writeHistoryPage(id, { replace: false });
        }
      } else if (currentHistoryPage !== id || currentId == null) {
        writeHistoryPage(id, { replace: true });
      }
    }

    WT.bus.dispatchEvent(new CustomEvent("page:change", { detail:{ id } }));
  }

  // Экспортируем навигацию (чтобы другие модули могли дергать при необходимости)
  WT.activatePage = activatePage;
  WT.navigate = activatePage;

  window.addEventListener("popstate", (event) => {
    const targetId = readHistoryPage(event.state);
    if (targetId && document.getElementById(targetId)) {
      activatePage(targetId, { fromHistory: true });
      return;
    }

    const currentId = getActivePageId();
    if (GAMES_CHILD_PAGES.has(currentId) && document.getElementById(GAMES_PAGE_ID)) {
      activatePage(GAMES_PAGE_ID, { fromHistory: true });
      writeHistoryPage(GAMES_PAGE_ID, { replace: true });
    }
  });

  // Делегируем клики по нижней навигации (так работает и для динамически добавленных пунктов)
  const bottomNav = document.querySelector(".bottom-nav");
  bottomNav?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".nav-item");
    if (!btn || !bottomNav.contains(btn)) return;

    // если нав-айтем — ссылка, не даём браузеру прыгать по href
    try {
      const tag = String(btn.tagName || "").toUpperCase();
      if (tag === "A" || btn.getAttribute("href")) e.preventDefault();
    } catch {}

    const target = btn.getAttribute("data-target");
    if (target) activatePage(target);
  });

  // Создаём Games-хаб и пункт в навбаре (если его ещё нет)
  ensureGamesPage();

  // Если при старте нет активной — активируем Games (или первую)
  if(!document.querySelector(".page.page-active")){
    const games = document.getElementById(GAMES_PAGE_ID);
    if (games) activatePage(GAMES_PAGE_ID);
    else {
      const first = document.querySelector(".page");
      if(first) activatePage(first.id);
    }
  }
})();
