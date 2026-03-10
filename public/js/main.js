// Bundle all frontend styles in the same order as legacy <link> tags.
import "../css/base.css";
import "../css/layout.css";
import "../css/components.css";
import "../css/games.css";
import "../css/wheel.css";
import "../css/crash.css";
import "../css/cases.css";
import "../css/market.css";
import "../css/tasks.css";
import "../css/profile.css";
import "../css/bonus.css";

// Mount the large HTML shell into #root before feature scripts run.
import "./app-shell.js";

// Core scripts that should always be available.
import "./shared/ban-guard.js";
import "./shared/splash.js";
import "./core/app.js";
import "./features/payments/tondep.js";
import "./features/payments/starsdep.js";
import "./core/switch.js";
import "./shared/validation.js";
import "./shared/balance-live.js";
import "./core/settings.js";

// Lazy-load heavy page features on first visit to reduce initial JS parse time.
const pageFeatureMap = {
  wheelPage: ["wheel"],
  crashPage: ["crash"],
  casesPage: ["cases"],
  marketPage: ["market"],
  tasksPage: ["tasks"],
  profilePage: ["profile"]
};

const featureLoaders = {
  wheel: async () => {
    await Promise.all([
      import("./features/wheel/bonus-5050.js"),
      import("./features/wheel/wildtime.js"),
      import("./features/wheel/lootrush.js")
    ]);
    await import("./features/wheel/wheel.js");
    await import("./features/admin-panel.js");
  },
  crash: () => import("./features/crash/crash.js"),
  cases: () =>
    Promise.all([
      import("./features/cases/nft-win-screen.js"),
      import("./features/cases/cases.js")
    ]),
  market: () => import("./features/market/market.js"),
  tasks: () => import("./features/tasks/tasks.js"),
  profile: () => import("./features/profile/profile.js")
};

const featureLoadPromises = new Map();

function loadFeature(featureKey) {
  const loader = featureLoaders[featureKey];
  if (!loader) return Promise.resolve();

  if (!featureLoadPromises.has(featureKey)) {
    const task = Promise.resolve()
      .then(() => loader())
      .catch((error) => {
        featureLoadPromises.delete(featureKey);
        console.error(`[WT] Failed to load feature chunk: ${featureKey}`, error);
        throw error;
      });
    featureLoadPromises.set(featureKey, task);
  }

  return featureLoadPromises.get(featureKey);
}

function getActivePageId() {
  return document.querySelector(".page.page-active")?.id || null;
}

function ensureFeaturesForPage(pageId) {
  const featureKeys = pageFeatureMap[pageId];
  if (!Array.isArray(featureKeys) || featureKeys.length === 0) {
    return Promise.resolve();
  }
  return Promise.all(featureKeys.map(loadFeature));
}

function setupFeatureChunkLoader() {
  const bus = window.WT?.bus;
  if (bus?.addEventListener) {
    bus.addEventListener("page:change", (event) => {
      const pageId = event?.detail?.id;
      if (pageId) ensureFeaturesForPage(pageId);
    });
  }

  const activePageId = getActivePageId();
  if (activePageId) {
    ensureFeaturesForPage(activePageId);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupFeatureChunkLoader, { once: true });
} else {
  setupFeatureChunkLoader();
}
