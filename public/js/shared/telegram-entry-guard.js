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
        <p class="wt-unauth__copyright">&copy; 2026 WildGift. All rights reserved.</p>
        <button
          type="button"
          class="wt-unauth__terms"
          id="wtUnauthTermsBtn"
          aria-expanded="false"
          aria-controls="wtUnauthTermsSheet"
        >
          WildGift Terms &amp; Privacy Policy
        </button>
      </footer>

      <div class="wt-terms-sheet" id="wtUnauthTermsSheet" role="dialog" aria-modal="true" aria-labelledby="wtTermsTitle" hidden>
        <button type="button" class="wt-terms-sheet__backdrop" id="wtTermsBackdrop" aria-label="Close terms"></button>
        <article class="wt-terms-sheet__panel" role="document" tabindex="-1">
          <header class="wt-terms-sheet__header">
            <h2 class="wt-terms-sheet__title" id="wtTermsTitle">WildGift App Terms &amp; Privacy Policy</h2>
            <button type="button" class="wt-terms-sheet__close" id="wtTermsCloseBtn" aria-label="Close terms">Close</button>
          </header>
          <div class="wt-terms-sheet__body">
            <section class="wt-terms-sheet__section">
              <h3>Legal Notice</h3>
              <p>Last updated: March 12, 2026.</p>
              <p>These terms apply to WildGift products only. Telegram is used as a platform and sign-in method, and has its own independent terms and privacy rules.</p>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>Terms of Service</h3>
              <p>By accessing WildGift, you accept these Terms and agree to comply with local laws.</p>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>1. Eligibility and Access</h3>
              <ul>
                <li>You must be at least 18 years old (or the age of majority in your location).</li>
                <li>You confirm that your use of WildGift is legal where you live.</li>
                <li>Access may be restricted in regions where digital item operations are prohibited.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>2. About the Service</h3>
              <ul>
                <li>WildGift provides digital items and related features inside the app ecosystem.</li>
                <li>Digital items are not legal tender and are not a bank, deposit, or investment product.</li>
                <li>Visual effects, rankings, and promo mechanics are entertainment functionality.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>3. Account, Login, and Security</h3>
              <ul>
                <li>Telegram login is used only for authentication.</li>
                <li>You are responsible for device security and account actions made under your profile.</li>
                <li>If you suspect unauthorized access, contact support immediately.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>4. Prices, Payments, and Delivery</h3>
              <ul>
                <li>Prices are shown at checkout and may change before payment confirmation.</li>
                <li>Payments may be handled by external providers; their billing terms also apply.</li>
                <li>Delivery is usually instant after successful payment but may be delayed by technical or provider issues.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>5. Refunds and Cancellations</h3>
              <ul>
                <li>Digital goods are generally non-refundable once delivered.</li>
                <li>If delivery fails due to a verified technical issue on our side, we may offer redelivery or a refund at our discretion.</li>
                <li>For third-party payment channels, third-party refund procedures may apply.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>6. Prohibited Activity</h3>
              <ul>
                <li>Fraud, abuse, sanctions evasion, money laundering, and unlawful activity are prohibited.</li>
                <li>Reverse engineering, unauthorized automation, and attempts to bypass safeguards are prohibited.</li>
                <li>We may block access for violations or suspicious behavior.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>7. Intellectual Property</h3>
              <p>WildGift branding, interface elements, code, and content are protected by applicable intellectual property laws. You receive a limited, revocable, non-transferable license for personal use of the service.</p>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>8. Disclaimers and Liability</h3>
              <ul>
                <li>The service is provided on an "as is" and "as available" basis.</li>
                <li>We do not guarantee uninterrupted operation, error-free functionality, or market outcomes.</li>
                <li>To the maximum extent permitted by law, WildGift is not liable for indirect, incidental, or consequential losses.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>9. Third-Party Services</h3>
              <p>WildGift may integrate third-party services (including Telegram and payment processors). Those services are governed by their own legal documents, and WildGift is not responsible for third-party policies.</p>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>10. Changes, Suspension, and Contact</h3>
              <ul>
                <li>We may update these terms from time to time.</li>
                <li>We may suspend or terminate access for abuse, legal risk, or policy violations.</li>
                <li>For support or legal questions: <a href="${escapeHtml(
                  SUPPORT_URL
                )}" target="_blank" rel="noopener noreferrer">WildGift Support</a>.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>Privacy Policy</h3>
              <p>This section describes how WildGift collects and uses data while you use the app.</p>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>1. Data We Collect</h3>
              <ul>
                <li>Account and profile identifiers provided through login flows.</li>
                <li>Transaction details such as item IDs, payment status, timestamps, and delivery events.</li>
                <li>Technical logs, device metadata, IP-related diagnostics, and anti-fraud signals.</li>
                <li>Messages sent to support.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>2. Why We Use Data</h3>
              <ul>
                <li>To authenticate users and provide core app functionality.</li>
                <li>To process transactions and provide order support.</li>
                <li>To detect abuse, secure accounts, and maintain system stability.</li>
                <li>To meet legal, accounting, and compliance obligations.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>3. Data Sharing</h3>
              <ul>
                <li>With service providers required for infrastructure, payments, analytics, or support.</li>
                <li>With competent authorities when legally required.</li>
                <li>As part of corporate restructuring (for example, merger or acquisition), subject to safeguards.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>4. Retention and International Transfers</h3>
              <p>Data is stored only for as long as needed for operational, legal, and security purposes. Processing may involve cross-border transfers with reasonable contractual and technical protections.</p>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>5. Your Rights and Security</h3>
              <ul>
                <li>You may request access, correction, or deletion where applicable by law.</li>
                <li>WildGift is not intended for users under 18.</li>
                <li>We apply technical and organizational safeguards, but no system can be guaranteed 100% secure.</li>
              </ul>
            </section>
            <section class="wt-terms-sheet__section">
              <h3>6. Privacy Updates and Contact</h3>
              <p>We may revise this policy as the product evolves or legal requirements change. Current version is always published in the app. Contact: <a href="${escapeHtml(
                SUPPORT_URL
              )}" target="_blank" rel="noopener noreferrer">WildGift Support</a>.</p>
            </section>
          </div>
        </article>
      </div>
    </section>
  `;

  const button = document.getElementById("wtUnauthLoginBtn");
  button?.addEventListener("click", () => {
    const targetUrl = sanitizeUrl(button.getAttribute("data-url"));
    openTelegramLogin(targetUrl);
  });

  const termsButton = document.getElementById("wtUnauthTermsBtn");
  const termsSheet = document.getElementById("wtUnauthTermsSheet");
  const termsPanel = termsSheet?.querySelector(".wt-terms-sheet__panel");
  const closeTermsButton = document.getElementById("wtTermsCloseBtn");
  const closeTermsBackdrop = document.getElementById("wtTermsBackdrop");

  function setTermsOpen(isOpen) {
    if (!termsSheet || !termsButton) return;

    if (isOpen) {
      termsSheet.hidden = false;
      document.body.classList.add("wt-terms-open");
      termsSheet.classList.add("is-open");
      termsButton.setAttribute("aria-expanded", "true");
      window.requestAnimationFrame(() => {
        termsPanel?.focus();
      });
      return;
    }

    termsSheet.classList.remove("is-open");
    document.body.classList.remove("wt-terms-open");
    termsButton.setAttribute("aria-expanded", "false");
    window.setTimeout(() => {
      if (!termsSheet.classList.contains("is-open")) {
        termsSheet.hidden = true;
      }
    }, 260);
  }

  termsButton?.addEventListener("click", () => setTermsOpen(true));
  closeTermsButton?.addEventListener("click", () => setTermsOpen(false));
  closeTermsBackdrop?.addEventListener("click", () => setTermsOpen(false));
  termsSheet?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setTermsOpen(false);
  });
}

export function blockNonTelegramBrowserInProd() {
  if (isLocalDevHost()) return false;
  if (hasTelegramSession()) return false;

  renderUnauthorizedScreen(resolveTelegramLoginUrl());
  return true;
}
