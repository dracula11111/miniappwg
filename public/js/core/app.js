// public/js/app.js
(() => {
  // Telegram bootstrap
  const tg = window.Telegram?.WebApp;
  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {}

  // Disable Telegram haptics globally while keeping existing calls safe.
  try {
    if (tg) {
      const noop = () => {};
      const haptic = tg.HapticFeedback || {};
      haptic.impactOccurred = noop;
      haptic.notificationOccurred = noop;
      haptic.selectionChanged = noop;
      tg.HapticFeedback = haptic;
    }
  } catch {}

  // Простые утилы
  function crc16Xmodem(bytes){
    let crc=0xffff;
    for (const b of bytes){
      crc^=(b<<8);
      for(let i=0;i<8;i++){
        crc=(crc&0x8000)?((crc<<1)^0x1021):(crc<<1);
        crc&=0xffff;
      }
    }
    return crc;
  }

  function rawToFriendly(raw,{bounceable=true,testOnly=false}={}) {
    const m = raw?.match?.(/^(-?\d+):([a-fA-F0-9]{64})$/);
    if(!m) return raw||"";
    const wc = parseInt(m[1],10);
    const hash = Uint8Array.from(m[2].match(/.{2}/g).map(h=>parseInt(h,16)));
    const tag = (bounceable?0x11:0x51) | (testOnly?0x80:0);
    const body=new Uint8Array(34); body[0]=tag; body[1]=(wc&0xff); body.set(hash,2);
    const crc=crc16Xmodem(body); const out=new Uint8Array(36);
    out.set(body,0); out[34]=(crc>>8)&0xff; out[35]=crc&0xff;
    let s=btoa(String.fromCharCode(...out));
    return s.replace(/\+/g,"-").replace(/\//g,"_");
  }

  const ensureFriendly = (addr,opts) => !addr ? "" : (/^[UE]Q/.test(addr) ? addr : rawToFriendly(addr,opts));
  const shortAddr = (addr) => addr ? `${addr.slice(0,4)}…${addr.slice(-4)}` : "Not connected";

  // Глобальчик с утилитами и простым “event bus”
  window.WT = window.WT || {};
  WT.utils = { crc16Xmodem, rawToFriendly, ensureFriendly, shortAddr };
  WT.bus   = new EventTarget();

  // ===== Language/i18n =====
  const I18N_STORAGE_KEY = "wt-language";
  const I18N_ATTRS = ["placeholder", "title", "aria-label", "alt"];
  const I18N_SUPPORTED = new Set(["en", "ru"]);
  const RUSSIAN_LANGUAGE_CODES = new Set(["ru", "uk", "be", "kk", "ky", "tg", "uz", "hy", "az"]);
  const RUSSIAN_REGION_CODES = new Set(["RU", "BY", "KZ", "KG", "TJ", "UZ", "AM", "AZ", "MD", "TM", "UA"]);

  const I18N_KEYS = {
    language_english: { en: "English", ru: "Английский" },
    language_russian: { en: "Russian", ru: "Русский" },
    about_popup: {
      en: "WildGift v1.0.0\n\nA Telegram mini app for fun gaming!",
      ru: "WildGift v1.0.0\n\nTelegram мини-приложение для игр и развлечений!"
    }
  };

  const I18N_PHRASE_BOOK = [
    ["Games", "Игры"],
    ["Market", "Маркет"],
    ["Tasks", "Задания"],
    ["Profile", "Профиль"],
    ["Players", "Игроки"],
    ["History", "История"],
    ["Contents", "Содержимое"],
    ["Open", "Открыть"],
    ["Open, win, repeat", "Открывай, выигрывай, повторяй"],
    ["Last results", "Последние результаты"],
    ["Wheel", "Колесо"],
    ["Select segment", "Выберите сектор"],
    ["Bet controls", "Управление ставками"],
    ["Bet amount", "Сумма ставки"],
    ["Clear bets", "Очистить ставки"],
    ["Betting panel", "Панель ставок"],
    ["Cases", "Кейсы"],
    ["Cases poster", "Постер кейсов"],
    ["Complete easy tasks to earn tickets. Use tickets to open free cases!", "Выполняйте простые задания и получайте билеты. Используйте билеты для открытия бесплатных кейсов!"],
    ["Start", "Начать"],
    ["Wallet", "Кошелек"],
    ["Not connected", "Не подключен"],
    ["Disconnect", "Отключить"],
    ["Connect Wallet", "Подключить кошелек"],
    ["Your wallet", "Ваш кошелек"],
    ["Balance", "Баланс"],
    ["Address", "Адрес"],
    ["Copy address", "Скопировать адрес"],
    ["Disconnect this wallet?", "Отключить этот кошелек?"],
    ["Copy", "Копировать"],
    ["Promocode", "Промокод"],
    ["Enter code", "Введите код"],
    ["Apply", "Применить"],
    ["Inventory", "Инвентарь"],
    ["No gifts yet.", "Подарков пока нет."],
    ["Bottom navigation", "Нижняя навигация"],
    ["Close", "Закрыть"],
    ["Try Again", "Попробовать снова"],
    ["Top up TON Balance", "Пополнить баланс TON"],
    ["Minimum deposit: 0.1 TON", "Минимальный депозит: 0.1 TON"],
    ["Amount to deposit", "Сумма пополнения"],
    ["Deposit TON", "Пополнить TON"],
    ["Buy Telegram Stars", "Купить Telegram Stars"],
    ["Minimum purchase: 1 ⭐", "Минимальная покупка: 1 ⭐"],
    ["Amount to buy", "Сумма покупки"],
    ["Buy Stars", "Купить Stars"],
    ["Settings", "Настройки"],
    ["Language", "Язык"],
    ["Support", "Поддержка"],
    ["About", "О приложении"],
    ["App info", "Информация о приложении"],
    ["English", "Английский"],
    ["Russian", "Русский"],
    ["English Flag", "Флаг Англии"],
    ["Russian Flag", "Флаг России"],
    ["Close settings", "Закрыть настройки"],
    ["Withdraw", "Вывод"],
    ["Continue", "Продолжить"],
    ["Processing...", "Обработка..."],
    ["Loading...", "Загрузка..."],
    ["Sell", "Продать"],
    ["Claim", "Получить"],
    ["Claimed", "Получено"],
    ["Lost", "Проигрыш"],
    ["Place Bet", "Сделать ставку"],
    ["Place bet", "Сделать ставку"],
    ["Max", "Макс"],
    ["Deposit", "Пополнить"],
    ["Connecting...", "Подключение..."],
    ["Connecting…", "Подключение…"],
    ["No active players yet", "Пока нет активных игроков"],
    ["Waiting", "Ожидание"],
    ["No bets yet", "Ставок пока нет"],
    ["No bets in this round", "В этом раунде нет ставок"],
    ["Player", "Игрок"],
    ["Bet segments", "Секторы ставок"],
    ["Bonus round in progress", "Бонусный раунд идет"],
    ["Watch live", "Смотреть"],
    ["Bonus:", "Бонус:"],
    ["gifts", "подарки"],
    ["price", "цена"],
    ["Gifts", "Подарки"],
    ["View in", "Открыть в"],
    ["Gift", "Подарок"],
    ["Filter Gifts", "Фильтр подарков"],
    ["Clear All", "Очистить все"],
    ["Show", "Показать"],
    ["No gifts available", "Нет доступных подарков"],
    ["All", "Все"],
    ["Demo", "Демо"],
    ["FREE", "БЕСПЛАТНО"],
    ["Crash chart", "График Crash"],
    ["Crash theme", "Тема Crash"],
    ["Crypto theme", "Крипто тема"],
    ["Space theme", "Космо тема"],
    ["Currency change is available after the end of the round", "Сменить валюту можно после окончания раунда"],
    ["Account banned", "Аккаунт заблокирован"],
    ["Banned account", "Заблокированный аккаунт"],
    ["Your account has been banned", "Ваш аккаунт заблокирован"],
    ["If this was done by mistake, contact support.", "Если это произошло по ошибке, обратитесь в поддержку."],
    ["You could have won", "Вы могли выиграть"],
    ["You've won!", "Вы выиграли!"],
    ["Subscribe to Wild Gift", "Подпишитесь на Wild Gift"],
    ["Invite friend", "Пригласить друга"],
    ["Top up 0.5 TON", "Пополнить на 0.5 TON"],
    ["or equivalent in Stars", "или эквивалент в Stars"],
    ["Win once in Game", "Выиграть один раз в игре"],
    ["Wheel / Crash", "Колесо / Crash"],
    ["Checking...", "Проверка..."],
    ["Check", "Проверить"],
    ["Reward already claimed.", "Награда уже получена."],
    ["Subscription confirmed. Tap Claim.", "Подписка подтверждена. Нажмите «Получить»."],
    ["Subscribe to the channel first, then tap Check.", "Сначала подпишитесь на канал, затем нажмите «Проверить»."],
    ["Subscribe to the channel first.", "Сначала подпишитесь на канал."],
    ["Failed to check subscription. Try again.", "Не удалось проверить подписку. Попробуйте снова."],
    ["Failed to claim reward.", "Не удалось получить награду."],
    ["Failed to claim reward. Try again.", "Не удалось получить награду. Попробуйте снова."],
    ["This task will be enabled later.", "Это задание будет доступно позже."],
    ["Subscribe in the channel, then return and tap Check.", "Подпишитесь на канал, затем вернитесь и нажмите «Проверить»."],
    ["Failed to connect wallet", "Не удалось подключить кошелек"],
    ["Opening wallet...", "Открываем кошелек..."],
    ["Creating invoice...", "Создаем счет..."],
    ["Opening payment...", "Открываем оплату..."],
    ["Payment failed. Please try again.", "Оплата не удалась. Попробуйте еще раз."],
    ["Failed to process payment", "Не удалось обработать платеж"],
    ["Server not configured. Please contact support.", "Сервер не настроен. Обратитесь в поддержку."],
    ["Server endpoint not configured. Please contact support.", "Endpoint сервера не настроен. Обратитесь в поддержку."],
    ["Payment service unavailable. Please contact support.", "Сервис оплаты недоступен. Обратитесь в поддержку."],
    ["Server error. Please try again later.", "Ошибка сервера. Попробуйте позже."],
    ["Network error. Please check your connection.", "Ошибка сети. Проверьте подключение."],
    ["Stars payment only works in Telegram app. Please open this page in Telegram.", "Оплата Stars работает только в приложении Telegram. Откройте эту страницу в Telegram."],
    ["You must authorize in Telegram first", "Сначала авторизуйтесь в Telegram"],
    ["Cancelled", "Отменено"],
    ["Transaction failed", "Транзакция не удалась"],
    ["✅ Success", "✅ Успешно"],
    ["Enter a promo code", "Введите промокод"],
    ["✅ Promocode applied", "✅ Промокод применен"],
    ["Network error", "Ошибка сети"],
    ["Sell error: instanceId not found", "Ошибка продажи: instanceId не найден"],
    ["Sell failed (network)", "Ошибка продажи (сеть)"],
    ["Sell failed", "Ошибка продажи"],
    ["Sell-all failed", "Ошибка продажи всех"],
    ["Return error: item id not found", "Ошибка возврата: id предмета не найден"],
    ["Return failed (network)", "Ошибка возврата (сеть)"],
    ["Not enough balance to pay withdraw fee.", "Недостаточно баланса для оплаты комиссии за вывод."],
    ["Relayer is not configured/reachable.", "Relayer не настроен или недоступен."],
    ["Failed to withdraw gift.", "Не удалось вывести подарок."],
    ["Failed to withdraw gift (network).\nContact support @", "Не удалось вывести подарок (сеть).\nСвяжитесь с поддержкой @"],
    ["Failed to withdraw: item id not found.", "Не удалось вывести: id предмета не найден."],
    ["Set your Telegram @username in settings and try again.\nTelegram requires resolvable recipient for gift transfer.", "Укажите ваш Telegram @username в настройках и попробуйте снова.\nTelegram требует определяемого получателя для перевода подарка."],
    ["Cannot resolve recipient in Telegram (TO_ID_INVALID).\nSet @username and try again, then contact support @", "Не удалось определить получателя в Telegram (TO_ID_INVALID).\nУкажите @username и попробуйте снова, затем свяжитесь с поддержкой @"],
    ["Failed to withdraw gift: relayer has not enough Stars for transfer.\nContact support @", "Не удалось вывести подарок: у relayer недостаточно Stars для перевода.\nСвяжитесь с поддержкой @"],
    ["This gift is not available in stock (relayer cannot find it).\nContact support @", "Этот подарок недоступен в наличии (relayer не может его найти).\nСвяжитесь с поддержкой @"],
    ["Invalid response", "Некорректный ответ"],
    ["Invalid request", "Некорректный запрос"],
    ["Request timeout", "Таймаут запроса"],
    ["Connection error", "Ошибка соединения"],
    ["Failed to create invoice", "Не удалось создать счет"],
    ["Failed to load", "Не удалось загрузить"],
    ["unknown error", "неизвестная ошибка"],
    ["Insufficient balance", "Недостаточно баланса"],
    ["Insufficient TON balance", "Недостаточно баланса TON"],
    ["Insufficient STARS balance", "Недостаточно баланса STARS"],
    ["Bet placed", "Ставка сделана"],
    ["Bet placed!", "Ставка сделана!"],
    ["Bet already placed", "Ставка уже сделана"],
    ["No bets placed", "Ставки не сделаны"],
    ["Wait next round", "Дождитесь следующего раунда"],
    ["Next round soon…", "Скоро следующий раунд…"],
    ["Placing bet…", "Ставка отправляется…"],
    ["User profile", "Профиль пользователя"],
    ["Menu", "Меню"],
    ["User", "Пользователь"],
    ["Unknown", "Неизвестно"],
    ["Gift Name", "Название подарка"],
    ["Open Wheel", "Открыть колесо"],
    ["Open Crash", "Открыть Crash"],
    ["Open Cases", "Открыть кейсы"],
    ["Wheel canvas", "Холст колеса"],
    ["Crash", "Crash"],
    ["Error", "Ошибка"],
    ["Go back", "Назад"],
    ["Test mode - Ready", "Тестовый режим - готово"],
    ["🧪 Test Mode: Unlimited Balance", "🧪 Тестовый режим: безлимитный баланс"],
    ["WildGift v1.0.0\n\nA Telegram mini app for fun gaming!", "WildGift v1.0.0\n\nTelegram мини-приложение для игр и развлечений!"],
    ["🎁 Try Again", "🎁 Попробовать снова"]
  ];

  const I18N_PATTERN_RULES = {
    ru: [
      { re: /^Bet:\s*(.+)$/i, to: (_m, value) => `Ставка: ${value}` },
      { re: /^Bonus:\s*(.+)$/i, to: (_m, value) => `Бонус: ${value}` },
      { re: /^Withdrawal fee:\s*(.+)$/i, to: (_m, value) => `Комиссия за вывод: ${value}` },
      { re: /^Recipient:\s*(.+)$/i, to: (_m, value) => `Получатель: ${value}` },
      { re: /^Claim successful:\s*(.+)$/i, to: (_m, value) => `Награда получена: ${value}` },
      { re: /^Insufficient\s+([A-Z]+)\s+balance$/i, to: (_m, cur) => `Недостаточно баланса ${cur}` },
      { re: /^Sell failed\s*\((.+)\)$/i, to: (_m, code) => `Ошибка продажи (${code})` },
      { re: /^Return failed\s*\((.+)\)$/i, to: (_m, code) => `Ошибка возврата (${code})` },
      { re: /^Error\s*\((.+)\)$/i, to: (_m, code) => `Ошибка (${code})` },
      { re: /^Contact support @(.+)$/i, to: (_m, uname) => `Свяжитесь с поддержкой @${uname}` },
      { re: /^Deposited\s+(.+?)\s+TON\s*\n\s*\n\s*Your balance will update automatically\.$/i, to: (_m, amount) => `Пополнено ${amount} TON\n\nБаланс обновится автоматически.` },
      { re: /^Purchased\s+(.+?)\s+⭐\s+Stars!\s*\n\s*\n\s*Your balance will update automatically\.$/i, to: (_m, amount) => `Куплено ${amount} ⭐ Stars!\n\nБаланс обновится автоматически.` },
      { re: /^✅\s*Purchased\s+(.+?)\s+⭐\s+Stars!$/i, to: (_m, amount) => `✅ Куплено ${amount} ⭐ Stars!` }
    ],
    en: [
      { re: /^Ставка:\s*(.+)$/i, to: (_m, value) => `Bet: ${value}` },
      { re: /^Бонус:\s*(.+)$/i, to: (_m, value) => `Bonus: ${value}` },
      { re: /^Комиссия за вывод:\s*(.+)$/i, to: (_m, value) => `Withdrawal fee: ${value}` },
      { re: /^Получатель:\s*(.+)$/i, to: (_m, value) => `Recipient: ${value}` },
      { re: /^Награда получена:\s*(.+)$/i, to: (_m, value) => `Claim successful: ${value}` },
      { re: /^Недостаточно баланса\s+([A-Z]+)$/i, to: (_m, cur) => `Insufficient ${cur} balance` },
      { re: /^Ошибка продажи\s*\((.+)\)$/i, to: (_m, code) => `Sell failed (${code})` },
      { re: /^Ошибка возврата\s*\((.+)\)$/i, to: (_m, code) => `Return failed (${code})` },
      { re: /^Ошибка\s*\((.+)\)$/i, to: (_m, code) => `Error (${code})` },
      { re: /^Свяжитесь с поддержкой @(.+)$/i, to: (_m, uname) => `Contact support @${uname}` },
      { re: /^Пополнено\s+(.+?)\s+TON\s*\n\s*\n\s*Баланс обновится автоматически\.$/i, to: (_m, amount) => `Deposited ${amount} TON\n\nYour balance will update automatically.` },
      { re: /^Куплено\s+(.+?)\s+⭐\s+Stars!\s*\n\s*\n\s*Баланс обновится автоматически\.$/i, to: (_m, amount) => `Purchased ${amount} ⭐ Stars!\n\nYour balance will update automatically.` },
      { re: /^✅\s*Куплено\s+(.+?)\s+⭐\s+Stars!$/i, to: (_m, amount) => `✅ Purchased ${amount} ⭐ Stars!` }
    ]
  };

  function normalizeLanguage(value) {
    const lang = String(value || "").trim().toLowerCase();
    if (lang.startsWith("ru")) return "ru";
    if (lang.startsWith("en")) return "en";
    return I18N_SUPPORTED.has(lang) ? lang : "";
  }

  function normalizePhrase(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  const EN_TO_RU = new Map();
  const RU_TO_EN = new Map();
  for (const [enText, ruText] of I18N_PHRASE_BOOK) {
    const enKey = normalizePhrase(enText);
    const ruKey = normalizePhrase(ruText);
    if (enKey && !EN_TO_RU.has(enKey)) EN_TO_RU.set(enKey, ruText);
    if (ruKey && !RU_TO_EN.has(ruKey)) RU_TO_EN.set(ruKey, enText);
  }

  function translateByDictionary(text, targetLanguage) {
    const key = normalizePhrase(text);
    if (!key) return text;
    if (targetLanguage === "ru") return EN_TO_RU.get(key) || text;
    if (targetLanguage === "en") return RU_TO_EN.get(key) || text;
    return text;
  }

  function applyPatternRules(text, targetLanguage) {
    const rules = I18N_PATTERN_RULES[targetLanguage] || [];
    for (const rule of rules) {
      if (rule.re.test(text)) return text.replace(rule.re, rule.to);
    }
    return text;
  }

  function translateText(rawText, targetLanguage) {
    const text = String(rawText ?? "");
    const lang = normalizeLanguage(targetLanguage) || "en";
    if (!text.trim()) return text;

    const byPattern = applyPatternRules(text, lang);
    if (byPattern !== text) return byPattern;

    const byDict = translateByDictionary(text, lang);
    if (byDict !== text) return byDict;

    return text;
  }

  function translateByKey(key, fallback = "", targetLanguage = "en") {
    const entry = I18N_KEYS[key];
    if (!entry) return String(fallback || "");
    const lang = normalizeLanguage(targetLanguage) || "en";
    return String(entry[lang] || fallback || entry.en || "");
  }

  function detectLanguageFromLocale(locale) {
    const raw = String(locale || "").trim();
    if (!raw) return "";

    const parts = raw.replace(/_/g, "-").split("-").filter(Boolean);
    const lang = String(parts[0] || "").toLowerCase();
    const region = String(parts[1] || "").toUpperCase();

    if (lang === "en") return "en";
    if (lang === "ru") return "ru";
    if (RUSSIAN_LANGUAGE_CODES.has(lang)) return "ru";
    if (region && RUSSIAN_REGION_CODES.has(region)) return "ru";
    return "";
  }

  function detectPreferredLanguage() {
    const candidates = [];
    try {
      candidates.push(tg?.initDataUnsafe?.user?.language_code);
      candidates.push(tg?.initDataUnsafe?.user?.languageCode);
    } catch {}

    try {
      if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
      candidates.push(navigator.language);
      candidates.push(navigator.userLanguage);
    } catch {}

    for (const candidate of candidates) {
      const detected = detectLanguageFromLocale(candidate);
      if (detected) return detected;
    }

    return "en";
  }

  function readStoredLanguage() {
    try {
      const stored = normalizeLanguage(localStorage.getItem(I18N_STORAGE_KEY));
      return stored || "";
    } catch {
      return "";
    }
  }

  function writeStoredLanguage(lang) {
    try { localStorage.setItem(I18N_STORAGE_KEY, lang); } catch {}
  }

  let currentLanguage = "en";
  let i18nObserver = null;
  let i18nApplying = false;

  function shouldSkipI18nNode(node) {
    const parent = node?.parentElement;
    if (!parent) return false;
    const tag = String(parent.tagName || "").toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA") return true;
    if (parent.closest?.("[data-wt-i18n-ignore='1']")) return true;
    return false;
  }

  function translateTextNode(node, targetLanguage = currentLanguage) {
    if (!(node instanceof Text)) return;
    if (shouldSkipI18nNode(node)) return;

    const raw = String(node.nodeValue || "");
    if (!raw.trim()) return;

    const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!match) return;

    const [, leading, core, trailing] = match;
    const translatedCore = translateText(core, targetLanguage);
    if (translatedCore !== core) node.nodeValue = `${leading}${translatedCore}${trailing}`;
  }

  function translateElementAttributes(el, targetLanguage = currentLanguage) {
    if (!(el instanceof Element)) return;
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;

    for (const attr of I18N_ATTRS) {
      const value = el.getAttribute(attr);
      if (!value || !value.trim()) continue;
      const translated = translateText(value, targetLanguage);
      if (translated !== value) el.setAttribute(attr, translated);
    }
  }

  function translateSubtree(root, targetLanguage = currentLanguage) {
    if (!root) return;
    const lang = normalizeLanguage(targetLanguage) || currentLanguage;

    if (root instanceof Text) {
      translateTextNode(root, lang);
      return;
    }

    if (root instanceof Element) {
      translateElementAttributes(root, lang);
      root.querySelectorAll?.("*").forEach((el) => translateElementAttributes(el, lang));
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        translateTextNode(node, lang);
        node = walker.nextNode();
      }
      return;
    }

    if (root === document) translateSubtree(document.body || document.documentElement, lang);
  }

  function ensureI18nObserver() {
    if (i18nObserver || typeof MutationObserver !== "function" || !document.body) return;

    i18nObserver = new MutationObserver((mutations) => {
      if (i18nApplying) return;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => translateSubtree(node, currentLanguage));
          continue;
        }
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target, currentLanguage);
          continue;
        }
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateElementAttributes(mutation.target, currentLanguage);
        }
      }
    });

    i18nObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: I18N_ATTRS
    });
  }

  function applyLanguage(nextLanguage, options = {}) {
    const targetLanguage = normalizeLanguage(nextLanguage) || "en";
    const persist = options.persist !== false;
    const emit = options.emit !== false;
    const force = options.force === true;

    if (!force && targetLanguage === currentLanguage) {
      if (persist) writeStoredLanguage(targetLanguage);
      return currentLanguage;
    }

    currentLanguage = targetLanguage;
    if (document?.documentElement) document.documentElement.lang = currentLanguage;
    if (document?.body) document.body.setAttribute("data-wt-lang", currentLanguage);
    if (persist) writeStoredLanguage(currentLanguage);

    i18nApplying = true;
    try {
      translateSubtree(document.body || document.documentElement, currentLanguage);
    } finally {
      i18nApplying = false;
    }

    ensureI18nObserver();

    if (emit) {
      try { window.dispatchEvent(new CustomEvent("language:changed", { detail: { language: currentLanguage } })); } catch {}
      try { WT.bus.dispatchEvent(new CustomEvent("language:changed", { detail: { language: currentLanguage } })); } catch {}
    }

    return currentLanguage;
  }

  const i18nApi = {
    getLanguage: () => currentLanguage,
    detectLanguage: detectPreferredLanguage,
    detectLanguageFromLocale,
    isRussianLocale: (locale) => detectLanguageFromLocale(locale) === "ru",
    changeLanguage: (lang, options = {}) => applyLanguage(lang, options),
    translate: (text, lang = currentLanguage) => translateText(text, lang),
    t: (key, fallback = "") => translateByKey(key, fallback, currentLanguage)
  };

  WT.i18n = i18nApi;
  WT.changeLanguage = (lang, options = {}) => applyLanguage(lang, options);
  WT.getLanguage = () => currentLanguage;
  WT.t = (key, fallback = "") => translateByKey(key, fallback, currentLanguage);

  const storedLanguage = readStoredLanguage();
  const initialLanguage = storedLanguage || detectPreferredLanguage();
  applyLanguage(initialLanguage, { persist: !storedLanguage, emit: false, force: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureI18nObserver();
      applyLanguage(currentLanguage, { persist: false, emit: false, force: true });
    }, { once: true });
  } else {
    ensureI18nObserver();
  }

  // ===== Global image loading effect =====
  const IMG_TRACK_ATTR = "data-wt-img-bound";
  const IMG_LOADING_CLASS = "wt-img-loading";
  const IMG_ERROR_CLASS = "wt-img-error";
  const boundImgs = new WeakSet();
  const pendingImgSync = new Map();
  let imgSyncRaf = 0;
  let imgObserver = null;

  function imgHasSource(img) {
    return Boolean(img.currentSrc || img.getAttribute("src") || img.getAttribute("srcset"));
  }

  function imgRadius(img) {
    try {
      const radius = window.getComputedStyle(img).borderRadius;
      return radius || "12px";
    } catch {
      return "12px";
    }
  }

  function markImgLoading(img) {
    if (!imgHasSource(img)) {
      img.classList.remove(IMG_LOADING_CLASS, IMG_ERROR_CLASS);
      return;
    }
    img.style.setProperty("--wt-img-loader-radius", imgRadius(img));
    img.classList.add(IMG_LOADING_CLASS);
    img.classList.remove(IMG_ERROR_CLASS);
  }

  function markImgDone(img, hasError = false) {
    img.classList.remove(IMG_LOADING_CLASS);
    img.classList.toggle(IMG_ERROR_CLASS, !!hasError);
  }

  function syncImgState(img, { forceLoading = false } = {}) {
    if (!(img instanceof HTMLImageElement)) return;
    if (!imgHasSource(img)) {
      img.classList.remove(IMG_LOADING_CLASS, IMG_ERROR_CLASS);
      return;
    }

    if (forceLoading && !img.complete) {
      markImgLoading(img);
      return;
    }

    if (!img.complete) {
      markImgLoading(img);
      return;
    }

    if (img.naturalWidth > 0 || img.naturalHeight > 0) markImgDone(img, false);
    else markImgDone(img, true);
  }

  function scheduleImgSync(img, forceLoading = false) {
    if (!(img instanceof HTMLImageElement)) return;
    const prev = pendingImgSync.get(img) || false;
    pendingImgSync.set(img, prev || forceLoading);
    if (imgSyncRaf) return;
    imgSyncRaf = window.requestAnimationFrame(() => {
      imgSyncRaf = 0;
      pendingImgSync.forEach((forced, node) => {
        syncImgState(node, { forceLoading: forced });
      });
      pendingImgSync.clear();
    });
  }

  function bindImg(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (boundImgs.has(img)) {
      scheduleImgSync(img, false);
      return;
    }

    boundImgs.add(img);
    img.setAttribute(IMG_TRACK_ATTR, "1");
    img.addEventListener("load", () => markImgDone(img, false));
    img.addEventListener("error", () => markImgDone(img, true));
    scheduleImgSync(img, false);
  }

  function bindImgsInside(root) {
    if (!root) return;
    if (root instanceof HTMLImageElement) {
      bindImg(root);
      return;
    }
    if (typeof root.querySelectorAll === "function") {
      root.querySelectorAll("img").forEach(bindImg);
    }
  }

  function initGlobalImgLoader() {
    const root = document.body;
    if (!root) return;

    bindImgsInside(root);
    if (typeof MutationObserver !== "function") return;

    if (imgObserver) imgObserver.disconnect();
    imgObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => bindImgsInside(node));
          continue;
        }
        if (mutation.type === "attributes" && mutation.target instanceof HTMLImageElement) {
          bindImg(mutation.target);
          scheduleImgSync(mutation.target, true);
        }
      }
    });

    imgObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset"]
    });

    window.addEventListener("beforeunload", () => {
      if (imgObserver) imgObserver.disconnect();
    }, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlobalImgLoader, { once: true });
  } else {
    initGlobalImgLoader();
  }

  // ===== Global liquid-glass notifications =====
  const TOAST_HOST_ID = 'wt-toast-host';
  let toastTimer = null;

  function ensureToastHost() {
    let host = document.getElementById(TOAST_HOST_ID);
    if (host) return host;

    host = document.createElement('div');
    host.id = TOAST_HOST_ID;
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
    return host;
  }

  function detectToastTone(text) {
    const msg = String(text || '').trim().toLowerCase();
    if (!msg) return '';

    if (
      msg.includes('❌') ||
      /(^|\s)(error|failed|timeout|insufficient|unavailable)(\s|$)/i.test(msg) ||
      /(ошибк|не удалось|недостаточно|недоступ|устарел|таймаут)/i.test(msg)
    ) {
      return 'error';
    }

    if (
      msg.includes('⚠') ||
      /(^|\s)(warning|refreshing|retry)(\s|$)/i.test(msg) ||
      /(вниман|обнов|повторите)/i.test(msg)
    ) {
      return 'warning';
    }

    if (
      msg.includes('✅') ||
      /(^|\s)(success|successful|purchased|sold|saved|applied|credited|claimed)(\s|$)/i.test(msg) ||
      /(успеш|куплен|куплено|сохранен|сохранено|сохранены|применен|применено|начислен|начислено|продан|продано)/i.test(msg)
    ) {
      return 'success';
    }

    return '';
  }

  function showLiquidToast(message, opts = {}) {
    const raw = String(message ?? "");
    const localized = opts?.translate === false
      ? raw
      : (WT.i18n?.translate?.(raw) || raw);
    const text = String(localized).trim();
    if (!text) return;

    const ttl = Number.isFinite(Number(opts.ttl)) ? Math.max(1000, Number(opts.ttl)) : 2600;
    const host = ensureToastHost();
    const variant = String(opts.variant || '').trim();
    const tokens = variant ? variant.split(/\s+/).filter(Boolean) : [];
    const tone = ['success', 'error', 'warning'].find((token) => tokens.includes(token)) || detectToastTone(text);

    host.classList.remove('wt-toast--market');
    host.classList.remove('wt-toast--success', 'wt-toast--error', 'wt-toast--warning');
    if (tokens.includes('market')) host.classList.add('wt-toast--market');
    if (tone) host.classList.add(`wt-toast--${tone}`);

    host.textContent = text;
    host.classList.remove('is-out');
    host.classList.add('is-in');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      host.classList.remove('is-in');
      host.classList.add('is-out');
    }, ttl);

    return true;
  }

  window.showToast = showLiquidToast;
  window.notify = (message, opts) => showLiquidToast(message, opts);

  const nativeAlert = typeof window.alert === 'function' ? window.alert.bind(window) : null;
  window.alert = (message) => {
    const shown = showLiquidToast(message);
    if (!shown && nativeAlert) nativeAlert(message);
  };


  // ===== Games hub =====
  const GAMES_PAGE_ID = "gamesPage";
  const PAGE_HISTORY_KEY = "__wtPage";
  const GAMES_CHILD_PAGES = new Set(["wheelPage", "crashPage", "casesPage"]);

  // какие страницы считаем "внутри Games" (в навбаре подсвечиваем Games)
  const NAV_ALIAS = {
    crashPage: GAMES_PAGE_ID,
    casesPage: GAMES_PAGE_ID,
    wheelPage: GAMES_PAGE_ID
  };
  const navKeyForPage = (id) => NAV_ALIAS[id] || id;
  const getActivePageId = () => document.querySelector(".page.page-active")?.id || null;
  const readHistoryPage = (state = window.history?.state) => {
    const id = state?.[PAGE_HISTORY_KEY];
    return (typeof id === "string" && id) ? id : null;
  };

  function writeHistoryPage(id, { replace = false } = {}) {
    if (!id || !window.history) return;

    const baseState = (window.history.state && typeof window.history.state === "object")
      ? window.history.state
      : {};
    const nextState = { ...baseState, [PAGE_HISTORY_KEY]: id };

    try {
      if (replace && typeof window.history.replaceState === "function") {
        window.history.replaceState(nextState, "", window.location.href);
      } else if (!replace && typeof window.history.pushState === "function") {
        window.history.pushState(nextState, "", window.location.href);
      }
    } catch {}
  }


  function ensureGamesPage() {
    let page = document.getElementById(GAMES_PAGE_ID);
    if (page) return page;

    page = document.createElement("main");
    page.id = GAMES_PAGE_ID;
    page.className = "page";

    page.innerHTML = `
      <section class="games">
        <header class="games__head">
          <h1 class="games__title">Games</h1>
        </header>

        <div class="games-grid">
          <button class="game-tile game-tile--wheel" type="button" data-go="wheelPage" aria-label="Open Wheel">
            
          </button>

          <button class="game-tile game-tile--crash" type="button" data-go="crashPage" aria-label="Open Crash">
           
          </button>

          <button class="game-tile game-tile--cases" type="button" data-go="casesPage" aria-label="Open Cases">
            
          </button>

          <button class="game-tile game-tile--soon" type="button" disabled aria-disabled="true">
           
          </button>
        </div>
      </section>
    `;

    const appRoot = document.querySelector(".app") || document.body;
    const bottomNav = appRoot.querySelector(".bottom-nav") || document.querySelector(".bottom-nav");
    if (bottomNav) appRoot.insertBefore(page, bottomNav);
    else appRoot.appendChild(page);

    // клики по постерам -> открываем выбранную игру
    page.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-go");
        if (!target) return;
        if (!document.getElementById(target)) {
          console.warn(`[WT] Page not found: ${target}`);
          return;
        }
        activatePage(target);
      });
    });

    return page;
  }

  // Навигация между страницами
  function activatePage(id, options = {}){
    const { fromHistory = false } = options;
    const pg = document.getElementById(id);
    if (!pg) {
      console.warn(`[WT] Page not found: ${id}`);
      return;
    }

    const currentId = getActivePageId();

    if (
      !fromHistory &&
      id === GAMES_PAGE_ID &&
      GAMES_CHILD_PAGES.has(currentId) &&
      readHistoryPage() === currentId &&
      typeof window.history?.back === "function"
    ) {
      window.history.back();
      return;
    }

    document.querySelectorAll(".page").forEach(p=>p.classList.remove("page-active"));
    pg.classList.add("page-active");

    // выставляем класс страницы на body (для page-specific CSS)
    // пример: wheelPage -> body.page-wheel
    try {
      const body = document.body;
      // удаляем старые page-* классы
      body.className = body.className
        .split(/\s+/)
        .filter(c => c && !c.startsWith('page-'))
        .join(' ');

      const pageKey = String(id)
        .replace(/Page$/,'')
        .replace(/Page/i,'')
        .toLowerCase();
      body.classList.add(`page-${pageKey}`);
    } catch {}

    // nav highlight (Crash/Cases/Wheel -> Games)
    const navKey = navKeyForPage(id);
    document.querySelectorAll(".bottom-nav .nav-item").forEach(i=>i.classList.remove("active"));
    document.querySelector(`.bottom-nav .nav-item[data-target="${navKey}"]`)?.classList.add("active");

    if (!fromHistory) {
      const shouldPush = GAMES_CHILD_PAGES.has(id);
      const currentHistoryPage = readHistoryPage();

      if (shouldPush) {
        if (currentHistoryPage !== id) {
          writeHistoryPage(id, { replace: false });
        }
      } else if (currentHistoryPage !== id || currentId == null) {
        writeHistoryPage(id, { replace: true });
      }
    }

    WT.bus.dispatchEvent(new CustomEvent("page:change", { detail:{ id } }));
  }

  // Экспортируем навигацию (чтобы другие модули могли дергать при необходимости)
  WT.activatePage = activatePage;
  WT.navigate = activatePage;

  window.addEventListener("popstate", (event) => {
    const targetId = readHistoryPage(event.state);
    if (targetId && document.getElementById(targetId)) {
      activatePage(targetId, { fromHistory: true });
      return;
    }

    const currentId = getActivePageId();
    if (GAMES_CHILD_PAGES.has(currentId) && document.getElementById(GAMES_PAGE_ID)) {
      activatePage(GAMES_PAGE_ID, { fromHistory: true });
      writeHistoryPage(GAMES_PAGE_ID, { replace: true });
    }
  });

  // Делегируем клики по нижней навигации (так работает и для динамически добавленных пунктов)
  const bottomNav = document.querySelector(".bottom-nav");
  bottomNav?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".nav-item");
    if (!btn || !bottomNav.contains(btn)) return;

    // если нав-айтем — ссылка, не даём браузеру прыгать по href
    try {
      const tag = String(btn.tagName || "").toUpperCase();
      if (tag === "A" || btn.getAttribute("href")) e.preventDefault();
    } catch {}

    const target = btn.getAttribute("data-target");
    if (target) activatePage(target);
  });

  // Создаём Games-хаб и пункт в навбаре (если его ещё нет)
  ensureGamesPage();

  // Если при старте нет активной — активируем Games (или первую)
  if(!document.querySelector(".page.page-active")){
    const games = document.getElementById(GAMES_PAGE_ID);
    if (games) activatePage(GAMES_PAGE_ID);
    else {
      const first = document.querySelector(".page");
      if(first) activatePage(first.id);
    }
  }
})();
