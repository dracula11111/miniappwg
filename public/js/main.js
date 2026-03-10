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

// Bundle app scripts in the same order as legacy <script defer> tags.
import "./shared/ban-guard.js";
import "./shared/splash.js";
import "./core/app.js";
import "./features/payments/tondep.js";
import "./features/payments/starsdep.js";
import "./features/wheel/wheel.js";
import "./features/wheel/wildtime.js";
import "./features/wheel/bonus-5050.js";
import "./features/wheel/lootrush.js";
import "./features/crash/crash.js";
import "./core/switch.js";
import "./features/cases/nft-win-screen.js";
import "./features/cases/cases.js";
import "./features/market/market.js";
import "./features/tasks/tasks.js";
import "./features/profile/profile.js";
import "./shared/validation.js";
import "./shared/balance-live.js";
import "./core/settings.js";
import "./features/admin-panel.js";
