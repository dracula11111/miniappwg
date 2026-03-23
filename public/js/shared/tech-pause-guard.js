// public/js/shared/tech-pause-guard.js
(function () {
  const tg = window.Telegram?.WebApp;
  const ROOT_ID = "wtTechPauseScreen";
  const STYLE_ID = "wtTechPauseScreenStyles";
  const POLL_INTERVAL_MS = 8000;
  const LANG_STORAGE_KEY = "wt-language";

  const MESSAGES = {
    en: {
      title: "Technical Pause",
      subtitle: "WildGift is temporarily unavailable while we complete scheduled maintenance.",
      description: "Current rounds were finalized safely. Your balance and gifts are safe.",
      drainingToast: "WildGift is preparing for technical maintenance. Active rounds will finish, then actions will be paused.",
      activeToast: "Technical pause is now active. Bets, purchases, and withdrawals are temporarily disabled.",
      resumeToast: "Technical pause finished. You can continue using WildGift."
    },
    ru: {
      title: "Техническая пауза",
      subtitle: "WildGift временно недоступен: мы проводим плановое обслуживание.",
      description: "Текущие раунды завершены безопасно. Ваш баланс и подарки в сохранности.",
      drainingToast: "WildGift готовится к техпаузе. Активные раунды завершатся, после чего действия будут остановлены.",
      activeToast: "Техническая пауза активна. Ставки, покупки и вывод временно недоступны.",
      resumeToast: "Техническая пауза завершена. Можно продолжать пользоваться WildGift."
    }
  };

  let checked = false;
  let checkPromise = null;
  let pollTimer = null;
  let lastToastMode = "off";
  let state = normalizeState(null);

  function normalizeState(raw) {
    const modeRaw = String(raw?.mode || "").trim().toLowerCase();
    const mode = modeRaw === "active" || modeRaw === "draining" ? modeRaw : "off";
    const enabled = raw?.enabled === true || Number(raw?.enabled) === 1 || mode !== "off";
    const isDraining = mode === "draining";
    const isActive = mode === "active";
    return {
      enabled,
      mode,
      isDraining,
      isActive,
      blocking: isDraining || isActive,
      updatedAt: Number(raw?.updatedAt || 0) || Date.now()
    };
  }

  function detectLanguage() {
    try {
      const fromI18n = String(window.WT?.i18n?.getLanguage?.() || "").trim().toLowerCase();
      if (fromI18n.startsWith("ru")) return "ru";
      if (fromI18n.startsWith("en")) return "en";
    } catch {}

    try {
      const fromStorage = String(localStorage.getItem(LANG_STORAGE_KEY) || "").trim().toLowerCase();
      if (fromStorage.startsWith("ru")) return "ru";
      if (fromStorage.startsWith("en")) return "en";
    } catch {}

    const localeCandidates = [
      tg?.initDataUnsafe?.user?.language_code,
      tg?.initDataUnsafe?.user?.languageCode
    ];

    try {
      if (Array.isArray(navigator.languages)) localeCandidates.push(...navigator.languages);
      localeCandidates.push(navigator.language);
    } catch {}

    for (const value of localeCandidates) {
      const locale = String(value || "").trim().toLowerCase();
      if (!locale) continue;
      if (locale.startsWith("ru") || locale.startsWith("uk") || locale.startsWith("be") || locale.startsWith("kk")) {
        return "ru";
      }
      if (locale.startsWith("en")) return "en";
    }
    return "en";
  }

  function t(key) {
    const lang = detectLanguage();
    return MESSAGES?.[lang]?.[key] || MESSAGES.en[key] || "";
  }

  function notify(message, opts = {}) {
    const text = String(message || "").trim();
    if (!text) return;
    try {
      if (typeof window.notify === "function") {
        window.notify(text, {
          translate: false,
          ttl: Number.isFinite(Number(opts.ttl)) ? Number(opts.ttl) : 5600,
          variant: opts.variant || "warning"
        });
      }
    } catch {}
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px 18px 34px;
        box-sizing: border-box;
        background:
          radial-gradient(78% 46% at 50% 0%, rgba(58, 146, 255, 0.26), rgba(58, 146, 255, 0) 72%),
          radial-gradient(68% 48% at 50% 100%, rgba(22, 83, 161, 0.35), rgba(22, 83, 161, 0) 78%),
          linear-gradient(180deg, #03070f 0%, #02040b 56%, #02050d 100%);
        color: #f6fbff;
      }

      #${ROOT_ID} .wt-techpause__panel {
        width: min(100%, 430px);
        border-radius: 28px;
        border: 1px solid rgba(164, 210, 255, 0.26);
        background: rgba(5, 16, 36, 0.78);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        box-shadow: 0 26px 62px rgba(2, 8, 18, 0.62);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        text-align: center;
        padding: 30px 22px 26px;
      }

      #${ROOT_ID} .wt-techpause__image {
        width: clamp(120px, 34vw, 176px);
        height: auto;
        display: block;
        object-fit: contain;
      }

      #${ROOT_ID} .wt-techpause__title {
        margin: 2px 0 0;
        font-size: clamp(28px, 6.5vw, 40px);
        line-height: 1.08;
        font-weight: 800;
        letter-spacing: 0.01em;
      }

      #${ROOT_ID} .wt-techpause__subtitle {
        margin: 0;
        font-size: 15px;
        line-height: 1.55;
        color: rgba(233, 245, 255, 0.88);
      }

      #${ROOT_ID} .wt-techpause__description {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: rgba(188, 214, 241, 0.86);
      }
    `;
    document.head.appendChild(style);
  }

  function hideAppShell() {
    document.body.style.overflow = "hidden";
    const splash = document.getElementById("splash");
    if (splash) splash.style.display = "none";
    const app = document.querySelector(".app");
    if (app) app.style.display = "none";
  }

  function showAppShell() {
    if (window.WTBanGuard?.isBanned?.()) return;
    document.body.style.overflow = "";
    const app = document.querySelector(".app");
    if (app) app.style.display = "";
  }

  function renderTechPauseScreen() {
    ensureStyles();
    hideAppShell();

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      root.setAttribute("aria-label", "Technical pause");
      document.body.appendChild(root);
    }

    root.innerHTML = `
      <div class="wt-techpause__panel">
        <img class="wt-techpause__image" src="/images/TechPause.webp" alt="Technical pause" loading="eager" decoding="async">
        <h1 class="wt-techpause__title">${t("title")}</h1>
        <p class="wt-techpause__subtitle">${t("subtitle")}</p>
        <p class="wt-techpause__description">${t("description")}</p>
      </div>
    `;

    const img = root.querySelector(".wt-techpause__image");
    img?.addEventListener("error", () => {
      img.style.display = "none";
    }, { once: true });
  }

  function clearTechPauseScreen() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    showAppShell();
  }

  function applyState(rawState, { silent = false } = {}) {
    const next = normalizeState(rawState);
    const prevMode = state.mode;
    state = next;

    try {
      window.dispatchEvent(new CustomEvent("techpause:state", { detail: { ...state } }));
    } catch {}

    if (state.mode === "active") {
      renderTechPauseScreen();
    } else {
      clearTechPauseScreen();
    }

    if (!silent && prevMode !== state.mode) {
      if (state.mode === "draining" && lastToastMode !== "draining") {
        notify(t("drainingToast"), { variant: "warning", ttl: 7200 });
      } else if (state.mode === "active" && lastToastMode !== "active") {
        notify(t("activeToast"), { variant: "warning", ttl: 7600 });
      } else if (state.mode === "off" && prevMode !== "off") {
        notify(t("resumeToast"), { variant: "success", ttl: 4600 });
      }
      lastToastMode = state.mode;
    } else if (prevMode === state.mode) {
      lastToastMode = state.mode;
    }

    return state;
  }

  function getTelegramUserId() {
    const id = tg?.initDataUnsafe?.user?.id;
    if (!id || id === "guest") return "";
    return String(id);
  }

  function getInitData() {
    return String(tg?.initData || "");
  }

  async function fetchTechPauseState() {
    const userId = getTelegramUserId();
    const initData = getInitData();
    if (!userId || !initData) return null;

    const response = await fetch(`/api/system/state?userId=${encodeURIComponent(userId)}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "x-telegram-init-data": initData
      }
    });

    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data?.techPause || null;
  }

  async function checkNow({ silent = false } = {}) {
    try {
      const next = await fetchTechPauseState();
      if (!next) return state;
      checked = true;
      return applyState(next, { silent });
    } catch {
      return state;
    }
  }

  function ensureChecked() {
    if (!checkPromise) {
      checkPromise = checkNow({ silent: false }).finally(() => {
        checkPromise = null;
      });
    }
    return checkPromise;
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      checkNow({ silent: false }).catch(() => {});
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function handleLiveUpdate(event) {
    const next = event?.detail;
    if (!next || typeof next !== "object") return;
    applyState(next, { silent: false });
  }

  function handleLanguageChanged() {
    if (state.mode !== "active") return;
    renderTechPauseScreen();
  }

  window.addEventListener("techpause:update", handleLiveUpdate);
  window.addEventListener("language:changed", handleLanguageChanged);
  window.addEventListener("beforeunload", stopPolling);

  ensureChecked();
  startPolling();

  window.WTTechPauseGuard = {
    ensureChecked,
    isActive: () => state.mode === "active",
    isBlocking: () => state.blocking === true,
    getState: () => ({ ...state }),
    applyState: (next) => applyState(next, { silent: false }),
    render: renderTechPauseScreen
  };
})();
