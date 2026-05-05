// /js/features/tasks/tasks.js
(function () {
  const TASK_SUBSCRIBE_ID = "subscribe_channel";
  const TASK_INVITE_ID = "invite_friend";
  const TASK_TOP_UP_ID = "top_up_05";
  const TASK_WIN_GAME_ID = "win_once_wheel_crash";

  const TASK_SUBSCRIBE_STATUS_URL = "/api/tasks/channel-subscription/status";
  const TASK_SUBSCRIBE_CLAIM_URL = "/api/tasks/channel-subscription/claim";
  const TASK_INVITE_STATUS_URL = "/api/tasks/invite-friend/status";
  const TASK_INVITE_CLAIM_URL = "/api/tasks/invite-friend/claim";
  const TASK_INVITE_SHARE_URL = "/api/referrals/share-message";
  const TASK_TOP_UP_STATUS_URL = "/api/tasks/top-up/status";
  const TASK_TOP_UP_CLAIM_URL = "/api/tasks/top-up/claim";
  const TASK_WIN_GAME_STATUS_URL = "/api/tasks/game-win/status";
  const TASK_WIN_GAME_CLAIM_URL = "/api/tasks/game-win/claim";
  const TASK_SUBSCRIBE_DEFAULT_URL = "https://t.me/wildgift_channel";

  const TOP_UP_CHECK_TOAST = "Top up at least 0.5 TON or 50 Stars, then tap Check.";
  const TOP_UP_CLAIM_TOAST = "Top up at least 0.5 TON or 50 Stars first.";
  const GAME_CHECK_TOAST = "Win once in Wheel or Crash, then tap Check.";
  const GAME_CLAIM_TOAST = "Win once in Wheel or Crash first.";
  const INVITE_MESSAGES = {
    alreadyClaimed: {
      en: "Reward already claimed.",
      ru: "Награда уже получена."
    },
    inviteFirst: {
      en: "Invite a friend first.",
      ru: "Сначала пригласи друга."
    },
    failedCheck: {
      en: "Failed to check invite task. Try again.",
      ru: "Не удалось проверить приглашение. Попробуй еще раз."
    },
    confirmed: {
      en: "Invite confirmed. Tap Claim.",
      ru: "Приглашение подтверждено. Нажми «Получить»."
    },
    completed: {
      en: "This task is already completed.",
      ru: "Это задание уже выполнено."
    },
    notConfirmed: {
      en: "No confirmed invite yet. Your friend must open the drop from your invite, then tap Check again.",
      ru: "Пока нет подтвержденного приглашения. Друг должен открыть дроп из твоего приглашения, затем нажми «Проверить» снова."
    },
    createLinkFailed: {
      en: "Failed to create invite link. Try again.",
      ru: "Не удалось создать ссылку приглашения. Попробуй еще раз."
    },
    chooseChat: {
      en: "Choose a chat and send the invite. Then return and tap Check.",
      ru: "Выбери чат и отправь приглашение. Затем вернись и нажми «Проверить»."
    },
    sendInvite: {
      en: "Send the invite. When your friend opens the drop, return and tap Check.",
      ru: "Отправь приглашение. Когда друг откроет дроп, вернись и нажми «Проверить»."
    },
    shareFailed: {
      en: "Could not open sharing. Invite link copied if your device allowed it.",
      ru: "Не удалось открыть отправку. Ссылка скопирована, если устройство это разрешило."
    }
  };

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
      id: TASK_INVITE_ID,
      section: "one",
      title: "Invite friend",
      subtitle: "One-time reward",
      rewardStars: 5,
      icon: "/icons/nav/profile.svg",
      iconBg: "#9b4dff",
      button: { type: "start", text: "Invite" }
    },
    {
      id: TASK_TOP_UP_ID,
      section: "daily",
      title: "Top up 0.5 TON",
      rewardStars: 10,
      icon: "/images/tasks/ton.png",
      iconBg: "#39b8ff",
      button: { type: "start", text: "Start" }
    },
    {
      id: TASK_WIN_GAME_ID,
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

  const inviteState = {
    opened: false,
    loading: false,
    claimed: false,
    link: "",
    code: "",
    shareText: "I left you a Wild Gift drop. Tap before it gets claimed.",
    rewardStars: 5,
    inviteCount: 0,
    pendingRewardCount: 0,
    rewardedCount: 0,
    invitedBy: null,
    invites: [],
    checkError: ""
  };

  const topUpState = {
    opened: false,
    completed: false,
    claimed: false,
    loading: false,
    checkError: "",
    requirement: {
      tonMin: 0.5,
      starsMin: 50
    },
    progress: {
      maxTonDeposit: 0,
      maxStarsDeposit: 0
    }
  };

  const gameWinState = {
    opened: false,
    completed: false,
    claimed: false,
    loading: false,
    checkError: "",
    progress: {
      wins: 0
    }
  };

  function getInitData() {
    return window.Telegram?.WebApp?.initData || "";
  }

  function getReferralStartParam() {
    try {
      return String(window.WTReferral?.getStartParam?.() || "").trim();
    } catch {
      return "";
    }
  }

  function getTasksUserId() {
    return String(tg?.initDataUnsafe?.user?.id || "guest").trim() || "guest";
  }

  function getInviteAttemptKey() {
    return `wt_invite_attempt_${getTasksUserId()}`;
  }

  function readInviteAttempt() {
    try {
      return localStorage.getItem(getInviteAttemptKey()) === "1";
    } catch {
      return false;
    }
  }

  function setInviteAttempt(value) {
    try {
      const key = getInviteAttemptKey();
      if (value) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {}
  }

  async function tgFetch(url, options = {}) {
    const startParam = getReferralStartParam();
    const headers = {
      ...(options.headers || {}),
      "x-telegram-init-data": getInitData(),
      ...(startParam ? { "x-telegram-start-param": startParam } : {})
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

  function getInviteLanguage() {
    const candidates = [
      window.WT?.i18n?.getLanguage?.(),
      tg?.initDataUnsafe?.user?.language_code,
      tg?.initDataUnsafe?.user?.languageCode,
      navigator.language
    ];
    return candidates.some((value) => String(value || "").toLowerCase().startsWith("ru")) ? "ru" : "en";
  }

  function inviteMessage(key) {
    const lang = getInviteLanguage();
    return INVITE_MESSAGES[key]?.[lang] || INVITE_MESSAGES[key]?.en || String(key || "");
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
      if (typeof tg?.openTelegramLink === "function") {
        tg.openTelegramLink(target);
        return true;
      }
      if (typeof tg?.openLink === "function") {
        tg.openLink(target);
        return true;
      }
    } catch {}
    try {
      const opened = window.open(target, "_blank", "noopener,noreferrer");
      if (opened) return true;
    } catch {}
    try {
      window.location.href = target;
      return true;
    } catch {}
    return false;
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "").trim();
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext !== false) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {}

    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      area.style.top = "0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, value.length);
      const ok = document.execCommand("copy");
      area.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  async function shareInviteFallback(link, shareText) {
    const url = String(link || "").trim();
    const text = String(shareText || "I left you a Wild Gift drop. Tap before it gets claimed.").trim();
    if (!url) return false;

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (openTelegramUrl(shareUrl)) return true;

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Wild Gift Drop", text, url });
        return true;
      }
    } catch {}

    return await copyTextToClipboard(`${text}\n${url}`);
  }

  function formatReferralPerson(person) {
    const username = String(person?.username || "").trim();
    if (username) return `@${username.replace(/^@+/, "")}`;
    const displayName = String(person?.displayName || "").trim();
    if (displayName) return displayName;
    const firstName = String(person?.firstName || person?.first_name || "").trim();
    const lastName = String(person?.lastName || person?.last_name || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (fullName) return fullName;
    const id = String(person?.telegramId || person?.id || "").trim();
    return id ? `ID ${id}` : "User";
  }

  function buildInviteSubtitle() {
    return "";
  }

  function openDepositPanel() {
    try {
      if (typeof window.WildTimeCurrency?.openPopup === "function") {
        window.WildTimeCurrency.openPopup();
        return true;
      }
    } catch {}

    try {
      if (typeof window.WT?.activatePage === "function") {
        window.WT.activatePage("profilePage");
      }
    } catch {}

    try {
      if (typeof window.WildTimeCurrency?.openPopup === "function") {
        setTimeout(() => {
          try { window.WildTimeCurrency.openPopup(); } catch {}
        }, 80);
        return true;
      }
    } catch {}

    return false;
  }

  function openGamesPage() {
    try {
      if (typeof window.WT?.activatePage === "function") {
        window.WT.activatePage("gamesPage");
        return true;
      }
    } catch {}

    const navBtn = document.querySelector('.bottom-nav .nav-item[data-target="gamesPage"]');
    if (navBtn) {
      navBtn.click();
      return true;
    }
    return false;
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
    const rewardStars = task.id === TASK_INVITE_ID
      ? Number(inviteState.rewardStars || task.rewardStars || 0)
      : Number(task.rewardStars || 0);
    if (currency === "ton") {
      return formatTon(starsToTonAmount(rewardStars));
    }
    return String(Math.max(0, Math.round(rewardStars)));
  }

  function buildTaskTitle(task, currency) {
    if (task.id === TASK_TOP_UP_ID) {
      return currency === "ton" ? "Top up 0.5 TON" : "Top up 50 Stars";
    }
    return task.title;
  }

  function getInteractiveButtonConfig(state) {
    if (state.claimed) return { type: "claimed", text: "Claimed", disabled: true };
    if (state.loading) return { type: "check", text: "Checking...", disabled: true };
    if (state.completed) return { type: "claim", text: "Claim", disabled: false };
    if (state.opened) return { type: "check", text: "Check", disabled: false };
    return { type: "start", text: "Start", disabled: false };
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

  function getInviteButtonConfig() {
    if (inviteState.claimed) return { type: "claimed", text: "Claimed", disabled: true };
    if (inviteState.loading) return { type: "check", text: "Loading...", disabled: true };
    if (Math.max(0, Number(inviteState.pendingRewardCount || 0)) > 0) {
      return { type: "claim", text: "Claim", disabled: false };
    }
    if (inviteState.opened) return { type: "check", text: "Check", disabled: false };
    return { type: "start", text: "Start", disabled: false };
  }

  function hasInviteProgress() {
    return (
      Math.max(0, Number(inviteState.pendingRewardCount || 0)) > 0 ||
      Math.max(0, Number(inviteState.inviteCount || 0)) > 0 ||
      Math.max(0, Number(inviteState.rewardedCount || 0)) > 0
    );
  }

  function getButtonConfig(task) {
    if (task.id === TASK_SUBSCRIBE_ID) return getSubscribeButtonConfig();
    if (task.id === TASK_INVITE_ID) return getInviteButtonConfig();
    if (task.id === TASK_TOP_UP_ID) return getInteractiveButtonConfig(topUpState);
    if (task.id === TASK_WIN_GAME_ID) return getInteractiveButtonConfig(gameWinState);
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

  async function refreshInviteStateFromServer() {
    try {
      const response = await tgFetch(TASK_INVITE_STATUS_URL, { method: "GET", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) return false;

      inviteState.link = String(json?.link || inviteState.link || "");
      inviteState.code = String(json?.code || inviteState.code || "");
      inviteState.shareText = String(json?.shareText || inviteState.shareText || "");
      inviteState.rewardStars = Math.max(1, Math.round(Number(json?.rewardStars || inviteState.rewardStars || 5)));
      inviteState.claimed = !!json?.claimed;
      inviteState.inviteCount = Math.max(0, Math.trunc(Number(json?.inviteCount || 0)));
      inviteState.pendingRewardCount = Math.max(0, Math.trunc(Number(json?.pendingRewardCount || 0)));
      inviteState.rewardedCount = Math.max(0, Math.trunc(Number(json?.rewardedCount || 0)));
      inviteState.invitedBy = json?.invitedBy || null;
      inviteState.invites = Array.isArray(json?.invites) ? json.invites : [];
      const hasOwnInviteProgress =
        inviteState.inviteCount > 0 ||
        inviteState.pendingRewardCount > 0 ||
        inviteState.rewardedCount > 0;
      if (inviteState.claimed) {
        inviteState.opened = false;
        setInviteAttempt(false);
      } else {
        inviteState.opened = Math.max(0, Number(inviteState.pendingRewardCount || 0)) > 0
          ? false
          : (readInviteAttempt() || inviteState.opened);
        if (hasOwnInviteProgress && Math.max(0, Number(inviteState.pendingRewardCount || 0)) > 0) {
          setInviteAttempt(true);
        }
      }
      inviteState.checkError = "";
      return true;
    } catch {
      return false;
    }
  }

  async function refreshTopUpStateFromServer() {
    try {
      const response = await tgFetch(TASK_TOP_UP_STATUS_URL, { method: "GET", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) return false;

      topUpState.claimed = !!json.claimed;
      topUpState.completed = !!json.completed || topUpState.claimed;
      topUpState.opened = topUpState.opened || topUpState.completed || topUpState.claimed;
      topUpState.checkError = String(json?.checkError || "");

      const tonMin = Number(json?.requirement?.tonMin);
      const starsMin = Number(json?.requirement?.starsMin);
      if (Number.isFinite(tonMin) && tonMin > 0) topUpState.requirement.tonMin = tonMin;
      if (Number.isFinite(starsMin) && starsMin > 0) topUpState.requirement.starsMin = Math.max(1, Math.round(starsMin));

      topUpState.progress.maxTonDeposit = Number(json?.progress?.maxTonDeposit || 0);
      topUpState.progress.maxStarsDeposit = Number(json?.progress?.maxStarsDeposit || 0);
      return true;
    } catch {
      return false;
    }
  }

  async function refreshGameWinStateFromServer() {
    try {
      const response = await tgFetch(TASK_WIN_GAME_STATUS_URL, { method: "GET", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) return false;

      gameWinState.claimed = !!json.claimed;
      gameWinState.completed = !!json.completed || gameWinState.claimed;
      gameWinState.opened = gameWinState.opened || gameWinState.completed || gameWinState.claimed;
      gameWinState.checkError = String(json?.checkError || "");
      gameWinState.progress.wins = Math.max(0, Math.trunc(Number(json?.progress?.wins || 0)));
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

  async function checkTopUpTask() {
    topUpState.loading = true;
    render();
    try {
      const ok = await refreshTopUpStateFromServer();
      if (!ok) {
        showToast("Failed to check top-up task. Try again.", "error");
        haptic("error");
        return;
      }

      if (topUpState.claimed) {
        showToast("Reward already claimed.", "warning");
        haptic("warning");
        return;
      }

      if (topUpState.completed) {
        showToast("Top-up confirmed. Tap Claim.", "success");
        haptic("success");
        return;
      }

      if (topUpState.checkError) {
        showToast(topUpState.checkError, "error");
        haptic("error");
        return;
      }

      showToast(TOP_UP_CHECK_TOAST, "warning");
      haptic("warning");
    } finally {
      topUpState.loading = false;
      render();
    }
  }

  async function checkGameWinTask() {
    gameWinState.loading = true;
    render();
    try {
      const ok = await refreshGameWinStateFromServer();
      if (!ok) {
        showToast("Failed to check game task. Try again.", "error");
        haptic("error");
        return;
      }

      if (gameWinState.claimed) {
        showToast("Reward already claimed.", "warning");
        haptic("warning");
        return;
      }

      if (gameWinState.completed) {
        showToast("Win confirmed. Tap Claim.", "success");
        haptic("success");
        return;
      }

      if (gameWinState.checkError) {
        showToast(gameWinState.checkError, "error");
        haptic("error");
        return;
      }

      showToast(GAME_CHECK_TOAST, "warning");
      haptic("warning");
    } finally {
      gameWinState.loading = false;
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

  async function claimInviteTask() {
    inviteState.loading = true;
    render();
    try {
      const currency = getUserCurrency();
      const response = await tgFetch(TASK_INVITE_CLAIM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency })
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        if (json?.code === "TASK_ALREADY_CLAIMED") {
          inviteState.claimed = true;
          inviteState.opened = false;
          setInviteAttempt(false);
          showToast(inviteMessage("alreadyClaimed"), "warning");
          haptic("warning");
          return;
        }
        if (json?.code === "TASK_NOT_COMPLETED") {
          showToast(inviteMessage("inviteFirst"), "warning");
          haptic("warning");
        } else {
          showToast(json?.error || "Failed to claim reward.", "error");
          haptic("error");
        }
        await refreshInviteStateFromServer();
        return;
      }

      inviteState.link = String(json?.link || inviteState.link || "");
      inviteState.code = String(json?.code || inviteState.code || "");
      inviteState.shareText = String(json?.shareText || inviteState.shareText || "");
      inviteState.rewardStars = Math.max(1, Math.round(Number(json?.rewardStars || inviteState.rewardStars || 5)));
      inviteState.claimed = !!json?.claimed;
      inviteState.inviteCount = Math.max(0, Math.trunc(Number(json?.inviteCount || inviteState.inviteCount || 0)));
      inviteState.pendingRewardCount = Math.max(0, Math.trunc(Number(json?.pendingRewardCount || 0)));
      inviteState.rewardedCount = Math.max(0, Math.trunc(Number(json?.rewardedCount || inviteState.rewardedCount || 0)));
      inviteState.invitedBy = json?.invitedBy || inviteState.invitedBy || null;
      inviteState.invites = Array.isArray(json?.invites) ? json.invites : inviteState.invites;
      if (inviteState.claimed || Math.max(0, Number(inviteState.pendingRewardCount || 0)) <= 0) {
        inviteState.opened = false;
        setInviteAttempt(false);
      }

      applyClaimedBalance(json.currency, json.newBalance, json.tonBalance, json.starsBalance);
      const claimedCount = Math.max(0, Math.trunc(Number(json?.claimedCount || 0)));
      if (json?.alreadyClaimed) {
        showToast(inviteMessage("alreadyClaimed"), "warning");
        haptic("warning");
      } else if (claimedCount > 0) {
        showToast(`Claim successful: ${buildRewardText(json.currency, json.added)}`, "success");
        haptic("success");
      } else {
        showToast("No referral rewards to claim.", "warning");
        haptic("warning");
      }
    } catch {
      showToast("Failed to claim reward. Try again.", "error");
      haptic("error");
    } finally {
      inviteState.loading = false;
      render();
    }
  }

  async function claimTopUpTask() {
    topUpState.loading = true;
    render();
    try {
      const currency = getUserCurrency();
      const response = await tgFetch(TASK_TOP_UP_CLAIM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency })
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        if (json?.code === "TASK_NOT_COMPLETED") {
          topUpState.completed = false;
          showToast(json?.error || TOP_UP_CLAIM_TOAST, "warning");
          haptic("warning");
        } else {
          showToast(json?.error || "Failed to claim reward.", "error");
          haptic("error");
        }
        return;
      }

      topUpState.claimed = true;
      topUpState.completed = true;
      topUpState.opened = true;
      topUpState.checkError = "";

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
      topUpState.loading = false;
      render();
    }
  }

  async function claimGameWinTask() {
    gameWinState.loading = true;
    render();
    try {
      const currency = getUserCurrency();
      const response = await tgFetch(TASK_WIN_GAME_CLAIM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency })
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        if (json?.code === "TASK_NOT_COMPLETED") {
          gameWinState.completed = false;
          showToast(json?.error || GAME_CLAIM_TOAST, "warning");
          haptic("warning");
        } else {
          showToast(json?.error || "Failed to claim reward.", "error");
          haptic("error");
        }
        return;
      }

      gameWinState.claimed = true;
      gameWinState.completed = true;
      gameWinState.opened = true;
      gameWinState.checkError = "";

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
      gameWinState.loading = false;
      render();
    }
  }

  async function onSubscribeTaskClick() {
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

  async function sharePreparedInviteMessage() {
    if (typeof tg?.shareMessage !== "function") return false;
    try {
      const response = await tgFetch(TASK_INVITE_SHARE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok || !json?.preparedMessageId) return false;

      if (json?.link) inviteState.link = String(json.link);
      if (json?.shareText) inviteState.shareText = String(json.shareText);

      tg.shareMessage(String(json.preparedMessageId), () => {});
      return true;
    } catch {
      return false;
    }
  }

  async function onInviteTaskClick() {
    if (inviteState.loading) return;
    if (inviteState.claimed) {
      showToast(inviteMessage("alreadyClaimed"), "warning");
      haptic("warning");
      return;
    }
    if (Math.max(0, Number(inviteState.pendingRewardCount || 0)) > 0) {
      await claimInviteTask();
      return;
    }

    if (inviteState.opened) {
      inviteState.loading = true;
      render();
      const ok = await refreshInviteStateFromServer();
      inviteState.loading = false;
      render();

      if (!ok) {
        showToast(inviteMessage("failedCheck"), "error");
        haptic("error");
        return;
      }

      if (Math.max(0, Number(inviteState.pendingRewardCount || 0)) > 0) {
        showToast(inviteMessage("confirmed"), "success");
        haptic("success");
      } else {
        inviteState.opened = false;
        setInviteAttempt(false);
        render();
        showToast(
          hasInviteProgress()
            ? inviteMessage("completed")
            : inviteMessage("notConfirmed"),
          "warning"
        );
        haptic("warning");
      }
      return;
    }

    if (!inviteState.link) {
      inviteState.loading = true;
      render();
      await refreshInviteStateFromServer();
      inviteState.loading = false;
      render();
    }

    const link = String(inviteState.link || "").trim();
    if (!link) {
      showToast(inviteMessage("createLinkFailed"), "error");
      haptic("error");
      return;
    }

    inviteState.opened = true;
    setInviteAttempt(true);
    render();
    const sharedPrepared = await sharePreparedInviteMessage();
    if (sharedPrepared) {
      showToast(inviteMessage("chooseChat"));
      haptic("light");
      return;
    }

    const shareText = String(inviteState.shareText || "I left you a Wild Gift drop. Tap before it gets claimed.").trim();
    const sharedFallback = await shareInviteFallback(link, shareText);
    if (sharedFallback) {
      showToast(inviteMessage("sendInvite"));
    } else {
      inviteState.opened = false;
      setInviteAttempt(false);
      render();
      showToast(inviteMessage("shareFailed"), "warning");
    }
    haptic("light");
  }

  async function onTopUpTaskClick() {
    if (topUpState.loading || topUpState.claimed) return;
    if (!topUpState.opened && !topUpState.completed) {
      topUpState.opened = true;
      render();
      const opened = openDepositPanel();
      if (opened) {
        showToast("Open deposit panel, top up balance, then tap Check.");
      } else {
        showToast(TOP_UP_CHECK_TOAST);
      }
      return;
    }

    if (topUpState.completed) {
      await claimTopUpTask();
      return;
    }
    await checkTopUpTask();
  }

  async function onGameWinTaskClick() {
    if (gameWinState.loading || gameWinState.claimed) return;
    if (!gameWinState.opened && !gameWinState.completed) {
      gameWinState.opened = true;
      render();
      const opened = openGamesPage();
      if (opened) {
        showToast("Go to Games, win once in Wheel or Crash, then tap Check.");
      } else {
        showToast(GAME_CHECK_TOAST);
      }
      return;
    }

    if (gameWinState.completed) {
      await claimGameWinTask();
      return;
    }
    await checkGameWinTask();
  }

  async function onTaskClick(task) {
    if (task.id === TASK_SUBSCRIBE_ID) {
      await onSubscribeTaskClick();
      return;
    }
    if (task.id === TASK_INVITE_ID) {
      await onInviteTaskClick();
      return;
    }
    if (task.id === TASK_TOP_UP_ID) {
      await onTopUpTaskClick();
      return;
    }
    if (task.id === TASK_WIN_GAME_ID) {
      await onGameWinTaskClick();
      return;
    }

    showToast("This task will be enabled later.");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
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
    meta.appendChild(el("div", "trow__title", buildTaskTitle(task, currency)));
    const subtitle = task.id === TASK_INVITE_ID ? buildInviteSubtitle() : task.subtitle;
    if (subtitle) meta.appendChild(el("div", "trow__sub", subtitle));

    const reward = el("div", "trow__reward");
    reward.classList.add(currency === "ton" ? "trow__reward--ton" : "trow__reward--stars");

    const rewardIcon = document.createElement("img");
    rewardIcon.className = "trow__rewardIcon";
    rewardIcon.alt = "";
    rewardIcon.src = currency === "ton" ? "/icons/currency/tgTonWhite.svg" : "/icons/currency/tgStarsBlack.svg";
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
    btn.textContent = buttonCfg.text;

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

  async function refreshAllTaskStates() {
    await Promise.all([
      refreshSubscribeStateFromServer(),
      refreshInviteStateFromServer(),
      refreshTopUpStateFromServer(),
      refreshGameWinStateFromServer()
    ]);
  }

  function refreshAllTaskStatesSilently() {
    void (async () => {
      await refreshAllTaskStates();
      render();
    })();
  }

  async function init() {
    render();
    try { await window.WildTimeRates?.ensureTonStarsRate?.(false); } catch {}
    render();

    await refreshAllTaskStates();
    render();

    window.addEventListener("currency:changed", () => render());
    window.addEventListener("focus", () => refreshAllTaskStatesSilently());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshAllTaskStatesSilently();
    });
    try {
      window.WT?.bus?.addEventListener?.("page:change", (event) => {
        if (event?.detail?.id === "tasksPage") refreshAllTaskStatesSilently();
      });
    } catch {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    void init();
  });
})();

