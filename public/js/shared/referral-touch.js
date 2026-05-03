(function () {
  const RETRY_DELAYS = [0, 120, 400, 900, 1800];

  function getTelegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  function getInitData() {
    const tg = getTelegramWebApp();
    return String(tg?.initData || "").trim();
  }

  function getStartParam() {
    const tg = getTelegramWebApp();
    const fromUnsafe = String(tg?.initDataUnsafe?.start_param || "").trim();
    if (fromUnsafe) return fromUnsafe;

    try {
      const params = new URLSearchParams(getInitData());
      const fromInitData = String(params.get("start_param") || "").trim();
      if (fromInitData) return fromInitData;
    } catch {}

    try {
      const params = new URLSearchParams(window.location.search || "");
      return String(
        params.get("tgWebAppStartParam") ||
        params.get("startapp") ||
        params.get("start_param") ||
        ""
      ).trim();
    } catch {
      return "";
    }
  }

  async function touchReferralOnStart(delayMs = 0) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const initData = getInitData();
    if (!initData) return;
    const startParam = getStartParam();
    if (!startParam) return;

    try {
      await fetch("/api/referrals/me", {
        method: "GET",
        cache: "no-store",
        headers: {
          "x-telegram-init-data": initData,
          ...(startParam ? { "x-telegram-start-param": startParam } : {})
        }
      });
    } catch {}
  }

  RETRY_DELAYS.forEach((delayMs) => {
    touchReferralOnStart(delayMs);
  });
})();
