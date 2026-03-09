// /js/features/tasks/tasks.js
(function () {
  const TASK_SUBSCRIBE_ID = "subscribe_channel";
  const TASK_SUBSCRIBE_STATUS_URL = "/api/tasks/channel-subscription/status";
  const TASK_SUBSCRIBE_CLAIM_URL = "/api/tasks/channel-subscription/claim";
  const TASK_SUBSCRIBE_DEFAULT_URL = "https://t.me/wildgift_channel";

  const TASKS = [
    {
      id: TASK_SUBSCRIBE_ID,
      section: "one",
      title: "Subscribe to Wild Gift",
      subtitle: "@wildgift_channel",
      rewardStars: 1,
      icon: "/images/tasks/tg.png",
      iconBg: "#1f86ff",
      button: { type: "start", text: "Start" }
    },
    {
      id: "invite_friend",
      section: "one",
      title: "Invite friend",
      rewardStars: 5,
      icon: "/images/tasks/invite.png",
      iconBg: "#9b4dff",
      button: { type: "start", text: "Start" }
    },
    {
      id: "top_up_05",
      section: "daily",
      title: "Top up 0.5 TON",
      subtitle: "or equivalent in Stars",
      rewardStars: 10,
      icon: "/images/tasks/ton.png",
      iconBg: "#39b8ff",
      button: { type: "start", text: "Start" }
    },
    {
      id: "win_once_wheel_crash",
      section: "daily",
      title: "Win once in Game",
      subtitle: "Wheel / Crash",
      rewardStars: 10,
      icon: "/images/tasks/game.png",
      iconBg: "#35d06a",
      button: { type: "start", text: "Start" }
    }
  ];

  const tg = window.Telegram?.WebApp || null;
  const subscribeState = {
    opened: false,
    subscribed: false,
    claimed: false,
    loading: false,
    channelUrl: TASK_SUBSCRIBE_DEFAULT_URL,
    checkError: ""
  };

  function getInitData() {
    return window.Telegram?.WebApp?.initData || "";
  }

  async function tgFetch(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      "x-telegram-init-data": getInitData()
    };
    return fetch(url, { ...options, headers });
  }

  function showToast(message, variant = "") {
    const text = String(message || "").trim();
    if (!text) return;
    if (typeof window.showToast === "function") {
      try {
        window.showToast(text, { variant });
        return;
      } catch {}
    }
    if (tg?.showAlert) {
      try { tg.showAlert(text); return; } catch {}
    }
    try { alert(text); } catch {}
  }

  function haptic(kind = "light") {
    try {
      const hf = tg?.HapticFeedback;
      if (!hf) return;
      if (kind === "success" || kind === "error" || kind === "warning") {
        hf.notificationOccurred?.(kind);
      } else {
        hf.impactOccurred?.(kind);
      }
    } catch {}
  }

  function openTelegramUrl(url) {
    const target = String(url || TASK_SUBSCRIBE_DEFAULT_URL).trim() || TASK_SUBSCRIBE_DEFAULT_URL;
    try {
      if (typeof tg?.openTelegramLink === "function") return tg.openTelegramLink(target);
      if (typeof tg?.openLink === "function") return tg.openLink(target);
    } catch {}
    window.open(target, "_blank", "noopener,noreferrer");
  }

  function getUserCurrency() {
    const fromApi = String(window.WildTimeCurrency?.current || "").toLowerCase();
    if (fromApi === "ton" || fromApi === "stars") return fromApi;

    const fromStorage = String(localStorage.getItem("wt-currency") || "").toLowerCase();
    if (fromStorage === "ton" || fromStorage === "stars") return fromStorage;

    return "stars";
  }

  function starsToTonAmount(stars) {
    const amountStars = Number(stars || 0);
    if (!Number.isFinite(amountStars) || amountStars <= 0) return 0;

    const convert = window.WildTimeRates?.starsToTon;
    const ton = (typeof convert === "function") ? Number(convert(amountStars)) : NaN;
    if (Number.isFinite(ton) && ton > 0) return Math.round(ton * 10000) / 10000;

    const fallbackStarsPerTon = Number(window.WildTimeRates?.getStarsPerTon?.() || 140);
    if (!Number.isFinite(fallbackStarsPerTon) || fallbackStarsPerTon <= 0) return 0;
    return Math.round((amountStars / fallbackStarsPerTon) * 10000) / 10000;
  }

  function formatTon(amountTon) {
    const n = Number(amountTon || 0);
    if (!Number.isFinite(n) || n <= 0) return "0";
    const precision = n < 0.01 ? 3 : 2;
    const factor = precision === 3 ? 1000 : 100;
    const rounded = Math.round(n * factor) / factor;
    return rounded.toFixed(precision).replace(/\.?0+$/, "");
  }

  function buildRewardDisplay(task, currency) {
    if (currency === "ton") {
      return formatTon(starsToTonAmount(task.rewardStars));
    }
    return String(Math.max(0, Math.round(Number(task.rewardStars || 0))));
  }

  function getSubscribeButtonConfig() {
    if (subscribeState.claimed) {
      return { type: "claimed", text: "Claimed", disabled: true };
    }
    if (subscribeState.loading) {
      return { type: "check", text: "Checking...", disabled: true };
    }
    if (subscribeState.subscribed) {
      return { type: "claim", text: "Claim", disabled: false };
    }
    if (subscribeState.opened) {
      return { type: "check", text: "Check", disabled: false };
    }
    return { type: "start", text: "Start", disabled: false };
  }

  function getButtonConfig(task) {
    if (task.id === TASK_SUBSCRIBE_ID) return getSubscribeButtonConfig();
    return { ...task.button, disabled: false };
  }

  function buildRewardText(currency, amount) {
    const cur = String(currency || "").toLowerCase() === "ton" ? "ton" : "stars";
    const n = Number(amount || 0);
    if (cur === "ton") return `+${formatTon(n)} TON`;
    return `+${Math.max(0, Math.round(n))} STARS`;
  }

  function applyClaimedBalance(currency, newBalance, tonBalance, starsBalance) {
    const cur = String(currency || "").toLowerCase() === "ton" ? "ton" : "stars";
    const next = Number(newBalance || 0);
    if (typeof window.WildTimeCurrency?.setBalance === "function") {
      try { window.WildTimeCurrency.setBalance(cur, next); } catch {}
    }

    const detail = {};
    if (cur === "ton") detail.ton = next;
    if (cur === "stars") detail.stars = next;
    if (Number.isFinite(Number(tonBalance))) detail.ton = Number(tonBalance);
    if (Number.isFinite(Number(starsBalance))) detail.stars = Number(starsBalance);
    window.dispatchEvent(new CustomEvent("balance:update", { detail }));
  }

  async function refreshSubscribeStateFromServer() {
    try {
      const response = await tgFetch(TASK_SUBSCRIBE_STATUS_URL, { method: "GET", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) return false;

      subscribeState.claimed = !!json.claimed;
      subscribeState.subscribed = !!json.subscribed;
      subscribeState.opened = subscribeState.opened || subscribeState.subscribed || subscribeState.claimed;
      if (json?.channel?.url) subscribeState.channelUrl = String(json.channel.url);
      subscribeState.checkError = String(json?.checkError || "");
      return true;
    } catch {
      return false;
    }
  }

  async function checkSubscribeTask() {
    subscribeState.loading = true;
    render();
    try {
      const ok = await refreshSubscribeStateFromServer();
      if (!ok) {
        showToast("Failed to check subscription. Try again.", "error");
        haptic("error");
        return;
      }

      if (subscribeState.claimed) {
        showToast("Reward already claimed.", "warning");
        haptic("warning");
        return;
      }

      if (subscribeState.subscribed) {
        showToast("Subscription confirmed. Tap Claim.", "success");
        haptic("success");
        return;
      }

      if (subscribeState.checkError) {
        showToast(subscribeState.checkError, "error");
        haptic("error");
        return;
      }

      showToast("Subscribe to the channel first, then tap Check.", "warning");
      haptic("warning");
    } finally {
      subscribeState.loading = false;
      render();
    }
  }

  async function claimSubscribeTask() {
    subscribeState.loading = true;
    render();
    try {
      const currency = getUserCurrency();
      const response = await tgFetch(TASK_SUBSCRIBE_CLAIM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency })
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        if (json?.code === "TASK_NOT_COMPLETED") {
          subscribeState.subscribed = false;
          showToast("Subscribe to the channel first.", "warning");
          haptic("warning");
        } else {
          showToast(json?.error || "Failed to claim reward.", "error");
          haptic("error");
        }
        return;
      }

      subscribeState.claimed = true;
      subscribeState.subscribed = true;
      subscribeState.opened = true;
      subscribeState.checkError = "";
      if (json?.channel?.url) subscribeState.channelUrl = String(json.channel.url);

      applyClaimedBalance(json.currency, json.newBalance, json.tonBalance, json.starsBalance);
      if (json.alreadyClaimed) {
        showToast("Reward already claimed.", "warning");
        haptic("warning");
      } else {
        showToast(`Claim successful: ${buildRewardText(json.currency, json.added)}`, "success");
        haptic("success");
      }
    } catch {
      showToast("Failed to claim reward. Try again.", "error");
      haptic("error");
    } finally {
      subscribeState.loading = false;
      render();
    }
  }

  async function onTaskClick(task) {
    if (task.id !== TASK_SUBSCRIBE_ID) {
      showToast("This task will be enabled later.");
      return;
    }

    if (subscribeState.loading || subscribeState.claimed) return;
    if (!subscribeState.opened && !subscribeState.subscribed) {
      subscribeState.opened = true;
      render();
      openTelegramUrl(subscribeState.channelUrl || TASK_SUBSCRIBE_DEFAULT_URL);
      showToast("Subscribe in the channel, then return and tap Check.");
      return;
    }

    if (subscribeState.subscribed) {
      await claimSubscribeTask();
      return;
    }
    await checkSubscribeTask();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderSectionHeader({ left, rightTimer }) {
    const head = el("div", "tsec");
    head.appendChild(el("div", "tsec__left", left));

    if (rightTimer) {
      const right = el("div", "tsec__right");
      right.append(el("span", "tsec__clock", "o"), el("span", "tsec__time", rightTimer));
      head.appendChild(right);
    }
    return head;
  }

  function renderTask(task) {
    const row = el("div", "trow");
    const currency = getUserCurrency();

    const icon = el("div", "trow__icon");
    icon.style.setProperty("--icon-bg", task.iconBg || "#333");
    const img = document.createElement("img");
    img.className = "trow__iconImg";
    img.alt = "";
    img.loading = "lazy";
    img.src = task.icon;
    img.onerror = () => {
      img.remove();
      icon.appendChild(el("div", "trow__iconFallback", "*"));
    };
    icon.appendChild(img);

    const meta = el("div", "trow__meta");
    meta.appendChild(el("div", "trow__title", task.title));
    if (task.subtitle) meta.appendChild(el("div", "trow__sub", task.subtitle));

    const reward = el("div", "trow__reward");
    reward.classList.add(currency === "ton" ? "trow__reward--ton" : "trow__reward--stars");

    const rewardIcon = document.createElement("img");
    rewardIcon.className = "trow__rewardIcon";
    rewardIcon.alt = "";
    rewardIcon.src = currency === "ton" ? "/icons/tgTonWhite.svg" : "/icons/tgStarsBlack.svg";
    rewardIcon.onerror = () => {
      rewardIcon.remove();
      reward.insertBefore(el("span", "trow__rewardIconFallback", "*"), reward.firstChild);
    };

    reward.appendChild(rewardIcon);
    reward.appendChild(el("span", "trow__rewardNum", buildRewardDisplay(task, currency)));
    meta.appendChild(reward);

    const buttonCfg = getButtonConfig(task);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tbtn tbtn--${buttonCfg.type}`;
    btn.disabled = !!buttonCfg.disabled;

    if (buttonCfg.type === "claimed") {
      btn.innerHTML = `${buttonCfg.text} <span class="tbtn__check">v</span>`;
    } else {
      btn.textContent = buttonCfg.text;
    }

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      void onTaskClick(task);
    });

    row.append(icon, meta, btn);
    return row;
  }

  function groupBySection(tasks) {
    const one = [];
    const daily = [];
    tasks.forEach((task) => (task.section === "daily" ? daily : one).push(task));
    return { one, daily };
  }

  function render() {
    const tasksPage = document.querySelector("#tasksPage");
    if (!tasksPage) return;

    const card = tasksPage.querySelector(".tasks-card");
    if (!card) return;

    card.innerHTML = "";
    card.classList.add("tasks-card--new");

    const { one, daily } = groupBySection(TASKS);
    one.forEach((task) => card.appendChild(renderTask(task)));
    daily.forEach((task) => card.appendChild(renderTask(task)));
  }

  async function init() {
    render();
    try { await window.WildTimeRates?.ensureTonStarsRate?.(false); } catch {}
    render();
    await refreshSubscribeStateFromServer();
    render();

    window.addEventListener("currency:changed", () => render());
  }

  document.addEventListener("DOMContentLoaded", () => {
    void init();
  });
})();
