const DEFAULT_LOGIN_URL = "https://t.me";
const SUPPORT_URL = "https://t.me/wildgift_support";

function isLocalDevHost() {
  const host = String(window.location.hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}

function hasTelegramSession() {
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
}

function sanitizeUrl(url, fallback = DEFAULT_LOGIN_URL) {
  const raw = String(url || "").trim();
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw) || /^tg:\/\//i.test(raw)) return raw;
  return fallback;
}

function resolveTelegramLoginUrl() {
  const fromDataset = sanitizeUrl(document.documentElement?.dataset?.telegramLoginUrl, "");
  if (fromDataset) return fromDataset;

  const params = new URLSearchParams(window.location.search || "");
  const fromQuery = sanitizeUrl(
    params.get("telegram_login_url") || params.get("telegramLoginUrl") || params.get("tg_login_url"),
    ""
  );
  if (fromQuery) return fromQuery;

  return DEFAULT_LOGIN_URL;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function openTelegramLogin(url) {
  const target = sanitizeUrl(url);

  try {
    const webApp = window.Telegram?.WebApp;
    if (typeof webApp?.openTelegramLink === "function") {
      webApp.openTelegramLink(target);
      return;
    }
  } catch {}

  try {
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (opened) return;
  } catch {}

  try {
    window.location.href = target;
  } catch {}
}

function renderUnauthorizedScreen(loginUrl) {
  const safeLoginUrl = sanitizeUrl(loginUrl);
  const root = document.getElementById("root");
  const mount = root || document.body;

  document.documentElement.classList.add("wt-unauth-mode");
  document.body.classList.add("wt-unauth-mode");

  mount.innerHTML = `
    <section class="wt-unauth" role="main" aria-labelledby="wtUnauthTitle">
      <div class="wt-unauth__bg" aria-hidden="true"></div>

      <div class="wt-unauth__content">
        <img class="wt-unauth__image" src="/images/unAuth.webp" alt="Unauthorized" loading="eager" decoding="async" />
        <h1 id="wtUnauthTitle" class="wt-unauth__title">Unauthorized</h1>
        <p class="wt-unauth__subtitle">Authorization required to access the app</p>

        <button type="button" class="wt-unauth__button" id="wtUnauthLoginBtn" data-url="${escapeHtml(safeLoginUrl)}">
          <img class="wt-unauth__button-icon" src="/icons/telegram.svg" alt="" aria-hidden="true" />
          <span>Log in with Telegram</span>
        </button>
      </div>

      <footer class="wt-unauth__footer">
        <p class="wt-unauth__copyright">&copy; 2026 LudoGift. All rights reserved.</p>
        <a class="wt-unauth__terms" href="${escapeHtml(SUPPORT_URL)}" target="_blank" rel="noopener noreferrer">
          Terms of Service &amp; Privacy Policy
        </a>
      </footer>
    </section>
  `;

  const button = document.getElementById("wtUnauthLoginBtn");
  button?.addEventListener("click", () => {
    const targetUrl = sanitizeUrl(button.getAttribute("data-url"));
    openTelegramLogin(targetUrl);
  });
}

export function blockNonTelegramBrowserInProd() {
  if (isLocalDevHost()) return false;
  if (hasTelegramSession()) return false;

  renderUnauthorizedScreen(resolveTelegramLoginUrl());
  return true;
}
