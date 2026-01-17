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

  // Telegram Web App API
  const tg = window.Telegram?.WebApp;
  
  function applyCurrencyTheme() {
    const root = document.documentElement;
    root.dataset.currency = currentCurrency;
    root.classList.toggle('currency-ton', currentCurrency === 'ton');
    root.classList.toggle('currency-stars', currentCurrency === 'stars');
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

  function onDOMReady() {
    console.log('[Switch] 🔄 DOM ready, setting up UI...');
    
    initUI();
    attachEventListeners();
    watchProfilePageActive();
    
    setTimeout(() => {
      syncAmountButtons();
      // Попытка создать иконки при загрузке
      createFloatingIcons();
    }, 300);
    
    loadBalanceFromServer();
    updateBalanceDisplay();
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
      tonPill.addEventListener('click', (e) => {
        e.preventDefault();
        openDepositPopup();
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
    window.addEventListener('page:changed', (e) => {
      console.log('[Switch] 🔄 Page changed to:', e.detail?.page);
      
      if (e.detail?.page === 'profilePage') {
        setTimeout(() => {
          createFloatingIcons();
        }, 300);
      } else {
        clearFloatingIcons();
      }
    });
  }

  // ================== WATCH PROFILE PAGE ==================
  function watchProfilePageActive() {
    const profilePage = document.getElementById('profilePage');
    if (!profilePage) return;

    // Создаем наблюдатель за изменением классов
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const isActive = profilePage.classList.contains('page--active');
          console.log('[Switch] 👀 Profile page active:', isActive);
          
          if (isActive) {
            setTimeout(() => {
              createFloatingIcons();
            }, 200);
          } else {
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
    if (profilePage.classList.contains('page--active')) {
      setTimeout(() => {
        createFloatingIcons();
      }, 200);
    }
  }

  // ================== ROUND LOCK (ACTIVE BET) ==================
  function isCurrencyChangeLocked() {
    try {
      return !!(window.WheelGame && typeof window.WheelGame.hasBets === 'function' && window.WheelGame.hasBets());
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
    
    // 🔥 УЛУЧШЕННАЯ ПРОВЕРКА: проверяем несколько условий
    const isProfileVisible = profilePage && (
      profilePage.classList.contains('page--active') ||
      profilePage.style.display !== 'none' ||
      getComputedStyle(profilePage).display !== 'none'
    );

    if (!isProfileVisible) {
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

    console.log(`[Switch] ✨ Created ${iconConfigs.length} flying icons around avatar`);
  }

  function clearFloatingIcons() {
    const containers = document.querySelectorAll('.currency-icons-float');
    containers.forEach(c => c.remove());
    console.log('[Switch] 🧹 Cleared floating icons');
  }

  // ================== CURRENCY SWITCHING ==================
  function switchCurrency(currency, sourceBtn) {
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
    clearFloatingIcons();
    
    currentCurrency = currency;
    saveCurrency();
    updateCurrencyUI();
    updateBalanceDisplay(true);
    syncAmountButtons();
    
    setTimeout(() => {
      createFloatingIcons();
    }, 150);
    
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

    const iconPath = currentCurrency === 'ton' ? '/icons/ton.svg' : '/icons/stars.svg';
    
    console.log('[Switch] 🎨 Changing icon to:', currentCurrency);
    
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
      console.log('[Switch] ⭐️ No amount buttons found, skipping');
      return;
    }

    console.log('[Switch] 🔄 Syncing amount buttons for:', currentCurrency);
    
    amountBtns.forEach(btn => btn.classList.add('currency-switching'));
    
    setTimeout(() => {
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
    
    setTimeout(() => {
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  margin: 16px 0;
  position: relative;
  overflow: hidden;
  --wt-indicator-x: 0px;
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
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
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
  z-index: 0;
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
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  min-height: 48px;
  position: relative;
  z-index: 1;
}

.curr-btn:hover {
  color: rgba(255, 255, 255, 0.75);
  transform: scale(1.02);
}

.curr-btn:active {
  transform: scale(0.98);
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
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.curr-btn:hover .curr-icon {
  opacity: 0.85;
  transform: scale(1.08) rotate(-5deg);
}

.curr-btn:active .curr-icon {
  transform: scale(0.95);
}

/* Активная иконка TON */
.curr-btn--active .curr-icon {
  opacity: 1;
  filter: drop-shadow(0 0 8px rgba(0, 166, 255, 0.6));
  animation: iconPulse 2s ease-in-out infinite;
}

/* Активная иконка Stars */
.curr-btn[data-currency="stars"].curr-btn--active .curr-icon {
  filter: drop-shadow(0 0 8px rgba(255, 193, 7, 0.7));
}

@keyframes iconPulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
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

@media (prefers-reduced-motion: reduce) {
  .currency-switch::before,
  .curr-btn,
  .curr-icon,
  #currency-lock-toast {
    transition: none;
    animation: none;
  }
  
  .curr-btn--active .curr-icon {
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