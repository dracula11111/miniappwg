/**
 * switch.js - Currency Switch System (TON / Telegram Stars)
 * ФИНАЛЬНАЯ ВЕРСИЯ - Идеальная синхронизация валют
 */

(function() {
  'use strict';

  // ================== STATE ==================
  let currentCurrency = 'ton'; // 'ton' | 'stars'
  let userBalance = {
    ton: 0,
    stars: 0
  };

  // Telegram Web App API
  const tg = window.Telegram?.WebApp;

  // ================== INIT ==================
  function init() {
    console.log('[Switch] 🚀 Initializing currency system...');
    
    // 1. Загружаем сохранённую валюту
    loadCurrency();
    
    // 2. Ждем загрузки DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDOMReady);
    } else {
      onDOMReady();
    }
    
    console.log('[Switch] ✅ Currency system initialized. Current:', currentCurrency);
  }

  function onDOMReady() {
    console.log('[Switch] 📄 DOM ready, setting up UI...');
    
    // 1. Инициализация UI
    initUI();
    
    // 2. События
    attachEventListeners();
    
    // 3. Синхронизация кнопок ставок
    setTimeout(() => {
      syncAmountButtons();
    }, 100);
    
    // 4. Загрузка баланса
    loadBalanceFromServer();
    
    // 5. Обновление отображения
    updateBalanceDisplay();
  }

  // ================== UI SETUP ==================
  function initUI() {
    console.log('[Switch] 🎨 Initializing UI...');
    
    // Обновляем переключатели валют
    const currencyBtns = document.querySelectorAll('.curr-btn');
    currencyBtns.forEach(btn => {
      const currency = btn.dataset.currency;
      if (currency === currentCurrency) {
        btn.classList.add('curr-btn--active');
      } else {
        btn.classList.remove('curr-btn--active');
      }
    });
    
    // Обновляем иконку в topbar
    updateTopbarIcon();
    
    console.log('[Switch] ✅ UI initialized');
  }

  // ================== EVENT LISTENERS ==================
  function attachEventListeners() {
    // Переключатели валюты в профиле
    const currencyBtns = document.querySelectorAll('.curr-btn');
    currencyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currency = btn.dataset.currency;
        console.log('[Switch] 📘 Currency button clicked:', currency);
        switchCurrency(currency);
      });
      
      btn.style.cursor = 'pointer';
      btn.style.userSelect = 'none';
      btn.style.webkitTapHighlightColor = 'transparent';
    });

    // Кнопка баланса в topbar
    const tonPill = document.getElementById('tonPill');
    if (tonPill) {
      tonPill.addEventListener('click', (e) => {
        e.preventDefault();
        openDepositPopup();
      });
    }

    // События баланса
    window.addEventListener('balance:update', (e) => {
      if (e.detail) {
        updateBalance(e.detail);
      }
    });
    
    window.addEventListener('balance:loaded', (e) => {
      if (e.detail) {
        console.log('[Switch] 📥 Balance loaded event:', e.detail);
        updateBalance(e.detail);
      }
    });

    // Live updates от SSE
    window.addEventListener('balance:live-update', (e) => {
      if (e.detail) {
        console.log('[Switch] 📡 Live balance update:', e.detail);
        updateBalance(e.detail);
      }
    });
  }

  // ================== CURRENCY SWITCHING ==================
  function switchCurrency(currency) {
    if (currency === currentCurrency) {
      console.log('[Switch] Already on', currency);
      return;
    }
    
    console.log(`[Switch] 🔄 Switching from ${currentCurrency} to ${currency}`);
    
    // Закрываем все попапы
    closeAllPopups();
    
    // Обновляем состояние
    currentCurrency = currency;
    
    // Сохраняем
    saveCurrency();
    
    // Обновляем UI
    updateCurrencyUI();
    updateBalanceDisplay(true);
    
    // Синхронизируем кнопки ставок
    syncAmountButtons();
    
    // Уведомляем другие модули
    window.dispatchEvent(new CustomEvent('currency:changed', {
      detail: { currency }
    }));

    if (tg?.HapticFeedback) {
      tg.HapticFeedback.selectionChanged();
    }
  }

  function updateCurrencyUI() {
    console.log('[Switch] 🎨 Updating UI for currency:', currentCurrency);
    
    // Обновляем кнопки переключателя
    const currencyBtns = document.querySelectorAll('.curr-btn');
    currencyBtns.forEach(btn => {
      const currency = btn.dataset.currency;
      if (currency === currentCurrency) {
        btn.classList.add('curr-btn--active');
      } else {
        btn.classList.remove('curr-btn--active');
      }
    });

    // Обновляем иконку
    updateTopbarIcon();
  }

  function updateTopbarIcon() {
    const pillIcon = document.getElementById('pillCurrencyIcon');
    
    if (!pillIcon) {
      console.warn('[Switch] ⚠️ pillCurrencyIcon not found');
      return;
    }

    const iconPath = currentCurrency === 'ton' ? '/icons/ton.svg' : '/icons/stars.svg';
    
    console.log('[Switch] 🎨 Changing icon to:', currentCurrency);
    
    // Плавная смена с анимацией
    pillIcon.style.opacity = '0';
    pillIcon.style.transform = 'scale(0.8) rotate(-15deg)';
    
    setTimeout(() => {
      pillIcon.src = iconPath;
      pillIcon.style.opacity = '1';
      pillIcon.style.transform = 'scale(1) rotate(0deg)';
    }, 150);
  }

  // ================== AMOUNT BUTTONS SYNC ==================
  function syncAmountButtons() {
    const amountBtns = document.querySelectorAll('.amount-btn');
    if (amountBtns.length === 0) {
      console.log('[Switch] ⏭️ No amount buttons found, skipping');
      return;
    }

    console.log('[Switch] 🔄 Syncing amount buttons for:', currentCurrency);
    
    // Добавляем класс анимации
    amountBtns.forEach(btn => btn.classList.add('currency-switching'));
    
    setTimeout(() => {
      if (currentCurrency === 'ton') {
        // TON: 0.1, 0.5, 1, 2.5
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
        // STARS: 1, 5, 10, 25
        const starsAmounts = [1, 5, 10, 25];
        amountBtns.forEach((btn, index) => {
          if (index < starsAmounts.length) {
            const amount = starsAmounts[index];
            btn.dataset.amount = amount;
            btn.innerHTML = `
              <img src="/icons/stars.svg" alt="" class="amount-icon" />
              <span class="amount-value">${amount}</span>
            `;
          }
        });
      }
      
      // Убираем класс анимации
      amountBtns.forEach(btn => btn.classList.remove('currency-switching'));
    }, 150);
    
    // Активируем первую кнопку и обновляем currentAmount в wheel.js
    setTimeout(() => {
      amountBtns.forEach((btn, index) => {
        if (index === 0) {
          btn.classList.add('active');
          
          // Обновляем глобальную переменную в wheel.js
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
    
    // Обновляем балансы в модулях
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

    const targetValue = currentCurrency === 'ton' 
      ? userBalance.ton.toFixed(2)
      : formatStars(userBalance.stars);

    if (animate) {
      animateBalanceChange(tonAmount, targetValue);
    } else {
      tonAmount.textContent = targetValue;
    }
  }

  function animateBalanceChange(element, targetValue) {
    element.classList.add('balance-jelly');
    
    const currentText = element.textContent;
    const currentNum = parseFloat(currentText.replace(/[^\d.]/g, '')) || 0;
    const targetNum = parseFloat(targetValue.replace(/[^\d.]/g, '')) || 0;
    
    const duration = 800;
    const steps = 30;
    const stepDuration = duration / steps;
    const increment = (targetNum - currentNum) / steps;
    
    let currentStep = 0;
    
    const timer = setInterval(() => {
      currentStep++;
      
      if (currentStep >= steps) {
        element.textContent = targetValue;
        clearInterval(timer);
        
        setTimeout(() => {
          element.classList.remove('balance-jelly');
        }, 600);
      } else {
        const newValue = currentNum + (increment * currentStep);
        element.textContent = currentCurrency === 'ton' 
          ? newValue.toFixed(2)
          : formatStars(Math.round(newValue));
      }
    }, stepDuration);
  }

  function formatStars(amount) {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M';
    }
    if (amount >= 1000) {
      return (amount / 1000).toFixed(1) + 'K';
    }
    return amount.toString();
  }

  // ================== SERVER SYNC ==================
  async function loadBalanceFromServer() {
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
          
          // Уведомляем модули о загрузке
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
        console.log('[Switch] 📥 Loaded currency from storage:', currentCurrency);
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
    
    // Debug
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
      animation: jellyBounce 0.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
      transform-origin: center;
    }

    @keyframes jellyBounce {
      0% { transform: scale3d(1, 1, 1); }
      10% { transform: scale3d(1.25, 0.75, 1); }
      20% { transform: scale3d(0.85, 1.15, 1); }
      30% { transform: scale3d(1.15, 0.85, 1); }
      40% { transform: scale3d(0.95, 1.05, 1); }
      50% { transform: scale3d(1.05, 0.95, 1); }
      60% { transform: scale3d(0.98, 1.02, 1); }
      70% { transform: scale3d(1.02, 0.98, 1); }
      80%, 100% { transform: scale3d(1, 1, 1); }
    }

    #pillCurrencyIcon {
      transition: opacity 0.15s ease, transform 0.15s ease;
      will-change: opacity, transform;
    }

    .currency-switch {
      display: flex;
      gap: 8px;
      padding: 4px;
      background: var(--panel, #121823);
      border: 1px solid var(--border, #253247);
      border-radius: 16px;
      margin: 16px 0;
      position: relative;
      overflow: hidden;
    }

    .currency-switch::before {
      content: "";
      position: absolute;
      top: 4px;
      bottom: 4px;
      left: 4px;
      width: calc(50% - 8px);
      border-radius: 12px;
      background: linear-gradient(135deg, rgba(0,166,255,.15), rgba(13,104,195,.15));
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      z-index: 0;
      transform: translateX(0);
    }

    .currency-switch:has(.curr-btn[data-currency="stars"].curr-btn--active)::before {
      transform: translateX(calc(100% + 8px));
    }

    .curr-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      border-radius: 12px;
      background: transparent;
      border: none;
      color: var(--muted, #99a7bb);
      font-weight: 700;
      font-size: 14px;
      transition: color .2s ease, transform .15s ease;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      min-height: 44px;
      position: relative;
      z-index: 1;
    }

    .curr-btn:hover {
      color: var(--text, #e7edf7);
    }

    .curr-btn:active {
      transform: scale(.96);
    }

    .curr-btn--active {
      color: var(--accent, #00a6ff);
    }

    .curr-icon {
      width: 20px;
      height: 20px;
      opacity: .7;
      transition: opacity .3s ease, transform .2s ease;
      pointer-events: none;
    }

    .curr-btn:hover .curr-icon {
      opacity: .9;
      transform: scale(1.05);
    }

    .curr-btn--active .curr-icon {
      opacity: 1;
      filter: drop-shadow(0 0 4px rgba(0,166,255,.3));
    }

    .pill--ton {
      transition: all 0.25s ease;
    }

    .pill--ton:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 
        0 0 0 1px rgba(0,166,255,.35) inset,
        0 8px 24px rgba(0,166,255,.25);
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // ================== AUTO-INIT ==================
  init();
  
  // Автосинхронизация каждые 30 секунд
  setInterval(() => {
    loadBalanceFromServer();
  }, 30000);

  console.log('[Switch] 📦 Module loaded');

})();