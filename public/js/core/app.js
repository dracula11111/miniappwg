// public/js/app.js
(() => {
  // Silence client console in production-like environments.
  // Enable logs via ?debug=1 or localStorage.WT_DEBUG_LOGS=1.
  try {
    const originalConsole = window.__WT_ORIGINAL_CONSOLE__ || {
      log: console.log.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      trace: console.trace.bind(console)
    };
    window.__WT_ORIGINAL_CONSOLE__ = originalConsole;

    const q = new URLSearchParams(window.location.search || "");
    const queryDebug = q.get("debug") === "1";
    const storageDebug = (() => {
      try { return localStorage.getItem("WT_DEBUG_LOGS") === "1"; }
      catch (_) { return false; }
    })();
    const shouldSilence = !(queryDebug || storageDebug);

    const noop = () => {};
    if (shouldSilence) {
      console.log = noop;
      console.info = noop;
      console.debug = noop;
      console.warn = noop;
      console.error = noop;
      console.trace = noop;
    } else {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.debug = originalConsole.debug;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.trace = originalConsole.trace;
    }
  } catch (_) {}

  // Telegram bootstrap
  const tg = window.Telegram?.WebApp;
  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch {}

  const TG_WRITE_ACCESS_KEY_PREFIX = "wt:tg:write-access:";
  function requestTelegramWriteAccessOnce() {
    if (!tg || typeof tg.requestWriteAccess !== "function") return;
    try {
      if (typeof tg.isVersionAtLeast === "function" && !tg.isVersionAtLeast("6.9")) return;
    } catch {}

    const userIdRaw = tg?.initDataUnsafe?.user?.id;
    const userId = userIdRaw === undefined || userIdRaw === null ? "" : String(userIdRaw).trim();
    if (!userId) return;

    const storageKey = `${TG_WRITE_ACCESS_KEY_PREFIX}${userId}`;
    let alreadyRequested = false;
    try {
      alreadyRequested = localStorage.getItem(storageKey) !== null;
    } catch {}
    if (alreadyRequested) return;

    try {
      tg.requestWriteAccess((allowed) => {
        try {
          localStorage.setItem(storageKey, allowed ? "1" : "0");
        } catch {}
      });
    } catch {}
  }
  requestTelegramWriteAccessOnce();

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

  // РџСЂРѕСЃС‚С‹Рµ СѓС‚РёР»С‹
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
  const shortAddr = (addr) => addr ? `${addr.slice(0,4)}вЂ¦${addr.slice(-4)}` : "Not connected";

  // Р“Р»РѕР±Р°Р»СЊС‡РёРє СЃ СѓС‚РёР»РёС‚Р°РјРё Рё РїСЂРѕСЃС‚С‹Рј вЂњevent busвЂќ
  window.WT = window.WT || {};
  WT.utils = { crc16Xmodem, rawToFriendly, ensureFriendly, shortAddr };
  WT.bus   = new EventTarget();

  // ===== Language/i18n =====
  const I18N_STORAGE_KEY = "wt-language";
  const I18N_USER_STORAGE_KEY_PREFIX = "wt-language:user:";
  const I18N_SERVER_ENDPOINT = "/api/user/language";
  const I18N_ATTRS = ["placeholder", "title", "aria-label", "alt"];
  const I18N_SUPPORTED = new Set(["en", "ru"]);
  const RUSSIAN_LANGUAGE_CODES = new Set(["ru", "uk", "be", "kk"]);
  const RUSSIAN_REGION_CODES = new Set(["RU", "BY", "KZ", "UA"]);
  const MOJIBAKE_MARKER_RE = /[\u0402-\u040F\u0452-\u045F\u0490\u0491\u0404\u0454\u0406\u0456\u0407\u0457\u2116\u00C0-\u00FF]/;
  const CP1251_HIGH_CHARS =
    "\u0402\u0403\u201A\u0453\u201E\u2026\u2020\u2021\u20AC\u2030\u0409\u2039\u040A\u040C\u040B\u040F" +
    "\u0452\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u0000\u2122\u0459\u203A\u045A\u045C\u045B\u045F" +
    "\u00A0\u040E\u045E\u0408\u00A4\u0490\u00A6\u00A7\u0401\u00A9\u0404\u00AB\u00AC\u00AD\u00AE\u0407" +
    "\u00B0\u00B1\u0406\u0456\u0491\u00B5\u00B6\u00B7\u0451\u2116\u0454\u00BB\u0458\u0405\u0455\u0457" +
    "\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F" +
    "\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F" +
    "\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F" +
    "\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F";
  const CP1251_BYTE_BY_CHAR = new Map();
  for (let i = 0; i < CP1251_HIGH_CHARS.length; i += 1) {
    const ch = CP1251_HIGH_CHARS[i];
    if (ch !== "\u0000" && !CP1251_BYTE_BY_CHAR.has(ch)) {
      CP1251_BYTE_BY_CHAR.set(ch, 0x80 + i);
    }
  }
  const UTF8_DECODER = typeof TextDecoder === "function"
    ? new TextDecoder("utf-8", { fatal: false })
    : null;

  function mojibakeScore(text) {
    const value = String(text || "");
    if (!value) return 0;
    const chars = Array.from(value);
    let score = 0;
    let controls = 0;
    let rareCyr = 0;
    let suspiciousLead = 0;

    for (let i = 0; i < chars.length; i += 1) {
      const cp = chars[i].codePointAt(0);
      if (!Number.isFinite(cp)) continue;

      if (cp >= 0x80 && cp <= 0x9F) controls += 1;

      const isCyr = cp >= 0x400 && cp <= 0x4FF;
      const isCommonRu = (cp >= 0x410 && cp <= 0x44F) || cp === 0x401 || cp === 0x451;
      if (isCyr && !isCommonRu) rareCyr += 1;

      if (i + 1 >= chars.length) continue;
      const next = chars[i + 1].codePointAt(0);
      const isLead = cp === 0x420 || cp === 0x421 || cp === 0x00D0 || cp === 0x00D1;
      const isSuspiciousTail =
        (next >= 0x80 && next <= 0xBF) ||
        (next >= 0x450 && next <= 0x45F) ||
        next === 0x00BB ||
        next === 0x00B5 ||
        next === 0x2039 ||
        next === 0x203A ||
        next === 0x2116;
      if (isLead && isSuspiciousTail) suspiciousLead += 1;
    }

    score += controls * 3;
    score += rareCyr * 2;
    score += suspiciousLead * 2;

    if (/[РС][^ \n\r\t]{0,2}[РС]/.test(value)) score += 3;
    if (/[ÐÑ][^ \n\r\t]{0,2}[ÐÑ]/.test(value)) score += 3;
    if (value.includes("вЂ") || value.includes("рџ")) score += 4;
    if (/[âÃÂ][\x80-\xBF]/.test(value)) score += 3;
    if (/[\uFFFD]/.test(value)) score += 2;
    return score;
  }

  function decodeCp1251Mojibake(rawValue) {
    const text = String(rawValue ?? "");
    if (!text || !UTF8_DECODER) return text;
    if (!MOJIBAKE_MARKER_RE.test(text) && !text.includes("вЂ") && !text.includes("рџ")) return text;

    const bytes = [];
    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (!Number.isFinite(code)) return text;
      if (code <= 0x7F) {
        bytes.push(code);
        continue;
      }

      const mapped = CP1251_BYTE_BY_CHAR.get(ch);
      if (mapped != null) {
        bytes.push(mapped);
        continue;
      }

      if (code >= 0x0410 && code <= 0x042F) {
        bytes.push(code - 0x0410 + 0xC0);
        continue;
      }
      if (code >= 0x0430 && code <= 0x044F) {
        bytes.push(code - 0x0430 + 0xE0);
        continue;
      }
      if (code === 0x0401) {
        bytes.push(0xA8);
        continue;
      }
      if (code === 0x0451) {
        bytes.push(0xB8);
        continue;
      }
      if (code <= 0xFF) {
        bytes.push(code & 0xFF);
        continue;
      }

      return text;
    }

    try {
      const decoded = UTF8_DECODER.decode(Uint8Array.from(bytes));
      if (!decoded || decoded.includes("\uFFFD")) return text;
      return decoded.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") || text;
    } catch (_) { return text; }
  }

  function decodeLatin1Mojibake(rawValue) {
    const text = String(rawValue ?? "");
    if (!text || !UTF8_DECODER) return text;
    if (!/[ÐÑâÃÂ]/.test(text)) return text;

    const bytes = [];
    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (!Number.isFinite(code) || code > 0xFF) return text;
      bytes.push(code & 0xFF);
    }

    try {
      const decoded = UTF8_DECODER.decode(Uint8Array.from(bytes));
      if (!decoded || decoded.includes("\uFFFD")) return text;
      return decoded.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") || text;
    } catch (_) { return text; }
  }

  function decodeMojibakeText(rawValue) {
    const text = String(rawValue ?? "");
    if (!text) return text;

    let best = text;
    let bestScore = mojibakeScore(text);

    const candidates = [
      decodeCp1251Mojibake(text),
      decodeLatin1Mojibake(text)
    ];

    for (const candidate of candidates) {
      if (!candidate || candidate === best) continue;
      const score = mojibakeScore(candidate);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    const secondPass = best === text
      ? best
      : decodeLatin1Mojibake(decodeCp1251Mojibake(best));
    if (secondPass && secondPass !== best && mojibakeScore(secondPass) < bestScore) {
      best = secondPass;
    }

    return best;
  }

  const I18N_KEYS = {
    language_english: { en: "English", ru: "РђРЅРіР»РёР№СЃРєРёР№" },
    language_russian: { en: "Russian", ru: "Р СѓСЃСЃРєРёР№" },
    about_popup: {
      en: "WildGift v1.0.0\n\nA Telegram mini app for fun gaming!",
      ru: "WildGift v1.0.0\n\nTelegram РјРёРЅРё-РїСЂРёР»РѕР¶РµРЅРёРµ РґР»СЏ РёРіСЂ Рё СЂР°Р·РІР»РµС‡РµРЅРёР№!"
    }
  };

  const I18N_PHRASE_BOOK = [
    ["Match", "\u041c\u044d\u0442\u0447"],
    ["Games", "РРіСЂС‹"],
    ["Market", "РњР°СЂРєРµС‚"],
    ["Tasks", "Р—Р°РґР°РЅРёСЏ"],
    ["Profile", "РџСЂРѕС„РёР»СЊ"],
    ["Players", "РРіСЂРѕРєРё"],
    ["History", "РСЃС‚РѕСЂРёСЏ"],
    ["Contents", "РЎРѕРґРµСЂР¶РёРјРѕРµ"],
    ["Open", "РћС‚РєСЂС‹С‚СЊ"],
    ["Open, win, repeat", "РћС‚РєСЂС‹РІР°Р№, РІС‹РёРіСЂС‹РІР°Р№, РїРѕРІС‚РѕСЂСЏР№"],
    ["Last results", "РџРѕСЃР»РµРґРЅРёРµ СЂРµР·СѓР»СЊС‚Р°С‚С‹"],
    ["Wheel", "РљРѕР»РµСЃРѕ"],
    ["Select segment", "Р’С‹Р±РµСЂРёС‚Рµ СЃРµРєС‚РѕСЂ"],
    ["Bet controls", "РЈРїСЂР°РІР»РµРЅРёРµ СЃС‚Р°РІРєР°РјРё"],
    ["Bet amount", "РЎСѓРјРјР° СЃС‚Р°РІРєРё"],
    ["Clear bets", "РћС‡РёСЃС‚РёС‚СЊ СЃС‚Р°РІРєРё"],
    ["Betting panel", "РџР°РЅРµР»СЊ СЃС‚Р°РІРѕРє"],
    ["Cases", "РљРµР№СЃС‹"],
    ["Cases poster", "РџРѕСЃС‚РµСЂ РєРµР№СЃРѕРІ"],
    ["Complete easy tasks to earn tickets. Use tickets to open free cases!", "Р’С‹РїРѕР»РЅСЏР№С‚Рµ РїСЂРѕСЃС‚С‹Рµ Р·Р°РґР°РЅРёСЏ Рё РїРѕР»СѓС‡Р°Р№С‚Рµ Р±РёР»РµС‚С‹. РСЃРїРѕР»СЊР·СѓР№С‚Рµ Р±РёР»РµС‚С‹ РґР»СЏ РѕС‚РєСЂС‹С‚РёСЏ Р±РµСЃРїР»Р°С‚РЅС‹С… РєРµР№СЃРѕРІ!"],
    ["Start", "РќР°С‡Р°С‚СЊ"],
    ["Wallet", "РљРѕС€РµР»РµРє"],
    ["Not connected", "РќРµ РїРѕРґРєР»СЋС‡РµРЅ"],
    ["Disconnect", "РћС‚РєР»СЋС‡РёС‚СЊ"],
    ["Connect Wallet", "РџРѕРґРєР»СЋС‡РёС‚СЊ РєРѕС€РµР»РµРє"],
    ["Your wallet", "Р’Р°С€ РєРѕС€РµР»РµРє"],
    ["Balance", "Р‘Р°Р»Р°РЅСЃ"],
    ["Address", "РђРґСЂРµСЃ"],
    ["Copy address", "РЎРєРѕРїРёСЂРѕРІР°С‚СЊ Р°РґСЂРµСЃ"],
    ["Disconnect this wallet?", "РћС‚РєР»СЋС‡РёС‚СЊ СЌС‚РѕС‚ РєРѕС€РµР»РµРє?"],
    ["Copy", "РљРѕРїРёСЂРѕРІР°С‚СЊ"],
    ["Promocode", "РџСЂРѕРјРѕРєРѕРґ"],
    ["Enter code", "Р’РІРµРґРёС‚Рµ РєРѕРґ"],
    ["Apply", "РџСЂРёРјРµРЅРёС‚СЊ"],
    ["Inventory", "РРЅРІРµРЅС‚Р°СЂСЊ"],
    ["No gifts yet.", "РџРѕРґР°СЂРєРѕРІ РїРѕРєР° РЅРµС‚."],
    ["Bottom navigation", "РќРёР¶РЅСЏСЏ РЅР°РІРёРіР°С†РёСЏ"],
    ["Close", "Р—Р°РєСЂС‹С‚СЊ"],
    ["Try Again", "РџРѕРїСЂРѕР±РѕРІР°С‚СЊ СЃРЅРѕРІР°"],
    ["Top up TON Balance", "РџРѕРїРѕР»РЅРёС‚СЊ Р±Р°Р»Р°РЅСЃ TON"],
    ["Minimum deposit: 0.1 TON", "РњРёРЅРёРјР°Р»СЊРЅС‹Р№ РґРµРїРѕР·РёС‚: 0.1 TON"],
    ["Amount to deposit", "РЎСѓРјРјР° РїРѕРїРѕР»РЅРµРЅРёСЏ"],
    ["Deposit TON", "РџРѕРїРѕР»РЅРёС‚СЊ TON"],
    ["Buy Telegram Stars", "РљСѓРїРёС‚СЊ Telegram Stars"],
    ["Minimum purchase: 1 в­ђ", "РњРёРЅРёРјР°Р»СЊРЅР°СЏ РїРѕРєСѓРїРєР°: 1 в­ђ"],
    ["Amount to buy", "РЎСѓРјРјР° РїРѕРєСѓРїРєРё"],
    ["Buy Stars", "РљСѓРїРёС‚СЊ Stars"],
    ["I agree with", "Я согласен с"],
    ["Stars top up rules", "правилами пополнения Stars"],
    ["Close rules", "Закрыть правила"],
    ["Important before buying Stars", "Важно перед покупкой Stars"],
    ["Top up Stars only through official payment methods and only using your own payment instruments.", "Пополняйте Stars только через официальные способы оплаты и только со своих платежных средств."],
    ["If Stars source is suspicious", "Если Stars сомнительного происхождения"],
    ["If there is a fraud risk, payment refund, or chargeback, withdrawal can be temporarily restricted.", "Если есть риск фрода, возврата платежа или чарджбэка, вывод может быть временно ограничен."],
    ["If we are not sure about the quality of Stars, we may request additional verification.", "Если мы не уверены в качестве Stars, мы можем запросить дополнительную проверку."],
    ["If abuse is confirmed, access to withdrawals may be restricted.", "При подтвержденном злоупотреблении доступ к выводу может быть ограничен."],
    ["If you have questions about top up or withdrawal, contact support:", "Если возникли вопросы по пополнению или выводу, напишите в поддержку:"],
    ["Please agree with the Stars top-up rules first.", "Пожалуйста, сначала подтвердите согласие с правилами пополнения Stars."],
    ["Settings", "РќР°СЃС‚СЂРѕР№РєРё"],
    ["Language", "РЇР·С‹Рє"],
    ["Support", "РџРѕРґРґРµСЂР¶РєР°"],
    ["Privacy Policy", "РџРѕР»РёС‚РёРєР° РєРѕРЅС„РёРґРµРЅС†РёР°Р»СЊРЅРѕСЃС‚Рё"],
    ["Legal terms and data", "РџСЂР°РІРѕРІС‹Рµ СѓСЃР»РѕРІРёСЏ Рё РґР°РЅРЅС‹Рµ"],
    ["About", "Рћ РїСЂРёР»РѕР¶РµРЅРёРё"],
    ["App info", "РРЅС„РѕСЂРјР°С†РёСЏ Рѕ РїСЂРёР»РѕР¶РµРЅРёРё"],
    ["English", "РђРЅРіР»РёР№СЃРєРёР№"],
    ["Russian", "Р СѓСЃСЃРєРёР№"],
    ["English Flag", "Р¤Р»Р°Рі РђРЅРіР»РёРё"],
    ["Russian Flag", "Р¤Р»Р°Рі Р РѕСЃСЃРёРё"],
    ["Close settings", "Р—Р°РєСЂС‹С‚СЊ РЅР°СЃС‚СЂРѕР№РєРё"],
    ["Withdraw", "Р’С‹РІРѕРґ"],
    ["Continue", "РџСЂРѕРґРѕР»Р¶РёС‚СЊ"],
    ["Processing...", "РћР±СЂР°Р±РѕС‚РєР°..."],
    ["Loading...", "Р—Р°РіСЂСѓР·РєР°..."],
    ["Sell", "РџСЂРѕРґР°С‚СЊ"],
    ["Claim", "РџРѕР»СѓС‡РёС‚СЊ"],
    ["Claimed", "РџРѕР»СѓС‡РµРЅРѕ"],
    ["Lost", "РџСЂРѕРёРіСЂС‹С€"],
    ["Place Bet", "РЎРґРµР»Р°С‚СЊ СЃС‚Р°РІРєСѓ"],
    ["Place bet", "РЎРґРµР»Р°С‚СЊ СЃС‚Р°РІРєСѓ"],
    ["Max", "РњР°РєСЃ"],
    ["Deposit", "РџРѕРїРѕР»РЅРёС‚СЊ"],
    ["Connecting...", "РџРѕРґРєР»СЋС‡РµРЅРёРµ..."],
    ["ConnectingвЂ¦", "РџРѕРґРєР»СЋС‡РµРЅРёРµвЂ¦"],
    ["No active players yet", "РџРѕРєР° РЅРµС‚ Р°РєС‚РёРІРЅС‹С… РёРіСЂРѕРєРѕРІ"],
    ["Waiting", "РћР¶РёРґР°РЅРёРµ"],
    ["No bets yet", "РЎС‚Р°РІРѕРє РїРѕРєР° РЅРµС‚"],
    ["No bets in this round", "Р’ СЌС‚РѕРј СЂР°СѓРЅРґРµ РЅРµС‚ СЃС‚Р°РІРѕРє"],
    ["Player", "РРіСЂРѕРє"],
    ["Bet segments", "РЎРµРєС‚РѕСЂС‹ СЃС‚Р°РІРѕРє"],
    ["Bonus round in progress", "Р‘РѕРЅСѓСЃРЅС‹Р№ СЂР°СѓРЅРґ РёРґРµС‚"],
    ["Watch live", "РЎРјРѕС‚СЂРµС‚СЊ"],
    ["Bonus:", "Р‘РѕРЅСѓСЃ:"],
    ["gifts", "РїРѕРґР°СЂРєРё"],
    ["price", "С†РµРЅР°"],
    ["Gifts", "РџРѕРґР°СЂРєРё"],
    ["View in", "РћС‚РєСЂС‹С‚СЊ РІ"],
    ["Gift", "РџРѕРґР°СЂРѕРє"],
    ["Filter Gifts", "Р¤РёР»СЊС‚СЂ РїРѕРґР°СЂРєРѕРІ"],
    ["Clear All", "РћС‡РёСЃС‚РёС‚СЊ РІСЃРµ"],
    ["Show", "РџРѕРєР°Р·Р°С‚СЊ"],
    ["No gifts available", "РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РїРѕРґР°СЂРєРѕРІ"],
    ["All", "Р’СЃРµ"],
    ["Demo", "Р”РµРјРѕ"],
    ["FREE", "Р‘Р•РЎРџР›РђРўРќРћ"],
    ["Crash chart", "Р“СЂР°С„РёРє Crash"],
    ["Crash theme", "РўРµРјР° Crash"],
    ["Crypto theme", "РљСЂРёРїС‚Рѕ С‚РµРјР°"],
    ["Space theme", "РљРѕСЃРјРѕ С‚РµРјР°"],
    ["Currency change is available after the end of the round", "РЎРјРµРЅРёС‚СЊ РІР°Р»СЋС‚Сѓ РјРѕР¶РЅРѕ РїРѕСЃР»Рµ РѕРєРѕРЅС‡Р°РЅРёСЏ СЂР°СѓРЅРґР°"],
    ["Account banned", "РђРєРєР°СѓРЅС‚ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ"],
    ["Banned account", "Р—Р°Р±Р»РѕРєРёСЂРѕРІР°РЅРЅС‹Р№ Р°РєРєР°СѓРЅС‚"],
    ["Your account has been banned", "Р’Р°С€ Р°РєРєР°СѓРЅС‚ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ"],
    ["If this was done by mistake, contact support.", "Р•СЃР»Рё СЌС‚Рѕ РїСЂРѕРёР·РѕС€Р»Рѕ РїРѕ РѕС€РёР±РєРµ, РѕР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ."],
    ["You could have won", "Р’С‹ РјРѕРіР»Рё РІС‹РёРіСЂР°С‚СЊ"],
    ["You've won!", "Р’С‹ РІС‹РёРіСЂР°Р»Рё!"],
    ["Subscribe to Wild Gift", "РџРѕРґРїРёС€РёС‚РµСЃСЊ РЅР° Wild Gift"],
    ["Invite friend", "РџСЂРёРіР»Р°СЃРёС‚СЊ РґСЂСѓРіР°"],
    ["Top up 0.5 TON", "РџРѕРїРѕР»РЅРёС‚СЊ РЅР° 0.5 TON"],
    ["or equivalent in Stars", "РёР»Рё СЌРєРІРёРІР°Р»РµРЅС‚ РІ Stars"],
    ["Win once in Game", "Р’С‹РёРіСЂР°С‚СЊ РѕРґРёРЅ СЂР°Р· РІ РёРіСЂРµ"],
    ["Wheel / Crash", "РљРѕР»РµСЃРѕ / Crash"],
    ["Checking...", "РџСЂРѕРІРµСЂРєР°..."],
    ["Check", "РџСЂРѕРІРµСЂРёС‚СЊ"],
    ["Reward already claimed.", "РќР°РіСЂР°РґР° СѓР¶Рµ РїРѕР»СѓС‡РµРЅР°."],
    ["Subscription confirmed. Tap Claim.", "РџРѕРґРїРёСЃРєР° РїРѕРґС‚РІРµСЂР¶РґРµРЅР°. РќР°Р¶РјРёС‚Рµ В«РџРѕР»СѓС‡РёС‚СЊВ»."],
    ["Subscribe to the channel first, then tap Check.", "РЎРЅР°С‡Р°Р»Р° РїРѕРґРїРёС€РёС‚РµСЃСЊ РЅР° РєР°РЅР°Р», Р·Р°С‚РµРј РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊВ»."],
    ["Subscribe to the channel first.", "РЎРЅР°С‡Р°Р»Р° РїРѕРґРїРёС€РёС‚РµСЃСЊ РЅР° РєР°РЅР°Р»."],
    ["Failed to check subscription. Try again.", "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ РїРѕРґРїРёСЃРєСѓ. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°."],
    ["Failed to claim reward.", "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РЅР°РіСЂР°РґСѓ."],
    ["Failed to claim reward. Try again.", "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РЅР°РіСЂР°РґСѓ. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°."],
    ["Open deposit panel, top up balance, then tap Check.", "РћС‚РєСЂРѕР№С‚Рµ РїР°РЅРµР»СЊ РїРѕРїРѕР»РЅРµРЅРёСЏ, РїРѕРїРѕР»РЅРёС‚Рµ Р±Р°Р»Р°РЅСЃ Рё РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊВ»."],
    ["Top up at least 0.5 TON or 50 Stars, then tap Check.", "РџРѕРїРѕР»РЅРёС‚Рµ РјРёРЅРёРјСѓРј РЅР° 0.5 TON РёР»Рё 50 Stars, Р·Р°С‚РµРј РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊВ»."],
    ["Top up at least 0.5 TON or 50 Stars first.", "РЎРЅР°С‡Р°Р»Р° РїРѕРїРѕР»РЅРёС‚Рµ РјРёРЅРёРјСѓРј РЅР° 0.5 TON РёР»Рё 50 Stars."],
    ["Top-up confirmed. Tap Claim.", "РџРѕРїРѕР»РЅРµРЅРёРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ. РќР°Р¶РјРёС‚Рµ В«РџРѕР»СѓС‡РёС‚СЊВ»."],
    ["Failed to check top-up task. Try again.", "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ Р·Р°РґР°РЅРёРµ РїРѕРїРѕР»РЅРµРЅРёСЏ. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°."],
    ["Go to Games, win once in Wheel or Crash, then tap Check.", "РџРµСЂРµР№РґРёС‚Рµ РІ Games, РІС‹РёРіСЂР°Р№С‚Рµ РѕРґРёРЅ СЂР°Р· РІ Wheel РёР»Рё Crash Рё РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊВ»."],
    ["Win once in Wheel or Crash, then tap Check.", "Р’С‹РёРіСЂР°Р№С‚Рµ РѕРґРёРЅ СЂР°Р· РІ Wheel РёР»Рё Crash, Р·Р°С‚РµРј РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊВ»."],
    ["Win once in Wheel or Crash first.", "РЎРЅР°С‡Р°Р»Р° РІС‹РёРіСЂР°Р№С‚Рµ РѕРґРёРЅ СЂР°Р· РІ Wheel РёР»Рё Crash."],
    ["Win confirmed. Tap Claim.", "РџРѕР±РµРґР° РїРѕРґС‚РІРµСЂР¶РґРµРЅР°. РќР°Р¶РјРёС‚Рµ В«РџРѕР»СѓС‡РёС‚СЊВ»."],
    ["Failed to check game task. Try again.", "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ РёРіСЂРѕРІРѕРµ Р·Р°РґР°РЅРёРµ. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°."],
    ["This task will be enabled later.", "Р­С‚Рѕ Р·Р°РґР°РЅРёРµ Р±СѓРґРµС‚ РґРѕСЃС‚СѓРїРЅРѕ РїРѕР·Р¶Рµ."],
    ["Subscribe in the channel, then return and tap Check.", "РџРѕРґРїРёС€РёС‚РµСЃСЊ РЅР° РєР°РЅР°Р», Р·Р°С‚РµРј РІРµСЂРЅРёС‚РµСЃСЊ Рё РЅР°Р¶РјРёС‚Рµ В«РџСЂРѕРІРµСЂРёС‚СЊВ»."],
    ["Failed to connect wallet", "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊ РєРѕС€РµР»РµРє"],
    ["Opening wallet...", "РћС‚РєСЂС‹РІР°РµРј РєРѕС€РµР»РµРє..."],
    ["Creating invoice...", "РЎРѕР·РґР°РµРј СЃС‡РµС‚..."],
    ["Opening payment...", "РћС‚РєСЂС‹РІР°РµРј РѕРїР»Р°С‚Сѓ..."],
    ["Payment failed. Please try again.", "РћРїР»Р°С‚Р° РЅРµ СѓРґР°Р»Р°СЃСЊ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·."],
    ["Failed to process payment", "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ РїР»Р°С‚РµР¶"],
    ["Server not configured. Please contact support.", "РЎРµСЂРІРµСЂ РЅРµ РЅР°СЃС‚СЂРѕРµРЅ. РћР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ."],
    ["Server endpoint not configured. Please contact support.", "Endpoint СЃРµСЂРІРµСЂР° РЅРµ РЅР°СЃС‚СЂРѕРµРЅ. РћР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ."],
    ["Payment service unavailable. Please contact support.", "РЎРµСЂРІРёСЃ РѕРїР»Р°С‚С‹ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РћР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ."],
    ["Server error. Please try again later.", "РћС€РёР±РєР° СЃРµСЂРІРµСЂР°. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ."],
    ["Network error. Please check your connection.", "РћС€РёР±РєР° СЃРµС‚Рё. РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕРґРєР»СЋС‡РµРЅРёРµ."],
    ["Stars payment only works in Telegram app. Please open this page in Telegram.", "РћРїР»Р°С‚Р° Stars СЂР°Р±РѕС‚Р°РµС‚ С‚РѕР»СЊРєРѕ РІ РїСЂРёР»РѕР¶РµРЅРёРё Telegram. РћС‚РєСЂРѕР№С‚Рµ СЌС‚Сѓ СЃС‚СЂР°РЅРёС†Сѓ РІ Telegram."],
    ["You must authorize in Telegram first", "РЎРЅР°С‡Р°Р»Р° Р°РІС‚РѕСЂРёР·СѓР№С‚РµСЃСЊ РІ Telegram"],
    ["Cancelled", "РћС‚РјРµРЅРµРЅРѕ"],
    ["Transaction failed", "РўСЂР°РЅР·Р°РєС†РёСЏ РЅРµ СѓРґР°Р»Р°СЃСЊ"],
    ["вњ… Success", "вњ… РЈСЃРїРµС€РЅРѕ"],
    ["Enter a promo code", "Р’РІРµРґРёС‚Рµ РїСЂРѕРјРѕРєРѕРґ"],
    ["вњ… Promocode applied", "вњ… РџСЂРѕРјРѕРєРѕРґ РїСЂРёРјРµРЅРµРЅ"],
    ["Network error", "РћС€РёР±РєР° СЃРµС‚Рё"],
    ["Sell error: instanceId not found", "РћС€РёР±РєР° РїСЂРѕРґР°Р¶Рё: instanceId РЅРµ РЅР°Р№РґРµРЅ"],
    ["Sell failed (network)", "РћС€РёР±РєР° РїСЂРѕРґР°Р¶Рё (СЃРµС‚СЊ)"],
    ["Sell failed", "РћС€РёР±РєР° РїСЂРѕРґР°Р¶Рё"],
    ["Sell-all failed", "РћС€РёР±РєР° РїСЂРѕРґР°Р¶Рё РІСЃРµС…"],
    ["Return error: item id not found", "РћС€РёР±РєР° РІРѕР·РІСЂР°С‚Р°: id РїСЂРµРґРјРµС‚Р° РЅРµ РЅР°Р№РґРµРЅ"],
    ["Return failed (network)", "РћС€РёР±РєР° РІРѕР·РІСЂР°С‚Р° (СЃРµС‚СЊ)"],
    ["Not enough balance to pay withdraw fee.", "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р±Р°Р»Р°РЅСЃР° РґР»СЏ РѕРїР»Р°С‚С‹ РєРѕРјРёСЃСЃРёРё Р·Р° РІС‹РІРѕРґ."],
    ["Relayer is not configured/reachable.", "Relayer РЅРµ РЅР°СЃС‚СЂРѕРµРЅ РёР»Рё РЅРµРґРѕСЃС‚СѓРїРµРЅ."],
    ["Failed to withdraw gift.", "РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РІРµСЃС‚Рё РїРѕРґР°СЂРѕРє."],
    ["Failed to withdraw gift (network).\nContact support @", "РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РІРµСЃС‚Рё РїРѕРґР°СЂРѕРє (СЃРµС‚СЊ).\nРЎРІСЏР¶РёС‚РµСЃСЊ СЃ РїРѕРґРґРµСЂР¶РєРѕР№ @"],
    ["Failed to withdraw: item id not found.", "РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РІРµСЃС‚Рё: id РїСЂРµРґРјРµС‚Р° РЅРµ РЅР°Р№РґРµРЅ."],
    ["Set your Telegram @username in settings and try again.\nTelegram requires resolvable recipient for gift transfer.", "РЈРєР°Р¶РёС‚Рµ РІР°С€ Telegram @username РІ РЅР°СЃС‚СЂРѕР№РєР°С… Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°.\nTelegram С‚СЂРµР±СѓРµС‚ РѕРїСЂРµРґРµР»СЏРµРјРѕРіРѕ РїРѕР»СѓС‡Р°С‚РµР»СЏ РґР»СЏ РїРµСЂРµРІРѕРґР° РїРѕРґР°СЂРєР°."],
    ["Cannot resolve recipient in Telegram (TO_ID_INVALID).\nSet @username and try again, then contact support @", "РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ РїРѕР»СѓС‡Р°С‚РµР»СЏ РІ Telegram (TO_ID_INVALID).\nРЈРєР°Р¶РёС‚Рµ @username Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°, Р·Р°С‚РµРј СЃРІСЏР¶РёС‚РµСЃСЊ СЃ РїРѕРґРґРµСЂР¶РєРѕР№ @"],
    ["Failed to withdraw gift: relayer has not enough Stars for transfer.\nContact support @", "РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РІРµСЃС‚Рё РїРѕРґР°СЂРѕРє: Сѓ relayer РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Stars РґР»СЏ РїРµСЂРµРІРѕРґР°.\nРЎРІСЏР¶РёС‚РµСЃСЊ СЃ РїРѕРґРґРµСЂР¶РєРѕР№ @"],
    ["This gift is not available in stock (relayer cannot find it).\nContact support @", "Р­С‚РѕС‚ РїРѕРґР°СЂРѕРє РЅРµРґРѕСЃС‚СѓРїРµРЅ РІ РЅР°Р»РёС‡РёРё (relayer РЅРµ РјРѕР¶РµС‚ РµРіРѕ РЅР°Р№С‚Рё).\nРЎРІСЏР¶РёС‚РµСЃСЊ СЃ РїРѕРґРґРµСЂР¶РєРѕР№ @"],
    ["Invalid response", "РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РѕС‚РІРµС‚"],
    ["Invalid request", "РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ Р·Р°РїСЂРѕСЃ"],
    ["Request timeout", "РўР°Р№РјР°СѓС‚ Р·Р°РїСЂРѕСЃР°"],
    ["Connection error", "РћС€РёР±РєР° СЃРѕРµРґРёРЅРµРЅРёСЏ"],
    ["Failed to create invoice", "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СЃС‡РµС‚"],
    ["Failed to load", "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ"],
    ["unknown error", "РЅРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°"],
    ["Insufficient balance", "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р±Р°Р»Р°РЅСЃР°"],
    ["Insufficient TON balance", "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р±Р°Р»Р°РЅСЃР° TON"],
    ["Insufficient STARS balance", "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р±Р°Р»Р°РЅСЃР° STARS"],
    ["Bet placed", "РЎС‚Р°РІРєР° СЃРґРµР»Р°РЅР°"],
    ["Bet placed!", "РЎС‚Р°РІРєР° СЃРґРµР»Р°РЅР°!"],
    ["Bet already placed", "РЎС‚Р°РІРєР° СѓР¶Рµ СЃРґРµР»Р°РЅР°"],
    ["No bets placed", "РЎС‚Р°РІРєРё РЅРµ СЃРґРµР»Р°РЅС‹"],
    ["Wait next round", "Р”РѕР¶РґРёС‚РµСЃСЊ СЃР»РµРґСѓСЋС‰РµРіРѕ СЂР°СѓРЅРґР°"],
    ["Next round soonвЂ¦", "РЎРєРѕСЂРѕ СЃР»РµРґСѓСЋС‰РёР№ СЂР°СѓРЅРґвЂ¦"],
    ["Placing betвЂ¦", "РЎС‚Р°РІРєР° РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏвЂ¦"],
    ["User profile", "РџСЂРѕС„РёР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ"],
    ["Menu", "РњРµРЅСЋ"],
    ["User", "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ"],
    ["Unknown", "РќРµРёР·РІРµСЃС‚РЅРѕ"],
    ["Gift Name", "РќР°Р·РІР°РЅРёРµ РїРѕРґР°СЂРєР°"],
    ["Open Wheel", "РћС‚РєСЂС‹С‚СЊ РєРѕР»РµСЃРѕ"],
    ["Open Crash", "РћС‚РєСЂС‹С‚СЊ Crash"],
    ["Open Cases", "РћС‚РєСЂС‹С‚СЊ РєРµР№СЃС‹"],
    ["Open Combo", "РћС‚РєСЂС‹С‚СЊ РљРѕРјР±Рѕ"],
    ["Wheel canvas", "РҐРѕР»СЃС‚ РєРѕР»РµСЃР°"],
    ["Crash", "РљСЂР°С€"],
    ["Soon", "РЎРєРѕСЂРѕ"],
    ["Combo", "РљРѕРјР±Рѕ"],
    ["Error", "РћС€РёР±РєР°"],
    ["Go back", "РќР°Р·Р°Рґ"],
    ["Test mode - Ready", "РўРµСЃС‚РѕРІС‹Р№ СЂРµР¶РёРј - РіРѕС‚РѕРІРѕ"],
    ["рџ§Є Test Mode: Unlimited Balance", "рџ§Є РўРµСЃС‚РѕРІС‹Р№ СЂРµР¶РёРј: Р±РµР·Р»РёРјРёС‚РЅС‹Р№ Р±Р°Р»Р°РЅСЃ"],
    ["WildGift v1.0.0\n\nA Telegram mini app for fun gaming!", "WildGift v1.0.0\n\nTelegram РјРёРЅРё-РїСЂРёР»РѕР¶РµРЅРёРµ РґР»СЏ РёРіСЂ Рё СЂР°Р·РІР»РµС‡РµРЅРёР№!"],
    ["рџЋЃ Try Again", "рџЋЃ РџРѕРїСЂРѕР±РѕРІР°С‚СЊ СЃРЅРѕРІР°"]
  ];

  const I18N_PATTERN_RULES = {
    ru: [
      { re: /^Bet:\s*(.+)$/i, to: (_m, value) => `РЎС‚Р°РІРєР°: ${value}` },
      { re: /^Bonus:\s*(.+)$/i, to: (_m, value) => `Р‘РѕРЅСѓСЃ: ${value}` },
      { re: /^Withdrawal fee:\s*(.+)$/i, to: (_m, value) => `РљРѕРјРёСЃСЃРёСЏ Р·Р° РІС‹РІРѕРґ: ${value}` },
      { re: /^Recipient:\s*(.+)$/i, to: (_m, value) => `РџРѕР»СѓС‡Р°С‚РµР»СЊ: ${value}` },
      { re: /^Claim successful:\s*(.+)$/i, to: (_m, value) => `РќР°РіСЂР°РґР° РїРѕР»СѓС‡РµРЅР°: ${value}` },
      { re: /^Insufficient\s+([A-Z]+)\s+balance$/i, to: (_m, cur) => `РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р±Р°Р»Р°РЅСЃР° ${cur}` },
      { re: /^Sell failed\s*\((.+)\)$/i, to: (_m, code) => `РћС€РёР±РєР° РїСЂРѕРґР°Р¶Рё (${code})` },
      { re: /^Return failed\s*\((.+)\)$/i, to: (_m, code) => `РћС€РёР±РєР° РІРѕР·РІСЂР°С‚Р° (${code})` },
      { re: /^Error\s*\((.+)\)$/i, to: (_m, code) => `РћС€РёР±РєР° (${code})` },
      { re: /^Contact support @(.+)$/i, to: (_m, uname) => `РЎРІСЏР¶РёС‚РµСЃСЊ СЃ РїРѕРґРґРµСЂР¶РєРѕР№ @${uname}` },
      { re: /^Deposited\s+(.+?)\s+TON\s*\n\s*\n\s*Your balance will update automatically\.$/i, to: (_m, amount) => `РџРѕРїРѕР»РЅРµРЅРѕ ${amount} TON\n\nР‘Р°Р»Р°РЅСЃ РѕР±РЅРѕРІРёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.` },
      { re: /^Purchased\s+(.+?)\s+в­ђ\s+Stars!\s*\n\s*\n\s*Your balance will update automatically\.$/i, to: (_m, amount) => `РљСѓРїР»РµРЅРѕ ${amount} в­ђ Stars!\n\nР‘Р°Р»Р°РЅСЃ РѕР±РЅРѕРІРёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.` },
      { re: /^вњ…\s*Purchased\s+(.+?)\s+в­ђ\s+Stars!$/i, to: (_m, amount) => `вњ… РљСѓРїР»РµРЅРѕ ${amount} в­ђ Stars!` }
    ],
    en: [
      { re: /^РЎС‚Р°РІРєР°:\s*(.+)$/i, to: (_m, value) => `Bet: ${value}` },
      { re: /^Р‘РѕРЅСѓСЃ:\s*(.+)$/i, to: (_m, value) => `Bonus: ${value}` },
      { re: /^РљРѕРјРёСЃСЃРёСЏ Р·Р° РІС‹РІРѕРґ:\s*(.+)$/i, to: (_m, value) => `Withdrawal fee: ${value}` },
      { re: /^РџРѕР»СѓС‡Р°С‚РµР»СЊ:\s*(.+)$/i, to: (_m, value) => `Recipient: ${value}` },
      { re: /^РќР°РіСЂР°РґР° РїРѕР»СѓС‡РµРЅР°:\s*(.+)$/i, to: (_m, value) => `Claim successful: ${value}` },
      { re: /^РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ Р±Р°Р»Р°РЅСЃР°\s+([A-Z]+)$/i, to: (_m, cur) => `Insufficient ${cur} balance` },
      { re: /^РћС€РёР±РєР° РїСЂРѕРґР°Р¶Рё\s*\((.+)\)$/i, to: (_m, code) => `Sell failed (${code})` },
      { re: /^РћС€РёР±РєР° РІРѕР·РІСЂР°С‚Р°\s*\((.+)\)$/i, to: (_m, code) => `Return failed (${code})` },
      { re: /^РћС€РёР±РєР°\s*\((.+)\)$/i, to: (_m, code) => `Error (${code})` },
      { re: /^РЎРІСЏР¶РёС‚РµСЃСЊ СЃ РїРѕРґРґРµСЂР¶РєРѕР№ @(.+)$/i, to: (_m, uname) => `Contact support @${uname}` },
      { re: /^РџРѕРїРѕР»РЅРµРЅРѕ\s+(.+?)\s+TON\s*\n\s*\n\s*Р‘Р°Р»Р°РЅСЃ РѕР±РЅРѕРІРёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё\.$/i, to: (_m, amount) => `Deposited ${amount} TON\n\nYour balance will update automatically.` },
      { re: /^РљСѓРїР»РµРЅРѕ\s+(.+?)\s+в­ђ\s+Stars!\s*\n\s*\n\s*Р‘Р°Р»Р°РЅСЃ РѕР±РЅРѕРІРёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё\.$/i, to: (_m, amount) => `Purchased ${amount} в­ђ Stars!\n\nYour balance will update automatically.` },
      { re: /^вњ…\s*РљСѓРїР»РµРЅРѕ\s+(.+?)\s+в­ђ\s+Stars!$/i, to: (_m, amount) => `вњ… Purchased ${amount} в­ђ Stars!` }
    ]
  };

  for (const entry of Object.values(I18N_KEYS)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.en === "string") entry.en = decodeMojibakeText(entry.en);
    if (typeof entry.ru === "string") entry.ru = decodeMojibakeText(entry.ru);
  }

  for (let i = 0; i < I18N_PHRASE_BOOK.length; i += 1) {
    const pair = I18N_PHRASE_BOOK[i];
    if (!Array.isArray(pair) || pair.length < 2) continue;
    pair[0] = decodeMojibakeText(pair[0]);
    pair[1] = decodeMojibakeText(pair[1]);
  }

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
      if (rule.re.test(text)) return decodeMojibakeText(text.replace(rule.re, rule.to));
    }
    return text;
  }

  function translateText(rawText, targetLanguage) {
    const text = decodeMojibakeText(String(rawText ?? ""));
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
    if (!entry) return decodeMojibakeText(String(fallback || ""));
    const lang = normalizeLanguage(targetLanguage) || "en";
    return decodeMojibakeText(String(entry[lang] || fallback || entry.en || ""));
  }

  function detectLanguageFromLocale(locale) {
    const raw = String(locale || "").trim();
    if (!raw) return "";

    const parts = raw.replace(/_/g, "-").split("-").filter(Boolean);
    const lang = String(parts[0] || "").toLowerCase();
    const region = String(parts[1] || "").toUpperCase();

    if (region) {
      return RUSSIAN_REGION_CODES.has(region) ? "ru" : "en";
    }
    if (RUSSIAN_LANGUAGE_CODES.has(lang)) return "ru";
    if (lang) return "en";
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

  function getTelegramUserId() {
    try {
      const id = tg?.initDataUnsafe?.user?.id;
      if (id === null || id === undefined) return "";
      const normalized = String(id).trim();
      return normalized || "";
    } catch {
      return "";
    }
  }

  function getTelegramInitData() {
    try {
      return String(tg?.initData || "").trim();
    } catch {
      return "";
    }
  }

  function getUserLanguageStorageKey() {
    const userId = getTelegramUserId();
    if (!userId) return "";
    return `${I18N_USER_STORAGE_KEY_PREFIX}${userId}`;
  }

  function readStoredLanguage() {
    try {
      const userStorageKey = getUserLanguageStorageKey();
      if (userStorageKey) {
        const userStored = normalizeLanguage(localStorage.getItem(userStorageKey));
        if (userStored) return userStored;
      }
      const stored = normalizeLanguage(localStorage.getItem(I18N_STORAGE_KEY));
      return stored || "";
    } catch {
      return "";
    }
  }

  function writeStoredLanguage(lang) {
    const normalized = normalizeLanguage(lang);
    if (!normalized) return;
    try {
      localStorage.setItem(I18N_STORAGE_KEY, normalized);
      const userStorageKey = getUserLanguageStorageKey();
      if (userStorageKey) localStorage.setItem(userStorageKey, normalized);
    } catch {}
  }

  let currentLanguage = "en";
  let i18nObserver = null;
  let i18nApplying = false;
  let i18nFlushHandle = 0;
  const i18nQueuedNodes = new Set();
  let lastServerPersistedLanguage = "";
  let pendingServerLanguage = "";
  let languagePersistInFlight = false;
  let languageServerSyncStarted = false;

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

  function queueI18nTranslate(node) {
    if (!node) return;
    i18nQueuedNodes.add(node);
    if (i18nFlushHandle) return;

    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb) => window.setTimeout(cb, 16);

    i18nFlushHandle = schedule(() => {
      i18nFlushHandle = 0;
      if (i18nApplying) {
        queueI18nTranslate(document.body || document.documentElement);
        return;
      }

      const queue = Array.from(i18nQueuedNodes);
      i18nQueuedNodes.clear();
      queue.forEach((entry) => translateSubtree(entry, currentLanguage));
    });
  }

  function ensureI18nObserver() {
    if (i18nObserver || typeof MutationObserver !== "function" || !document.body) return;

    i18nObserver = new MutationObserver((mutations) => {
      if (i18nApplying) return;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => queueI18nTranslate(node));
          continue;
        }
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          queueI18nTranslate(mutation.target);
          continue;
        }
        if (mutation.type === "characterData" && mutation.target) {
          queueI18nTranslate(mutation.target);
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

  async function fetchServerLanguagePreference() {
    const initData = getTelegramInitData();
    const userId = getTelegramUserId();
    if (!initData || !userId) return "";

    try {
      const response = await fetch(I18N_SERVER_ENDPOINT, {
        method: "GET",
        cache: "no-store",
        headers: { "x-telegram-init-data": initData }
      });
      if (!response.ok) return "";

      const payload = await response.json().catch(() => null);
      const manualLanguage = normalizeLanguage(payload?.manualLanguage);
      if (manualLanguage) lastServerPersistedLanguage = manualLanguage;

      return normalizeLanguage(payload?.language || payload?.defaultLanguage || "");
    } catch {
      return "";
    }
  }

  async function persistLanguageToServer(lang) {
    const normalized = normalizeLanguage(lang);
    if (!normalized) return false;

    const initData = getTelegramInitData();
    const userId = getTelegramUserId();
    if (!initData || !userId) return false;

    try {
      const response = await fetch(I18N_SERVER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData
        },
        body: JSON.stringify({ language: normalized })
      });
      if (!response.ok) return false;

      lastServerPersistedLanguage = normalized;
      return true;
    } catch {
      return false;
    }
  }

  function flushLanguagePersistQueue() {
    if (languagePersistInFlight) return;
    if (!pendingServerLanguage) return;

    languagePersistInFlight = true;
    (async () => {
      while (pendingServerLanguage) {
        const target = pendingServerLanguage;
        pendingServerLanguage = "";
        if (target === lastServerPersistedLanguage) continue;

        const ok = await persistLanguageToServer(target);
        if (!ok) break;
      }
    })().finally(() => {
      languagePersistInFlight = false;
      if (pendingServerLanguage && pendingServerLanguage !== lastServerPersistedLanguage) {
        flushLanguagePersistQueue();
      }
    });
  }

  function scheduleLanguagePersist(lang) {
    const normalized = normalizeLanguage(lang);
    if (!normalized) return;
    if (normalized === lastServerPersistedLanguage) return;
    pendingServerLanguage = normalized;
    flushLanguagePersistQueue();
  }

  function changeLanguage(lang, options = {}) {
    const targetLanguage = normalizeLanguage(lang) || "en";
    const changed = options.force === true || targetLanguage !== currentLanguage;
    const applied = applyLanguage(targetLanguage, options);
    if (changed && options.persistServer !== false) {
      scheduleLanguagePersist(applied);
    }
    return applied;
  }

  function syncLanguageFromServer() {
    if (languageServerSyncStarted) return;
    languageServerSyncStarted = true;

    fetchServerLanguagePreference()
      .then((serverLanguage) => {
        if (!serverLanguage) return;
        const changed = serverLanguage !== currentLanguage;
        applyLanguage(serverLanguage, {
          persist: true,
          emit: changed,
          force: changed
        });
      })
      .catch(() => {});
  }

  const i18nApi = {
    getLanguage: () => currentLanguage,
    detectLanguage: detectPreferredLanguage,
    detectLanguageFromLocale,
    isRussianLocale: (locale) => detectLanguageFromLocale(locale) === "ru",
    changeLanguage,
    translate: (text, lang = currentLanguage) => translateText(text, lang),
    t: (key, fallback = "") => translateByKey(key, fallback, currentLanguage)
  };

  WT.i18n = i18nApi;
  WT.changeLanguage = changeLanguage;
  WT.getLanguage = () => currentLanguage;
  WT.t = (key, fallback = "") => translateByKey(key, fallback, currentLanguage);

  const storedLanguage = readStoredLanguage();
  const initialLanguage = storedLanguage || detectPreferredLanguage();
  applyLanguage(initialLanguage, { persist: true, emit: false, force: true });
  syncLanguageFromServer();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureI18nObserver();
      applyLanguage(currentLanguage, { persist: false, emit: false, force: true });
    }, { once: true });
  } else {
    ensureI18nObserver();
  }

  // ===== Global image loading effect (disabled) =====
  // Disabled to avoid dark square artifacts on transparent assets while images are loading.
  function clearLegacyImgLoaderClasses(root = document) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll("img.wt-img-loading, img.wt-img-error").forEach((img) => {
      img.classList.remove("wt-img-loading", "wt-img-error");
      img.style.removeProperty("--wt-img-loader-radius");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => clearLegacyImgLoaderClasses(document), { once: true });
  } else {
    clearLegacyImgLoaderClasses(document);
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
      msg.includes('\u274C') ||
      /(^|\s)(error|failed|timeout|insufficient|unavailable)(\s|$)/i.test(msg) ||
      /(РѕС€РёР±Рє|РЅРµ СѓРґР°Р»РѕСЃСЊ|РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ|РЅРµРґРѕСЃС‚СѓРї|СѓСЃС‚Р°СЂРµР»|С‚Р°Р№РјР°СѓС‚)/i.test(msg)
    ) {
      return 'error';
    }

    if (
      msg.includes('\u26A0') ||
      /(^|\s)(warning|refreshing|retry)(\s|$)/i.test(msg) ||
      /(РІРЅРёРјР°РЅ|РѕР±РЅРѕРІ|РїРѕРІС‚РѕСЂРёС‚Рµ)/i.test(msg)
    ) {
      return 'warning';
    }

    if (
      msg.includes('\u2705') ||
      /(^|\s)(success|successful|purchased|sold|saved|applied|credited|claimed)(\s|$)/i.test(msg) ||
      /(СѓСЃРїРµС€|РєСѓРїР»РµРЅ|РєСѓРїР»РµРЅРѕ|СЃРѕС…СЂР°РЅРµРЅ|СЃРѕС…СЂР°РЅРµРЅРѕ|СЃРѕС…СЂР°РЅРµРЅС‹|РїСЂРёРјРµРЅРµРЅ|РїСЂРёРјРµРЅРµРЅРѕ|РЅР°С‡РёСЃР»РµРЅ|РЅР°С‡РёСЃР»РµРЅРѕ|РїСЂРѕРґР°РЅ|РїСЂРѕРґР°РЅРѕ)/i.test(msg)
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
  const MATCH_PAGE_ID = "matchPage";
  const GAMES_PAGE_ID = "gamesPage";
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
  const IS_PRODUCTION_HOST = !isLocalDevHost();
  const PAGE_HISTORY_KEY = "__wtPage";
  const GAMES_CHILD_PAGES = new Set(["wheelPage", "crashPage", "casesPage"]);
  const MOBILE_GAME_BACK_PAGES = GAMES_CHILD_PAGES;
  const CASES_TILE_IMAGES = [
    'url("/images/games/cases1.webp")',
    'url("/images/games/cases2.webp")'
  ];
  const CRASH_TILE_IMAGES = [
    'url("/images/games/crash1.webp")',
    'url("/images/games/crash2.webp")'
  ];
  const GAMES_BANNER_SLIDES = [
    "/images/games/banners/banner-1.webp",
    "/images/games/banners/banner-2.webp"
  ];
  const TILE_ROTATE_MIN_SEC = 8;
  const TILE_ROTATE_MAX_SEC = 14;
  const GAMES_BANNER_AUTO_MS = 4000;
  const GAMES_BANNER_SWIPE_MS = 320;
  const GAMES_BANNER_MIN_SWIPE_PX = 44;
  const GAMES_BANNER_SWIPE_RATIO = 0.14;
  const GAMES_ONBOARDING_TEST_ALWAYS = false;
  const GAMES_ONBOARDING_STORAGE_KEY_PREFIX = "wt:games:onboarding:v2:";
  const GAMES_ONBOARDING_AUTO_ADVANCE_MS = 5000;
  const GAMES_ONBOARDING_SWIPE_MS = 320;
  const GAMES_ONBOARDING_STEPS = {
    wheelPage: {
      ru: [
        {
          banner: "/images/games/onboarding/wheel-1.webp",
          text: "Р’С‹Р±РµСЂРё СЃСѓРјРјСѓ Рё РІР°Р»СЋС‚Сѓ РґР»СЏ СЃС‚Р°РІРєРё.",
          button: "РљР°Рє СЌС‚Рѕ СЂР°Р±РѕС‚Р°РµС‚?"
        },
        {
          banner: "/images/games/onboarding/wheel-2.webp",
          text: "РљРѕР»РµСЃРѕ РєСЂСѓС‚РёС‚СЃСЏ, РјРЅРѕР¶РёС‚РµР»СЊ РІС‹РїР°РґР°РµС‚ СЃР»СѓС‡Р°Р№РЅРѕ.",
          button: "Р”Р°Р»СЊС€Рµ"
        },
        {
          banner: "/images/games/onboarding/wheel-3.webp",
          text: "РџРѕРїР°Р» РІ СЃРµРєС‚РѕСЂ, РїРѕР»СѓС‡Р°РµС€СЊ РІС‹РёРіСЂС‹С€.",
          button: "РќР°С‡Р°С‚СЊ РёРіСЂСѓ"
        }
      ],
      en: [
        {
          banner: "/images/games/onboarding/wheel-1.webp",
          text: "Choose stake amount and currency.",
          button: "How it works?"
        },
        {
          banner: "/images/games/onboarding/wheel-2.webp",
          text: "The wheel spins and a random multiplier lands.",
          button: "Next"
        },
        {
          banner: "/images/games/onboarding/wheel-3.webp",
          text: "Hit the sector and get your payout.",
          button: "Start game"
        }
      ]
    },
    crashPage: {
      ru: [
        {
          banner: "/images/games/onboarding/crash-1.webp",
          text: "РџРѕСЃС‚Р°РІСЊ СЃСѓРјРјСѓ РґРѕ РЅР°С‡Р°Р»Р° СЂР°СѓРЅРґР°.",
          button: "РљР°Рє СЌС‚Рѕ СЂР°Р±РѕС‚Р°РµС‚?"
        },
        {
          banner: "/images/games/onboarding/crash-2.webp",
          text: "РњРЅРѕР¶РёС‚РµР»СЊ СЂР°СЃС‚РµС‚, СЂРёСЃРє С‚РѕР¶Рµ СЂР°СЃС‚РµС‚.",
          button: "Р”Р°Р»СЊС€Рµ"
        },
        {
          banner: "/images/games/onboarding/crash-3.webp",
          text: "Р—Р°Р±РµСЂРё РґРѕ РєСЂР°С€Р°, РёРЅР°С‡Рµ РїСЂРѕРёРіСЂС‹С€.",
          button: "РќР°С‡Р°С‚СЊ РёРіСЂСѓ"
        }
      ],
      en: [
        {
          banner: "/images/games/onboarding/crash-1.webp",
          text: "Place your stake before the round starts.",
          button: "How it works?"
        },
        {
          banner: "/images/games/onboarding/crash-2.webp",
          text: "Multiplier grows fast and risk grows too.",
          button: "Next"
        },
        {
          banner: "/images/games/onboarding/crash-3.webp",
          text: "Cash out before crash or lose the bet.",
          button: "Start game"
        }
      ]
    },
    casesPage: {
      ru: [
        {
          banner: "/images/games/onboarding/cases-1.webp",
          text: "Р’С‹Р±РµСЂРё РєРµР№СЃ Рё С†РµРЅСѓ РѕС‚РєСЂС‹С‚РёСЏ.",
          button: "РљР°Рє СЌС‚Рѕ СЂР°Р±РѕС‚Р°РµС‚?"
        },
        {
          banner: "/images/games/onboarding/cases-2.webp",
          text: "РћС‚РєСЂРѕР№ РєРµР№СЃ, РґСЂРѕРї СЃР»СѓС‡Р°Р№РЅС‹Р№.",
          button: "Р”Р°Р»СЊС€Рµ"
        },
        {
          banner: "/images/games/onboarding/cases-3.webp",
          text: "РЎРѕС…СЂР°РЅРё РїСЂРёР· РёР»Рё РїСЂРѕРґР°Р№ РµРіРѕ.",
          button: "РќР°С‡Р°С‚СЊ РёРіСЂСѓ"
        }
      ],
      en: [
        {
          banner: "/images/games/onboarding/cases-1.webp",
          text: "Pick a case and opening price.",
          button: "How it works?"
        },
        {
          banner: "/images/games/onboarding/cases-2.webp",
          text: "Open case and get a random drop.",
          button: "Next"
        },
        {
          banner: "/images/games/onboarding/cases-3.webp",
          text: "Keep the prize or sell it.",
          button: "Start game"
        }
      ]
    }
  };
  let casesTileRotationTimer = null;
  let crashTileRotationTimer = null;
  let gamesOnboardingNode = null;
  let gamesOnboardingCloseTimer = null;
  const gamesOnboardingState = {
    stepIndex: 0,
    steps: [],
    gameId: "",
    progressRafId: null,
    progressStartedAt: 0
  };

  function getMatchComingSoonText() {
    const lang = String(WT?.i18n?.getLanguage?.() || "en").toLowerCase();
    return lang.startsWith("ru") ? "Скоро" : "Coming soon";
  }

  function syncMatchComingSoonText(scope = document) {
    const root = (scope && typeof scope.querySelector === "function") ? scope : document;
    const textEl = root.querySelector("[data-match-coming-soon='1']") || document.querySelector("[data-match-coming-soon='1']");
    if (!textEl) return;
    textEl.textContent = getMatchComingSoonText();
  }

  function getGamesOnboardingLanguage() {
    try {
      const fromI18n = String(WT?.i18n?.getLanguage?.() || "").toLowerCase();
      if (fromI18n.startsWith("ru")) return "ru";
      if (fromI18n.startsWith("en")) return "en";

      const fallback = String(
        document.body?.getAttribute?.("data-wt-lang") ||
        document.documentElement?.lang ||
        navigator?.language ||
        "en"
      ).toLowerCase();
      return fallback.startsWith("ru") ? "ru" : "en";
    } catch {
      return "en";
    }
  }

  function syncGamesHubTitle(scope = document) {
    const root = (scope && typeof scope.querySelector === "function") ? scope : document;
    const title = root.querySelector("[data-games-hub-title='1']") || document.querySelector("[data-games-hub-title='1']");
    if (!title) return;
    const lang = getGamesOnboardingLanguage();
    title.textContent = lang === "ru" ? "Игры" : "Games";
  }

  function normalizeOnboardingGameId(pageId) {
    return GAMES_CHILD_PAGES.has(pageId) ? String(pageId) : "";
  }

  function getOnboardingStorageKey(pageId) {
    const gameId = normalizeOnboardingGameId(pageId);
    return gameId ? `${GAMES_ONBOARDING_STORAGE_KEY_PREFIX}${gameId}` : "";
  }

  function hasSeenGamesOnboarding(pageId) {
    const key = getOnboardingStorageKey(pageId);
    if (!key) return false;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  function markGamesOnboardingSeen(pageId) {
    const key = getOnboardingStorageKey(pageId);
    if (!key) return;
    try {
      localStorage.setItem(key, "1");
    } catch {}
  }

  function shouldOpenGamesOnboarding(pageId) {
    const gameId = normalizeOnboardingGameId(pageId);
    if (!gameId) return false;
    if (GAMES_ONBOARDING_TEST_ALWAYS) return true;
    return !hasSeenGamesOnboarding(gameId);
  }

  function buildGamesOnboardingSteps(pageId) {
    const gameId = normalizeOnboardingGameId(pageId);
    const gameConfig = gameId ? GAMES_ONBOARDING_STEPS[gameId] : null;
    if (!gameConfig) return [];

    const lang = getGamesOnboardingLanguage();
    const source = Array.isArray(gameConfig[lang]) ? gameConfig[lang] : gameConfig.en;
    if (!Array.isArray(source)) return [];
    const safeStepText = (value) => decodeMojibakeText(String(value || "").trim());
    return source.map((step) => ({
      banner: String(step?.banner || "").trim(),
      text: safeStepText(step?.text),
      button: safeStepText(step?.button)
    }));
  }

  function stopGamesOnboardingAutoAdvance() {
    if (gamesOnboardingState.progressRafId !== null) {
      cancelAnimationFrame(gamesOnboardingState.progressRafId);
      gamesOnboardingState.progressRafId = null;
    }
    gamesOnboardingState.progressStartedAt = 0;
  }

  function updateGamesOnboardingDotsProgress(progress = 0) {
    if (!gamesOnboardingNode) return;

    const dots = gamesOnboardingNode.querySelectorAll(".games-onboarding__dot");
    const currentIndex = gamesOnboardingState.stepIndex;
    const activeProgress = Math.max(0, Math.min(1, Number(progress) || 0));

    dots.forEach((dot, index) => {
      const fill = index < currentIndex ? 1 : (index === currentIndex ? activeProgress : 0);
      dot.style.setProperty("--dot-fill", String(fill));
      dot.classList.toggle("is-active", index === currentIndex);
    });
  }

  function animateGamesOnboardingStepIn() {
    if (!gamesOnboardingNode || gamesOnboardingNode.hidden) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    const bannerWrap = gamesOnboardingNode.querySelector(".games-onboarding__bannerWrap");
    const textEl = gamesOnboardingNode.querySelector("#gamesOnboardingText");
    if (!bannerWrap || !textEl) return;

    const bannerRect = bannerWrap.getBoundingClientRect?.();
    const viewportWidth = Math.max(
      1,
      Number(window.innerWidth) || Number(document.documentElement?.clientWidth) || 1
    );
    const startOffsetX = Math.max(
      24,
      Math.round(viewportWidth - Number(bannerRect?.left || 0) + 24)
    );

    try {
      bannerWrap.getAnimations?.().forEach((anim) => anim.cancel());
      textEl.getAnimations?.().forEach((anim) => anim.cancel());
    } catch {}

    bannerWrap.animate(
      [
        { opacity: 1, transform: `translateX(${startOffsetX}px)` },
        { opacity: 1, transform: "translateX(0)" }
      ],
      {
        duration: GAMES_ONBOARDING_SWIPE_MS,
        easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
        fill: "both"
      }
    );

    textEl.animate(
      [
        { opacity: 0.18, transform: "translateX(14px)" },
        { opacity: 1, transform: "translateX(0)" }
      ],
      {
        duration: GAMES_ONBOARDING_SWIPE_MS + 60,
        delay: 36,
        easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
        fill: "both"
      }
    );
  }

  function startGamesOnboardingAutoAdvance() {
    stopGamesOnboardingAutoAdvance();

    if (!gamesOnboardingNode || gamesOnboardingNode.hidden) return;

    const maxIndex = Math.max(0, gamesOnboardingState.steps.length - 1);
    if (gamesOnboardingState.stepIndex >= maxIndex) {
      updateGamesOnboardingDotsProgress(1);
      return;
    }

    gamesOnboardingState.progressStartedAt = performance.now();
    const durationMs = GAMES_ONBOARDING_AUTO_ADVANCE_MS;

    const tick = (now) => {
      if (!gamesOnboardingNode || gamesOnboardingNode.hidden) {
        stopGamesOnboardingAutoAdvance();
        return;
      }

      const elapsed = now - gamesOnboardingState.progressStartedAt;
      const progress = Math.max(0, Math.min(1, elapsed / durationMs));
      updateGamesOnboardingDotsProgress(progress);

      if (progress >= 1) {
        gamesOnboardingState.progressRafId = null;
        goToNextGamesOnboardingStep({ fromAuto: true });
        return;
      }

      gamesOnboardingState.progressRafId = requestAnimationFrame(tick);
    };

    gamesOnboardingState.progressRafId = requestAnimationFrame(tick);
  }

  function goToNextGamesOnboardingStep({ fromAuto = false } = {}) {
    const maxIndex = Math.max(0, gamesOnboardingState.steps.length - 1);

    if (gamesOnboardingState.stepIndex < maxIndex) {
      gamesOnboardingState.stepIndex += 1;
      renderGamesOnboardingStep({ animate: true });
      return true;
    }

    if (!fromAuto) {
      closeGamesOnboarding();
      return true;
    }

    updateGamesOnboardingDotsProgress(1);
    stopGamesOnboardingAutoAdvance();
    return false;
  }

  function ensureGamesOnboardingModal() {
    if (gamesOnboardingNode && document.body.contains(gamesOnboardingNode)) return gamesOnboardingNode;

    const modal = document.createElement("div");
    modal.id = "gamesOnboardingModal";
    modal.className = "games-onboarding";
    modal.setAttribute("data-wt-i18n-ignore", "1");
    modal.hidden = true;
    modal.innerHTML = `
      <div class="games-onboarding__backdrop"></div>
      <section class="games-onboarding__sheet" role="dialog" aria-modal="true" aria-labelledby="gamesOnboardingText">
        <div class="games-onboarding__handle" aria-hidden="true"></div>
        <button class="games-onboarding__close" type="button" aria-label="Close" data-games-onboarding-close="1">
          <img src="/icons/ui/close.svg" alt="" aria-hidden="true">
        </button>

        <div class="games-onboarding__bannerWrap">
          <img
            class="games-onboarding__banner"
            id="gamesOnboardingBanner"
            src="/images/games/onboarding/wheel-1.webp"
            alt="Game instruction banner"
            loading="lazy"
            decoding="async"
          />
        </div>

        <p class="games-onboarding__text" id="gamesOnboardingText"></p>

        <div class="games-onboarding__dots" id="gamesOnboardingDots" aria-hidden="true"></div>

        <button class="games-onboarding__next" type="button" data-games-onboarding-next="1"></button>
      </section>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      const closeBtn = event.target?.closest?.("[data-games-onboarding-close='1']");
      if (closeBtn) {
        closeGamesOnboarding();
        return;
      }

      const nextBtn = event.target?.closest?.("[data-games-onboarding-next='1']");
      if (!nextBtn) return;
      goToNextGamesOnboardingStep({ fromAuto: false });
    });

    gamesOnboardingNode = modal;
    return modal;
  }

  function renderGamesOnboardingStep(options = {}) {
    const animate = options?.animate !== false;
    const restartProgress = options?.restartProgress !== false;
    const modal = ensureGamesOnboardingModal();
    const bannerEl = modal.querySelector("#gamesOnboardingBanner");
    const textEl = modal.querySelector("#gamesOnboardingText");
    const dotsEl = modal.querySelector("#gamesOnboardingDots");
    const nextBtn = modal.querySelector("[data-games-onboarding-next='1']");
    if (!textEl || !dotsEl || !nextBtn) return;

    const safeSteps = Array.isArray(gamesOnboardingState.steps) && gamesOnboardingState.steps.length
      ? gamesOnboardingState.steps
      : buildGamesOnboardingSteps(gamesOnboardingState.gameId);

    const maxIndex = Math.max(0, safeSteps.length - 1);
    const currentIndex = Math.min(Math.max(0, gamesOnboardingState.stepIndex), maxIndex);
    gamesOnboardingState.stepIndex = currentIndex;
    gamesOnboardingState.steps = safeSteps;

    const step = safeSteps[currentIndex];
    textEl.textContent = decodeMojibakeText(String(step?.text || ""));
    nextBtn.textContent = decodeMojibakeText(String(
      step?.button ||
      (getGamesOnboardingLanguage() === "ru" ? "Дальше" : "Next")
    ));
    if (bannerEl) {
      const src = String(step?.banner || "").trim();
      if (src) bannerEl.setAttribute("src", src);
      bannerEl.setAttribute("alt", `Game instruction slide ${currentIndex + 1}`);
    }
    dotsEl.innerHTML = "";
    safeSteps.forEach((_item, index) => {
      const dot = document.createElement("span");
      dot.className = "games-onboarding__dot";
      if (index === currentIndex) dot.classList.add("is-active");
      dotsEl.appendChild(dot);
    });

    updateGamesOnboardingDotsProgress(0);
    if (animate) animateGamesOnboardingStepIn();
    if (restartProgress) startGamesOnboardingAutoAdvance();
  }

  function closeGamesOnboarding() {
    if (!gamesOnboardingNode) return;

    stopGamesOnboardingAutoAdvance();
    gamesOnboardingNode.classList.remove("is-open");
    document.body.classList.remove("games-onboarding-open");

    if (gamesOnboardingCloseTimer) clearTimeout(gamesOnboardingCloseTimer);
    gamesOnboardingCloseTimer = window.setTimeout(() => {
      if (gamesOnboardingNode && !gamesOnboardingNode.classList.contains("is-open")) {
        gamesOnboardingNode.hidden = true;
      }
    }, 180);
  }

  function openGamesOnboarding(pageId) {
    const gameId = normalizeOnboardingGameId(pageId);
    if (!shouldOpenGamesOnboarding(gameId)) return;

    const modal = ensureGamesOnboardingModal();
    if (!modal) return;

    if (!GAMES_ONBOARDING_TEST_ALWAYS) markGamesOnboardingSeen(gameId);

    gamesOnboardingState.gameId = gameId;
    gamesOnboardingState.steps = buildGamesOnboardingSteps(gameId);
    gamesOnboardingState.stepIndex = 0;
    stopGamesOnboardingAutoAdvance();

    if (gamesOnboardingCloseTimer) {
      clearTimeout(gamesOnboardingCloseTimer);
      gamesOnboardingCloseTimer = null;
    }

    modal.hidden = false;
    renderGamesOnboardingStep({ animate: false, restartProgress: false });
    requestAnimationFrame(() => {
      modal.classList.add("is-open");
      startGamesOnboardingAutoAdvance();
    });
    document.body.classList.add("games-onboarding-open");
  }

  function getRandomTileRotateDelayMs(minSec = TILE_ROTATE_MIN_SEC, maxSec = TILE_ROTATE_MAX_SEC) {
    const min = Number.isFinite(minSec) ? Math.max(1, Math.floor(minSec)) : TILE_ROTATE_MIN_SEC;
    const max = Number.isFinite(maxSec) ? Math.max(min, Math.floor(maxSec)) : TILE_ROTATE_MAX_SEC;
    const randomSec = Math.floor(Math.random() * (max - min + 1)) + min;
    return randomSec * 1000;
  }

  function ensureCasesTileFadeLayers(casesTile, initialImage) {
    let layerA = casesTile.querySelector(".game-tile__cases-bg--a");
    let layerB = casesTile.querySelector(".game-tile__cases-bg--b");

    if (!layerA || !layerB) {
      if (layerA) layerA.remove();
      if (layerB) layerB.remove();

      layerA = document.createElement("span");
      layerA.className = "game-tile__cases-bg game-tile__cases-bg--a";
      layerA.setAttribute("aria-hidden", "true");

      layerB = document.createElement("span");
      layerB.className = "game-tile__cases-bg game-tile__cases-bg--b";
      layerB.setAttribute("aria-hidden", "true");

      casesTile.prepend(layerB);
      casesTile.prepend(layerA);
    }

    if (initialImage) {
      layerA.style.backgroundImage = initialImage;
      layerB.style.backgroundImage = initialImage;
    }

    return { layerA, layerB };
  }

  function ensureCrashTileFadeLayers(crashTile, initialImage) {
    let layerA = crashTile.querySelector(".game-tile__crash-bg--a");
    let layerB = crashTile.querySelector(".game-tile__crash-bg--b");

    if (!layerA || !layerB) {
      if (layerA) layerA.remove();
      if (layerB) layerB.remove();

      layerA = document.createElement("span");
      layerA.className = "game-tile__crash-bg game-tile__crash-bg--a";
      layerA.setAttribute("aria-hidden", "true");

      layerB = document.createElement("span");
      layerB.className = "game-tile__crash-bg game-tile__crash-bg--b";
      layerB.setAttribute("aria-hidden", "true");

      crashTile.prepend(layerB);
      crashTile.prepend(layerA);
    }

    if (initialImage) {
      layerA.style.backgroundImage = initialImage;
      layerB.style.backgroundImage = initialImage;
    }

    return { layerA, layerB };
  }

  function scheduleNextCasesTileRotation() {
    const delayMs = getRandomTileRotateDelayMs();
    casesTileRotationTimer = window.setTimeout(() => {
      if (document.hidden || getActivePageId() !== GAMES_PAGE_ID) {
        scheduleNextCasesTileRotation();
        return;
      }

      const tile = document.querySelector(".game-tile--cases");
      if (!tile) {
        scheduleNextCasesTileRotation();
        return;
      }

      const prevIndex = Number.parseInt(tile.dataset.casesImageIndex || "0", 10);
      const safePrev = Number.isFinite(prevIndex) ? prevIndex : 0;
      const nextIndex = (safePrev + 1) % CASES_TILE_IMAGES.length;
      const activeLayerName = tile.dataset.casesActiveLayer === "b" ? "b" : "a";
      const nextLayerName = activeLayerName === "a" ? "b" : "a";
      const currentLayer = tile.querySelector(`.game-tile__cases-bg--${activeLayerName}`);
      const nextLayer = tile.querySelector(`.game-tile__cases-bg--${nextLayerName}`);

      if (!currentLayer || !nextLayer) {
        const startImage = CASES_TILE_IMAGES[safePrev % CASES_TILE_IMAGES.length];
        const layers = ensureCasesTileFadeLayers(tile, startImage);
        layers.layerA.classList.add("is-visible");
        layers.layerB.classList.remove("is-visible");
        tile.dataset.casesActiveLayer = "a";
        scheduleNextCasesTileRotation();
        return;
      }

      tile.dataset.casesImageIndex = String(nextIndex);
      nextLayer.style.backgroundImage = CASES_TILE_IMAGES[nextIndex];
      nextLayer.classList.add("is-visible");
      currentLayer.classList.remove("is-visible");
      tile.dataset.casesActiveLayer = nextLayerName;

      scheduleNextCasesTileRotation();
    }, delayMs);
  }

  function scheduleNextCrashTileRotation() {
    const delayMs = getRandomTileRotateDelayMs();
    crashTileRotationTimer = window.setTimeout(() => {
      if (document.hidden || getActivePageId() !== GAMES_PAGE_ID) {
        scheduleNextCrashTileRotation();
        return;
      }

      const tile = document.querySelector(".game-tile--crash");
      if (!tile) {
        scheduleNextCrashTileRotation();
        return;
      }

      const prevIndex = Number.parseInt(tile.dataset.crashImageIndex || "0", 10);
      const safePrev = Number.isFinite(prevIndex) ? prevIndex : 0;
      const nextIndex = (safePrev + 1) % CRASH_TILE_IMAGES.length;
      const activeLayerName = tile.dataset.crashActiveLayer === "b" ? "b" : "a";
      const nextLayerName = activeLayerName === "a" ? "b" : "a";
      const currentLayer = tile.querySelector(`.game-tile__crash-bg--${activeLayerName}`);
      const nextLayer = tile.querySelector(`.game-tile__crash-bg--${nextLayerName}`);

      if (!currentLayer || !nextLayer) {
        const startImage = CRASH_TILE_IMAGES[safePrev % CRASH_TILE_IMAGES.length];
        const layers = ensureCrashTileFadeLayers(tile, startImage);
        layers.layerA.classList.add("is-visible");
        layers.layerB.classList.remove("is-visible");
        tile.dataset.crashActiveLayer = "a";
        scheduleNextCrashTileRotation();
        return;
      }

      tile.dataset.crashImageIndex = String(nextIndex);
      nextLayer.style.backgroundImage = CRASH_TILE_IMAGES[nextIndex];
      nextLayer.classList.add("is-visible");
      currentLayer.classList.remove("is-visible");
      tile.dataset.crashActiveLayer = nextLayerName;

      scheduleNextCrashTileRotation();
    }, delayMs);
  }

  function setupCasesTileRotation(scope = document) {
    const root = (scope && typeof scope.querySelector === "function") ? scope : document;
    const casesTile = root.querySelector(".game-tile--cases") || document.querySelector(".game-tile--cases");
    if (!casesTile || !CASES_TILE_IMAGES.length) return;

    const currentIndex = Number.parseInt(casesTile.dataset.casesImageIndex || "0", 10);
    const startIndex = Number.isFinite(currentIndex)
      ? Math.abs(currentIndex) % CASES_TILE_IMAGES.length
      : 0;

    casesTile.dataset.casesImageIndex = String(startIndex);
    const { layerA, layerB } = ensureCasesTileFadeLayers(casesTile, CASES_TILE_IMAGES[startIndex]);
    layerA.style.backgroundImage = CASES_TILE_IMAGES[startIndex];
    layerB.style.backgroundImage = CASES_TILE_IMAGES[startIndex];
    layerA.classList.add("is-visible");
    layerB.classList.remove("is-visible");
    casesTile.dataset.casesActiveLayer = "a";

    if (casesTileRotationTimer !== null) return;
    scheduleNextCasesTileRotation();
  }

  function setupCrashTileRotation(scope = document) {
    const root = (scope && typeof scope.querySelector === "function") ? scope : document;
    const crashTile = root.querySelector(".game-tile--crash") || document.querySelector(".game-tile--crash");
    if (!crashTile || !CRASH_TILE_IMAGES.length) return;

    const currentIndex = Number.parseInt(crashTile.dataset.crashImageIndex || "0", 10);
    const startIndex = Number.isFinite(currentIndex)
      ? Math.abs(currentIndex) % CRASH_TILE_IMAGES.length
      : 0;

    crashTile.dataset.crashImageIndex = String(startIndex);
    const { layerA, layerB } = ensureCrashTileFadeLayers(crashTile, CRASH_TILE_IMAGES[startIndex]);
    layerA.style.backgroundImage = CRASH_TILE_IMAGES[startIndex];
    layerB.style.backgroundImage = CRASH_TILE_IMAGES[startIndex];
    layerA.classList.add("is-visible");
    layerB.classList.remove("is-visible");
    crashTile.dataset.crashActiveLayer = "a";

    if (crashTileRotationTimer !== null) return;
    scheduleNextCrashTileRotation();
  }

  function setupGamesBannerCarousel(scope = document) {
    const root = (scope && typeof scope.querySelector === "function") ? scope : document;
    const carousel = root.querySelector("[data-games-banners='1']") || document.querySelector("[data-games-banners='1']");
    if (!carousel) return;
    if (carousel.dataset.carouselReady === "1") return;

    const viewport = carousel.querySelector("[data-games-banners-viewport='1']");
    const track = carousel.querySelector("[data-games-banners-track='1']");
    if (!viewport || !track) return;

    const baseSlides = Array.from(track.children || []);
    const slideCount = baseSlides.length;
    if (!slideCount) return;

    if (slideCount > 1) {
      const firstClone = baseSlides[0].cloneNode(true);
      const lastClone = baseSlides[slideCount - 1].cloneNode(true);
      firstClone.dataset.bannerClone = "first";
      lastClone.dataset.bannerClone = "last";
      track.appendChild(firstClone);
      track.insertBefore(lastClone, track.firstChild);
    }

    let trackIndex = slideCount > 1 ? 1 : 0;
    let autoTimer = null;
    let dragStartX = 0;
    let dragOffsetX = 0;
    let isDragging = false;
    let isMouseDragBound = false;
    let viewportWidth = Math.max(1, Math.round(viewport.getBoundingClientRect().width || 1));
    let slideStep = viewportWidth;

    const getRealIndex = (value) => {
      if (slideCount <= 1) return 0;
      return ((value - 1) % slideCount + slideCount) % slideCount;
    };

    const syncViewportWidth = () => {
      viewportWidth = Math.max(1, Math.round(viewport.getBoundingClientRect().width || 1));
      const trackStyles = window.getComputedStyle(track);
      const rawGap = String(trackStyles.gap || trackStyles.columnGap || "0").trim();
      const firstGapToken = rawGap.split(/\s+/)[0] || "0";
      const gap = Number.parseFloat(firstGapToken);
      const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
      slideStep = viewportWidth + safeGap;
    };

    const render = ({ animate = true, dragOffset = 0, recalc = true } = {}) => {
      if (recalc || viewportWidth <= 1) syncViewportWidth();
      track.style.transitionDuration = animate ? `${GAMES_BANNER_SWIPE_MS}ms` : "0ms";
      track.style.transform = `translate3d(${-(trackIndex * slideStep) + dragOffset}px, 0, 0)`;
      carousel.dataset.bannerIndex = String(getRealIndex(trackIndex));
    };

    const normalizeLoopPosition = () => {
      if (slideCount <= 1) return;
      if (trackIndex <= 0) {
        trackIndex = slideCount;
        render({ animate: false, recalc: false });
        return;
      }
      if (trackIndex >= slideCount + 1) {
        trackIndex = 1;
        render({ animate: false, recalc: false });
      }
    };

    const moveBy = (delta) => {
      if (slideCount <= 1) return;
      trackIndex += delta;
      render({ animate: true, recalc: false });
    };

    const stopAuto = () => {
      if (autoTimer !== null) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
    };

    const startAuto = () => {
      stopAuto();
      if (slideCount < 2) return;
      autoTimer = window.setInterval(() => {
        if (document.hidden || getActivePageId() !== GAMES_PAGE_ID || isDragging) return;
        // Auto always moves to the right.
        moveBy(-1);
      }, GAMES_BANNER_AUTO_MS);
    };

    const releaseMouseDrag = () => {
      if (!isMouseDragBound) return;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      isMouseDragBound = false;
    };

    const beginDrag = (startX) => {
      if (slideCount < 2) return;
      normalizeLoopPosition();
      syncViewportWidth();
      isDragging = true;
      dragStartX = startX;
      dragOffsetX = 0;
      track.style.transitionDuration = "0ms";
      stopAuto();
      carousel.classList.add("is-dragging");
    };

    const updateDrag = (clientX) => {
      if (!isDragging) return;
      const maxOffset = Math.round(viewportWidth * 1.08);
      const rawOffset = clientX - dragStartX;
      dragOffsetX = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));
      render({ animate: false, dragOffset: dragOffsetX, recalc: false });
    };

    const finishSwipe = () => {
      if (!isDragging) return;

      isDragging = false;
      carousel.classList.remove("is-dragging");
      releaseMouseDrag();

      const swipeThreshold = Math.max(
        GAMES_BANNER_MIN_SWIPE_PX,
        Math.round(viewportWidth * GAMES_BANNER_SWIPE_RATIO)
      );

      if (Math.abs(dragOffsetX) >= swipeThreshold) {
        if (dragOffsetX > 0) moveBy(-1);
        else moveBy(1);
      } else {
        render({ animate: true, recalc: false });
      }

      dragOffsetX = 0;
      startAuto();
    };

    function onMouseMove(event) {
      if (!isDragging) return;
      updateDrag(event.clientX);
      event.preventDefault();
    }

    function onMouseUp() {
      finishSwipe();
    }

    viewport.addEventListener("touchstart", (event) => {
      if (!event.touches || event.touches.length !== 1) return;
      beginDrag(event.touches[0].clientX);
    }, { passive: true });

    viewport.addEventListener("touchmove", (event) => {
      if (!isDragging || !event.touches || event.touches.length !== 1) return;
      updateDrag(event.touches[0].clientX);
    }, { passive: true });

    viewport.addEventListener("touchend", finishSwipe, { passive: true });
    viewport.addEventListener("touchcancel", finishSwipe, { passive: true });

    viewport.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      beginDrag(event.clientX);
      if (!isDragging) return;
      if (!isMouseDragBound) {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        isMouseDragBound = true;
      }
      event.preventDefault();
    });

    viewport.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });

    carousel.addEventListener("mouseenter", stopAuto);
    carousel.addEventListener("mouseleave", () => {
      if (!isDragging) startAuto();
    });

    track.addEventListener("transitionend", (event) => {
      if (event.target !== track || event.propertyName !== "transform") return;
      normalizeLoopPosition();
    });

    const syncLayout = () => {
      normalizeLoopPosition();
      render({ animate: false, recalc: true });
    };

    window.addEventListener("resize", syncLayout, { passive: true });
    carousel.__wtGamesBannerSync = syncLayout;

    carousel.dataset.carouselReady = "1";
    render({ animate: false, recalc: true });
    startAuto();
  }

  function detectMobileIosOrAndroid() {
    try {
      const ua = String(navigator.userAgent || "").toLowerCase();
      const platform = String(navigator.platform || "").toLowerCase();
      const touchPoints = Number(navigator.maxTouchPoints || 0);
      const isAndroid = ua.includes("android");
      const isIOS = /iphone|ipod|ipad/.test(ua) || (platform === "macintel" && touchPoints > 1);
      return isAndroid || isIOS;
    } catch {
      return false;
    }
  }

  const IS_MOBILE_IOS_OR_ANDROID = detectMobileIosOrAndroid();

  // РєР°РєРёРµ СЃС‚СЂР°РЅРёС†С‹ СЃС‡РёС‚Р°РµРј "РІРЅСѓС‚СЂРё Games" (РІ РЅР°РІР±Р°СЂРµ РїРѕРґСЃРІРµС‡РёРІР°РµРј Games)
  const NAV_ALIAS = {
    crashPage: GAMES_PAGE_ID,
    casesPage: GAMES_PAGE_ID,
    wheelPage: GAMES_PAGE_ID
  };
  const navKeyForPage = (id) => NAV_ALIAS[id] || id;
  let activePageIdCache = null;
  let activePageElCache = null;
  let activeBodyPageClass = "";
  let activeNavKeyCache = null;

  function getActivePageId() {
    if (
      activePageElCache &&
      activePageIdCache &&
      activePageElCache.id === activePageIdCache &&
      activePageElCache.classList.contains("page-active")
    ) {
      return activePageIdCache;
    }

    const active = document.querySelector(".page.page-active");
    activePageElCache = active || null;
    activePageIdCache = active?.id || null;
    return activePageIdCache;
  }

  function pageIdToBodyClass(pageId) {
    const pageKey = String(pageId || "")
      .replace(/Page$/,'')
      .replace(/Page/i,'')
      .toLowerCase();
    return pageKey ? `page-${pageKey}` : "";
  }

  function setBodyPageClass(pageId) {
    const body = document.body;
    if (!body) return;

    const nextClass = pageIdToBodyClass(pageId);
    const pageClasses = Array.from(body.classList).filter((cls) => cls.startsWith("page-"));

    if (!activeBodyPageClass && pageClasses.length) {
      pageClasses.forEach((cls) => {
        if (cls !== nextClass) body.classList.remove(cls);
      });
      activeBodyPageClass = pageClasses.find((cls) => cls === nextClass) || "";
    }

    if (activeBodyPageClass && activeBodyPageClass !== nextClass) {
      body.classList.remove(activeBodyPageClass);
    }

    if (nextClass && !body.classList.contains(nextClass)) {
      body.classList.add(nextClass);
    }

    activeBodyPageClass = nextClass;
  }

  function setActiveNavItem(navKey) {
    if (!navKey) return;

    const navSelector = ".bottom-nav .nav-item";
    if (!activeNavKeyCache) {
      document.querySelectorAll(navSelector).forEach((item) => item.classList.remove("active"));
    } else if (activeNavKeyCache !== navKey) {
      document.querySelector(`${navSelector}[data-target="${activeNavKeyCache}"]`)?.classList.remove("active");
    }

    document.querySelector(`${navSelector}[data-target="${navKey}"]`)?.classList.add("active");
    activeNavKeyCache = navKey;
  }

  const MIN_GAMES_LAYOUT_SCALE = 0.42;
  let gamesFitRafId = null;

  function applyGamesViewportFit() {
    const page = document.getElementById(GAMES_PAGE_ID);
    if (!page) return;

    const fitRoot = page.querySelector(".games__fit");
    if (!fitRoot) return;

    fitRoot.style.setProperty("--games-layout-scale", "1");
    page.style.removeProperty("--games-available-height");

    if (getActivePageId() !== GAMES_PAGE_ID) return;

    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    const topbarBottom = document.querySelector(".topbar")?.getBoundingClientRect?.().bottom || 0;
    const navTop = document.querySelector(".bottom-nav")?.getBoundingClientRect?.().top || viewportHeight;
    const availableHeight = Math.max(220, Math.floor(navTop - topbarBottom - 4));

    page.style.setProperty("--games-available-height", `${availableHeight}px`);

    const naturalHeight = fitRoot.scrollHeight || fitRoot.getBoundingClientRect?.().height || 1;
    const initialScale = Math.max(MIN_GAMES_LAYOUT_SCALE, Math.min(1, availableHeight / naturalHeight));
    fitRoot.style.setProperty("--games-layout-scale", initialScale.toFixed(4));

    const fittedHeight = fitRoot.scrollHeight || 1;
    if (fittedHeight > availableHeight) {
      const correctedScale = Math.max(
        MIN_GAMES_LAYOUT_SCALE,
        Math.min(1, initialScale * (availableHeight / fittedHeight))
      );
      fitRoot.style.setProperty("--games-layout-scale", correctedScale.toFixed(4));
    }
  }

  function scheduleGamesViewportFit() {
    if (gamesFitRafId !== null) cancelAnimationFrame(gamesFitRafId);
    gamesFitRafId = requestAnimationFrame(() => {
      gamesFitRafId = null;
      applyGamesViewportFit();
    });
  }

  // If an overlay left scroll-lock styles on body, entering game pages can show
  // a fake top gap and extra scroll range. Normalize this state on navigation.
  const RESET_SCROLL_PAGES = new Set([MATCH_PAGE_ID, GAMES_PAGE_ID, "wheelPage", "crashPage"]);
  function normalizeLockedViewportForPage(pageId) {
    if (!RESET_SCROLL_PAGES.has(pageId)) return;
    try {
      document.documentElement.classList.remove("bonus-active");
      document.body.classList.remove("bonus-active");

      if (document.body.style.top) document.body.style.top = "";
      if (document.body.style.position === "fixed") document.body.style.position = "";
      if (document.body.style.left) document.body.style.left = "";
      if (document.body.style.right) document.body.style.right = "";
      if (document.body.style.width) document.body.style.width = "";
      if (document.body.style.overflow === "hidden") document.body.style.overflow = "";

      if ((window.scrollY || window.pageYOffset || 0) !== 0) {
        window.scrollTo(0, 0);
      }
    } catch {}
  }
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

  function syncTelegramMiniGameBackButton(pageId = getActivePageId()) {
    if (!IS_MOBILE_IOS_OR_ANDROID) return;
    const backButton = tg?.BackButton;
    if (!backButton) return;

    const shouldShow = MOBILE_GAME_BACK_PAGES.has(pageId);
    try {
      if (shouldShow) backButton.show?.();
      else backButton.hide?.();
    } catch {}
  }

  function navigateToGamesFromMiniGame({ preferHistoryBack = true } = {}) {
    const currentId = getActivePageId();
    if (!MOBILE_GAME_BACK_PAGES.has(currentId)) return false;

    if (
      preferHistoryBack &&
      readHistoryPage() === currentId &&
      typeof window.history?.back === "function"
    ) {
      window.history.back();
      return true;
    }

    activatePage(GAMES_PAGE_ID);
    return true;
  }

  function setupTelegramMiniGameBackButton() {
    if (!IS_MOBILE_IOS_OR_ANDROID) return;
    const backButton = tg?.BackButton;
    if (!backButton) return;

    const onBackButtonClick = () => {
      navigateToGamesFromMiniGame({ preferHistoryBack: true });
    };

    try {
      if (typeof backButton.offClick === "function") {
        backButton.offClick(onBackButtonClick);
      }

      if (typeof backButton.onClick === "function") {
        backButton.onClick(onBackButtonClick);
      } else if (typeof tg?.onEvent === "function") {
        tg.onEvent("backButtonClicked", onBackButtonClick);
      }
    } catch {}
  }

  function ensureMatchPage() {
    let page = document.getElementById(MATCH_PAGE_ID);
    if (page && IS_PRODUCTION_HOST) {
      syncMatchComingSoonText(page);
    }
    if (page) return page;

    page = document.createElement("main");
    page.id = MATCH_PAGE_ID;
    page.className = "page";
    page.innerHTML = IS_PRODUCTION_HOST
      ? `
      <section class="match-developing" aria-live="polite">
        <img
          class="match-developing__image"
          src="/images/developing.webp"
          alt="Developing"
          onerror="this.onerror=null;this.src='/images/games/soon.webp';"
          loading="eager"
          decoding="async"
        />
        <p class="match-developing__text" data-match-coming-soon="1">Coming soon</p>
      </section>
    `
      : "";

    const appRoot = document.querySelector(".app") || document.body;
    const bottomNav = appRoot.querySelector(".bottom-nav") || document.querySelector(".bottom-nav");
    if (bottomNav) appRoot.insertBefore(page, bottomNav);
    else appRoot.appendChild(page);

    if (IS_PRODUCTION_HOST) syncMatchComingSoonText(page);

    return page;
  }

  function ensureGamesPage() {
    let page = document.getElementById(GAMES_PAGE_ID);
    if (page) return page;

    page = document.createElement("main");
    page.id = GAMES_PAGE_ID;
    page.className = "page";
    const gamesBannerSlidesMarkup = GAMES_BANNER_SLIDES.map((bannerSrc, index) => `
                <div class="games-banners__slide">
                  <div
                    class="games-banners__card"
                    role="img"
                    aria-label="Games banner ${index + 1}"
                    style="--games-banner-image:url('${bannerSrc}');"
                  ></div>
                </div>
              `).join("");

    page.innerHTML = `
      <section class="games">
        <div class="games__fit">
          <section class="games-banners" data-games-banners="1" aria-label="Games banners">
            <div class="games-banners__viewport" data-games-banners-viewport="1">
              <div class="games-banners__track" data-games-banners-track="1">
                ${gamesBannerSlidesMarkup}
              </div>
            </div>
          </section>

          <section class="games-panels" aria-label="Games panels">
            <h2 class="games-panels__title" data-games-hub-title="1">Games</h2>
            <div class="games-grid">
              <button class="game-tile game-tile--wheel" type="button" data-go="wheelPage" aria-label="Open Wheel">
                <span class="game-tile__label" aria-hidden="true">Wheel</span>
              </button>

              <button class="game-tile game-tile--crash" type="button" data-go="crashPage" aria-label="Open Crash">
                <span class="game-tile__label" aria-hidden="true">Crash</span>
              </button>

              <button class="game-tile game-tile--cases" type="button" data-go="casesPage" aria-label="Open Cases">
                <span class="game-tile__label" aria-hidden="true">Cases</span>
              </button>

              <button class="game-tile game-tile--soon" type="button" disabled aria-disabled="true">
                <span class="game-tile__label" aria-hidden="true">Soon</span>
              </button>
            </div>
          </section>

        </div>
      </section>
    `;

    const appRoot = document.querySelector(".app") || document.body;
    const bottomNav = appRoot.querySelector(".bottom-nav") || document.querySelector(".bottom-nav");
    if (bottomNav) appRoot.insertBefore(page, bottomNav);
    else appRoot.appendChild(page);

    // РєР»РёРєРё РїРѕ РїРѕСЃС‚РµСЂР°Рј -> РѕС‚РєСЂС‹РІР°РµРј РІС‹Р±СЂР°РЅРЅСѓСЋ РёРіСЂСѓ
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

    syncGamesHubTitle(page);

    return page;
  }

  // РќР°РІРёРіР°С†РёСЏ РјРµР¶РґСѓ СЃС‚СЂР°РЅРёС†Р°РјРё
  function activatePage(id, options = {}){
    const { fromHistory = false } = options;
    const pg = document.getElementById(id);
    if (!pg) {
      console.warn(`[WT] Page not found: ${id}`);
      return;
    }

    const currentId = getActivePageId();
    normalizeLockedViewportForPage(id);

    if (currentId === id) {
      setBodyPageClass(id);
      setActiveNavItem(navKeyForPage(id));
      syncTelegramMiniGameBackButton(id);
      return;
    }

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

    const currentPage = currentId ? document.getElementById(currentId) : activePageElCache;
    if (currentPage && currentPage !== pg) {
      currentPage.classList.remove("page-active");
    } else if (!currentPage) {
      document.querySelectorAll(".page.page-active").forEach((pageNode) => {
        if (pageNode !== pg) pageNode.classList.remove("page-active");
      });
    }
    pg.classList.add("page-active");
    activePageElCache = pg;
    activePageIdCache = id;

    // РІС‹СЃС‚Р°РІР»СЏРµРј РєР»Р°СЃСЃ СЃС‚СЂР°РЅРёС†С‹ РЅР° body (РґР»СЏ page-specific CSS)
    // РїСЂРёРјРµСЂ: wheelPage -> body.page-wheel
    setBodyPageClass(id);

    // nav highlight (Crash/Cases/Wheel -> Games)
    const navKey = navKeyForPage(id);
    setActiveNavItem(navKey);
    syncTelegramMiniGameBackButton(id);

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

    if (GAMES_CHILD_PAGES.has(id)) openGamesOnboarding(id);
    else closeGamesOnboarding();

    WT.bus.dispatchEvent(new CustomEvent("page:change", { detail:{ id } }));
  }

  // Р­РєСЃРїРѕСЂС‚РёСЂСѓРµРј РЅР°РІРёРіР°С†РёСЋ (С‡С‚РѕР±С‹ РґСЂСѓРіРёРµ РјРѕРґСѓР»Рё РјРѕРіР»Рё РґРµСЂРіР°С‚СЊ РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё)
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

  // Р”РµР»РµРіРёСЂСѓРµРј РєР»РёРєРё РїРѕ РЅРёР¶РЅРµР№ РЅР°РІРёРіР°С†РёРё (С‚Р°Рє СЂР°Р±РѕС‚Р°РµС‚ Рё РґР»СЏ РґРёРЅР°РјРёС‡РµСЃРєРё РґРѕР±Р°РІР»РµРЅРЅС‹С… РїСѓРЅРєС‚РѕРІ)
  const bottomNav = document.querySelector(".bottom-nav");
  bottomNav?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".nav-item");
    if (!btn || !bottomNav.contains(btn)) return;

    // РµСЃР»Рё РЅР°РІ-Р°Р№С‚РµРј вЂ” СЃСЃС‹Р»РєР°, РЅРµ РґР°С‘Рј Р±СЂР°СѓР·РµСЂСѓ РїСЂС‹РіР°С‚СЊ РїРѕ href
    try {
      const tag = String(btn.tagName || "").toUpperCase();
      if (tag === "A" || btn.getAttribute("href")) e.preventDefault();
    } catch {}

    const target = btn.getAttribute("data-target");
    if (target) activatePage(target);
  });

  // РЎРѕР·РґР°С‘Рј Games-С…Р°Р± Рё РїСѓРЅРєС‚ РІ РЅР°РІР±Р°СЂРµ (РµСЃР»Рё РµРіРѕ РµС‰С‘ РЅРµС‚)
  ensureMatchPage();
  const gamesPage = ensureGamesPage();
  setupGamesBannerCarousel(gamesPage);
  setupCasesTileRotation(gamesPage);
  setupCrashTileRotation(gamesPage);
  scheduleGamesViewportFit();

  // Р•СЃР»Рё РїСЂРё СЃС‚Р°СЂС‚Рµ РЅРµС‚ Р°РєС‚РёРІРЅРѕР№ вЂ” Р°РєС‚РёРІРёСЂСѓРµРј Games (РёР»Рё РїРµСЂРІСѓСЋ)
  if(!document.querySelector(".page.page-active")){
    const games = document.getElementById(GAMES_PAGE_ID);
    if (games) activatePage(GAMES_PAGE_ID);
    else {
      const first = document.querySelector(".page");
      if(first) activatePage(first.id);
    }
  } else {
    const initialPageId = getActivePageId();
    normalizeLockedViewportForPage(initialPageId);
    if (initialPageId) {
      setBodyPageClass(initialPageId);
      setActiveNavItem(navKeyForPage(initialPageId));
    }
  }

  setupTelegramMiniGameBackButton();
  syncTelegramMiniGameBackButton();

  WT.bus.addEventListener("page:change", (event) => {
    if (event?.detail?.id === GAMES_PAGE_ID) {
      document.querySelector("[data-games-banners='1']")?.__wtGamesBannerSync?.();
      scheduleGamesViewportFit();
      setTimeout(scheduleGamesViewportFit, 120);
      syncGamesHubTitle(document.getElementById(GAMES_PAGE_ID));
    }
  });

  window.addEventListener("language:changed", () => {
    syncGamesHubTitle(document.getElementById(GAMES_PAGE_ID));
    syncMatchComingSoonText(document.getElementById(MATCH_PAGE_ID));
  });

  window.addEventListener("resize", scheduleGamesViewportFit, { passive: true });
  window.addEventListener("orientationchange", scheduleGamesViewportFit, { passive: true });
  window.addEventListener("load", scheduleGamesViewportFit);
  window.addEventListener("load", () => {
    document.querySelector("[data-games-banners='1']")?.__wtGamesBannerSync?.();
  });
  requestAnimationFrame(() => {
    document.querySelector("[data-games-banners='1']")?.__wtGamesBannerSync?.();
  });
})();


