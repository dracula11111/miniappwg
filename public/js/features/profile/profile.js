// /public/js/profile.js - Complete v5
(() => {
  console.log('[Profile] ✅ Loaded v5 - Redesigned (No NFT Shelf)');

  const tg = window.Telegram?.WebApp;

  // ====== DOM ELEMENTS ======
  const profileCard = document.querySelector('#profilePage .profile-card');
  const currencySwitch = document.querySelector('#profilePage .currency-switch');

  const profileAvatar = document.getElementById('profileAvatar');
  const profileName = document.getElementById('profileName');
  const profileHandle = document.getElementById('profileHandle');

  // ====== WALLET CARD ======
  const walletCard = document.getElementById('walletCard');
  const walletCardStatus = document.getElementById('walletCardStatus');
  const walletCardToggle = document.getElementById('walletCardToggle');

  const walletCardConnect = document.getElementById('walletCardConnect');
  const profileConnectWalletBtn = document.getElementById('profileConnectWalletBtn');

  const walletHeaderDisconnect = document.getElementById('walletHeaderDisconnect');

  const walletCardDetails = document.getElementById('walletCardDetails');
  const walletCardAddress = document.getElementById('walletCardAddress');
  const walletCardCopy = document.getElementById('walletCardCopy');
  const walletCardDisconnect = document.getElementById('walletCardDisconnect');

  // Disconnect modal
  const walletDisconnectModal = document.getElementById('walletDisconnectModal');
  const walletDisconnectAddr = document.getElementById('walletDisconnectAddr');
  const walletDisconnectBalance = document.getElementById('walletDisconnectBalance');
  const walletDisconnectCopy = document.getElementById('walletDisconnectCopy');
  const walletDisconnectConfirm = document.getElementById('walletDisconnectConfirm');

  const inventoryPanel = document.getElementById('profileInventoryPanel');

  // ====== PROMOCODE UI ======
  const promoInput = document.getElementById('promoInput');
  const promoApplyBtn = document.getElementById('promoApplyBtn');
  const PROMO_APPLY_ICON_HTML = '<img src="/icons/ui/tick.svg" alt="" class="promo-btn__icon" aria-hidden="true">';
  const promoToast = document.getElementById('promo-toast');

  let promoToastTimer = null;
  let promoSetupDone = false;

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function showPromoToast(main, sub = '') {
    if (!main) return;

    // Prefer in-app liquid toast if present
    if (promoToast) {
      promoToast.innerHTML = escapeHtml(main) + (sub ? `<small>${escapeHtml(sub)}</small>` : '');
      promoToast.classList.add('show');
      if (promoToastTimer) clearTimeout(promoToastTimer);
      promoToastTimer = setTimeout(() => promoToast.classList.remove('show'), 2300);
      return;
    }

    // Fallback to Telegram native popup/alert
    showToast(sub ? `${main} — ${sub}` : main);
  }

  function promoErrorMessage(code, fallback) {
    switch (String(code || '')) {
      case 'PROMO_EMPTY': return 'Enter a promo code';
      case 'PROMO_INVALID': return 'Invalid promo code';
      case 'PROMO_ALREADY_REDEEMED': return 'Promo already redeemed';
      case 'PROMO_LIMIT_REACHED': return 'Promo limit reached';
      case 'PROMO_RATE_LIMIT': return 'Too many attempts';
      case 'PROMO_DB_NOT_READY': return 'Promos not configured';
      default: return fallback || 'Failed to redeem';
    }
  }

  function updatePromoBtnState() {
    if (!promoApplyBtn) return;
    const v = String(promoInput?.value || '').trim();
    promoApplyBtn.disabled = v.length < 3;
  }

  function renderPromoApplyButton(loading = false) {
    if (!promoApplyBtn) return;
    promoApplyBtn.innerHTML = PROMO_APPLY_ICON_HTML;
    promoApplyBtn.classList.toggle('is-loading', !!loading);
    const applyLabel = window.WT?.i18n?.translate?.('Apply') || 'Apply';
    promoApplyBtn.setAttribute('aria-label', applyLabel);
  }

  async function applyPromocode() {
    if (!promoInput || !promoApplyBtn) return;
    const code = String(promoInput.value || '').trim();
    if (!code) {
      showPromoToast('Enter a promo code');
      updatePromoBtnState();
      return;
    }

    haptic('medium');

    promoApplyBtn.disabled = true;
    renderPromoApplyButton(true);

    try {
      const r = await tgFetch('/api/promocode/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        const msg = promoErrorMessage(j?.errorCode, j?.error || `Error (${r.status})`);
        showPromoToast(msg);
        haptic('light');
        return;
      }

      const added = Number(j.added || 0);
      const addedTon = Number(j.addedTon || 0);
      const newBal = (typeof j.newBalance === 'number') ? j.newBalance : Number(j.newBalance || 0);
      const newTonBal = (typeof j.newTonBalance === 'number') ? j.newTonBalance : Number(j.newTonBalance || 0);

      if (Number.isFinite(newBal)) {
        setBalance('stars', newBal);
      } else if (Number.isFinite(added) && added > 0) {
        addBalance('stars', added);
      }

      if (Number.isFinite(newTonBal)) {
        setBalance('ton', newTonBal);
      } else if (Number.isFinite(addedTon) && addedTon > 0) {
        addBalance('ton', addedTon);
      }

      promoInput.value = '';
      updatePromoBtnState();

      const rewards = [];
      if (addedTon > 0) rewards.push(`+${addedTon} TON`);
      if (added > 0) rewards.push(`+${added} ⭐`);
      showPromoToast('✅ Promocode applied', rewards.join(' • '));
      haptic('success');

    } catch (e) {
      console.warn('[Promo] redeem error', e);
      showPromoToast('Network error');
      haptic('light');
    } finally {
      renderPromoApplyButton(false);
      updatePromoBtnState();
    }
  }

  function setupPromocode() {
    if (promoSetupDone) return;
    promoSetupDone = true;
    if (!promoInput || !promoApplyBtn) return;

    renderPromoApplyButton(false);
    updatePromoBtnState();

    promoInput.addEventListener('input', updatePromoBtnState);
    promoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyPromocode();
      }
    });
    promoApplyBtn.addEventListener('click', applyPromocode);
  }



  // ====== LOCAL INVENTORY FALLBACK ======
  const LS_PREFIX = 'WT_INV_'; // WT_INV_<userId> => JSON array
  const DAILY_CASE_IMAGE = '/images/cases/daily/dailyCase.webp';
  const DAILY_CASE_VIEW_PREFIX = 'WT_DAILY_CASE_VIEWED_';
  const DAILY_CASE_OPEN_PREFIX = 'WT_DAILY_CASE_OPENED_';
  const DAILY_CASE_STAR_ICON = '/icons/currency/stars.svg';
  const DAILY_CASE_TON_ICON = '/icons/currency/ton.svg';
  const DAILY_CASE_STAR_WHITE_ICON = '/icons/currency/tgStarWhite.svg';
  const DAILY_CASE_TON_WHITE_ICON = '/icons/currency/tgTonWhite.svg';
  const DAILY_CASE_PRICE_CACHE_TTL = 10 * 60 * 1000;
  const dailyCasePriceMap = new Map();
  let dailyCasePricesLoadedAt = 0;
  let dailyCasePricesPromise = null;
  const DAILY_CASE_REWARDS = [
    { id: 'plush-pepe-princess', type: 'gift', name: 'Plush Pepe', image: dailyCaseGiftModelUrl('Plush Pepe', 'Princess') },
    { id: 'precious-peach-shocking', type: 'gift', name: 'Precious Peach', image: dailyCaseGiftModelUrl('Precious Peach', 'Shocking') },
    { id: 'heroic-helmet-praetorian', type: 'gift', name: 'Heroic Helmet', image: dailyCaseGiftModelUrl('Heroic Helmet', 'Praetorian') },
    { id: 'perfume-bottle-twilight-bliss', type: 'gift', name: 'Perfume Bottle', image: dailyCaseGiftModelUrl('Perfume Bottle', 'Twilight Bliss') },
    { id: 'signet-ring-ton', type: 'gift', name: 'Signet Ring', image: dailyCaseGiftModelUrl('Signet Ring', 'TON') },
    { id: 'astral-shard-candy-flossite', type: 'gift', name: 'Astral Shard', image: dailyCaseGiftModelUrl('Astral Shard', 'Candy Flossite') },
    { id: 'artisan-brick-diamond', type: 'gift', name: 'Artisan Brick', image: dailyCaseGiftModelUrl('Artisan Brick', 'Diamond') },
    { id: 'gem-signet-pink-quartz', type: 'gift', name: 'Gem Signet', image: dailyCaseGiftModelUrl('Gem Signet', 'Pink Quartz') },
    { id: 'neko-helmet-kawaii', type: 'gift', name: 'Neko Helmet', image: dailyCaseGiftModelUrl('Neko Helmet', 'Kawaii') },
    { id: 'lol-pop-heart-pop', type: 'gift', name: 'Lol Pop', image: dailyCaseGiftModelUrl('Lol Pop', 'Heart Pop') },
    { id: 'love-potion-juliet', type: 'gift', name: 'Love Potion', image: dailyCaseGiftModelUrl('Love Potion', 'Juliet') },
    { id: 'stars-2', type: 'stars', name: 'Stars', image: DAILY_CASE_STAR_ICON, amount: '2', price: { ton: 0.02, stars: 2 } },
    { id: 'stars-3', type: 'stars', name: 'Stars', image: DAILY_CASE_STAR_ICON, amount: '3', price: { ton: 0.03, stars: 3 } },
    { id: 'ton-0-02', type: 'ton', name: 'TON', image: DAILY_CASE_TON_ICON, amount: '0.02', price: { ton: 0.02, stars: 2 } },
    { id: 'ton-0-03', type: 'ton', name: 'TON', image: DAILY_CASE_TON_ICON, amount: '0.03', price: { ton: 0.03, stars: 3 } }
  ];
  let dailyCaseClaimPromise = null;
  let dailyCaseSheet = null;
  let dailyCaseOpening = false;

  function getTelegramUser() {
    return tg?.initDataUnsafe?.user || { id: 'guest', username: null, first_name: 'Guest' };
  }
  function getInitData() {
    return window.Telegram?.WebApp?.initData || "";
  }
  
  async function tgFetch(url, options = {}) {
    const initData = getInitData();
    const headers = {
      ...(options.headers || {}),
      "x-telegram-init-data": initData
    };
    return fetch(url, { ...options, headers });
  }

  function isDailyCaseItem(item) {
    return String(item?.type || '') === 'daily_case' || String(item?.id || item?.baseId || '') === 'daily_case';
  }

  function todayLocalKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayUtcKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function isExpiredUnopenedDailyCaseItem(item, dateKey = todayLocalKey()) {
    if (!isDailyCaseItem(item)) return false;
    if (item?.opened === true) return false;
    const itemDateKey = String(item?.dailyCaseDate || '').trim();
    const validKeys = new Set([String(dateKey || todayLocalKey()), todayUtcKey()]);
    return !!itemDateKey && !validKeys.has(itemDateKey);
  }

  function withoutExpiredDailyCases(items, dateKey = todayLocalKey()) {
    return (Array.isArray(items) ? items : []).filter((item) => !isExpiredUnopenedDailyCaseItem(item, dateKey));
  }

  function isLocalhostDailyCaseTestMode() {
    const host = String(window.location?.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  function dailyCaseViewKey(userId, dateKey) {
    return `${DAILY_CASE_VIEW_PREFIX}${userId || 'guest'}_${dateKey || todayLocalKey()}`;
  }

  function dailyCaseOpenKey(userId, dateKey) {
    return `${DAILY_CASE_OPEN_PREFIX}${userId || 'guest'}_${dateKey || todayLocalKey()}`;
  }

  function hasViewedDailyCase(userId, dateKey) {
    try { return localStorage.getItem(dailyCaseViewKey(userId, dateKey)) === '1'; } catch { return false; }
  }

  function hasOpenedDailyCase(userId, dateKey) {
    if (isLocalhostDailyCaseTestMode()) return false;
    try { return localStorage.getItem(dailyCaseOpenKey(userId, dateKey)) === '1'; } catch { return false; }
  }

  function markDailyCaseOpened(dateKey = todayLocalKey()) {
    const user = getTelegramUser();
    try { localStorage.setItem(dailyCaseOpenKey(user.id, dateKey), '1'); } catch {}
    markDailyCaseViewed(dateKey);
  }

  function markDailyCaseViewed(dateKey = todayLocalKey()) {
    const user = getTelegramUser();
    try { localStorage.setItem(dailyCaseViewKey(user.id, dateKey), '1'); } catch {}
    updateDailyCaseBadge(false);
  }

  function updateDailyCaseBadge(show) {
    document.body.classList.toggle('daily-case-unread', !!show);
    document.querySelectorAll('[data-daily-case-badge]').forEach((el) => { el.hidden = !show; });
  }

  function ensureDailyCaseBadges() {
    const targets = [
      document.getElementById('userAvatarBtn'),
      document.querySelector('.bottom-nav .nav-item[data-target="profilePage"]')
    ].filter(Boolean);

    targets.forEach((target) => {
      if (target.querySelector('[data-daily-case-badge]')) return;
      const badge = document.createElement('span');
      badge.className = 'daily-case-badge';
      badge.dataset.dailyCaseBadge = '1';
      badge.textContent = '1';
      badge.hidden = true;
      target.appendChild(badge);
    });
  }

  function hideDailyCasePanel() {
    const panel = document.getElementById('dailyCasePanel');
    if (!panel) return;
    updateDailyCaseBadge(true);
    panel.classList.remove('is-open');
    window.setTimeout(() => {
      if (!panel.classList.contains('is-open')) panel.hidden = true;
    }, 260);
  }

  function dailyCasePanelFloaterHtml() {
    const gifts = DAILY_CASE_REWARDS.filter((reward) => String(reward?.type || '') === 'gift');
    const spots = [
      { x: 14, y: 18, size: 50, delay: -0.6 },
      { x: 78, y: 13, size: 44, delay: -1.8 },
      { x: 10, y: 48, size: 40, delay: -2.7 },
      { x: 88, y: 47, size: 48, delay: -1.1 },
      { x: 50, y: 11, size: 36, delay: -3.4 }
    ];

    return spots.map((spot, index) => {
      const reward = gifts[Math.floor(Math.random() * gifts.length)] || DAILY_CASE_REWARDS[index % DAILY_CASE_REWARDS.length];
      return `
        <img class="daily-case-panel__floater daily-case-panel__floater--${index + 1}"
             src="${escapeHtml(reward?.image || DAILY_CASE_IMAGE)}"
             alt=""
             aria-hidden="true"
             style="--x:${spot.x}%; --y:${spot.y}%; --s:${spot.size}px; --d:${spot.delay}s"
             onerror="this.onerror=null;this.src='${DAILY_CASE_IMAGE}'">
      `;
    }).join('');
  }

  function renderDailyCasePanelFloaters(panel) {
    const floaters = panel?.querySelector?.('[data-daily-case-panel-floaters]');
    if (!floaters) return;
    floaters.innerHTML = dailyCasePanelFloaterHtml();
  }

  function showDailyCasePanel(dateKey) {
    let panel = document.getElementById('dailyCasePanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'dailyCasePanel';
      panel.className = 'daily-case-panel';
      panel.hidden = true;
      panel.innerHTML = `
        <div class="daily-case-panel__backdrop" aria-hidden="true"></div>
        <section class="daily-case-panel__box" role="dialog" aria-modal="true" aria-label="Daily Case">
          <button class="daily-case-panel__close" type="button" aria-label="Close">
            <img src="/icons/ui/close.svg" alt="" aria-hidden="true">
          </button>
          <div class="daily-case-panel__floaters" data-daily-case-panel-floaters aria-hidden="true"></div>
          <div class="daily-case-panel__imagewrap">
            <img class="daily-case-panel__image" src="${DAILY_CASE_IMAGE}" alt="">
          </div>
          <div class="daily-case-panel__copy">
            <div class="daily-case-panel__title">Daily Case</div>
            <div class="daily-case-panel__text">Daily Case added to your inventory. Go to Profile to open it.</div>
          </div>
        </section>
      `;
      document.body.appendChild(panel);
      panel.querySelector('.daily-case-panel__backdrop')?.addEventListener('click', hideDailyCasePanel);
      panel.querySelector('.daily-case-panel__close')?.addEventListener('click', hideDailyCasePanel);
    }

    panel.dataset.dateKey = dateKey || todayLocalKey();
    renderDailyCasePanelFloaters(panel);
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('is-open'));
    haptic('success');
  }

  window.WildGiftDailyCasePanel = {
    show(dateKey = todayLocalKey()) {
      showDailyCasePanel(dateKey);
    },
    hide() {
      hideDailyCasePanel();
    }
  };

  window.addEventListener('daily-case-panel:test-activate', () => {
    showDailyCasePanel(todayLocalKey());
  });

  function hasUnopenedDailyCaseForDate(items, dateKey) {
    const key = String(dateKey || todayLocalKey());
    return (Array.isArray(items) ? items : []).some((item) =>
      isDailyCaseItem(item) &&
      String(item?.dailyCaseDate || key) === key &&
      item?.opened !== true &&
      !hasOpenedDailyCase(getTelegramUser().id, key)
    );
  }

  function makeLocalDailyCase(dateKey = todayLocalKey()) {
    const user = getTelegramUser();
    return {
      type: 'daily_case',
      id: 'daily_case',
      baseId: 'daily_case',
      name: 'Daily Case',
      title: 'Daily Case',
      icon: DAILY_CASE_IMAGE,
      image: DAILY_CASE_IMAGE,
      previewUrl: DAILY_CASE_IMAGE,
      instanceId: `local_daily_case_${user.id || 'guest'}_${dateKey}`,
      dailyCaseDate: dateKey,
      opened: false,
      price: { ton: 0, stars: 0 },
      acquiredAt: Date.now(),
      localOnly: true
    };
  }

  function withLocalhostDailyCase(items) {
    const arr = withoutExpiredDailyCases(items);
    if (!isLocalhostDailyCaseTestMode()) return arr;

    const dateKey = todayLocalKey();
    const existingIdx = arr.findIndex((item) =>
      isDailyCaseItem(item) &&
      String(item?.dailyCaseDate || dateKey) === dateKey
    );
    if (existingIdx >= 0) {
      arr[existingIdx] = { ...arr[existingIdx], opened: false };
      return arr;
    }

    return [{ ...makeLocalDailyCase(dateKey), instanceId: `localhost_daily_case_${dateKey}` }, ...arr];
  }

  function claimLocalDailyCaseFallback() {
    const user = getTelegramUser();
    const dateKey = todayLocalKey();
    if (hasOpenedDailyCase(user.id, dateKey)) return null;

    const current = readLocalInventory(user.id);
    const exists = current.some((item) =>
      isDailyCaseItem(item) &&
      String(item?.dailyCaseDate || '') === dateKey
    );
    const items = withLocalhostDailyCase(exists ? current : [makeLocalDailyCase(dateKey), ...current]);
    writeLocalInventory(user.id, items);
    renderInventory(items);

    if (!exists && !hasViewedDailyCase(user.id, dateKey)) {
      updateDailyCaseBadge(false);
      showDailyCasePanel(dateKey);
    } else {
      updateDailyCaseBadge(!hasViewedDailyCase(user.id, dateKey));
    }

    return { ok: true, localOnly: true, dateKey, items };
  }

  async function claimDailyCase() {
    if (dailyCaseClaimPromise) return dailyCaseClaimPromise;
    const user = getTelegramUser();
    if (!user?.id || String(user.id) === 'guest') return null;

    dailyCaseClaimPromise = (async () => {
      ensureDailyCaseBadges();
      let data = null;
      try {
        const r = await tgFetch('/api/daily-case/claim', { method: 'POST' });
        data = await r.json().catch(() => null);
        if (!r.ok || !data?.ok) return claimLocalDailyCaseFallback();
      } catch {
        return claimLocalDailyCaseFallback();
      }

      const items = Array.isArray(data.items) ? data.items : null;
      if (items) {
        writeLocalInventory(user.id, items);
        renderInventory(items);
      }

      const dateKey = String(data.dateKey || todayLocalKey());
      const hasUnopened = hasUnopenedDailyCaseForDate(items || lastInventory, dateKey);

      if (data.newlyClaimed) {
        updateDailyCaseBadge(false);
        showDailyCasePanel(dateKey);
      } else {
        updateDailyCaseBadge(hasUnopened && !hasViewedDailyCase(user.id, dateKey));
      }

      return data;
    })();

    return dailyCaseClaimPromise;
  }

  function pickDailyCaseReward() {
    const rewards = dailyCaseActiveRewards();
    return rewards[Math.floor(Math.random() * rewards.length)] || DAILY_CASE_REWARDS[0];
  }

  function dailyCaseRewardCurrency(currency = getCurrency()) {
    return currency === 'stars' ? 'stars' : 'ton';
  }

  function dailyCaseActiveRewards(currency = getCurrency()) {
    const rewardCurrency = dailyCaseRewardCurrency(currency);
    return DAILY_CASE_REWARDS.filter((reward) => reward?.type === 'gift' || reward?.type === rewardCurrency);
  }

  function dailyCaseCurrencyRewards(currency = getCurrency()) {
    const rewardCurrency = dailyCaseRewardCurrency(currency);
    return DAILY_CASE_REWARDS.filter((reward) => reward?.type === rewardCurrency);
  }

  function pickDailyCaseWinningReward(currency = getCurrency()) {
    const rewards = dailyCaseCurrencyRewards(currency);
    return rewards[Math.floor(Math.random() * rewards.length)] || DAILY_CASE_REWARDS[0];
  }

  function dailyCaseCurrencyRewardByAmount(amount, currency = getCurrency()) {
    const rewardCurrency = dailyCaseRewardCurrency(currency);
    const value = Number(amount);
    const rewards = dailyCaseCurrencyRewards(rewardCurrency);
    if (rewardCurrency === 'stars') {
      const normalized = String(Math.trunc(value || 0));
      return rewards.find((reward) =>
        String(Math.trunc(Number(reward.amount) || 0)) === normalized
      ) || pickDailyCaseWinningReward(rewardCurrency);
    }
    return rewards.find((reward) => Math.abs(Number(reward.amount) - value) < 0.000001) ||
      pickDailyCaseWinningReward(rewardCurrency);
  }

  function dailyCaseGiftModelUrl(giftName, modelName) {
    return `https://cdn.changes.tg/gifts/models/${encodeURIComponent(giftName)}/png/${encodeURIComponent(modelName)}.png`;
  }

  function normalizeDailyCaseGiftName(name) {
    return String(name || '').trim().toLowerCase();
  }

  function dailyCaseGiftNames() {
    return Array.from(new Set(
      DAILY_CASE_REWARDS
        .filter((reward) => reward?.type === 'gift')
        .map((reward) => String(reward.name || '').trim())
        .filter(Boolean)
    ));
  }

  function extractDailyCasePriceItems(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    const out = [];
    if (Array.isArray(payload.items)) out.push(...payload.items);
    if (Array.isArray(payload.prices)) out.push(...payload.prices);
    if (payload.prices && typeof payload.prices === 'object' && !Array.isArray(payload.prices)) {
      out.push(...Object.values(payload.prices));
    }
    return out;
  }

  function parseDailyCasePriceEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const rawTon = Number(
      entry.priceTon ??
      entry.price_ton ??
      entry.ton ??
      entry.floor_price ??
      entry.floorPrice ??
      entry.floor ??
      null
    );
    const rawStars = Number(entry.priceStars ?? entry.price_stars ?? entry.stars ?? null);
    const rawPrice = Number(entry.price ?? null);
    const currencyTag = String(entry.currency || entry.currencyCode || '').toUpperCase();

    let ton = Number.isFinite(rawTon) && rawTon > 0 ? rawTon : null;
    let stars = Number.isFinite(rawStars) && rawStars > 0 ? Math.round(rawStars) : null;

    if (Number.isFinite(rawPrice) && rawPrice > 0) {
      if (!stars && (currencyTag === 'XTR' || currencyTag === 'STAR' || currencyTag === 'STARS')) {
        stars = Math.round(rawPrice);
      } else if (!ton) {
        ton = rawPrice;
      }
    }

    if (!stars && ton) stars = tonToStars(ton);
    if (!ton && stars) ton = starsToTon(stars);
    if (!ton && !stars) return null;

    return { ton, stars };
  }

  function dailyCasePriceUrls(path, params = {}) {
    const urls = [];
    const addParams = (url) => {
      try {
        const next = new URL(url, window.location?.origin || document.baseURI);
        Object.entries(params).forEach(([key, value]) => next.searchParams.set(key, String(value)));
        return next.toString();
      } catch (_) {
        const query = new URLSearchParams(params).toString();
        return query ? `${url}?${query}` : url;
      }
    };

    try { urls.push(addParams(new URL(path.replace(/^\//, ''), document.baseURI).toString())); } catch (_) {}
    urls.push(addParams(path));
    urls.push(addParams(`http://localhost:7700${path}`));
    return Array.from(new Set(urls));
  }

  async function fetchDailyCasePricePayload(path, params = {}) {
    for (const url of dailyCasePriceUrls(path, params)) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) return await response.json();
      } catch (e) {
        console.warn(`[DailyCase] Failed to fetch price data from ${url}:`, e);
      }
    }
    return null;
  }

  async function loadDailyCaseGiftPrices({ force = false } = {}) {
    const now = Date.now();
    if (!force && dailyCasePriceMap.size && (now - dailyCasePricesLoadedAt) < DAILY_CASE_PRICE_CACHE_TTL) {
      return dailyCasePriceMap;
    }
    if (dailyCasePricesPromise) return dailyCasePricesPromise;

    dailyCasePricesPromise = (async () => {
      const payload = await fetchDailyCasePricePayload('/api/gifts/prices');
      const giftNames = dailyCaseGiftNames();
      const wanted = new Set(dailyCaseGiftNames().map(normalizeDailyCaseGiftName));
      for (const item of extractDailyCasePriceItems(payload)) {
        const name = String(item?.name || item?.title || item?.gift || item?.key || '').trim();
        const normalized = normalizeDailyCaseGiftName(name);
        if (!wanted.has(normalized)) continue;
        const price = parseDailyCasePriceEntry(item);
        if (price) dailyCasePriceMap.set(normalized, price);
      }

      const missing = giftNames.filter((name) => !dailyCasePriceMap.has(normalizeDailyCaseGiftName(name)));
      await Promise.all(missing.map(async (name) => {
        const singlePayload = await fetchDailyCasePricePayload('/api/gifts/price', { name });
        const item = singlePayload?.item || singlePayload;
        const price = parseDailyCasePriceEntry(item);
        if (price) dailyCasePriceMap.set(normalizeDailyCaseGiftName(name), price);
      }));

      dailyCasePricesLoadedAt = Date.now();
      return dailyCasePriceMap;
    })().finally(() => {
      dailyCasePricesPromise = null;
    });

    return dailyCasePricesPromise;
  }

  function dailyCaseServerPrice(reward) {
    if (reward?.type !== 'gift') return null;
    return dailyCasePriceMap.get(normalizeDailyCaseGiftName(reward?.name));
  }

  function dailyCaseRewardPriceValue(reward, currency = getCurrency()) {
    const serverPrice = dailyCaseServerPrice(reward);
    const value = Number((reward?.type === 'gift' ? serverPrice?.[currency] : reward?.price?.[currency]) || 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function formatDailyCaseCompactPrice(value, currency = getCurrency()) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '...';
    if (n >= 1000000) return `${(Math.round(n / 100000) / 10).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '')}m`;
    if (n >= 1000) return `${(Math.round(n / 100) / 10).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
    if (currency === 'stars') return String(Math.max(1, Math.round(n)));
    if (n >= 100) return String(Math.round(n));
    if (n >= 10) return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
    return String(Math.round(n * 100) / 100).replace(/\.?0+$/, '');
  }

  function dailyCaseRewardPriceLabel(reward) {
    const currency = getCurrency();
    const value = dailyCaseRewardPriceValue(reward, currency);
    if (reward?.type === 'gift' && (!Number.isFinite(value) || value <= 0)) return 'Loading';
    return formatDailyCaseCompactPrice(value, currency);
  }

  function dailyCaseRewardCompactPriceLabel(reward) {
    const currency = getCurrency();
    return formatDailyCaseCompactPrice(dailyCaseRewardPriceValue(reward, currency), currency);
  }

  function dailyCaseRewardPriceIcon(currency = getCurrency(), white = false) {
    const normalized = currency === 'stars' ? 'stars' : 'ton';
    if (white) return normalized === 'ton' ? DAILY_CASE_TON_WHITE_ICON : DAILY_CASE_STAR_WHITE_ICON;
    return normalized === 'ton' ? '/icons/currency/ton.svg' : DAILY_CASE_STAR_ICON;
  }

  function dailyCaseRewardById(id) {
    const key = String(id || '');
    return DAILY_CASE_REWARDS.find((reward) => String(reward?.id || '') === key) || null;
  }

  function updateDailyCaseRewardPricePills(root = dailyCaseSheet) {
    if (!root) return;
    root.querySelectorAll('[data-daily-case-price-id]').forEach((pill) => {
      const reward = dailyCaseRewardById(pill.getAttribute('data-daily-case-price-id'));
      if (!reward) return;
      const label = pill.querySelector('[data-daily-case-price-label]');
      const icon = pill.querySelector('[data-daily-case-price-icon]');
      if (label) label.textContent = dailyCaseRewardCompactPriceLabel(reward);
      if (icon) icon.src = dailyCaseRewardPriceIcon(getCurrency(), true);
    });
  }

  function dailyCaseContentRowHtml(reward) {
    return `
      <div class="daily-case-inside-card">
        <div class="daily-case-inside-card__visual">
          <img src="${escapeHtml(reward?.image || DAILY_CASE_IMAGE)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${DAILY_CASE_IMAGE}'">
        </div>
        <div class="daily-case-inside-card__name">${escapeHtml(reward?.name || 'Prize')}</div>
        <div class="daily-case-inside-card__price">
            <span>${escapeHtml(dailyCaseRewardPriceLabel(reward))}</span>
            <img src="${dailyCaseRewardPriceIcon(getCurrency(), true)}" alt="">
        </div>
      </div>
    `;
  }

  function renderDailyCaseInsideList() {
    const list = dailyCaseSheet?.querySelector?.('[data-daily-case-inside-list]');
    if (!list) return;
    list.innerHTML = dailyCaseActiveRewards().map((reward) => dailyCaseContentRowHtml(reward)).join('');
  }

  function dailyCaseRewardHtml(reward, extraClass = '') {
    const isStars = reward?.type === 'stars';
    const isTon = reward?.type === 'ton';
    const rewardType = isStars ? 'stars' : (isTon ? 'ton' : 'nft');
    return `
      <div class="daily-case-reward case-carousel-item ${extraClass}" data-reward-type="${escapeHtml(reward?.type || 'gift')}" data-item-type="${rewardType}">
        <div class="daily-case-reward__visual">
          <img class="case-carousel-item__img" src="${escapeHtml(reward?.image || DAILY_CASE_IMAGE)}" alt="" loading="eager" decoding="async" onerror="this.onerror=null;this.src='${DAILY_CASE_IMAGE}'">
          <div class="daily-case-reward__price" data-daily-case-price-id="${escapeHtml(reward?.id || '')}">
            <span data-daily-case-price-label>${escapeHtml(dailyCaseRewardCompactPriceLabel(reward))}</span>
            <img data-daily-case-price-icon src="${escapeHtml(dailyCaseRewardPriceIcon(getCurrency(), true))}" alt="">
          </div>
        </div>
        <div class="daily-case-reward__name">${escapeHtml(reward?.name || 'Prize')}</div>
      </div>
    `;
  }

  function lockDailyCaseSheetScreen() {
    document.documentElement.classList.add('case-sheet-open', 'daily-case-sheet-open');
    document.body.classList.add('case-sheet-open', 'daily-case-sheet-open');
  }

  function unlockDailyCaseSheetScreen() {
    document.documentElement.classList.remove('case-sheet-open', 'daily-case-sheet-open');
    document.body.classList.remove('case-sheet-open', 'daily-case-sheet-open');
  }

  function openDailyCaseInsideSheet() {
    const sheet = ensureDailyCaseSheet();
    const inside = sheet.querySelector('[data-daily-case-inside]');
    if (!inside) return;
    renderDailyCaseInsideList();
    loadDailyCaseGiftPrices().then(() => {
      renderDailyCaseInsideList();
      updateDailyCaseRewardPricePills();
    }).catch((e) => console.warn('[DailyCase] price load failed:', e));
    inside.hidden = false;
    requestAnimationFrame(() => inside.classList.add('is-open'));
    haptic('light');
  }

  function closeDailyCaseInsideSheet() {
    const sheet = dailyCaseSheet;
    const inside = sheet?.querySelector?.('[data-daily-case-inside]');
    if (!inside) return;
    inside.classList.remove('is-open');
    window.setTimeout(() => {
      if (!inside.classList.contains('is-open')) inside.hidden = true;
    }, 240);
  }

  function ensureDailyCaseSheet() {
    if (dailyCaseSheet) return dailyCaseSheet;

    const sheet = document.createElement('div');
    sheet.id = 'dailyCaseSheet';
    sheet.className = 'daily-case-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="daily-case-sheet__overlay" data-daily-case-close="1"></div>
      <div class="daily-case-sheet__panel" role="dialog" aria-modal="true" aria-label="Daily Case">
        <div class="daily-case-sheet__header">
          <h2>Daily Case</h2>
          <button class="daily-case-sheet__close" type="button" aria-label="Close" data-daily-case-close="1">
            <img src="/icons/ui/close.svg" alt="" aria-hidden="true">
          </button>
        </div>

        <div class="daily-case-sheet__hero">
          <img src="${DAILY_CASE_IMAGE}" alt="">
        </div>

        <div class="daily-case-sheet__carousels case-carousels-wrapper case-carousels-wrapper--count-1" data-daily-case-carousels></div>

        <section class="daily-case-sheet__contents" aria-label="Daily case contents">
          <h3>Contents</h3>
          <div class="daily-case-sheet__grid">
            ${dailyCaseActiveRewards().map((reward) => dailyCaseRewardHtml(reward)).join('')}
          </div>
        </section>

        <button class="daily-case-inside-pill" type="button" data-daily-case-inside-open>What's inside?</button>

        <div class="daily-case-sheet__bottom case-bottom-button">
          <button class="daily-case-sheet__open case-open-btn" type="button" data-daily-case-open>Open</button>
        </div>

        <div class="daily-case-inside-sheet" data-daily-case-inside hidden>
          <div class="daily-case-inside-sheet__overlay" data-daily-case-inside-close></div>
          <section class="daily-case-inside-sheet__panel" aria-label="What's inside?">
            <div class="daily-case-inside-sheet__grabber"></div>
            <div class="daily-case-inside-sheet__head">
              <h3>What's inside?</h3>
              <button class="daily-case-inside-sheet__close" type="button" data-daily-case-inside-close aria-label="Close">
                <img src="/icons/ui/close.svg" alt="" aria-hidden="true">
              </button>
            </div>
            <div class="daily-case-inside-sheet__list" data-daily-case-inside-list></div>
            <button class="daily-case-inside-sheet__bottom-close" type="button" data-daily-case-inside-close>Close</button>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(sheet);
    sheet.querySelectorAll('[data-daily-case-close]').forEach((el) => {
      el.addEventListener('click', () => closeDailyCaseSheet());
    });
    sheet.querySelector('[data-daily-case-open]')?.addEventListener('click', () => openDailyCaseRewards());
    sheet.querySelector('[data-daily-case-inside-open]')?.addEventListener('click', () => openDailyCaseInsideSheet());
    sheet.querySelectorAll('[data-daily-case-inside-close]').forEach((el) => {
      el.addEventListener('click', () => closeDailyCaseInsideSheet());
    });
    dailyCaseSheet = sheet;
    return sheet;
  }

  function closeDailyCaseSheet() {
    if (dailyCaseOpening) return;
    const sheet = ensureDailyCaseSheet();
    closeDailyCaseInsideSheet();
    sheet.hidden = true;
    sheet.classList.remove('is-ready', 'is-opening', 'is-finished');
    unlockDailyCaseSheetScreen();
  }

  function openDailyCaseSheet(item = null) {
    const dateKey = String(item?.dailyCaseDate || todayLocalKey());
    if (hasOpenedDailyCase(getTelegramUser().id, dateKey)) {
      showToast('Daily Case already opened.');
      return;
    }

    const sheet = ensureDailyCaseSheet();
    sheet.classList.remove('is-opening', 'is-finished');
    sheet.classList.add('is-ready');
    dailyCaseOpening = false;
    sheet.dataset.opened = '0';
    sheet.dataset.dateKey = dateKey;
    sheet.dataset.instanceId = String(item?.instanceId || '');
    sheet.hidden = false;
    lockDailyCaseSheetScreen();
    renderDailyCaseIdleRolls();
    loadDailyCaseGiftPrices().then(() => {
      updateDailyCaseRewardPricePills(sheet);
      renderDailyCaseInsideList();
    }).catch((e) => console.warn('[DailyCase] price preload failed:', e));
    const openBtn = sheet.querySelector('[data-daily-case-open]');
    if (openBtn) {
      openBtn.disabled = false;
      openBtn.textContent = 'Open';
    }
    haptic('light');
  }

  function makeDailyCaseStrip(winner, rowIndex) {
    const strip = [];
    const rewards = dailyCaseActiveRewards();
    for (let i = 0; i < 46; i++) {
      strip.push(rewards[(i + rowIndex * 3 + Math.floor(Math.random() * rewards.length)) % rewards.length]);
    }
    strip.push(winner);
    for (let i = 0; i < 8; i++) strip.push(pickDailyCaseReward());
    return strip;
  }

  function makeDailyCaseIdleStrip(rowIndex = 0) {
    const strip = [];
    const rewards = dailyCaseActiveRewards();
    for (let i = 0; i < 18; i++) {
      strip.push(rewards[(i + rowIndex * 2) % rewards.length]);
    }
    return strip.concat(strip);
  }

  function dailyCaseRollHtml(strip, rowIndex = 0, winnerIndex = -1) {
    return `
      <div class="daily-case-roll case-carousel active" data-row="${rowIndex}" data-winner-index="${winnerIndex}">
        <div class="daily-case-roll__items case-carousel-items">
          ${strip.map((reward, itemIdx) => dailyCaseRewardHtml(reward, itemIdx === winnerIndex ? 'daily-case-reward--winner winning' : '')).join('')}
        </div>
        <div class="daily-case-roll__line case-carousel-indicator" aria-hidden="true"></div>
      </div>
    `;
  }

  function renderDailyCaseIdleRolls() {
    const sheet = ensureDailyCaseSheet();
    const carousels = sheet.querySelector('[data-daily-case-carousels]');
    if (!carousels) return;
    carousels.innerHTML = dailyCaseRollHtml(makeDailyCaseIdleStrip(0), 0);
    requestAnimationFrame(() => {
      const items = carousels.querySelector('.daily-case-roll__items');
      if (!items) return;
      const children = Array.from(items.children || []);
      const halfIdx = Math.floor(children.length / 2);
      const first = children[0];
      const middle = children[halfIdx];
      const measured = first && middle ? Number(middle.offsetLeft || 0) - Number(first.offsetLeft || 0) : 0;
      const distance = Math.max(260, Math.round(measured || (items.scrollWidth || 0) / 2));
      items.style.setProperty('--daily-case-idle-distance', `${distance}px`);
    });
  }

  async function commitDailyCaseOpen(instanceId, fallbackWinner) {
    const user = getTelegramUser();
    const inst = String(instanceId || '').trim();
    const rewardCurrency = dailyCaseRewardCurrency();
    const fallbackAmount = Number(fallbackWinner?.amount || (rewardCurrency === 'ton' ? 0.02 : 2));
    const fallbackReward = dailyCaseCurrencyRewardByAmount(fallbackAmount, rewardCurrency);

    if (inst) {
      try {
        const r = await tgFetch('/api/daily-case/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceId: inst, currency: rewardCurrency, rewardAmount: fallbackAmount })
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j?.ok) {
          const responseCurrency = dailyCaseRewardCurrency(j?.reward?.currency || j?.currency || rewardCurrency);
          const rewardAmount = Number(j?.reward?.amount || j?.amount || fallbackAmount);
          const winner = dailyCaseCurrencyRewardByAmount(rewardAmount, responseCurrency);
          if (Array.isArray(j.items)) {
            writeLocalInventory(user.id, j.items);
            renderInventory(j.items);
          }
          const nextBalance = responseCurrency === 'ton'
            ? (Number.isFinite(Number(j.tonBalance)) ? Number(j.tonBalance) : Number(j.newBalance))
            : (Number.isFinite(Number(j.starsBalance)) ? Number(j.starsBalance) : Number(j.newBalance));
          if (Number.isFinite(nextBalance)) setBalance(responseCurrency, nextBalance);
          return { winner, committed: true };
        }
      } catch {}
    }

    if (inst) {
      const localLeft = lastInventory.filter((item) => String(item?.instanceId || '') !== inst);
      writeLocalInventory(user.id, localLeft);
      renderInventory(localLeft);
    }
    addBalance(rewardCurrency, fallbackAmount);
    return { winner: fallbackReward, committed: false };
  }

  async function openDailyCaseRewards() {
    const sheet = ensureDailyCaseSheet();
    if (dailyCaseOpening || sheet.hidden) return;
    if (sheet.dataset.opened === '1') {
      closeDailyCaseSheet();
      return;
    }

    dailyCaseOpening = true;
    sheet.dataset.opened = '0';
    const openBtn = sheet.querySelector('[data-daily-case-open]');
    const carousels = sheet.querySelector('[data-daily-case-carousels]');
    const count = 1;
    const fallbackWinner = pickDailyCaseWinningReward();

    if (openBtn) {
      openBtn.disabled = true;
      openBtn.textContent = 'Opening...';
    }

    const commit = await commitDailyCaseOpen(sheet.dataset.instanceId || '', fallbackWinner);
    const winners = Array.from({ length: count }, () => commit.winner || fallbackWinner);
    sheet.classList.add('is-opening');
    sheet.classList.remove('is-finished');
    sheet.classList.remove('is-ready');

    carousels.innerHTML = winners.map((winner, idx) => {
      const strip = makeDailyCaseStrip(winner, idx);
      return dailyCaseRollHtml(strip, idx, 46);
    }).join('');

    const rolls = Array.from(carousels.querySelectorAll('.daily-case-roll'));
    requestAnimationFrame(() => {
      rolls.forEach((roll, idx) => {
        const items = roll.querySelector('.daily-case-roll__items');
        const winnerEl = roll.querySelector('.daily-case-reward--winner');
        if (!items || !winnerEl) return;
        const rollRect = roll.getBoundingClientRect();
        const winRect = winnerEl.getBoundingClientRect();
        const offset = (winRect.left + winRect.width / 2) - (rollRect.left + rollRect.width / 2);
        items.style.transitionDuration = `${4.8 + idx * 0.35}s`;
        items.style.transform = `translate3d(${-offset}px, 0, 0)`;
      });
    });

    setTimeout(() => {
      rolls.forEach((roll) => roll.classList.add('is-finished'));
      if (openBtn) {
        openBtn.disabled = false;
        openBtn.textContent = 'Done';
      }
      sheet.dataset.opened = '1';
      sheet.classList.remove('is-opening');
      sheet.classList.add('is-finished');
      markDailyCaseOpened(sheet.dataset.dateKey || todayLocalKey());
      dailyCaseOpening = false;
      haptic('success');
    }, 5600);
  }

  function readLocalInventory(userId) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + userId);
      const arr = raw ? JSON.parse(raw) : [];
      const clean = withoutExpiredDailyCases(arr);
      if (Array.isArray(arr) && clean.length !== arr.length) writeLocalInventory(userId, clean);
      return clean;
    } catch {
      return [];
    }
  }

  function writeLocalInventory(userId, items) {
    try {
      localStorage.setItem(LS_PREFIX + userId, JSON.stringify(withoutExpiredDailyCases(items)));
    } catch {}
  }

  // ====== HELPERS ======
  function haptic(type = 'light') {
    try {
      const hf = tg?.HapticFeedback;
      if (!hf) return;
      // Telegram supports notification haptics for success/error/warning
      if (['success', 'error', 'warning'].includes(type) && typeof hf.notificationOccurred === 'function') {
        hf.notificationOccurred(type);
        return;
      }
      hf.impactOccurred?.(type);
    } catch {}
  }

  function showToast(msg) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg); return; } catch {}
    }
    if (tg?.showPopup) { 
      try { tg.showPopup({ message: msg }); return; } catch {} 
    }
    if (tg?.showAlert) { 
      try { tg.showAlert(msg); return; } catch {} 
    }
    try { alert(msg); } catch {}
  }

  function showCopyToast(msg) {
    const text = String(msg || 'Copied to clipboard.').trim() || 'Copied to clipboard.';
    if (typeof window.showCopyToast === 'function') {
      try {
        const shown = window.showCopyToast(text, { ttl: 1800, translate: false });
        if (shown) return true;
      } catch {}
    }
    showToast(text);
    return false;
  }

  async function copyTextToClipboard(text) {
    const value = String(text || '').trim();
    if (!value) return false;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {}

    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!copied;
    } catch {
      return false;
    }
  }

  async function copyWithFeedback(value, successMessage = 'Copied to clipboard.') {
    const copied = await copyTextToClipboard(value);
    if (copied) {
      showCopyToast(successMessage);
      return true;
    }
    showToast('Copy failed');
    return false;
  }

  function getCurrency() {
    return window.WildTimeCurrency?.current || 'ton';
  }

  function currencyIcon(currency) {
    return currency === 'stars' ? '⭐' : '💎';
  }
 


  const NFT_DISPLAY_NAME_BY_ICON = {
    'RaketaNFT.png': 'Stellar Rocket',
    'RamenNFT.png': 'Instant Ramen',
    'IceCreamNFT.png': 'Ice Cream',
    'BerryBoxNFTSkin.png': 'Berry Box',
    'LolPopNFTSkin.png': 'Lol Pop',
    'CookieHeartNFTSkin.png': 'Cookie Heart',
    'MousseCakeNFTSkin.png': 'Mousse Cake',
    'IceCreamNFtSkin.png': 'Ice Cream'
  };
  
  function itemDisplayName(item) {
    if (!item) return 'Item';
    if (isDailyCaseItem(item)) return 'Daily Case';
    const t = itemType(item);
    const icon = String(item.icon || '');
    if (t === 'nft' && NFT_DISPLAY_NAME_BY_ICON[icon]) return NFT_DISPLAY_NAME_BY_ICON[icon];
    return String(item.name || item.title || item.baseId || item.id || 'Item');
  }

  

  
  function itemType(item) {
    if (isDailyCaseItem(item)) return 'daily_case';
    if (item?.type) return item.type;
    const id = String(item?.baseId || item?.id || '');
    return id.startsWith('nft') ? 'nft' : 'gift';
  }

  function itemKey(item, idx) {
    return String(
      item?.uid ||
      item?.instanceId ||
      item?.claimId ||
      item?.txId ||
      item?._id ||
      (item?.baseId || item?.id ? `${item.baseId || item.id}_${item?.ts || item?.createdAt || idx}` : `idx_${idx}`)
    );
  }

  const INVENTORY_NAMED_FALLBACKS = [
    { path: '/images/gifts/marketFilters/lolpopFallback.svg', tokens: ['lol pop', 'lolpop', 'lol-pop'] },
    { path: '/images/gifts/marketFilters/poolfloatFallback.svg', tokens: ['pool float', 'poolfloat', 'pool-float'] },
    { path: '/images/gifts/marketFilters/snoopdoggFallback.svg', tokens: ['snoop dogg', 'snoopdogg', 'snoop-dogg'] },
    { path: '/images/gifts/marketFilters/xmasstockingFallback.svg', tokens: ['xmas stocking', 'xmasstocking', 'xmas-stocking'] },
    { path: '/images/gifts/marketFilters/moodpackFallback.svg', tokens: ['mood pack', 'moodpack', 'mood-pack', 'mood0ack'] },
    { path: '/images/gifts/marketFilters/instantramenFallback.svg', tokens: ['instant ramen', 'instantramen', 'instant-ramen'] },
    { path: '/images/gifts/marketFilters/petsnakeFallback.svg', tokens: ['pet snake', 'petsnake', 'pet-snake'] },
    { path: '/images/gifts/marketFilters/icecreamFallback.svg', tokens: ['ice cream', 'icecream', 'ice-cream'] },
    { path: '/images/gifts/marketFilters/stellarrocketFallback.svg', tokens: ['stellar rocket', 'stellarrocket', 'stellar-rocket'] },
    { path: '/images/gifts/marketFilters/gingercookieFallback.svg', tokens: ['ginger cookie', 'gingercookie', 'ginger-cookie'] },
    { path: '/images/gifts/marketFilters/freshsocksFallback.svg', tokens: ['fresh socks', 'freshsocks', 'fresh-socks'] },
    { path: '/images/gifts/marketFilters/winterwreathFallback.svg', tokens: ['winter wreath', 'winterwreath', 'winter-wreath'] }
  ];

  function safeVisualRef(v, max = 220000) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    if (s.startsWith('data:')) return s;
    return s.length > max ? s.slice(0, max) : s;
  }

  function safeHexColor(v) {
    const s = String(v ?? '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '';
  }

  function fragmentPreviewUrlFromSlug(slug, size = 'medium') {
    const s = String(slug ?? '').trim();
    if (!s) return '';
    const base = s.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    if (!base) return '';
    const variant = String(size || 'medium').toLowerCase() === 'large' ? 'large' : 'medium';
    return `https://nft.fragment.com/gift/${base}.${variant}.jpg`;
  }

  function nextFragmentPreviewFallback(url) {
    const s = String(url ?? '').trim();
    if (!s) return '';
    const m = s.match(/^(https:\/\/nft\.fragment\.com\/gift\/[a-z0-9-]+)\.(small|medium|large)\.(jpg|jpeg)(\?.*)?$/i);
    if (!m) return '';
    const base = m[1];
    const size = String(m[2] || '').toLowerCase();
    const ext = String(m[3] || '').toLowerCase();
    const suffix = m[4] || '';
    if (size === 'large' && ext === 'jpg') return `${base}.large.jpeg${suffix}`;
    if (size === 'large' && ext === 'jpeg') return `${base}.medium.jpg${suffix}`;
    if (size === 'medium' && ext === 'jpg') return `${base}.medium.jpeg${suffix}`;
    return '';
  }

  function normalizeLegacyIcon(rawIcon, item) {
    const icon = String(rawIcon ?? '').trim();
    if (!icon) return '';
    if (icon.startsWith('data:')) return icon;
    if (icon.startsWith('http://') || icon.startsWith('https://')) return icon;
    if (icon.startsWith('/')) return icon;
    const t = itemType(item);
    if (t === 'nft') return `/images/gifts/nfts/${icon}`;
    return `/images/gifts/${icon}`;
  }

  function inventoryFallbackImageByItem(item) {
    if (isDailyCaseItem(item)) return DAILY_CASE_IMAGE;
    const tgData = item?.tg && typeof item.tg === 'object' ? item.tg : null;
    const sample = [
      String(item?.name || '').toLowerCase(),
      String(item?.id || '').toLowerCase(),
      String(tgData?.slug || '').toLowerCase()
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ');

    if (!sample) return '';
    for (let i = 0; i < INVENTORY_NAMED_FALLBACKS.length; i++) {
      const rule = INVENTORY_NAMED_FALLBACKS[i];
      if (!rule || !rule.path || !Array.isArray(rule.tokens)) continue;
      for (let j = 0; j < rule.tokens.length; j++) {
        const token = String(rule.tokens[j] || '').trim().toLowerCase();
        if (token && sample.includes(token)) return rule.path;
      }
    }
    return '';
  }

  function itemVisual(item) {
    if (isDailyCaseItem(item)) {
      return {
        src: DAILY_CASE_IMAGE,
        fallbackQueue: ['/icons/app/market.webp']
      };
    }

    const tgData = item?.tg && typeof item.tg === 'object' ? item.tg : null;
    const previewSrc =
      safeVisualRef(item?.previewUrl) ||
      safeVisualRef(tgData?.previewUrl) ||
      safeVisualRef(fragmentPreviewUrlFromSlug(tgData?.slug, 'medium')) ||
      '';
    const iconSrc = safeVisualRef(normalizeLegacyIcon(item?.icon, item));
    const modelImg = safeVisualRef(tgData?.model?.image);
    const itemImg = safeVisualRef(item?.image || item?.img);
    const namedFallback = safeVisualRef(inventoryFallbackImageByItem(item));

    const fallbackQueue = [];
    if (modelImg) fallbackQueue.push(modelImg);
    if (itemImg) fallbackQueue.push(itemImg);
    if (iconSrc) fallbackQueue.push(iconSrc);
    if (previewSrc) {
      const nextPreview = nextFragmentPreviewFallback(previewSrc);
      if (nextPreview) fallbackQueue.push(nextPreview);
    }
    if (namedFallback) fallbackQueue.push(namedFallback);
    fallbackQueue.push('/icons/app/market.webp');

    return {
      src: previewSrc || iconSrc || modelImg || itemImg || namedFallback || '/icons/app/market.webp',
      fallbackQueue
    };
  }

  function itemIconPath(item) {
    return itemVisual(item).src;
  }

  function itemBackdropVisual(item) {
    const backdrop = (item?.tg && typeof item.tg === 'object') ? item.tg.backdrop : null;
    if (!backdrop || typeof backdrop !== 'object') return { isCollectible: false, style: '' };
    const center = safeHexColor(backdrop.center) || '#5f5f5f';
    const edge = safeHexColor(backdrop.edge) || '#2a2a2a';
    if (!center && !edge) return { isCollectible: false, style: '' };
    return {
      isCollectible: true,
      style: `--inv-bg-center:${center};--inv-bg-edge:${edge};`
    };
  }



  const TON_FOR_50_STARS = 0.4332;
    const STARS_FOR_50 = 50;
    const STARS_PER_TON = STARS_FOR_50 / TON_FOR_50_STARS;
    const TON_PER_STAR = TON_FOR_50_STARS / STARS_FOR_50;

    function tonToStars(ton) {
      const v = Number(ton);
      if (!Number.isFinite(v) || v <= 0) return 0;
      return Math.max(0, Math.round(v * STARS_PER_TON));
    }
    function starsToTon(stars) {
      const v = Number(stars);
      if (!Number.isFinite(v) || v <= 0) return 0;
      return Math.max(0, Math.round(v * TON_PER_STAR * 100) / 100);
    }

  function itemValue(item, currency) {
  if (isDailyCaseItem(item)) return 0;
  const v = item?.price?.[currency];
  let n = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : NaN);

  // fallback: если нет stars — считаем из ton, и наоборот
  if (!Number.isFinite(n) || n <= 0) {
    if (currency === 'stars') {
      const t = item?.price?.ton;
      const ton = typeof t === 'string' ? parseFloat(t) : (typeof t === 'number' ? t : NaN);
      if (Number.isFinite(ton) && ton > 0) n = tonToStars(ton);
    } else {
      const s = item?.price?.stars;
      const stars = typeof s === 'string' ? parseFloat(s) : (typeof s === 'number' ? s : NaN);
      if (Number.isFinite(stars) && stars > 0) n = starsToTon(stars);
    }
  }

  if (!Number.isFinite(n)) return 0;
  return currency === 'ton' ? Math.round(n * 100) / 100 : Math.round(n);
}


  function setBalance(currency, value) {
    if (window.WildTimeCurrency?.setBalance) {
      window.WildTimeCurrency.setBalance(currency, value);
    }
    window.dispatchEvent(new CustomEvent('balance:update', { detail: currency === 'ton' ? { ton: value } : { stars: value } }));
  }

  function addBalance(currency, delta) {
    const cur = window.WildTimeCurrency?.balance?.[currency] ?? 0;
    const next = currency === 'ton'
      ? Math.max(0, Math.round((parseFloat(cur) + delta) * 100) / 100)
      : Math.max(0, Math.round(parseFloat(cur) + delta));
    setBalance(currency, next);
    return next;
  }

  async function postDeposit(delta, currency, userId, type = 'inventory_sell') {
    const initData = tg?.initData || '';
    const depositId = `${type}_${userId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    try {
      const r = await fetch('/api/deposit-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: delta,
          currency,
          userId,
          initData,
          timestamp: Date.now(),
          depositId,
          type,
          notify: false
        })
      });
      await r.json().catch(() => null);
    } catch {}
  }

  // ====== USER UI ======
  function updateUserUI() {
    const user = getTelegramUser();
  
    if (profileName) profileName.textContent = user.first_name || user.username || 'Guest';
    if (profileHandle) profileHandle.textContent = user.username ? `@${user.username}` : `ID: ${user.id || 'Unknown'}`;
  
    const avatarEls = [
      document.getElementById('userAvatarImg'),
      document.getElementById('profileAvatar'),
      document.getElementById('navProfileAvatar'),
    ].filter(Boolean);
  
    const tgUrl = user.photo_url && String(user.photo_url).trim() ? user.photo_url : null;
    const apiUrl = (user.id && user.id !== 'guest') ? `/api/tg/photo/${user.id}?t=${Date.now()}` : null;
  
    const finalUrl = tgUrl || apiUrl || '/images/avatar-default.png';
  
    avatarEls.forEach((img) => {
      img.src = finalUrl;
      img.onerror = () => { img.src = '/images/avatar-default.png'; };
    });
  }

  // ====== WALLET UI ======
  function shortAddr(addr) {
    if (!addr || typeof addr !== 'string') return '';
    if (addr.length <= 10) return addr;
    return addr.slice(0, 4) + '…' + addr.slice(-4);
  }

  function nanoToTon(nanoStr) {
    try {
      const nano = BigInt(String(nanoStr || '0'));
      return (Number(nano) / 1_000_000_000).toFixed(2);
    } catch {
      return null;
    }
  }

  async function fetchTonWalletBalance(address) {
    if (!walletDisconnectBalance) return;
    if (!address) {
      walletDisconnectBalance.textContent = '—';
      return;
    }

    try {
      walletDisconnectBalance.textContent = 'Loading...';
      // Prefer same-origin endpoint to avoid CORS issues inside Telegram WebView
      try {
        const r1 = await fetch(`/api/ton/balance?address=${encodeURIComponent(address)}`);
        const j1 = await r1.json().catch(() => null);
        if (r1.ok && j1?.ok && (j1?.nano || j1?.result || j1?.ton)) {
          const nano = j1.nano ?? j1.result;
          const tonText = j1.ton ?? (nano ? nanoToTon(nano) : null);
          walletDisconnectBalance.textContent = tonText ? `${tonText} TON` : '—';
          return;
        }
      } catch {}

      // Fallback (may be blocked by CORS in some environments)
      const res = await fetch(`https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      const ton = data?.ok && data?.result ? nanoToTon(data.result) : null;
      walletDisconnectBalance.textContent = ton ? `${ton} TON` : '—';
    } catch (e) {
      console.warn('[Profile] Wallet balance error:', e);
      walletDisconnectBalance.textContent = '—';
    }
  }

  function getWalletAddress() {
    return (
      window.WildTimeTonConnect?.getAddress?.() ||
      window.WildTimeTonConnect?.address ||
      window.tonConnectUI?.account?.address ||
      null
    );
  }

  async function openWalletConnect() {
    let lastError = null;

    try {
      if (typeof window.WildTimeTonConnect?.connect === 'function') {
        await window.WildTimeTonConnect.connect();
        return true;
      }
    } catch (err) {
      lastError = err;
    }

    try {
      if (typeof window.WildTimeTonConnect?.openModal === 'function') {
        await window.WildTimeTonConnect.openModal();
        return true;
      }
    } catch (err) {
      lastError = err;
    }

    try {
      if (typeof window.tonConnectUI?.openModal === 'function') {
        await window.tonConnectUI.openModal();
        return true;
      }
    } catch (err) {
      lastError = err;
    }

    if (lastError) {
      console.warn('[Profile] Connect wallet failed:', lastError?.message || lastError);
    } else {
      console.warn('[Profile] Connect wallet failed: TonConnect is unavailable');
    }

    showToast('Failed to connect wallet');
    return false;
  }

  async function doDisconnect() {
    try {
      if (typeof window.WildTimeTonConnect?.disconnect === 'function') {
        await window.WildTimeTonConnect.disconnect();
        return;
      }
    } catch {}

    try {
      if (typeof window.tonConnectUI?.disconnect === 'function') {
        await window.tonConnectUI.disconnect();
        return;
      }
    } catch {}
  }

  function openDisconnectModal(addr) {
    if (!walletDisconnectModal) return;
    if (walletDisconnectAddr) walletDisconnectAddr.textContent = shortAddr(addr || '—');
    if (walletDisconnectCopy) walletDisconnectCopy.dataset.addr = addr || '';
    // load actual TON wallet balance into modal
    fetchTonWalletBalance(addr);
    walletDisconnectModal.hidden = false;
    haptic('light');
  }

  function closeDisconnectModal() {
    if (!walletDisconnectModal) return;
    walletDisconnectModal.hidden = true;
  }

  function updateWalletUI() {
    const addr = getWalletAddress();
    const connected = !!addr;

    if (walletCardDetails) walletCardDetails.hidden = true;
    if (walletCardToggle) walletCardToggle.hidden = true;

    if (connected) {
      if (walletCardStatus) {
        walletCardStatus.textContent = shortAddr(addr);
        walletCardStatus.style.cursor = 'pointer';
        walletCardStatus.style.fontWeight = '700';
        walletCardStatus.style.letterSpacing = '0.3px';
        walletCardStatus.onclick = async () => {
          await copyWithFeedback(addr, 'Wallet copied to clipboard.');
          haptic('light');
        };
      }

      if (walletCardConnect) walletCardConnect.hidden = true;

      if (walletHeaderDisconnect) {
        walletHeaderDisconnect.hidden = false;
        walletHeaderDisconnect.textContent = 'Disconnect';
      }
    } else {
      if (walletCardStatus) {
        walletCardStatus.textContent = 'Not connected';
        walletCardStatus.style.cursor = 'default';
        walletCardStatus.style.fontWeight = '600';
        walletCardStatus.style.letterSpacing = '0';
        walletCardStatus.onclick = null;
      }

      if (walletCardConnect) walletCardConnect.hidden = false;
      if (walletHeaderDisconnect) walletHeaderDisconnect.hidden = true;
    }

    if (walletCardAddress) walletCardAddress.textContent = connected ? addr : '—';
  }

  // ====== WALLET EVENT LISTENERS ======
  function setupWalletListeners() {
    if (profileConnectWalletBtn) {
      profileConnectWalletBtn.addEventListener('click', async () => {
        haptic('medium');
        await openWalletConnect();
      });
    }

    if (walletHeaderDisconnect) {
      walletHeaderDisconnect.addEventListener('click', () => {
        const addr = getWalletAddress();
        if (!addr) return;
        haptic('medium');
        openDisconnectModal(addr);
      });
    }

    if (walletDisconnectModal) {
      walletDisconnectModal.addEventListener('click', (e) => {
        if (e.target.dataset.close) {
          closeDisconnectModal();
          haptic('light');
        }
      });
    }

    if (walletDisconnectConfirm) {
      walletDisconnectConfirm.addEventListener('click', async () => {
        haptic('medium');
        await doDisconnect();
        closeDisconnectModal();
        setTimeout(updateWalletUI, 150);
      });
    }

    if (walletDisconnectCopy) {
      walletDisconnectCopy.addEventListener('click', async () => {
        const addr = walletDisconnectCopy.dataset.addr || getWalletAddress();
        if (!addr) return;
        await copyWithFeedback(addr, 'Wallet copied to clipboard.');
        haptic('light');
      });
    }

    if (walletCardCopy) {
      walletCardCopy.addEventListener('click', async () => {
        const addr = getWalletAddress();
        if (!addr) return;
        await copyWithFeedback(addr, 'Wallet copied to clipboard.');
        haptic('light');
      });
    }

    if (walletCardDisconnect) {
      walletCardDisconnect.addEventListener('click', () => {
        const addr = getWalletAddress();
        openDisconnectModal(addr);
        haptic('medium');
      });
    }
  }

  // ====== INVENTORY PANEL ======
  const selection = new Set();
  let lastInventory = [];
  let isRelayerAdmin = false;
  const STAR_WITHDRAW_LOCK_MS = 5 * 24 * 60 * 60 * 1000;
  const STAR_WITHDRAW_MIN_LABEL_MS = (5 * 24 * 60 - 1) * 60 * 1000;
  const withdrawLockUntilOverrides = new Map();
  let withdrawLockTickerId = 0;
  function removeLegacyNftShelf() {
    // Удаляем верхнюю бессмысленную панель "NFT", если она есть (в т.ч. из старых кешей)
    document.querySelectorAll('#profileNftShelf, .profile-nft-shelf, .profile-nft-card, .profile-nft')
      .forEach(el => { try { el.remove(); } catch {} });
  }
  
  function setVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    // на всякий случай (если CSS принудительно display)
    el.style.display = visible ? '' : 'none';
  }
  
  function findInventoryItemByKey(key) {
    if (!key) return null;
    for (let i = 0; i < lastInventory.length; i++) {
      const k = itemKey(lastInventory[i], i);
      if (k === key) return { item: lastInventory[i], index: i, key: k };
    }
    return null;
  }

  function getUiLangCode() {
    const lang =
      window.WT?.i18n?.getLanguage?.() ||
      document.documentElement?.lang ||
      document.body?.getAttribute?.('data-lang') ||
      document.body?.getAttribute?.('lang') ||
      tg?.initDataUnsafe?.user?.language_code ||
      navigator?.language ||
      '';
    return String(lang || '').toLowerCase();
  }

  function isRuUi() {
    return getUiLangCode().startsWith('ru');
  }

  function getStarsWithdrawLockedText() {
    if (isRuUi()) {
      return 'Вывод этого подарка временно недоступен.Для защиты пользователей и предотвращения мошенничества новые покупки проходят период проверки безопасности.Подарок можно будет вывести после окончания таймера.';
    }
    return 'Withdrawal of this gift is temporarily unavailable. To protect users and prevent fraud, new purchases go through a security review period. You will be able to withdraw the gift after the timer ends.';
  }

  function getSupportButtonLabel() {
    return isRuUi() ? 'Написать в поддержку' : 'Contact support';
  }

  function inventoryActionId(item, idx = 0) {
    return String(
      item?.instanceId ||
      item?.marketId ||
      item?.uid ||
      item?.id ||
      item?.baseId ||
      `idx_${idx}`
    );
  }

  function normalizeCurrencyTag(v) {
    return String(v || '').trim().toLowerCase();
  }

  function getItemWithdrawLockUntil(item, idx = 0) {
    const id = inventoryActionId(item, idx);
    const overrideUntil = Number(withdrawLockUntilOverrides.get(id) || 0);

    const explicitUntil = Number(
      item?.withdrawLockUntil ??
      item?.withdraw_lock_until ??
      item?.tg?.withdrawLockUntil ??
      0
    );
    if (Number.isFinite(explicitUntil) && explicitUntil > 0) {
      return Math.max(explicitUntil, overrideUntil);
    }

    const isStarsOrigin =
      normalizeCurrencyTag(item?.acquiredCurrency) === 'stars' ||
      normalizeCurrencyTag(item?.buyCurrency) === 'stars' ||
      normalizeCurrencyTag(item?.purchaseCurrency) === 'stars' ||
      normalizeCurrencyTag(item?.currency) === 'stars' ||
      normalizeCurrencyTag(item?.tg?.currency) === 'stars' ||
      normalizeCurrencyTag(item?.tg?.kind) === 'star_gift';
    if (!isStarsOrigin) return overrideUntil;

    const acquiredAt = Number(item?.acquiredAt || item?.createdAt || item?.ts || 0);
    const computedUntil = Number.isFinite(acquiredAt) && acquiredAt > 0
      ? acquiredAt + STAR_WITHDRAW_LOCK_MS
      : 0;

    return Math.max(computedUntil, overrideUntil);
  }

  function isItemWithdrawLocked(item, idx = 0) {
    return getItemWithdrawLockUntil(item, idx) > Date.now();
  }

  function getWithdrawLockLabelParts(lockUntilMs) {
    const leftMs = Math.max(0, Number(lockUntilMs || 0) - Date.now());
    const totalMinutes = Math.max(0, Math.floor((leftMs - 1) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (isRuUi()) {
      return {
        hoursText: `${hours} часов`,
        minutesText: `${minutes} мин`
      };
    }
    return {
      hoursText: `${hours} h`,
      minutesText: `${minutes} min`
    };
  }

  function openWithdrawLockedPanel(item, idx = 0) {
    const lockId = inventoryActionId(item, idx);
    const knownUntil = getItemWithdrawLockUntil(item, idx);
    const effectiveUntil = knownUntil > Date.now()
      ? knownUntil
      : (Date.now() + STAR_WITHDRAW_MIN_LABEL_MS);
    withdrawLockUntilOverrides.set(lockId, effectiveUntil);

    showWithdrawErrorPanel(getStarsWithdrawLockedText(), {
      showSupport: true,
      supportLabel: getSupportButtonLabel(),
      onClose: () => {
        renderInventory(lastInventory);
      }
    });
  }

  function refreshWithdrawLockTimers() {
    const grid = document.getElementById('profileInvGrid');
    if (!grid) return;
    const buttons = Array.from(grid.querySelectorAll('.inv-btn--withdraw-locked[data-lock-until]'));
    if (!buttons.length) return;

    const now = Date.now();
    let hasExpired = false;
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const until = Number(btn.getAttribute('data-lock-until') || 0);
      if (!Number.isFinite(until) || until <= now) {
        hasExpired = true;
        continue;
      }
      const parts = getWithdrawLockLabelParts(until);
      const hoursEl = btn.querySelector('.inv-btn__hours');
      const minsEl = btn.querySelector('.inv-btn__mins');
      if (hoursEl && hoursEl.textContent !== parts.hoursText) hoursEl.textContent = parts.hoursText;
      if (minsEl && minsEl.textContent !== parts.minutesText) minsEl.textContent = parts.minutesText;
    }

    if (hasExpired) renderInventory(lastInventory);
  }

  function ensureWithdrawLockTicker() {
    if (withdrawLockTickerId) return;
    withdrawLockTickerId = window.setInterval(() => {
      try { refreshWithdrawLockTimers(); } catch {}
    }, 1000);
  }
  
    async function sellOne(key) {
    const currency = getCurrency();
    const user = getTelegramUser();
    const userId = user.id;

    const found = findInventoryItemByKey(key);
    if (!found) return;

    const item = found.item;
    const instanceId = item?.instanceId ? String(item.instanceId) : null;
    if (!instanceId) {
      showToast('Sell error: instanceId not found');
      return;
    }

    let r = null;
    let j = null;

    try {
      r = await tgFetch('/api/inventory/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency,
          instanceIds: [instanceId]
        })
      });

      j = await r.json().catch(() => null);
    } catch (e) {
      showToast('Sell failed (network)');
      return;
    }

    if (!r || !r.ok || !j?.ok) {
      showToast(j?.error || `Sell failed (${r?.status || 0})`);
      return;
    }

    // сервер возвращает items/nfts + newBalance
    const items = Array.isArray(j.items) ? j.items : (Array.isArray(j.nfts) ? j.nfts : null);
    if (items) writeLocalInventory(userId, items);

    if (typeof j.newBalance === 'number') {
      setBalance(currency, j.newBalance);
    }

    // обновляем UI сразу (без перезагрузки приложения)
    await loadInventory();
    setupPromocode();
    haptic('medium');
  }


// ====== WITHDRAW FLOW (send gift from relayer to THIS Telegram user) ======
const WITHDRAW_FEE_TON = 0.2;
const WITHDRAW_FEE_STARS = 25;
const SUPPORT_USERNAME = 'wildgift_support';

function fragmentMediumPreviewUrlFromSlug(slug) {
  const s = String(slug ?? '').trim();
  if (!s) return '';
  const base = s.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  if (!base) return '';
  return `https://nft.fragment.com/gift/${base}.medium.jpg`;
}

function getWithdrawFeeText(currency) {
  return currency === 'stars'
    ? `Withdrawal fee: ${WITHDRAW_FEE_STARS} Stars`
    : `Withdrawal fee: ${WITHDRAW_FEE_TON} TON`;
}

function getWithdrawRecipientText() {
  const u = getTelegramUser();
  const uname = u?.username ? `@${u.username}` : null;
  const id = u?.id ? String(u.id) : '';
  return uname ? `Recipient: ${uname}` : (id ? `Recipient: ${id}` : '');
}

function openSupportChat() {
  const url = `https://t.me/${SUPPORT_USERNAME}`;
  try {
    if (tg?.openTelegramLink) return tg.openTelegramLink(url);
    if (tg?.openLink) return tg.openLink(url);
  } catch {}
  try { window.open(url, '_blank'); } catch {}
}

let withdrawModalEl = null;
let withdrawErrEl = null;
let withdrawCtx = { instanceId: null, marketId: null, itemId: null, tgMessageId: null };
let withdrawErrorOnClose = null;

function ensureWithdrawModal() {
  if (withdrawModalEl) return withdrawModalEl;

  const el = document.createElement('div');
  el.id = 'wgWithdrawModal';
  el.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'padding:max(20px,env(safe-area-inset-top,0px)) 20px max(20px,env(safe-area-inset-bottom,0px))',
    'overflow-y:auto',
    '-webkit-overflow-scrolling:touch',
    'background:rgba(0,0,0,0.55)',
    'z-index:99999'
  ].join(';');

  el.innerHTML = `
    <div style="width:min(420px,100%);max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 40px);background:#121212;color:#fff;border-radius:18px;overflow:auto;-webkit-overflow-scrolling:touch;box-shadow:0 18px 60px rgba(0,0,0,0.35);">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;">
        <div style="font-weight:700;font-size:16px;">Withdraw</div>
        <button type="button" data-close="1" style="border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;">
          <img src="/icons/ui/close.svg" alt="" aria-hidden="true" style="width:16px;height:16px;filter:brightness(0) invert(1);opacity:.9;">
        </button>
      </div>

      <div style="padding:16px;">
        <div id="wgWithdrawFee" style="font-size:13px;opacity:0.9;margin-bottom:14px;"></div>

        <div style="display:flex;gap:14px;align-items:center;">
          <img id="wgWithdrawImg" src="" alt="" style="width:92px;height:92px;border-radius:16px;object-fit:cover;background:#1d1d1d;flex:0 0 auto;">
          <div style="min-width:0;">
            <div id="wgWithdrawName" style="font-weight:700;font-size:16px;line-height:1.25;word-break:break-word;"></div>
            <div id="wgWithdrawNum" style="margin-top:6px;font-size:13px;opacity:0.85;"></div>
          </div>
        </div>

        <div id="wgWithdrawTo" style="margin-top:12px;font-size:13px;opacity:0.8;"></div>

        <button id="wgWithdrawContinue" type="button"
          style="margin-top:16px;width:100%;height:50px;border-radius:14px;border:0;background:#fff;color:#000;font-weight:800;font-size:16px;cursor:pointer;">
          Continue
        </button>
      </div>
    </div>
  `;

  el.addEventListener('click', (e) => {
    if (e.target === el) closeWithdrawModal();
    const closeBtn = e.target.closest?.('[data-close="1"]');
    if (closeBtn) closeWithdrawModal();
  });

  document.body.appendChild(el);
  withdrawModalEl = el;
  return el;
}

function ensureWithdrawErrorModal() {
  if (withdrawErrEl) return withdrawErrEl;

  const el = document.createElement('div');
  el.id = 'wgWithdrawErrorModal';
  el.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'padding:max(20px,env(safe-area-inset-top,0px)) 20px max(20px,env(safe-area-inset-bottom,0px))',
    'overflow-y:auto',
    '-webkit-overflow-scrolling:touch',
    'background:rgba(0,0,0,0.55)',
    'z-index:100000'
  ].join(';');

  el.innerHTML = `
    <div style="width:min(420px,100%);max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 40px);background:#121212;color:#fff;border-radius:18px;overflow:auto;-webkit-overflow-scrolling:touch;box-shadow:0 18px 60px rgba(0,0,0,0.35);">
      <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;">
        <div style="font-weight:700;font-size:16px;">Withdraw</div>
        <button type="button" data-close="1" style="border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;">
          <img src="/icons/ui/close.svg" alt="" aria-hidden="true" style="width:16px;height:16px;filter:brightness(0) invert(1);opacity:.9;">
        </button>
      </div>

      <div style="padding:16px;">
        <div id="wgWithdrawErrText" style="font-size:14px;line-height:1.35;white-space:pre-line;"></div>

        <button id="wgWithdrawSupport" type="button"
          style="margin-top:14px;width:100%;height:46px;border-radius:14px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:#fff;font-weight:800;font-size:15px;cursor:pointer;">
          Contact support @${SUPPORT_USERNAME}
        </button>
      </div>
    </div>
  `;

  el.addEventListener('click', (e) => {
    if (e.target === el) closeWithdrawErrorModal();
    const closeBtn = e.target.closest?.('[data-close="1"]');
    if (closeBtn) closeWithdrawErrorModal();
  });

  el.querySelector('#wgWithdrawSupport')?.addEventListener('click', () => openSupportChat());

  document.body.appendChild(el);
  withdrawErrEl = el;
  return el;
}

function closeWithdrawModal() {
  if (!withdrawModalEl) return;
  withdrawModalEl.style.display = 'none';
}

function closeWithdrawErrorModal() {
  if (!withdrawErrEl) return;
  withdrawErrEl.style.display = 'none';
  const cb = withdrawErrorOnClose;
  withdrawErrorOnClose = null;
  if (typeof cb === 'function') {
    try { cb(); } catch {}
  }
}

function showWithdrawErrorPanel(text, options = {}) {
  const showSupport = options?.showSupport !== false;
  const supportLabel = typeof options?.supportLabel === 'string' ? options.supportLabel : '';
  const onClose = typeof options?.onClose === 'function' ? options.onClose : null;
  const el = ensureWithdrawErrorModal();
  const t = el.querySelector('#wgWithdrawErrText');
  if (t) t.textContent = String(text || 'Failed to withdraw gift.');
  const supportBtn = el.querySelector('#wgWithdrawSupport');
  if (supportBtn) {
    supportBtn.style.display = showSupport ? '' : 'none';
    if (showSupport) {
      supportBtn.textContent = supportLabel || getSupportButtonLabel();
    }
  }
  withdrawErrorOnClose = onClose;
  el.style.display = 'flex';
}

function openWithdrawModal(item) {
  const el = ensureWithdrawModal();
  const currency = getCurrency();

  const feeEl = el.querySelector('#wgWithdrawFee');
  if (feeEl) feeEl.textContent = getWithdrawFeeText(currency);

  const imgEl = el.querySelector('#wgWithdrawImg');
  const nameEl = el.querySelector('#wgWithdrawName');
  const numEl = el.querySelector('#wgWithdrawNum');
  const toEl = el.querySelector('#wgWithdrawTo');

  const slug = item?.tg?.slug || item?.tg?.giftSlug || '';
  const preview = fragmentMediumPreviewUrlFromSlug(slug);
  const src = preview || itemIconPath(item);

  if (imgEl) imgEl.setAttribute('src', src);
  if (nameEl) nameEl.textContent = itemDisplayName(item);

  const n = item?.tg?.num || item?.number || item?.tg?.number || '';
  if (numEl) numEl.textContent = n ? `#${n}` : '';

  if (toEl) toEl.textContent = getWithdrawRecipientText();

  withdrawCtx.instanceId = String(item?.instanceId || '');
  withdrawCtx.marketId = String(item?.marketId || '');
  withdrawCtx.itemId = String(item?.id || item?.baseId || '');
  withdrawCtx.tgMessageId = String(item?.tg?.messageId || item?.tg?.msgId || '');
  el.style.display = 'flex';

  const btn = el.querySelector('#wgWithdrawContinue');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Continue';
    btn.onclick = async () => {
      await withdrawContinue();
    };
  }
}

async function withdrawContinue() {
  const instanceId = String(withdrawCtx.instanceId || '');
  const marketId = String(withdrawCtx.marketId || '');
  const itemId = String(withdrawCtx.itemId || '');
  const tgMessageId = String(withdrawCtx.tgMessageId || '');
  if (!instanceId && !marketId && !itemId && !tgMessageId) {
    showWithdrawErrorPanel('Failed to withdraw: item id not found.');
    return;
  }

  const currency = getCurrency();
  const u = getTelegramUser();
  const userId = u?.id ? String(u.id) : '';

  const modal = ensureWithdrawModal();
  const btn = modal.querySelector('#wgWithdrawContinue');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Processing...';
  }

  try {
    const r = await tgFetch('/api/inventory/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, instanceId, marketId, itemId, tgMessageId })
    });

    const j = await r.json().catch(() => null);

    if (!r.ok || !j?.ok) {
      const code = j?.code || j?.errorCode || '';
      closeWithdrawModal();

      if (code === 'WITHDRAW_LOCKED') {
        openWithdrawLockedPanel({
          instanceId: instanceId || marketId || itemId || tgMessageId,
          acquiredCurrency: 'stars',
          withdrawLockUntil: Number(j?.lockUntil || 0)
        });
        return;
      }
      if (code === 'RELAYER_STARS_LOW') {
        showWithdrawErrorPanel('Failed to withdraw gift: relayer has not enough Stars for transfer.\nContact support @' + SUPPORT_USERNAME);
        return;
      }
      if (code === 'NO_STOCK') {
        showWithdrawErrorPanel('This gift is not available in stock (relayer cannot find it).\nContact support @' + SUPPORT_USERNAME);
        return;
      }
      if (code === 'INSUFFICIENT_BALANCE') {
        showToast('Not enough balance to pay withdraw fee.');
        return;
      }
      if (code === 'USERNAME_REQUIRED') {
        showWithdrawErrorPanel('Set your Telegram @username in settings and try again.\nTelegram requires resolvable recipient for gift transfer.');
        return;
      }
      if (code === 'TO_ID_INVALID') {
        showWithdrawErrorPanel('Cannot resolve recipient in Telegram (TO_ID_INVALID).\nSet @username and try again, then contact support @' + SUPPORT_USERNAME);
        return;
      }
      if (code === 'RELAYER_UNREACHABLE' || code === 'RELAYER_NOT_CONFIGURED') {
        showWithdrawErrorPanel((j?.error || 'Relayer is not configured/reachable.') + `\nContact support @${SUPPORT_USERNAME}`);
        return;
      }

      showWithdrawErrorPanel((j?.error || `Failed to withdraw gift (${code || 'unknown error'}).`) + `\nContact support @${SUPPORT_USERNAME}`);
      return;
    }

    // Success: update local inventory + balance and refresh
    const left = Array.isArray(j.items) ? j.items : (Array.isArray(j.nfts) ? j.nfts : []);
    if (userId) writeLocalInventory(userId, left);

    if (typeof j.newBalance === 'number') {
      setBalance(currency, j.newBalance);
    }

    closeWithdrawModal();
    await loadInventory();
    setupPromocode();
    haptic('success');
  } catch (e) {
    closeWithdrawModal();
    showWithdrawErrorPanel('Failed to withdraw gift (network).\nContact support @' + SUPPORT_USERNAME);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Continue';
    }
  }
}

  async function returnToMarket(key) {
    const found = findInventoryItemByKey(key);
    if (!found?.item) return;

    const instanceId = String(found.item?.instanceId || '');
    const marketId = String(found.item?.marketId || '');
    const itemId = String(found.item?.id || found.item?.baseId || '');
    const tgMessageId = String(found.item?.tg?.messageId || found.item?.tg?.msgId || '');
    if (!instanceId && !marketId && !itemId && !tgMessageId) {
      showToast('Return error: item id not found');
      return;
    }

    try {
      const r = await tgFetch('/api/admin/inventory/return-to-market', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ instanceId, marketId, itemId, tgMessageId })
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        showToast(j?.error || `Return failed (${r.status})`);
        return;
      }

      const userId = getTelegramUser().id;
      const items = Array.isArray(j.items) ? j.items : (Array.isArray(j.nfts) ? j.nfts : []);
      writeLocalInventory(userId, items);
      await loadInventory();
      setupPromocode();
      haptic('success');
    } catch (e) {
      showToast('Return failed (network)');
    }
  }

  function onInventoryClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
  
    const action = target.getAttribute('data-action');
    const key = target.getAttribute('data-key');
    if (!key) return;
  
    if (action === 'withdraw') {
      const found = findInventoryItemByKey(key);
      if (found?.item) {
        if (isItemWithdrawLocked(found.item, found.index || 0)) {
          openWithdrawLockedPanel(found.item, found.index || 0);
        } else {
          openWithdrawModal(found.item);
        }
        haptic('light');
      }
      return;
    }

    if (action === 'withdraw-locked-info') {
      const found = findInventoryItemByKey(key);
      if (found?.item && isItemWithdrawLocked(found.item, found.index || 0)) {
        openWithdrawLockedPanel(found.item, found.index || 0);
        haptic('light');
      }
      return;
    }
  
    if (action === 'sell') {
      sellOne(key);
      return;
    }

    if (action === 'return-market') {
      returnToMarket(key);
      return;
    }
  
    if (action === 'open') {
      const found = findInventoryItemByKey(key);
      if (found?.item) showModal(found.item, lastInventory);
    }
  }
  function ensureInvDynamic() {
    if (!inventoryPanel) return null;
  
    let dyn = document.getElementById('profileInvDynamic');
    if (dyn) return dyn;
  
    dyn = document.createElement('div');
    dyn.id = 'profileInvDynamic';
    dyn.hidden = true;
  
    dyn.innerHTML = `
      <div id="profileInvGrid" class="profile-invgrid"></div>
    `;
  
    inventoryPanel.appendChild(dyn);
  
    // Один обработчик на все кнопки в карточках
    dyn.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action][data-key]');
      if (!btn) return;
  
      e.preventDefault();
      e.stopPropagation();
  
      const action = btn.dataset.action;
      const key = btn.dataset.key;
  
      if (action === 'withdraw') {
        const found = findInventoryItemByKey(key);
        if (found?.item) {
          if (isItemWithdrawLocked(found.item, found.index || 0)) {
            openWithdrawLockedPanel(found.item, found.index || 0);
          } else {
            openWithdrawModal(found.item);
          }
          haptic('light');
        }
        return;
      }

      if (action === 'withdraw-locked-info') {
        const found = findInventoryItemByKey(key);
        if (found?.item && isItemWithdrawLocked(found.item, found.index || 0)) {
          openWithdrawLockedPanel(found.item, found.index || 0);
          haptic('light');
        }
        return;
      }
  
      if (action === 'sell') {
        await sellOne(key);
        return;
      }

      if (action === 'daily-case-open') {
        const found = findInventoryItemByKey(key);
        openDailyCaseSheet(found?.item || null);
        haptic('light');
        return;
      }

      if (action === 'return-market') {
        await returnToMarket(key);
        return;
      }
      
    });
  
    return dyn;
  }
  
  

  function getEmptyIconEl() {
    return inventoryPanel?.querySelector('.profile-invpanel__icon') || null;
  }
  function getEmptyTextEl() {
    return inventoryPanel?.querySelector('.profile-invpanel__text') || null;
  }

  // ====== MODAL (view NFT) ======
  function ensureModal() {
    let modal = document.getElementById('profileNftModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'profileNftModal';
    modal.className = 'profile-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="profile-modal__backdrop" data-close="1"></div>
      <div class="profile-modal__box" role="dialog" aria-modal="true">
        <div class="profile-modal__imgwrap"><img id="profileModalImg" src="" alt=""></div>
        <div class="profile-modal__meta">
          <div id="profileModalTitle" class="profile-modal__title">NFT</div>
          <div id="profileModalSub" class="profile-modal__sub"></div>
        </div>
        <div class="profile-modal__actions">
          <button id="profileModalSell" class="profile-modal-btn profile-modal-btn--primary" type="button">
            Sell <span id="profileModalSellAmount" class="profile-modal-btn__amount"></span>
          </button>
          <button id="profileModalClose" class="profile-modal-btn profile-modal-btn--ghost" type="button">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-close="1"]').forEach(el => el.addEventListener('click', () => hideModal()));
    modal.querySelector('#profileModalClose')?.addEventListener('click', () => hideModal());

    return modal;
  }

  let modalItemKey = null;


  function isMarketGiftItem(item) {
    if (!item || typeof item !== 'object') return false;
    return !!item.fromMarket || !!item.marketId;
  }

  function canReturnToMarket(item) {
    return !!item && isRelayerAdmin;
  }

  function showModal(item, allItems) {
    const modal = ensureModal();
    if (!modal) return;

    const currency = getCurrency();
    const val = itemValue(item, currency);

    modalItemKey = itemKey(item, allItems.findIndex(x => x === item));

    const modalImg = modal.querySelector('#profileModalImg');
    if (modalImg) {
      const visual = itemVisual(item);
      const queue = Array.isArray(visual?.fallbackQueue) ? visual.fallbackQueue.slice() : [];
      let fallbackIdx = 0;
      modalImg.onerror = () => {
        const currentSrc = String(modalImg.getAttribute('src') || '');
        while (fallbackIdx < queue.length) {
          const nextSrc = String(queue[fallbackIdx++] || '').trim();
          if (!nextSrc || nextSrc === currentSrc) continue;
          modalImg.setAttribute('src', nextSrc);
          return;
        }
        modalImg.onerror = null;
      };
      modalImg.setAttribute('src', visual.src || '/icons/app/market.webp');
    }
    modal.querySelector('#profileModalTitle').textContent = String(item.baseId || item.id || 'NFT');
    modal.querySelector('#profileModalSub').textContent = `${val} ${currencyIcon(currency)}`;

    const sellBtn = modal.querySelector('#profileModalSell');
    const sellAmt = modal.querySelector('#profileModalSellAmount');
    const marketOnlyWithdraw = isMarketGiftItem(item);
    if (sellAmt) sellAmt.textContent = `${val} ${currencyIcon(currency)}`;

    if (sellBtn) {
      if (marketOnlyWithdraw) {
        sellBtn.style.display = 'none';
        sellBtn.onclick = null;
      } else {
        sellBtn.style.display = '';
        sellBtn.onclick = async () => {
          if (!modalItemKey) return;
          await sellOne(modalItemKey);
          hideModal();
        };
      }
    }

    modal.hidden = false;
    haptic('light');
  }

  function hideModal() {
    const modal = document.getElementById('profileNftModal');
    if (modal) modal.hidden = true;
    modalItemKey = null;
  }

  // ====== RENDER INVENTORY ======
  function updateActionAmounts(items) {
    const currency = getCurrency();

    const mapByKey = new Map();
    items.forEach((it, idx) => mapByKey.set(itemKey(it, idx), it));

    let selectedValue = 0;
    selection.forEach(k => {
      const it = mapByKey.get(k);
      if (it) selectedValue += itemValue(it, currency);
    });

    let allValue = 0;
    items.forEach(it => { allValue += itemValue(it, currency); });

    const selBtn = document.getElementById('invSellSelected');
    const allBtn = document.getElementById('invSellAll');

    const selAmt = document.getElementById('invSellSelectedAmount');
    const allAmt = document.getElementById('invSellAllAmount');

    if (selAmt) selAmt.textContent = `${selectedValue || 0} ${currencyIcon(currency)}`;
    if (allAmt) allAmt.textContent = `${allValue || 0} ${currencyIcon(currency)}`;

    if (selBtn) selBtn.disabled = selection.size === 0;
    if (allBtn) allBtn.disabled = items.length === 0;
  }

  function bindInventoryImageFallbacks(grid, items) {
    if (!grid || !Array.isArray(items)) return;
    const cards = Array.from(grid.querySelectorAll('.inv-card'));
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const item = items[i];
      const img = card?.querySelector('.inv-card__imgwrap img');
      if (!img || !item) continue;

      const visual = itemVisual(item);
      const queue = Array.isArray(visual?.fallbackQueue) ? visual.fallbackQueue.slice() : [];
      let fallbackIdx = 0;

      img.addEventListener('error', () => {
        const currentSrc = String(img.getAttribute('src') || '');
        while (fallbackIdx < queue.length) {
          const nextSrc = String(queue[fallbackIdx++] || '').trim();
          if (!nextSrc || nextSrc === currentSrc) continue;
          img.setAttribute('src', nextSrc);
          return;
        }
        img.onerror = null;
      });
    }
  }

  function renderInventory(items) {
    if (!inventoryPanel) return;
  
    const emptyIcon = getEmptyIconEl();
    const emptyText = getEmptyTextEl();
    const dyn = ensureInvDynamic();
  
    const arr = withLocalhostDailyCase(items);
    lastInventory = arr;
  
    // убираем старые выделения (теперь не нужны)
    selection.clear();
  
    // EMPTY STATE
    if (!arr.length) {
      if (emptyIcon) emptyIcon.hidden = false;
      if (emptyText) {
        emptyText.hidden = false;
        emptyText.textContent = 'No gifts yet.';
      }
      if (dyn) dyn.hidden = true;
      return;
    }
  
    // HAVE ITEMS
    if (emptyIcon) emptyIcon.hidden = true;   // ✅ убираем лупу
    if (emptyText) emptyText.hidden = true;
    if (dyn) dyn.hidden = false;
  
    const grid = document.getElementById('profileInvGrid');
    if (!grid) return;
  
    const currency = getCurrency();
    const isStars = currency === 'stars';
  
    // ⚠️ звёздную иконку ты просил именно такую:
    // если файла нет — либо добавь /icons/currency/tgStarWhite.svg, либо поменяй на /icons/currency/stars.svg
    const icon = isStars ? '/icons/currency/tgStarsBlack.svg' : '/icons/currency/ton.svg';
    const sellBtnClass = isStars ? 'inv-btn--stars' : 'inv-btn--ton';
  
    grid.innerHTML = arr.map((it, idx) => {
      const key = itemKey(it, idx);
      const val = itemValue(it, currency);
      const isDailyCase = isDailyCaseItem(it);
      const isDailyCaseOpened = isDailyCase && hasOpenedDailyCase(getTelegramUser().id, it?.dailyCaseDate || todayLocalKey());
      const marketOnlyWithdraw = isMarketGiftItem(it);
      const returnMarket = canReturnToMarket(it);
      const visual = itemVisual(it);
      const backdropVisual = itemBackdropVisual(it);
      const imgWrapClass = `inv-card__imgwrap${backdropVisual.isCollectible ? ' is-collectible' : ''}`;
      const imgWrapStyle = backdropVisual.style ? ` style="${escapeHtml(backdropVisual.style)}"` : '';
      const lockUntilMs = getItemWithdrawLockUntil(it, idx);
      const isWithdrawLocked = lockUntilMs > Date.now();
      const showWithdrawTimer = isWithdrawLocked;
      const cardClass = `inv-card${isWithdrawLocked ? ' inv-card--locked' : ''}${isDailyCase ? ' inv-card--daily-case' : ''}`;
      const cardActionAttr = isWithdrawLocked ? ' data-action="withdraw-locked-info"' : '';
      const lockOverlayHtml = isWithdrawLocked ? `
            <div class="inv-card__lock-overlay" aria-hidden="true">
              <img class="inv-card__lock-icon" src="/icons/ui/lock.svg" alt="">
            </div>
      ` : '';
      const sellBtnHtml = (marketOnlyWithdraw || isDailyCase) ? '' : `
          <button class="inv-btn inv-btn--sell ${sellBtnClass}" type="button"
                  data-action="sell" data-key="${key}">
            <span class="inv-btn__label">Sell</span>
            <span class="inv-btn__amount">${val}</span>
            <img class="inv-btn__icon" src="${icon}" alt="">
          </button>
      `;
      const returnBtnHtml = returnMarket ? `
          <button class="inv-btn inv-btn--withdraw" type="button"
                  data-action="return-market" data-key="${key}">
            Вернуть на рынок
          </button>
      ` : '';
      const lockLabel = getWithdrawLockLabelParts(lockUntilMs);
      const withdrawBtnHtml = showWithdrawTimer ? `
          <button class="inv-btn inv-btn--withdraw inv-btn--withdraw-locked" type="button"
                  data-action="withdraw-locked-info" data-key="${key}"
                  data-lock-until="${Math.max(0, Math.floor(lockUntilMs))}">
            <img class="inv-btn__icon inv-btn__icon--clock" src="/icons/ui/clock.svg" alt="">
            <span class="inv-btn__label">
              <span class="inv-btn__hours">${escapeHtml(lockLabel.hoursText)}</span>
              <span class="inv-btn__mins">${escapeHtml(lockLabel.minutesText)}</span>
            </span>
          </button>
      ` : `
          <button class="inv-btn inv-btn--withdraw" type="button"
                  data-action="withdraw" data-key="${key}">
            Withdraw
          </button>
      `;
      const dailyOpenBtnHtml = isDailyCase ? `
          <button class="inv-btn inv-btn--daily-open" type="button"
                  ${isDailyCaseOpened ? 'disabled aria-disabled="true"' : ''}
                  data-action="daily-case-open" data-key="${key}">
            ${isDailyCaseOpened ? 'Opened' : 'Open'}
          </button>
      ` : '';

      return `
        <div class="${cardClass}" data-key="${key}"${cardActionAttr}>
          <div class="${imgWrapClass}"${imgWrapStyle}>
            <img src="${escapeHtml(visual.src)}" alt="" />
            ${lockOverlayHtml}
          </div>
  
          <div class="inv-card__name">${itemDisplayName(it)}</div>

          ${sellBtnHtml}
          ${returnBtnHtml}
   
          ${isDailyCase ? dailyOpenBtnHtml : withdrawBtnHtml}
        </div>
      `;
    }).join('');
    bindInventoryImageFallbacks(grid, arr);
    ensureWithdrawLockTicker();
    refreshWithdrawLockTimers();
  }
  
  // ====== SELL FLOW ======
  async function sellSelected() {
    const currency = getCurrency();
    const userId = getTelegramUser().id;
  
    const dynActions = document.getElementById('profileInvActions');
    if (dynActions) dynActions.classList.add('loading');
  
    try {
      if (!selection.size) return;
  
      const items = lastInventory.slice();
      const keys = Array.from(selection);
  
      const mapByKey = new Map(items.map((it, idx) => [itemKey(it, idx), it]));
      const toSell = keys.map(k => mapByKey.get(k)).filter(Boolean);
  
      const instanceIds = toSell.map(it => String(it?.instanceId || '')).filter(Boolean);
      if (!instanceIds.length) {
        showToast('Sell error: instanceId not found');
        return;
      }
  
      const r = await tgFetch('/api/inventory/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency, instanceIds })
      });
      
  
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        showToast(j?.error || 'Sell failed');
        return;
      }
  
      const left = Array.isArray(j.items) ? j.items : (Array.isArray(j.nfts) ? j.nfts : []);
      writeLocalInventory(userId, left);
  
      if (typeof j.newBalance === 'number') {
        setBalance(currency, j.newBalance);
      }
  
      selection.clear();
      await loadInventory();
    setupPromocode();
      haptic('medium');
    } finally {
      if (dynActions) dynActions.classList.remove('loading');
    }
  }
  

  async function sellAll() {
    const currency = getCurrency();
    const userId = getTelegramUser().id;
  
    const dynActions = document.getElementById('profileInvActions');
    if (dynActions) dynActions.classList.add('loading');
  
    try {
      if (!lastInventory.length) return;
  
      const r = await tgFetch('/api/inventory/sell-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency })
      });
      
  
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        showToast(j?.error || 'Sell-all failed');
        return;
      }
  
      writeLocalInventory(userId, []);
      if (typeof j.newBalance === 'number') {
        setBalance(currency, j.newBalance);
      }
  
      selection.clear();
      await loadInventory();
    setupPromocode();
      haptic('medium');
    } finally {
      if (dynActions) dynActions.classList.remove('loading');
    }
  }
  

  // ====== LOAD INVENTORY ======
  async function loadInventory() {
    const user = getTelegramUser();
    const userId = user.id;

    try {
      const r = await tgFetch(`/api/user/inventory`, { method: 'GET' });

      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j && j.ok === true && Array.isArray(j.items)) {
          isRelayerAdmin = !!j.isAdmin;
          const items = withLocalhostDailyCase(j.items);
          writeLocalInventory(userId, items);
          renderInventory(items);
          return;
        }
      }
    } catch {}

    isRelayerAdmin = false;
    const local = withLocalhostDailyCase(readLocalInventory(userId));
    renderInventory(local);
  }

  // ====== REFRESH HOOKS ======
  let walletsSetup = false;

  function refreshAll() {
    ensureDailyCaseBadges();
    updateUserUI();
    updateWalletUI();
    loadInventory();
    claimDailyCase();
    setupPromocode();

    if (!walletsSetup) {
      setupWalletListeners();
      walletsSetup = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshAll);
  } else {
    refreshAll();
  }

  window.addEventListener('wt-tc-ready', () => {
    setTimeout(refreshAll, 50);
    setTimeout(refreshAll, 300);
  });
  // обновлять UI профиля при любом изменении статуса кошелька
window.addEventListener('wt-wallet-changed', () => {
  setTimeout(updateWalletUI, 0);
});


window.addEventListener('currency:changed', () => {
  renderInventory(lastInventory);
  if (dailyCaseSheet && !dailyCaseSheet.hidden && !dailyCaseOpening && dailyCaseSheet.classList.contains('is-ready')) {
    renderDailyCaseIdleRolls();
  }
  renderDailyCaseInsideList();
  updateDailyCaseRewardPricePills();
});

  window.WT?.bus?.addEventListener?.('page:change', (event) => {
    if (event?.detail?.id !== 'profilePage') return;
    const currentDaily = lastInventory.find(isDailyCaseItem);
    markDailyCaseViewed(currentDaily?.dailyCaseDate || todayLocalKey());
  });


  window.addEventListener('inventory:update', (ev) => {
    const detail = ev?.detail || null;
    const mode = detail?.mode || 'reload';
    const items = Array.isArray(detail?.items) ? detail.items : null;
    const userId = getTelegramUser().id;

    if (mode === 'replace' && items) {
      writeLocalInventory(userId, items);
      renderInventory(items);
      return;
    }

    loadInventory();
  });

  window.addEventListener('beforeunload', () => {
    if (!withdrawLockTickerId) return;
    clearInterval(withdrawLockTickerId);
    withdrawLockTickerId = 0;
  });
})();
