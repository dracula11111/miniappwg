// public/js/balance-live.js - Real-time balance updates via SSE
(async () => {
  console.log('[Balance Live] 🔴 Starting live balance module');

  const tg = window.Telegram?.WebApp;

  async function getUserIdWithRetry() {
    for (let i = 0; i < 40; i++) { // ~2s total
      const id = tg?.initDataUnsafe?.user?.id;
      if (id && id !== 'guest') return id;
      await new Promise(r => setTimeout(r, 50));
    }
    return null;
  }

  const tgUserId = await getUserIdWithRetry();

  if (!tgUserId) {
    console.log('[Balance Live] No user ID, skipping SSE');
    return;
  }

  let eventSource = null;
  let reconnectTimeout = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  // ====== CONNECT TO SSE ======
  function connect() {
    if (eventSource) {
      console.log('[Balance Live] Already connected');
      return;
    }

    console.log('[Balance Live] 📡 Connecting to SSE...');

    try {
      eventSource = new EventSource(`/api/balance/stream?userId=${tgUserId}`);

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
          console.log('[Balance Live] 💰 Balance update received:', data);

          if (data.type === 'balance') {
            // Update currency system
            if (window.WildTimeCurrency) {
              console.log('[Balance Live] Updating currency system:', {
                ton: data.ton,
                stars: data.stars
              });
              
              window.WildTimeCurrency.updateBalance({ ton: data.ton, stars: data.stars });
}

            // Update deposit modules
            if (window.WTTonDeposit) {
              window.WTTonDeposit.setBalance(data.ton);
            }
            if (window.WTStarsDeposit) {
              window.WTStarsDeposit.setBalance(data.stars);
            }

            // Haptic feedback on update
            if (tg?.HapticFeedback) {
              tg.HapticFeedback.notificationOccurred('success');
            }

            // Dispatch event
            window.dispatchEvent(new CustomEvent('balance:update', { detail: { ton: data.ton, stars: data.stars } }));
            window.dispatchEvent(new CustomEvent('balance:live-update', { 
              detail: { 
                ton: data.ton, 
                stars: data.stars,
                timestamp: data.timestamp 
              } 
            }));
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
  // In Telegram WebView visibilitychange can fire often (popups/overlays) — do NOT disconnect.
  // Just try to reconnect when visible.
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
      if (eventSource) return;
      const r = await fetch(`/api/balance?userId=${tgUserId}`, { cache: 'no-store' });
      const j = await r.json();
      if (j && j.ok) {
        const ton = j.ton ?? 0;
        const stars = j.stars ?? 0;
        if (window.WildTimeCurrency) window.WildTimeCurrency.updateBalance({ ton, stars });
        if (window.WTTonDeposit) window.WTTonDeposit.setBalance(ton);
        if (window.WTStarsDeposit) window.WTStarsDeposit.setBalance(stars);
      }
    } catch (e) {}
  }, 20000);

// ====== AUTO CONNECT ======
  setTimeout(() => {
    connect();
  }, 1000); // Wait 1 second for other modules to initialize

  // ====== EXPORT ======
  window.BalanceLive = {
    connect,
    disconnect,
    isConnected: () => eventSource !== null && eventSource.readyState === EventSource.OPEN,
    reconnect: () => {
      disconnect();
      setTimeout(connect, 500);
    }
  };

  console.log('[Balance Live] ✅ Module ready');
})();










