/* =========================
   BASE (always load)
========================= */

import "./shared/splash.js";

import "./core/app.js";
import "./core/switch.js";
import "./core/settings.js";

import "./shared/validation.js";
import "./shared/balance-live.js";

/* =========================
   HELPERS
========================= */

const page =
  document.body?.dataset?.page ||
  window.PAGE ||
  "app";

/* =========================
   FEATURE LAZY LOAD
========================= */

// MARKET
if (page === "market") {
  import("./features/market/market.js");
}

// PROFILE
if (page === "profile") {
  import("./features/profile/profile.js");
}

// TASKS
if (page === "tasks") {
  import("./features/tasks/tasks.js");
}

// CRASH
if (page === "crash") {
  import("./features/crash/crash.js");
}

// CASES
if (page === "cases") {
  import("./features/cases/cases.js");
  import("./features/cases/nft-win-screen.js");
}

// WHEEL
if (page === "wheel") {
  import("./features/wheel/wheel.js");
  import("./features/wheel/wildtime.js");
  import("./features/wheel/bonus-5050.js");
  import("./features/wheel/lootrush.js");
}

// PAYMENTS
if (page === "payments") {
  import("./features/payments/tondep.js");
  import("./features/payments/starsdep.js");
}

// ADMIN
if (page === "admin") {
  import("./features/admin-panel.js");
}