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

  // Telegram Stars conversion (fallback). You can override via localStorage key 'starsPerTon'.
  const STARS_PER_TON_DEFAULT = 115;

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
    currency: 'ton',

    // filled from /api/market/items rate
    serverRate: null,

    // last opened gift (for drawer refresh on currency change)
    openGift: null
  };

// expose for other modules (filter panel, debugging)
try { window.WGMarketState = state; } catch {}
try { window.state = state; } catch {}

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
    try { await window.WildTimeRates?.ensureTonStarsRate?.(false); } catch (_) {}
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

    // Let other modules (filter) re-apply after rerender
    try { window.dispatchEvent(new CustomEvent('wg:market:rerender')); }
    catch { try { window.dispatchEvent(new Event('wg:market:rerender')); } catch {} }
  }

  function buildGiftCard(gift, index) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'market-card';

  // keep existing background palette (fallback)
  btn.style.setProperty('--card-bg', CARD_BACKGROUNDS[index % CARD_BACKGROUNDS.length]);

  const tg = gift?.tg && typeof gift.tg === 'object' ? gift.tg : null;
  const backdrop = tg?.backdrop || null;

  // Collectible backdrop -> (only used as fallback behind the preview)
  if (backdrop && (backdrop.center || backdrop.edge)) {
    btn.classList.add('is-collectible');
    if (backdrop.center) btn.style.setProperty('--bg-center', backdrop.center);
    if (backdrop.edge) btn.style.setProperty('--bg-edge', backdrop.edge);
    if (backdrop.patternColor) btn.style.setProperty('--pattern-color', backdrop.patternColor);
    if (backdrop.textColor) btn.style.setProperty('--backdrop-text', backdrop.textColor);
  }

  btn.dataset.id = String(gift.id || '');
  btn.dataset.nameKey = normalizeKey(gift?.name);

  const number = safeText(gift.number, 32);
  const price = resolvePriceForCurrency(gift, state.currency);

  // ✅ Prefer pre-rendered Fragment preview (already contains backdrop + pattern + gift)
  const previewSrc = safeImg(gift?.previewUrl) || safeImg(tg?.previewUrl) || safeImg(fragmentMediumPreviewUrlFromSlug(tg?.slug)) || '';

  // Fallbacks (if preview missing)
  const modelImg = safeImg(tg?.model?.image);
  const giftImg  = safeImg(gift?.image);

  const imgSrc = previewSrc || modelImg || giftImg || PLACEHOLDER_IMG;

  if (previewSrc) btn.classList.add('has-preview');
  if (imgSrc && imgSrc !== PLACEHOLDER_IMG) btn.classList.add('has-image');

  btn.innerHTML = `
    <div class="market-card__num"><span>#${escapeHtml(number || '—')}</span></div>

    <div class="market-card__imgWrap">
      <img class="market-card__img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(gift?.name || '')}" draggable="false">
    </div>

    <div class="market-card__pricePill">
      <img class="market-card__priceIcon" src="${escapeHtml(currencyIconPath(state.currency))}" alt="">
      <span class=\"market-card__priceNum\">${formatPrice(price)}</span>
    </div>
  `;

  // If Fragment uses .jpg but sometimes .jpeg exists: auto-fallback once
  if (previewSrc) {
    const img = btn.querySelector('.market-card__img');
    img?.addEventListener('error', () => {
      const src = String(img.getAttribute('src') || '');
      if (/\.medium\.jpg$/i.test(src)) {
        img.setAttribute('src', src.replace(/\.medium\.jpg$/i, '.medium.jpeg'));
      }
    }, { once: true });
  }

  btn.addEventListener('click', () => {
    openGiftDrawer(gift);
  });

  return btn;
}



// =========================
// Gift Drawer (bottom sheet)
// =========================
let giftDrawerEl = null;
let giftDrawerOverlayEl = null;
let giftDrawerBuyBtn = null;

function ensureGiftDrawer() {
  if (giftDrawerEl && giftDrawerOverlayEl) return;

  const overlay = document.createElement('div');
  overlay.className = 'market-gift-overlay';
  overlay.innerHTML = `
    <div class="market-gift-drawer" role="dialog" aria-modal="true">
      <button class="market-gift-close" type="button" aria-label="Close">✕</button>

      <div class="market-gift-hero">
        <div class="market-gift-hero__imgWrap">
          <img class="market-gift-hero__img" src="${escapeHtml(PLACEHOLDER_IMG)}" alt="">
        </div>
        <div class="market-gift-hero__meta">
          <div class="market-gift-title">Gift</div>
          <div class="market-gift-subtitle">Collectible</div>
        </div>
      </div>

      <div class="market-gift-attrs">
        <div class="market-gift-row">
          <div class="market-gift-k">Model</div>
          <div class="market-gift-v" data-k="model">—</div>
        </div>
        <div class="market-gift-row">
          <div class="market-gift-k">Symbol</div>
          <div class="market-gift-v" data-k="symbol">—</div>
        </div>
        <div class="market-gift-row">
          <div class="market-gift-k">Backdrop</div>
          <div class="market-gift-v" data-k="backdrop">—</div>
        </div>
      </div>

      <div class="market-gift-footer">
        <button class="market-gift-buy" type="button">
          <span>Buy for</span>
          <span class="market-gift-buy__price">
            <img class="market-gift-buy__icon" src="${escapeHtml(currencyIconPath(state.currency))}" alt="">
            <span class="market-gift-buy__num">—</span>
          </span>
        </button>
      </div>
    </div>
  `;

  const drawer = overlay.querySelector('.market-gift-drawer');
  const closeBtn = overlay.querySelector('.market-gift-close');
  const buyBtn = overlay.querySelector('.market-gift-buy');

  function close() {
    overlay.classList.remove('is-open');
    try { document.body.classList.remove('market-gift-overlay-open'); } catch {}
    // allow animation
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 250);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn?.addEventListener('click', close);

  // ESC close (desktop)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
  });

  // Prevent clicks inside drawer from closing
  drawer?.addEventListener('click', (e) => e.stopPropagation());

  document.body.appendChild(overlay);

  giftDrawerEl = drawer;
  giftDrawerOverlayEl = overlay;
  giftDrawerBuyBtn = buyBtn;
}

function getStarsPerTon() {
  // 1) WildTimeRates (shared rate module)
  try {
    const v = Number(window.WildTimeRates?.getStarsPerTon?.());
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}

  // 2) allow override without redeploy
  try {
    const v = Number(localStorage.getItem('starsPerTon'));
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}

  // 3) allow server-side injection
  const w = Number(window.STARS_PER_TON);
  if (Number.isFinite(w) && w > 0) return w;

  return STARS_PER_TON_DEFAULT;
}

function formatBuyPriceForGift(gift) {
  const currency = state.currency === 'stars' ? 'stars' : 'ton';
  const v = resolvePriceForCurrency(gift, currency);
  if (!Number.isFinite(v) || v <= 0) return { num: '—', icon: currencyIconPath(currency) };

  if (currency === 'stars') {
    // v is already Stars (integer expected)
    return { num: String(Math.max(1, Math.floor(v + 1e-9))), icon: currencyIconPath('stars') };
  }

  // TON
  return { num: formatPrice(v), icon: currencyIconPath('ton') };
}


function closeGiftDrawer() {
  if (!giftDrawerOverlayEl) return;
  giftDrawerOverlayEl.classList.remove('is-open');
  try { document.body.classList.remove('market-gift-overlay-open'); } catch {}
  setTimeout(() => { try { giftDrawerOverlayEl.style.display = 'none'; } catch {} }, 250);
}

function getProfileNavTargetRect() {
  const target = document.querySelector('.bottom-nav .nav-item[data-target="profilePage"] .nav-avatar')
    || document.querySelector('.bottom-nav .nav-item[data-target="profilePage"] .nav-icon')
    || document.querySelector('#navProfileAvatar')
    || document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]');
  return target?.getBoundingClientRect?.() || null;
}

async function animateGiftToProfile() {
  if (!giftDrawerOverlayEl || !giftDrawerEl) return;

  const sourceImg = giftDrawerEl.querySelector('.market-gift-hero__img');
  const sourceRect = sourceImg?.getBoundingClientRect?.();
  const targetRect = getProfileNavTargetRect();
  if (!sourceRect || !targetRect) {
    closeGiftDrawer();
    return;
  }

  const clone = sourceImg.cloneNode(true);
  clone.classList.add('market-fly-image');
  clone.style.left = `${sourceRect.left}px`;
  clone.style.top = `${sourceRect.top}px`;
  clone.style.width = `${sourceRect.width}px`;
  clone.style.height = `${sourceRect.height}px`;
  document.body.appendChild(clone);

  // 1) Close drawer and remove blur/dim first.
  closeGiftDrawer();

  // 2) Fly to profile icon and dissolve.
  const toX = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
  const toY = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);
  const scale = Math.max(0.16, Math.min(0.34, targetRect.width / Math.max(sourceRect.width, 1)));
  clone.style.setProperty('--fly-x', `${toX}px`);
  clone.style.setProperty('--fly-y', `${toY}px`);
  clone.style.setProperty('--fly-scale', String(scale));

  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      clone.classList.add('is-flying');
      setTimeout(resolve, 720);
    });
  });

  clone.remove();
}

function toast(message) {
  const text = safeText(message, 300) || '';
  if (!text) return;

  try {
    if (typeof window.showToast === 'function') {
      window.showToast(text);
      return;
    }
  } catch {}

  try {
    if (typeof window.notify === 'function') {
      window.notify(text);
      return;
    }
  } catch {}

  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.showAlert) {
      tg.showAlert(text);
      return;
    }
  } catch {}

  console.info('[market]', text);
}

function setBuyButtonLoading(loading) {
  if (!giftDrawerBuyBtn) return;
  giftDrawerBuyBtn.disabled = !!loading;
  giftDrawerBuyBtn.style.opacity = loading ? '0.75' : '';
  giftDrawerBuyBtn.style.pointerEvents = loading ? 'none' : '';
}

function getLiveBalance(currency) {
  const cur = currency === 'stars' ? 'stars' : 'ton';
  const v = Number(window.WildTimeCurrency?.balance?.[cur]);
  return Number.isFinite(v) ? v : null;
}

function setLiveBalance(currency, value) {
  const cur = currency === 'stars' ? 'stars' : 'ton';
  if (!Number.isFinite(value)) return;

  try { window.WildTimeCurrency?.setBalance?.(cur, value); } catch {}

  try {
    const detail = cur === 'stars' ? { stars: value } : { ton: value };
    window.dispatchEvent(new CustomEvent('balance:update', { detail }));
  } catch {}
}

function getLocalInventorySnapshot() {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!userId) return { userId: null, items: null };

  try {
    const raw = localStorage.getItem(`WT_INV_${userId}`);
    const items = JSON.parse(raw || '[]');
    return { userId, items: Array.isArray(items) ? items : [] };
  } catch {
    return { userId, items: [] };
  }
}

function buildOptimisticInventoryItem(gift) {
  const priceTon = resolvePriceTon(gift);
  const priceStars = resolvePriceForCurrency(gift, 'stars');
  const nowMs = Date.now();

  return {
    type: 'nft',
    id: String(gift?.tg?.slug || gift?.id || `gift_${nowMs}`),
    name: gift?.name || 'Gift',
    displayName: gift?.name || 'Gift',
    icon: gift?.previewUrl || gift?.image || '/images/gifts/stars.webp',
    instanceId: `optimistic_${String(gift?.id || 'gift')}_${nowMs}`,
    acquiredAt: nowMs,
    price: {
      ton: Number.isFinite(priceTon) ? priceTon : null,
      stars: Number.isFinite(priceStars) ? Math.max(1, Math.floor(priceStars)) : null
    },
    fromMarket: true,
    marketId: String(gift?.id || ''),
    optimistic: true,
    tg: gift?.tg || null
  };
}

async function applyOptimisticPurchase(gift) {
  const snapshot = {
    giftsBefore: Array.isArray(state.gifts) ? state.gifts.slice() : [],
    balanceBefore: getLiveBalance(state.currency),
    currency: state.currency,
    inventoryBefore: null,
    userId: null
  };

  // 1) Market UI — remove instantly
  state.gifts = snapshot.giftsBefore.filter(x => String(x?.id) !== String(gift?.id));
  await animateGiftToProfile();
  renderMarket();

  // 2) Balance UI — deduct instantly
  const price = resolvePriceForCurrency(gift, state.currency);
  if (Number.isFinite(snapshot.balanceBefore) && Number.isFinite(price) && price > 0) {
    const next = snapshot.currency === 'stars'
      ? Math.max(0, Math.floor(snapshot.balanceBefore - price))
      : Math.max(0, Number((snapshot.balanceBefore - price).toFixed(6)));
    setLiveBalance(snapshot.currency, next);
  }

  // 3) Inventory UI — append optimistic item instantly
  const inv = getLocalInventorySnapshot();
  snapshot.inventoryBefore = Array.isArray(inv.items) ? inv.items.slice() : null;
  snapshot.userId = inv.userId;

  if (inv.userId && Array.isArray(inv.items)) {
    const optimisticItem = buildOptimisticInventoryItem(gift);
    const nextItems = [optimisticItem, ...inv.items];
    try { localStorage.setItem(`WT_INV_${inv.userId}`, JSON.stringify(nextItems)); } catch {}

    try {
      window.dispatchEvent(new CustomEvent('inventory:update', {
        detail: {
          source: 'market-buy-optimistic',
          mode: 'replace',
          items: nextItems,
          purchased: gift || null
        }
      }));
    } catch {}
  }

  return snapshot;
}

function rollbackOptimisticPurchase(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;

  if (Array.isArray(snapshot.giftsBefore)) {
    state.gifts = snapshot.giftsBefore;
    renderMarket();
  }

  if (Number.isFinite(snapshot.balanceBefore)) {
    setLiveBalance(snapshot.currency, snapshot.balanceBefore);
  }

  if (snapshot.userId && Array.isArray(snapshot.inventoryBefore)) {
    try { localStorage.setItem(`WT_INV_${snapshot.userId}`, JSON.stringify(snapshot.inventoryBefore)); } catch {}
    try {
      window.dispatchEvent(new CustomEvent('inventory:update', {
        detail: {
          source: 'market-buy-rollback',
          mode: 'replace',
          items: snapshot.inventoryBefore
        }
      }));
    } catch {}
  }
}

function emitLivePurchaseEvents({ response, gift, currency }) {
  const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const inventoryItems = Array.isArray(response?.inventory) ? response.inventory : null;

  if (userId && inventoryItems) {
    try { localStorage.setItem(`WT_INV_${userId}`, JSON.stringify(inventoryItems)); } catch {}
  }

  try {
    window.dispatchEvent(new CustomEvent('inventory:update', {
      detail: {
        source: 'market-buy',
        mode: inventoryItems ? 'replace' : 'reload',
        items: inventoryItems,
        purchased: gift || null
      }
    }));
  } catch {}

  if (typeof response?.newBalance === 'number') {
    try {
      const cur = currency === 'stars' ? 'stars' : 'ton';
      const detail = cur === 'stars'
        ? { stars: response.newBalance }
        : { ton: response.newBalance };
      window.dispatchEvent(new CustomEvent('balance:update', { detail }));
    } catch {}
  }

  try {
    window.dispatchEvent(new CustomEvent('market:update', {
      detail: { source: 'market-buy', soldId: String(gift?.id || '') }
    }));
  } catch {}
}

async function reconcileLiveState() {
  try {
    state.gifts = await loadGifts();
    renderMarket();
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('inventory:update', {
      detail: { source: 'market-reconcile', mode: 'reload' }
    }));
  } catch {}
}

async function buyGift(gift) {
  if (!gift || !gift.id) return;
  if (state.buying) return;

  state.buying = true;
  setBuyButtonLoading(true);
  const name = safeText(gift?.name, 64) || 'Gift';
  const optimistic = await applyOptimisticPurchase(gift);

  try {
    const j = await postJson('/api/market/items/buy', { id: gift.id, currency: state.currency }, { timeoutMs: 15000 });

    emitLivePurchaseEvents({ response: j, gift, currency: state.currency });

    toast(`✅ Purchased: ${name}`);
  } catch (e) {
    const payload = e?.payload || null;
    const code = payload?.code || payload?.errorCode || '';
    const msg = payload?.error || payload?.message || e?.message || 'Buy failed';

    if (code === 'ALREADY_SOLD' || e?.status === 409) {
      toast('⚠️ This gift was already sold. Refreshing…');
      state.gifts = await loadGifts();
      renderMarket();
      return;
    }
    if (code === 'INSUFFICIENT_BALANCE' || /insufficient/i.test(String(msg))) {
      rollbackOptimisticPurchase(optimistic);
      toast('❌ Not enough balance');
      return;
    }
    if (code === 'BAD_PRICE') {
      rollbackOptimisticPurchase(optimistic);
      toast('⚠️ Цена подарка сейчас недоступна. Обновите маркет и попробуйте снова.');
      reconcileLiveState();
      return;
    }
    if (e?.code === 'REQUEST_TIMEOUT') {
      rollbackOptimisticPurchase(optimistic);
      toast('❌ Buy timeout. Please try again.');
      reconcileLiveState();
      return;
    }

    rollbackOptimisticPurchase(optimistic);
    toast(`❌ ${msg}`);
    reconcileLiveState();
  } finally {
    state.buying = false;
    setBuyButtonLoading(false);
  }
}

function refreshGiftDrawerPrice() {
  if (!giftDrawerOverlayEl || giftDrawerOverlayEl.style.display !== 'block') return;
  if (!giftDrawerEl) return;
  if (!state.openGift) return;

  const bp = formatBuyPriceForGift(state.openGift);
  const iconEl = giftDrawerEl.querySelector('.market-gift-buy__icon');
  const numEl = giftDrawerEl.querySelector('.market-gift-buy__num');
  if (iconEl) iconEl.setAttribute('src', bp.icon);
  if (numEl) numEl.textContent = bp.num;

  // update buy button (keep same handler, but update label/price in UI)
  if (giftDrawerBuyBtn) {
    giftDrawerBuyBtn.onclick = async () => {
      if (state.openGift) await buyGift(state.openGift);
    };
  }
}

function openGiftDrawer(gift) {
  ensureGiftDrawer();

  const tg = gift?.tg || null;

  // Image: prefer Fragment medium preview, else model image, else stored image
  const previewSrc = safeImg(gift?.previewUrl) || safeImg(tg?.previewUrl) || safeImg(fragmentMediumPreviewUrlFromSlug(tg?.slug)) || '';
  const modelImg = safeImg(tg?.model?.image);
  const giftImg  = safeImg(gift?.image);
  const imgSrc = previewSrc || modelImg || giftImg || PLACEHOLDER_IMG;

  // Text
  const name = safeText(gift?.name, 64) || 'Gift';
  const number = safeText(gift?.number, 32) || '';
  const subtitle = number ? `Collectible #${number}` : 'Collectible';

  // attrs
  const model = safeText(tg?.model?.name, 64) || '—';
  const symbol = safeText(tg?.pattern?.name, 64) || '—';
  const backdrop = safeText(tg?.backdrop?.name, 64) || '—';

  giftDrawerEl.querySelector('.market-gift-hero__img')?.setAttribute('src', imgSrc);
  giftDrawerEl.querySelector('.market-gift-hero__img')?.setAttribute('alt', name);
  const t = giftDrawerEl.querySelector('.market-gift-title');
  const s = giftDrawerEl.querySelector('.market-gift-subtitle');
  if (t) t.textContent = name;
  if (s) s.textContent = subtitle;

  const setAttr = (key, val) => {
    const el = giftDrawerEl.querySelector(`.market-gift-v[data-k="${key}"]`);
    if (el) el.textContent = val;
  };
  setAttr('model', model);
  setAttr('symbol', symbol);
  setAttr('backdrop', backdrop);

  // remember opened gift (so we can refresh its price on currency switch)
  state.openGift = gift;

  // price
  const bp = formatBuyPriceForGift(gift);
  const iconEl = giftDrawerEl.querySelector('.market-gift-buy__icon');
  const numEl = giftDrawerEl.querySelector('.market-gift-buy__num');
  if (iconEl) iconEl.setAttribute('src', bp.icon);
  if (numEl) numEl.textContent = bp.num;

  // click buy
  giftDrawerBuyBtn.onclick = async () => {
    await buyGift(gift);
  };

  giftDrawerOverlayEl.style.display = 'block';
  try { document.body.classList.add('market-gift-overlay-open'); } catch {}
  // next tick for animation
  requestAnimationFrame(() => giftDrawerOverlayEl.classList.add('is-open'));
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

    // Re-render to update BOTH icons and numbers
    renderMarket();
    refreshGiftDrawerPrice();
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
    // include rate + priceStars computed on server
    const data = await fetchJson('/api/market/items/list', { timeoutMs: 12000 });

    const items = Array.isArray(data)
      ? data
      : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.data) ? data.data : []));

    // cache server starsPerTon for consistent conversion on client
    const rate = (data && typeof data === 'object') ? (data.rate || null) : null;
    state.serverRate = rate || null;

    const spt = toFiniteNumber(rate?.starsPerTon);
    if (Number.isFinite(spt) && spt > 0) {
      try { localStorage.setItem('starsPerTon', String(spt)); } catch {}
      try { window.STARS_PER_TON = spt; } catch {}
    }

    if (!Array.isArray(items) || !items.length) return [];
    return items.map((it, idx) => normalizeGift(it, idx)).filter(Boolean);
  } catch {
    return [];
  }
}

async function loadGifts() {
  // Market is server-authoritative: all devices must see the same list.
  const fromServer = await fetchMarketItemsFromServer();
  return Array.isArray(fromServer) ? fromServer : [];
}

function loadGiftsLocal() {
    const raw = safeStorageGet(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const cleaned = parsed
        .map((g, idx) => normalizeGift(g, idx))
        .filter(Boolean)
        ;

      return cleaned;
    } catch {
      return [];
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

    // Keep full server item id (up to backend limit) so buy requests don't send truncated ids.
    // This is important for admin test flows where gifts can be relisted multiple times.
    const id = safeText(g.id, 128) || `g${idx + 1}`;
    const name = safeText(g.name, 64) || `Gift ${idx + 1}`;
    const number = safeText(g.number, 32) || '';

    const tg = (g.tg && typeof g.tg === 'object') ? g.tg : null;

    const previewUrl = safeText(g.previewUrl, 220000) || safeText(tg?.previewUrl, 220000) || '';

    // image can be:
    //  - data:image/... (from relayer when INLINE_IMAGES=1)
    //  - /images/... (when relayer and server are on same machine)
    //  - fallback placeholder
    const image = safeText(g.image, 220000) ||
      safeText(tg?.model?.image, 220000) ||
      PLACEHOLDER_IMG;

    const priceTon = toFiniteNumber(g.priceTon);
    const priceStars = toFiniteNumber(g.priceStars ?? g.price_stars);
    const createdAt = toFiniteNumber(g.createdAt ?? g.created_at);

    return {
      id,
      name,
      number,
      image,
      previewUrl,
      priceTon: Number.isFinite(priceTon) ? priceTon : null,
      priceStars: Number.isFinite(priceStars) ? priceStars : null,
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

function resolvePriceForCurrency(gift, currency) {
  const c = (currency === 'stars') ? 'stars' : 'ton';

  if (c === 'ton') return resolvePriceTon(gift);

  // Prefer item-specific Stars from server (computed using TON/USD rate)
  const sLocal = toFiniteNumber(gift?.priceStars ?? gift?.price_stars);
  if (Number.isFinite(sLocal) && sLocal > 0) return sLocal;

  // Fallback: compute Stars from TON using cached starsPerTon
  const t = resolvePriceTon(gift);
  if (Number.isFinite(t) && t > 0) {
    const stars = Math.max(1, Math.floor(t * getStarsPerTon() + 1e-9));
    return stars;
  }

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
    const todo = missing;

    for (const g of todo) {
      const price = await fetchPriceSmart(g.name);
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
  async function fetchPriceSmart(name) {
    const q = safeText(name, 80);
    if (!q) return null;

    // Preferred: server-side unified endpoint (Portals -> Tonnel fallback)
    try {
      const data = await fetchJson(`/api/gifts/price?name=${encodeURIComponent(q)}`, { timeoutMs: 12000 });
      const p = toFiniteNumber(
        data?.item?.priceTon ?? data?.item?.price_ton ?? data?.item?.price ??
        data?.priceTon ?? data?.price_ton ?? data?.price
      );
      if (Number.isFinite(p) && p > 0) return p;
    } catch {
      // ignore
    }

    // Backward compat: old endpoint
    try {
      const data = await fetchJson(`/api/gifts/portals-search?q=${encodeURIComponent(q)}`, { timeoutMs: 9000 });

      const cols = Array.isArray(data?.collections)
        ? data.collections
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.items)
            ? data.items
            : [];

      if (!cols.length) return null;

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
    const p = await fetchPriceSmart(name);
    if (Number.isFinite(p) && p > 0) newGift.priceTon = p;

    const listLocal = loadGiftsLocal();

    // Merge with current state (which may include server items)
    const base = (Array.isArray(state.gifts) && state.gifts.length) ? state.gifts.slice() : listLocal.slice();
    const merged = [newGift, ...base.filter(x => String(x?.id) !== String(newGift.id))];

    state.gifts = merged;
    saveGifts(state.gifts);
    renderMarket();
};

  window.marketResetGifts = function marketResetGifts() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    state.gifts = DEFAULT_GIFTS.slice(0);
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
  
function fragmentMediumPreviewUrlFromSlug(slug) {
  const s = String(slug ?? '').trim();
  if (!s) return '';
  const base = s.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  if (!base) return '';
  return `https://nft.fragment.com/gift/${base}.medium.jpg`;
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

  

function getTgInitData() {
  try { return window.Telegram?.WebApp?.initData || ''; } catch { return ''; }
}

async function postJson(url, body, { timeoutMs = 12000 } = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutHandle = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      try { if (ctrl) ctrl.abort(); } catch {}
      const e = new Error('Request timeout');
      e.code = 'REQUEST_TIMEOUT';
      reject(e);
    }, Math.max(1000, Number(timeoutMs) || 12000));
  });

  try {
    const initData = getTgInitData();
    const fetchPromise = fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      signal: ctrl ? ctrl.signal : undefined,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-telegram-init-data': initData
      },
      body: JSON.stringify(body || {})
    });

    const res = await Promise.race([fetchPromise, timeoutPromise]);
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (j && (j.error || j.message)) ? (j.error || j.message) : `HTTP ${res.status}`;
      const e = new Error(err);
      e.status = res.status;
      e.payload = j;
      throw e;
    }
    return j;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
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


(() => {
  'use strict';

  // =========================
  // Filter State (by gift type/name)
  // =========================
  const filterState = {
    selectedKeys: new Set(),   // normalized gift name keys
    allTypes: []               // { key, name, previewSrc, floorTon, count }
  };

  // =========================
  // Init
  // =========================
  function initFilter() {
    const giftsPill = document.querySelector('#marketPillGifts');
    if (!giftsPill) return;

    giftsPill.addEventListener('click', (e) => {
      e.stopPropagation();
      openFilterPanel();
    });

    // After market re-render (currency switch / sort), re-apply filter to new DOM
    window.addEventListener('wg:market:rerender', () => {
      applyFilter();
    });
  }

  // =========================
  // Filter Panel
  // =========================
  let filterOverlay = null;
  let filterPanel = null;
  let closeFilterPanel = () => {};

  function ensureFilterPanel() {
    if (filterOverlay && filterPanel) return;

    const overlay = document.createElement('div');
    overlay.className = 'market-filter-overlay';

    overlay.innerHTML = `
      <div class="market-filter-panel">
        <div class="market-filter-header">
          <h2 class="market-filter-title">Filter Gifts</h2>
          <button class="market-filter-close" type="button" aria-label="Close">
            <svg class="market-filter-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="market-filter-list"></div>

        <div class="market-filter-footer">
          <button class="market-filter-btn market-filter-btn--clear" type="button">
            Clear All
          </button>
          <button class="market-filter-btn market-filter-btn--show" type="button">
            Show <span class="filter-count"></span>
          </button>
        </div>
      </div>
    `;

    const panel = overlay.querySelector('.market-filter-panel');
    const closeBtn = overlay.querySelector('.market-filter-close');
    const clearBtn = overlay.querySelector('.market-filter-btn--clear');
    const showBtn = overlay.querySelector('.market-filter-btn--show');

    function close() {
      overlay.classList.remove('is-open');
      panel.classList.remove('is-open');
      setTimeout(() => { overlay.style.display = 'none'; }, 350);
    }

    closeFilterPanel = close;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    closeBtn?.addEventListener('click', close);

    clearBtn?.addEventListener('click', () => {
      filterState.selectedKeys.clear();
      renderFilterList();
      updateShowButton();
      applyFilter();
    });

    showBtn?.addEventListener('click', () => {
      applyFilter();
      close();
    });

    document.body.appendChild(overlay);
    filterOverlay = overlay;
    filterPanel = panel;
  }

  function openFilterPanel() {
    ensureFilterPanel();
    if (!filterOverlay || !filterPanel) return;

    // build unique types from current market list
    const gifts = window.WGMarketState?.gifts || window.state?.gifts || [];
    filterState.allTypes = buildGiftTypes(Array.isArray(gifts) ? gifts : []);

    renderFilterList();
    updateShowButton();

    filterOverlay.style.display = 'block';
    requestAnimationFrame(() => {
      filterOverlay.classList.add('is-open');
      filterPanel.classList.add('is-open');
    });
  }

  function buildGiftTypes(list) {
    const map = new Map();

    for (const g of list) {
      const name = safeText(g?.name, 120) || 'Gift';
      const key = normalizeKey(name);
      if (!key) continue;

      // choose best preview/icon for type
      const tg = g?.tg || null;
      const previewSrc = safeText(g?.previewUrl, 220000) || safeText(tg?.previewUrl, 220000) || safeText(g?.image, 220000) || '/icons/market.webp';

      const priceTon = toFiniteNumber(g?.priceTon);
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          key,
          id: key,
          name,
          previewSrc,
          floorTon: (Number.isFinite(priceTon) && priceTon > 0) ? priceTon : null,
          count: 1
        });
      } else {
        cur.count++;
        // keep min TON floor if present
        if (Number.isFinite(priceTon) && priceTon > 0) {
          if (!Number.isFinite(cur.floorTon) || cur.floorTon == null) cur.floorTon = priceTon;
          else cur.floorTon = Math.min(cur.floorTon, priceTon);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function renderFilterList() {
    const listEl = filterOverlay?.querySelector('.market-filter-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!filterState.allTypes.length) {
      listEl.innerHTML = '<div class="market-filter-empty">No gifts available</div>';
      return;
    }

    for (const t of filterState.allTypes) {
      listEl.appendChild(createFilterItem(t));
    }
  }

  function createFilterItem(t) {
    const key = t?.key || t?.id || '';
    const isChecked = filterState.selectedKeys.has(key);

    const item = document.createElement('div');
    item.className = 'market-filter-item';
    if (isChecked) item.classList.add('is-checked');

    const currency = getCurrency();
    const price = resolveTypePrice(t, currency);

    item.innerHTML = `
      <img class="market-filter-item__icon" src="${escapeHtml(t.previewSrc)}" alt="${escapeHtml(t.name)}">
      <span class="market-filter-item__name">${escapeHtml(t.name)}</span>
      <div class="market-filter-item__price">
        <img class="market-filter-item__price-icon" src="${currencyIconPath(currency)}" alt="">
        <span>${formatPrice(price)}</span>
      </div>
      <div class="market-filter-item__checkbox"></div>
    `;

    item.addEventListener('click', () => {
      if (filterState.selectedKeys.has(key)) {
        filterState.selectedKeys.delete(key);
        item.classList.remove('is-checked');
      } else {
        filterState.selectedKeys.add(key);
        item.classList.add('is-checked');
      }
      updateShowButton();
    });

    return item;
  }

  function updateShowButton() {
    const showBtn = filterPanel?.querySelector('.market-filter-btn--show');
    const countSpan = showBtn?.querySelector('.filter-count');
    if (!showBtn || !countSpan) return;

    const selectedCount = filterState.selectedKeys.size;
    const totalCount = filterState.allTypes.length;

    if (selectedCount === 0) countSpan.textContent = `All (${totalCount})`;
    else countSpan.textContent = `${selectedCount}`;
  }

  function applyFilter() {
    const grid = document.querySelector('#marketGrid');
    if (!grid) return;

    const cards = grid.querySelectorAll('.market-card');

    if (filterState.selectedKeys.size === 0) {
      cards.forEach(card => { card.style.display = ''; });
      updatePillIndicator(false);
      return;
    }

    cards.forEach(card => {
      const key = String(card.dataset.nameKey || '').trim();
      if (filterState.selectedKeys.has(key)) card.style.display = '';
      else card.style.display = 'none';
    });

    updatePillIndicator(true);
  }

  function updatePillIndicator(isFiltered) {
    const giftsPill = document.querySelector('#marketPillGifts');
    if (!giftsPill) return;

    if (isFiltered) giftsPill.classList.add('is-open');
    else giftsPill.classList.remove('is-open');
  }

  // =========================
  // Helpers
  // =========================
  function getCurrency() {
    const activeBtn = document.querySelector('.curr-btn--active[data-currency]');
    const fromBtn = activeBtn ? String(activeBtn.dataset.currency || '').toLowerCase() : '';
    if (fromBtn === 'ton' || fromBtn === 'stars') return fromBtn;

    const keys = ['currency', 'selectedCurrency', 'wg_currency'];
    for (const k of keys) {
      try {
        const v = String(localStorage.getItem(k) || '').toLowerCase();
        if (v === 'ton' || v === 'stars') return v;
      } catch {}
    }

    return 'ton';
  }

  function currencyIconPath(currency) {
    return currency === 'stars' ? '/icons/tgStarWhite.svg' : '/icons/tgTonWhite.svg';
  }

  function resolveTypePrice(t, currency) {
    const floorTon = toFiniteNumber(t?.floorTon);
    if (!Number.isFinite(floorTon) || floorTon <= 0) return null;

    if (currency !== 'stars') return floorTon;

    // Stars from TON with cached starsPerTon (shared with market.js)
    const spt = getStarsPerTonSafe();
    return Math.max(1, Math.floor(floorTon * spt + 1e-9));
  }

  function getStarsPerTonSafe() {
    try {
      const v = Number(window.WildTimeRates?.getStarsPerTon?.());
      if (Number.isFinite(v) && v > 0) return v;
    } catch {}

    try {
      const v = Number(localStorage.getItem('starsPerTon'));
      if (Number.isFinite(v) && v > 0) return v;
    } catch {}

    const w = Number(window.STARS_PER_TON);
    if (Number.isFinite(w) && w > 0) return w;

    return 115;
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
    const isInt = Math.abs(v - Math.round(v)) < 1e-9;
    if (isInt) return String(Math.round(v));
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

  function safeText(v, max = 120) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    return s.length > max ? s.slice(0, max) : s;
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(initFilter);

  // Export for console/debug
  window.marketFilter = {
    open: openFilterPanel,
    clear: () => {
      filterState.selectedKeys.clear();
      applyFilter();
    },
    reset: () => {
      filterState.selectedKeys.clear();
      renderFilterList();
      applyFilter();
    }
  };
})();
})();
