/**
 * relayer.js — Telegram "Gift Relayer" (MTProto user account)
 *
 * Что делает:
 *  - логинится в Telegram как обычный аккаунт (не бот)
 *  - слушает входящие сервис-сообщения про подарки (Star Gifts / Gifts)
 *  - скачивает превью/картинку подарка в /public/images/gifts/marketnfts/
 *  - добавляет лот в Market (/api/market/items/add) если отправитель = admin
 *    или добавляет в инвентарь пользователя (/api/inventory/nft/add) если обычный игрок
 *  - отправляет отправителю уведомление "добавлено"
 *
 * Команды:
 *  - node relayer.js login   -> получишь RELAYER_SESSION
 *  - node relayer.js run     -> запускает слушатель
 *
 * ENV:
 *  RELAYER_API_ID=12345
 *  RELAYER_API_HASH=xxxx
 *  RELAYER_SESSION= (получишь через login)
 *  RELAYER_SERVER=http://localhost:3000
 *  RELAYER_SECRET=любая_строка (должна совпадать с RELAYER_SECRET/MARKET_SECRET в server)
 *  RELAYER_ADMIN_IDS=11111111,22222222 (ID тех, кто пополняет market)
 *  RELAYER_IMG_DIR=/abs/path/to/public/images/gifts/marketnfts (опционально)
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";

const CMD = (process.argv[2] || "run").toLowerCase();

const API_ID = Number(process.env.RELAYER_API_ID || process.env.TG_API_ID || 0);
const API_HASH = String(process.env.RELAYER_API_HASH || process.env.TG_API_HASH || "");
const SESSION_STR = String(process.env.RELAYER_SESSION || "");
const SERVER = String(process.env.RELAYER_SERVER || "http://localhost:3000").replace(/\/+$/, "");
const SECRET = String(process.env.RELAYER_SECRET || process.env.MARKET_SECRET || "");
const ADMIN_IDS = String(process.env.RELAYER_ADMIN_IDS || process.env.MARKET_ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DEBUG = /^(1|true|yes)$/i.test(String(process.env.RELAYER_DEBUG || ""));
// По умолчанию 1: отправляем картинку/паттерн прямо в JSON (data:image/...)
// Если поставить 0 — релайер будет сохранять файлы локально (подходит только когда релайер и сервер на одной машине)
const INLINE_IMAGES = !/^(0|false|no)$/i.test(String(process.env.RELAYER_INLINE_IMAGES || "1"));


const IMG_DIR = String(process.env.RELAYER_IMG_DIR || path.join(process.cwd(), "public", "images", "gifts", "marketnfts"));

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function ensureDir(p) {
  try {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  } catch (e) {
    die(`[Relayer] Can't create dir ${p}: ${e?.message || e}`);
  }
}

function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

function formatNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("en-US"); // 442,514
}

function safeFileBase(s) {
  const t = String(s || "gift").toLowerCase().trim();
  // ascii + _
  return t
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]+/g, "")
    .slice(0, 48) || "gift";
}


function fragmentMediumPreviewUrlFromSlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return "";
  // slug in Telegram is like "MousseCake-65920" / "SnoopDogg-410198"
  const base = s.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
  if (!base) return "";
  return `https://nft.fragment.com/gift/${base}.medium.jpg`;
}



function pickDocFromStarGift(gift) {
  // StarGift can have sticker (document). Unique gift will have attributes with model/pattern documents.
  let doc = gift?.sticker || gift?.document || null;

  const attrs = Array.isArray(gift?.attributes) ? gift.attributes : [];
  for (const a of attrs) {
    if (a instanceof Api.StarGiftAttributeModel && a.document) doc = a.document;
    if (!doc && a instanceof Api.StarGiftAttributePattern && a.document) doc = a.document;
  }
  return doc;
}

function extractAttrs(gift) {
  const attrs = Array.isArray(gift?.attributes) ? gift.attributes : [];
  let model = null, backdrop = null, pattern = null;

  for (const a of attrs) {
    if (a instanceof Api.StarGiftAttributeModel) model = a.name || null;
    if (a instanceof Api.StarGiftAttributeBackdrop) backdrop = a.name || null;
    if (a instanceof Api.StarGiftAttributePattern) pattern = a.name || null;
  }
  return { model, backdrop, pattern };
}

function rgb24ToHex(rgb24) {
  const n = Number(rgb24);
  if (!Number.isFinite(n)) return null;
  const v = Math.max(0, Math.min(0xFFFFFF, Math.trunc(n)));
  return `#${v.toString(16).padStart(6, "0")}`;
}

function extractGiftAssets(gift) {
  const attrs = Array.isArray(gift?.attributes) ? gift.attributes : [];

  let modelDoc = null;
  let modelName = null;

  let patternDoc = null;
  let patternName = null;

  let backdrop = null;

  for (const a of attrs) {
    if (a instanceof Api.StarGiftAttributeModel) {
      if (a.document) modelDoc = a.document;
      modelName = a.name || modelName;
    }
    if (a instanceof Api.StarGiftAttributePattern) {
      if (a.document) patternDoc = a.document;
      patternName = a.name || patternName;
    }
    if (a instanceof Api.StarGiftAttributeBackdrop) {
      backdrop = {
        name: a.name || null,
        center: rgb24ToHex(a.centerColor),
        edge: rgb24ToHex(a.edgeColor),
        patternColor: rgb24ToHex(a.patternColor),
        textColor: rgb24ToHex(a.textColor),
      };
    }
  }

  const fallbackDoc = pickDocFromStarGift(gift);

  return {
    modelDoc: modelDoc || fallbackDoc || null,
    modelName: modelName || null,
    patternDoc: patternDoc || null,
    patternName: patternName || null,
    backdrop: backdrop || null,
  };
}

function guessDataMime(docMime, { forceJpeg = false } = {}) {
  if (forceJpeg) return "image/jpeg";
  const m = String(docMime || "").toLowerCase();
  if (m.includes("png")) return "image/png";
  if (m.includes("jpeg") || m.includes("jpg")) return "image/jpeg";
  if (m.includes("gif")) return "image/gif";
  if (m.includes("webp")) return "image/webp";
  return "image/webp";
}

async function downloadDocAsDataUrl(client, doc, { forceThumb = false } = {}) {
  if (!doc) return "";
  const mime = String(doc.mimeType || "");
  const shouldThumb =
    forceThumb ||
    mime.includes("tgsticker") ||
    mime.includes("application/x-tgsticker") ||
    mime.includes("video") ||
    mime.includes("webm");

  try {
    let buf = null;

    if (shouldThumb) {
      try { buf = await client.downloadMedia(doc, { thumb: 0 }); } catch {}
    }
    if (!buf || !buf.length) {
      buf = await client.downloadMedia(doc);
    }
    if (!buf || !buf.length) return "";

    const outMime = guessDataMime(mime, { forceJpeg: shouldThumb });
    return `data:${outMime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch (e) {
    if (DEBUG) console.log("[Relayer] downloadDocAsDataUrl error:", e?.message || e);
    return "";
  }
}


function peerUserId(peer) {
  if (!peer) return null;
  // GramJS peers can be PeerUser / PeerChannel / PeerChat
  if (peer.userId != null) return String(peer.userId);
  if (peer instanceof Api.PeerUser && peer.userId != null) return String(peer.userId);
  // sometimes message.fromId is InputPeerUser-like
  if (peer?.value != null) return String(peer.value);
  return null;
}
function peerKey(peer) {
  if (!peer) return "p0";
  try {
    // GramJS peers can be PeerUser / PeerChannel / PeerChat
    if (peer instanceof Api.PeerUser || peer.userId != null || peer.user_id != null) {
      return `u${String(peer.userId ?? peer.user_id ?? peer.value ?? "")}`;
    }
    if (peer instanceof Api.PeerChat || peer.chatId != null || peer.chat_id != null) {
      return `c${String(peer.chatId ?? peer.chat_id ?? peer.value ?? "")}`;
    }
    if (peer instanceof Api.PeerChannel || peer.channelId != null || peer.channel_id != null) {
      return `ch${String(peer.channelId ?? peer.channel_id ?? peer.value ?? "")}`;
    }
    if (peer?.value != null) return `v${String(peer.value)}`;
  } catch {}
  return `p${String(peer).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "0"}`;
}


function actionFromId(action) {
  // For gifts actions Telegram puts sender in action.fromId (Peer)
  return peerUserId(action?.fromId) || null;
}

async function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return String(ans || "").trim();
}

async function makeClient(sessionString) {
  if (!API_ID || !API_HASH) die("[Relayer] RELAYER_API_ID / RELAYER_API_HASH are required");
  const session = new StringSession(sessionString || "");
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });
  return client;
}

async function login() {
  const client = await makeClient("");

  await client.start({
    phoneNumber: async () => await promptLine("Phone number (+7...): "),
    password: async () => await promptLine("2FA password (if enabled, else empty): "),
    phoneCode: async () => await promptLine("Code from Telegram: "),
    onError: (err) => console.error("[Relayer] login error:", err),
  });

  const session = client.session.save();
  console.log("\n✅ Logged in.\n");
  console.log("RELAYER_SESSION=");
  console.log(session);
  console.log("\n(Сохрани это в .env и запускай: node relayer.js run)\n");

  await client.disconnect();
}

async function postJson(url, body, headers = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, json, text };
}

async function addToInventory({ userId, item, claimId }) {
  const url = `${SERVER}/api/inventory/nft/add`;
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  return await postJson(url, {
    userId: String(userId),
    items: [item],
    claimId: String(claimId),
  }, headers);
}



async function addToMarket({ item }) {
  const url = `${SERVER}/api/market/items/add`;
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  return await postJson(url, { item }, headers);
}

async function run({ mode = "run" } = {}) {
  if (!SESSION_STR) die("[Relayer] RELAYER_SESSION is empty. Run: node relayer.js login");
  if (!INLINE_IMAGES) ensureDir(IMG_DIR);

  const client = await makeClient(SESSION_STR);
  await client.connect();

  console.log("[Relayer] ✅ Connected. Listening gifts...");
  console.log("[Relayer] SERVER:", SERVER);
  console.log("[Relayer] IMG_DIR:", IMG_DIR);
  console.log("[Relayer] ADMIN_IDS:", ADMIN_IDS.join(", ") || "(empty)");


  const processed = new Set();

  async function handleGiftMessage(msg, origin = "RAW", { notify = true } = {}) {
    if (!msg || msg.id == null) return;
    const peerK = peerKey(msg.peerId);
    const msgId = String(msg.id);
    const eventKey = `tg_${peerK}_${msgId}`;
    const key = `${peerK}:${msgId}`;
    if (processed.has(key)) return;
    processed.add(key);

    const action = msg.action || null;
    if (!action) return;

    const isStarGift =
      (action instanceof Api.MessageActionStarGift) ||
      (action instanceof Api.MessageActionStarGiftUnique);

    const isOtherGift =
      (action instanceof Api.MessageActionGiftPremium) ||
      (action instanceof Api.MessageActionGiftStars);

    if (!isStarGift && !isOtherGift) return;

    const fromId = actionFromId(action) || peerUserId(msg.fromId) || peerUserId(msg.peerId);
    if (!fromId) {
      console.log(`[Relayer] ⚠️ gift without fromId (skipped). msgId=${msg.id} origin=${origin}`);
      return;
    }

    const gift = action.gift || null;
    const title = String(gift?.title || gift?.name || "Gift");
    const slug = String(gift?.slug || "").trim();
    const num = gift?.num ?? gift?.number ?? null;
    const giftId = gift?.id ?? gift?.giftId ?? null;


const fragmentPreviewUrl = fragmentMediumPreviewUrlFromSlug(slug);
const preferFragmentPreview = Boolean(fragmentPreviewUrl);

    const assets = extractGiftAssets(gift);
    const modelDoc = assets.modelDoc;
    const patternDoc = assets.patternDoc;

    let modelDataUrl = "";
    let patternDataUrl = "";

    if (!preferFragmentPreview && INLINE_IMAGES) {
      modelDataUrl = await downloadDocAsDataUrl(client, modelDoc);
      if (patternDoc) patternDataUrl = await downloadDocAsDataUrl(client, patternDoc, { forceThumb: true });
    }

    // Model image: inline (preferred) OR saved to disk (DEV ONLY)
    let imageUrl = preferFragmentPreview ? '' : modelDataUrl;

    if (!preferFragmentPreview && !imageUrl && modelDoc) {
      // download to local /public... (DEV ONLY)
      try {
        const mime = String(modelDoc.mimeType || "");
        const base = safeFileBase(slug || title);
        const suffix = `${String(num ?? "") || "x"}_${String(msg.id)}_${crypto.randomBytes(3).toString("hex")}`;

        let ext = ".webp";
        let dlOpts = { outputFile: "" };

        // animated sticker/video -> download thumbnail as jpg
        if (mime.includes("tgsticker") || mime.includes("application/x-tgsticker") || mime.includes("video") || mime.includes("webm")) {
          ext = ".jpg";
          dlOpts = { outputFile: "", thumb: 0 };
        } else if (mime.includes("png")) ext = ".png";
        else if (mime.includes("jpeg") || mime.includes("jpg")) ext = ".jpg";
        else if (mime.includes("webp")) ext = ".webp";

        const fileName = `${base}_${suffix}${ext}`;
        const outPath = path.join(IMG_DIR, fileName);
        dlOpts.outputFile = outPath;

        // first try (thumb if configured), then fallback full
        let ok = false;
        try {
          await client.downloadMedia(modelDoc, dlOpts);
          ok = fs.existsSync(outPath);
        } catch {}
        if (!ok) {
          await client.downloadMedia(modelDoc, { outputFile: outPath });
          ok = fs.existsSync(outPath);
        }

        if (ok) imageUrl = `/images/gifts/marketnfts/${fileName}`;
      } catch (e) {
        console.log("[Relayer] download error:", e?.message || e);
      }
    }

    const numberText = num != null ? formatNum(num) : "";

    const tgPayload = {
      kind: isStarGift ? "star_gift" : "gift",
      giftId: giftId != null ? String(giftId) : null,
      slug: slug || null,
      num: num != null ? Number(num) : null,

      // Collectible parts
      collectible: !!assets.backdrop,
      model: {
        name: assets.modelName || null,
        image: modelDataUrl || imageUrl || ""
      },
      pattern: patternDoc ? {
        name: assets.patternName || null,
        image: patternDataUrl || ""
      } : null,
      backdrop: assets.backdrop || null,
      peerKey: peerK,
      messageId: msgId,
      eventKey
    };

    const instanceId = `tg_gift_${eventKey}`;

    const inventoryItem = {
      type: "nft",
      id: `nft_${slug || giftId || "gift"}_${peerK}_${msgId}`,
      name: title,
      displayName: title,
      icon: fragmentPreviewUrl || (modelDataUrl || imageUrl) || "/images/gifts/stars.webp",
      instanceId,
      acquiredAt: Date.now(),
      price: { ton: null, stars: null },
      tg: tgPayload
    };

    const marketItem = {
      id: `m_${slug || giftId || "gift"}_${String(num ?? "n")}_${peerK}_${msgId}`,
      sourceKey: eventKey,
      name: title,
      number: numberText,
      image: (preferFragmentPreview ? "" : (imageUrl || "")),
      previewUrl: fragmentPreviewUrl || "",
      priceTon: null,
      createdAt: Date.now(),
      tg: tgPayload
    };

    const claimId = `claim_${eventKey}`;


    try {
      let r;
      if (isAdmin(fromId)) {
        r = await addToMarket({ item: marketItem });
        if (!r.ok) {
          console.log("[Relayer] ❌ market add failed:", r.status, r.text);
          return;
        }
        console.log(`[Relayer] ✅ Market +1: ${title} #${numberText || "—"} (from ${fromId})`);
        if (notify) {
          await client.sendMessage(fromId, { message: `✅ Added to Market: ${title}${numberText ? ` #${numberText}` : ""}` });
        }
      } else {
        r = await addToInventory({ userId: fromId, item: inventoryItem, claimId });
        if (!r.ok) {
          console.log("[Relayer] ❌ inventory add failed:", r.status, r.text);
          return;
        }
        console.log(`[Relayer] ✅ Inventory +1: ${title} (to ${fromId})`);
        if (notify) {
          await client.sendMessage(fromId, { message: `✅ Gift added to your inventory: ${title}${numberText ? ` #${numberText}` : ""}` });
        }
      }
    } catch (e) {
      console.log("[Relayer] ❌ handler error:", e?.message || e);
    }
  }

    // One-shot sync: scan recent dialogs/messages and (re)push gift actions to the server.
  // Useful to восстановить маркет после бага — без новых переводов (всё идемпотентно по id/claimId).
  if (mode === "sync") {
    const dialogsLimit = Math.max(1, Math.min(200, Number(process.env.RELAYER_SYNC_DIALOGS) || 60));
    const perDialogLimit = Math.max(1, Math.min(200, Number(process.env.RELAYER_SYNC_LIMIT) || 50));

    console.log(`[Relayer][SYNC] 🔎 Scanning dialogs=${dialogsLimit}, perDialogMessages=${perDialogLimit}...`);
    let scanned = 0;
    let gifts = 0;

    let dialogs = [];
    try {
      dialogs = await client.getDialogs({ limit: dialogsLimit });
    } catch (e) {
      console.log("[Relayer][SYNC] ❌ getDialogs failed:", e?.message || e);
      dialogs = [];
    }

    for (const d of dialogs) {
      const entity = d?.entity || d;
      let msgs = [];
      try {
        msgs = await client.getMessages(entity, { limit: perDialogLimit });
      } catch {
        continue;
      }
      if (!Array.isArray(msgs) || !msgs.length) continue;

      scanned += msgs.length;

      // process from старых к новым, чтобы лог был понятнее
      for (const m of msgs.slice().reverse()) {
        if (m?.action) {
          gifts++;
          await handleGiftMessage(m, "SYNC", { notify: false });
        }
      }
    }

    console.log(`[Relayer][SYNC] ✅ Done. scanned=${scanned}, gifts=${gifts}`);
    try { await client.disconnect(); } catch {}
    return;
  }

// 1) RAW updates (гifts часто приходят именно так)
  client.addEventHandler(async (update) => {
    if (!update) return;

    const isNew =
      (update instanceof Api.UpdateNewMessage) ||
      (update instanceof Api.UpdateNewChannelMessage);

    if (!isNew) return;

    const msg = update.message;
    if (!msg) return;

    if (DEBUG) {
      const from = peerUserId(msg.fromId) || peerUserId(msg.peerId) || "—";
      const a = msg.action ? (msg.action.className || msg.action.constructor?.name) : null;
      const text = String(msg.message || "").slice(0, 120);
      console.log(`[Relayer][RAW] id=${msg.id} from=${from} action=${a} text="${text}"`);
    }

    if (msg.action) await handleGiftMessage(msg, "RAW");
  });

  // 2) NewMessage (для логов + fallback)
  client.addEventHandler(async (event) => {
    const msg = event?.message;
    if (!msg) return;

    if (DEBUG) {
      const from = peerUserId(msg.fromId) || peerUserId(msg.peerId) || "—";
      const a = msg.action ? (msg.action.className || msg.action.constructor?.name) : null;
      const text = String(msg.message || "").slice(0, 120);
      console.log(`[Relayer][MSG] id=${msg.id} from=${from} action=${a} text="${text}"`);
    }

    if (msg.action) await handleGiftMessage(msg, "NewMessage");
  }, new NewMessage({ incoming: true }));

  process.on("SIGINT", async () => {
    console.log("\n[Relayer] SIGINT -> disconnect");
    try { await client.disconnect(); } catch {}
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    console.log("\n[Relayer] SIGTERM -> disconnect");
    try { await client.disconnect(); } catch {}
    process.exit(0);
  });

  // keep process alive
  await new Promise(() => {});
}

if (CMD === "login") {
  login().catch((e) => die(e?.stack || e?.message || String(e)));
} else if (CMD === "sync") {
  run({ mode: "sync" }).catch((e) => die(e?.stack || e?.message || String(e)));
} else {
  run().catch((e) => die(e?.stack || e?.message || String(e)));
}
