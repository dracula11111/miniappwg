// public/js/shared/ban-guard.js
(function () {
  const tg = window.Telegram?.WebApp;
  const SUPPORT_USERNAME = "@wildgift_support";
  const SUPPORT_URL = "https://t.me/wildgift_support";
  const ROOT_ID = "wtBanScreen";
  const STYLE_ID = "wtBanScreenStyles";

  let checked = false;
  let banned = false;
  let checkPromise = null;

  function getTelegramUserId() {
    const id = tg?.initDataUnsafe?.user?.id;
    if (!id || id === "guest") return "";
    return String(id);
  }

  function getInitData() {
    return String(tg?.initData || "");
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
        padding: 32px 18px 42px;
        box-sizing: border-box;
        background:
          linear-gradient(180deg, rgba(5, 10, 18, 0.12) 0%, rgba(5, 10, 18, 0.82) 62%, rgba(5, 10, 18, 0.94) 100%),
          url('/images/banback.png') center center / cover no-repeat,
          #08111d;
      }

      #${ROOT_ID} .wt-ban__panel {
        width: min(100%, 420px);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        padding: 28px 22px 24px;
        border-radius: 28px;
        background: rgba(6, 11, 20, 0.72);
        border: 1px solid rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.38);
        text-align: center;
        color: #f5f7fb;
        font-family: "Segoe UI", Arial, sans-serif;
      }

      #${ROOT_ID} .wt-ban__icon {
        width: 92px;
        height: 92px;
        object-fit: contain;
        display: block;
      }

      #${ROOT_ID} .wt-ban__title {
        margin: 0;
        font-size: clamp(26px, 6vw, 34px);
        line-height: 1.08;
        font-weight: 800;
        letter-spacing: 0.01em;
      }

      #${ROOT_ID} .wt-ban__text {
        margin: 0;
        font-size: 15px;
        line-height: 1.55;
        color: rgba(245, 247, 251, 0.84);
      }

      #${ROOT_ID} .wt-ban__support {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        background: #2aabee;
        color: #ffffff;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }
    `;
    document.head.appendChild(style);
  }

  function openSupportChat(event) {
    event?.preventDefault?.();
    try {
      if (typeof tg?.openTelegramLink === "function") {
        tg.openTelegramLink(SUPPORT_URL);
        return;
      }
    } catch {}

    try {
      window.open(SUPPORT_URL, "_blank", "noopener");
    } catch {
      window.location.href = SUPPORT_URL;
    }
  }

  function hideAppShell() {
    document.body.style.overflow = "hidden";
    document.body.style.backgroundColor = "#08111d";

    const splash = document.getElementById("splash");
    if (splash) splash.style.display = "none";

    const app = document.querySelector(".app");
    if (app) app.style.display = "none";
  }

  function renderBanScreen() {
    banned = true;
    ensureStyles();
    hideAppShell();

    if (document.getElementById(ROOT_ID)) return true;

    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.setAttribute("aria-label", "Account banned");
    root.innerHTML = `
      <div class="wt-ban__panel">
        <img class="wt-ban__icon" src="/icons/app/ban.webp" alt="Banned account">
        <h1 class="wt-ban__title">Your account has been banned</h1>
        <p class="wt-ban__text">If this was done by mistake, contact support.</p>
        <button class="wt-ban__support" type="button">${SUPPORT_USERNAME}</button>
      </div>
    `;

    const icon = root.querySelector(".wt-ban__icon");
    icon?.addEventListener("error", () => {
      icon.style.display = "none";
    });

    const supportButton = root.querySelector(".wt-ban__support");
    supportButton?.addEventListener("click", openSupportChat);

    document.body.appendChild(root);
    return true;
  }

  async function checkBanStatus() {
    if (checked) return banned;
    checked = true;

    const userId = getTelegramUserId();
    const initData = getInitData();
    if (!userId) {
      banned = false;
      return banned;
    }
    if (!initData) {
      banned = false;
      return banned;
    }

    try {
      const response = await fetch(`/api/user/profile?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "x-telegram-init-data": initData
        }
      });

      if (response.status === 404) {
        banned = false;
        return banned;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json().catch(() => null);
      banned = Number(data?.user?.ban) === 1;

      if (banned) {
        renderBanScreen();
      }

      return banned;
    } catch (error) {
      console.warn("[Ban Guard] Failed to load account status:", error);
      checked = false;
      banned = false;
      return banned;
    }
  }

  function ensureChecked() {
    if (!checkPromise) {
      checkPromise = checkBanStatus().finally(() => {
        if (!checked) checkPromise = null;
      });
    }
    return checkPromise;
  }

  ensureChecked();

  window.WTBanGuard = {
    ensureChecked,
    isBanned: () => banned === true,
    render: renderBanScreen,
    supportUsername: SUPPORT_USERNAME
  };
})();
