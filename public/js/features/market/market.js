(() => {
  'use strict';

  // =========================
  // Config
  // =========================
  const STORAGE_KEY = 'wg_market_gifts_v1';

  const ICONS = {
    sticker: '/icons/market.webp',
    arrowUp: '/icons/up.svg',
    arrowDown: '/icons/down.svg',
    tonWhite: '/icons/tgTonWhite.svg',
    starWhite: '/icons/tgStarWhite.svg'
  };

  const CARD_BACKGROUNDS = [
    '#b8862e',
    '#2a6bb0',
    '#2a7b70',
    '#3a9a4b',
    '#6a5fa7',
    '#a54b46'
  ];

  const PLACEHOLDER_IMG = svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity=".28"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity=".08"/>
        </linearGradient>
      </defs>
      <rect x="12" y="12" width="196" height="196" rx="44" fill="url(#g)"/>
      <g fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
        <path d="M70 108h80"/>
        <path d="M86 94c0-18 12-30 24-30s24 12 24 30"/>
        <path d="M74 108v44c0 12 10 22 22 22h48c12 0 22-10 22-22v-44"/>
        <path d="M110 108v66"/>
      </g>
    </svg>`
  );

  const DEFAULT_GIFTS = [
    { id: 'g1', name: 'Gift 1', number: '442,514', image: '/images/gifts/marketnfts/test.jpg', priceTon: 650 },
    { id: 'g2', name: 'Gift 2', number: '469,447', image: PLACEHOLDER_IMG, priceTon: 720 },
    { id: 'g3', name: 'Gift 3', number: '445,825', image: PLACEHOLDER_IMG, priceTon: 723 },
    { id: 'g4', name: 'Gift 4', number: '371,570', image: PLACEHOLDER_IMG, priceTon: 725 },
    { id: 'g5', name: 'Gift 5', number: '128,010', image: PLACEHOLDER_IMG, priceTon: 560 },
    { id: 'g6', name: 'Gift 6', number: '999,999', image: PLACEHOLDER_IMG, priceTon: 810 }
  ];

  // =========================
  // State
  // =========================
  const state = {
    gifts: [],
    pricesMap: new Map(),
    sortDir: 'desc',
    currency: 'ton'
  };

  // =========================
  // Init
  // =========================
  ready(initMarket);

  async function initMarket() {
    const page = ensureMarketPage();
    if (!page) return;

    // Wire UI
    const giftsPill = page.querySelector('#marketPillGifts');
    const pricePill = page.querySelector('#marketPillPrice');

    if (giftsPill) {
      giftsPill.addEventListener('click', () => {
        giftsPill.classList.toggle('is-open');
      });
    }

    if (pricePill) {
      setSortPillState(pricePill, state.sortDir);
      pricePill.addEventListener('click', () => {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        setSortPillState(pricePill, state.sortDir);
        renderMarket();
      });
    }

    // Load gifts
    state.gifts = await loadGifts();

    // Detect currency + listen changes
    state.currency = getCurrency();
    attachCurrencyListeners();

    // Load prices from server cache (optional)
    state.pricesMap = await fetchGiftsPricesCache();

    // Try to hydrate missing prices from portals (optional)
    await hydrateMissingPricesFromPortals(state.gifts);

    renderMarket();
  }

  // =========================
  // DOM building
  // =========================
  function ensureMarketPage() {
    let page = document.getElementById('marketPage');

    if (!page) {
      // If the page is missing, create it automatically.
      page = document.createElement('main');
      page.id = 'marketPage';
      page.className = 'page market-page';

      const insertBefore =
        document.getElementById('tasksPage') ||
        document.getElementById('profilePage') ||
        document.querySelector('.bottom-nav') ||
        null;

      if (insertBefore && insertBefore.parentNode) {
        insertBefore.parentNode.insertBefore(page, insertBefore);
      } else {
        document.body.appendChild(page);
      }
    }

    page.classList.add('market-page');

    if (!page.querySelector('.market-shell')) {
      page.innerHTML = buildMarketTemplate();
    }

    return page;
  }

  function buildMarketTemplate() {
    return `
      <div class="market-shell">
        <header class="market-head">
          <div class="market-title">
            <span class="market-title__text">Market</span>
            <img class="market-title__sticker" src="${ICONS.sticker}" alt="">
          </div>
        </header>

        <div class="market-controls">
          <button id="marketPillGifts" class="market-pill market-pill--left" type="button">
            <span>gifts</span>
            <span class="market-caret" aria-hidden="true"></span>
          </button>

          <button id="marketPillPrice" class="market-pill market-pill--right" type="button">
            <span>price</span>
            <span class="market-arrows" aria-hidden="true">
              <img class="market-arrow market-arrow--up" src="${ICONS.arrowUp}" alt="">
              <img class="market-arrow market-arrow--down" src="${ICONS.arrowDown}" alt="">
            </span>
          </button>
        </div>

        <div id="marketGrid" class="market-grid" aria-label="Gifts"></div>
      </div>
    `;
  }

  function setSortPillState(pillEl, dir) {
    pillEl.dataset.sort = dir; // to match CSS
    pillEl.classList.toggle('is-asc', dir === 'asc');
    pillEl.classList.toggle('is-desc', dir === 'desc');
  }

  // =========================
  // Render
  // =========================
  function renderMarket() {
    const page = document.getElementById('marketPage');
    if (!page) return;

    // Refresh currency at render-time (in case other scripts updated it)
    state.currency = getCurrency();

    const grid = page.querySelector('#marketGrid');
    if (!grid) return;

    const list = [...(state.gifts || [])];

    // Fill prices for sorting (use cache, then item, then null)
    for (const g of list) {
      const p = resolvePriceTon(g);
      g.__sortPrice = Number.isFinite(p) ? p : null;
    }

    // Sort
    list.sort((a, b) => {
      const pa = a.__sortPrice;
      const pb = b.__sortPrice;

      // Unknown prices go last
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;

      return state.sortDir === 'asc' ? pa - pb : pb - pa;
    });

    grid.innerHTML = '';

    if (!list.length) {
      grid.innerHTML = `<div class="market-empty">No gifts yet.</div>`;
      return;
    }

    for (let i = 0; i < list.length; i++) {
      const gift = list[i];
      const card = buildGiftCard(gift, i);
      grid.appendChild(card);
    }
  }

  function buildGiftCard(gift, index) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'market-card';

    // keep existing background palette (fallback)
    btn.style.setProperty('--card-bg', CARD_BACKGROUNDS[index % CARD_BACKGROUNDS.length]);

    const tg = gift?.tg && typeof gift.tg === 'object' ? gift.tg : null;
    const backdrop = tg?.backdrop || null;

    // Collectible backdrop -> override background with Telegram colors
    if (backdrop && (backdrop.center || backdrop.edge)) {
      btn.classList.add('is-collectible');
      if (backdrop.center) btn.style.setProperty('--bg-center', backdrop.center);
      if (backdrop.edge) btn.style.setProperty('--bg-edge', backdrop.edge);
      if (backdrop.patternColor) btn.style.setProperty('--pattern-color', backdrop.patternColor);
      if (backdrop.textColor) btn.style.setProperty('--backdrop-text', backdrop.textColor);
    }

    btn.dataset.id = String(gift.id || '');

    const number = safeText(gift.number, 32);
    const price = resolvePriceTon(gift);

    // 1) Берём картинки через safeImg (data: не режем)
      const modelImg = safeImg(tg?.model?.image);
      const giftImg  = safeImg(gift?.image);
      const imgSrc   = modelImg || giftImg || PLACEHOLDER_IMG;

      const patternSrc = safeImg(tg?.pattern?.image) || '';

      // 2) Для CSS url лучше НЕ вставлять через '...' (может сломаться на кавычках/скобках)
      // Минимально безопасный вариант: encodeURI + двойные кавычки
      const patternUrl = patternSrc ? encodeURI(patternSrc) : '';

      const patternLayer = patternUrl
        ? `<div class="market-card__pattern"
              style='--pattern-mask:url("${patternUrl}"); background-image:url("${patternUrl}")'></div>`
        : '';


    if (imgSrc && imgSrc !== PLACEHOLDER_IMG) {
      btn.classList.add('has-image');
    }

    btn.innerHTML = `
    <div class="market-card__num"><span>#${escapeHtml(number || '—')}</span></div>
    ${patternLayer}
    <div class="market-card__imgWrap">
      <img class="market-card__img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(gift?.name || '')}" draggable="false">
    </div>
    <div class="market-card__pricePill">
      <img class="market-card__priceIcon" src="${escapeHtml(currencyIconPath(state.currency))}" alt="">
      <span>${formatPrice(price)}</span>
    </div>
  `;

    // Placeholder click behavior (swap later)
    btn.addEventListener('click', () => {
      btn.classList.toggle('is-selected');
    });

    return btn;
  }


  // =========================
  // Currency
  // =========================
  function attachCurrencyListeners() {
    // 1) If your app dispatches events
    window.addEventListener('currency:change', onCurrencyMaybeChanged);
    document.addEventListener('currency:change', onCurrencyMaybeChanged);
    window.addEventListener('wg:currency', onCurrencyMaybeChanged);

    // 2) Storage changes (rare in WebView but safe)
    window.addEventListener('storage', (e) => {
      if (!e || !e.key) return;
      if (String(e.key).toLowerCase().includes('curr')) onCurrencyMaybeChanged();
    });

    // 3) Profile currency buttons
    document.addEventListener(
      'click',
      (e) => {
        const btn = e?.target?.closest?.('.curr-btn');
        if (!btn) return;
        // Let other scripts update localStorage / UI first
        setTimeout(onCurrencyMaybeChanged, 0);
      },
      true
    );
  }

  function onCurrencyMaybeChanged() {
    const next = getCurrency();
    if (next === state.currency) return;
    state.currency = next;

    // Only update icons (no need to rebuild everything)
    const page = document.getElementById('marketPage');
    if (!page) return;
    const icons = page.querySelectorAll('.market-card__priceIcon');
    const src = currencyIconPath(next);
    icons.forEach((img) => {
      img.src = src;
    });
  }

  function getCurrency() {
    // Try: active button in profile
    const activeBtn = document.querySelector('.curr-btn--active[data-currency]');
    const fromBtn = activeBtn ? String(activeBtn.dataset.currency || '').toLowerCase() : '';
    if (fromBtn === 'ton' || fromBtn === 'stars') return fromBtn;

    // Try: localStorage common keys
    const keys = ['currency', 'selectedCurrency', 'wg_currency', 'userCurrency', 'walletCurrency'];
    for (const k of keys) {
      try {
        const v = String(localStorage.getItem(k) || '').toLowerCase();
        if (v === 'ton' || v === 'stars') return v;
      } catch {
        // ignore
      }
    }

    // Try: top pill currency icon src
    const pillIcon = document.getElementById('pillCurrencyIcon');
    const src = pillIcon?.getAttribute?.('src') || '';
    if (src.includes('stars')) return 'stars';

    return 'ton';
  }

  function currencyIconPath(currency) {
    return currency === 'stars' ? ICONS.starWhite : ICONS.tonWhite;
  }

  // =========================
  // Data: load/save gifts
  // =========================
  async function fetchMarketItemsFromServer() {
    try {
      const data = await fetchJson('/api/market/items', { timeoutMs: 10000 });
      const items = Array.isArray(data)
        ? data
        : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.data) ? data.data : []));

      if (!Array.isArray(items) || !items.length) return [];
      return items.map((it, idx) => normalizeGift(it, idx)).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function loadGifts() {
    // 1) server market (чтобы подарки появлялись автоматически)
    const fromServer = await fetchMarketItemsFromServer();
    if (fromServer.length) return fromServer.slice(0, 6);

    // 2) localStorage fallback
    return loadGiftsLocal();
  }

  function loadGiftsLocal() {
    const raw = safeStorageGet(STORAGE_KEY);
    if (!raw) return DEFAULT_GIFTS.slice(0, 6);

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_GIFTS.slice(0, 6);

      const cleaned = parsed
        .map((g, idx) => normalizeGift(g, idx))
        .filter(Boolean)
        .slice(0, 6);

      return cleaned.length ? cleaned : DEFAULT_GIFTS.slice(0, 6);
    } catch {
      return DEFAULT_GIFTS.slice(0, 6);
    }
  }

  function saveGifts(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  function normalizeGift(g, idx) {
    if (!g || typeof g !== 'object') return null;

    const id = safeText(g.id, 64) || `g${idx + 1}`;
    const name = safeText(g.name, 64) || `Gift ${idx + 1}`;
    const number = safeText(g.number, 32) || '';

    const tg = (g.tg && typeof g.tg === 'object') ? g.tg : null;

    // image can be:
    //  - data:image/... (from relayer when INLINE_IMAGES=1)
    //  - /images/... (when relayer and server are on same machine)
    //  - fallback placeholder
    const image = safeText(g.image, 220000) ||
      safeText(tg?.model?.image, 220000) ||
      PLACEHOLDER_IMG;

    const priceTon = toFiniteNumber(g.priceTon);
    const createdAt = toFiniteNumber(g.createdAt ?? g.created_at);

    return {
      id,
      name,
      number,
      image,
      priceTon: Number.isFinite(priceTon) ? priceTon : null,
      createdAt: Number.isFinite(createdAt) ? createdAt : null,
      tg
    };
  }


  // =========================
  // Prices
  // =========================
  function resolvePriceTon(gift) {
    // 1) item-specific price
    const pLocal = toFiniteNumber(gift?.priceTon);
    if (Number.isFinite(pLocal) && pLocal > 0) return pLocal;

    // 2) server cache
    const key = normalizeKey(gift?.name);
    if (key && state.pricesMap.has(key)) return state.pricesMap.get(key);

    return null;
  }

  async function fetchGiftsPricesCache() {
    const map = new Map();
    try {
      const data = await fetchJson('/api/gifts/prices', { timeoutMs: 8000 });
      const items = Array.isArray(data?.items) ? data.items : [];
      for (const it of items) {
        const nm = normalizeKey(it?.name);
        const price = toFiniteNumber(it?.priceTon ?? it?.price_ton ?? it?.price);
        if (nm && Number.isFinite(price) && price > 0) {
          map.set(nm, price);
        }
      }
    } catch {
      // ignore
    }
    return map;
  }

  async function hydrateMissingPricesFromPortals(list) {
    const missing = (Array.isArray(list) ? list : []).filter((g) => {
      const p = resolvePriceTon(g);
      return !Number.isFinite(p) && !!safeText(g?.name);
    });

    // Keep this light: max 3 requests, sequential
    const todo = missing.slice(0, 3);

    for (const g of todo) {
      const price = await fetchPriceFromPortals(g.name);
      if (Number.isFinite(price) && price > 0) {
        g.priceTon = price;
      }
      await sleep(120);
    }

    // Persist if we updated anything
    if (todo.some((g) => Number.isFinite(g.priceTon))) {
      saveGifts(state.gifts);
    }
  }

  // NOTE: expects your backend route. If route is missing, returns null.
  async function fetchPriceFromPortals(name) {
    const q = safeText(name, 80);
    if (!q) return null;

    try {
      const url = `/api/gifts/portals-search?q=${encodeURIComponent(q)}`;
      const data = await fetchJson(url, { timeoutMs: 9000 });

      const cols = Array.isArray(data?.collections)
        ? data.collections
        : Array.isArray(data?.items)
          ? data.items
          : [];

      if (!cols.length) return null;

      // Best guess: pick first, read floor
      const best = cols[0];
      const floorRaw = best?.floor_price ?? best?.floorPrice ?? best?.floor ?? null;
      const price = toFiniteNumber(floorRaw);
      if (!Number.isFinite(price) || price <= 0) return null;

      return price;
    } catch {
      return null;
    }
  }

  // =========================
  // Upload script (dev)
  // =========================
  // Console usage:
  //   marketAddGift();
  //   marketResetGifts();
  //
  // You can also call:
  //   marketAddGift({ name, number, imageUrl });
  window.marketAddGift = async function marketAddGift(opts = {}) {
    const name = safeText(opts.name) || prompt('Gift name (for portals search)?', 'Gift');
    if (!name) return;

    const number = safeText(opts.number) || prompt('Gift number (without #)?', '123,456') || '';

    let imageUrl = safeText(opts.imageUrl);

    // If not provided, pick a file and store as dataURL
    if (!imageUrl) {
      const file = await pickImageFile();
      if (file) {
        imageUrl = await readFileAsDataUrl(file);
      }
    }

    const id = `g_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;

    const newGift = {
      id,
      name,
      number,
      image: imageUrl || PLACEHOLDER_IMG,
      priceTon: null
    };

    // Pull price from portals (as requested)
    const p = await fetchPriceFromPortals(name);
    if (Number.isFinite(p) && p > 0) newGift.priceTon = p;

    const list = loadGiftsLocal();
    list.unshift(newGift);

    // Keep exactly 6
    state.gifts = list.slice(0, 6);
    saveGifts(state.gifts);

    renderMarket();
  };

  window.marketResetGifts = function marketResetGifts() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    state.gifts = DEFAULT_GIFTS.slice(0, 6);
    renderMarket();
  };

  // =========================
  // Helpers
  // =========================
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function safeText(v, max = 9999) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    return s.length > max ? s.slice(0, max) : s;
  }
  function safeImg(v, maxUrl = 4096) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    if (s.startsWith('data:')) return s; // НЕ режем base64
    return s.length > maxUrl ? s.slice(0, maxUrl) : s;
  }
  

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function toFiniteNumber(v) {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeKey(v) {
    return safeText(v, 120).toLowerCase();
  }

  function formatPrice(v) {
    if (!Number.isFinite(v)) return '—';

    // Keep it readable: no trailing zeros for ints
    const isInt = Math.abs(v - Math.round(v)) < 1e-9;
    if (isInt) return String(Math.round(v));

    // 2 decimals max
    return String(Math.round(v * 100) / 100);
  }

  function escapeHtml(str) {
    const s = String(str ?? '');
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function cacheBust(url, seed) {
    const u = String(url || "");
    if (!u) return "";
    if (u.startsWith("data:")) return u;
    // if already has query string - keep it
    if (u.includes("?")) return u;
    const v = encodeURIComponent(String(seed || Date.now()));
    return `${u}?v=${v}`;
  }


  async function fetchJson(url, { timeoutMs = 8000 } = {}) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;

    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        signal: ctrl ? ctrl.signal : undefined,
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function pickImageFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files && input.files[0] ? input.files[0] : null;
        resolve(file);
      };
      input.click();
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  function svgDataUri(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
})();
