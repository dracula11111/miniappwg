// public/js/tondep.js - TON Deposit Module (FIXED)
(() => {
  console.log('[TON] 🚀 Starting TON module');

  // ====== CONFIG ======
  const MANIFEST_URL = `${location.origin}/tonconnect-manifest.json`;
  const PROJECT_TON_ADDRESS = "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J";
  const MIN_DEPOSIT = 0.1;

  // ====== DOM ======
  const popup = document.getElementById("tonDepositPopup");
  if (!popup) {
    console.error('[TON] ❌ tonDepositPopup not found!');
    return;
  }

  const backdrop = popup.querySelector(".deposit-popup__backdrop");
  const btnClose = document.getElementById("tonPopupClose");
  const walletBalance = document.getElementById("tonWalletBalance");
  const amountInput = document.getElementById("tonAmountInput");
  const inputWrapper = document.getElementById("tonInputWrapper");
  const errorNotification = document.getElementById("tonErrorNotification");
  const btnConnect = document.getElementById("btnConnectTonWallet");
  const btnDeposit = document.getElementById("btnDepositTon");

  // ====== TELEGRAM ======
  const tg = window.Telegram?.WebApp;
  const tgUserId = tg?.initDataUnsafe?.user?.id || "guest";
  const initData = tg?.initData || "";

  // ====== STATE ======
  let platformBalance = 0;

  // ====== HELPERS ======
  function normalize(input) {
    if (!input) return NaN;
    let s = String(input).trim().replace(",", ".").replace(/[^\d.]/g, "");
    const dot = s.indexOf(".");
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function toNanoStr(amount) {
    const s = String(amount).replace(",", ".");
    const [i = "0", f = ""] = s.split(".");
    const frac9 = (f + "000000000").slice(0, 9);
    return (BigInt(i || "0") * 1_000_000_000n + BigInt(frac9)).toString();
  }

  function fromNano(nanoStr) {
    const nano = BigInt(nanoStr);
    return (Number(nano) / 1_000_000_000).toFixed(2);
  }

  // ====== VALIDATION ======
  function validateAmount() {
    const amount = normalize(amountInput?.value);
    
    if (inputWrapper) {
      inputWrapper.classList.remove('error', 'success');
    }
    if (errorNotification) {
      errorNotification.hidden = true;
    }
    
    if (amount >= MIN_DEPOSIT) {
      if (inputWrapper) inputWrapper.classList.add('success');
      if (btnDeposit && tc?.account) btnDeposit.disabled = false;
      return true;
    } else if (amount > 0) {
      if (btnDeposit) btnDeposit.disabled = true;
      return false;
    } else {
      if (btnDeposit) btnDeposit.disabled = true;
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
    console.log('[TON] 📂 Open popup');
    popup.classList.add('deposit-popup--open');
    
    if (tc?.account) fetchWalletBalance();
    updateUI();
    
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  }

  function closePopup() {
    popup.classList.remove('deposit-popup--open');
    if (inputWrapper) inputWrapper.classList.remove('error', 'success');
    if (errorNotification) errorNotification.hidden = true;
  }

  backdrop?.addEventListener('click', closePopup);
  btnClose?.addEventListener('click', closePopup);

  // ====== INPUT ======
  amountInput?.addEventListener('input', () => {
    const caret = amountInput.selectionStart;
    amountInput.value = amountInput.value
      .replace(",", ".").replace(/[^0-9.]/g, "").replace(/^(\d*\.\d*).*$/, "$1");
    try { amountInput.setSelectionRange(caret, caret); } catch {}
    validateAmount();
  });
  
  amountInput?.addEventListener('blur', () => {
    const amount = normalize(amountInput?.value);
    if (amount > 0 && amount < MIN_DEPOSIT) {
      showValidationError();
    }
  });

  // ====== TONCONNECT ======
  if (!window.TON_CONNECT_UI) {
    console.error('[TON] ❌ TonConnect not loaded!');
    return;
  }

  const storage = {
    getItem: (k) => localStorage.getItem(`${tgUserId}:tc:${k}`),
    setItem: (k, v) => localStorage.setItem(`${tgUserId}:tc:${k}`, v),
    removeItem: (k) => localStorage.removeItem(`${tgUserId}:tc:${k}`)
  };

  console.log('[TON] ✅ Init TonConnect');

  const tc = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: MANIFEST_URL,
    buttonRootId: null,
    storage,
    restoreConnection: true,
    actionsConfiguration: { twaReturnUrl: 'https://t.me' }
  });

  window.__wtTonConnect = tc;
  window.dispatchEvent(new Event("wt-tc-ready"));
  
  console.log('[TON] ✅ TonConnect ready');

  // ====== WALLET BALANCE ======
  async function fetchWalletBalance() {
    if (!tc?.account) {
      if (walletBalance) walletBalance.textContent = '—';
      return;
    }

    try {
      if (walletBalance) walletBalance.textContent = 'Loading...';
      
      const res = await fetch(`https://toncenter.com/api/v2/getAddressBalance?address=${tc.account.address}`);
      const data = await res.json();

      if (data.ok && data.result) {
        const balance = fromNano(data.result);
        if (walletBalance) walletBalance.textContent = `${balance} TON`;
        console.log('[TON] ✅ Wallet:', balance);
      } else {
        if (walletBalance) walletBalance.textContent = 'Error';
      }
    } catch (err) {
      console.error('[TON] ❌ Balance error:', err);
      if (walletBalance) walletBalance.textContent = 'Error';
    }
  }

  // ====== STATUS ======
  tc.onStatusChange(async (wallet) => {
    console.log('[TON]', wallet ? '✅ Connected' : '❌ Disconnected');
    if (wallet) await fetchWalletBalance();
    else if (walletBalance) walletBalance.textContent = '—';
    updateUI();
  });

  // ====== UI ======
  function updateUI() {
    const connected = !!tc?.account;
    const valid = validateAmount();

    console.log('[TON] UI:', { connected, valid });

    if (btnConnect) btnConnect.style.display = connected ? 'none' : 'block';
    if (btnDeposit) {
      btnDeposit.style.display = connected ? 'block' : 'none';
      btnDeposit.disabled = !valid || !connected;
    }
  }

  // ====== UPDATE BALANCE ======
  function setBalance(balance) {
    platformBalance = parseFloat(balance) || 0;
    console.log('[TON] 💰 Balance set:', platformBalance.toFixed(2));
  }

  function setConnectBtnState(state, disabled) {
  if (!btnConnect) return;
  const textEl = btnConnect.querySelector('.wt-connect-wallet__text');
  if (textEl) textEl.textContent = state;
  else btnConnect.textContent = state;
  btnConnect.disabled = !!disabled;
}

  // ====== CONNECT ======
  btnConnect?.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('[TON] 🔌 Connect');
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    
    try {
      setConnectBtnState('Connecting…', true);
      await tc.openModal();
    } catch (err) {
      console.error('[TON] ❌ Connect error:', err);
      if (tg?.showAlert) tg.showAlert('Failed to connect wallet');
    } finally {
      setConnectBtnState('Connect Wallet', false);
    }
  });

  // ====== DEPOSIT ======
  btnDeposit?.addEventListener('click', async (e) => {
    e.preventDefault();
    
    const amount = normalize(amountInput?.value);
    
    if (amount < MIN_DEPOSIT) {
      showValidationError();
      return;
    }

    console.log('[TON] 💎 Deposit:', amount);
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [{ address: PROJECT_TON_ADDRESS, amount: toNanoStr(amount) }]
    };

    const oldText = btnDeposit.textContent;
    btnDeposit.disabled = true;
    btnDeposit.textContent = 'Opening wallet...';

    try {
      console.log('[TON] 🚀 Send TX');
      const result = await tc.sendTransaction(tx);
      console.log('[TON] ✅ TX sent!', result);

      btnDeposit.textContent = 'Processing...';

      // Notify server
      try {
        console.log('[TON] 📤 Notifying server...');
        const notifyRes = await fetch('/api/deposit-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount, 
            currency: 'ton', 
            userId: tgUserId, 
            initData,
            txHash: result?.boc, 
            timestamp: Date.now()
          })
        });
        
        if (notifyRes.ok) {
          console.log('[TON] ✅ Server notified');
        } else {
          console.error('[TON] ⚠️ Server notification failed:', notifyRes.status);
        }
      } catch (err) {
        console.error('[TON] ❌ Notification error:', err);
      }

      if (tg?.showPopup) {
        tg.showPopup({
          title: '✅ Success',
          message: `Deposited ${amount} TON\n\nYour balance will update automatically.`,
          buttons: [{ type: 'ok' }]
        });
      }

      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

      setTimeout(() => {
        closePopup();
        if (amountInput) amountInput.value = '';
        btnDeposit.textContent = oldText;
        btnDeposit.disabled = false;
      }, 1500);

    } catch (err) {
      console.error('[TON] ❌ TX error:', err);
      
      const msg = err.message?.includes('cancel') ? 'Cancelled' : 'Transaction failed';
      if (tg?.showAlert) tg.showAlert(msg);
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');

      btnDeposit.textContent = oldText;
      btnDeposit.disabled = false;
    }
  });

  // ====== EVENTS ======
  window.addEventListener('balance:update', (e) => {
    if (e.detail?.ton !== undefined && e.detail._source !== 'tondep') {
      console.log('[TON] 📢 External balance update:', e.detail.ton);
      setBalance(e.detail.ton);
    }
  });

  window.addEventListener('balance:loaded', (e) => {
    if (e.detail?.ton !== undefined) {
      console.log('[TON] 🔥 Balance loaded:', e.detail.ton);
      setBalance(e.detail.ton);
    }
  });

  // ====== INIT ======
  updateUI();
  
  console.log('[TON] ✅ Ready');

  // ====== EXPORT ======
  window.WTTonDeposit = {
    open: openPopup,
    close: closePopup,
    setBalance: setBalance,
    isConnected: () => !!tc?.account,
    getBalance: () => platformBalance
  };
})();