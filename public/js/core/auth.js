// /public/js/auth.js
(function(){
    const tg = window.Telegram?.WebApp;
  
    // Берём сырую строку initData (а не initDataUnsafe)
    function getInitData() {
      return tg?.initData || ""; // пустая строка, если запущено не в Telegram
    }
  
    // Пример валидации при загрузке (необязательно)
    async function validateOnStart() {
      const initData = getInitData();
      if (!initData) return; // в обычном браузере ничего не делаем
      try {
        const r = await fetch('/auth/validate', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ initData })
        });
        const data = await r.json();
        if (data.ok) {
          console.log('✅ Verified user:', data.user);
          window.__WT_USER = data.user; // если нужно — положим в глобал
        } else {
          console.warn('❌ initData verification failed:', data);
        }
      } catch (e) {
        console.warn('Auth validate error:', e);
      }
    }
  
    // Экспорт в глобал, чтобы можно было использовать в deposit.js
    window.WTAuth = { getInitData, validateOnStart };
  
    // Можно сразу дернуть (если хочешь)
    // validateOnStart();
  })();
  