// /public/js/profile.js - FINAL (wallet connect button + avatar sync)
(() => {
  const tg = window.Telegram?.WebApp;

  // ====== DOM ELEMENTS ======

  // Topbar avatar (left)
  const userAvatarImg = document.getElementById('userAvatarImg');

  // Bottom nav profile avatar (if you use it)
  const navProfileAvatar = document.getElementById('navProfileAvatar');

  // Profile Page
  const profileAvatar = document.getElementById('profileAvatar');
  const profileName = document.getElementById('profileName');
  const profileHandle = document.getElementById('profileHandle');

  // Wallet Card
  const walletCard = document.getElementById('walletCard');
  const walletCardStatus = document.getElementById('walletCardStatus');
  const walletCardToggle = document.getElementById('walletCardToggle');
  const walletCardDetails = document.getElementById('walletCardDetails');
  const walletCardAddress = document.getElementById('walletCardAddress');
  const walletCardCopy = document.getElementById('walletCardCopy');
  const walletCardDisconnect = document.getElementById('walletCardDisconnect');

  // Connect block + button (profile)
  const walletCardConnect = document.getElementById('walletCardConnect');
  const profileConnectWalletBtn = document.getElementById('profileConnectWalletBtn');

  // ====== UTILITIES ======

  function getTelegramUser() {
    if (!tg?.initDataUnsafe?.user) {
      return {
        id: null,
        firstName: 'Guest',
        lastName: '',
        username: null,
        photoUrl: null
      };
    }

    const u = tg.initDataUnsafe.user;
    return {
      id: u.id,
      firstName: u.first_name || 'User',
      lastName: u.last_name || '',
      username: u.username || null,
      photoUrl: u.photo_url || null
    };
  }

  function getDisplayName(user) {
    const full = `${user.firstName} ${user.lastName}`.trim();
    return full || 'User';
  }

  function getDisplayHandle(user) {
    return user.username ? `@${user.username}` : `ID: ${user.id || 'Unknown'}`;
  }

  function getShortAddress(address) {
    if (!address) return 'Not connected';
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }

  function haptic(type = 'light') {
    if (tg?.HapticFeedback?.impactOccurred) tg.HapticFeedback.impactOccurred(type);
  }

  // ====== USER UI ======

  function updateUserUI() {
    const user = getTelegramUser();
    const avatarUrl = user.photoUrl || '/images/avatar-default.png';

    // Topbar avatar
    if (userAvatarImg) {
      userAvatarImg.src = avatarUrl;
      userAvatarImg.onerror = () => (userAvatarImg.src = '/images/avatar-default.png');
    }

    // Bottom nav avatar (if exists)
    if (navProfileAvatar) {
      navProfileAvatar.src = avatarUrl;
      navProfileAvatar.onerror = () => (navProfileAvatar.src = '/images/avatar-default.png');
    }

    // Profile avatar
    if (profileAvatar) {
      profileAvatar.src = avatarUrl;
      profileAvatar.onerror = () => (profileAvatar.src = '/images/avatar-default.png');
    }

    if (profileName) profileName.textContent = getDisplayName(user);
    if (profileHandle) profileHandle.textContent = getDisplayHandle(user);
  }

  // ====== WALLET UI ======

  function updateWalletUI() {
    const tc = window.__wtTonConnect;

    // NOT CONNECTED
    if (!tc?.account) {
      if (walletCardStatus) {
        walletCardStatus.textContent = 'Not connected';
        walletCardStatus.style.color = 'var(--muted)';
      }

      if (walletCardAddress) walletCardAddress.textContent = '—';

      if (walletCardDetails) {
        walletCardDetails.hidden = true;
        walletCardToggle?.classList.remove('open');
      }

      // show connect button block
      if (walletCardConnect) walletCardConnect.hidden = false;

      return;
    }

    // CONNECTED
    const address = tc.account.address;
    const shortAddr = getShortAddress(address);

    if (walletCardStatus) {
      walletCardStatus.textContent = shortAddr;
      walletCardStatus.style.color = 'var(--accent)';
    }

    if (walletCardAddress) {
      const friendly = window.WT?.utils?.ensureFriendly?.(address) || address;
      walletCardAddress.textContent = friendly;
    }

    // hide connect button block
    if (walletCardConnect) walletCardConnect.hidden = true;
  }

  // ====== WALLET CARD TOGGLE ======

  if (walletCardToggle) {
    walletCardToggle.addEventListener('click', (e) => {
      e.stopPropagation();

      if (!walletCardDetails) return;

      const tc = window.__wtTonConnect;

      // if not connected -> open deposit modal
      if (!tc?.account) {
        if (window.WTTonDeposit?.open) window.WTTonDeposit.open();
        return;
      }

      const willOpen = walletCardDetails.hidden;
      walletCardDetails.hidden = !willOpen;

      walletCardToggle.classList.toggle('open', willOpen);
      haptic('light');
    });
  }

  // Click header = toggle
  if (walletCard) {
    walletCard.querySelector('.wallet-card__header')?.addEventListener('click', () => {
      walletCardToggle?.click();
    });
  }

  // ====== CONNECT BUTTON (PROFILE) ======

  profileConnectWalletBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    haptic('medium');
    if (window.WTTonDeposit?.open) window.WTTonDeposit.open();
  });

  // ====== COPY ADDRESS ======

  if (walletCardCopy) {
    walletCardCopy.addEventListener('click', async (e) => {
      e.stopPropagation();

      const tc = window.__wtTonConnect;
      if (!tc?.account) return;

      const address = window.WT?.utils?.ensureFriendly?.(tc.account.address) || tc.account.address;

      try {
        await navigator.clipboard.writeText(address);

        if (tg?.showPopup) {
          tg.showPopup({
            title: '✅ Copied!',
            message: 'Wallet address copied to clipboard',
            buttons: [{ type: 'ok' }]
          });
        }

        if (tg?.HapticFeedback?.notificationOccurred) {
          tg.HapticFeedback.notificationOccurred('success');
        }
      } catch (err) {
        console.error('[Profile] Copy failed:', err);
        tg?.showAlert?.('Failed to copy address');
      }
    });
  }

  // ====== DISCONNECT WALLET ======

  if (walletCardDisconnect) {
    walletCardDisconnect.addEventListener('click', async (e) => {
      e.stopPropagation();

      const tc = window.__wtTonConnect;
      if (!tc) return;

      const doDisconnect = async () => {
        try {
          await tc.disconnect();
          if (tg?.HapticFeedback?.notificationOccurred) {
            tg.HapticFeedback.notificationOccurred('success');
          }
          // UI will update via status change + our refresh hooks
        } catch (err) {
          console.error('[Profile] Disconnect failed:', err);
          tg?.showAlert?.('Failed to disconnect wallet');
        }
      };

      if (tg?.showPopup) {
        tg.showPopup(
          {
            title: 'Disconnect Wallet?',
            message: 'Are you sure you want to disconnect your wallet?',
            buttons: [
              { id: 'cancel', type: 'cancel' },
              { id: 'disconnect', type: 'destructive', text: 'Disconnect' }
            ]
          },
          (btnId) => {
            if (btnId === 'disconnect') doDisconnect();
          }
        );
      } else {
        if (confirm('Disconnect wallet?')) doDisconnect();
      }
    });
  }

  // ====== REFRESH HOOKS ======

  function refreshAll() {
    updateUserUI();
    updateWalletUI();
  }

  // Initial paint
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshAll);
  } else {
    refreshAll();
  }

  // When TonConnect is initialized in tondep.js
  window.addEventListener('wt-tc-ready', () => {
    // Give TonConnect a moment to restoreConnection
    setTimeout(refreshAll, 50);
    setTimeout(refreshAll, 300);
  });

  // When balance/currency changes (not strictly needed, but harmless)
  window.addEventListener('currency:changed', refreshAll);
  window.addEventListener('balance:update', refreshAll);

})();
