// Bundle all frontend styles in the same order as legacy <link> tags.
import "../css/base.css";
import "../css/layout.css";
import "../css/components.css";
import "../css/games.css";
import "../css/bonus.css";
import "../css/unauthorized.css";

import "./core/perf.js";
import { blockNonTelegramBrowserInProd } from "./shared/telegram-entry-guard.js";

// Mount the large HTML shell into #root before feature scripts run.
import "./app-shell.js";

// Bundle app scripts in the same order as legacy <script defer> tags.
import "./shared/ban-guard.js";
import "./shared/tech-pause-guard.js";
import "./shared/splash.js";
import "./core/app.js";
import "./features/payments/tondep.js";
import "./features/payments/starsdep.js";
import "./core/switch.js";
import "./shared/validation.js";
import "./shared/balance-live.js";
import "./core/settings.js";

const featureLoaders = {
  wheelBundle: () => import("./features/wheel/index.js"),
  crash: () => import("./features/crash/index.js"),
  combo: () => import("./features/combo/index.js"),
  casesBundle: () => import("./features/cases/index.js"),
  market: () => import("./features/market/index.js"),
  tasks: () => import("./features/tasks/index.js"),
  profile: () => import("./features/profile/index.js")
};

const pageFeatureMap = {
  wheelPage: ["wheelBundle"],
  crashPage: ["crash"],
  casesPage: ["casesBundle"],
  marketPage: ["market"],
  tasksPage: ["tasks"],
  profilePage: ["profile"],
  matchPage: ["combo"]
};

const featureState = new Map();
const loadedPages = new Set();

function ensureFeature(featureKey) {
  if (!featureLoaders[featureKey]) return Promise.resolve(false);

  const existing = featureState.get(featureKey);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(() => featureLoaders[featureKey]())
    .then(() => true)
    .catch((err) => {
      console.error(`[WT] Failed to load feature "${featureKey}"`, err);
      featureState.delete(featureKey);
      return false;
    });

  featureState.set(featureKey, promise);
  return promise;
}

async function ensurePageFeatures(pageId) {
  const featureKeys = pageFeatureMap[pageId];
  if (!Array.isArray(featureKeys) || featureKeys.length === 0) return true;

  const results = await Promise.all(featureKeys.map(ensureFeature));
  const ok = results.every(Boolean);
  if (ok) loadedPages.add(pageId);
  return ok;
}

function scheduleIdle(work, timeout = 1800) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => work(), { timeout });
    return;
  }
  window.setTimeout(work, Math.min(timeout, 1200));
}

window.WT = window.WT || {};
window.WT.resolvePage = async (pageId) => ensurePageFeatures(pageId);
window.WT.prefetchPageFeatures = ensurePageFeatures;
window.WT.isPageReady = (pageId) => loadedPages.has(pageId) || !pageFeatureMap[pageId];

const activePageId = document.querySelector(".page.page-active")?.id || "";
if (activePageId) {
  void ensurePageFeatures(activePageId);
}

window.WT?.bus?.addEventListener?.("page:change", (event) => {
  const id = event?.detail?.id;
  if (!id || loadedPages.has(id)) return;
  void ensurePageFeatures(id);
});

// Keep only lightweight pages warm. Heavy bundles stay on-demand to avoid startup jank.
scheduleIdle(() => { void ensurePageFeatures("profilePage"); }, 700);

// Render Unauthorized screen for non-Telegram browsers in production.
blockNonTelegramBrowserInProd();
