/**
 * switch.js - Currency Switch System (TON / Telegram Stars)
 * ИСПРАВЛЕННАЯ ВЕРСИЯ - Убраны дубликаты, добавлен watchProfilePageActive
 */

(function() {
  'use strict';

  // ================== STATE ==================
  let currentCurrency = 'ton'; // 'ton' | 'stars'
  let userBalance = {
    ton: 0,
    stars: 0
  };
  let __wtIconSwapTimer = 0;
  let __wtBalanceAnimRaf = 0;
  let __wtBalanceAnimToken = 0;
  let __wtFloatingIconsTimer = 0;
  let __wtAmountSyncTimer = 0;
  let __wtAmountActivateTimer = 0;

  // Telegram Web App API
  const tg = window.Telegram?.WebApp;
  const isGlobalTestMode = () => !!window.TEST_MODE;
  const WT_PILL_ICONS = Object.freeze({
    ton: '/icons/ton.svg',
    stars: '/icons/stars.svg'
  });
  const __wtPreloadedIcons = new Set();

  // =========================
  // Wallet pill: "Connect Wallet" when TON wallet is not connected
  // =========================
  let __wtWalletConnected = false;
  let __wtTonPillTpl = null;
  let __wtTonPillStyleAttr = null;

  function __wtIsCrashPageActive() {
    try {
      if (document.body?.classList?.contains('page-crash')) return true;
      const crashPage = document.getElementById('crashPage');
      return !!crashPage?.classList?.contains('page-active');
    } catch {
      return false;
    }
  }

  function __wtIsCasesPageActive() {
    try {
      if (document.body?.classList?.contains('page-cases')) return true;
      const casesPage = document.getElementById('casesPage');
      return !!casesPage?.classList?.contains('page-active');
    } catch {
      return false;
    }
  }

  function __wtGetWalletConnected() {
    try {
      if (window.WildTimeTonConnect?.isConnected) return !!window.WildTimeTonConnect.isConnected();
      if (window.tonConnectUI?.account) return true;
    } catch {}
    return !!__wtWalletConnected;
  }

  function __wtCaptureTonPillState(tonPill) {
    if (!tonPill) return;
    // capture only NON-connect state so we can restore correctly
    if (tonPill.dataset.wtMode === 'connect') return;
    __wtTonPillTpl = tonPill.innerHTML;
    __wtTonPillStyleAttr = tonPill.getAttribute('style');
  }

  function __wtRenderConnectWalletPill(tonPill) {
    if (!tonPill) return;
    __wtCaptureTonPillState(tonPill);

    tonPill.dataset.wtMode = 'connect';
    tonPill.setAttribute('aria-label', 'Connect Wallet');

    // Inline styles so it works without touching CSS
    tonPill.style.background = '#2AABEE';
    tonPill.style.color = '#fff';
    tonPill.style.display = 'inline-flex';
    tonPill.style.alignItems = 'center';
    tonPill.style.justifyContent = 'center';
    tonPill.style.gap = '8px';
    tonPill.style.whiteSpace = 'nowrap';
    tonPill.style.width = 'auto';
    tonPill.style.paddingLeft = '14px';
    tonPill.style.paddingRight = '14px';

    tonPill.innerHTML = `
      <img src="icons/telegram.svg" alt="" aria-hidden="true"
           style="width:16px;height:16px;flex:0 0 auto;display:block;" />
      <span style="font-weight:600;">Connect Wallet</span>
    `;
  }

  function __wtRestoreTonPill(tonPill) {
    if (!tonPill) return;
    if (__wtTonPillTpl == null) return;

    if (tonPill.dataset.wtMode === 'connect') {
      // restore HTML
      tonPill.innerHTML = __wtTonPillTpl;

      // restore inline style attribute (only if we had it)
      if (__wtTonPillStyleAttr) tonPill.setAttribute('style', __wtTonPillStyleAttr);
      else tonPill.removeAttribute('style');

      delete tonPill.dataset.wtMode;
      tonPill.removeAttribute('aria-label');
    }
  }

  function updateTonPillState() {
    const tonPill = document.getElementById('tonPill');
    if (!tonPill) return;

    const connected = __wtGetWalletConnected();
    const inCrash = __wtIsCrashPageActive();
    const inCases = __wtIsCasesPageActive();

    // On Crash/Cases pages keep regular balance pill (do not render long "Connect Wallet" button).
    if (currentCurrency === 'ton' && !connected && !inCrash && !inCases) {
      __wtRenderConnectWalletPill(tonPill);
    } else {
      __wtRestoreTonPill(tonPill);
      // ensure balance text updates after restore
      try { updateBalanceDisplay(false); } catch {}
      try { updateTopbarIcon(); } catch {}
    }
  }


  // =========================
  // TON ↔ Stars dynamic rate
  // =========================
  // Source of truth: server endpoint /api/rates/ton-stars
  // Fallback: cached localStorage value or legacy constant.
  const WT_RATE_KEY = 'WT_RATE_TON_STARS_V1';
  const WT_RATE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
  const STARS_USD_FALLBACK = 0.013;
  const STARS_MARKUP_MULTIPLIER = 1.25;
  const STARS_PER_TON_FALLBACK = 115 * STARS_MARKUP_MULTIPLIER; // fallback charged rate (used only if no cache & no server)

  const __wtRateState = (() => {
    const s = { starsPerTon: STARS_PER_TON_FALLBACK, tonUsd: null, starsUsd: STARS_USD_FALLBACK, fetchedAt: 0, source: 'fallback', error: null };
    try {
      const raw = localStorage.getItem(WT_RATE_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (j && Number.isFinite(+j.starsPerTon) && +j.starsPerTon > 0) {
          s.starsPerTon = +j.starsPerTon;
          s.tonUsd = Number.isFinite(+j.tonUsd) ? +j.tonUsd : null;
          s.starsUsd = Number.isFinite(+j.starsUsd) && +j.starsUsd > 0 ? +j.starsUsd : STARS_USD_FALLBACK;
          s.fetchedAt = Number.isFinite(+j.fetchedAt) ? +j.fetchedAt : 0;
          s.source = j.source || 'cache';
        }
      }
    } catch {}
    return s;
  })();

  function __storeRateState() {
    try {
      localStorage.setItem(WT_RATE_KEY, JSON.stringify({
        starsPerTon: __wtRateState.starsPerTon,
        tonUsd: __wtRateState.tonUsd,
        starsUsd: __wtRateState.starsUsd,
        fetchedAt: __wtRateState.fetchedAt,
        source: __wtRateState.source
      }));
    } catch {}
    // backward compat for old code:
    try { localStorage.setItem('starsPerTon', String(__wtRateState.starsPerTon)); } catch {}
    try { window.STARS_PER_TON = __wtRateState.starsPerTon; } catch {}
  }

  async function __fetchTonStarsRate() {
    const r = await fetch('/api/rates/ton-stars', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) throw new Error(j?.error || 'Bad response');
    const spt = Number(j.starsPerTon);
    if (!Number.isFinite(spt) || spt <= 0) throw new Error('Invalid starsPerTon');
    __wtRateState.starsPerTon = spt;
    __wtRateState.tonUsd = Number.isFinite(+j.tonUsd) ? +j.tonUsd : null;
    __wtRateState.starsUsd = Number.isFinite(+j.starsUsd) && +j.starsUsd > 0 ? +j.starsUsd : STARS_USD_FALLBACK;
    __wtRateState.fetchedAt = Date.now();
    __wtRateState.source = j.source || 'server';
    __wtRateState.error = null;
    __storeRateState();
    return __wtRateState;
  }

  async function ensureTonStarsRate(force = false) {
    const age = Date.now() - (__wtRateState.fetchedAt || 0);
    const stale = !__wtRateState.fetchedAt || age > WT_RATE_TTL_MS;
    if (!force && !stale) return __wtRateState;

    try {
      return await __fetchTonStarsRate();
    } catch (e) {
      __wtRateState.error = String(e?.message || e || 'rate fetch failed');
      // Keep cached value if present, otherwise fallback stays.
      return __wtRateState;
    }
  }

  function getStarsPerTon() {
    const v = Number(__wtRateState.starsPerTon);
    return (Number.isFinite(v) && v > 0) ? v : STARS_PER_TON_FALLBACK;
  }

  function tonToStars(ton) {
    const v = Number(ton);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.max(0, Math.ceil((v * getStarsPerTon()) - 1e-9));
  }

  function starsToTon(stars) {
    const v = Number(stars);
    if (!Number.isFinite(v) || v <= 0) return 0;
    const spt = getStarsPerTon();
    if (!spt) return 0;
    // keep precision for small values
    return Math.round((v / spt) * 10000) / 10000;
  }

  // Expose globally for other modules (do not override if already exists)
  try {
    window.WildTimeRates = window.WildTimeRates || {};
    if (typeof window.WildTimeRates.ensureTonStarsRate !== 'function') window.WildTimeRates.ensureTonStarsRate = ensureTonStarsRate;
    if (typeof window.WildTimeRates.getStarsPerTon !== 'function') window.WildTimeRates.getStarsPerTon = getStarsPerTon;
    if (typeof window.WildTimeRates.tonToStars !== 'function') window.WildTimeRates.tonToStars = tonToStars;
    if (typeof window.WildTimeRates.starsToTon !== 'function') window.WildTimeRates.starsToTon = starsToTon;
    if (typeof window.WildTimeRates.getInfo !== 'function') window.WildTimeRates.getInfo = () => ({ ...__wtRateState });
  } catch {}

  // Warm-up in background
  ensureTonStarsRate(false).catch(() => {});

  
  function applyCurrencyTheme() {
    const root = document.documentElement;
    root.dataset.currency = currentCurrency;
    root.classList.toggle('currency-ton', currentCurrency === 'ton');
    root.classList.toggle('currency-stars', currentCurrency === 'stars');
  }

  function preloadIcon(src) {
    if (!src || __wtPreloadedIcons.has(src)) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    __wtPreloadedIcons.add(src);
  }

  function isProfilePageActive() {
    const profilePage = document.getElementById('profilePage');
    return !!(profilePage && profilePage.classList.contains('page-active'));
  }

  function scheduleFloatingIconsRefresh(delay = 120) {
    clearTimeout(__wtFloatingIconsTimer);
    __wtFloatingIconsTimer = setTimeout(() => {
      __wtFloatingIconsTimer = 0;
      createFloatingIcons();
    }, delay);
  }

  // ================== INIT ==================
  function init() {
    console.log('[Switch] 🚀 Initializing currency system...');
    
    loadCurrency();
    applyCurrencyTheme();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDOMReady);
    } else {
      onDOMReady();
    }
    
    console.log('[Switch] ✅ Currency system initialized. Current:', currentCurrency);
  }

  async function onDOMReady() {
    console.log('[Switch] 🔄 DOM ready, setting up UI...');
    
    try {
      const isBanned = await window.WTBanGuard?.ensureChecked?.();
      if (isBanned || window.WTBanGuard?.isBanned?.()) {
        console.warn('[Switch] Account is banned, skipping currency UI init');
        return;
      }
    } catch (error) {
      console.warn('[Switch] Failed to read ban guard state:', error);
    }

    initUI();
    preloadIcon(WT_PILL_ICONS.ton);
    preloadIcon(WT_PILL_ICONS.stars);
    attachEventListeners();
    watchProfilePageActive();
    
    setTimeout(() => {
      syncAmountButtons();
      // Попытка создать иконки при загрузке
      createFloatingIcons();
    }, 300);
    
    loadBalanceFromServer();
    updateBalanceDisplay();
      try { updateTonPillState(); } catch {}
}
  
  // ================== UI SETUP ==================
  function initUI() {
    console.log('[Switch] 🎨 Initializing UI...');
    
    const currencyBtns = document.querySelectorAll('.curr-btn');
    currencyBtns.forEach(btn => {
      const currency = btn.dataset.currency;
      if (currency === currentCurrency) {
        btn.classList.add('curr-btn--active');
      } else {
        btn.classList.remove('curr-btn--active');
      }
    });
    
    updateTopbarIcon();
    applyCurrencyTheme();
    
    console.log('[Switch] ✅ UI initialized');
  }

  // ================== EVENT LISTENERS ==================
  function attachEventListeners() {
    const currencyBtns = document.querySelectorAll('.curr-btn');
    currencyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isCasesCurrencySwitchLocked()) {
          triggerCurrencySwitchError(btn);
          try { tg?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
          return;
        }
        const currency = btn.dataset.currency;
        console.log('[Switch] 📘 Currency button clicked:', currency);
        switchCurrency(currency, btn);
      });
      
      btn.style.cursor = 'pointer';
      btn.style.userSelect = 'none';
      btn.style.webkitTapHighlightColor = 'transparent';
    });

    const tonPill = document.getElementById('tonPill');
    if (tonPill) {
      // initial render
      try { updateTonPillState(); } catch {}

      tonPill.addEventListener('click', async (e) => {
        e.preventDefault();

        // If wallet is not connected - show connect modal instead of deposit popup
        if (tonPill.dataset.wtMode === 'connect') {
          try {
            if (window.WildTimeTonConnect?.openModal) return await window.WildTimeTonConnect.openModal();
            if (window.WildTimeTonConnect?.connect) return await window.WildTimeTonConnect.connect();
            if (window.tonConnectUI?.openModal) return await window.tonConnectUI.openModal();
          } catch (err) {
            console.error('[Switch] ❌ Connect modal failed:', err);
          }
          // fallback: open deposit popup (it has Connect button inside)
          return openDepositPopup();
        }

        openDepositPopup();
      });

      // sync pill when wallet status changes
      window.addEventListener('wt-wallet-changed', (ev) => {
        __wtWalletConnected = !!ev?.detail?.connected;
        try { updateTonPillState(); } catch {}
      });
      window.addEventListener('wt-tc-ready', () => {
        __wtWalletConnected = __wtGetWalletConnected();
        try { updateTonPillState(); } catch {}
      });
    }

    window.addEventListener('balance:update', (e) => {
      if (e.detail) {
        updateBalance(e.detail);
      }
    });
    
    window.addEventListener('balance:loaded', (e) => {
      if (e.detail) {
        console.log('[Switch] 🔥 Balance loaded event:', e.detail);
        updateBalance(e.detail);
      }
    });

    window.addEventListener('balance:live-update', (e) => {
      if (e.detail) {
        console.log('[Switch] 📡 Live balance update:', e.detail);
        updateBalance(e.detail);
      }
    });

    // 🔥 НОВОЕ: Слушаем событие смены страницы
    const handlePageChange = (pageId) => {
      console.log('[Switch] Page changed to:', pageId);
      try { updateTonPillState(); } catch {}

      if (pageId === 'profilePage') {
        scheduleFloatingIconsRefresh(260);
      } else {
        clearTimeout(__wtFloatingIconsTimer);
        __wtFloatingIconsTimer = 0;
        clearFloatingIcons();
      }
    };

    window.addEventListener('page:changed', (e) => {
      handlePageChange(e.detail?.page || e.detail?.id || null);
    });

    try {
      window.WT?.bus?.addEventListener?.('page:change', (e) => {
        handlePageChange(e?.detail?.id || null);
      });
    } catch {}
  }

  // ================== WATCH PROFILE PAGE ==================
  function watchProfilePageActive() {
    const profilePage = document.getElementById('profilePage');
    if (!profilePage) return;

    // Создаем наблюдатель за изменением классов
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const isActive = profilePage.classList.contains('page-active');
          console.log('[Switch] 👀 Profile page active:', isActive);
          
          if (isActive) {
            scheduleFloatingIconsRefresh(180);
          } else {
            clearTimeout(__wtFloatingIconsTimer);
            __wtFloatingIconsTimer = 0;
            clearFloatingIcons();
          }
        }
      });
    });

    observer.observe(profilePage, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Проверяем текущее состояние
    if (profilePage.classList.contains('page-active')) {
      scheduleFloatingIconsRefresh(180);
    }
  }

  function isCasesCurrencySwitchLocked() {
    try {
      const body = document.body;
      if (body?.classList?.contains('case-sheet-open')) return true;
      if (body?.classList?.contains('case-opening-fullscreen')) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  // ================== ROUND LOCK (ACTIVE BET) ==================
  function isCurrencyChangeLocked() {
    try {
      const wheelLocked = !!(window.WheelGame && typeof window.WheelGame.hasBets === 'function' && window.WheelGame.hasBets());
      const crashLocked = !!(window.CrashGame && typeof window.CrashGame.hasActiveBet === 'function' && window.CrashGame.hasActiveBet());
      return wheelLocked || crashLocked;
    } catch (_) {
      return false;
    }
  }

  function showCurrencyLockNotification() {
    const existing = document.getElementById('currency-lock-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'currency-lock-toast';
    toast.textContent = 'Currency change is available after the end of the round';

    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 260);
    }, 2400);
  }

  function triggerCurrencySwitchError(sourceBtn) {
    const btn = sourceBtn || document.querySelector('.curr-btn');
    const sw = btn?.closest('.currency-switch') || document.querySelector('.currency-switch');

    if (sw) {
      sw.classList.remove('currency-switch--error');
      void sw.offsetWidth;
      sw.classList.add('currency-switch--error');
      setTimeout(() => sw.classList.remove('currency-switch--error'), 450);
    }

    if (btn) {
      btn.classList.remove('curr-btn--error');
      void btn.offsetWidth;
      btn.classList.add('curr-btn--error');
      setTimeout(() => btn.classList.remove('curr-btn--error'), 450);
    }
  }

  // ================== FLOATING ICONS ==================
  function createFloatingIcons() {
    console.log('[Switch] ✨ createFloatingIcons called');
    
    const profilePage = document.getElementById('profilePage');

    if (!profilePage || !profilePage.classList.contains('page-active')) {
      console.log('[Switch] ⭐️ Profile page not visible, skipping icons');
      return;
    }

    const avatar = document.getElementById('profileAvatar') || 
                   document.querySelector('#profilePage .profile-ava');
    
    if (!avatar) {
      console.warn('[Switch] 🔍 Avatar not found for floating icons');
      return;
    }

    let wrapper = avatar.parentElement;
    if (!wrapper.classList.contains('profile-avatar-wrapper')) {
      wrapper = document.createElement('div');
      wrapper.className = 'profile-avatar-wrapper';
      avatar.parentNode.insertBefore(wrapper, avatar);
      wrapper.appendChild(avatar);
    }

    const oldContainer = wrapper.querySelector('.currency-icons-float');
    if (oldContainer && wrapper.dataset.currencyIcons === currentCurrency) {
      return;
    }
    if (oldContainer) {
      oldContainer.remove();
    }

    const container = document.createElement('div');
    container.className = 'currency-icons-float';

    const iconSrc = currentCurrency === 'ton' 
      ? '/icons/tgTonWhite.svg' 
      : '/icons/tgStarWhite.svg';

    const iconConfigs = [
      { size: 'small', duration: 4.5, delay: 0, yStart: -80, yEnd: -70, distance: -620, rotation: 120, xStart: 80 },
      { size: 'small', duration: 5, delay: 1, yStart: 20, yEnd: 25, distance: -600, rotation: -90, xStart: 100 },
      { size: 'small', duration: 4.8, delay: 2.5, yStart: -40, yEnd: -35, distance: -610, rotation: 150, xStart: 70 },
      { size: 'small', duration: 5.2, delay: 4, yStart: 80, yEnd: 85, distance: -630, rotation: -140, xStart: 90 },
      { size: 'small', duration: 4.6, delay: 5.5, yStart: -10, yEnd: -5, distance: -595, rotation: 100, xStart: 110 },
      { size: 'small', duration: 5.1, delay: 7, yStart: 50, yEnd: 55, distance: -615, rotation: -110, xStart: 75 },
      { size: 'medium', duration: 4.2, delay: 0.5, yStart: -60, yEnd: -55, distance: -610, rotation: -160, xStart: 85 },
      { size: 'medium', duration: 4.8, delay: 2, yStart: 40, yEnd: 45, distance: -620, rotation: 140, xStart: 95 },
    ];

    iconConfigs.forEach((config) => {
      const iconItem = document.createElement('div');
      iconItem.className = `currency-icon-item currency-icon-item--${config.size}`;
      
      iconItem.style.setProperty('--duration', `${config.duration}s`);
      iconItem.style.setProperty('--delay', `${config.delay}s`);
      iconItem.style.setProperty('--start-y', `${config.yStart}px`);
      iconItem.style.setProperty('--end-y', `${config.yEnd}px`);
      iconItem.style.setProperty('--distance', `${config.distance}px`);
      iconItem.style.setProperty('--rotation', `${config.rotation}deg`);
      iconItem.style.setProperty('--start-x', `${config.xStart || 0}px`); // 🔥 НОВОЕ: стартовая позиция справа
      
      const img = document.createElement('img');
      img.src = iconSrc;
      img.alt = '';
      img.draggable = false;
      
      iconItem.appendChild(img);
      container.appendChild(iconItem);
    });

    wrapper.appendChild(container);
    wrapper.dataset.currencyIcons = currentCurrency;

    console.log(`[Switch] ✨ Created ${iconConfigs.length} flying icons around avatar`);
  }

  function clearFloatingIcons() {
    const containers = document.querySelectorAll('.currency-icons-float');
    containers.forEach(c => c.remove());
    const wrappers = document.querySelectorAll('.profile-avatar-wrapper');
    wrappers.forEach(w => { delete w.dataset.currencyIcons; });
    console.log('[Switch] 🧹 Cleared floating icons');
  }

  // ================== CURRENCY SWITCHING ==================
  function switchCurrency(currency, sourceBtn) {
    if (isCasesCurrencySwitchLocked()) {
      if (sourceBtn) {
        triggerCurrencySwitchError(sourceBtn);
        try { tg?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
      }
      return;
    }

    if (currency === currentCurrency) {
      console.log('[Switch] Already on', currency);
      return;
    }

    if (isCurrencyChangeLocked()) {
      console.log('[Switch] ⛔ Currency switch blocked - active bet detected');
      showCurrencyLockNotification();
      triggerCurrencySwitchError(sourceBtn);
      if (tg?.HapticFeedback?.notificationOccurred) {
        tg.HapticFeedback.notificationOccurred('error');
      }
      return;
    }
    
    console.log(`[Switch] 🔄 Switching from ${currentCurrency} to ${currency}`);
    
    closeAllPopups();
    
    currentCurrency = currency;
    saveCurrency();
    updateCurrencyUI();
    updateBalanceDisplay(true);
    try { updateTonPillState(); } catch {}
    syncAmountButtons();
    
    if (isProfilePageActive()) {
      const floatingIconImages = document.querySelectorAll('#profilePage .currency-icons-float .currency-icon-item img');
      if (floatingIconImages.length > 0) {
        const iconSrc = currentCurrency === 'ton' ? '/icons/tgTonWhite.svg' : '/icons/tgStarWhite.svg';
        floatingIconImages.forEach((img) => { img.src = iconSrc; });
      } else {
        scheduleFloatingIconsRefresh(120);
      }
    } else {
      clearTimeout(__wtFloatingIconsTimer);
      __wtFloatingIconsTimer = 0;
      clearFloatingIcons();
    }
    
    window.dispatchEvent(new CustomEvent('currency:changed', {
      detail: { currency }
    }));

    if (tg?.HapticFeedback) {
      tg.HapticFeedback.selectionChanged();
    }
  }

  function updateCurrencyUI() {
    console.log('[Switch] 🎨 Updating UI for currency:', currentCurrency);
    
    const currencyBtns = document.querySelectorAll('.curr-btn');
    currencyBtns.forEach(btn => {
      const currency = btn.dataset.currency;
      if (currency === currentCurrency) {
        btn.classList.add('curr-btn--active');
      } else {
        btn.classList.remove('curr-btn--active');
      }
    });

    updateTopbarIcon();
    applyCurrencyTheme();
  }

  function updateTopbarIcon() {
    const pillIcon = document.getElementById('pillCurrencyIcon');
    
    if (!pillIcon) {
      console.warn('[Switch] ⚠️ pillCurrencyIcon not found');
      return;
    }

    const iconPath = WT_PILL_ICONS[currentCurrency] || WT_PILL_ICONS.ton;
    preloadIcon(iconPath);
    
    console.log('[Switch] 🎨 Changing icon to:', currentCurrency);

    const currentSrc = pillIcon.getAttribute('src') || '';
    const alreadyApplied = (pillIcon.dataset.currency || '') === currentCurrency
      || currentSrc.endsWith(iconPath);
    if (alreadyApplied) {
      pillIcon.dataset.currency = currentCurrency;
      return;
    }

    if (__wtIconSwapTimer) {
      clearTimeout(__wtIconSwapTimer);
      __wtIconSwapTimer = 0;
    }

    pillIcon.dataset.currency = currentCurrency;
    pillIcon.classList.remove('pill-icon-swap');
    void pillIcon.offsetWidth;

    pillIcon.setAttribute('src', iconPath);
    pillIcon.classList.add('pill-icon-swap');

    __wtIconSwapTimer = setTimeout(() => {
      __wtIconSwapTimer = 0;
      pillIcon.classList.remove('pill-icon-swap');
    }, 240);
  }

  // ================== AMOUNT BUTTONS SYNC ==================
  function syncAmountButtons() {
    const amountBtns = document.querySelectorAll('.amount-btn');
    if (amountBtns.length === 0) {
      console.log('[Switch] ⭐️ No amount buttons found, skipping');
      return;
    }

    console.log('[Switch] 🔄 Syncing amount buttons for:', currentCurrency);
    
    clearTimeout(__wtAmountSyncTimer);
    clearTimeout(__wtAmountActivateTimer);

    amountBtns.forEach(btn => btn.classList.add('currency-switching'));
    
    __wtAmountSyncTimer = setTimeout(() => {
      __wtAmountSyncTimer = 0;
      if (currentCurrency === 'ton') {
        const tonAmounts = [0.1, 0.5, 1, 2.5];
        amountBtns.forEach((btn, index) => {
          if (index < tonAmounts.length) {
            const amount = tonAmounts[index];
            btn.dataset.amount = amount;
            btn.innerHTML = `
              <img src="/icons/ton.svg" alt="" class="amount-icon" />
              <span class="amount-value">${amount}</span>
            `;
          }
        });
      } else {
        const starsAmounts = [1, 5, 10, 25];
        amountBtns.forEach((btn, index) => {
          if (index < starsAmounts.length) {
            const amount = starsAmounts[index];
            btn.dataset.amount = amount;
            btn.innerHTML = `
              <img src="/icons/tgStarsBlack.svg" alt="" class="amount-icon" />
              <span class="amount-value">${amount}</span>
            `;
          }
        });
      }
      
      amountBtns.forEach(btn => btn.classList.remove('currency-switching'));
    }, 150);
    
    __wtAmountActivateTimer = setTimeout(() => {
      __wtAmountActivateTimer = 0;
      amountBtns.forEach((btn, index) => {
        if (index === 0) {
          btn.classList.add('active');
          
          if (window.updateCurrentAmount) {
            const amount = parseFloat(btn.dataset.amount);
            window.updateCurrentAmount(amount);
          }
        } else {
          btn.classList.remove('active');
        }
      });
    }, 300);
    
    console.log('[Switch] ✅ Amount buttons synced');
  }

  // ================== POPUP MANAGEMENT ==================
  function openDepositPopup() {
    console.log('[Switch] 📂 Opening deposit popup for:', currentCurrency);
    
    closeAllPopups();
    
    setTimeout(() => {
      if (currentCurrency === 'ton') {
        if (window.WTTonDeposit?.open) {
          window.WTTonDeposit.open();
        } else {
          console.error('[Switch] ❌ TON module not loaded!');
        }
      } else {
        if (window.WTStarsDeposit?.open) {
          window.WTStarsDeposit.open();
        } else {
          console.error('[Switch] ❌ Stars module not loaded!');
        }
      }
      
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
      }
    }, 50);
  }
  
  function closeAllPopups() {
    const tonPopup = document.getElementById('tonDepositPopup');
    const starsPopup = document.getElementById('starsDepositPopup');
    
    if (tonPopup?.classList.contains('deposit-popup--open')) {
      tonPopup.classList.remove('deposit-popup--open');
    }
    
    if (starsPopup?.classList.contains('deposit-popup--open')) {
      starsPopup.classList.remove('deposit-popup--open');
    }
  }

  // ================== BALANCE MANAGEMENT ==================
  function updateBalance(balances) {
    console.log('[Switch] 💰 Updating balance:', balances);
    
    if (balances.ton !== undefined) {
      userBalance.ton = parseFloat(balances.ton) || 0;
    }
    if (balances.stars !== undefined) {
      userBalance.stars = parseInt(balances.stars) || 0;
    }

    updateBalanceDisplay(true);
    
    if (balances.ton !== undefined && window.WTTonDeposit?.setBalance) {
      window.WTTonDeposit.setBalance(balances.ton);
    }
    if (balances.stars !== undefined && window.WTStarsDeposit?.setBalance) {
      window.WTStarsDeposit.setBalance(balances.stars);
    }
  }

  function updateBalanceDisplay(animate = false) {
    const tonAmount = document.getElementById('tonAmount');
    if (!tonAmount) return;

    const currencyAtRender = currentCurrency;
    const targetNum = currencyAtRender === 'ton'
      ? Number(userBalance.ton) || 0
      : Number(userBalance.stars) || 0;
    const targetValue = formatBalanceValue(currencyAtRender, targetNum);

    if (animate) {
      animateBalanceChange(tonAmount, targetNum, currencyAtRender);
    } else {
      cancelBalanceAnimation();
      tonAmount.classList.remove('balance-jelly');
      tonAmount.textContent = targetValue;
    }
  }

  function parseDisplayAmount(value) {
    const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatBalanceValue(currency, value) {
    if (currency === 'ton') {
      return (Number(value) || 0).toFixed(2);
    }
    return formatStars(Math.max(0, Math.round(Number(value) || 0)));
  }

  function cancelBalanceAnimation() {
    if (__wtBalanceAnimRaf) {
      cancelAnimationFrame(__wtBalanceAnimRaf);
      __wtBalanceAnimRaf = 0;
    }
  }

  function animateBalanceChange(element, targetNum, currencySnapshot) {
    cancelBalanceAnimation();
    const token = ++__wtBalanceAnimToken;
    const startNum = parseDisplayAmount(element.textContent);
    const toNum = Number(targetNum) || 0;
    const duration = currencySnapshot === 'ton' ? 280 : 220;

    element.classList.remove('balance-jelly');
    void element.offsetWidth;
    element.classList.add('balance-jelly');

    if (Math.abs(toNum - startNum) < (currencySnapshot === 'ton' ? 0.001 : 0.5)) {
      element.textContent = formatBalanceValue(currencySnapshot, toNum);
      setTimeout(() => {
        if (token === __wtBalanceAnimToken) {
          element.classList.remove('balance-jelly');
        }
      }, 220);
      return;
    }

    const startedAt = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const render = (ts) => {
      if (token !== __wtBalanceAnimToken) return;
      const progress = Math.min(1, (ts - startedAt) / duration);
      const eased = easeOutCubic(progress);
      const value = startNum + ((toNum - startNum) * eased);
      element.textContent = formatBalanceValue(currencySnapshot, value);

      if (progress < 1) {
        __wtBalanceAnimRaf = requestAnimationFrame(render);
        return;
      }

      __wtBalanceAnimRaf = 0;
      element.textContent = formatBalanceValue(currencySnapshot, toNum);
      setTimeout(() => {
        if (token === __wtBalanceAnimToken) {
          element.classList.remove('balance-jelly');
        }
      }, 220);
    };

    __wtBalanceAnimRaf = requestAnimationFrame(render);
  }

   //Stars Format
   function formatStars(amount) {
    return amount.toString();                 
  }

  // ================== SERVER SYNC ==================
  async function loadBalanceFromServer() {
    if (isGlobalTestMode()) {
      console.log('[Switch] 🧪 TEST_MODE active: skip server balance load');
      return;
    }

    const userId = tg?.initDataUnsafe?.user?.id;
    if (!userId) {
      console.warn('[Switch] ⚠️ No user ID, skipping balance load');
      return;
    }

    try {
      console.log('[Switch] 📡 Loading balance from server...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(`/api/balance?userId=${userId}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        console.log('[Switch] 📊 Balance received:', data);
        
        if (data.ok && (data.ton !== undefined || data.stars !== undefined)) {
          updateBalance({
            ton: parseFloat(data.ton) || 0,
            stars: parseInt(data.stars) || 0
          });
          
          window.dispatchEvent(new CustomEvent('balance:loaded', {
            detail: { 
              ton: parseFloat(data.ton) || 0, 
              stars: parseInt(data.stars) || 0 
            }
          }));
        }
      } else {
        console.error('[Switch] ❌ Balance load failed:', res.status);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('[Switch] ⏱️ Balance load timeout');
      } else {
        console.error('[Switch] ❌ Balance load error:', err);
      }
    }
  }

  // ================== STORAGE ==================
  function loadCurrency() {
    try {
      const saved = localStorage.getItem('wt-currency');
      if (saved && (saved === 'ton' || saved === 'stars')) {
        currentCurrency = saved;
        console.log('[Switch] 🔥 Loaded currency from storage:', currentCurrency);
      }
    } catch (e) {
      console.warn('[Switch] Failed to load currency:', e);
    }
  }

  function saveCurrency() {
    try {
      localStorage.setItem('wt-currency', currentCurrency);
      console.log('[Switch] 💾 Saved currency to storage:', currentCurrency);
    } catch (e) {
      console.warn('[Switch] Failed to save currency:', e);
    }
  }

  // ================== PUBLIC API ==================
  window.WildTimeCurrency = {
    get current() { return currentCurrency; },
    get balance() { return { ...userBalance }; },
    
    switchTo: switchCurrency,
    updateBalance: updateBalance,
    
    setBalance: (currency, amount) => {
      userBalance[currency] = currency === 'ton' ? parseFloat(amount) : parseInt(amount);
      updateBalanceDisplay(true);
    },
    
    formatStars: formatStars,
    openPopup: openDepositPopup,
    closeAllPopups: closeAllPopups,
    
    reloadBalance: () => {
      console.log('[Switch] 🔄 Manual balance reload');
      return loadBalanceFromServer();
    },
    
    syncButtons: syncAmountButtons,
    
    // 🔥 НОВОЕ: API для ручного управления иконками
    createIcons: createFloatingIcons,
    clearIcons: clearFloatingIcons,
    
    debug: {
      getState: () => ({
        currency: currentCurrency,
        balance: userBalance,
        iconSrc: document.getElementById('pillCurrencyIcon')?.src
      }),
      forceSync: () => {
        console.log('[Switch] 🔧 Force sync');
        updateTopbarIcon();
        syncAmountButtons();
      },
      // 🔥 Отладочная функция
      testIcons: () => {
        console.log('[Switch] 🧪 Testing icons...');
        clearFloatingIcons();
        setTimeout(createFloatingIcons, 100);
      }
    }
  };

  // ================== STYLES ==================
  const styles = `
    #tonAmount {
      display: inline-block;
      transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
      will-change: transform;
    }

    #tonAmount.balance-jelly {
      animation: jellyBounce 0.34s cubic-bezier(0.22, 0.61, 0.36, 1) both;
      transform-origin: center;
    }

    @keyframes jellyBounce {
      0% { transform: scale3d(1, 1, 1); }
      35% { transform: scale3d(1.04, 1.04, 1); }
      65% { transform: scale3d(0.985, 0.985, 1); }
      100% { transform: scale3d(1, 1, 1); }
    }

    #pillCurrencyIcon {
      display: block;
      transition: transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.22s ease;
      will-change: transform, opacity;
      transform: translateZ(0);
      backface-visibility: hidden;
    }

    #pillCurrencyIcon.pill-icon-swap {
      animation: wtPillIconSwap 240ms cubic-bezier(0.22, 0.61, 0.36, 1);
    }

    @keyframes wtPillIconSwap {
      0% { opacity: 0.7; transform: translateZ(0) scale(0.92); }
      60% { opacity: 1; transform: translateZ(0) scale(1.06); }
      100% { opacity: 1; transform: translateZ(0) scale(1); }
    }

    /* ============================================
   MODERN CURRENCY SWITCH - REDESIGNED
   ============================================ */

.currency-switch {
  display: flex;
  gap: 6px;
  padding: 5px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.02);
  border-radius: 18px;
  margin: 16px 0;
  position: relative;
  overflow: hidden;
  isolation: isolate;
  --wt-indicator-x: 0px;
  contain: paint;
  transform: translateZ(0);
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.3);
}

.currency-switch::after {
  content: none;
}

/* Анимированный индикатор выбора */
.currency-switch::before {
  content: "";
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: 5px;
  width: calc(50% - 8px);
  border-radius: 14px;
  background: linear-gradient(
    135deg, 
    rgba(0, 166, 255, 0.25) 0%,
    rgba(13, 104, 195, 0.20) 100%
  );
  box-shadow: 
    0 4px 16px rgba(0, 166, 255, 0.3),
    0 0 0 1px rgba(0, 166, 255, 0.2) inset,
    0 1px 2px rgba(255, 255, 255, 0.1) inset;
  transition: transform 0.26s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 0.22s ease, background 0.22s ease;
  pointer-events: none;
  z-index: 0;
  will-change: transform;
  transform: translateX(var(--wt-indicator-x));
}

/* Индикатор для Stars */
.currency-switch:has(.curr-btn[data-currency="stars"].curr-btn--active)::before {
  background: linear-gradient(
    135deg, 
    rgba(255, 193, 7, 0.28) 0%,
    rgba(255, 152, 0, 0.22) 100%
  );
  box-shadow: 
    0 4px 16px rgba(255, 193, 7, 0.35),
    0 0 0 1px rgba(255, 193, 7, 0.25) inset,
    0 1px 2px rgba(255, 255, 255, 0.15) inset;
}

.currency-switch:has(.curr-btn[data-currency="stars"].curr-btn--active) {
  --wt-indicator-x: calc(100% + 4px);
}

/* Кнопки валют */
.curr-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border-radius: 14px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 800;
  font-size: 15px;
  letter-spacing: 0.3px;
  transition: color 0.22s ease, text-shadow 0.22s ease, transform 0.16s ease;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  min-height: 48px;
  position: relative;
  z-index: 1;
}

.curr-btn:hover {
  color: rgba(255, 255, 255, 0.75);
  transform: scale(1.01);
}

.curr-btn:active {
  transform: scale(0.99);
}

/* Активная кнопка TON */
.curr-btn--active {
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 166, 255, 0.4);
}

/* Активная кнопка Stars */
.curr-btn[data-currency="stars"].curr-btn--active {
  color: #fff;
  text-shadow: 0 2px 8px rgba(255, 193, 7, 0.5);
}

/* Иконки */
.curr-icon {
  width: 22px;
  height: 22px;
  opacity: 0.6;
  transition: opacity 0.22s ease, transform 0.22s ease, filter 0.22s ease;
  pointer-events: none;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  transform: translateZ(0);
}

.curr-btn:hover .curr-icon {
  opacity: 0.85;
  transform: translateZ(0) scale(1.04);
}

.curr-btn:active .curr-icon {
  transform: translateZ(0) scale(0.98);
}

/* Активная иконка TON */
.curr-btn--active .curr-icon {
  opacity: 1;
  filter: drop-shadow(0 0 8px rgba(0, 166, 255, 0.6));
  transform: translateZ(0) scale(1);
}

/* Активная иконка Stars */
.curr-btn[data-currency="stars"].curr-btn--active .curr-icon {
  filter: drop-shadow(0 0 8px rgba(255, 193, 7, 0.7));
}

/* ============================================
   ERROR STATES (когда блокировка)
   ============================================ */

@keyframes wtSwitchShake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-8px) rotate(-1deg); }
  30% { transform: translateX(7px) rotate(1deg); }
  45% { transform: translateX(-6px) rotate(-0.5deg); }
  60% { transform: translateX(5px) rotate(0.5deg); }
  75% { transform: translateX(-3px); }
}

@keyframes wtIndicatorError {
  0%   { transform: translateX(var(--wt-indicator-x)) scale(1); }
  25%  { transform: translateX(calc(var(--wt-indicator-x) + 12px)) scale(0.98); }
  50%  { transform: translateX(calc(var(--wt-indicator-x) - 10px)) scale(1.02); }
  75%  { transform: translateX(calc(var(--wt-indicator-x) + 6px)) scale(0.99); }
  100% { transform: translateX(var(--wt-indicator-x)) scale(1); }
}

@keyframes wtBtnErrorPop {
  0%   { transform: scale(1); }
  25%  { transform: scale(0.92); }
  50%  { transform: scale(1.04); }
  75%  { transform: scale(0.98); }
  100% { transform: scale(1); }
}

.currency-switch.currency-switch--error {
  border-color: rgba(255, 77, 79, 0.5);
  box-shadow: 
    0 0 0 3px rgba(255, 77, 79, 0.15),
    0 8px 24px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  animation: wtSwitchShake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.currency-switch.currency-switch--error::before {
  background: linear-gradient(
    135deg, 
    rgba(255, 77, 79, 0.3) 0%,
    rgba(239, 68, 68, 0.2) 100%
  );
  box-shadow: 
    0 4px 16px rgba(255, 77, 79, 0.4),
    0 0 0 1px rgba(255, 77, 79, 0.3) inset;
  animation: wtIndicatorError 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.curr-btn.curr-btn--error {
  color: #ff6b6b;
  animation: wtBtnErrorPop 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.curr-btn.curr-btn--error .curr-icon {
  opacity: 1;
  filter: drop-shadow(0 0 10px rgba(255, 77, 79, 0.5));
}

/* ============================================
   TOAST NOTIFICATION
   ============================================ */

#currency-lock-toast {
  position: fixed;
  top: 100px;
  left: 50%;
  transform: translateX(-50%) translateY(-20px);
  opacity: 0;
  z-index: 10000;
  background: rgba(30, 30, 35, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 16px;
  padding: 14px 20px;
  font-size: 14px;
  font-weight: 700;
  color: #ff6b6b;
  max-width: min(92vw, 380px);
  text-align: center;
  pointer-events: none;
  box-shadow: 
    0 12px 32px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 77, 79, 0.15) inset;
}

@keyframes wtToastIn {
  0%   { 
    opacity: 0; 
    transform: translateX(-50%) translateY(-30px) scale(0.9); 
  }
  60%  { 
    opacity: 1; 
    transform: translateX(-50%) translateY(0) scale(1.02); 
  }
  100% { 
    opacity: 1; 
    transform: translateX(-50%) translateY(0) scale(1); 
  }
}

@keyframes wtToastOut {
  0%   { 
    opacity: 1; 
    transform: translateX(-50%) translateY(0) scale(1); 
  }
  100% { 
    opacity: 0; 
    transform: translateX(-50%) translateY(-20px) scale(0.95); 
  }
}

#currency-lock-toast.show {
  animation: wtToastIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

#currency-lock-toast.hide {
  animation: wtToastOut 0.3s ease forwards;
}

/* ============================================
   ADAPTIVE
   ============================================ */

@media (max-width: 380px) {
  .currency-switch {
    gap: 5px;
    padding: 4px;
  }

  .curr-btn {
    padding: 12px 16px;
    font-size: 14px;
    min-height: 44px;
  }

  .curr-icon {
    width: 20px;
    height: 20px;
  }
}

/* ============================================
   ACCESSIBILITY
   ============================================ */

@media (hover: none) {
  .curr-btn:hover {
    transform: none;
  }

  .curr-btn:hover .curr-icon {
    transform: translateZ(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  #pillCurrencyIcon,
  #pillCurrencyIcon.pill-icon-swap,
  .currency-switch::before,
  .curr-btn,
  .curr-icon,
  #currency-lock-toast {
    transition: none;
    animation: none;
  }
}
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // ================== AUTO-INIT ==================
  init();
  
  setInterval(() => {
    loadBalanceFromServer();
  }, 30000);

  console.log('[Switch] 📦 Module loaded');

})();
