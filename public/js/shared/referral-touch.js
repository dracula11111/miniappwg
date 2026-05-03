(function () {
  const tg = window.Telegram?.WebApp || null;

  function getInitData() {
    return String(tg?.initData || "").trim();
  }

  function getStartParam() {
    const fromUnsafe = String(tg?.initDataUnsafe?.start_param || "").trim();
    if (fromUnsafe) return fromUnsafe;

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

  async function touchReferralOnStart() {
    const initData = getInitData();
    if (!initData) return;
    const startParam = getStartParam();

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

  touchReferralOnStart();
})();
