// Validation logic для TON и Stars попапов

(function() {
    'use strict';
  
    // ====== TON VALIDATION ======
    const tonInput = document.getElementById('tonAmountInput');
    const tonWrapper = document.getElementById('tonInputWrapper');
    const tonNotification = document.getElementById('tonErrorNotification');
    const btnDeposit = document.getElementById('btnDepositTon');
    
    const MIN_TON = 0.1;
  
    if (tonInput) {
      tonInput.addEventListener('input', () => {
        validateTonAmount();
      });
      
      tonInput.addEventListener('blur', () => {
        const amount = parseFloat(tonInput.value.replace(',', '.')) || 0;
        if (amount > 0 && amount < MIN_TON) {
          showError(tonWrapper, tonNotification);
        }
      });
    }
  
    function validateTonAmount() {
      const value = tonInput.value.replace(',', '.').replace(/[^0-9.]/g, '');
      const amount = parseFloat(value) || 0;
      
      // Убираем предыдущее состояние
      clearValidation(tonWrapper, tonNotification);
      
      if (amount >= MIN_TON) {
        // Успешная валидация
        tonWrapper.classList.add('success');
        if (btnDeposit) btnDeposit.disabled = false;
      } else if (amount > 0) {
        // Ошибка - меньше минимума
        if (btnDeposit) btnDeposit.disabled = true;
      } else {
        // Пустое поле
        if (btnDeposit) btnDeposit.disabled = true;
      }
    }
  
    // ====== STARS VALIDATION ======
    const starsInput = document.getElementById('starsAmountInput');
    const starsWrapper = document.getElementById('starsInputWrapper');
    const starsNotification = document.getElementById('starsErrorNotification');
    const btnBuyStars = document.getElementById('btnBuyStars');
    
    const MIN_STARS = 1;
  
    if (starsInput) {
      starsInput.addEventListener('input', () => {
        validateStarsAmount();
      });
      
      starsInput.addEventListener('blur', () => {
        const amount = parseInt(starsInput.value) || 0;
        if (amount > 0 && amount < MIN_STARS) {
          showError(starsWrapper, starsNotification);
        }
      });
    }
  
    function validateStarsAmount() {
      const value = starsInput.value.replace(/[^0-9]/g, '');
      const amount = parseInt(value) || 0;
      
      // Убираем предыдущее состояние
      clearValidation(starsWrapper, starsNotification);
      
      if (amount >= MIN_STARS) {
        // Успешная валидация
        starsWrapper.classList.add('success');
        if (btnBuyStars) btnBuyStars.disabled = false;
      } else if (amount > 0) {
        // Ошибка - меньше минимума (но пока не показываем)
        if (btnBuyStars) btnBuyStars.disabled = true;
      } else {
        // Пустое поле
        if (btnBuyStars) btnBuyStars.disabled = true;
      }
    }
  
    // ====== HELPER FUNCTIONS ======
    function showError(wrapper, notification) {
      // Убираем предыдущие классы
      wrapper.classList.remove('success');
      
      // Добавляем ошибку
      wrapper.classList.add('error');
      if (notification) notification.hidden = false;
      
      // Haptic feedback
      const tg = window.Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('error');
      }
      
      // Убираем тряску через 400ms
      setTimeout(() => {
        wrapper.classList.remove('error');
      }, 400);
      
      // Скрываем уведомление через 3 секунды
      setTimeout(() => {
        if (notification) notification.hidden = true;
      }, 3000);
    }
  
    function clearValidation(wrapper, notification) {
      wrapper.classList.remove('error', 'success');
      if (notification) notification.hidden = true;
    }
  
    // ====== EXPORT ======
    window.DepositValidation = {
      validateTon: validateTonAmount,
      validateStars: validateStarsAmount,
      showError: showError,
      clearValidation: clearValidation
    };
  
    console.log('[Validation] ✅ Validation system ready');
  
  })();