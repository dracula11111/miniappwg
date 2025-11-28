// public/js/balance-live.js - Real-time balance updates via SSE
(() => {
  console.log('[Balance Live] 🔴 Starting live balance module');

  const tg = window.Telegram?.WebApp;
  const tgUserId = tg?.initDataUnsafe?.user?.id;

  if (!tgUserId || tgUserId === 'guest') {
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

  // ====== AUTO RECONNECT ON VISIBILITY CHANGE ======
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[Balance Live] Page visible, reconnecting...');
      if (!eventSource) {
        connect();
      }
    } else {
      console.log('[Balance Live] Page hidden, disconnecting...');
      disconnect();
    }
  });

  // ====== CLEANUP ON UNLOAD ======
  window.addEventListener('beforeunload', () => {
    disconnect();
  });

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










