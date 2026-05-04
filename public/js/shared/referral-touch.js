(function () {
  const RETRY_DELAYS = [0, 120, 400, 900, 1800, 3500, 6500];
  const START_PARAM_STORAGE_KEY = "wt_referral_start_param";

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
    if (fromUnsafe) return rememberStartParam(fromUnsafe);

    try {
      const params = new URLSearchParams(getInitData());
      const fromInitData = String(params.get("start_param") || "").trim();
      if (fromInitData) return rememberStartParam(fromInitData);
    } catch {}

    const fromLocation = getStartParamFromSearch(window.location.search) || getStartParamFromHash(window.location.hash);
    if (fromLocation) return rememberStartParam(fromLocation);

    try {
      return String(sessionStorage.getItem(START_PARAM_STORAGE_KEY) || "").trim();
    } catch {}
    return "";
  }

  window.WTReferral = window.WTReferral || {};
  window.WTReferral.getStartParam = getStartParam;

  function rememberStartParam(value) {
    const param = String(value || "").trim();
    if (!param) return "";
    try { sessionStorage.setItem(START_PARAM_STORAGE_KEY, param); } catch {}
    return param;
  }

  function getStartParamFromSearch(search) {
    try {
      const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
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

  function getStartParamFromHash(hashValue) {
    const raw = String(hashValue || "").replace(/^#/, "");
    if (!raw) return "";
    const direct = getStartParamFromSearch(raw);
    if (direct) return direct;

    try {
      const hashParams = new URLSearchParams(raw);
      const tgWebAppData = String(hashParams.get("tgWebAppData") || "").trim();
      if (!tgWebAppData) return "";
      const initParams = new URLSearchParams(tgWebAppData);
      return String(initParams.get("start_param") || "").trim();
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
