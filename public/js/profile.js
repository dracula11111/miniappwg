// /public/js/profile.js - Complete v5
(() => {
  console.log('[Profile] ✅ Loaded v5 - Redesigned');

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
  const walletDisconnectConfirm = document.getElementById('walletDisconnectConfirm');

  const inventoryPanel = document.getElementById('profileInventoryPanel');

  // ====== LOCAL INVENTORY FALLBACK ======
  const LS_PREFIX = 'WT_INV_'; // WT_INV_<userId> => JSON array

  function getTelegramUser() {
    return tg?.initDataUnsafe?.user || { id: 'guest', username: null, first_name: 'Guest' };
  }

  function readLocalInventory(userId) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + userId);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function writeLocalInventory(userId, items) {
    try {
      localStorage.setItem(LS_PREFIX + userId, JSON.stringify(items || []));
    } catch {}
  }

  // ====== HELPERS ======
  function haptic(type = 'light') {
    try { tg?.HapticFeedback?.impactOccurred?.(type); } catch {}
  }

  function getCurrency() {
    return window.WildTimeCurrency?.current || 'ton';
  }

  function currencyIcon(currency) {
    return currency === 'stars' ? '⭐' : '💎';
  }

  function itemType(item) {
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

  function itemIconPath(item) {
    const icon = item?.icon || item?.image || item?.img;
    if (!icon) return '/icons/unknown.png';

    const t = itemType(item);
    if (t === 'nft') return `/images/gifts/nfts/${icon}`;
    return `/images/gifts/${icon}`;
  }

  function itemValue(item, currency) {
    const v = item?.price?.[currency];
    const n = typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : 0);
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

    // Avatar
    if (profileAvatar && user.id && user.id !== 'guest') {
      profileAvatar.src = `/api/tg/photo/${user.id}?t=${Date.now()}`;
      profileAvatar.onerror = () => {
        profileAvatar.src = '/icons/user-placeholder.png';
      };
    }
  }

  // ====== WALLET UI ======
  function shortAddr(addr) {
    if (!addr || typeof addr !== 'string') return '';
    if (addr.length <= 10) return addr;
    return addr.slice(0, 4) + '…' + addr.slice(-4);
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
    try {
      if (typeof window.WildTimeTonConnect?.connect === 'function') {
        await window.WildTimeTonConnect.connect();
        return;
      }
    } catch {}

    try {
      if (typeof window.WildTimeTonConnect?.openModal === 'function') {
        await window.WildTimeTonConnect.openModal();
        return;
      }
    } catch {}

    try {
      if (typeof window.tonConnectUI?.openModal === 'function') {
        await window.tonConnectUI.openModal();
        return;
      }
    } catch {}
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

    // Hide details section (not used in new design)
    if (walletCardDetails) walletCardDetails.hidden = true;

    // Hide old toggle button
    if (walletCardToggle) walletCardToggle.hidden = true;

    if (connected) {
      // CONNECTED STATE
      // Status: show shortened address (clickable to copy)
      if (walletCardStatus) {
        walletCardStatus.textContent = shortAddr(addr);
        walletCardStatus.style.cursor = 'pointer';
        walletCardStatus.style.fontWeight = '700';
        walletCardStatus.style.letterSpacing = '0.3px';
        walletCardStatus.onclick = () => {
          navigator.clipboard?.writeText(addr).catch(() => {});
          haptic('light');
          // Optional: show toast "Copied!"
        };
      }

      // Hide connect button
      if (walletCardConnect) walletCardConnect.hidden = true;

      // Show red disconnect button on the right
      if (walletHeaderDisconnect) {
        walletHeaderDisconnect.hidden = false;
        walletHeaderDisconnect.textContent = 'Disconnect';
      }
    } else {
      // NOT CONNECTED STATE
      // Status: "Not connected"
      if (walletCardStatus) {
        walletCardStatus.textContent = 'Not connected';
        walletCardStatus.style.cursor = 'default';
        walletCardStatus.style.fontWeight = '600';
        walletCardStatus.style.letterSpacing = '0';
        walletCardStatus.onclick = null;
      }

      // Show big connect button
      if (walletCardConnect) walletCardConnect.hidden = false;

      // Hide disconnect button
      if (walletHeaderDisconnect) walletHeaderDisconnect.hidden = true;
    }

    // Address for copy button (if details section used)
    if (walletCardAddress) walletCardAddress.textContent = connected ? addr : '—';
  }

  // ====== WALLET EVENT LISTENERS (setup once) ======
  function setupWalletListeners() {
    // Connect button
    if (profileConnectWalletBtn) {
      profileConnectWalletBtn.addEventListener('click', async () => {
        haptic('medium');
        await openWalletConnect();
      });
    }

    // Header disconnect button
    if (walletHeaderDisconnect) {
      walletHeaderDisconnect.addEventListener('click', () => {
        const addr = getWalletAddress();
        if (!addr) return;
        haptic('medium');
        openDisconnectModal(addr);
      });
    }

    // Disconnect modal backdrop & close button
    if (walletDisconnectModal) {
      walletDisconnectModal.addEventListener('click', (e) => {
        if (e.target.dataset.close) {
          closeDisconnectModal();
          haptic('light');
        }
      });
    }

    // Disconnect confirm button
    if (walletDisconnectConfirm) {
      walletDisconnectConfirm.addEventListener('click', async () => {
        haptic('medium');
        await doDisconnect();
        closeDisconnectModal();
        setTimeout(updateWalletUI, 150);
      });
    }

    // Copy button (if details section used)
    if (walletCardCopy) {
      walletCardCopy.addEventListener('click', () => {
        const addr = getWalletAddress();
        if (!addr) return;
        navigator.clipboard?.writeText(addr).catch(() => {});
        haptic('light');
      });
    }

    // Old disconnect button inside details
    if (walletCardDisconnect) {
      walletCardDisconnect.addEventListener('click', () => {
        const addr = getWalletAddress();
        openDisconnectModal(addr);
        haptic('medium');
      });
    }
  }

  // ====== NFT SHELF (top) ======
  function ensureNftShelf() {
    if (!profileCard || !currencySwitch) return null;

    let shelf = document.getElementById('profileNftShelf');
    if (shelf) return shelf;

    shelf = document.createElement('div');
    shelf.id = 'profileNftShelf';
    shelf.className = 'profile-nft-shelf';
    shelf.hidden = true;

    currencySwitch.insertAdjacentElement('beforebegin', shelf);
    return shelf;
  }

  function renderNftShelf(items, onOpen) {
    const shelf = ensureNftShelf();
    if (!shelf) return;

    const nfts = (items || []).filter(it => itemType(it) === 'nft');

    if (!nfts.length) {
      shelf.hidden = true;
      shelf.innerHTML = '';
      return;
    }

    shelf.hidden = false;

    const icons = nfts.slice(0, 18).map((it, idx) => {
      const key = itemKey(it, idx);
      return `
        <button class="profile-nft-item is-nft" type="button" data-key="${key}" aria-label="NFT">
          <img src="${itemIconPath(it)}" alt="">
        </button>
      `;
    }).join('');

    shelf.innerHTML = `
      <div class="profile-nft-shelf__header">
        <div class="profile-nft-shelf__title">NFT</div>
        <div class="profile-nft-shelf__count">${nfts.length}</div>
      </div>
      <div class="profile-nft-shelf__row">${icons}</div>
    `;

    shelf.querySelectorAll('.profile-nft-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        const it = nfts.find((x, i) => itemKey(x, i) === key);
        if (it && onOpen) onOpen(it);
      });
    });
  }

  // ====== INVENTORY PANEL: keep default empty state ======
  const selection = new Set();
  let lastInventory = [];

  function ensureInvDynamic() {
    if (!inventoryPanel) return null;

    let dyn = document.getElementById('profileInvDynamic');
    if (dyn) return dyn;

    dyn = document.createElement('div');
    dyn.id = 'profileInvDynamic';
    dyn.hidden = true;

    dyn.innerHTML = `
      <div id="profileInvGrid" class="profile-invgrid"></div>

      <div id="profileInvActions" class="profile-invactions">
        <button id="invSellSelected" class="inv-action-btn inv-action-btn--primary" type="button">
          Sell selected <span id="invSellSelectedAmount" class="inv-action-btn__amount"></span>
        </button>
        <button id="invSellAll" class="inv-action-btn inv-action-btn--secondary" type="button">
          Sell all <span id="invSellAllAmount" class="inv-action-btn__amount"></span>
        </button>
      </div>
    `;

    inventoryPanel.appendChild(dyn);
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

  function showModal(item, allItems) {
    const modal = ensureModal();
    if (!modal) return;

    const currency = getCurrency();
    const val = itemValue(item, currency);

    modalItemKey = itemKey(item, allItems.findIndex(x => x === item));

    modal.querySelector('#profileModalImg').src = itemIconPath(item);
    modal.querySelector('#profileModalTitle').textContent = String(item.baseId || item.id || 'NFT');
    modal.querySelector('#profileModalSub').textContent = `${val} ${currencyIcon(currency)}`;

    const sellBtn = modal.querySelector('#profileModalSell');
    const sellAmt = modal.querySelector('#profileModalSellAmount');
    if (sellAmt) sellAmt.textContent = `${val} ${currencyIcon(currency)}`;

    if (sellBtn) {
      sellBtn.onclick = async () => {
        if (!modalItemKey) return;
        selection.clear();
        selection.add(modalItemKey);
        await sellSelected();
        hideModal();
      };
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

  function renderInventory(items) {
    if (!inventoryPanel) return;

    const emptyIcon = getEmptyIconEl();
    const emptyText = getEmptyTextEl();
    const dyn = ensureInvDynamic();

    const nfts = (items || []).filter(it => itemType(it) === 'nft');

    lastInventory = nfts;

    // EMPTY STATE: keep original look (loupe + "No gifts yet.")
    if (!nfts.length) {
      if (emptyIcon) emptyIcon.hidden = false;
      if (emptyText) {
        emptyText.hidden = false;
        emptyText.textContent = 'No gifts yet.';
      }
      if (dyn) dyn.hidden = true;

      selection.clear();
      updateActionAmounts([]);

      renderNftShelf([], null);
      return;
    }

    // NON-EMPTY: hide loupe/text, show grid/actions
    if (emptyIcon) emptyIcon.hidden = true;
    if (emptyText) emptyText.hidden = true;
    if (dyn) dyn.hidden = false;

    // NFT shelf on top of profile
    renderNftShelf(nfts, (it) => showModal(it, nfts));

    const grid = document.getElementById('profileInvGrid');
    if (!grid) return;

    grid.innerHTML = nfts.map((it, idx) => {
      const key = itemKey(it, idx);
      const selected = selection.has(key);
      return `
        <button class="profile-invitem${selected ? ' selected' : ''}" type="button" data-key="${key}">
          <img src="${itemIconPath(it)}" alt="" />
          <span class="profile-invcheck">✓</span>
        </button>
      `;
    }).join('');

    // click handlers (select)
    grid.querySelectorAll('.profile-invitem').forEach(btn => {
      const key = btn.getAttribute('data-key');

      // tap -> toggle select
      btn.addEventListener('click', () => {
        if (!key) return;
        if (selection.has(key)) selection.delete(key);
        else selection.add(key);
        haptic('light');
        renderInventory(lastInventory);
      });

      // long-press -> open modal
      let pressTimer = null;
      const startPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          const it = lastInventory.find((x, i) => itemKey(x, i) === key);
          if (it) showModal(it, lastInventory);
        }, 420);
      };
      const cancelPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
      };

      btn.addEventListener('touchstart', startPress, { passive: true });
      btn.addEventListener('touchend', cancelPress);
      btn.addEventListener('touchcancel', cancelPress);
      btn.addEventListener('mousedown', startPress);
      btn.addEventListener('mouseup', cancelPress);
      btn.addEventListener('mouseleave', cancelPress);
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const it = lastInventory.find((x, i) => itemKey(x, i) === key);
        if (it) showModal(it, lastInventory);
      });
    });

    // action handlers
    const selBtn = document.getElementById('invSellSelected');
    const allBtn = document.getElementById('invSellAll');

    if (selBtn) selBtn.onclick = () => sellSelected();
    if (allBtn) allBtn.onclick = () => sellAll();

    updateActionAmounts(nfts);
  }

  // ====== SELL FLOW ======
  async function sellSelected() {
    const currency = getCurrency();
    const user = getTelegramUser();
    const userId = user.id;

    const dynActions = document.getElementById('profileInvActions');
    if (dynActions) dynActions.classList.add('loading');

    try {
      if (!selection.size) return;

      const items = lastInventory.slice();
      const keys = Array.from(selection);
      const mapByKey = new Map(items.map((it, idx) => [itemKey(it, idx), it]));
      const toSell = keys.map(k => mapByKey.get(k)).filter(Boolean);

      const total = toSell.reduce((s, it) => s + itemValue(it, currency), 0);

      // Try server endpoint (optional)
      let serverOk = false;
      try {
        const r = await fetch('/api/inventory/sell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, currency, itemKeys: keys, items: toSell, initData: tg?.initData || '' })
        });
        if (r.ok) {
          const j = await r.json().catch(() => null);
          if (j && j.ok === true) {
            serverOk = true;
            if (Array.isArray(j.items)) {
              writeLocalInventory(userId, j.items);
            }
            if (typeof j.balance === 'number') {
              setBalance(currency, j.balance);
            }
          }
        }
      } catch {}

      // Local fallback
      if (!serverOk) {
        const local = readLocalInventory(userId);
        const next = local.filter((it, idx) => !selection.has(itemKey(it, idx)));
        writeLocalInventory(userId, next);
        addBalance(currency, total);
        await postDeposit(total, currency, userId, 'inventory_sell');
      }

      selection.clear();
      await loadInventory();
      haptic('medium');
    } finally {
      if (dynActions) dynActions.classList.remove('loading');
    }
  }

  async function sellAll() {
    const currency = getCurrency();
    const user = getTelegramUser();
    const userId = user.id;

    const dynActions = document.getElementById('profileInvActions');
    if (dynActions) dynActions.classList.add('loading');

    try {
      const items = lastInventory.slice();
      if (!items.length) return;

      const keys = items.map((it, idx) => itemKey(it, idx));
      selection.clear();
      keys.forEach(k => selection.add(k));

      const total = items.reduce((s, it) => s + itemValue(it, currency), 0);

      // Try server endpoint
      let serverOk = false;
      try {
        const r = await fetch('/api/inventory/sell-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, currency, initData: tg?.initData || '' })
        });
        if (r.ok) {
          const j = await r.json().catch(() => null);
          if (j && j.ok === true) {
            serverOk = true;
            if (Array.isArray(j.items)) {
              writeLocalInventory(userId, j.items);
            } else {
              writeLocalInventory(userId, []);
            }
            if (typeof j.balance === 'number') {
              setBalance(currency, j.balance);
            }
          }
        }
      } catch {}

      if (!serverOk) {
        writeLocalInventory(userId, []);
        addBalance(currency, total);
        await postDeposit(total, currency, userId, 'inventory_sell_all');
      }

      selection.clear();
      await loadInventory();
      haptic('medium');
    } finally {
      if (dynActions) dynActions.classList.remove('loading');
    }
  }

  // ====== LOAD INVENTORY ======
  async function loadInventory() {
    const user = getTelegramUser();
    const userId = user.id;

    // Prefer server inventory if exists
    try {
      const r = await fetch(`/api/user/inventory?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j && j.ok === true && Array.isArray(j.items)) {
          writeLocalInventory(userId, j.items);
          renderInventory(j.items);
          return;
        }
      }
    } catch {}

    const local = readLocalInventory(userId);
    renderInventory(local);
  }

  // ====== REFRESH HOOKS ======
  let walletsSetup = false;

  function refreshAll() {
    updateUserUI();
    updateWalletUI();
    loadInventory();

    // Setup wallet event listeners only once
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

  window.addEventListener('currency:changed', () => {
    renderInventory(readLocalInventory(getTelegramUser().id));
  });

  window.addEventListener('inventory:update', () => loadInventory());
})();