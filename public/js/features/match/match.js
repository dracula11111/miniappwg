(() => {
  "use strict";

  const PAGE_ID = "matchPage";
  const STORAGE_KEYS = ["wt_match_endless_v1", "wt_combo_endless_v2"];
  const LIVES_STORAGE_KEY = "wt_match_lives_v1";
  const PRIZE_TICKETS_STORAGE_KEY = "wt_match_prize_tickets_v1";
  const MATCH_STATE_ENDPOINT = "/api/match/state";
  const MAIN_BG = "/images/match/backgrounds/matchMainback.webp";
  const LEVEL_BG = "/images/match/levels/lvl1back.webp";
  const MATCH_LOGO = "/images/match/MatchLogo.webp";
  const BOOM_IMAGE = "/images/match/boom.webp";
  const PLAY_BUTTON = "/images/match/PlayButton.webp";
  const CLOSE_BUTTON = "/images/match/close-icon.webp?v=2";
  const PANEL_CLOSE_BUTTON = "/images/match/close.webp";
  const QUIT_BUTTON = "/images/match/quit.webp";
  const BROKEN_HEART_IMAGE = "/images/match/brokenheart.webp";
  const HEART_IMAGE = "/images/match/heart.webp";
  const WILDCOIN_IMAGE = "/images/match/wildcoin.webp";
  const TICKET_IMAGE = "/images/match/ticket.webp";
  const PARTICIPANTS_IMAGE = "/images/match/participants.svg";
  const PILLOW_IMAGE = "/images/match/pillow.webp";
  const BOMB_ITEM = Object.freeze({ id: "bomb", src: "/images/match/bomb.webp" });
  const ITEM_DEFS = Object.freeze([
    { id: "bear", src: "/images/match/items/bear.webp" },
    { id: "bottle", src: "/images/match/items/bottle.webp" },
    { id: "cake", src: "/images/match/items/cake.webp" },
    { id: "cup", src: "/images/match/items/cup.webp" },
    { id: "diamond", src: "/images/match/items/diamond.webp" },
    { id: "flowers", src: "/images/match/items/flowers.webp" },
    { id: "gift", src: "/images/match/items/gift.webp" }
  ]);
  const ITEM_BY_ID = Object.freeze(
    [BOMB_ITEM, ...ITEM_DEFS].reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {})
  );
  const BOARD_ROWS = 8;
  const BOARD_COLS = 8;
  const MATCH_MIN = 3;
  const BOMB_BLAST_RADIUS = 2;
  const RANDOM_BOMB_DROP_CHANCE = 0.2;
  const SWAP_ANIMATION_MS = 220;
  const CLEAR_ANIMATION_MS = 240;
  const DROP_ANIMATION_MS = 280;
  const CASCADE_DELAY_MS = 170;
  const SWAP_REVERT_DELAY_MS = 30;
  const SWAP_EASING = "cubic-bezier(0.2, 0.92, 0.18, 1)";
  const HINT_IDLE_MS = 4200;
  const LEVEL_MOVES = 15;
  const LEVEL_REWARD = 10;
  const MAX_LIVES = 5;
  const LIFE_RESTORE_MS = 30 * 60 * 1000;
  const LEVEL_TARGETS = Object.freeze([
    { kind: "bear", count: 15 }
  ]);
  const SHELF_GIFT_ROTATE_MS = 3000;
  const LOL_POP_PNG_BASE = "https://cdn.changes.tg/gifts/models/Lol%20Pop/png/";
  const POOL_FLOAT_PNG_BASE = "https://cdn.changes.tg/gifts/models/Pool%20Float/png/";
  const SNOOP_DOGG_PNG_BASE = "https://cdn.changes.tg/gifts/models/Snoop%20Dogg/png/";
  const JOLLY_CHIMP_PNG_BASE = "https://cdn.changes.tg/gifts/models/Jolly%20Chimp/png/";
  const LOL_POP_SKINS = Object.freeze([
    "Original",
    "Bubblegum",
    "Cherry Berry",
    "Choco Pop",
    "Cotton Candy",
    "Rainbow Dash",
    "Watermelon",
    "Sweetheart"
  ]);
  const POOL_FLOAT_SKINS = Object.freeze([
    "Air Bunny",
    "Alpaca",
    "Anubis",
    "Bald Eagle",
    "Balloon Dog",
    "Baywatch",
    "Cash Flow",
    "Crypto Whale"
  ]);
  const SNOOP_DOGG_SKINS = Object.freeze([
    "Afro Disco",
    "AI Dogg",
    "Backspin",
    "Barks A Locks",
    "Barks Lightyear",
    "Beanie",
    "Black Diamond",
    "Black Gold"
  ]);
  const JOLLY_CHIMP_SKINS = Object.freeze([
    "Abubu",
    "Alarm Ape",
    "Ape Puppet",
    "Artist",
    "Baby Kong",
    "Bananas",
    "Bank Robber",
    "Bellboy"
  ]);
  const SHELF_PRIZE_DEFS = Object.freeze([
    { id: "lol-pop", price: 100 },
    { id: "pool-float", price: 100 },
    { id: "snoop-dogg", price: 150 },
    { id: "jolly-chimp", price: 200 }
  ]);
  const DEFAULT_GIVEAWAY_PARTICIPANTS = Object.freeze({
    "lol-pop": 128,
    "pool-float": 96,
    "snoop-dogg": 74,
    "jolly-chimp": 52
  });

  const state = {
    page: null,
    home: null,
    game: null,
    playImg: null,
    playText: null,
    playImages: [],
    playTexts: [],
    shelfGiftA: null,
    shelfGiftB: null,
    shelfGiftIndex: 0,
    shelfGiftTimer: 0,
    shelfGiftFront: 0,
    poolFloatGiftA: null,
    poolFloatGiftB: null,
    poolFloatGiftIndex: 0,
    poolFloatGiftTimer: 0,
    poolFloatGiftFront: 0,
    snoopDoggGiftA: null,
    snoopDoggGiftB: null,
    snoopDoggGiftIndex: 0,
    snoopDoggGiftTimer: 0,
    snoopDoggGiftFront: 0,
    jollyChimpGiftA: null,
    jollyChimpGiftB: null,
    jollyChimpGiftIndex: 0,
    jollyChimpGiftTimer: 0,
    jollyChimpGiftFront: 0,
    levelPanel: null,
    economyPanel: null,
    livesPanel: null,
    prizePanel: null,
    levelTitle: null,
    livesTitle: null,
    livesHint: null,
    livesCount: null,
    livesTime: null,
    livesPanelSource: "pill",
    goalTitle: null,
    economyHint: null,
    prizeTitle: null,
    prizePrice: null,
    prizeHint: null,
    prizeBuy: null,
    selectedPrizeId: "",
    prizeTickets: {},
    giveawayParticipants: { ...DEFAULT_GIVEAWAY_PARTICIPANTS },
    matchStateSaveTimer: 0,
    matchStateLoaded: false,
    quitPanel: null,
    quitTitle: null,
    quitWarning: null,
    quitConfirm: null,
    winPanel: null,
    winTitle: null,
    winRewardAmount: null,
    winContinue: null,
    winCoin: null,
    failPanel: null,
    failLevelTitle: null,
    failStatus: null,
    failTargets: null,
    failRetry: null,
    outOfMovesToast: null,
    failTimer: 0,
    levelTargetsPreview: null,
    hudMovesTitle: null,
    hudTargetTitle: null,
    hudMovesValue: null,
    hudTargets: null,
    boardEl: null,
    particlesEl: null,
    board: [],
    movesLeft: LEVEL_MOVES,
    targets: [],
    selected: null,
    busy: false,
    levelComplete: false,
    levelFailed: false,
    pointer: null,
    wildCoin: 0,
    lives: MAX_LIVES,
    nextLifeAt: 0,
    livesTimer: 0,
    hintTimer: 0,
    hintPair: null,
    defaultLogoSrc: ""
  };

  function resolveUiLanguage() {
    const candidates = [];
    try { candidates.push(window.WT?.i18n?.getLanguage?.()); } catch {}
    try { candidates.push(document.body?.getAttribute?.("data-wt-lang")); } catch {}
    try { candidates.push(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code); } catch {}
    try { candidates.push(navigator.language); } catch {}

    for (const candidate of candidates) {
      const lang = String(candidate || "").trim().toLowerCase();
      if (!lang) continue;
      if (lang.startsWith("ru")) return "ru";
      if (lang.startsWith("en")) return "en";
    }
    return "en";
  }

  function getPlayButtonText() {
    return resolveUiLanguage() === "ru" ? "\u0418\u0433\u0440\u0430\u0442\u044c" : "Play";
  }

  function getLevelText() {
    return resolveUiLanguage() === "ru" ? "\u0423\u0440\u043e\u0432\u0435\u043d\u044c 1" : "Level 1";
  }

  function getGoalText() {
    return resolveUiLanguage() === "ru" ? "\u0426\u0435\u043b\u044c" : "Goal";
  }

  function getMovesText() {
    return resolveUiLanguage() === "ru" ? "\u0425\u043e\u0434\u044b" : "Moves";
  }

  function getTargetText() {
    return resolveUiLanguage() === "ru" ? "\u0426\u0435\u043b\u044c" : "Target";
  }

  function getEconomyHintText() {
    return resolveUiLanguage() === "ru"
      ? "\u0412\u044b \u043c\u043e\u0436\u0435\u0442\u0435 \u043e\u0431\u043c\u0435\u043d\u044f\u0442\u044c WildCoin \u043d\u0430 \u0431\u0438\u043b\u0435\u0442\u044b, \u0447\u0442\u043e\u0431\u044b \u0443\u0447\u0430\u0441\u0442\u0432\u043e\u0432\u0430\u0442\u044c \u0432 \u0440\u043e\u0437\u044b\u0433\u0440\u044b\u0448\u0430\u0445 \u043d\u0430 NFT-\u043f\u043e\u0434\u0430\u0440\u043a\u0438."
      : "You can exchange WildCoin for tickets to join NFT gift giveaways.";
  }

  function getPrizeTitleText() {
    return resolveUiLanguage() === "ru" ? "\u0411\u0438\u043b\u0435\u0442" : "Ticket";
  }

  function getPrizeHintText() {
    return resolveUiLanguage() === "ru"
      ? "\u041a\u0443\u043f\u0438 \u0431\u0438\u043b\u0435\u0442, \u0447\u0442\u043e\u0431\u044b \u0443\u0447\u0430\u0441\u0442\u0432\u043e\u0432\u0430\u0442\u044c \u0432 \u0440\u043e\u0437\u044b\u0433\u0440\u044b\u0448\u0435 NFT-\u043f\u043e\u0434\u0430\u0440\u043a\u0430 \u0441 \u044d\u0442\u043e\u0439 \u043f\u043e\u043b\u043a\u0438."
      : "Buy one ticket to participate in the giveaway for the NFT gift on this shelf.";
  }

  function getPrizeBuyText() {
    return resolveUiLanguage() === "ru" ? "\u041a\u0423\u041f\u0418\u0422\u042c" : "BUY";
  }

  function getParticipatingText() {
    return resolveUiLanguage() === "ru" ? "\u0423\u0447\u0430\u0441\u0442\u0432\u0443\u0435\u0448\u044c" : "Participating";
  }

  function getWellDoneText() {
    return resolveUiLanguage() === "ru" ? "\u041e\u0442\u043b\u0438\u0447\u043d\u043e!" : "Well Done!";
  }

  function getContinueText() {
    return resolveUiLanguage() === "ru" ? "\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c" : "Continue";
  }

  function getOutOfMovesText() {
    return resolveUiLanguage() === "ru" ? "\u0425\u043e\u0434\u044b \u0437\u0430\u043a\u043e\u043d\u0447\u0438\u043b\u0438\u0441\u044c" : "Out of moves";
  }

  function getLevelFailedText() {
    return resolveUiLanguage() === "ru" ? "\u0423\u0440\u043e\u0432\u0435\u043d\u044c \u043f\u0440\u043e\u0432\u0430\u043b\u0435\u043d" : "Level Failed";
  }

  function getTryAgainText() {
    return resolveUiLanguage() === "ru" ? "\u041f\u043e\u043f\u0440\u043e\u0431\u043e\u0432\u0430\u0442\u044c \u0441\u043d\u043e\u0432\u0430" : "Try again";
  }

  function getCloseText() {
    return resolveUiLanguage() === "ru" ? "\u0417\u0430\u043a\u0440\u044b\u0442\u044c" : "Close";
  }

  function getNotEnoughWildCoinText() {
    return resolveUiLanguage() === "ru" ? "\u041d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 WildCoin" : "Not enough WildCoin";
  }

  function getLivesTitleText() {
    return resolveUiLanguage() === "ru" ? "\u0416\u0438\u0437\u043d\u0438" : "Lives";
  }

  function getMoreLivesTitleText() {
    return "More Lives";
  }

  function getNoMoreLivesTitleText() {
    return "No more lives";
  }

  function getLivesPanelTitleText() {
    if (state.lives <= 0) {
      return state.livesPanelSource === "start" ? getNoMoreLivesTitleText() : getMoreLivesTitleText();
    }
    return getLivesTitleText();
  }

  function getNextLifeLabelText() {
    return resolveUiLanguage() === "ru"
      ? "\u0412\u0440\u0435\u043c\u0435\u043d\u0438 \u0434\u043e \u0441\u043b\u0435\u0434. \u0436\u0438\u0437\u043d\u0438:"
      : "Time until next life:";
  }

  function getLivesFullText() {
    return resolveUiLanguage() === "ru" ? "\u041c\u0410\u041a\u0421" : "FULL";
  }

  function getQuitTitleText() {
    return resolveUiLanguage() === "ru" ? "\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u0443\u0440\u043e\u0432\u043d\u044f?" : "Quit Level?";
  }

  function getQuitWarningText() {
    return resolveUiLanguage() === "ru" ? "\u0422\u044b \u043f\u043e\u0442\u0435\u0440\u044f\u0435\u0448\u044c \u0436\u0438\u0437\u043d\u044c!" : "You will lose a life!";
  }

  function getQuitButtonText() {
    return resolveUiLanguage() === "ru" ? "\u0412\u042b\u0419\u0422\u0418" : "QUIT";
  }

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
    state.wildCoin = parseWildCoin(value);
    try {
      window.dispatchEvent(
        new CustomEvent("match:wildcoin-update", {
          detail: { wildCoin: value }
        })
      );
    } catch {}
  }

  function writeWildCoin(value) {
    const nextValue = parseWildCoin(value);
    let wrote = false;
    STORAGE_KEYS.forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        localStorage.setItem(key, JSON.stringify({ ...(parsed || {}), wildCoin: nextValue }));
        wrote = true;
      } catch {}
    });
    if (!wrote) {
      try {
        localStorage.setItem(STORAGE_KEYS[0], JSON.stringify({ wildCoin: nextValue }));
      } catch {}
    }
    emitWildCoin(nextValue);
    scheduleMatchStateSave();
    return nextValue;
  }

  function getPrizeDef(prizeId) {
    return SHELF_PRIZE_DEFS.find((item) => item.id === prizeId) || null;
  }

  function readPrizeTickets() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRIZE_TICKETS_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writePrizeTickets() {
    try {
      localStorage.setItem(PRIZE_TICKETS_STORAGE_KEY, JSON.stringify(state.prizeTickets || {}));
    } catch {}
    scheduleMatchStateSave();
  }

  function hasPrizeTicket(prizeId) {
    return getPrizeTicketCount(prizeId) > 0;
  }

  function getPrizeTicketCount(prizeId) {
    const raw = state.prizeTickets?.[prizeId];
    if (raw === true) return 1;
    const count = Math.max(0, Math.round(Number(raw) || 0));
    return Number.isFinite(count) ? count : 0;
  }

  function getTelegramInitData() {
    try {
      return String(window.Telegram?.WebApp?.initData || "").trim();
    } catch {
      return "";
    }
  }

  function getTelegramUserId() {
    try {
      const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      return id === undefined || id === null ? "" : String(id).trim();
    } catch {
      return "";
    }
  }

  function getMatchStateSnapshot() {
    return {
      wildCoin: readWildCoin(),
      tickets: {
        "lol-pop": getPrizeTicketCount("lol-pop"),
        "pool-float": getPrizeTicketCount("pool-float"),
        "snoop-dogg": getPrizeTicketCount("snoop-dogg"),
        "jolly-chimp": getPrizeTicketCount("jolly-chimp")
      }
    };
  }

  function applyMatchStateSnapshot(snapshot = {}) {
    const tickets = snapshot?.tickets || {};
    const nextTickets = {
      "lol-pop": getPrizeTicketCountFromValue(tickets["lol-pop"]),
      "pool-float": getPrizeTicketCountFromValue(tickets["pool-float"]),
      "snoop-dogg": getPrizeTicketCountFromValue(tickets["snoop-dogg"]),
      "jolly-chimp": getPrizeTicketCountFromValue(tickets["jolly-chimp"])
    };

    state.prizeTickets = nextTickets;
    try {
      localStorage.setItem(PRIZE_TICKETS_STORAGE_KEY, JSON.stringify(nextTickets));
    } catch {}

    const wildCoin = parseWildCoin(snapshot?.wildCoin ?? snapshot?.wildcoin ?? snapshot?.wildcoinBalance);
    const nextValue = writeWildCoin(wildCoin);
    emitWildCoin(nextValue);
    syncPrizeTickets();
  }

  function getParticipantsCount(prizeId) {
    const fallback = DEFAULT_GIVEAWAY_PARTICIPANTS[prizeId] || 0;
    const raw = state.giveawayParticipants?.[prizeId];
    const value = Math.max(0, Math.round(Number(raw ?? fallback) || 0));
    return Number.isFinite(value) ? value : fallback;
  }

  function applyMatchGiveawayStats(stats = {}) {
    const source = stats?.participants || stats?.giveaways || stats || {};
    const next = { ...DEFAULT_GIVEAWAY_PARTICIPANTS };
    SHELF_PRIZE_DEFS.forEach((def) => {
      next[def.id] = Math.max(0, Math.round(Number(source?.[def.id] ?? next[def.id]) || 0));
    });
    state.giveawayParticipants = next;
    syncGiveawayParticipants();
  }

  function getPrizeTicketCountFromValue(value) {
    if (value === true) return 1;
    const count = Math.max(0, Math.round(Number(value) || 0));
    return Number.isFinite(count) ? count : 0;
  }

  async function loadMatchStateFromServer() {
    const initData = getTelegramInitData();
    const userId = getTelegramUserId();
    if (!initData || !userId) return;

    try {
      const response = await fetch(`${MATCH_STATE_ENDPOINT}?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
        headers: { "x-telegram-init-data": initData }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) return;
      applyMatchStateSnapshot(payload.state || {});
      applyMatchGiveawayStats(payload.giveaways || {});
      state.matchStateLoaded = true;
    } catch (error) {
      console.warn("[Match] Failed to load state:", error?.message || error);
    }
  }

  function scheduleMatchStateSave() {
    const initData = getTelegramInitData();
    const userId = getTelegramUserId();
    if (!initData || !userId) return;
    if (state.matchStateSaveTimer) clearTimeout(state.matchStateSaveTimer);
    state.matchStateSaveTimer = window.setTimeout(() => {
      state.matchStateSaveTimer = 0;
      saveMatchStateToServer();
    }, 220);
  }

  async function saveMatchStateToServer() {
    const initData = getTelegramInitData();
    const userId = getTelegramUserId();
    if (!initData || !userId) return;

    try {
      await fetch(MATCH_STATE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData
        },
        body: JSON.stringify({
          userId,
          ...getMatchStateSnapshot()
        })
      });
    } catch (error) {
      console.warn("[Match] Failed to save state:", error?.message || error);
    }
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
        <section class="match-screen" aria-label="Match">
          <section class="match-home" data-match-home>
            <div class="match-home__shelf-gift" aria-label="Lol Pop gift preview">
              <img class="match-home__shelf-gift-img is-active" data-match-shelf-gift-a alt="" aria-hidden="true" draggable="false" />
              <img class="match-home__shelf-gift-img" data-match-shelf-gift-b alt="" aria-hidden="true" draggable="false" />
              <button class="match-home__shelf-price" type="button" data-match-prize-price="lol-pop" aria-label="Lol Pop ticket">
                <span data-match-prize-price-text>100</span>
                <img src="${WILDCOIN_IMAGE}" alt="" draggable="false" />
              </button>
              <span class="match-home__shelf-ticket" data-match-prize-ticket="lol-pop" aria-hidden="true" hidden>
                <img src="${TICKET_IMAGE}" alt="" draggable="false" />
                <span class="match-home__shelf-ticket-count" data-match-prize-ticket-count>1</span>
              </span>
              <span class="match-home__participants" data-match-participants="lol-pop" aria-hidden="true">
                <span class="match-home__participants-count" data-match-participants-count>128</span>
                <img src="${PARTICIPANTS_IMAGE}" alt="" draggable="false" />
              </span>
            </div>
            <div class="match-home__shelf-gift match-home__shelf-gift--pool-float" aria-label="Pool Float gift preview">
              <img class="match-home__shelf-gift-img is-active" data-match-pool-float-gift-a alt="" aria-hidden="true" draggable="false" />
              <img class="match-home__shelf-gift-img" data-match-pool-float-gift-b alt="" aria-hidden="true" draggable="false" />
              <button class="match-home__shelf-price" type="button" data-match-prize-price="pool-float" aria-label="Pool Float ticket">
                <span data-match-prize-price-text>100</span>
                <img src="${WILDCOIN_IMAGE}" alt="" draggable="false" />
              </button>
              <span class="match-home__shelf-ticket" data-match-prize-ticket="pool-float" aria-hidden="true" hidden>
                <img src="${TICKET_IMAGE}" alt="" draggable="false" />
                <span class="match-home__shelf-ticket-count" data-match-prize-ticket-count>1</span>
              </span>
              <span class="match-home__participants" data-match-participants="pool-float" aria-hidden="true">
                <span class="match-home__participants-count" data-match-participants-count>96</span>
                <img src="${PARTICIPANTS_IMAGE}" alt="" draggable="false" />
              </span>
            </div>
            <div class="match-home__shelf-gift match-home__shelf-gift--snoop-dogg" aria-label="Snoop Dogg gift preview">
              <img class="match-home__shelf-gift-img is-active" data-match-snoop-dogg-gift-a alt="" aria-hidden="true" draggable="false" />
              <img class="match-home__shelf-gift-img" data-match-snoop-dogg-gift-b alt="" aria-hidden="true" draggable="false" />
              <button class="match-home__shelf-price" type="button" data-match-prize-price="snoop-dogg" aria-label="Snoop Dogg ticket">
                <span data-match-prize-price-text>150</span>
                <img src="${WILDCOIN_IMAGE}" alt="" draggable="false" />
              </button>
              <span class="match-home__shelf-ticket" data-match-prize-ticket="snoop-dogg" aria-hidden="true" hidden>
                <img src="${TICKET_IMAGE}" alt="" draggable="false" />
                <span class="match-home__shelf-ticket-count" data-match-prize-ticket-count>1</span>
              </span>
              <span class="match-home__participants" data-match-participants="snoop-dogg" aria-hidden="true">
                <span class="match-home__participants-count" data-match-participants-count>74</span>
                <img src="${PARTICIPANTS_IMAGE}" alt="" draggable="false" />
              </span>
            </div>
            <div class="match-home__shelf-gift match-home__shelf-gift--jolly-chimp" aria-label="Jolly Chimp gift preview">
              <img class="match-home__shelf-gift-img is-active" data-match-jolly-chimp-gift-a alt="" aria-hidden="true" draggable="false" />
              <img class="match-home__shelf-gift-img" data-match-jolly-chimp-gift-b alt="" aria-hidden="true" draggable="false" />
              <button class="match-home__shelf-price" type="button" data-match-prize-price="jolly-chimp" aria-label="Jolly Chimp ticket">
                <span data-match-prize-price-text>200</span>
                <img src="${WILDCOIN_IMAGE}" alt="" draggable="false" />
              </button>
              <span class="match-home__shelf-ticket" data-match-prize-ticket="jolly-chimp" aria-hidden="true" hidden>
                <img src="${TICKET_IMAGE}" alt="" draggable="false" />
                <span class="match-home__shelf-ticket-count" data-match-prize-ticket-count>1</span>
              </span>
              <span class="match-home__participants" data-match-participants="jolly-chimp" aria-hidden="true">
                <span class="match-home__participants-count" data-match-participants-count>52</span>
                <img src="${PARTICIPANTS_IMAGE}" alt="" draggable="false" />
              </span>
            </div>
            <button class="match-home__play" type="button" data-match-open-level aria-label="Play">
              <img data-match-play-image src="${PLAY_BUTTON}" alt="" aria-hidden="true" draggable="false" />
              <span class="match-home__play-text" data-match-play-text>Play</span>
            </button>
            <section class="match-level-panel" data-match-level-panel hidden aria-label="Level details">
              <div class="match-level-card">
                <button class="match-level-card__close" type="button" data-match-level-close aria-label="Close">
                  <img src="${CLOSE_BUTTON}" alt="" aria-hidden="true" draggable="false" />
                </button>
                <h2 class="match-level-card__title" data-match-level-title>Level 1</h2>
                <div class="match-level-card__body">
                  <div class="match-level-goal">
                    <div class="match-level-goal__title" data-match-goal-title>Goal</div>
                    <div class="match-level-goal__targets" data-match-level-targets aria-hidden="true"></div>
                  </div>
                </div>
                <button class="match-home__play match-home__play--level" type="button" data-match-start aria-label="Play">
                  <img data-match-play-image src="${PLAY_BUTTON}" alt="" aria-hidden="true" draggable="false" />
                  <span class="match-home__play-text" data-match-play-text>Play</span>
                </button>
              </div>
            </section>
            <section class="match-level-panel match-economy-panel" data-match-economy-panel hidden aria-label="WildCoin exchange">
              <div class="match-level-card match-economy-card">
                <button class="match-level-card__close" type="button" data-match-economy-close aria-label="Close">
                  <img src="${CLOSE_BUTTON}" alt="" aria-hidden="true" draggable="false" />
                </button>
                <h2 class="match-economy-card__title">WildCoin</h2>
                <div class="match-economy-card__content">
                  <div class="match-economy-card__item">
                    <img src="${WILDCOIN_IMAGE}" alt="" aria-hidden="true" draggable="false" />
                  </div>
                  <div class="match-economy-card__arrow" aria-hidden="true">&rarr;</div>
                  <div class="match-economy-card__item">
                    <img src="${TICKET_IMAGE}" alt="" aria-hidden="true" draggable="false" />
                  </div>
                </div>
                <p class="match-economy-card__hint" data-match-economy-hint>${getEconomyHintText()}</p>
              </div>
            </section>
            <section class="match-level-panel match-lives-panel" data-match-lives-panel hidden aria-label="Lives">
              <div class="match-level-card match-economy-card match-lives-card">
                <button class="match-level-card__close" type="button" data-match-lives-close aria-label="Close">
                  <img src="${CLOSE_BUTTON}" alt="" aria-hidden="true" draggable="false" />
                </button>
                <h2 class="match-lives-card__title" data-match-lives-title>${getLivesPanelTitleText()}</h2>
                <div class="match-lives-card__icon" aria-hidden="true">
                  <img src="${HEART_IMAGE}" alt="" draggable="false" />
                  <span class="match-lives-card__count" data-match-lives-count>0</span>
                </div>
                <div class="match-lives-card__timer">
                  <div class="match-lives-card__timer-label" data-match-lives-hint>${getNextLifeLabelText()}</div>
                  <div class="match-lives-card__timer-value" data-match-lives-time>00:00</div>
                </div>
              </div>
            </section>
            <section class="match-level-panel match-prize-panel" data-match-prize-panel hidden aria-label="Ticket purchase">
              <div class="match-level-card match-economy-card match-prize-card">
                <button class="match-level-card__close" type="button" data-match-prize-close aria-label="Close">
                  <img src="${CLOSE_BUTTON}" alt="" aria-hidden="true" draggable="false" />
                </button>
                <h2 class="match-economy-card__title" data-match-prize-title>${getPrizeTitleText()}</h2>
                <div class="match-prize-card__ticket">
                  <img src="${TICKET_IMAGE}" alt="" aria-hidden="true" draggable="false" />
                </div>
                <div class="match-prize-card__price" aria-hidden="true">
                  <span data-match-prize-panel-price>100</span>
                  <img src="${WILDCOIN_IMAGE}" alt="" draggable="false" />
                </div>
                <p class="match-economy-card__hint match-prize-card__hint" data-match-prize-hint>${getPrizeHintText()}</p>
                <button class="match-prize-card__buy" type="button" data-match-prize-buy>${getPrizeBuyText()}</button>
              </div>
            </section>
          </section>
          <section class="match-game" data-match-game hidden aria-label="Match Level 1">
            <div class="match-game__hud" aria-label="Level status">
              <section class="match-game__hud-panel match-game__hud-panel--moves" aria-label="Moves">
                <div class="match-game__hud-title" data-match-moves-title>Moves</div>
                <div class="match-game__hud-body match-game__hud-body--moves">
                  <span class="match-game__moves-value" data-match-moves>15</span>
                </div>
              </section>
              <section class="match-game__hud-panel match-game__hud-panel--target" aria-label="Target">
                <div class="match-game__hud-title" data-match-target-title>Target</div>
                <div class="match-game__hud-body match-game__hud-body--target" data-match-targets></div>
              </section>
            </div>
            <div class="match-game__center">
              <div class="match-game__play-area">
                <div class="match-game__board-wrap">
                  <div class="match-game__board" data-match-board role="grid" aria-label="Match board"></div>
                  <div class="match-game__particles" data-match-particles aria-hidden="true"></div>
                </div>
                <button class="match-game__close" type="button" data-match-close aria-label="Quit Match">
                  <img src="${QUIT_BUTTON}" alt="" aria-hidden="true" draggable="false" />
                </button>
              </div>
            </div>
            <div class="match-out-of-moves" data-match-out-of-moves hidden aria-live="polite" aria-atomic="true">
              ${getOutOfMovesText()}
            </div>
            <section class="match-level-panel match-quit-panel" data-match-quit-panel hidden aria-label="Quit level">
              <div class="match-level-card match-quit-card">
                <button class="match-level-card__close" type="button" data-match-quit-close aria-label="Close">
                  <img src="${CLOSE_BUTTON}" alt="" aria-hidden="true" draggable="false" />
                </button>
                <h2 class="match-level-card__title match-quit-card__title" data-match-quit-title>${getQuitTitleText()}</h2>
                <div class="match-quit-card__body">
                  <img class="match-quit-card__heart" src="${BROKEN_HEART_IMAGE}" alt="" aria-hidden="true" draggable="false" />
                  <p class="match-quit-card__warning" data-match-quit-warning>${getQuitWarningText()}</p>
                  <button class="match-quit-card__confirm" type="button" data-match-quit-confirm aria-label="Quit Level">
                    ${getQuitButtonText()}
                  </button>
                </div>
              </div>
            </section>
            <section class="match-level-panel match-win-panel" data-match-win-panel hidden aria-label="Level complete">
              <div class="match-win-card">
                <h2 class="match-win-card__title" data-match-win-title>${getWellDoneText()}</h2>
                <div class="match-win-card__reward" aria-hidden="true">
                  <div class="match-win-card__rays">
                    ${Array.from({ length: 10 }, (_, i) => `<span style="--i:${i}"></span>`).join("")}
                  </div>
                  <img class="match-win-card__pillow" src="${PILLOW_IMAGE}" alt="" draggable="false" />
                  <div class="match-win-card__coin-wrap">
                    <img class="match-win-card__coin" data-match-win-coin src="${WILDCOIN_IMAGE}" alt="" draggable="false" />
                    <span class="match-win-card__amount" data-match-win-reward>10</span>
                  </div>
                </div>
                <button class="match-win-card__continue" type="button" data-match-win-continue>${getContinueText()}</button>
              </div>
            </section>
            <section class="match-level-panel match-fail-panel" data-match-fail-panel hidden aria-label="Level failed">
              <div class="match-level-card match-fail-card">
                <button class="match-level-card__close match-fail-card__close" type="button" data-match-fail-close aria-label="${getCloseText()}">
                  <img src="${PANEL_CLOSE_BUTTON}" alt="" aria-hidden="true" draggable="false" />
                </button>
                <h2 class="match-level-card__title match-fail-card__level" data-match-fail-level>${getLevelText()}</h2>
                <div class="match-fail-card__body">
                  <div class="match-fail-card__status-row">
                    <div class="match-fail-card__status" data-match-fail-status>${getLevelFailedText()}</div>
                    <img class="match-fail-card__heart" src="${BROKEN_HEART_IMAGE}" alt="" aria-hidden="true" draggable="false" />
                  </div>
                  <div class="match-fail-card__goal" data-match-fail-targets aria-hidden="true"></div>
                  <button class="match-fail-card__retry" type="button" data-match-fail-retry>${getTryAgainText()}</button>
                </div>
              </div>
            </section>
          </section>
        </section>
      `;
    }

    return page;
  }

  function preloadMatchAssets() {
    const srcList = [
      MAIN_BG,
      LEVEL_BG,
      MATCH_LOGO,
      BOOM_IMAGE,
      PLAY_BUTTON,
      CLOSE_BUTTON,
      PANEL_CLOSE_BUTTON,
      QUIT_BUTTON,
      BROKEN_HEART_IMAGE,
      HEART_IMAGE,
      WILDCOIN_IMAGE,
      TICKET_IMAGE,
      PARTICIPANTS_IMAGE,
      PILLOW_IMAGE,
      BOMB_ITEM.src,
      ...ITEM_DEFS.map((item) => item.src)
    ];
    srcList.forEach((src) => {
      const probe = new Image();
      probe.decoding = "async";
      probe.src = src;
    });
  }

  function inBounds(row, col) {
    return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function parseCellKey(key) {
    const parts = String(key || "").split(":");
    return { row: Number(parts[0]), col: Number(parts[1]) };
  }

  function randomItemId() {
    const index = Math.floor(Math.random() * ITEM_DEFS.length);
    return ITEM_DEFS[index]?.id || ITEM_DEFS[0].id;
  }

  function createCell(kind = randomItemId()) {
    return { kind };
  }

  function createLevelTargets() {
    return LEVEL_TARGETS.map((target) => ({
      kind: target.kind,
      remaining: Math.max(0, Math.round(Number(target.count) || 0))
    }));
  }

  function isBombKind(kind) {
    return String(kind || "") === BOMB_ITEM.id;
  }

  function createInitialBoard() {
    const board = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null));

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        let kind = randomItemId();
        while (
          (col >= 2 &&
            board[row][col - 1] &&
            board[row][col - 2] &&
            board[row][col - 1].kind === kind &&
            board[row][col - 2].kind === kind) ||
          (row >= 2 &&
            board[row - 1][col] &&
            board[row - 2][col] &&
            board[row - 1][col].kind === kind &&
            board[row - 2][col].kind === kind)
        ) {
          kind = randomItemId();
        }
        board[row][col] = createCell(kind);
      }
    }

    if (findMatchClusters(board).length > 0) {
      return createInitialBoard();
    }

    if (!boardHasPossibleMove(board)) {
      return createInitialBoard();
    }

    return board;
  }

  function boardHasPossibleMove(board) {
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const here = board[row][col];
        if (!here) continue;

        const neighbors = [
          { row, col: col + 1 },
          { row: row + 1, col }
        ];

        for (const next of neighbors) {
          if (!inBounds(next.row, next.col)) continue;
          const there = board[next.row][next.col];
          if (!there) continue;

          if (isBombKind(here.kind) || isBombKind(there.kind)) return true;
          swapCells(board, { row, col }, next);
          const hasMatch = findMatchClusters(board).length > 0;
          swapCells(board, { row, col }, next);
          if (hasMatch) return true;
        }
      }
    }
    return false;
  }

  function clearHintTimer() {
    if (!state.hintTimer) return;
    clearTimeout(state.hintTimer);
    state.hintTimer = 0;
  }

  function clearHint({ rerender = false } = {}) {
    const hadHint = !!state.hintPair;
    state.hintPair = null;
    if (hadHint && rerender && !state.busy) renderBoard();
  }

  function registerPlayerInteraction({ rerenderHint = false } = {}) {
    clearHintTimer();
    const hadHint = !!state.hintPair;
    clearHint({ rerender: rerenderHint });
    if (hadHint && !rerenderHint) {
      clearBoardUiState({ hint: true });
    }
  }

  function findHintMove(board) {
    const hints = [];

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const here = board[row][col];
        if (!here) continue;

        const neighbors = [
          { row, col: col + 1 },
          { row: row + 1, col }
        ];

        for (const next of neighbors) {
          if (!inBounds(next.row, next.col)) continue;
          const there = board[next.row][next.col];
          if (!there) continue;

          if (isBombKind(here.kind) || isBombKind(there.kind)) {
            hints.push({ a: { row, col }, b: { row: next.row, col: next.col } });
            continue;
          }

          swapCells(board, { row, col }, next);
          const hasMatch = findMatchClusters(board).length > 0;
          swapCells(board, { row, col }, next);
          if (hasMatch) {
            hints.push({ a: { row, col }, b: { row: next.row, col: next.col } });
          }
        }
      }
    }

    if (!hints.length) return null;
    return hints[Math.floor(Math.random() * hints.length)] || hints[0] || null;
  }

  function scheduleHint() {
    clearHintTimer();
    if (state.game?.hidden || state.busy) return;

    state.hintTimer = window.setTimeout(() => {
      state.hintTimer = 0;
      if (state.game?.hidden || state.busy || state.selected) {
        scheduleHint();
        return;
      }
      const hint = findHintMove(state.board);
      if (!hint) return;
      state.hintPair = hint;
      renderBoard();
    }, HINT_IDLE_MS);
  }

  function swapCells(board, a, b) {
    const tmp = board[a.row][a.col];
    board[a.row][a.col] = board[b.row][b.col];
    board[b.row][b.col] = tmp;
  }

  function findMatchClusters(board) {
    const matched = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => false));

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      let start = 0;
      while (start < BOARD_COLS) {
        const base = board[row][start];
        let end = start + 1;
        while (end < BOARD_COLS && board[row][end] && base && board[row][end].kind === base.kind) {
          end += 1;
        }
        if (base && end - start >= MATCH_MIN) {
          for (let col = start; col < end; col += 1) matched[row][col] = true;
        }
        start = end;
      }
    }

    for (let col = 0; col < BOARD_COLS; col += 1) {
      let start = 0;
      while (start < BOARD_ROWS) {
        const base = board[start][col];
        let end = start + 1;
        while (end < BOARD_ROWS && board[end][col] && base && board[end][col].kind === base.kind) {
          end += 1;
        }
        if (base && end - start >= MATCH_MIN) {
          for (let row = start; row < end; row += 1) matched[row][col] = true;
        }
        start = end;
      }
    }

    for (let row = 0; row < BOARD_ROWS - 1; row += 1) {
      for (let col = 0; col < BOARD_COLS - 1; col += 1) {
        const a = board[row][col];
        const b = board[row][col + 1];
        const c = board[row + 1][col];
        const d = board[row + 1][col + 1];
        if (!a || !b || !c || !d) continue;
        if (a.kind !== b.kind || a.kind !== c.kind || a.kind !== d.kind) continue;
        matched[row][col] = true;
        matched[row][col + 1] = true;
        matched[row + 1][col] = true;
        matched[row + 1][col + 1] = true;
      }
    }

    const visited = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => false));
    const clusters = [];

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        if (!matched[row][col] || visited[row][col] || !board[row][col]) continue;

        const kind = board[row][col].kind;
        const queue = [{ row, col }];
        const cells = [];
        visited[row][col] = true;

        while (queue.length) {
          const node = queue.pop();
          if (!node) continue;
          cells.push(node);

          const neighbors = [
            { row: node.row - 1, col: node.col },
            { row: node.row + 1, col: node.col },
            { row: node.row, col: node.col - 1 },
            { row: node.row, col: node.col + 1 }
          ];

          for (const n of neighbors) {
            if (!inBounds(n.row, n.col) || visited[n.row][n.col] || !matched[n.row][n.col]) continue;
            const neighborCell = board[n.row][n.col];
            if (!neighborCell || neighborCell.kind !== kind) continue;
            visited[n.row][n.col] = true;
            queue.push(n);
          }
        }

        if (cells.length) clusters.push({ kind, cells });
      }
    }

    return clusters;
  }

  function isAdjacent(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }

  function getTileEl(row, col) {
    return state.boardEl?.querySelector?.(`[data-row="${row}"][data-col="${col}"]`) || null;
  }

  function clearBoardUiState({ hint = false, selected = false } = {}) {
    if (!state.boardEl) return;
    const selectors = [];
    if (hint) selectors.push(".match-game__tile.is-hint");
    if (selected) selectors.push(".match-game__tile.is-selected");
    if (!selectors.length) return;
    state.boardEl.querySelectorAll(selectors.join(",")).forEach((tile) => {
      if (hint) tile.classList.remove("is-hint");
      if (selected) tile.classList.remove("is-selected");
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitNextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function cancelElementAnimations(el) {
    if (!el?.getAnimations) return;
    el.getAnimations().forEach((animation) => {
      try { animation.cancel(); } catch {}
    });
  }

  async function animateSwapTilesFallback(aEl, bEl, dx, dy) {
    aEl.style.setProperty("--swap-x", `${dx}px`);
    aEl.style.setProperty("--swap-y", `${dy}px`);
    bEl.style.setProperty("--swap-x", `${-dx}px`);
    bEl.style.setProperty("--swap-y", `${-dy}px`);
    await waitNextFrame();
    aEl.classList.add("is-swapping--fallback");
    bEl.classList.add("is-swapping--fallback");
    await wait(SWAP_ANIMATION_MS);
  }

  function waitForAnimation(animation) {
    return animation?.finished?.catch?.(() => null) || wait(SWAP_ANIMATION_MS);
  }

  function renderBoard(options = {}) {
    if (!state.boardEl) return;

    const dropMap = options?.dropMap || null;
    const selectedKey = state.selected ? cellKey(state.selected.row, state.selected.col) : "";
    const hintAKey = state.hintPair ? cellKey(state.hintPair.a.row, state.hintPair.a.col) : "";
    const hintBKey = state.hintPair ? cellKey(state.hintPair.b.row, state.hintPair.b.col) : "";
    const canShowHint = !selectedKey && !state.busy && !!state.hintPair;
    const out = [];

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const cell = state.board[row][col];
        if (!cell) continue;
        const item = ITEM_BY_ID[cell.kind] || ITEM_DEFS[0];
        const tileKey = cellKey(row, col);
        const classes = [
          "match-game__tile",
          selectedKey === tileKey ? "is-selected" : "",
          canShowHint && (tileKey === hintAKey || tileKey === hintBKey) ? "is-hint" : "",
          dropMap && Number(dropMap[tileKey] || 0) > 0 ? "is-dropping" : "",
          isBombKind(cell.kind) ? "is-bomb" : ""
        ]
          .filter(Boolean)
          .join(" ");
        const dropDistance = dropMap ? Math.max(0, Number(dropMap[tileKey] || 0)) : 0;
        const styleAttr = dropDistance > 0 ? ` style="--drop-distance:${dropDistance};"` : "";

        out.push(`
          <button class="${classes}" type="button" data-row="${row}" data-col="${col}" aria-label="${item.id}"${styleAttr}>
            <img src="${item.src}" alt="" draggable="false" />
          </button>
        `);
      }
    }

    state.boardEl.innerHTML = out.join("");
  }

  function renderHud() {
    if (state.hudMovesValue) {
      state.hudMovesValue.textContent = String(Math.max(0, state.movesLeft));
    }
    if (!state.hudTargets) return;

    state.hudTargets.innerHTML = state.targets
      .map((target) => {
        const item = ITEM_BY_ID[target.kind] || ITEM_DEFS[0];
        const remaining = Math.max(0, Math.round(Number(target.remaining) || 0));
        return `
          <div class="match-game__target-item" data-match-target-kind="${item.id}">
            <img class="match-game__target-icon" src="${item.src}" alt="" aria-hidden="true" draggable="false" />
            <span class="match-game__target-count">${remaining}</span>
          </div>
        `;
      })
      .join("");
  }

  function getLevelTargetsMarkup() {
    return LEVEL_TARGETS.map((target) => {
      const item = ITEM_BY_ID[target.kind] || ITEM_DEFS[0];
      const count = Math.max(0, Math.round(Number(target.count) || 0));
      return `
        <div class="match-level-goal__target">
          <img src="${item.src}" alt="" aria-hidden="true" draggable="false" />
          <span>${count}</span>
        </div>
      `;
    }).join("");
  }

  function renderLevelTargetsPreview() {
    if (!state.levelTargetsPreview) return;
    state.levelTargetsPreview.innerHTML = getLevelTargetsMarkup();
  }

  function renderFailedTargetsPreview() {
    if (!state.failTargets) return;
    state.failTargets.innerHTML = getLevelTargetsMarkup();
  }

  function setSmartText(node, text, { longAt = 12, veryLongAt = 18 } = {}) {
    if (!node) return;
    const value = String(text || "");
    const compactLength = value.replace(/\s+/g, "").length;
    node.textContent = value;
    node.classList.toggle("is-long-text", compactLength >= longAt);
    node.classList.toggle("is-very-long-text", compactLength >= veryLongAt);
  }

  function resetLevelHud() {
    state.movesLeft = LEVEL_MOVES;
    state.targets = createLevelTargets();
    renderHud();
  }

  function countMove() {
    state.movesLeft = Math.max(0, state.movesLeft - 1);
    renderHud();
  }

  function applyTargetClears(cells) {
    if (!Array.isArray(cells) || !cells.length || !state.targets.length) return;
    let changed = false;
    cells.forEach((cell) => {
      const target = state.targets.find((item) => item.kind === cell?.kind && item.remaining > 0);
      if (!target) return;
      target.remaining = Math.max(0, target.remaining - 1);
      changed = true;
    });
    if (changed) renderHud();
  }

  function areTargetsComplete() {
    return Array.isArray(state.targets) &&
      state.targets.length > 0 &&
      state.targets.every((target) => Math.max(0, Math.round(Number(target.remaining) || 0)) <= 0);
  }

  function getTargetHits(cells) {
    if (!Array.isArray(cells) || !cells.length || !state.targets.length) return [];
    const remainingByKind = new Map(
      state.targets.map((target) => [target.kind, Math.max(0, Math.round(Number(target.remaining) || 0))])
    );
    const hits = [];
    cells.forEach((cell) => {
      const left = remainingByKind.get(cell?.kind) || 0;
      if (left <= 0) return;
      remainingByKind.set(cell.kind, left - 1);
      hits.push(cell);
    });
    return hits;
  }

  function pulseTarget(kind) {
    const target = state.hudTargets?.querySelector?.(`[data-match-target-kind="${kind}"]`);
    if (!target) return;
    target.classList.remove("is-collecting");
    void target.offsetWidth;
    target.classList.add("is-collecting");
    window.setTimeout(() => target.classList.remove("is-collecting"), 520);
  }

  function animateTargetCollect(cells, options = {}) {
    if (!state.boardEl || !state.hudTargets) return;
    const hits = Array.isArray(options.hits) ? options.hits : getTargetHits(cells);
    if (!hits.length) return;

    hits.forEach((cell, index) => {
      const tile = getTileEl(cell.row, cell.col);
      const target = state.hudTargets.querySelector?.(`[data-match-target-kind="${cell.kind}"] .match-game__target-icon`);
      const item = ITEM_BY_ID[cell.kind];
      if (!tile || !target || !item) return;

      const tileRect = tile.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (!tileRect.width || !targetRect.width) return;

      const startX = tileRect.left + tileRect.width / 2;
      const startY = tileRect.top + tileRect.height / 2;
      const endX = targetRect.left + targetRect.width / 2;
      const endY = targetRect.top + targetRect.height / 2;
      const distance = Math.hypot(endX - startX, endY - startY);
      const liftY = -Math.max(12, Math.min(26, tileRect.height * 0.34));
      const midX = startX + (endX - startX) * 0.56 + randomFloat(-14, 14);
      const midY = Math.min(startY, endY) - Math.max(42, Math.min(94, distance * 0.2));
      const size = Math.max(24, Math.min(tileRect.width, tileRect.height) * 0.76);
      const flyer = document.createElement("img");
      flyer.className = "match-target-flyer";
      flyer.src = item.src;
      flyer.alt = "";
      flyer.setAttribute("aria-hidden", "true");
      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;
      flyer.style.width = `${size}px`;
      flyer.style.height = `${size}px`;
      document.body.appendChild(flyer);

      const delay = Math.min(220, index * 38);
      const animation = flyer.animate(
        [
          {
            transform: "translate(-50%, -50%) scale(.82)",
            opacity: 0,
            filter: "drop-shadow(0 6px 8px rgba(0,0,0,.16))",
            offset: 0
          },
          {
            transform: `translate(-50%, -50%) translate(${randomFloat(-4, 4).toFixed(1)}px, ${liftY.toFixed(1)}px) scale(1.08)`,
            opacity: 1,
            filter: "drop-shadow(0 9px 12px rgba(255,231,122,.38))",
            offset: 0.16
          },
          {
            transform: `translate(-50%, -50%) translate(${(midX - startX).toFixed(1)}px, ${(midY - startY).toFixed(1)}px) scale(.94)`,
            opacity: 1,
            filter: "drop-shadow(0 10px 14px rgba(255,231,122,.42))",
            offset: 0.7
          },
          {
            transform: `translate(-50%, -50%) translate(${(endX - startX).toFixed(1)}px, ${(endY - startY).toFixed(1)}px) scale(.42)`,
            opacity: 0.16,
            filter: "drop-shadow(0 0 16px rgba(255,241,170,.85))"
          }
        ],
        {
          duration: Math.max(620, Math.min(840, distance * 1.35)),
          delay,
          easing: "cubic-bezier(.22,.78,.16,1)",
          fill: "forwards"
        }
      );
      animation.onfinish = () => {
        flyer.remove();
        pulseTarget(cell.kind);
      };
    });
  }

  function explodeBombArea(seed, clearSet, processedBombs) {
    const detonations = [];
    const queue = Array.isArray(seed) ? seed.slice() : [seed];
    while (queue.length) {
      const node = queue.pop();
      if (!node || !inBounds(node.row, node.col)) continue;
      const bombKey = cellKey(node.row, node.col);
      if (processedBombs.has(bombKey)) continue;

      const bombCell = state.board[node.row]?.[node.col];
      if (!isBombKind(bombCell?.kind)) continue;
      processedBombs.add(bombKey);
      playBoomOverlay(getBombBlastCells(node.row, node.col));

      const blastCells = getBombBlastCells(node.row, node.col);
      detonations.push({ row: node.row, col: node.col, cells: blastCells });
      for (const point of blastCells) {
        const row = point.row;
        const col = point.col;
        const key = cellKey(row, col);
          clearSet.add(key);
          const candidate = state.board[row]?.[col];
          if (isBombKind(candidate?.kind) && !processedBombs.has(key)) queue.push({ row, col });
      }
    }
    return detonations;
  }

  function getBombBlastCells(row, col) {
    const out = [];
    for (let r = row - BOMB_BLAST_RADIUS; r <= row + BOMB_BLAST_RADIUS; r += 1) {
      for (let c = col - BOMB_BLAST_RADIUS; c <= col + BOMB_BLAST_RADIUS; c += 1) {
        if (!inBounds(r, c)) continue;
        out.push({ row: r, col: c });
      }
    }
    return out;
  }

  function pickBombDropColumn(cluster, swapPair) {
    if (!cluster?.cells?.length) return -1;
    if (swapPair) {
      const first = cluster.cells.find((cell) => cell.row === swapPair.a.row && cell.col === swapPair.a.col);
      if (first && Number.isInteger(first.col)) return first.col;
      const second = cluster.cells.find((cell) => cell.row === swapPair.b.row && cell.col === swapPair.b.col);
      if (second && Number.isInteger(second.col)) return second.col;
    }
    const fallback = cluster.cells[Math.floor(Math.random() * cluster.cells.length)] || null;
    return Number.isInteger(fallback?.col) ? fallback.col : -1;
  }

  function collectTopSpawnCells(candidates = []) {
    const byCol = new Map();
    candidates.forEach((cell) => {
      if (!inBounds(cell?.row, cell?.col)) return;
      const tile = state.board[cell.row]?.[cell.col];
      if (!tile || isBombKind(tile.kind)) return;
      const prev = byCol.get(cell.col);
      if (!prev || cell.row < prev.row) {
        byCol.set(cell.col, { row: cell.row, col: cell.col });
      }
    });
    return Array.from(byCol.values()).sort((a, b) => a.col - b.col);
  }

  function spawnBombsFromTop(candidates = [], preferredCols = []) {
    if (!candidates.length || !preferredCols.length) return 0;
    const topCells = collectTopSpawnCells(candidates);
    if (!topCells.length) return 0;

    const topByCol = new Map(topCells.map((cell) => [cell.col, cell]));
    const usedCols = new Set();
    let spawned = 0;

    const takeCell = (col) => {
      if (!usedCols.has(col) && topByCol.has(col)) {
        return topByCol.get(col);
      }
      return topCells.find((cell) => !usedCols.has(cell.col)) || null;
    };

    preferredCols.forEach((col) => {
      if (!Number.isInteger(col) || col < 0 || col >= BOARD_COLS) return;
      const pick = takeCell(col);
      if (!pick) return;
      usedCols.add(pick.col);
      state.board[pick.row][pick.col].kind = BOMB_ITEM.id;
      spawned += 1;
    });

    return spawned;
  }

  function maybeDropRandomBomb(candidates = []) {
    if (!candidates.length || Math.random() >= RANDOM_BOMB_DROP_CHANCE) return false;
    const topCells = collectTopSpawnCells(candidates);
    if (!topCells.length) return false;
    const pick = topCells[Math.floor(Math.random() * topCells.length)];
    if (!pick) return false;
    state.board[pick.row][pick.col].kind = BOMB_ITEM.id;
    return true;
  }

  function collapseAndRefill() {
    const created = [];
    const dropMap = Object.create(null);

    for (let col = 0; col < BOARD_COLS; col += 1) {
      let writeRow = BOARD_ROWS - 1;
      for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
        const cell = state.board[row][col];
        if (!cell) continue;
        if (writeRow !== row) {
          state.board[writeRow][col] = cell;
          state.board[row][col] = null;
          const movedDistance = writeRow - row;
          if (movedDistance > 0) {
            dropMap[cellKey(writeRow, col)] = movedDistance;
          }
        }
        writeRow -= 1;
      }

      while (writeRow >= 0) {
        state.board[writeRow][col] = createCell();
        created.push({ row: writeRow, col });
        dropMap[cellKey(writeRow, col)] = writeRow + 2;
        writeRow -= 1;
      }
    }

    return { created, dropMap };
  }

  function randomFloat(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function easeOutCubic(t) {
    const x = 1 - clamp01(t);
    return 1 - x * x * x;
  }

  function easeInCubic(t) {
    const x = clamp01(t);
    return x * x * x;
  }

  function animateFragment(fragment, config) {
    const delayMs = Math.max(0, Number(config?.delayMs) || 0);
    const durationMs = Math.max(380, Number(config?.durationMs) || 980);
    const durationSec = durationMs / 1000;
    const endX = Number(config?.endX) || 0;
    const endY = Math.max(0, Number(config?.endY) || 0);
    const initialVy = Math.max(8, Number(config?.initialVy) || 28);
    const swayAmp = Number(config?.swayAmp) || 0;
    const swayCycles = Number(config?.swayCycles) || 1;
    const swayPhase = Number(config?.swayPhase) || 0;
    const rotateEnd = Number(config?.rotateEnd) || 0;
    const scaleStart = Math.max(0.4, Number(config?.scaleStart) || 0.7);
    const scalePeak = Math.max(scaleStart, Number(config?.scalePeak) || 1.02);
    const scaleEnd = Math.max(0.34, Number(config?.scaleEnd) || 0.66);
    const gravity = Math.max(80, (2 * (endY - initialVy * durationSec)) / (durationSec * durationSec));
    const startTime = performance.now() + delayMs;

    const step = (now) => {
      if (!fragment.isConnected) return;
      const elapsed = now - startTime;
      if (elapsed < 0) {
        requestAnimationFrame(step);
        return;
      }

      const t = clamp01(elapsed / durationMs);
      const tSmooth = easeOutCubic(t);
      const wobble = Math.sin((t * swayCycles + swayPhase) * Math.PI * 2);
      const driftX = endX * tSmooth + wobble * swayAmp * (1 - t);
      const timeSec = durationSec * t;
      const driftY = initialVy * timeSec + 0.5 * gravity * timeSec * timeSec;

      const appear = clamp01(t / 0.11);
      const fade = clamp01((t - 0.7) / 0.3);
      const opacity = appear * (1 - easeInCubic(fade));

      const swell = Math.sin(Math.PI * clamp01(t / 0.3)) * (1 - t);
      const scale = lerp(scaleStart, scaleEnd, t) + (scalePeak - scaleStart) * swell;
      const rotate = rotateEnd * (t * (0.82 + 0.18 * t));

      fragment.style.transform = `translate(-50%, -50%) translate(${driftX.toFixed(2)}px, ${driftY.toFixed(
        2
      )}px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      fragment.style.opacity = opacity.toFixed(3);

      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }
      fragment.remove();
    };

    requestAnimationFrame(step);
  }

  function playBoomOverlay(cells) {
    if (!state.particlesEl || !state.boardEl) return;
    const list = Array.isArray(cells) ? cells.filter(Boolean) : [];
    if (!list.length) return;

    const boardRect = state.boardEl.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return;

    const minRow = Math.min(...list.map((x) => x.row));
    const maxRow = Math.max(...list.map((x) => x.row));
    const minCol = Math.min(...list.map((x) => x.col));
    const maxCol = Math.max(...list.map((x) => x.col));

    const cellW = boardRect.width / BOARD_COLS;
    const cellH = boardRect.height / BOARD_ROWS;
    const widthCells = Math.max(1, maxCol - minCol + 1);
    const heightCells = Math.max(1, maxRow - minRow + 1);
    const centerX = (minCol + maxCol + 1) * 0.5 * cellW;
    const centerY = (minRow + maxRow + 1) * 0.5 * cellH;
    const blastSize = Math.max(cellW * widthCells, cellH * heightCells) * 1.16;

    const boom = document.createElement("span");
    boom.className = "match-boom";
    boom.style.left = `${centerX}px`;
    boom.style.top = `${centerY}px`;
    boom.style.width = `${blastSize}px`;
    boom.style.height = `${blastSize}px`;
    boom.style.backgroundImage = `url("${BOOM_IMAGE}")`;
    state.particlesEl.appendChild(boom);
    boom.addEventListener(
      "animationend",
      () => {
        boom.remove();
      },
      { once: true }
    );
  }

  function spawnBombBurstFragments(detonations) {
    if (!state.particlesEl || !state.boardEl) return;
    const bursts = Array.isArray(detonations)
      ? detonations.filter((item) => item && Array.isArray(item.cells) && item.cells.length)
      : [];
    if (!bursts.length) return;

    const boardRect = state.boardEl.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return;

    const cellW = boardRect.width / BOARD_COLS;
    const cellH = boardRect.height / BOARD_ROWS;
    const fragSize = Math.max(7, Math.floor(Math.min(cellW, cellH) * 0.29));
    const pieceCols = 3;
    const pieceRows = 3;

    bursts.forEach((burst) => {
      const centerX = (burst.col + 0.5) * cellW;
      const centerY = (burst.row + 0.5) * cellH;

      burst.cells.forEach((cell) => {
        const source = state.board[cell.row]?.[cell.col];
        const item = ITEM_BY_ID[source?.kind];
        if (!item) return;

        const originX = cell.col * cellW + cellW / 2;
        const originY = cell.row * cellH + cellH / 2;
        const radialX = originX - centerX;
        const radialY = originY - centerY;
        const pieces = isBombKind(source?.kind) ? 7 : 4;

        for (let i = 0; i < pieces; i += 1) {
          const fragment = document.createElement("span");
          fragment.className = "match-fragment match-fragment--bomb";
          fragment.style.left = `${originX + randomFloat(-cellW * 0.2, cellW * 0.2)}px`;
          fragment.style.top = `${originY + randomFloat(-cellH * 0.2, cellH * 0.2)}px`;
          fragment.style.width = `${fragSize}px`;
          fragment.style.height = `${fragSize}px`;
          fragment.style.backgroundImage = `url("${item.src}")`;
          fragment.style.backgroundSize = `${fragSize * pieceCols}px ${fragSize * pieceRows}px`;
          fragment.style.backgroundPosition = `${-Math.floor(Math.random() * pieceCols) * fragSize}px ${-Math.floor(
            Math.random() * pieceRows
          ) * fragSize}px`;

          const driftX = radialX * randomFloat(0.5, 1.38) + randomFloat(-cellW * 1.1, cellW * 1.1);
          const driftY = randomFloat(cellH * 1.35, cellH * 3.1) + Math.max(0, radialY) * randomFloat(0.28, 0.95);

          state.particlesEl.appendChild(fragment);
          animateFragment(fragment, {
            delayMs: randomFloat(0, 60),
            durationMs: randomFloat(760, 1140),
            endX: driftX,
            endY: driftY,
            initialVy: randomFloat(14, cellH * 0.85),
            swayAmp: randomFloat(cellW * 0.03, cellW * 0.2),
            swayCycles: randomFloat(0.65, 1.45),
            swayPhase: randomFloat(-0.5, 0.5),
            rotateEnd: randomFloat(-320, 320),
            scaleStart: randomFloat(0.54, 0.8),
            scalePeak: randomFloat(1.02, 1.22),
            scaleEnd: randomFloat(0.44, 0.84)
          });
        }
      });
    });
  }

  function spawnFragments(cells) {
    if (!state.particlesEl || !state.boardEl || !cells.length) return;

    const boardRect = state.boardEl.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return;

    const cellW = boardRect.width / BOARD_COLS;
    const cellH = boardRect.height / BOARD_ROWS;
    const fragSize = Math.max(6, Math.floor(Math.min(cellW, cellH) * 0.33));
    const pieceCols = 3;
    const pieceRows = 3;

    cells.forEach((cell) => {
      const item = ITEM_BY_ID[cell.kind];
      if (!item) return;

      const originX = cell.col * cellW + cellW / 2;
      const originY = cell.row * cellH + cellH / 2;

      for (let i = 0; i < 10; i += 1) {
        const fragment = document.createElement("span");
        fragment.className = "match-fragment";
        fragment.style.left = `${originX + randomFloat(-cellW * 0.14, cellW * 0.14)}px`;
        fragment.style.top = `${originY + randomFloat(-cellH * 0.14, cellH * 0.14)}px`;
        fragment.style.width = `${fragSize}px`;
        fragment.style.height = `${fragSize}px`;
        fragment.style.backgroundImage = `url("${item.src}")`;
        fragment.style.backgroundSize = `${fragSize * pieceCols}px ${fragSize * pieceRows}px`;
        fragment.style.backgroundPosition = `${-Math.floor(Math.random() * pieceCols) * fragSize}px ${-Math.floor(
          Math.random() * pieceRows
        ) * fragSize}px`;
        const driftX = randomFloat(-cellW * 0.94, cellW * 0.94);
        const dropY = randomFloat(cellH * 1.4, cellH * 3.2);
        const rotateEnd = randomFloat(-260, 260);
        const scaleStart = randomFloat(0.58, 0.78);
        const scalePeak = randomFloat(0.98, 1.16);
        const scaleEnd = randomFloat(0.56, 0.9);

        state.particlesEl.appendChild(fragment);
        animateFragment(fragment, {
          delayMs: randomFloat(0, 54),
          durationMs: randomFloat(900, 1320),
          endX: driftX,
          endY: dropY,
          initialVy: randomFloat(12, cellH * 0.9),
          swayAmp: randomFloat(cellW * 0.02, cellW * 0.15),
          swayCycles: randomFloat(0.6, 1.35),
          swayPhase: randomFloat(-0.45, 0.45),
          rotateEnd,
          scaleStart,
          scalePeak,
          scaleEnd
        });
      }
    });
  }

  function markTilesAsClearing(cells, targetHitKeys = new Set()) {
    cells.forEach((cell) => {
      const tileEl = getTileEl(cell.row, cell.col);
      if (!tileEl) return;
      if (targetHitKeys.has(cellKey(cell.row, cell.col))) {
        tileEl.classList.add("is-target-collecting");
      } else {
        tileEl.classList.add("is-clearing");
      }
    });
  }

  function shakeTiles(cells) {
    cells.forEach((cell) => {
      const tileEl = getTileEl(cell.row, cell.col);
      if (!tileEl) return;
      tileEl.classList.remove("is-invalid");
      void tileEl.offsetWidth;
      tileEl.classList.add("is-invalid");
      setTimeout(() => tileEl.classList.remove("is-invalid"), 260);
    });
  }

  async function animateSwapTiles(a, b) {
    const aEl = getTileEl(a.row, a.col);
    const bEl = getTileEl(b.row, b.col);
    if (!aEl || !bEl) return;

    const aRect = aEl.getBoundingClientRect();
    const bRect = bEl.getBoundingClientRect();
    const dx = bRect.left - aRect.left;
    const dy = bRect.top - aRect.top;

    if (!dx && !dy) return;

    cancelElementAnimations(aEl);
    cancelElementAnimations(bEl);
    aEl.classList.add("is-swapping");
    bEl.classList.add("is-swapping");

    if (!aEl.animate || !bEl.animate) {
      await animateSwapTilesFallback(aEl, bEl, dx, dy);
      return;
    }

    const options = {
      duration: SWAP_ANIMATION_MS,
      easing: SWAP_EASING,
      fill: "forwards"
    };
    try {
      const aAnimation = aEl.animate(
        [
          { transform: "translate3d(0, 0, 0) scale(1)" },
          { transform: `translate3d(${dx * 0.82}px, ${dy * 0.82}px, 0) scale(1.045)`, offset: 0.72 },
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(1)` }
        ],
        options
      );
      const bAnimation = bEl.animate(
        [
          { transform: "translate3d(0, 0, 0) scale(1)" },
          { transform: `translate3d(${-dx * 0.82}px, ${-dy * 0.82}px, 0) scale(1.045)`, offset: 0.72 },
          { transform: `translate3d(${-dx}px, ${-dy}px, 0) scale(1)` }
        ],
        options
      );

      await Promise.all([waitForAnimation(aAnimation), waitForAnimation(bAnimation)]);
    } catch {
      await animateSwapTilesFallback(aEl, bEl, dx, dy);
    }
  }

  async function resolveBoard({ bombSeeds = [], swapPair = null } = {}) {
    let resolved = false;
    let pendingBombSeeds = Array.isArray(bombSeeds) ? bombSeeds.slice() : [];

    while (true) {
      const clusters = findMatchClusters(state.board);
      const hasMatches = clusters.length > 0;
      const clearSet = new Set();

      clusters.forEach((cluster) => {
        cluster.cells.forEach((cell) => clearSet.add(cellKey(cell.row, cell.col)));
      });

      const matchBombSeeds = [];
      clearSet.forEach((key) => {
        const pos = parseCellKey(key);
        const cell = state.board[pos.row]?.[pos.col];
        if (isBombKind(cell?.kind)) matchBombSeeds.push(pos);
      });

      if (!hasMatches && !pendingBombSeeds.length && !matchBombSeeds.length) break;
      resolved = true;

      const explosionSeeds = [...pendingBombSeeds, ...matchBombSeeds];
      const processedBombs = new Set();
      const detonations = explosionSeeds.length ? explodeBombArea(explosionSeeds, clearSet, processedBombs) : [];

      const canCreateBomb = explosionSeeds.length === 0;
      const bombDropCols = [];
      if (canCreateBomb) {
        clusters.forEach((cluster) => {
          if (cluster.cells.length < 4) return;
          const col = pickBombDropColumn(cluster, swapPair);
          if (Number.isInteger(col) && col >= 0 && col < BOARD_COLS) {
            bombDropCols.push(col);
          }
        });
      }

      const cellsToClear = [];
      clearSet.forEach((key) => {
        const pos = parseCellKey(key);
        const cell = state.board[pos.row]?.[pos.col];
        if (!cell) return;
        cellsToClear.push({ row: pos.row, col: pos.col, kind: cell.kind });
      });

      const targetHits = getTargetHits(cellsToClear);
      const targetHitKeys = new Set(targetHits.map((cell) => cellKey(cell.row, cell.col)));
      const fragmentCells = cellsToClear.filter((cell) => !targetHitKeys.has(cellKey(cell.row, cell.col)));

      markTilesAsClearing(cellsToClear, targetHitKeys);
      animateTargetCollect(targetHits, { hits: targetHits });
      spawnFragments(fragmentCells);
      if (detonations.length) {
        spawnBombBurstFragments(detonations);
      }
      applyTargetClears(cellsToClear);
      if (areTargetsComplete()) state.levelComplete = true;
      await wait(CLEAR_ANIMATION_MS);

      cellsToClear.forEach((cell) => {
        state.board[cell.row][cell.col] = null;
      });

      const { created: createdCells, dropMap } = collapseAndRefill();
      const spawnedBombs = spawnBombsFromTop(createdCells, bombDropCols);
      if (!spawnedBombs) maybeDropRandomBomb(createdCells);
      renderBoard({ dropMap });

      pendingBombSeeds = [];
      await wait(DROP_ANIMATION_MS);
      await wait(CASCADE_DELAY_MS);
    }

    if (!boardHasPossibleMove(state.board)) {
      state.board = createInitialBoard();
      renderBoard();
    }

    return resolved;
  }

  async function attemptSwap(a, b) {
    if (state.busy) return;
    if (state.movesLeft <= 0 || state.levelComplete) return;
    if (!inBounds(a.row, a.col) || !inBounds(b.row, b.col)) return;
    if (!isAdjacent(a, b)) return;

    registerPlayerInteraction();
    state.busy = true;
    state.selected = null;
    clearBoardUiState({ selected: true });
    await animateSwapTiles(a, b);
    swapCells(state.board, a, b);
    renderBoard();

    const seedBombs = [];
    if (isBombKind(state.board[a.row]?.[a.col]?.kind)) seedBombs.push({ row: a.row, col: a.col });
    if (isBombKind(state.board[b.row]?.[b.col]?.kind)) seedBombs.push({ row: b.row, col: b.col });

    const resolved = await resolveBoard({ bombSeeds: seedBombs, swapPair: { a, b } });
    if (resolved) countMove();
    if (!resolved) {
      await wait(SWAP_REVERT_DELAY_MS);
      await animateSwapTiles(a, b);
      swapCells(state.board, a, b);
      renderBoard();
      shakeTiles([a, b]);
    }

    if (resolved && state.levelComplete) {
      state.busy = false;
      window.setTimeout(showWinPanel, 360);
      return;
    }

    if (resolved && triggerLevelFailed()) {
      return;
    }

    state.busy = false;
    scheduleHint();
  }

  async function triggerBombTap(row, col) {
    if (state.busy || !inBounds(row, col)) return;
    if (state.movesLeft <= 0 || state.levelComplete) return;
    if (!isBombKind(state.board[row]?.[col]?.kind)) return;

    registerPlayerInteraction({ rerenderHint: true });
    state.busy = true;
    state.selected = null;
    renderBoard();
    await wait(30);
    await resolveBoard({ bombSeeds: [{ row, col }] });
    countMove();
    if (state.levelComplete) {
      state.busy = false;
      window.setTimeout(showWinPanel, 360);
      return;
    }
    if (triggerLevelFailed()) {
      return;
    }
    state.busy = false;
    scheduleHint();
  }

  function handleTileTap(row, col) {
    if (state.busy || !inBounds(row, col)) return;
    if (isBombKind(state.board[row]?.[col]?.kind)) {
      triggerBombTap(row, col);
      return;
    }
    registerPlayerInteraction();

    const next = { row, col };
    if (!state.selected) {
      state.selected = next;
      renderBoard();
      scheduleHint();
      return;
    }

    const prev = state.selected;
    if (prev.row === next.row && prev.col === next.col) {
      state.selected = null;
      renderBoard();
      scheduleHint();
      return;
    }

    if (isAdjacent(prev, next)) {
      attemptSwap(prev, next);
      return;
    }

    state.selected = next;
    renderBoard();
    scheduleHint();
  }

  function onBoardPointerDown(event) {
    if (state.busy) return;
    const tile = event.target?.closest?.(".match-game__tile");
    if (!tile || !state.boardEl?.contains(tile)) return;

    const row = Number(tile.getAttribute("data-row"));
    const col = Number(tile.getAttribute("data-col"));
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    registerPlayerInteraction({ rerenderHint: true });

    state.pointer = {
      row,
      col,
      x: Number(event.clientX || 0),
      y: Number(event.clientY || 0)
    };
  }

  function onGlobalPointerUp(event) {
    if (!state.pointer) return;
    if (state.busy) {
      state.pointer = null;
      return;
    }

    const pointer = state.pointer;
    state.pointer = null;

    const dx = Number(event.clientX || 0) - pointer.x;
    const dy = Number(event.clientY || 0) - pointer.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 12) {
      handleTileTap(pointer.row, pointer.col);
      return;
    }

    const horizontal = Math.abs(dx) > Math.abs(dy);
    const target = {
      row: pointer.row + (horizontal ? 0 : dy > 0 ? 1 : -1),
      col: pointer.col + (horizontal ? (dx > 0 ? 1 : -1) : 0)
    };

    if (!inBounds(target.row, target.col)) {
      handleTileTap(pointer.row, pointer.col);
      return;
    }

    state.selected = null;
    attemptSwap({ row: pointer.row, col: pointer.col }, target);
  }

  function clearFailTimer() {
    if (!state.failTimer) return;
    clearTimeout(state.failTimer);
    state.failTimer = 0;
  }

  function hideOutOfMovesToast() {
    clearFailTimer();
    if (!state.outOfMovesToast) return;
    state.outOfMovesToast.hidden = true;
    state.outOfMovesToast.classList.remove("is-visible", "is-leaving");
  }

  function showOutOfMovesToastThenFail() {
    const toast = state.outOfMovesToast;
    if (!toast) {
      showFailPanel();
      return;
    }

    clearFailTimer();
    setSmartText(toast, getOutOfMovesText(), { longAt: 12, veryLongAt: 18 });
    toast.hidden = false;
    toast.classList.remove("is-visible", "is-leaving");
    void toast.offsetWidth;
    toast.classList.add("is-visible");

    state.failTimer = window.setTimeout(() => {
      state.failTimer = 0;
      toast.classList.add("is-leaving");
      state.failTimer = window.setTimeout(() => {
        state.failTimer = 0;
        if (toast) {
          toast.hidden = true;
          toast.classList.remove("is-visible", "is-leaving");
        }
        showFailPanel();
      }, 260);
    }, 1100);
  }

  function showFailPanel() {
    if (!state.failPanel) {
      closeGame();
      return;
    }

    clearFailTimer();
    if (state.outOfMovesToast) {
      state.outOfMovesToast.hidden = true;
      state.outOfMovesToast.classList.remove("is-visible", "is-leaving");
    }
    clearHintTimer();
    state.busy = true;
    state.selected = null;
    state.pointer = null;
    state.hintPair = null;
    if (state.quitPanel) state.quitPanel.hidden = true;
    if (state.winPanel) state.winPanel.hidden = true;
    if (state.failLevelTitle) state.failLevelTitle.textContent = getLevelText();
    setSmartText(state.failStatus, getLevelFailedText(), { longAt: 12, veryLongAt: 17 });
    setSmartText(state.failRetry, getTryAgainText(), { longAt: 10, veryLongAt: 16 });
    renderFailedTargetsPreview();
    state.failPanel.hidden = false;
    document.body?.classList?.add("match-level-open");
  }

  function triggerLevelFailed() {
    if (state.levelFailed || state.levelComplete || state.movesLeft > 0) return false;
    state.levelFailed = true;
    spendLife();
    showOutOfMovesToastThenFail();
    return true;
  }

  function retryFailedLevel() {
    hideOutOfMovesToast();
    if (state.failPanel) state.failPanel.hidden = true;
    document.body?.classList?.remove("match-level-open");
    refreshLives();
    if (state.lives <= 0) {
      closeGame();
      showLivesPanel("start");
      return;
    }
    startGame();
  }

  function closeFailedLevel() {
    hideOutOfMovesToast();
    closeGame();
  }

  function showWinPanel() {
    if (!state.winPanel || state.winPanel.hidden === false) return;
    clearHintTimer();
    state.busy = true;
    state.selected = null;
    state.pointer = null;
    state.hintPair = null;
    if (state.quitPanel) state.quitPanel.hidden = true;
    if (state.winTitle) state.winTitle.textContent = getWellDoneText();
    if (state.winRewardAmount) state.winRewardAmount.textContent = String(LEVEL_REWARD);
    if (state.winContinue) state.winContinue.textContent = getContinueText();
    state.winPanel.hidden = false;
    document.body?.classList?.add("match-level-open");
  }

  function splitRewardAmount(amount, count) {
    const total = Math.max(0, Math.round(Number(amount) || 0));
    const safeCount = Math.max(1, Math.min(total || 1, Math.round(Number(count) || 1)));
    const base = Math.floor(total / safeCount);
    let remainder = total % safeCount;
    return Array.from({ length: safeCount }, () => base + (remainder-- > 0 ? 1 : 0)).filter((chunk) => chunk > 0);
  }

  function animateRewardToBalance(sourceRect, amount, onArrive) {
    const target = document.getElementById("pillCurrencyIcon") ||
      document.querySelector("#tonPill img") ||
      document.getElementById("tonPill");
    const targetRect = target?.getBoundingClientRect?.();
    if (!sourceRect?.width || !targetRect?.width) {
      onArrive?.(Math.max(0, Math.round(Number(amount) || LEVEL_REWARD)));
      return;
    }

    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;
    const distance = Math.hypot(endX - startX, endY - startY);
    const chunks = splitRewardAmount(amount || LEVEL_REWARD, Math.max(6, Math.min(8, Math.round(Number(amount) || LEVEL_REWARD))));
    const count = chunks.length;
    let completed = 0;
    const creditedChunks = new Set();
    const creditChunk = (index) => {
      if (creditedChunks.has(index)) return;
      creditedChunks.add(index);
      const chunk = chunks[index];
      const safeChunk = Math.max(0, Math.round(Number(chunk) || 0));
      if (!safeChunk) return;
      onArrive?.(safeChunk);
    };
    const creditRemaining = () => {
      chunks.forEach((_, index) => creditChunk(index));
    };

    for (let i = 0; i < count; i += 1) {
      const flyer = document.createElement("img");
      flyer.className = "match-reward-flyer";
      flyer.src = WILDCOIN_IMAGE;
      flyer.alt = "";
      flyer.setAttribute("aria-hidden", "true");
      flyer.style.left = `${startX + randomFloat(-sourceRect.width * 0.08, sourceRect.width * 0.08)}px`;
      flyer.style.top = `${startY + randomFloat(-sourceRect.height * 0.06, sourceRect.height * 0.06)}px`;
      document.body.appendChild(flyer);

      const delay = i * 66;
      const launchX = randomFloat(-14, 14);
      const launchY = -randomFloat(18, 34);
      const midX = startX + (endX - startX) * 0.5 + randomFloat(-24, 24);
      const midY = Math.min(startY, endY) - Math.max(56, Math.min(118, distance * 0.22));
      const animation = flyer.animate(
        [
          { transform: "translate(-50%, -50%) scale(.72)", opacity: 0, offset: 0 },
          {
            transform: `translate(-50%, -50%) translate(${launchX.toFixed(1)}px, ${launchY.toFixed(1)}px) scale(1.1)`,
            opacity: 1,
            offset: 0.18
          },
          {
            transform: `translate(-50%, -50%) translate(${(midX - startX).toFixed(1)}px, ${(midY - startY).toFixed(1)}px) scale(.96)`,
            opacity: 1,
            offset: 0.68
          },
          {
            transform: `translate(-50%, -50%) translate(${(endX - startX).toFixed(1)}px, ${(endY - startY).toFixed(1)}px) scale(.34)`,
            opacity: 0.1
          }
        ],
        {
          duration: Math.max(760, Math.min(1040, distance * 1.1)),
          delay,
          easing: "cubic-bezier(.2,.78,.16,1)",
          fill: "forwards"
        }
      );
      animation.onfinish = () => {
        flyer.remove();
        completed += 1;
        creditChunk(i);
        if (completed >= count) creditRemaining();
      };
    }

    window.setTimeout(creditRemaining, Math.max(940, Math.min(1280, distance * 1.1)) + count * 66);
  }

  function continueAfterWin() {
    const rewardRect = state.winCoin?.getBoundingClientRect?.();
    if (state.winPanel) state.winPanel.hidden = true;
    document.body?.classList?.remove("match-level-open");
    closeGame();
    window.setTimeout(() => {
      animateRewardToBalance(rewardRect, LEVEL_REWARD, (chunk = LEVEL_REWARD) => {
        writeWildCoin(readWildCoin() + Math.max(0, Math.round(Number(chunk) || 0)));
      });
    }, 120);
  }

  function startGame() {
    refreshLives();
    if (state.lives <= 0) {
      showLivesPanel("start");
      return;
    }

    hideOutOfMovesToast();
    state.home.hidden = true;
    state.game.hidden = false;
    if (state.levelPanel) state.levelPanel.hidden = true;
    if (state.prizePanel) state.prizePanel.hidden = true;
    if (state.livesPanel) state.livesPanel.hidden = true;
    if (state.quitPanel) state.quitPanel.hidden = true;
    if (state.failPanel) state.failPanel.hidden = true;
    document.body?.classList?.remove("match-level-open");
    document.body?.classList?.add("match-game-open");
    syncMatchLogo(PAGE_ID, true);

    clearHintTimer();
    state.selected = null;
    state.busy = false;
    state.levelComplete = false;
    state.levelFailed = false;
    state.pointer = null;
    state.hintPair = null;
    state.board = createInitialBoard();
    state.particlesEl.innerHTML = "";
    resetLevelHud();
    renderBoard();
    scheduleHint();
  }

  function closeGame() {
    clearHintTimer();
    hideOutOfMovesToast();
    state.home.hidden = false;
    state.game.hidden = true;
    if (state.levelPanel) state.levelPanel.hidden = true;
    if (state.economyPanel) state.economyPanel.hidden = true;
    if (state.livesPanel) state.livesPanel.hidden = true;
    if (state.prizePanel) state.prizePanel.hidden = true;
    if (state.winPanel) state.winPanel.hidden = true;
    if (state.quitPanel) state.quitPanel.hidden = true;
    if (state.failPanel) state.failPanel.hidden = true;
    document.body?.classList?.remove("match-level-open");
    document.body?.classList?.remove("match-game-open");
    syncMatchLogo(PAGE_ID, false);
    state.selected = null;
    state.busy = false;
    state.levelComplete = false;
    state.levelFailed = false;
    state.pointer = null;
    state.hintPair = null;
  }

  function showLevelPanel() {
    if (!state.levelPanel) {
      startGame();
      return;
    }
    if (state.economyPanel) state.economyPanel.hidden = true;
    if (state.livesPanel) state.livesPanel.hidden = true;
    if (state.prizePanel) state.prizePanel.hidden = true;
    state.levelPanel.hidden = false;
    document.body?.classList?.add("match-level-open");
    syncLanguage();
  }

  function hideLevelPanel() {
    if (state.levelPanel) state.levelPanel.hidden = true;
    if (state.economyPanel) state.economyPanel.hidden = true;
    if (state.livesPanel) state.livesPanel.hidden = true;
    if (state.prizePanel) state.prizePanel.hidden = true;
    document.body?.classList?.remove("match-level-open");
  }

  function showEconomyPanel() {
    if (!state.economyPanel) return;
    if (state.levelPanel) state.levelPanel.hidden = true;
    if (state.livesPanel) state.livesPanel.hidden = true;
    if (state.prizePanel) state.prizePanel.hidden = true;
    if (state.winPanel) state.winPanel.hidden = true;
    state.economyPanel.hidden = false;
    document.body?.classList?.add("match-level-open");
  }

  function hideEconomyPanel() {
    if (state.economyPanel) state.economyPanel.hidden = true;
    document.body?.classList?.remove("match-level-open");
  }

  function showLivesPanel(source = "pill") {
    if (!state.livesPanel) return;
    state.livesPanelSource = source === "start" ? "start" : "pill";
    refreshLives();
    if (state.levelPanel) state.levelPanel.hidden = true;
    if (state.economyPanel) state.economyPanel.hidden = true;
    if (state.prizePanel) state.prizePanel.hidden = true;
    if (state.winPanel) state.winPanel.hidden = true;
    state.livesPanel.hidden = false;
    document.body?.classList?.add("match-level-open");
    syncLanguage();
  }

  function hideLivesPanel() {
    if (state.livesPanel) state.livesPanel.hidden = true;
    document.body?.classList?.remove("match-level-open");
  }

  function syncPrizeTickets() {
    state.page?.querySelectorAll?.("[data-match-prize-price]")?.forEach((button) => {
      const prizeId = button.getAttribute("data-match-prize-price") || "";
      const def = getPrizeDef(prizeId);
      const label = button.querySelector("[data-match-prize-price-text]");
      const isParticipating = hasPrizeTicket(prizeId);
      button.classList.toggle("is-participating", isParticipating);
      button.disabled = isParticipating;
      button.setAttribute("aria-label", isParticipating ? getParticipatingText() : `${def?.price || 0} WildCoin`);
      if (label) label.textContent = isParticipating ? getParticipatingText() : String(def?.price || 0);
      const icon = button.querySelector("img");
      if (icon) icon.hidden = isParticipating;
    });
    state.page?.querySelectorAll?.("[data-match-prize-ticket]")?.forEach((ticket) => {
      const prizeId = ticket.getAttribute("data-match-prize-ticket") || "";
      const count = getPrizeTicketCount(prizeId);
      ticket.hidden = count <= 0;
      const countNode = ticket.querySelector?.("[data-match-prize-ticket-count]");
      if (countNode) countNode.textContent = String(Math.max(1, count));
    });
    syncGiveawayParticipants();
  }

  function syncGiveawayParticipants() {
    state.page?.querySelectorAll?.("[data-match-participants]")?.forEach((node) => {
      const prizeId = node.getAttribute("data-match-participants") || "";
      const countNode = node.querySelector?.("[data-match-participants-count]");
      if (countNode) countNode.textContent = String(getParticipantsCount(prizeId));
    });
  }

  function showPrizePanel(prizeId) {
    const def = getPrizeDef(prizeId);
    if (!state.prizePanel || !def || hasPrizeTicket(prizeId)) return;
    state.selectedPrizeId = prizeId;
    if (state.levelPanel) state.levelPanel.hidden = true;
    if (state.economyPanel) state.economyPanel.hidden = true;
    if (state.livesPanel) state.livesPanel.hidden = true;
    if (state.winPanel) state.winPanel.hidden = true;
    if (state.prizeTitle) state.prizeTitle.textContent = getPrizeTitleText();
    if (state.prizeHint) state.prizeHint.textContent = getPrizeHintText();
    if (state.prizePrice) state.prizePrice.textContent = String(def.price);
    if (state.prizeBuy) {
      const canBuy = readWildCoin() >= def.price;
      state.prizeBuy.textContent = canBuy ? getPrizeBuyText() : getNotEnoughWildCoinText();
      state.prizeBuy.disabled = !canBuy;
    }
    state.prizePanel.hidden = false;
    document.body?.classList?.add("match-level-open");
  }

  function hidePrizePanel() {
    if (state.prizePanel) state.prizePanel.hidden = true;
    state.selectedPrizeId = "";
    document.body?.classList?.remove("match-level-open");
  }

  function animatePrizeTicket(prizeId) {
    const source = state.prizePanel?.querySelector?.(".match-prize-card__ticket img");
    const target = state.page?.querySelector?.(`[data-match-prize-ticket="${prizeId}"]`);
    if (!source || !target) return;

    const sourceRect = source.getBoundingClientRect();
    const shelfRect = target.parentElement?.getBoundingClientRect?.();
    if (!sourceRect.width || !shelfRect?.width) return;

    const flyer = document.createElement("img");
    flyer.className = "match-home__ticket-flyer";
    flyer.src = TICKET_IMAGE;
    flyer.alt = "";
    flyer.setAttribute("aria-hidden", "true");
    flyer.style.left = `${sourceRect.left + sourceRect.width / 2}px`;
    flyer.style.top = `${sourceRect.top + sourceRect.height / 2}px`;
    target.hidden = true;
    document.body.appendChild(flyer);

    const targetX = shelfRect.right - Math.min(12, shelfRect.width * 0.08);
    const targetY = shelfRect.top + shelfRect.height * 0.34;
    const dx = targetX - (sourceRect.left + sourceRect.width / 2);
    const dy = targetY - (sourceRect.top + sourceRect.height / 2);
    requestAnimationFrame(() => {
      flyer.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.48) rotate(10deg)`;
      flyer.style.opacity = "0.96";
    });
    window.setTimeout(() => {
      flyer.remove();
      if (target) target.hidden = false;
    }, 820);
  }

  function buySelectedPrizeTicket() {
    const prizeId = state.selectedPrizeId;
    const def = getPrizeDef(prizeId);
    if (!def || hasPrizeTicket(prizeId)) return;
    const balance = readWildCoin();
    if (balance < def.price) {
      if (state.prizeBuy) {
        state.prizeBuy.textContent = getNotEnoughWildCoinText();
        state.prizeBuy.disabled = true;
      }
      return;
    }
    writeWildCoin(balance - def.price);
    const currentCount = getPrizeTicketCount(prizeId);
    state.prizeTickets = { ...(state.prizeTickets || {}), [prizeId]: currentCount + 1 };
    writePrizeTickets();
    syncPrizeTickets();
    animatePrizeTicket(prizeId);
    hidePrizePanel();
  }

  function showQuitPanel() {
    if (!state.quitPanel) {
      closeGame();
      return;
    }
    state.quitPanel.hidden = false;
    syncLanguage();
  }

  function hideQuitPanel() {
    if (state.quitPanel) state.quitPanel.hidden = true;
  }

  function handleMatchBackAction(event = null) {
    const openHomePanel = [state.levelPanel, state.economyPanel, state.livesPanel, state.prizePanel, state.winPanel]
      .find((panel) => panel && !panel.hidden);
    const failPanelOpen = state.failPanel && !state.failPanel.hidden;
    if (state.game?.hidden && !openHomePanel && !failPanelOpen) return false;

    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    event?.stopPropagation?.();

    if (failPanelOpen) {
      closeFailedLevel();
    } else if (openHomePanel) {
      hideLevelPanel();
      hideEconomyPanel();
      hideLivesPanel();
      hidePrizePanel();
      if (state.winPanel) state.winPanel.hidden = true;
    } else if (state.quitPanel && !state.quitPanel.hidden) {
      hideQuitPanel();
    } else {
      showQuitPanel();
    }
    return true;
  }

  function restoreMatchHistoryState() {
    if (!window.history || typeof window.history.pushState !== "function") return;
    const baseState = (window.history.state && typeof window.history.state === "object")
      ? window.history.state
      : {};
    try {
      window.history.pushState({ ...baseState, __wtPage: PAGE_ID }, "", window.location.href);
    } catch {}
  }

  function lolPopSkinUrl(name) {
    return `${LOL_POP_PNG_BASE}${encodeURIComponent(String(name || ""))}.png`;
  }

  function poolFloatSkinUrl(name) {
    return `${POOL_FLOAT_PNG_BASE}${encodeURIComponent(String(name || ""))}.png`;
  }

  function snoopDoggSkinUrl(name) {
    return `${SNOOP_DOGG_PNG_BASE}${encodeURIComponent(String(name || ""))}.png`;
  }

  function jollyChimpSkinUrl(name) {
    return `${JOLLY_CHIMP_PNG_BASE}${encodeURIComponent(String(name || ""))}.png`;
  }

  function preloadShelfGifts() {
    LOL_POP_SKINS.forEach((name) => {
      const img = new Image();
      img.decoding = "async";
      img.src = lolPopSkinUrl(name);
    });
    POOL_FLOAT_SKINS.forEach((name) => {
      const img = new Image();
      img.decoding = "async";
      img.src = poolFloatSkinUrl(name);
    });
    SNOOP_DOGG_SKINS.forEach((name) => {
      const img = new Image();
      img.decoding = "async";
      img.src = snoopDoggSkinUrl(name);
    });
    JOLLY_CHIMP_SKINS.forEach((name) => {
      const img = new Image();
      img.decoding = "async";
      img.src = jollyChimpSkinUrl(name);
    });
  }

  function renderShelfGift(nextIndex = 0) {
    if (!state.shelfGiftA || !state.shelfGiftB || !LOL_POP_SKINS.length) return;

    const safeIndex = ((nextIndex % LOL_POP_SKINS.length) + LOL_POP_SKINS.length) % LOL_POP_SKINS.length;
    const target = state.shelfGiftFront === 0 ? state.shelfGiftB : state.shelfGiftA;
    const current = state.shelfGiftFront === 0 ? state.shelfGiftA : state.shelfGiftB;
    const skin = LOL_POP_SKINS[safeIndex];
    const src = lolPopSkinUrl(skin);

    target.src = src;
    target.alt = skin;
    requestAnimationFrame(() => {
      target.classList.add("is-active");
      current.classList.remove("is-active");
      state.shelfGiftFront = state.shelfGiftFront === 0 ? 1 : 0;
      state.shelfGiftIndex = safeIndex;
    });
  }

  function startShelfGiftRotation() {
    if (state.shelfGiftTimer || !LOL_POP_SKINS.length) return;
    if (state.shelfGiftA) {
      state.shelfGiftA.src = lolPopSkinUrl(LOL_POP_SKINS[0]);
      state.shelfGiftA.alt = LOL_POP_SKINS[0];
      state.shelfGiftA.classList.add("is-active");
      state.shelfGiftFront = 0;
      state.shelfGiftIndex = 0;
    }
    state.shelfGiftTimer = window.setInterval(() => {
      renderShelfGift(state.shelfGiftIndex + 1);
    }, SHELF_GIFT_ROTATE_MS);
  }

  function renderPoolFloatGift(nextIndex = 0) {
    if (!state.poolFloatGiftA || !state.poolFloatGiftB || !POOL_FLOAT_SKINS.length) return;

    const safeIndex = ((nextIndex % POOL_FLOAT_SKINS.length) + POOL_FLOAT_SKINS.length) % POOL_FLOAT_SKINS.length;
    const target = state.poolFloatGiftFront === 0 ? state.poolFloatGiftB : state.poolFloatGiftA;
    const current = state.poolFloatGiftFront === 0 ? state.poolFloatGiftA : state.poolFloatGiftB;
    const skin = POOL_FLOAT_SKINS[safeIndex];
    const src = poolFloatSkinUrl(skin);

    target.src = src;
    target.alt = skin;
    requestAnimationFrame(() => {
      target.classList.add("is-active");
      current.classList.remove("is-active");
      state.poolFloatGiftFront = state.poolFloatGiftFront === 0 ? 1 : 0;
      state.poolFloatGiftIndex = safeIndex;
    });
  }

  function startPoolFloatGiftRotation() {
    if (state.poolFloatGiftTimer || !POOL_FLOAT_SKINS.length) return;
    if (state.poolFloatGiftA) {
      state.poolFloatGiftA.src = poolFloatSkinUrl(POOL_FLOAT_SKINS[0]);
      state.poolFloatGiftA.alt = POOL_FLOAT_SKINS[0];
      state.poolFloatGiftA.classList.add("is-active");
      state.poolFloatGiftFront = 0;
      state.poolFloatGiftIndex = 0;
    }
    state.poolFloatGiftTimer = window.setInterval(() => {
      renderPoolFloatGift(state.poolFloatGiftIndex + 1);
    }, SHELF_GIFT_ROTATE_MS);
  }

  function renderSnoopDoggGift(nextIndex = 0) {
    if (!state.snoopDoggGiftA || !state.snoopDoggGiftB || !SNOOP_DOGG_SKINS.length) return;

    const safeIndex = ((nextIndex % SNOOP_DOGG_SKINS.length) + SNOOP_DOGG_SKINS.length) % SNOOP_DOGG_SKINS.length;
    const target = state.snoopDoggGiftFront === 0 ? state.snoopDoggGiftB : state.snoopDoggGiftA;
    const current = state.snoopDoggGiftFront === 0 ? state.snoopDoggGiftA : state.snoopDoggGiftB;
    const skin = SNOOP_DOGG_SKINS[safeIndex];
    const src = snoopDoggSkinUrl(skin);

    target.src = src;
    target.alt = skin;
    requestAnimationFrame(() => {
      target.classList.add("is-active");
      current.classList.remove("is-active");
      state.snoopDoggGiftFront = state.snoopDoggGiftFront === 0 ? 1 : 0;
      state.snoopDoggGiftIndex = safeIndex;
    });
  }

  function startSnoopDoggGiftRotation() {
    if (state.snoopDoggGiftTimer || !SNOOP_DOGG_SKINS.length) return;
    if (state.snoopDoggGiftA) {
      state.snoopDoggGiftA.src = snoopDoggSkinUrl(SNOOP_DOGG_SKINS[0]);
      state.snoopDoggGiftA.alt = SNOOP_DOGG_SKINS[0];
      state.snoopDoggGiftA.classList.add("is-active");
      state.snoopDoggGiftFront = 0;
      state.snoopDoggGiftIndex = 0;
    }
    state.snoopDoggGiftTimer = window.setInterval(() => {
      renderSnoopDoggGift(state.snoopDoggGiftIndex + 1);
    }, SHELF_GIFT_ROTATE_MS);
  }

  function renderJollyChimpGift(nextIndex = 0) {
    if (!state.jollyChimpGiftA || !state.jollyChimpGiftB || !JOLLY_CHIMP_SKINS.length) return;

    const safeIndex = ((nextIndex % JOLLY_CHIMP_SKINS.length) + JOLLY_CHIMP_SKINS.length) % JOLLY_CHIMP_SKINS.length;
    const target = state.jollyChimpGiftFront === 0 ? state.jollyChimpGiftB : state.jollyChimpGiftA;
    const current = state.jollyChimpGiftFront === 0 ? state.jollyChimpGiftA : state.jollyChimpGiftB;
    const skin = JOLLY_CHIMP_SKINS[safeIndex];
    const src = jollyChimpSkinUrl(skin);

    target.src = src;
    target.alt = skin;
    requestAnimationFrame(() => {
      target.classList.add("is-active");
      current.classList.remove("is-active");
      state.jollyChimpGiftFront = state.jollyChimpGiftFront === 0 ? 1 : 0;
      state.jollyChimpGiftIndex = safeIndex;
    });
  }

  function startJollyChimpGiftRotation() {
    if (state.jollyChimpGiftTimer || !JOLLY_CHIMP_SKINS.length) return;
    if (state.jollyChimpGiftA) {
      state.jollyChimpGiftA.src = jollyChimpSkinUrl(JOLLY_CHIMP_SKINS[0]);
      state.jollyChimpGiftA.alt = JOLLY_CHIMP_SKINS[0];
      state.jollyChimpGiftA.classList.add("is-active");
      state.jollyChimpGiftFront = 0;
      state.jollyChimpGiftIndex = 0;
    }
    state.jollyChimpGiftTimer = window.setInterval(() => {
      renderJollyChimpGift(state.jollyChimpGiftIndex + 1);
    }, SHELF_GIFT_ROTATE_MS);
  }

  function normalizeLivesData(data = {}, now = Date.now()) {
    let lives = Math.max(0, Math.min(MAX_LIVES, Math.round(Number(data.lives))));
    if (!Number.isFinite(lives)) lives = MAX_LIVES;
    let nextLifeAt = Math.max(0, Math.round(Number(data.nextLifeAt) || 0));

    if (lives >= MAX_LIVES) {
      return { lives: MAX_LIVES, nextLifeAt: 0 };
    }

    if (!nextLifeAt) nextLifeAt = now + LIFE_RESTORE_MS;

    while (lives < MAX_LIVES && nextLifeAt <= now) {
      lives += 1;
      nextLifeAt += LIFE_RESTORE_MS;
    }

    if (lives >= MAX_LIVES) {
      lives = MAX_LIVES;
      nextLifeAt = 0;
    }

    return { lives, nextLifeAt };
  }

  function readLives() {
    try {
      const raw = localStorage.getItem(LIVES_STORAGE_KEY);
      if (raw) return normalizeLivesData(JSON.parse(raw));
    } catch {}
    return normalizeLivesData({ lives: MAX_LIVES, nextLifeAt: 0 });
  }

  function writeLives(data) {
    const next = normalizeLivesData(data);
    try {
      localStorage.setItem(LIVES_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    return next;
  }

  function formatLifeTimer(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function renderLives() {
    const normalized = writeLives({ lives: state.lives, nextLifeAt: state.nextLifeAt });
    state.lives = normalized.lives;
    state.nextLifeAt = normalized.nextLifeAt;

    document.querySelectorAll("[data-match-heart-count]").forEach((node) => {
      node.textContent = String(state.lives);
    });
    document.querySelectorAll("[data-match-heart-timer]").forEach((node) => {
      node.textContent = state.lives >= MAX_LIVES
        ? getLivesFullText()
        : formatLifeTimer(state.nextLifeAt - Date.now());
    });
    document.querySelectorAll("[data-match-lives-count]").forEach((node) => {
      node.textContent = String(state.lives);
    });
    document.querySelectorAll("[data-match-lives-time]").forEach((node) => {
      node.textContent = state.lives >= MAX_LIVES
        ? getLivesFullText()
        : formatLifeTimer(state.nextLifeAt - Date.now());
    });
    if (state.livesTitle) state.livesTitle.textContent = getLivesPanelTitleText();

    try {
      window.dispatchEvent(
        new CustomEvent("match:lives-update", {
          detail: { lives: state.lives, nextLifeAt: state.nextLifeAt, maxLives: MAX_LIVES }
        })
      );
    } catch {}
  }

  function refreshLives() {
    const next = readLives();
    state.lives = next.lives;
    state.nextLifeAt = next.nextLifeAt;
    renderLives();
  }

  function spendLife() {
    refreshLives();
    if (state.lives <= 0) return false;

    const nextLives = Math.max(0, state.lives - 1);
    const nextLifeAt = nextLives < MAX_LIVES
      ? (state.nextLifeAt || Date.now() + LIFE_RESTORE_MS)
      : 0;
    const next = writeLives({ lives: nextLives, nextLifeAt });
    state.lives = next.lives;
    state.nextLifeAt = next.nextLifeAt;
    renderLives();
    return true;
  }

  function onMatchPopState(event) {
    if (!state.page?.classList?.contains("page-active")) return;
    if (!handleMatchBackAction(event)) return;
    restoreMatchHistoryState();
  }

  function syncLanguage() {
    const playText = getPlayButtonText();
    const levelText = getLevelText();
    state.playImages.forEach((img) => {
      if (img) img.src = PLAY_BUTTON;
    });
    const openLevelButton = state.page?.querySelector?.("[data-match-open-level]");
    const startButton = state.page?.querySelector?.("[data-match-start]");
    const openLevelText = openLevelButton?.querySelector?.("[data-match-play-text]");
    const startText = startButton?.querySelector?.("[data-match-play-text]");
    if (openLevelText) openLevelText.textContent = levelText;
    if (startText) startText.textContent = playText;
    if (openLevelButton) openLevelButton.setAttribute("aria-label", levelText);
    if (startButton) startButton.setAttribute("aria-label", playText);
    if (state.levelTitle) state.levelTitle.textContent = levelText;
    if (state.goalTitle) state.goalTitle.textContent = getGoalText();
    if (state.hudMovesTitle) state.hudMovesTitle.textContent = getMovesText();
    if (state.hudTargetTitle) state.hudTargetTitle.textContent = getTargetText();
    if (state.economyHint) state.economyHint.textContent = getEconomyHintText();
    if (state.livesTitle) state.livesTitle.textContent = getLivesPanelTitleText();
    if (state.livesHint) state.livesHint.textContent = getNextLifeLabelText();
    if (state.prizeTitle) state.prizeTitle.textContent = getPrizeTitleText();
    if (state.prizeHint) state.prizeHint.textContent = getPrizeHintText();
    if (state.prizeBuy && !state.prizeBuy.disabled) state.prizeBuy.textContent = getPrizeBuyText();
    if (state.quitTitle) state.quitTitle.textContent = getQuitTitleText();
    if (state.quitWarning) state.quitWarning.textContent = getQuitWarningText();
    if (state.quitConfirm) {
      const quitText = getQuitButtonText();
      state.quitConfirm.textContent = quitText;
      state.quitConfirm.setAttribute("aria-label", quitText);
    }
    if (state.winTitle) state.winTitle.textContent = getWellDoneText();
    if (state.winRewardAmount) state.winRewardAmount.textContent = String(LEVEL_REWARD);
    if (state.winContinue) state.winContinue.textContent = getContinueText();
    if (state.failLevelTitle) state.failLevelTitle.textContent = levelText;
    setSmartText(state.failStatus, getLevelFailedText(), { longAt: 12, veryLongAt: 17 });
    setSmartText(state.failRetry, getTryAgainText(), { longAt: 10, veryLongAt: 16 });
    setSmartText(state.outOfMovesToast, getOutOfMovesText(), { longAt: 12, veryLongAt: 18 });
    state.page?.querySelectorAll?.(".match-level-card__close")?.forEach((button) => {
      button.setAttribute("aria-label", getCloseText());
    });
    renderLevelTargetsPreview();
    renderFailedTargetsPreview();
    syncPrizeTickets();
  }

  function syncMatchLogo(pageId = "", gameOpenOverride = null) {
    const logo = document.querySelector(".logo-header .main-logo");
    if (!logo) return;

    if (!state.defaultLogoSrc) {
      state.defaultLogoSrc = String(logo.getAttribute("src") || "/images/logo.png");
    }

    const isMatchPage = pageId
      ? pageId === PAGE_ID
      : (document.body?.classList?.contains("page-match") ||
          document.getElementById(PAGE_ID)?.classList?.contains("page-active"));
    const isMatchGameOpen = (typeof gameOpenOverride === "boolean")
      ? gameOpenOverride
      : (isMatchPage && document.body?.classList?.contains("match-game-open"));
    const desiredSrc = (isMatchPage && isMatchGameOpen) ? MATCH_LOGO : state.defaultLogoSrc;
    if (String(logo.getAttribute("src") || "") !== desiredSrc) {
      logo.setAttribute("src", desiredSrc);
    }
  }

  function bindUi() {
    if (!state.page) return;

    state.home = state.page.querySelector("[data-match-home]");
    state.game = state.page.querySelector("[data-match-game]");
    state.playImg = state.page.querySelector("[data-match-play-image]");
    state.playText = state.page.querySelector("[data-match-play-text]");
    state.playImages = Array.from(state.page.querySelectorAll("[data-match-play-image]"));
    state.playTexts = Array.from(state.page.querySelectorAll("[data-match-play-text]"));
    state.shelfGiftA = state.page.querySelector("[data-match-shelf-gift-a]");
    state.shelfGiftB = state.page.querySelector("[data-match-shelf-gift-b]");
    state.poolFloatGiftA = state.page.querySelector("[data-match-pool-float-gift-a]");
    state.poolFloatGiftB = state.page.querySelector("[data-match-pool-float-gift-b]");
    state.snoopDoggGiftA = state.page.querySelector("[data-match-snoop-dogg-gift-a]");
    state.snoopDoggGiftB = state.page.querySelector("[data-match-snoop-dogg-gift-b]");
    state.jollyChimpGiftA = state.page.querySelector("[data-match-jolly-chimp-gift-a]");
    state.jollyChimpGiftB = state.page.querySelector("[data-match-jolly-chimp-gift-b]");
    state.levelPanel = state.page.querySelector("[data-match-level-panel]");
    state.economyPanel = state.page.querySelector("[data-match-economy-panel]");
    state.livesPanel = state.page.querySelector("[data-match-lives-panel]");
    state.prizePanel = state.page.querySelector("[data-match-prize-panel]");
    state.levelTitle = state.page.querySelector("[data-match-level-title]");
    state.livesTitle = state.page.querySelector("[data-match-lives-title]");
    state.livesHint = state.page.querySelector("[data-match-lives-hint]");
    state.livesCount = state.page.querySelector("[data-match-lives-count]");
    state.livesTime = state.page.querySelector("[data-match-lives-time]");
    state.goalTitle = state.page.querySelector("[data-match-goal-title]");
    state.economyHint = state.page.querySelector("[data-match-economy-hint]");
    state.prizeTitle = state.page.querySelector("[data-match-prize-title]");
    state.prizePrice = state.page.querySelector("[data-match-prize-panel-price]");
    state.prizeHint = state.page.querySelector("[data-match-prize-hint]");
    state.prizeBuy = state.page.querySelector("[data-match-prize-buy]");
    state.quitPanel = state.page.querySelector("[data-match-quit-panel]");
    state.quitTitle = state.page.querySelector("[data-match-quit-title]");
    state.quitWarning = state.page.querySelector("[data-match-quit-warning]");
    state.quitConfirm = state.page.querySelector("[data-match-quit-confirm]");
    state.winPanel = state.page.querySelector("[data-match-win-panel]");
    state.winTitle = state.page.querySelector("[data-match-win-title]");
    state.winRewardAmount = state.page.querySelector("[data-match-win-reward]");
    state.winContinue = state.page.querySelector("[data-match-win-continue]");
    state.winCoin = state.page.querySelector("[data-match-win-coin]");
    state.failPanel = state.page.querySelector("[data-match-fail-panel]");
    state.failLevelTitle = state.page.querySelector("[data-match-fail-level]");
    state.failStatus = state.page.querySelector("[data-match-fail-status]");
    state.failTargets = state.page.querySelector("[data-match-fail-targets]");
    state.failRetry = state.page.querySelector("[data-match-fail-retry]");
    state.outOfMovesToast = state.page.querySelector("[data-match-out-of-moves]");
    state.levelTargetsPreview = state.page.querySelector("[data-match-level-targets]");
    state.hudMovesTitle = state.page.querySelector("[data-match-moves-title]");
    state.hudTargetTitle = state.page.querySelector("[data-match-target-title]");
    state.hudMovesValue = state.page.querySelector("[data-match-moves]");
    state.hudTargets = state.page.querySelector("[data-match-targets]");
    state.boardEl = state.page.querySelector("[data-match-board]");
    state.particlesEl = state.page.querySelector("[data-match-particles]");

    const openLevelBtn = state.page.querySelector("[data-match-open-level]");
    const startBtn = state.page.querySelector("[data-match-start]");
    const levelCloseBtn = state.page.querySelector("[data-match-level-close]");
    const economyCloseBtn = state.page.querySelector("[data-match-economy-close]");
    const livesCloseBtn = state.page.querySelector("[data-match-lives-close]");
    const prizeCloseBtn = state.page.querySelector("[data-match-prize-close]");
    const livesOpenBtn = document.querySelector("[data-match-lives-open]");
    const closeBtn = state.page.querySelector("[data-match-close]");
    const quitCloseBtn = state.page.querySelector("[data-match-quit-close]");
    const quitConfirmBtn = state.page.querySelector("[data-match-quit-confirm]");
    const winContinueBtn = state.page.querySelector("[data-match-win-continue]");
    const failCloseBtn = state.page.querySelector("[data-match-fail-close]");
    const failRetryBtn = state.page.querySelector("[data-match-fail-retry]");
    state.page.querySelectorAll(".match-level-card__close img").forEach((img) => {
      img.src = img.closest(".match-fail-card__close") ? PANEL_CLOSE_BUTTON : CLOSE_BUTTON;
    });

    openLevelBtn?.addEventListener("click", () => {
      showLevelPanel();
    });
    startBtn?.addEventListener("click", () => {
      startGame();
    });
    levelCloseBtn?.addEventListener("click", () => {
      hideLevelPanel();
    });
    economyCloseBtn?.addEventListener("click", () => {
      hideEconomyPanel();
    });
    livesOpenBtn?.addEventListener("click", () => {
      showLivesPanel("pill");
    });
    livesCloseBtn?.addEventListener("click", () => {
      hideLivesPanel();
    });
    prizeCloseBtn?.addEventListener("click", () => {
      hidePrizePanel();
    });
    state.prizeBuy?.addEventListener("click", () => {
      buySelectedPrizeTicket();
    });
    state.page.querySelectorAll("[data-match-prize-price]").forEach((button) => {
      button.addEventListener("click", () => {
        showPrizePanel(button.getAttribute("data-match-prize-price") || "");
      });
    });
    closeBtn?.addEventListener("click", () => {
      showQuitPanel();
    });
    quitCloseBtn?.addEventListener("click", () => {
      hideQuitPanel();
    });
    quitConfirmBtn?.addEventListener("click", () => {
      spendLife();
      closeGame();
    });
    winContinueBtn?.addEventListener("click", () => {
      continueAfterWin();
    });
    failCloseBtn?.addEventListener("click", () => {
      closeFailedLevel();
    });
    failRetryBtn?.addEventListener("click", () => {
      retryFailedLevel();
    });

    state.boardEl?.addEventListener("pointerdown", onBoardPointerDown);
    window.addEventListener("pointerup", onGlobalPointerUp);
    window.addEventListener("pointercancel", onGlobalPointerUp);
    window.addEventListener("popstate", onMatchPopState, true);
    window.addEventListener("wt:mini-game-back", (event) => {
      if (event?.detail?.pageId !== PAGE_ID) return;
      handleMatchBackAction(event);
    });
  }

  function initApi() {
    const getWildCoin = () => readWildCoin();
    window.WTMatch = {
      getWildCoin: () => getWildCoin(),
      getLives: () => {
        refreshLives();
        return { lives: state.lives, nextLifeAt: state.nextLifeAt, maxLives: MAX_LIVES };
      },
      loseLife: () => spendLife(),
      getState: () => ({
        wildCoin: getWildCoin(),
        lives: state.lives,
        nextLifeAt: state.nextLifeAt,
        maxLives: MAX_LIVES,
        gameOpen: !state.game?.hidden
      }),
      openEconomySheet: () => {
        showEconomyPanel();
      },
      openLivesSheet: () => {
        showLivesPanel("pill");
      }
    };
  }

  function init() {
    const page = ensurePage();
    page.style.setProperty("--match-main-bg-image", `url("${MAIN_BG}")`);
    page.style.setProperty("--match-level-bg-image", `url("${LEVEL_BG}")`);
    state.page = page;

    bindUi();
    state.prizeTickets = readPrizeTickets();
    syncLanguage();
    syncMatchLogo();
    preloadMatchAssets();
    preloadShelfGifts();
    startShelfGiftRotation();
    startPoolFloatGiftRotation();
    startSnoopDoggGiftRotation();
    startJollyChimpGiftRotation();
    initApi();

    const refreshWildCoin = () => emitWildCoin(readWildCoin());
    refreshWildCoin();
    syncPrizeTickets();
    loadMatchStateFromServer();
    refreshLives();
    if (!state.livesTimer) {
      state.livesTimer = window.setInterval(() => {
        refreshLives();
      }, 1000);
    }

    const syncLocalizedUi = () => {
      syncLanguage();
      renderLives();
    };
    window.addEventListener("language:changed", syncLocalizedUi);
    window.WT?.bus?.addEventListener?.("language:changed", syncLocalizedUi);

    try {
      window.WT?.bus?.addEventListener?.("page:change", (event) => {
        const pageId = event?.detail?.id;
        if (pageId === PAGE_ID) {
          syncMatchLogo(pageId, !state.game?.hidden);
          emitWildCoin(readWildCoin());
          refreshLives();
          if (!state.game?.hidden) scheduleHint();
          return;
        }
        syncMatchLogo(pageId);
        if (state.levelPanel) state.levelPanel.hidden = true;
        if (state.economyPanel) state.economyPanel.hidden = true;
        if (state.livesPanel) state.livesPanel.hidden = true;
        if (state.prizePanel) state.prizePanel.hidden = true;
        if (state.quitPanel) state.quitPanel.hidden = true;
        if (state.winPanel) state.winPanel.hidden = true;
        document.body?.classList?.remove("match-level-open");
        if (!state.game?.hidden) closeGame();
      });
    } catch {}

    window.addEventListener("storage", (event) => {
      const key = String(event?.key || "");
      if (STORAGE_KEYS.includes(key)) refreshWildCoin();
      if (key === LIVES_STORAGE_KEY) refreshLives();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
