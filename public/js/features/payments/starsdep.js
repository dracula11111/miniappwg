// public/js/starsdep.js - Stars Purchase Module (FIXED)
(() => {
  console.log('[STARS] ⭐ Starting Stars module');

  // ====== CONFIG ======
  const MIN_STARS = 1;

  // ====== DOM ======
  const popup = document.getElementById("starsDepositPopup");
  if (!popup) {
    console.error('[STARS] ❌ starsDepositPopup not found!');
    return;
  }

  const backdrop = popup.querySelector(".deposit-popup__backdrop");
  const btnClose = document.getElementById("starsPopupClose");
  const amountInput = document.getElementById("starsAmountInput");
  const inputWrapper = document.getElementById("starsInputWrapper");
  const errorNotification = document.getElementById("starsErrorNotification");
  const btnBuy = document.getElementById("btnBuyStars");
  const termsCheckbox = document.getElementById("starsTermsAgree");
  const termsLink = document.getElementById("starsTermsLink");
  const rulesSheet = document.getElementById("starsRulesSheet");
  const rulesBackdrop = document.getElementById("starsRulesBackdrop");
  const rulesCloseBtn = document.getElementById("starsRulesCloseBtn");
  const rulesPanel = rulesSheet?.querySelector(".wt-terms-sheet__panel");

  // ====== TELEGRAM ======
  const tg = window.Telegram?.WebApp;
  const tgUserId = tg?.initDataUnsafe?.user?.id || null;
  const initData = tg?.initData || "";

  if (!tg?.openInvoice) {
    console.warn('[STARS] ⚠️ openInvoice not available (not in Telegram)');
  }

  // ====== STATE ======
  let platformBalance = 0;
  let isBuyingInProgress = false;
  let rulesHideTimer = 0;

  function isTermsAccepted() {
    return !!termsCheckbox?.checked;
  }

  function syncBuyButtonState() {
    const amount = parseInt(amountInput?.value, 10) || 0;
    const canBuy = amount >= MIN_STARS && isTermsAccepted() && !isBuyingInProgress;
    if (btnBuy) btnBuy.disabled = !canBuy;
    return canBuy;
  }

  function syncAmountInputWidth() {
    if (!amountInput) return;
    const value = amountInput.value || amountInput.placeholder || '0';
    const len = Math.max(1, Math.min(8, String(value).length));
    amountInput.style.setProperty('--deposit-amount-width', `${len + 0.25}ch`);
  }

  function openRulesSheet(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!rulesSheet) return;
    if (rulesHideTimer) {
      clearTimeout(rulesHideTimer);
      rulesHideTimer = 0;
    }
    rulesSheet.hidden = false;
    window.requestAnimationFrame(() => {
      rulesSheet.classList.add('is-open');
      rulesPanel?.focus();
    });
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  }

  function closeRulesSheet() {
    if (!rulesSheet) return;
    rulesSheet.classList.remove('is-open');
    if (rulesHideTimer) {
      clearTimeout(rulesHideTimer);
    }
    rulesHideTimer = window.setTimeout(() => {
      if (!rulesSheet.classList.contains('is-open')) {
        rulesSheet.hidden = true;
      }
    }, 260);
  }

  // ====== VALIDATION ======
  function validateAmount() {
    const amount = parseInt(amountInput?.value) || 0;
    
    if (inputWrapper) {
      inputWrapper.classList.remove('error', 'success');
    }
    if (errorNotification) {
      errorNotification.hidden = true;
    }
    
    if (amount >= MIN_STARS) {
      if (inputWrapper) inputWrapper.classList.add('success');
      syncBuyButtonState();
      return true;
    } else if (amount > 0) {
      syncBuyButtonState();
      return false;
    } else {
      syncBuyButtonState();
      return false;
    }
  }
  
  function showValidationError() {
    if (inputWrapper) {
      inputWrapper.classList.remove('success');
      inputWrapper.classList.add('error');
      setTimeout(() => {
        inputWrapper.classList.remove('error');
      }, 400);
    }
    
    if (errorNotification) {
      errorNotification.hidden = false;
      setTimeout(() => {
        errorNotification.hidden = true;
      }, 3000);
    }
    
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred('error');
    }
  }

  // ====== POPUP ======
  function openPopup() {
    console.log('[STARS] 📂 Open popup');
    popup.classList.add('deposit-popup--open');
    updateUI();
    syncAmountInputWidth();
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  }

  function closePopup() {
    popup.classList.remove('deposit-popup--open');
    if (inputWrapper) inputWrapper.classList.remove('error', 'success');
    if (errorNotification) errorNotification.hidden = true;
    if (termsCheckbox) termsCheckbox.checked = false;
    closeRulesSheet();
    updateUI();
  }

  backdrop?.addEventListener('click', closePopup);
  btnClose?.addEventListener('click', closePopup);
  termsLink?.addEventListener('click', openRulesSheet);
  rulesBackdrop?.addEventListener('click', closeRulesSheet);
  rulesCloseBtn?.addEventListener('click', closeRulesSheet);
  rulesSheet?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRulesSheet();
    }
  });

  // ====== INPUT ======
  amountInput?.addEventListener('input', () => {
    const caret = amountInput.selectionStart;
    amountInput.value = amountInput.value.replace(/[^0-9]/g, "");
    try { amountInput.setSelectionRange(caret, caret); } catch {}
    syncAmountInputWidth();
    validateAmount();
  });

  termsCheckbox?.addEventListener('change', () => {
    syncBuyButtonState();
  });
  
  amountInput?.addEventListener('blur', () => {
    const amount = parseInt(amountInput?.value) || 0;
    if (amount > 0 && amount < MIN_STARS) {
      showValidationError();
    }
  });

  // ====== UI ======
  function updateUI() {
    const valid = validateAmount();
    const termsAccepted = isTermsAccepted();
    console.log('[STARS] UI:', { valid, termsAccepted });
  }

  function showTermsRequiredError() {
    const raw = 'Please agree with the Stars top-up rules first.';
    const msg = window.WT?.i18n?.translate?.(raw) || raw;
    if (tg?.showAlert) {
      tg.showAlert(msg);
    } else {
      alert(msg);
    }
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred('warning');
    }
  }

  // ====== UPDATE BALANCE ======
  function setBalance(balance) {
    platformBalance = parseInt(balance) || 0;
    console.log('[STARS] 💰 Balance set:', platformBalance);
  }

  // ====== CREATE INVOICE ======
  async function createInvoice(amount) {
    console.log('[STARS] 💫 Creating invoice:', amount);

    if (!tgUserId) {
      throw new Error('User not authorized in Telegram');
    }

    try {
      const res = await fetch('/api/stars/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount, 
          userId: tgUserId, 
          initData 
        })
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('[STARS] Server error:', res.status, text);
        
        if (res.status === 404) {
          throw new Error('Server endpoint not configured. Please contact support.');
        } else if (res.status === 400) {
          throw new Error('Invalid request');
        } else if (res.status === 500) {
          throw new Error('Server error. Please try again later.');
        } else {
          throw new Error(`Server error: ${res.status}`);
        }
      }

      const data = await res.json();
      console.log('[STARS] Invoice response:', data);

      if (!data.ok || !data.invoiceLink) {
        throw new Error(data.error || 'Failed to create invoice');
      }

      return data;

    } catch (err) {
      console.error('[STARS] ❌ Invoice error:', err);
      throw err;
    }
  }

  // ====== BUY STARS ======
  btnBuy?.addEventListener('click', async (e) => {
    e.preventDefault();

    const amount = parseInt(amountInput?.value) || 0;
    
    if (amount < MIN_STARS) {
      showValidationError();
      return;
    }

    if (!isTermsAccepted()) {
      showTermsRequiredError();
      return;
    }

    if (!tg?.openInvoice) {
      const msg = 'Stars payment only works in Telegram app. Please open this page in Telegram.';
      if (tg?.showAlert) {
        tg.showAlert(msg);
      } else {
        alert(msg);
      }
      return;
    }

    if (!tgUserId) {
      const msg = 'You must authorize in Telegram first';
      if (tg?.showAlert) {
        tg.showAlert(msg);
      } else {
        alert(msg);
      }
      return;
    }

    console.log('[STARS] 🛒 Buy:', amount);
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    const oldText = btnBuy.textContent;
    isBuyingInProgress = true;
    syncBuyButtonState();
    btnBuy.textContent = 'Creating invoice...';

    try {
      const invoiceData = await createInvoice(amount);
      
      btnBuy.textContent = 'Opening payment...';
      console.log('[STARS] 🎫 Opening invoice:', invoiceData.invoiceLink);

      tg.openInvoice(invoiceData.invoiceLink, (status) => {
        console.log('[STARS] 📋 Payment status:', status);

        if (status === 'paid') {
          console.log('[STARS] ✅ Payment successful!');

          // 🔥 FIX: Don't call /api/deposit-notification here!
          // Telegram will send webhook to the server automatically
          // The SSE connection will notify us when balance updates
          
          console.log('[STARS] ⏳ Waiting for balance update from server...');

          if (tg?.showPopup) {
            tg.showPopup({
              title: '✅ Success',
              message: `Purchased ${amount} ⭐ Stars!\n\nYour balance will update automatically.`,
              buttons: [{ type: 'ok' }]
            });
          } else if (tg?.showAlert) {
            tg.showAlert(`✅ Purchased ${amount} ⭐ Stars!`);
          }

          if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

          // Balance will update automatically via SSE (balance-live.js)
          // No need to reload manually

          setTimeout(() => {
            if (amountInput) amountInput.value = '';
            btnBuy.textContent = oldText;
            closePopup();
            isBuyingInProgress = false;
            syncBuyButtonState();
          }, 1500);

        } else if (status === 'cancelled') {
          console.log('[STARS] ⚠️ Payment cancelled by user');
          if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
          btnBuy.textContent = oldText;
          isBuyingInProgress = false;
          syncBuyButtonState();

        } else if (status === 'failed') {
          console.error('[STARS] ❌ Payment failed');
          if (tg?.showAlert) tg.showAlert('Payment failed. Please try again.');
          if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
          btnBuy.textContent = oldText;
          isBuyingInProgress = false;
          syncBuyButtonState();
          
        } else {
          console.warn('[STARS] ⚠️ Unknown status:', status);
          btnBuy.textContent = oldText;
          isBuyingInProgress = false;
          syncBuyButtonState();
        }
      });

    } catch (err) {
      console.error('[STARS] ❌ Error:', err);

      let msg = 'Failed to process payment';
      
      if (err.message.includes('not configured')) {
        msg = 'Server not configured. Please contact support.';
      } else if (err.message.includes('404')) {
        msg = 'Payment service unavailable. Please contact support.';
      } else if (err.message.includes('500')) {
        msg = 'Server error. Please try again later.';
      } else if (err.message.includes('Network')) {
        msg = 'Network error. Please check your connection.';
      } else if (err.message) {
        msg = err.message;
      }

      if (tg?.showAlert) {
        tg.showAlert(msg);
      } else {
        alert(msg);
      }
      
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');

      btnBuy.textContent = oldText;
      isBuyingInProgress = false;
      syncBuyButtonState();
    }
  });

  // ====== EVENTS ======
  // Listen to live balance updates from SSE
  window.addEventListener('balance:live-update', (e) => {
    if (e.detail?.stars !== undefined) {
      console.log('[STARS] 🔡 Live balance update:', e.detail.stars);
      setBalance(e.detail.stars);
    }
  });

  window.addEventListener('balance:loaded', (e) => {
    if (e.detail?.stars !== undefined) {
      console.log('[STARS] 🔥 Balance loaded:', e.detail.stars);
      setBalance(e.detail.stars);
    }
  });

  // ====== INIT ======
  updateUI();
  
  console.log('[STARS] ✅ Module ready');
  console.log('[STARS] User ID:', tgUserId || 'Not authorized');
  console.log('[STARS] openInvoice available:', !!tg?.openInvoice);

  // ====== EXPORT ======
  window.WTStarsDeposit = {
    open: openPopup,
    close: closePopup,
    setBalance: setBalance,
    isAvailable: () => !!tg?.openInvoice && !!tgUserId,
    getBalance: () => platformBalance
  };

  setTimeout(() => {
    console.log('[STARS] 🔍 Status check:', {
      module: 'Ready',
      telegram: !!tg,
      userId: tgUserId || 'Not set',
      openInvoice: !!tg?.openInvoice,
      balance: platformBalance
    });
  }, 1000);

})();
