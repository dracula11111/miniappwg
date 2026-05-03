(() => {
  'use strict';

  const MANIFEST_URL = `${location.origin}/tonconnect-manifest.json`;
  const PROJECT_TON_ADDRESS = 'UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J';
  const MIN_DEPOSIT = 0.1;
  const TEST_LS_KEY = 'WT_TON_TEST_WALLET_V1';
  const TEST_WALLET_ADDRESS = 'UQAW000000000000000000000000000000000000000000xjWy';
  const TONCONNECT_UI_FALLBACK_SOURCES = [
    'https://cdn.jsdelivr.net/npm/@tonconnect/ui@latest/dist/tonconnect-ui.min.js',
    'https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js'
  ];

  const tg = window.Telegram?.WebApp || null;
  const tgUserId = tg?.initDataUnsafe?.user?.id || 'guest';

  let tc = null;
  let platformBalance = 0;

  const popup = document.getElementById('tonDepositPopup');
  if (!popup) {
    return;
  }

  const backdrop = popup.querySelector('.deposit-popup__backdrop');
  const btnClose = document.getElementById('tonPopupClose');
  const walletBalance = document.getElementById('tonWalletBalance');
  const amountInput = document.getElementById('tonAmountInput');
  const inputWrapper = document.getElementById('tonInputWrapper');
  const errorNotification = document.getElementById('tonErrorNotification');
  const btnConnect = document.getElementById('btnConnectTonWallet');
  const btnDeposit = document.getElementById('btnDepositTon');

  function isLocalDevHost() {
    const h = String(location.hostname || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
  }

  function loadTestState() {
    try {
      const raw = localStorage.getItem(TEST_LS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return { enabled: false };
      return {
        enabled: !!parsed.enabled,
        address: typeof parsed.address === 'string' ? parsed.address : null,
        balanceTon: (typeof parsed.balanceTon === 'number' && Number.isFinite(parsed.balanceTon)) ? parsed.balanceTon : 0.06
      };
    } catch {
      return { enabled: false };
    }
  }

  function saveTestState(state) {
    try {
      localStorage.setItem(TEST_LS_KEY, JSON.stringify(state || { enabled: false }));
    } catch {}
  }

  function isTestConnected() {
    const s = loadTestState();
    return !!(s.enabled && s.address);
  }

  function getTestAddress() {
    const s = loadTestState();
    return (s.enabled && s.address) ? s.address : null;
  }

  function getTestBalanceTon() {
    const s = loadTestState();
    return (typeof s.balanceTon === 'number' && Number.isFinite(s.balanceTon)) ? s.balanceTon : 0.06;
  }

  function setTestConnected(enabled, address, balanceTon) {
    if (!isLocalDevHost()) return false;

    if (!enabled) {
      saveTestState({ enabled: false });
      emitWalletChanged();
      updateUI();
      fetchWalletBalance().catch(() => {});
      return true;
    }

    const prev = loadTestState();
    const addr = (typeof address === 'string' && address.trim())
      ? address.trim()
      : (typeof prev.address === 'string' && prev.address ? prev.address : TEST_WALLET_ADDRESS);

    const bal = (typeof balanceTon === 'number' && Number.isFinite(balanceTon)) ? balanceTon : 0.06;
    saveTestState({ enabled: true, address: addr, balanceTon: bal });
    emitWalletChanged();
    updateUI();
    fetchWalletBalance().catch(() => {});
    return true;
  }

  function crc16Xmodem(bytes) {
    let crc = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= (bytes[i] << 8);
      for (let j = 0; j < 8; j += 1) {
        if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
        else crc = (crc << 1) & 0xffff;
      }
    }
    return crc & 0xffff;
  }

  function base64UrlEncode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function toUserFriendlyAddress(addr) {
    if (!addr || typeof addr !== 'string') return null;
    if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{10,}$/.test(addr)) return addr;

    const m = addr.match(/^(-?\d+):([0-9a-fA-F]{64})$/);
    if (!m) return addr;

    const wc = parseInt(m[1], 10);
    const hex = m[2];
    const hash = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      hash[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    const tag = 0x51;
    const addr34 = new Uint8Array(34);
    addr34[0] = tag;
    addr34[1] = wc & 0xff;
    addr34.set(hash, 2);

    const crc = crc16Xmodem(addr34);
    const full = new Uint8Array(36);
    full.set(addr34, 0);
    full[34] = (crc >> 8) & 0xff;
    full[35] = crc & 0xff;
    return base64UrlEncode(full);
  }

  function getFriendlyConnectedAddress() {
    return toUserFriendlyAddress(tc?.account?.address || null);
  }

  function getConnectedAddress() {
    return isTestConnected() ? getTestAddress() : getFriendlyConnectedAddress();
  }

  function shortAddress(addr) {
    const text = String(addr || '').trim();
    if (!text) return 'Not connected';
    if (text.length <= 12) return text;
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
  }

  function syncWalletAddressDisplay() {
    const address = getConnectedAddress();
    if (!walletBalance) return;
    walletBalance.textContent = shortAddress(address);
    if (address) walletBalance.title = address;
    else walletBalance.removeAttribute('title');
  }

  function syncAmountInputWidth() {
    if (!amountInput) return;
    const value = amountInput.value || amountInput.placeholder || '0';
    const len = Math.max(1, Math.min(8, String(value).length));
    amountInput.style.setProperty('--deposit-amount-width', `${len + 0.25}ch`);
  }

  function getInitData() {
    return window.Telegram?.WebApp?.initData || '';
  }

  function emitWalletChanged() {
    const address = getConnectedAddress();
    const realConnected = !!getFriendlyConnectedAddress();
    window.dispatchEvent(new CustomEvent('wt-wallet-changed', {
      detail: {
        connected: !!address,
        address,
        test: isTestConnected(),
        realConnected
      }
    }));
  }

  function normalizeAmount(input) {
    if (!input) return NaN;
    let s = String(input).trim().replace(',', '.').replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function toNanoStr(amount) {
    const s = String(amount).replace(',', '.');
    const parts = s.split('.');
    const intPart = parts[0] || '0';
    const fracPart = (parts[1] || '').slice(0, 9).padEnd(9, '0');
    return (BigInt(intPart || '0') * 1000000000n + BigInt(fracPart)).toString();
  }

  function nanoToTonText(nanoStr) {
    try {
      const nano = BigInt(String(nanoStr || '0'));
      return (Number(nano) / 1000000000).toFixed(2);
    } catch {
      return null;
    }
  }

  function clearValidation() {
    if (inputWrapper) inputWrapper.classList.remove('error', 'success');
    if (errorNotification) errorNotification.hidden = true;
  }

  function showValidationError() {
    if (inputWrapper) {
      inputWrapper.classList.remove('success');
      inputWrapper.classList.add('error');
      setTimeout(() => inputWrapper.classList.remove('error'), 400);
    }

    if (errorNotification) {
      errorNotification.hidden = false;
      setTimeout(() => {
        if (errorNotification) errorNotification.hidden = true;
      }, 3000);
    }

    try { tg?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
  }

  function validateAmount() {
    const amount = normalizeAmount(amountInput?.value);
    clearValidation();

    if (amount >= MIN_DEPOSIT) {
      if (inputWrapper) inputWrapper.classList.add('success');
      return true;
    }
    return false;
  }

  function setConnectBtnState(label, disabled) {
    if (!btnConnect) return;
    const textEl = btnConnect.querySelector('.wt-connect-wallet__text');
    if (textEl) textEl.textContent = label;
    else btnConnect.textContent = label;
    btnConnect.disabled = !!disabled;
  }

  function notifyConnectError(message = 'Failed to connect wallet') {
    try { tg?.showAlert?.(message); return; } catch {}
    try { window.showToast?.(message); return; } catch {}
    try { alert(message); } catch {}
  }

  function loadTonConnectFromScript(src) {
    return new Promise((resolve, reject) => {
      if (!src) return reject(new Error('Empty TonConnect script src'));

      const existing = document.querySelector(`script[data-wt-tonconnect-src="${src}"]`);
      if (existing) {
        if (window.TON_CONNECT_UI) return resolve(true);
        existing.addEventListener('load', () => resolve(true), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.wtTonconnectSrc = src;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureTonConnectLibrary() {
    if (window.TON_CONNECT_UI) return true;

    for (const src of TONCONNECT_UI_FALLBACK_SOURCES) {
      try {
        await loadTonConnectFromScript(src);
        if (window.TON_CONNECT_UI) return true;
      } catch {}
    }

    return !!window.TON_CONNECT_UI;
  }

  async function fetchWalletBalance() {
    syncWalletAddressDisplay();
  }

  function updateUI() {
    const connected = !!getConnectedAddress();
    const validAmount = validateAmount();

    popup.classList.toggle('deposit-popup--wallet-connected', connected);
    syncWalletAddressDisplay();
    if (btnConnect) btnConnect.style.display = connected ? 'none' : 'block';
    if (btnDeposit) {
      btnDeposit.style.display = connected ? 'block' : 'none';
      btnDeposit.disabled = !(connected && validAmount);
    }
  }

  function openPopup() {
    popup.classList.add('deposit-popup--open');
    updateUI();
    syncAmountInputWidth();
    fetchWalletBalance().catch(() => {});
    try { tg?.HapticFeedback?.impactOccurred?.('light'); } catch {}
  }

  function closePopup() {
    popup.classList.remove('deposit-popup--open');
    clearValidation();
  }

  async function confirmTonDepositOnChain({ amount, boc, walletAddress }) {
    const initData = getInitData();
    const maxAttempts = 8;
    let lastError = null;
    let pending = false;

    if (!initData) {
      throw new Error('Telegram initData is missing');
    }
    if (!boc || typeof boc !== 'string') {
      throw new Error('Wallet did not return transaction BOC');
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const res = await fetch('/api/ton/deposit/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          initData,
          boc,
          walletAddress,
          timestamp: Date.now()
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.ok) {
        return { confirmed: true, pending: false, data };
      }

      const isPending = !!data?.pending || res.status === 202 || res.status === 425;
      if (isPending) {
        pending = true;
        lastError = data?.error || 'pending';
        if (attempt < maxAttempts) {
          const delayMs = Math.min(1000 * attempt, 4000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return { confirmed: false, pending, data: null, error: lastError };
  }

  function setBalance(balance) {
    platformBalance = Number.parseFloat(balance) || 0;
  }

  function setupTonConnectBridge() {
    window.WildTimeTonConnect = {
      openModal: () => tc ? tc.openModal() : Promise.reject(new Error('TonConnect is unavailable')),
      connect: () => tc ? tc.openModal() : Promise.reject(new Error('TonConnect is unavailable')),
      disconnect: async () => {
        if (isTestConnected()) {
          setTestConnected(false);
          return;
        }
        if (tc) return tc.disconnect();
      },
      getAddress: () => getConnectedAddress(),
      get address() { return getConnectedAddress(); },
      getRawAddress: () => tc?.account?.address || null,
      isTestConnected: () => isTestConnected(),
      setTestConnected: (enabled, address, balanceTon) => setTestConnected(enabled, address, balanceTon),
      getTestBalanceTon: () => getTestBalanceTon(),
      isConnected: () => !!getConnectedAddress(),
      isRealConnected: () => !!getFriendlyConnectedAddress(),
      onStatusChange: (cb) => tc ? tc.onStatusChange(cb) : (() => {})
    };
  }

  window.WTTonDeposit = {
    open: openPopup,
    close: closePopup,
    setBalance,
    isConnected: () => !!getConnectedAddress(),
    getBalance: () => platformBalance
  };

  backdrop?.addEventListener('click', closePopup);
  btnClose?.addEventListener('click', closePopup);

  amountInput?.addEventListener('input', () => {
    const caret = amountInput.selectionStart;
    amountInput.value = String(amountInput.value || '')
      .replace(',', '.')
      .replace(/[^0-9.]/g, '')
      .replace(/^(\d*\.\d*).*$/, '$1');
    try { amountInput.setSelectionRange(caret, caret); } catch {}
    syncAmountInputWidth();
    updateUI();
  });

  amountInput?.addEventListener('blur', () => {
    const amount = normalizeAmount(amountInput?.value);
    if (amount > 0 && amount < MIN_DEPOSIT) showValidationError();
  });

  btnConnect?.addEventListener('click', async (e) => {
    e.preventDefault();
    try { tg?.HapticFeedback?.impactOccurred?.('medium'); } catch {}

    try {
      setConnectBtnState('Connecting...', true);
      if (isLocalDevHost() && setTestConnected(true)) {
        setConnectBtnState('Connect Wallet', false);
        return;
      }

      if (!tc) {
        await ensureTonConnectLibrary().catch(() => {});
        if (!tc && window.TON_CONNECT_UI) {
          await initTonConnectUI().catch(() => {});
        }
      }

      if (tc && typeof tc.openModal === 'function') {
        await tc.openModal();
      } else {
        throw new Error('TonConnect is unavailable');
      }
    } catch (err) {
      console.warn('[TonDep] Connect wallet failed:', err?.message || err);
      notifyConnectError('Failed to connect wallet');
    } finally {
      setConnectBtnState('Connect Wallet', false);
    }
  });

  btnDeposit?.addEventListener('click', async (e) => {
    e.preventDefault();

    const amount = normalizeAmount(amountInput?.value);
    if (!(amount >= MIN_DEPOSIT)) {
      showValidationError();
      return;
    }

    const walletAddress = tc?.account?.address || null;
    if (!walletAddress) {
      try { tg?.showAlert?.('Connect TON wallet first'); } catch {}
      return;
    }

    try { tg?.HapticFeedback?.impactOccurred?.('medium'); } catch {}

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [{ address: PROJECT_TON_ADDRESS, amount: toNanoStr(amount) }]
    };

    const oldText = btnDeposit?.textContent || 'Deposit';
    if (btnDeposit) {
      btnDeposit.disabled = true;
      btnDeposit.textContent = 'Opening wallet...';
    }

    try {
      const result = await tc.sendTransaction(tx);
      if (btnDeposit) btnDeposit.textContent = 'Processing...';

      const boc = result?.boc || result?.transaction?.boc || result?.txBoc || result?.payload || '';
      const confirm = await confirmTonDepositOnChain({ amount, boc, walletAddress });

      const confirmed = !!confirm?.confirmed;
      const popupTitle = confirmed ? 'Success' : 'Pending confirmation';
      const popupMsg = confirmed
        ? `Deposited ${amount} TON\n\nYour balance was credited.`
        : `Transaction sent (${amount} TON).\n\nNetwork confirmation can take a few seconds.`;

      try {
        tg?.showPopup?.({
          title: popupTitle,
          message: popupMsg,
          buttons: [{ type: 'ok' }]
        });
      } catch {}

      try {
        tg?.HapticFeedback?.notificationOccurred?.(confirmed ? 'success' : 'warning');
      } catch {}

      setTimeout(() => {
        closePopup();
        if (amountInput) amountInput.value = '';
        if (btnDeposit) {
          btnDeposit.textContent = oldText;
          btnDeposit.disabled = false;
        }
        updateUI();
      }, 1200);
    } catch (err) {
      const message = String(err?.message || 'Transaction failed');
      const uiMessage = /cancel/i.test(message) ? 'Cancelled' : 'Transaction failed';
      try { tg?.showAlert?.(uiMessage); } catch {}
      try { tg?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
      if (btnDeposit) {
        btnDeposit.textContent = oldText;
        btnDeposit.disabled = false;
      }
      updateUI();
    }
  });

  window.addEventListener('balance:update', (e) => {
    if (e?.detail?.ton !== undefined && e.detail?._source !== 'tondep') {
      setBalance(e.detail.ton);
    }
  });

  window.addEventListener('balance:loaded', (e) => {
    if (e?.detail?.ton !== undefined) {
      setBalance(e.detail.ton);
    }
  });

  if (isLocalDevHost()) {
    window.WTDevTonWallet = {
      connect: (address = TEST_WALLET_ADDRESS, balanceTon = 0.06) => setTestConnected(true, address, balanceTon),
      disconnect: () => setTestConnected(false),
      address: TEST_WALLET_ADDRESS
    };
  }

  async function initTonConnectUI() {
    if (tc) return tc;
    if (!window.TON_CONNECT_UI) return null;

    const storage = {
      getItem: (k) => localStorage.getItem(`${tgUserId}:tc:${k}`),
      setItem: (k, v) => localStorage.setItem(`${tgUserId}:tc:${k}`, v),
      removeItem: (k) => localStorage.removeItem(`${tgUserId}:tc:${k}`)
    };

    tc = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: MANIFEST_URL,
      buttonRootId: null,
      storage,
      restoreConnection: true,
      actionsConfiguration: { twaReturnUrl: 'https://t.me' }
    });

    window.tonConnectUI = tc;
    window.__wtTonConnect = tc;
    setupTonConnectBridge();

    tc.onStatusChange(async (wallet) => {
      emitWalletChanged();
      if (wallet || isTestConnected()) {
        await fetchWalletBalance().catch(() => {});
      } else if (walletBalance) {
        walletBalance.textContent = '-';
      }
      updateUI();
    });

    try {
      const restored = tc?.connectionRestored;
      if (restored && typeof restored.then === 'function') {
        restored.then(() => {
          emitWalletChanged();
          updateUI();
          fetchWalletBalance().catch(() => {});
        }).catch(() => {});
      }
    } catch {}

    return tc;
  }

  (async () => {
    if (isLocalDevHost()) {
      const params = new URLSearchParams(location.search || '');
      if (params.get('testWallet') === '1') {
        setTestConnected(true);
      }
    }

    if (!window.TON_CONNECT_UI) {
      await ensureTonConnectLibrary().catch(() => {});
    }

    if (!window.TON_CONNECT_UI) {
      setupTonConnectBridge();
      window.dispatchEvent(new Event('wt-tc-ready'));
      emitWalletChanged();
      updateUI();
      return;
    }

    await initTonConnectUI();

    window.dispatchEvent(new Event('wt-tc-ready'));
    setTimeout(() => {
      emitWalletChanged();
      updateUI();
      fetchWalletBalance().catch(() => {});
    }, 0);
  })().catch((err) => {
    console.warn('[TonDep] TonConnect init failed:', err?.message || err);
    setupTonConnectBridge();
    window.dispatchEvent(new Event('wt-tc-ready'));
    emitWalletChanged();
    updateUI();
  });
})();
