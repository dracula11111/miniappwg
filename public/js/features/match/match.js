(() => {
  "use strict";

  const PAGE_ID = "matchPage";
  const PLACEHOLDER_MODE_CLASS = "wt-match-soon-mode";
  const STORAGE_KEYS = ["wt_match_endless_v1", "wt_combo_endless_v2"];
  const BG_PRIMARY = "/images/match/backgrounds/matchMainback.webp";
  const BG_FALLBACK = "/images/match/backgrounds/1.webp";

  function isLocalDevHost() {
    try {
      const host = String(window.location.hostname || "").toLowerCase();
      return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        host.endsWith(".local")
      );
    } catch {
      return false;
    }
  }

  function hasTelegramSession() {
    try {
      const ua = String(navigator.userAgent || "").toLowerCase();
      const looksLikeTelegramUa = ua.includes("telegram");
      const webApp = window.Telegram?.WebApp;
      if (!webApp) return looksLikeTelegramUa;

      const initData = typeof webApp.initData === "string" ? webApp.initData.trim() : "";
      const userId = webApp?.initDataUnsafe?.user?.id;
      return (
        Boolean(initData) ||
        (userId !== undefined && userId !== null && String(userId).trim() !== "") ||
        looksLikeTelegramUa
      );
    } catch {
      return false;
    }
  }

  function shouldUseSoonPlaceholder() {
    return !isLocalDevHost() && hasTelegramSession();
  }

  function resolveUiLanguage() {
    const candidates = [];
    try { candidates.push(window.WT?.i18n?.getLanguage?.()); } catch {}
    try { candidates.push(document.body?.getAttribute?.("data-wt-lang")); } catch {}
    try { candidates.push(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code); } catch {}
    try { candidates.push(navigator.language); } catch {}

    for (const candidate of candidates) {
      const lang = String(candidate || "").trim().toLowerCase();
      if (!lang) continue;
      if (lang.startsWith("ru")) return "ru";
      if (lang.startsWith("en")) return "en";
    }
    return "en";
  }

  function getSoonLabel() {
    return resolveUiLanguage() === "ru" ? "\u0421\u043a\u043e\u0440\u043e..." : "Soon...";
  }

  function parseWildCoin(raw) {
    const value = Math.max(0, Math.round(Number(raw) || 0));
    return Number.isFinite(value) ? value : 0;
  }

  function readWildCoin() {
    for (const key of STORAGE_KEYS) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        return parseWildCoin(parsed?.wildCoin);
      } catch {}
    }
    return 0;
  }

  function emitWildCoin(value) {
    try {
      window.dispatchEvent(
        new CustomEvent("match:wildcoin-update", {
          detail: { wildCoin: value }
        })
      );
    } catch {}
  }

  function ensurePage(soonMode) {
    let page = document.getElementById(PAGE_ID);
    if (!page) {
      page = document.createElement("main");
      page.id = PAGE_ID;
      page.className = "page";
      const appRoot = document.querySelector(".app") || document.body;
      const bottomNav = appRoot.querySelector(".bottom-nav") || document.querySelector(".bottom-nav");
      if (bottomNav) appRoot.insertBefore(page, bottomNav);
      else appRoot.appendChild(page);
    }

    const needsSoon = Boolean(soonMode);
    const hasSoon = Boolean(page.querySelector(".match-soon"));
    const hasScreen = Boolean(page.querySelector(".match-screen"));
    if ((needsSoon && !hasSoon) || (!needsSoon && !hasScreen)) {
      page.innerHTML = needsSoon
        ? `
          <section class="match-soon" aria-label="Match Soon">
            <p class="match-soon__text" data-match-soon-text>${getSoonLabel()}</p>
          </section>
        `
        : `
          <section class="match-screen" aria-label="Match"></section>
        `;
    }

    return page;
  }

  function preloadBackground(page) {
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => page.style.setProperty("--match-bg-image", `url("${BG_PRIMARY}")`);
    probe.onerror = () => page.style.setProperty("--match-bg-image", `url("${BG_FALLBACK}")`);
    probe.src = BG_PRIMARY;
  }

  function init() {
    const soonMode = shouldUseSoonPlaceholder();
    const page = ensurePage(soonMode);
    const getWildCoin = () => readWildCoin();

    document.documentElement?.classList?.toggle(PLACEHOLDER_MODE_CLASS, soonMode);
    document.body?.classList?.toggle(PLACEHOLDER_MODE_CLASS, soonMode);

    if (!soonMode) preloadBackground(page);

    window.WTMatch = {
      getWildCoin: () => getWildCoin(),
      getState: () => ({ wildCoin: getWildCoin() }),
      openEconomySheet: () => {
        const wildCoin = getWildCoin();
        const text = `WildCoin: ${wildCoin}`;
        if (typeof window.showToast === "function") {
          window.showToast(text);
          return;
        }
        try {
          window.Telegram?.WebApp?.showPopup?.({ title: "WildCoin", message: text });
        } catch {}
      }
    };

    const refreshSoonLabel = () => {
      const text = page.querySelector("[data-match-soon-text]");
      if (!text) return;
      text.textContent = getSoonLabel();
    };

    if (soonMode) {
      refreshSoonLabel();
      window.addEventListener("language:changed", refreshSoonLabel);
      window.WT?.bus?.addEventListener?.("language:changed", refreshSoonLabel);
    }

    emitWildCoin(getWildCoin());

    try {
      window.WT?.bus?.addEventListener?.("page:change", (event) => {
        if (event?.detail?.id !== PAGE_ID) return;
        emitWildCoin(getWildCoin());
      });
    } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
