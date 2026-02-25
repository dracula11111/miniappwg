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

  async function applyPromocode() {
    if (!promoInput || !promoApplyBtn) return;
    const code = String(promoInput.value || '').trim();
    if (!code) {
      showPromoToast('Enter a promo code');
      updatePromoBtnState();
      return;
    }

    haptic('medium');

    const oldText = promoApplyBtn.textContent;
    promoApplyBtn.disabled = true;
    promoApplyBtn.textContent = 'Applying...';

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
      const newBal = (typeof j.newBalance === 'number') ? j.newBalance : Number(j.newBalance || 0);

      if (Number.isFinite(newBal)) {
        setBalance('stars', newBal);
      } else if (Number.isFinite(added) && added > 0) {
        addBalance('stars', added);
      }

      promoInput.value = '';
      updatePromoBtnState();

      showPromoToast('✅ Promocode applied', added ? `+${added} ⭐` : '');
      haptic('success');

    } catch (e) {
      console.warn('[Promo] redeem error', e);
      showPromoToast('Network error');
      haptic('light');
    } finally {
      promoApplyBtn.textContent = oldText || 'Apply';
      updatePromoBtnState();
    }
  }

  function setupPromocode() {
    if (promoSetupDone) return;
    promoSetupDone = true;
    if (!promoInput || !promoApplyBtn) return;

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
    if (tg?.showPopup) { 
      try { tg.showPopup({ message: msg }); return; } catch {} 
    }
    if (tg?.showAlert) { 
      try { tg.showAlert(msg); return; } catch {} 
    }
    try { alert(msg); } catch {}
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
    const t = itemType(item);
    const icon = String(item.icon || '');
    if (t === 'nft' && NFT_DISPLAY_NAME_BY_ICON[icon]) return NFT_DISPLAY_NAME_BY_ICON[icon];
    return String(item.name || item.title || item.baseId || item.id || 'Item');
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
        walletCardStatus.onclick = () => {
          navigator.clipboard?.writeText(addr).catch(() => {});
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
      walletDisconnectCopy.addEventListener('click', () => {
        const addr = walletDisconnectCopy.dataset.addr || getWalletAddress();
        if (!addr) return;
        navigator.clipboard?.writeText(addr).catch(() => {});
        haptic('light');
      });
    }

    if (walletCardCopy) {
      walletCardCopy.addEventListener('click', () => {
        const addr = getWalletAddress();
        if (!addr) return;
        navigator.clipboard?.writeText(addr).catch(() => {});
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

  function onInventoryClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
  
    const action = target.getAttribute('data-action');
    const key = target.getAttribute('data-key');
    if (!key) return;    if (action === 'withdraw') {
      const found = findInventoryItemByKey(key);
      if (found?.item) openWithdrawPanel(found.item);
      haptic('light');
      return;
    }
  
    if (action === 'sell') {
      sellOne(key);
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
        if (found?.item) openWithdrawPanel(found.item);
        haptic('light');
        return;
      }
  
      if (action === 'sell') {
        await sellOne(key);
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



// ====== WITHDRAW PANEL ======
let withdrawOverlay = null;

function ensureWithdrawOverlay() {
  if (withdrawOverlay) return withdrawOverlay;

  const el = document.createElement('div');
  el.id = 'wgWithdrawOverlay';
  el.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:none',
    'z-index:9999',
    'background:rgba(0,0,0,.55)',
    'backdrop-filter: blur(6px)'
  ].join(';');

  el.innerHTML = `
    <div class="wg-withdraw" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,420px);background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.35);">
      <div style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(0,0,0,.08)">
        <div style="font-weight:700">Withdraw</div>
        <button type="button" data-wg-close="1" style="border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer">✕</button>
      </div>

      <div style="padding:14px 16px">
        <div data-wg-fee style="font-size:13px;opacity:.75;margin-bottom:10px">За вывод подарка берется …</div>

        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
          <div style="width:92px;height:92px;border-radius:16px;background:rgba(0,0,0,.06);overflow:hidden;flex:0 0 auto;display:flex;align-items:center;justify-content:center">
            <img data-wg-img src="" alt="" style="width:100%;height:100%;object-fit:cover" />
          </div>
          <div style="min-width:0">
            <div data-wg-title style="font-weight:800;font-size:16px;line-height:1.15;word-break:break-word">Gift</div>
            <div data-wg-num style="margin-top:6px;font-size:13px;opacity:.7">#—</div>
          </div>
        </div>

        <label style="display:block;font-size:12px;opacity:.7;margin-bottom:6px">Receiver (game id or @username)</label>
        <input data-wg-to type="text" placeholder="@username or 123456" style="width:100%;padding:12px 12px;border-radius:12px;border:1px solid rgba(0,0,0,.12);outline:none" />

        <div style="height:12px"></div>

        <button data-wg-continue type="button" style="width:100%;padding:12px 14px;border-radius:14px;border:0;background:#000;color:#fff;font-weight:800;cursor:pointer">Continue</button>
      </div>
    </div>
  `;

  el.addEventListener('click', (e) => {
    const close = e.target?.closest?.('[data-wg-close="1"]');
    if (close || e.target === el) closeWithdrawOverlay();
  });

  document.body.appendChild(el);
  withdrawOverlay = el;
  return withdrawOverlay;
}

function closeWithdrawOverlay() {
  if (!withdrawOverlay) return;
  withdrawOverlay.style.display = 'none';
}

function openSupportChat(username = '@wildgift_support') {
  const u = String(username || '').trim();
  const handle = u.startsWith('@') ? u.slice(1) : u;
  try {
    if (tg?.openTelegramLink) tg.openTelegramLink(`https://t.me/${handle}`);
    else window.open(`https://t.me/${handle}`, '_blank');
  } catch {
    try { window.open(`https://t.me/${handle}`, '_blank'); } catch {}
  }
}

function showWithdrawErrorPanel(message, support = '@wildgift_support') {
  const el = ensureWithdrawOverlay();
  const box = el.querySelector('.wg-withdraw');
  if (!box) return;

  box.innerHTML = `
    <div style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(0,0,0,.08)">
      <div style="font-weight:800">Withdraw</div>
      <button type="button" data-wg-close="1" style="border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer">✕</button>
    </div>
    <div style="padding:16px">
      <div style="font-weight:800;margin-bottom:8px">Не удалось вывести подарок</div>
      <div style="opacity:.8;margin-bottom:12px">${escapeHtml(message || '')}</div>
      <button type="button" data-wg-support="1" style="width:100%;padding:12px 14px;border-radius:14px;border:0;background:#000;color:#fff;font-weight:800;cursor:pointer">Контактируйте саппорт ${escapeHtml(support)}</button>
    </div>
  `;

  box.querySelector('[data-wg-support="1"]')?.addEventListener('click', () => openSupportChat(support));

  el.style.display = 'block';
}

async function openWithdrawPanel(item) {
  const el = ensureWithdrawOverlay();

  const currency = getCurrency();
  const feeText = currency === 'stars' ? 'За вывод подарка берется 25 ⭐' : 'За вывод подарка берется 0.2 TON';

  const title = itemDisplayName(item);
  const num = String(item?.number || item?.tg?.num || item?.tg?.number || '').trim();
  const img = itemIconPath(item);  const feeEl = el.querySelector('[data-wg-fee]');
  if (feeEl) feeEl.textContent = feeText;
  const titleEl = el.querySelector('[data-wg-title]');
  if (titleEl) titleEl.textContent = title;
  const numEl = el.querySelector('[data-wg-num]');
  if (numEl) numEl.textContent = num ? `#${num}` : '#—';

  const imgEl = el.querySelector('[data-wg-img]');
  if (imgEl) imgEl.setAttribute('src', img);

  const toInput = el.querySelector('[data-wg-to]');
  if (toInput) toInput.value = '';

  const btn = el.querySelector('[data-wg-continue]');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Continue';

    btn.onclick = async () => {
      const to = String(toInput?.value || '').trim();
      if (!to) {
        showToast('Enter receiver');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Processing...';

      try {
        const r = await tgFetch('/api/inventory/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currency, instanceId: String(item?.instanceId || ''), toUserId: to })
        });
        const j = await r.json().catch(() => null);

        if (!r.ok || !j?.ok) {
          const code = j?.code || '';
          if (code === 'RELAYER_STARS_LOW') {
            showWithdrawErrorPanel('На релеере недостаточно ⭐ для вывода.', j?.support || '@wildgift_support');
          } else if (code === 'NO_STOCK') {
            showWithdrawErrorPanel('Подарка нет в стоке (или релеер его не видит).', j?.support || '@wildgift_support');
          } else {
            showWithdrawErrorPanel(j?.error || 'Ошибка вывода.', j?.support || '@wildgift_support');
          }
          return;
        }

        closeWithdrawOverlay();
        await loadInventory();
        haptic('success');
        showToast('✅ Withdraw requested');
      } catch (e) {
        showWithdrawErrorPanel('Сетевая ошибка. Попробуйте позже.', '@wildgift_support');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Continue';
      }
    };
  }

  el.style.display = 'block';
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
        await sellOne(modalItemKey);
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
  
    const arr = Array.isArray(items) ? items : [];
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
    // если файла нет — либо добавь /icons/tgStar.svg, либо поменяй на /icons/stars.svg
    const icon = isStars ? '/icons/tgStarsBlack.svg' : '/icons/ton.svg';
    const sellBtnClass = isStars ? 'inv-btn--stars' : 'inv-btn--ton';
  
    grid.innerHTML = arr.map((it, idx) => {
      const key = itemKey(it, idx);
      const val = itemValue(it, currency);
  
      return `
        <div class="inv-card" data-key="${key}">
          <div class="inv-card__imgwrap">
            <img src="${itemIconPath(it)}" alt="" />
          </div>
  
          <div class="inv-card__name">${itemDisplayName(it)}</div>

  
          <button class="inv-btn inv-btn--sell ${sellBtnClass}" type="button"
                  data-action="sell" data-key="${key}">
            <span class="inv-btn__label">Sell</span>
            <span class="inv-btn__amount">${val}</span>
            <img class="inv-btn__icon" src="${icon}" alt="">
          </button>
  
          <button class="inv-btn inv-btn--withdraw" type="button"
                  data-action="withdraw" data-key="${key}">
            Withdraw
          </button>
        </div>
      `;
    }).join('');
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
});


  window.addEventListener('inventory:update', () => loadInventory());
})();