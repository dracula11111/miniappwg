// public/js/balance-live.js - Real-time balance updates via SSE
(async () => {
  console.log('[Balance Live] 🔴 Starting live balance module');

  const tg = window.Telegram?.WebApp;
  if (window.TEST_MODE) {
    console.log('[Balance Live] 🧪 TEST_MODE active, skipping server sync');
    return;
  }

  async function getUserIdWithRetry() {
    for (let i = 0; i < 40; i++) { // ~2s total
      const id = tg?.initDataUnsafe?.user?.id;
      if (id && id !== 'guest') return id;
      await new Promise(r => setTimeout(r, 50));
    }
    return null;
  }

  const tgUserId = await getUserIdWithRetry();
  const tgInitData = String(tg?.initData || "");

  if (!tgUserId) {
    console.log('[Balance Live] No user ID, skipping SSE');
    return;
  }
  if (!tgInitData) {
    console.log('[Balance Live] No initData, skipping secure balance sync');
    return;
  }

  try {
    const isBanned = await window.WTBanGuard?.ensureChecked?.();
    if (isBanned || window.WTBanGuard?.isBanned?.()) {
      console.warn('[Balance Live] Account is banned, skipping live balance sync');
      return;
    }
  } catch (error) {
    console.warn('[Balance Live] Failed to read ban guard state:', error);
  }

  let eventSource = null;
  let reconnectTimeout = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  // 🔥 FIX: Track if initial balance was loaded
  let initialBalanceLoaded = false;

  // 🔥 FIX: Safe balance update with validation
  function updateBalanceSafely(ton, stars) {
    // Validate numbers
    const tonValue = parseFloat(ton);
    const starsValue = parseInt(stars, 10);

    if (isNaN(tonValue) || isNaN(starsValue)) {
      console.warn('[Balance Live] ⚠️ Invalid balance values:', { ton, stars });
      return;
    }

    console.log('[Balance Live] 💰 Updating balance:', {
      ton: tonValue,
      stars: starsValue,
      initialLoaded: initialBalanceLoaded
    });

    // Update currency system
    if (window.WildTimeCurrency) {
      window.WildTimeCurrency.updateBalance({ 
        ton: tonValue, 
        stars: starsValue 
      });
    }

    // Update deposit modules
    if (window.WTTonDeposit) {
      window.WTTonDeposit.setBalance(tonValue);
    }
    if (window.WTStarsDeposit) {
      window.WTStarsDeposit.setBalance(starsValue);
    }

    // Mark as loaded
    initialBalanceLoaded = true;
  }

  // ====== CONNECT TO SSE ======
  function connect() {
    if (eventSource) {
      console.log('[Balance Live] Already connected');
      return;
    }

    console.log('[Balance Live] 📡 Connecting to SSE...');

    try {
      const params = new URLSearchParams({
        userId: String(tgUserId),
        initData: tgInitData
      });
      eventSource = new EventSource(`/api/balance/stream?${params.toString()}`);

      eventSource.onopen = () => {
        console.log('[Balance Live] ✅ SSE Connected');
        reconnectAttempts = 0;
        
        if (tg?.HapticFeedback) {
          tg.HapticFeedback.impactOccurred('soft');
        }
      };

      eventSource.onmessage = (event) => {
        if (!event.data || event.data === ': heartbeat') {
          return;
        }

        try {
          const data = JSON.parse(event.data);
          console.log('[Balance Live] 📦 Message received:', data);

          if (data.type === 'balance') {
            // 🔥 FIX: Validate data before updating
            if (typeof data.ton === 'undefined' || typeof data.stars === 'undefined') {
              console.warn('[Balance Live] ⚠️ Incomplete balance data, skipping');
              return;
            }

            // Update balance safely
            updateBalanceSafely(data.ton, data.stars);

            // Haptic feedback only for updates after initial load
            if (initialBalanceLoaded && tg?.HapticFeedback) {
              tg.HapticFeedback.notificationOccurred('success');
            }

            // Dispatch events
            window.dispatchEvent(new CustomEvent('balance:update', { 
              detail: { 
                ton: parseFloat(data.ton), 
                stars: parseInt(data.stars, 10) 
              } 
            }));
            
            window.dispatchEvent(new CustomEvent('balance:live-update', { 
              detail: { 
                ton: parseFloat(data.ton), 
                stars: parseInt(data.stars, 10),
                timestamp: data.timestamp 
              } 
            }));
          } else if (data.type === 'tech_pause') {
            const payload = {
              enabled: data.enabled === true || Number(data.enabled) === 1,
              mode: String(data.mode || "off"),
              isDraining: data.isDraining === true || String(data.mode || "") === "draining",
              isActive: data.isActive === true || String(data.mode || "") === "active",
              blocking: data.blocking === true,
              updatedAt: Number(data.updatedAt || data.timestamp || Date.now())
            };
            window.dispatchEvent(new CustomEvent('techpause:update', { detail: payload }));
          }
        } catch (err) {
          console.error('[Balance Live] Error parsing message:', err);
        }
      };

      eventSource.onerror = (error) => {
        console.error('[Balance Live] ❌ SSE Error:', error);
        
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        // Try to reconnect
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`[Balance Live] 🔄 Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
          
          reconnectTimeout = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY * reconnectAttempts);
        } else {
          console.log('[Balance Live] ⚠️ Max reconnect attempts reached');
        }
      };

    } catch (err) {
      console.error('[Balance Live] Connection error:', err);
    }
  }

  // ====== DISCONNECT ======
  function disconnect() {
    console.log('[Balance Live] 🔌 Disconnecting...');
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    reconnectAttempts = 0;
  }

  // ====== VISIBILITY (Telegram WebView safe) ======
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[Balance Live] Page visible, ensuring connection...');
      if (!eventSource) connect();
    }
  });

  // ====== CLEANUP ON UNLOAD ======
  window.addEventListener('beforeunload', () => {
    disconnect();
  });

  // ====== FALLBACK POLL (in case SSE is blocked in Telegram) ======
  setInterval(async () => {
    try {
      // Only poll if SSE is not connected
      if (eventSource) return;
      
      const r = await fetch(`/api/balance?userId=${tgUserId}`, { 
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'x-telegram-init-data': tgInitData
        }
      });
      
      if (!r.ok) {
        console.warn('[Balance Live] Polling failed:', r.status);
        return;
      }
      
      const j = await r.json();
      
      if (j && j.ok && typeof j.ton !== 'undefined' && typeof j.stars !== 'undefined') {
        updateBalanceSafely(j.ton, j.stars);
        if (j.techPause && typeof j.techPause === "object") {
          window.dispatchEvent(new CustomEvent('techpause:update', { detail: j.techPause }));
        }
      }
    } catch (e) {
      console.error('[Balance Live] Polling error:', e);
    }
  }, 20000);

  // ====== INITIAL BALANCE LOAD (before SSE) ======
  async function loadInitialBalance() {
    try {
      console.log('[Balance Live] 📊 Loading initial balance...');
      
      const response = await fetch(`/api/balance?userId=${tgUserId}`, {
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
          'x-telegram-init-data': tgInitData
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data && data.ok && typeof data.ton !== 'undefined' && typeof data.stars !== 'undefined') {
        console.log('[Balance Live] ✅ Initial balance loaded:', data);
        updateBalanceSafely(data.ton, data.stars);
        if (data.techPause && typeof data.techPause === "object") {
          window.dispatchEvent(new CustomEvent('techpause:update', { detail: data.techPause }));
        }
      } else {
        console.warn('[Balance Live] ⚠️ Invalid initial balance response:', data);
      }
    } catch (error) {
      console.error('[Balance Live] ❌ Failed to load initial balance:', error);
    }
  }

  // ====== STARTUP SEQUENCE ======
  // 1. Load initial balance immediately
  await loadInitialBalance();
  
  // 2. Connect to SSE after a short delay
  setTimeout(() => {
    connect();
  }, 500);

  // ====== EXPORT ======
  window.BalanceLive = {
    connect,
    disconnect,
    isConnected: () => eventSource !== null && eventSource.readyState === EventSource.OPEN,
    reconnect: () => {
      disconnect();
      setTimeout(connect, 500);
    },
    // 🔥 NEW: Force reload balance
    refresh: async () => {
      await loadInitialBalance();
    }
  };

  console.log('[Balance Live] ✅ Module ready');
})();
