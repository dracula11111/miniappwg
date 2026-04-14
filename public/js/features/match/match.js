(() => {
  "use strict";

  const PAGE_ID = "matchPage";
  const STORAGE_KEYS = ["wt_match_endless_v1", "wt_combo_endless_v2"];
  const BG_PRIMARY = "/images/match/backgrounds/matchMainback.webp";
  const BG_FALLBACK = "/images/match/backgrounds/1.webp";

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

  function ensurePage() {
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

    if (!page.querySelector(".match-screen")) {
      page.innerHTML = `
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
    probe.src = `${BG_PRIMARY}?v=${Date.now()}`;
  }

  function init() {
    const page = ensurePage();
    const getWildCoin = () => readWildCoin();
    preloadBackground(page);

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
