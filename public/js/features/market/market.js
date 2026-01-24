(() => {
  'use strict';

  // =========================
  // Config
  // =========================
  const STORAGE_KEY = 'wg_market_gifts_v1';

  // Server-backed market (relayer)
  const MARKET_LIMIT = 6;            // always show 6 cards (3x2)
  const MARKET_POLL_MS = 6000;       // auto-refresh from server
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
    { id: 'g1', name: 'Gift 1', number: '414', image: '/images/gifts/marketnfts/test.jpg', priceTon: 650 },
    { id: 'g2', name: 'Gift 2', number: '469,447', image: '/images/gifts/marketnfts/test1.jpg', priceTon: 720 },
    { id: 'g3', name: 'Gift 3', number: '445,825', image: '/images/gifts/marketnfts/test2.jpg', priceTon: 723 },
    { id: 'g4', name: 'Gift 4', number: '371,570', image: '/images/gifts/marketnfts/test3.jpg', priceTon: 725 },
    { id: 'g5', name: 'Gift 5', number: '128,010', image: '/images/gifts/marketnfts/test4.jpg', priceTon: 560 },
    { id: 'g6', name: 'Gift 6', number: '999,999', image: '/images/gifts/marketnfts/test5.jpg', priceTon: 810 }
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
        openFilterPanel();
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
    state.gifts = loadGifts();

    // Prefer server-side market list (relayer -> server)
    await refreshMarketFromServer({ silent: true });

    // Auto refresh so new gifts appear without reloading the WebApp
    setupMarketAutoRefresh();
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
  // =========================
  // Filter Panel
  // =========================
  let selectedGiftIds = new Set();

  function openFilterPanel() {
    let overlay = document.getElementById('marketFilterOverlay');
    let panel = document.getElementById('marketFilterPanel');

    if (!overlay || !panel) {
      // Create overlay
      overlay = document.createElement('div');
      overlay.id = 'marketFilterOverlay';
      overlay.className = 'market-filter-overlay';
      overlay.addEventListener('click', closeFilterPanel);

      // Create panel
      panel = document.createElement('div');
      panel.id = 'marketFilterPanel';
      panel.className = 'market-filter-panel';
      panel.innerHTML = buildFilterPanelHTML();

      document.body.appendChild(overlay);
      document.body.appendChild(panel);

      // Wire events
      wireFilterPanelEvents(panel);
    } else {
      // Update list
      const list = panel.querySelector('.market-filter-list');
      if (list) list.innerHTML = buildFilterListHTML();
      wireFilterPanelEvents(panel);
    }

    // Show
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      panel.classList.add('is-open');
    });
  }

  function closeFilterPanel() {
    const overlay = document.getElementById('marketFilterOverlay');
    const panel = document.getElementById('marketFilterPanel');

    if (overlay) overlay.classList.remove('is-open');
    if (panel) panel.classList.remove('is-open');
  }

  function buildFilterPanelHTML() {
    return `
      <div class="market-filter-header">
        <div class="market-filter-title">Gifts</div>
        <button class="market-filter-close" type="button">
          <img class="market-filter-close-icon" src="/icons/close.svg" alt="Close">
        </button>
      </div>
      <div class="market-filter-list">${buildFilterListHTML()}</div>
      <div class="market-filter-footer">
        <button class="market-filter-btn market-filter-btn--clear" type="button">Clear all</button>
        <button class="market-filter-btn market-filter-btn--show" type="button">Show results</button>
      </div>
    `;
  }

  function buildFilterListHTML() {
    const gifts = state.gifts || [];
    return gifts.map((gift) => {
      const isChecked = selectedGiftIds.has(gift.id);
      const price = resolvePriceTon(gift);
      const priceText = formatPrice(price);
      const currencyIcon = currencyIconPath(state.currency);
      
      return `
        <div class="market-filter-item ${isChecked ? 'is-checked' : ''}" data-id="${escapeHtml(gift.id)}">
          <img class="market-filter-item__icon" src="${escapeHtml(gift.image || PLACEHOLDER_IMG)}" alt="">
          <div class="market-filter-item__name">${escapeHtml(gift.name || 'Gift')}</div>
          <div class="market-filter-item__price">
            <img class="market-filter-item__price-icon" src="${escapeHtml(currencyIcon)}" alt="">
            <span>${priceText}</span>
          </div>
          <div class="market-filter-item__checkbox"></div>
        </div>
      `;
    }).join('');
  }

  function wireFilterPanelEvents(panel) {

    // Close button
    const closeBtn = panel.querySelector('.market-filter-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFilterPanel();
      });
    }

    // Item clicks
    const items = panel.querySelectorAll('.market-filter-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (!id) return;

        if (selectedGiftIds.has(id)) {
          selectedGiftIds.delete(id);
          item.classList.remove('is-checked');
        } else {
          selectedGiftIds.add(id);
          item.classList.add('is-checked');
        }
      });
    });

    // Clear all
    const clearBtn = panel.querySelector('.market-filter-btn--clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        selectedGiftIds.clear();
        items.forEach((item) => item.classList.remove('is-checked'));
      });
    }

    // Show results
    const showBtn = panel.querySelector('.market-filter-btn--show');
    if (showBtn) {
      showBtn.addEventListener('click', () => {
        closeFilterPanel();
        // TODO: apply filter to market grid
        console.log('Selected gifts:', Array.from(selectedGiftIds));
      });
    }
  }
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

    const display = list.slice(0, MARKET_LIMIT);
    while (display.length < MARKET_LIMIT) {
      const fallback = DEFAULT_GIFTS[display.length] || { id: `ph_${display.length}`, name: 'Gift', number: '', image: PLACEHOLDER_IMG, priceTon: null };
      display.push({ ...fallback, id: `ph_${display.length}_${String(fallback.id || '')}` });
    }

    grid.innerHTML = '';
    for (let i = 0; i < display.length; i++) {
      const gift = display[i];
      const card = buildGiftCard(gift, i);
      grid.appendChild(card);
    }

    wireCardImageFallbacks(grid);
  }

  function buildGiftCard(gift, index) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'market-card';
    btn.dataset.id = String(gift.id || '');
    btn.style.setProperty('--card-bg', CARD_BACKGROUNDS[index % CARD_BACKGROUNDS.length]);

    const number = safeText(gift.number, 32);
    const price = resolvePriceTon(gift);
    const imgSrc = withCacheBuster(normalizeImageUrl(gift.image || PLACEHOLDER_IMG), gift.createdAt || gift.id || index);

    if (imgSrc && imgSrc !== PLACEHOLDER_IMG) {
      btn.classList.add('has-image');
    }

    btn.innerHTML = `
      <div class="market-card__num">#${escapeHtml(number || '—')}</div>
      <div class="market-card__imgWrap">
        <img class="market-card__img" src="${escapeHtml(imgSrc)}" alt="" draggable="false" loading="lazy" decoding="async">
      </div>
      <div class="market-card__pricePill">
        <img class="market-card__currencyIcon" src="${escapeHtml(currencyIconPath(state.currency))}" alt="">
        <span class="market-card__priceText">${formatPrice(price)}</span>
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
    const icons = page.querySelectorAll('.market-card__currencyIcon'); // ← ИСПРАВЛЕНО
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

  // =========================
  // Server market sync (relayer -> server)
  // =========================
  function setupMarketAutoRefresh() {
    if (state._marketPollId) return;

    // Poll for new items (simple and reliable in Telegram WebView)
    state._marketPollId = setInterval(() => {
      refreshMarketFromServer({ silent: true });
    }, MARKET_POLL_MS);

    // Also refresh when user returns to the tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshMarketFromServer({ silent: true });
      }
    });
  }

  async function refreshMarketFromServer({ silent = false } = {}) {
    try {
      const remote = await fetchMarketItemsFromServer(MARKET_LIMIT);
      if (!Array.isArray(remote) || !remote.length) return;

      if (sameGiftIds(remote, state.gifts)) return;

      state.gifts = remote.slice(0, MARKET_LIMIT);
      saveGifts(state.gifts); // local fallback cache

      if (!silent) console.log('[Market] synced from server:', state.gifts.length);
      renderMarket();
    } catch (e) {
      // ignore (offline / route missing)
    }
  }

  async function fetchMarketItemsFromServer(limit = MARKET_LIMIT) {
    const endpoints = [
      `/api/market/items?limit=${encodeURIComponent(String(limit))}`,
      `/api/market/items/list?limit=${encodeURIComponent(String(limit))}`,
      `/api/market/items/list`,
      `/api/market/items`
    ];

    for (const url of endpoints) {
      try {
        const data = await fetchJson(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { timeoutMs: 8000 });
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        if (!items.length) continue;

        const cleaned = items
          .map((it, idx) => normalizeGift({
            id: it.id,
            name: it.name || it.title,
            number: it.number || it.num,
            image: it.image || it.img || it.icon,
            priceTon: it.priceTon ?? it.price_ton ?? it.price,
            createdAt: it.createdAt || it.ts || it.time
          }, idx))
          .filter(Boolean)
          .slice(0, limit);

        if (cleaned.length) return cleaned;
      } catch (_) {
        // try next endpoint
      }
    }

    return [];
  }

  function sameGiftIds(a, b) {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
      if (String(aa[i]?.id || '') !== String(bb[i]?.id || '')) return false;
    }
    return true;
  }

  // =========================
  // Images: normalize + fallback
  // =========================
  function isDataUrl(s) {
    return typeof s === 'string' && s.startsWith('data:');
  }

  function normalizeImageUrl(src) {
    const s = safeText(src, 100000);
    if (!s) return PLACEHOLDER_IMG;
    if (isDataUrl(s)) return s;
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    if (s.startsWith('/')) return s;
    return '/' + s;
  }

  function withCacheBuster(url, key) {
    const u = String(url || '');
    if (!u) return PLACEHOLDER_IMG;
    if (isDataUrl(u)) return u;

    // avoid caching problems right after relayer added an image
    const k = encodeURIComponent(String(key || Date.now()));
    if (u.startsWith('/images/') || u.startsWith('images/')) {
      const sep = u.includes('?') ? '&' : '?';
      return u + sep + 'v=' + k;
    }
    return u;
  }

  function wireCardImageFallbacks(rootEl) {
    const root = rootEl || document;
    const imgs = root.querySelectorAll('.market-card__img');
    imgs.forEach((img) => {
      if (img.dataset.wgWired === '1') return;
      img.dataset.wgWired = '1';

      img.addEventListener('error', () => {
        if (img.dataset.wgFailed === '1') return;
        img.dataset.wgFailed = '1';
        img.src = PLACEHOLDER_IMG;
      });
    });
  }

  function loadGifts() {
    const raw = safeStorageGet(STORAGE_KEY);
    if (!raw) return DEFAULT_GIFTS.slice(0, MARKET_LIMIT);

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_GIFTS.slice(0, MARKET_LIMIT);

      const cleaned = parsed
        .map((g, idx) => normalizeGift(g, idx))
        .filter(Boolean)
        .slice(0, MARKET_LIMIT);

      return cleaned.length ? cleaned : DEFAULT_GIFTS.slice(0, MARKET_LIMIT);
    } catch {
      return DEFAULT_GIFTS.slice(0, MARKET_LIMIT);
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
    const image = safeText(g.image, 100000) || PLACEHOLDER_IMG;
    const priceTon = toFiniteNumber(g.priceTon);

    const createdAt = Number(g.createdAt || g.ts || g.time || Date.now());
    return { id, name, number, image, priceTon: Number.isFinite(priceTon) ? priceTon : null, createdAt: Number.isFinite(createdAt) ? createdAt : Date.now() };
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

    // Same logic as in cases.js: try same-origin first, then dev fallbacks.
    const endpoints = [
      '/api/gifts/prices',
      'http://localhost:7700/api/gifts/prices',
      'http://localhost:3000/api/gifts/prices'
    ];

    let data = null;
    for (const base of endpoints) {
      try {
        const url = `${base}?t=${Date.now()}`; // bust cache
        data = await fetchJson(url, { timeoutMs: 8000 });
        if (data) break;
      } catch (_) {
        // try next
      }
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    for (const it of items) {
      const nm = normalizeKey(it?.name);
      const price = toFiniteNumber(it?.priceTon ?? it?.price_ton ?? it?.price);
      if (nm && Number.isFinite(price) && price > 0) {
        map.set(nm, price);
      }
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

      // server.js returns { ok, q, results:[{name, short_name, floor_price}] }
      // but we also support the raw portals shape { collections:[...] } just in case.
      const cols =
        Array.isArray(data?.results) ? data.results :
        Array.isArray(data?.collections) ? data.collections :
        Array.isArray(data?.items) ? data.items : [];

      if (!cols.length) return null;

      // Prefer exact name match (case-insensitive). Otherwise take first.
      const target = q.toLowerCase();
      const best = cols.find((c) => String(c?.name || c?.title || '').trim().toLowerCase() === target) || cols[0];

      const floorRaw =
        best?.floor_price ?? best?.floorPrice ?? best?.floor ?? best?.floorPriceTon ?? null;

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

    const list = loadGifts();
    list.unshift(newGift);

    // Keep exactly 6
    state.gifts = list.slice(0, MARKET_LIMIT);
    saveGifts(state.gifts);

    renderMarket();
  };

  window.marketResetGifts = function marketResetGifts() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    state.gifts = DEFAULT_GIFTS.slice(0, MARKET_LIMIT);
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
