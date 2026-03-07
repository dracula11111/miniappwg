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
import express from "express";

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";

const CMD = (process.argv[2] || "run").toLowerCase();

const API_ID = Number(process.env.RELAYER_API_ID || process.env.TG_API_ID || 0);
const API_HASH = String(process.env.RELAYER_API_HASH || process.env.TG_API_HASH || "");
const SESSION_STR = String(process.env.RELAYER_SESSION || "");
const SERVER = String(process.env.RELAYER_SERVER || "http://localhost:3000").replace(/\/+$/, "");
const SECRET = String(process.env.RELAYER_SECRET || process.env.MARKET_SECRET || "");
const ADMIN_IDS = String(
  process.env.RELAYER_ADMIN_IDS ||
  process.env.RELAYER_ADMIN_ID ||
  process.env.MARKET_ADMIN_IDS ||
  process.env.MARKET_ADMIN_ID ||
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function normalizeTelegramId(value) {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "bigint") return String(value);

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return "";
    if (/^-?\d+$/.test(s)) return s;
    const m = s.match(/-?\d+/);
    return m ? m[0] : "";
  }

  try {
    const direct =
      value?.userId ??
      value?.user_id ??
      value?.channelId ??
      value?.channel_id ??
      value?.chatId ??
      value?.chat_id ??
      value?.peer?.userId ??
      value?.peer?.user_id ??
      value?.peer?.channelId ??
      value?.peer?.channel_id ??
      value?.peer?.chatId ??
      value?.peer?.chat_id ??
      value?.value;

    if (direct != null) {
      const normalized = normalizeTelegramId(direct);
      if (normalized) return normalized;
    }
  } catch {}

  try {
    const s = String(value).trim();
    if (!s) return "";
    const m = s.match(/-?\d+/);
    return m ? m[0] : "";
  } catch {
    return "";
  }
}

const ADMIN_ID_SET = new Set(ADMIN_IDS.map(normalizeTelegramId).filter(Boolean));

const DEBUG = /^(1|true|yes)$/i.test(String(process.env.RELAYER_DEBUG || ""));
// По умолчанию 1: отправляем картинку/паттерн прямо в JSON (data:image/...)
// Если поставить 0 — релайер будет сохранять файлы локально (подходит только когда релайер и сервер на одной машине)
const INLINE_IMAGES = !/^(0|false|no)$/i.test(String(process.env.RELAYER_INLINE_IMAGES || "1"));


const ENABLE_PRICES = !/^(0|false|no)$/i.test(String(process.env.RELAYER_ENABLE_PRICES || process.env.RELAYER_PRICES || "1"));
// How often to refresh/push Telegram-based fallback prices to the server
const PRICES_INTERVAL_MS = Math.max(60_000, Math.min(60 * 60 * 1000, Number(process.env.RELAYER_PRICES_INTERVAL_MS || 10 * 60 * 1000) || (10 * 60 * 1000)));
// When calling payments.getResaleStarGifts, how many listings to request (we only need floor -> 1 is enough).
const PRICES_RESALE_LIMIT = Math.max(1, Math.min(10, Number(process.env.RELAYER_PRICES_RESALE_LIMIT || 1) || 1));
// On startup, backfill recent dialogs so missed gifts while relayer was offline are recovered.
const BACKFILL_ON_START = !/^(0|false|no)$/i.test(String(process.env.RELAYER_BACKFILL_ON_START || "1"));
const BACKFILL_DIALOGS = Math.max(1, Math.min(200, Number(process.env.RELAYER_BACKFILL_DIALOGS || process.env.RELAYER_SYNC_DIALOGS || 60) || 60));
const BACKFILL_LIMIT = Math.max(1, Math.min(200, Number(process.env.RELAYER_BACKFILL_LIMIT || process.env.RELAYER_SYNC_LIMIT || 50) || 50));
// Some accounts receive gifts only in Saved Gifts updates (without normal message events).
const SAVED_GIFTS_WATCH = !/^(0|false|no)$/i.test(String(process.env.RELAYER_SAVED_GIFTS_WATCH || "1"));
const SAVED_GIFTS_POLL_MS = Math.max(5_000, Math.min(10 * 60 * 1000, Number(process.env.RELAYER_SAVED_GIFTS_POLL_MS || 30_000) || 30_000));
const SAVED_GIFTS_PAGE_LIMIT = Math.max(1, Math.min(200, Number(process.env.RELAYER_SAVED_GIFTS_PAGE_LIMIT || 100) || 100));
const SAVED_GIFTS_MAX_PAGES = Math.max(1, Math.min(20, Number(process.env.RELAYER_SAVED_GIFTS_MAX_PAGES || 5) || 5));

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function toJsNumber(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  try {
    // GramJS may use bigint-like objects with toString()
    const s = typeof v === "object" && v && typeof v.toString === "function" ? v.toString() : String(v);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}


function normTitleKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}



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
  const normalized = normalizeTelegramId(userId);
  return !!normalized && ADMIN_ID_SET.has(normalized);
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
  if (peer == null) return null;
  // GramJS peers can be PeerUser / PeerChannel / PeerChat
  const direct =
    peer.userId ??
    peer.user_id ??
    peer?.user?.id ??
    peer?.peer?.userId ??
    peer?.peer?.user_id;
  if (direct != null) {
    const normalized = normalizeTelegramId(direct);
    if (normalized) return normalized;
  }

  // Some GramJS wrappers expose only "value" on user-like peers.
  const className = String(peer?.className || peer?.constructor?.name || "");
  if (peer instanceof Api.PeerUser && peer?.value != null) {
    const normalized = normalizeTelegramId(peer.value);
    if (normalized) return normalized;
  }
  if (peer?.value != null && /^(PeerUser|InputPeerUser|InputUser)$/.test(className)) {
    const normalized = normalizeTelegramId(peer.value);
    if (normalized) return normalized;
  }

  const fallback = normalizeTelegramId(peer);
  return fallback || null;
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
  return peerUserId(action?.fromId || action?.from_id) || null;
}

function resolveMessageFromId(msg, action = null) {
  return (
    actionFromId(action || msg?.action) ||
    peerUserId(msg?.fromId) ||
    peerUserId(msg?.from_id) ||
    peerUserId(msg?.senderId) ||
    peerUserId(msg?.sender_id) ||
    peerUserId(msg?.peerId) ||
    peerUserId(msg?.peer_id) ||
    null
  );
}

function normalizeUsername(v) {
  const s = String(v || "").trim().replace(/^@+/, "");
  return s || "";
}

function usernameFromEntity(entity) {
  if (!entity || typeof entity !== "object") return "";
  const direct = normalizeUsername(entity?.username || entity?.userName || entity?.user_name);
  if (direct) return direct;

  const list = Array.isArray(entity?.usernames) ? entity.usernames : [];
  for (const it of list) {
    const uname = normalizeUsername(it?.username || it?.userName || it?.user_name);
    if (!uname) continue;
    if (it?.active === false || it?.editable === false) continue;
    return uname;
  }
  for (const it of list) {
    const uname = normalizeUsername(it?.username || it?.userName || it?.user_name);
    if (uname) return uname;
  }
  return "";
}

function senderLabelFromEntity(entity, fallbackId = "") {
  const uname = usernameFromEntity(entity);
  if (uname) return `@${uname}`;

  const first = String(entity?.firstName || entity?.first_name || "").trim();
  const last = String(entity?.lastName || entity?.last_name || "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;

  const title = String(entity?.title || "").trim();
  if (title) return title;

  return fallbackId ? `id:${fallbackId}` : "unknown";
}

function oneLineText(raw, max = 220) {
  const t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "<non-text>";
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

const senderMetaCache = new Map();

async function resolveSenderMeta(client, msg) {
  const fromId = resolveMessageFromId(msg) || "";
  const cacheKey = fromId || peerKey(msg?.fromId || msg?.from_id || msg?.peerId || msg?.peer_id || null);
  if (cacheKey && senderMetaCache.has(cacheKey)) return senderMetaCache.get(cacheKey);

  let entity = null;
  const source = msg?.fromId || msg?.from_id || msg?.peerId || msg?.peer_id || (fromId ? Number(fromId) : null);
  if (source != null) {
    try { entity = await client.getEntity(source); } catch {}
  }

  const username = usernameFromEntity(entity);
  const label = senderLabelFromEntity(entity, fromId);
  const meta = { id: fromId, username, label };

  if (cacheKey) senderMetaCache.set(cacheKey, meta);
  return meta;
}

function actionClassName(action) {
  return String(action?.className || action?.constructor?.name || "");
}

function extractGiftFromAction(action) {
  if (!action || typeof action !== "object") return null;
  return (
    action?.gift ||
    action?.starGift ||
    action?.star_gift ||
    action?.uniqueGift ||
    action?.savedGift ||
    action?.giftInfo ||
    null
  );
}

function isGiftLikeAction(action) {
  if (!action || typeof action !== "object") return false;
  if (
    action instanceof Api.MessageActionStarGift ||
    action instanceof Api.MessageActionStarGiftUnique ||
    action instanceof Api.MessageActionGiftPremium ||
    action instanceof Api.MessageActionGiftStars
  ) return true;

  if (extractGiftFromAction(action)) return true;
  const cls = actionClassName(action).toLowerCase();
  return cls.includes("gift");
}

function shortErrorText(raw, max = 160) {
  const t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "request failed";
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function giftClassName(gift) {
  return String(gift?.className || gift?.constructor?.name || "");
}

function isNftGift(gift, action = null) {
  if (!gift || typeof gift !== "object") return false;
  if (gift instanceof Api.StarGiftUnique) return true;

  const gCls = giftClassName(gift).toLowerCase();
  if (gCls.includes("unique")) return true;
  if (Array.isArray(gift?.attributes) && gift.attributes.length > 0) return true;
  if (gift?.slug && gift?.num != null) return true;

  const aCls = actionClassName(action).toLowerCase();
  if (aCls.includes("stargiftunique")) return true;
  return false;
}

function isPlainGiftAction(action) {
  if (!action || typeof action !== "object") return false;
  if (action instanceof Api.MessageActionGiftPremium || action instanceof Api.MessageActionGiftStars) return true;
  const cls = actionClassName(action).toLowerCase();
  return cls.includes("giftpremium") || cls.includes("giftstars");
}

function rejectPlainGiftText() {
  return "❌ Принимаются только NFT подарки (Unique). Обычные подарки не принимаются.";
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


async function getJson(url, headers = {}) {
  const r = await fetch(url, {
    method: "GET",
    headers: { ...headers },
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, json, text };
}

async function pushRelayerPrices(items) {
  const url = `${SERVER}/api/gifts/prices/push`;
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  return await postJson(url, { items }, headers);
}

function parseStarsAmount(a) {
  if (!a) return null;
  // GramJS TL objects usually have .className
  const cls = String(a.className || a.constructor?.name || "").toLowerCase();

  // starsAmount#bbb6b4a3 amount:long nanos:int
  if (typeof a.nanos !== "undefined") {
    const amount = toJsNumber(a.amount);
    const nanos = toJsNumber(a.nanos);
    if (!Number.isFinite(amount)) return null;
    const v = amount + (Number.isFinite(nanos) ? nanos / 1e9 : 0);
    return { type: "stars", value: v };
  }

  // starsTonAmount#74aee3e0 amount:long (nanotons)
  if (cls.includes("ton")) {
    const amount = toJsNumber(a.amount);
    if (!Number.isFinite(amount)) return null;
    return { type: "ton", value: amount / 1e9 };
  }

  // fallback: if no nanos and constructor name doesn't say ton, treat as ton (safer for relayer fallback)
  const amount = toJsNumber(a.amount);
  if (Number.isFinite(amount)) return { type: "ton", value: amount / 1e9 };
  return null;
}

async function refreshAndPushPrices(client) {
  if (!ENABLE_PRICES) return;

  // 1) Fetch tracked catalog from server
  const cat = await getJson(`${SERVER}/api/gifts/catalog`);
  const tracked = Array.isArray(cat?.json?.items) ? cat.json.items : [];
  if (!tracked.length) {
    console.log("[Relayer][Prices] ⚠️ No catalog items from server (skip).");
    return;
  }

  // 2) Fetch base gifts list from Telegram
  // payments.getStarGifts#c4923f5b hash:long = payments.StarGifts;
  let starGiftsRes;
  try {
    starGiftsRes = await client.invoke(new Api.payments.GetStarGifts({ hash: 0 }));
  } catch (e) {
    console.log("[Relayer][Prices] ❌ payments.getStarGifts failed:", e?.message || e);
    return;
  }

  const baseGifts = Array.isArray(starGiftsRes?.gifts) ? starGiftsRes.gifts : [];
  if (!baseGifts.length) {
    console.log("[Relayer][Prices] ⚠️ No gifts returned by Telegram (skip).");
    return;
  }

  const byTitle = new Map();
  for (const g of baseGifts) {
    const title = String(g?.title || g?.name || "").trim();
    if (!title) continue;
    byTitle.set(title.toLowerCase(), g);
    byTitle.set(normTitleKey(title), g);
  }

  const now = Date.now();
  const out = [];

  for (const name of tracked) {
    const keyRaw = String(name || "").trim();
    const key = keyRaw.toLowerCase();
    const keyNorm = normTitleKey(keyRaw);
    if (!key) continue;

    const g = byTitle.get(key) || byTitle.get(keyNorm);
    if (!g) continue;

    let priceTon = null;
    let priceStars = null;

    // If the base gift object already contains resell_min_stars, it's the floor in Stars.
    const resellMinStars = toJsNumber(g?.resellMinStars ?? g?.resell_min_stars ?? null);
    if (Number.isFinite(resellMinStars) && resellMinStars > 0) {
      priceStars = resellMinStars;
    }

    // Otherwise try payments.getResaleStarGifts (sort_by_price asc, limit=1)
    if (!priceStars) {
      const giftId = g?.id ?? g?.giftId ?? g?.gift_id ?? null;
      if (giftId != null) {
        try {
          const resale = await client.invoke(new Api.payments.GetResaleStarGifts({
            giftId,
            offset: "",
            limit: PRICES_RESALE_LIMIT,
            sortByPrice: true,
          }));
          const gifts = Array.isArray(resale?.gifts) ? resale.gifts : [];
          if (gifts.length) {
            const first = gifts[0];
            const arr = Array.isArray(first?.resellAmount) ? first.resellAmount
                      : Array.isArray(first?.resell_amount) ? first.resell_amount
                      : [];
            let minTon = null;
            let minStars = null;
            for (const a of arr) {
              const parsed = parseStarsAmount(a);
              if (!parsed) continue;
              if (parsed.type === "ton") {
                minTon = (minTon == null) ? parsed.value : Math.min(minTon, parsed.value);
              } else if (parsed.type === "stars") {
                minStars = (minStars == null) ? parsed.value : Math.min(minStars, parsed.value);
              }
            }
            if (Number.isFinite(minTon) && minTon > 0) priceTon = minTon;
            else if (Number.isFinite(minStars) && minStars > 0) priceStars = minStars;
          }
        } catch (e) {
          // STARGIFT_INVALID is possible for unknown ids; ignore.
          if (DEBUG) console.log("[Relayer][Prices] getResaleStarGifts failed for", name, "-", e?.message || e);
        }

        // jitter so we don't look like a bot
        await sleep(120 + Math.floor(Math.random() * 180));
      }
    }

    if ((Number.isFinite(priceTon) && priceTon > 0) || (Number.isFinite(priceStars) && priceStars > 0)) {
      out.push({
        name,
        priceTon: Number.isFinite(priceTon) && priceTon > 0 ? priceTon : null,
        priceStars: Number.isFinite(priceStars) && priceStars > 0 ? priceStars : null,
        updatedAt: now,
        source: "relayer.telegram"
      });
    }
  }

  if (!out.length) {
    console.log("[Relayer][Prices] ⚠️ No prices resolved (skip push).");
    return;
  }

  const r = await pushRelayerPrices(out);
  if (!r.ok) {
    console.log("[Relayer][Prices] ❌ push failed:", r.status, r.text);
    return;
  }

  console.log(`[Relayer][Prices] ✅ pushed=${out.length} accepted=${r.json?.accepted ?? "?"}`);
}

function startPricesLoop(client) {
  if (!ENABLE_PRICES) return { started: false, stop: () => {} };

  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await refreshAndPushPrices(client);
    } catch (e) {
      console.log("[Relayer][Prices] ❌ loop error:", e?.message || e);
    } finally {
      if (!stopped) timer = setTimeout(tick, PRICES_INTERVAL_MS);
    }
  };

  // small delay to let the relayer settle (connect + handlers)
  timer = setTimeout(tick, 5000);
  console.log(`[Relayer][Prices] 🔁 enabled (interval=${Math.round(PRICES_INTERVAL_MS / 1000)}s)`);

  return {
    started: true,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
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

  // RPC server: allows backend to request withdrawals (transfer gifts)
  if (mode !== "sync") startRpcServer(client);

  console.log("[Relayer] ✅ Connected. Listening gifts...");
  console.log("[Relayer] SERVER:", SERVER);
  console.log("[Relayer] IMG_DIR:", IMG_DIR);
  console.log("[Relayer] ADMIN_IDS:", ADMIN_IDS.join(", ") || "(empty)");
  console.log("[Relayer] ADMIN_IDS(normalized):", Array.from(ADMIN_ID_SET).join(", ") || "(empty)");
  if (!ADMIN_ID_SET.size) console.log("[Relayer] ⚠️ ADMIN_IDS is empty: all gifts will go to inventory.");
  if (!SECRET) console.log("[Relayer] ⚠️ RELAYER_SECRET is empty: server can reject /api/market and /api/inventory calls.");

  const pricesLoop = (mode === "sync") ? { stop: () => {} } : startPricesLoop(client);


  const processed = new Set();
  const processing = new Set();
  const seenSavedGiftKeys = new Set();

  async function handleGiftMessage(msg, origin = "RAW", { notify = true } = {}) {
    if (!msg || msg.id == null) return;
    const peerK = peerKey(msg.peerId);
    const msgId = String(msg.id);
    const eventKey = `tg_${peerK}_${msgId}`;
    const key = `${peerK}:${msgId}`;
    if (processed.has(key) || processing.has(key)) return;
    processing.add(key);

    try {
      const action = msg.action || null;
      if (!action) return;

      if (!isGiftLikeAction(action)) {
        if (DEBUG) {
          const actionCls = actionClassName(action) || "(unknown)";
          console.log(`[Relayer] skip non-gift action: ${actionCls} msgId=${msg.id} origin=${origin}`);
        }
        return;
      }

      const fromId = resolveMessageFromId(msg, action);
      if (!fromId) {
        console.log(`[Relayer] ⚠️ gift without fromId (skipped). msgId=${msg.id} origin=${origin}`);
        return;
      }
      const fromIsAdmin = isAdmin(fromId);
      if (DEBUG) {
        console.log(`[Relayer] gift sender resolved: fromId=${fromId} admin=${fromIsAdmin} origin=${origin} msgId=${msg.id}`);
      }

      if (isPlainGiftAction(action)) {
        console.log(`[Relayer] ⚠️ Plain gift rejected (non-NFT). from=${fromId} msgId=${msg.id} origin=${origin}`);
        if (notify) {
          try { await client.sendMessage(fromId, { message: rejectPlainGiftText() }); } catch {}
        }
        processed.add(key);
        return;
      }

      const gift = extractGiftFromAction(action);
      if (!gift || typeof gift !== "object") {
        const actionCls = actionClassName(action) || "(unknown)";
        if (DEBUG) {
          const keys = Object.keys(action || {}).slice(0, 20).join(", ");
          console.log(`[Relayer] gift-like action without payload: ${actionCls} msgId=${msg.id} keys=[${keys}]`);
        }
        return;
      }

      const actionCls = actionClassName(action).toLowerCase();
      const isStarGift = actionCls.includes("stargift") || actionCls.includes("star");
      if (!isNftGift(gift, action)) {
        console.log(`[Relayer] ⚠️ Star gift rejected (non-NFT). from=${fromId} msgId=${msg.id} origin=${origin}`);
        if (notify) {
          try { await client.sendMessage(fromId, { message: rejectPlainGiftText() }); } catch {}
        }
        processed.add(key);
        return;
      }
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


      let r;
      if (fromIsAdmin) {
        r = await addToMarket({ item: marketItem });
        if (!r.ok) {
          console.log("[Relayer] ❌ market add failed:", r.status, r.text);
          if (notify) {
            try {
              const reason = shortErrorText(r?.json?.error || r?.text || `HTTP ${r?.status || 0}`);
              await client.sendMessage(fromId, { message: `❌ Market add failed: ${reason}` });
            } catch {}
          }
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
          if (notify) {
            try {
              const reason = shortErrorText(r?.json?.error || r?.text || `HTTP ${r?.status || 0}`);
              await client.sendMessage(fromId, { message: `❌ Inventory add failed: ${reason}` });
            } catch {}
          }
          return;
        }
        console.log(`[Relayer] ✅ Inventory +1: ${title} (to ${fromId})`);
        if (notify) {
          await client.sendMessage(fromId, { message: `✅ Gift added to your inventory: ${title}${numberText ? ` #${numberText}` : ""}` });
        }
      }
      processed.add(key);
    } catch (e) {
      console.log("[Relayer] ❌ handler error:", e?.message || e);
    } finally {
      processing.delete(key);
    }
  }

  function savedGiftStableKey(savedGift, fallbackIndex = 0) {
    const msgId = Number(savedGift?.msgId ?? savedGift?.msg_id);
    if (Number.isFinite(msgId) && msgId > 0) return `msg:${msgId}`;

    const savedId = savedGift?.savedId ?? savedGift?.saved_id;
    if (savedId != null) return `saved:${String(savedId)}`;

    const giftId = String(savedGift?.gift?.id ?? savedGift?.gift?.giftId ?? "gift");
    const from = peerUserId(savedGift?.fromId || savedGift?.from_id) || "u0";
    const date = Number(savedGift?.date || 0);
    return `fallback:${giftId}:${from}:${date}:${fallbackIndex}`;
  }

  function savedGiftToSyntheticMessage(savedGift, fallbackIndex = 0) {
    const fromPeer = savedGift?.fromId || savedGift?.from_id || null;
    const rawMsgId = Number(savedGift?.msgId ?? savedGift?.msg_id);
    const savedId = savedGift?.savedId ?? savedGift?.saved_id;
    const msgId = (Number.isFinite(rawMsgId) && rawMsgId > 0)
      ? rawMsgId
      : (savedId != null ? `saved_${String(savedId)}` : `saved_fallback_${Date.now()}_${fallbackIndex}`);

    const gift = savedGift?.gift || null;
    const action = {
      className: isNftGift(gift) ? "MessageActionStarGiftUnique" : "MessageActionStarGift",
      gift,
      fromId: fromPeer,
      savedId: savedId != null ? savedId : null,
      saved: true,
      message: savedGift?.message || null
    };

    return {
      id: msgId,
      peerId: fromPeer || null,
      fromId: fromPeer || null,
      action
    };
  }

  async function processSavedGiftsSnapshot(origin = "SAVED", { notify = false } = {}) {
    if (!SAVED_GIFTS_WATCH) return { fetched: 0, handled: 0 };

    let fetched = 0;
    let handled = 0;
    let offset = "";

    for (let page = 0; page < SAVED_GIFTS_MAX_PAGES; page++) {
      let res = null;
      try {
        res = await client.invoke(new Api.payments.GetSavedStarGifts({
          peer: "me",
          offset,
          limit: SAVED_GIFTS_PAGE_LIMIT
        }));
      } catch (e) {
        console.log(`[Relayer][${origin}] ❌ getSavedStarGifts failed:`, e?.message || e);
        break;
      }

      const gifts = Array.isArray(res?.gifts) ? res.gifts : [];
      if (!gifts.length) break;

      for (let i = 0; i < gifts.length; i++) {
        const g = gifts[i];
        fetched++;

        const stableKey = savedGiftStableKey(g, fetched);
        if (seenSavedGiftKeys.has(stableKey)) continue;
        seenSavedGiftKeys.add(stableKey);

        const synthetic = savedGiftToSyntheticMessage(g, fetched);
        const before = processed.size;
        await handleGiftMessage(synthetic, origin, { notify });
        if (processed.size > before) handled++;
      }

      const nextOffset = String(res?.nextOffset ?? res?.next_offset ?? "").trim();
      if (!nextOffset || nextOffset === offset) break;
      offset = nextOffset;
    }

    if (DEBUG || handled > 0) {
      console.log(`[Relayer][${origin}] saved gifts fetched=${fetched} handled=${handled} seen=${seenSavedGiftKeys.size}`);
    }
    return { fetched, handled };
  }

  async function scanRecentDialogsForGiftActions({
    dialogsLimit = 60,
    perDialogLimit = 50,
    origin = "SYNC",
    notify = false
  } = {}) {
    const dl = Math.max(1, Math.min(200, Number(dialogsLimit) || 60));
    const ml = Math.max(1, Math.min(200, Number(perDialogLimit) || 50));
    console.log(`[Relayer][${origin}] 🔎 Scanning dialogs=${dl}, perDialogMessages=${ml}...`);

    let scanned = 0;
    let actions = 0;
    let handled = 0;

    let dialogs = [];
    try {
      dialogs = await client.getDialogs({ limit: dl });
    } catch (e) {
      console.log(`[Relayer][${origin}] ❌ getDialogs failed:`, e?.message || e);
      dialogs = [];
    }

    for (const d of dialogs) {
      const entity = d?.entity || d;
      let msgs = [];
      try {
        msgs = await client.getMessages(entity, { limit: ml });
      } catch {
        continue;
      }
      if (!Array.isArray(msgs) || !msgs.length) continue;

      scanned += msgs.length;
      for (const m of msgs.slice().reverse()) {
        if (!m?.action) continue;
        actions++;
        const before = processed.size;
        await handleGiftMessage(m, origin, { notify });
        if (processed.size > before) handled++;
      }
    }

    console.log(`[Relayer][${origin}] ✅ Done. scanned=${scanned}, actions=${actions}, handled=${handled}`);
    return { scanned, actions, handled };
  }

  // One-shot sync: scan recent dialogs/messages and (re)push gift actions to the server.
  // Useful to restore market state without requiring new transfers.
  if (mode === "sync") {
    const dialogsLimit = Math.max(1, Math.min(200, Number(process.env.RELAYER_SYNC_DIALOGS) || 60));
    const perDialogLimit = Math.max(1, Math.min(200, Number(process.env.RELAYER_SYNC_LIMIT) || 50));
    await scanRecentDialogsForGiftActions({ dialogsLimit, perDialogLimit, origin: "SYNC", notify: false });
    await processSavedGiftsSnapshot("SYNC_SAVED", { notify: false });
    try { await client.disconnect(); } catch {}
    return;
  }

  if (BACKFILL_ON_START) {
    try {
      await scanRecentDialogsForGiftActions({
        dialogsLimit: BACKFILL_DIALOGS,
        perDialogLimit: BACKFILL_LIMIT,
        origin: "BOOT",
        notify: false
      });
    } catch (e) {
      console.log("[Relayer][BOOT] ❌ backfill failed:", e?.message || e);
    }
  }

  if (SAVED_GIFTS_WATCH) {
    try {
      await processSavedGiftsSnapshot("SAVED_BOOT", { notify: false });
    } catch (e) {
      console.log("[Relayer][SAVED_BOOT] ❌ saved gifts bootstrap failed:", e?.message || e);
    }
  }

  let savedGiftsTimer = null;
  if (SAVED_GIFTS_WATCH) {
    console.log(`[Relayer][SAVED] 👀 watching saved gifts (poll=${Math.round(SAVED_GIFTS_POLL_MS / 1000)}s, pageLimit=${SAVED_GIFTS_PAGE_LIMIT}, pages=${SAVED_GIFTS_MAX_PAGES})`);
    savedGiftsTimer = setInterval(() => {
      processSavedGiftsSnapshot("SAVED_POLL", { notify: false }).catch((e) => {
        console.log("[Relayer][SAVED_POLL] ❌ poll error:", e?.message || e);
      });
    }, SAVED_GIFTS_POLL_MS);
  }

// 1) RAW updates (гifts часто приходят именно так)
  client.addEventHandler(async (update) => {
    if (!update) return;

    if (SAVED_GIFTS_WATCH && update instanceof Api.UpdateSavedGifs) {
      if (DEBUG) console.log("[Relayer][RAW] UpdateSavedGifs received");
      await processSavedGiftsSnapshot("SAVED_UPDATE", { notify: false });
      return;
    }

    const isNew =
      (update instanceof Api.UpdateNewMessage) ||
      (update instanceof Api.UpdateNewChannelMessage);

    if (!isNew) return;

    const msg = update.message;
    if (!msg) return;

    if (DEBUG) {
      const from = resolveMessageFromId(msg) || "—";
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

    if (!msg.action) {
      const meta = await resolveSenderMeta(client, msg);
      const text = oneLineText(msg?.message, 260);
      const unamePart = meta?.username ? ` username=@${meta.username}` : "";
      const idPart = meta?.id ? ` id=${meta.id}` : "";
      console.log(`[Relayer][USER_MSG] from="${meta?.label || "unknown"}"${unamePart}${idPart} msgId=${String(msg.id)} text="${text}"`);
      return;
    }

    if (DEBUG) {
      const from = resolveMessageFromId(msg) || "—";
      const a = msg.action ? (msg.action.className || msg.action.constructor?.name) : null;
      const text = String(msg.message || "").slice(0, 120);
      console.log(`[Relayer][MSG] id=${msg.id} from=${from} action=${a} text="${text}"`);
    }

    if (msg.action) await handleGiftMessage(msg, "NewMessage");
  }, new NewMessage({ incoming: true }));

  
process.on("SIGINT", async () => {
  console.log("[Relayer] SIGINT -> disconnect");
  try { pricesLoop?.stop?.(); } catch {}
  try { if (savedGiftsTimer) clearInterval(savedGiftsTimer); } catch {}
  try { await client.disconnect(); } catch {}
  process.exit(0);
});
  
process.on("SIGTERM", async () => {
  console.log("[Relayer] SIGTERM -> disconnect");
  try { pricesLoop?.stop?.(); } catch {}
  try { if (savedGiftsTimer) clearInterval(savedGiftsTimer); } catch {}
  try { await client.disconnect(); } catch {}
  process.exit(0);
});

  // keep process alive
  await new Promise(() => {});
}


// ================================
// RPC (server -> relayer): withdraw
// ================================

function explicitPortFromUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!u.port) return null;
    const n = Number(u.port);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

const RPC_PORT = (() => {
  const n = Number(
    process.env.RELAYER_RPC_PORT ||
    explicitPortFromUrl(process.env.RELAYER_RPC_URL) ||
    process.env.PORT ||
    3300
  );
  return Number.isFinite(n) && n > 0 ? n : 3300;
})();
const RPC_HOST = String(process.env.RELAYER_RPC_HOST || "127.0.0.1").trim() || "127.0.0.1";

function rpcAuthOk(req) {
  const secret = String(SECRET || "");
  if (!secret) return false;
  const h = String(req.headers?.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? String(m[1] || "").trim() : "";
  const alt = String(req.headers?.["x-relayer-secret"] || req.headers?.["x-relay-secret"] || "").trim();
  return token === secret || alt === secret;
}

function normalizeToFields(body) {
  const b = body && typeof body === "object" ? body : {};
  let toUsername = String(b.toUsername || b.username || (b.to && b.to.username) || "").trim();
  let toId = String(b.toId || b.userId || (b.to && b.to.id) || "").trim();

  let toUserId = String(b.toUserId || "").trim();
  if (toUserId) {
    if (toUserId.startsWith("@")) toUsername = toUserId.slice(1);
    else if (/^\d+$/.test(toUserId)) toId = toUserId;
    else toUsername = toUserId;
  }

  toUsername = toUsername.replace(/^@/, "").trim();

  const msgId = String(b.msgId || b.messageId || "").trim();

  return { toUsername, toId, msgId };
}

async function resolveInputPeer(client, { toUsername, toId }) {
  if (toUsername) {
    try {
      return await client.getInputEntity(toUsername);
    } catch (e) {
      try {
        const r = await client.invoke(new Api.contacts.ResolveUsername({ username: String(toUsername).replace(/^@/, "") }));
        const users = Array.isArray(r?.users) ? r.users : [];
        if (users.length) return await client.getInputEntity(users[0]);
      } catch {}
      throw e;
    }
  }
  if (toId) {
    // NOTE: may fail if relayer doesn't know access_hash for that user.
    // We still try because in most WebApp flows the relayer has interacted with the user.
    const n = Number(toId);
    if (!Number.isFinite(n) || n <= 0) throw new Error("TO_ID_INVALID");
    return await client.getInputEntity(n);
  }
  throw new Error("TO_ID_INVALID");
}

function mapTelegramError(e) {
  const code = String(e?.errorMessage || e?.message || "").toUpperCase();
  return code;
}

async function doTransferStarGift(client, { msgId, toPeer }) {
  const mid = Number(msgId);
  if (!Number.isFinite(mid) || mid <= 0) {
    return { ok: false, code: "MESSAGE_ID_INVALID", error: "msgId invalid" };
  }

  const stargift = new Api.InputSavedStarGiftUser({ msgId: mid });

  // 1) Try free transfer first
  try {
    await client.invoke(new Api.payments.TransferStarGift({ stargift, toId: toPeer }));
    return { ok: true, paid: false };
  } catch (e) {
    const err = mapTelegramError(e);

    // If transfer requires Stars payment, follow the official invoice + stars form flow.
    if (err.includes("PAYMENT_REQUIRED")) {
      try {
        const invoice = new Api.InputInvoiceStarGiftTransfer({ stargift, toId: toPeer });
        const form = await client.invoke(new Api.payments.GetPaymentForm({ invoice }));

        const formId = Number(form?.formId ?? form?.form_id);
        if (!Number.isFinite(formId) || formId <= 0) {
          return { ok: false, code: "RELAYER_FORM_INVALID", error: "payment form invalid" };
        }

        try {
          await client.invoke(new Api.payments.SendStarsForm({ formId, invoice }));
          return { ok: true, paid: true };
        } catch (e2) {
          const err2 = mapTelegramError(e2);
          if (err2.includes("BALANCE_TOO_LOW")) {
            return { ok: false, code: "RELAYER_STARS_LOW", error: "Relayer Stars balance too low" };
          }
          if (err2.includes("STARGIFT_NOT_FOUND") || err2.includes("MESSAGE_ID_INVALID") || err2.includes("SAVED_ID_EMPTY")) {
            return { ok: false, code: "NO_STOCK", error: "Gift not found" };
          }
          return { ok: false, code: "RELAYER_TRANSFER_FAILED", error: err2 || "transfer failed" };
        }
      } catch (e3) {
        const err3 = mapTelegramError(e3);
        if (err3.includes("BALANCE_TOO_LOW")) {
          return { ok: false, code: "RELAYER_STARS_LOW", error: "Relayer Stars balance too low" };
        }
        if (err3.includes("STARGIFT_NOT_FOUND") || err3.includes("MESSAGE_ID_INVALID") || err3.includes("SAVED_ID_EMPTY")) {
          return { ok: false, code: "NO_STOCK", error: "Gift not found" };
        }
        return { ok: false, code: "RELAYER_TRANSFER_FAILED", error: err3 || "transfer failed" };
      }
    }

    if (err.includes("BALANCE_TOO_LOW")) {
      return { ok: false, code: "RELAYER_STARS_LOW", error: "Relayer Stars balance too low" };
    }

    if (err.includes("STARGIFT_NOT_FOUND") || err.includes("MESSAGE_ID_INVALID") || err.includes("SAVED_ID_EMPTY")) {
      return { ok: false, code: "NO_STOCK", error: "Gift not found" };
    }

    if (err.includes("TO_ID_INVALID") || err.includes("USER_ID_INVALID")) {
      return { ok: false, code: "TO_ID_INVALID", error: "Receiver invalid" };
    }

    return { ok: false, code: "RELAYER_TRANSFER_FAILED", error: err || "transfer failed" };
  }
}

let rpcStarted = false;
function startRpcServer(client) {
  if (rpcStarted) return;
  rpcStarted = true;

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/rpc/health", (req, res) => res.json({ ok: true }));

  app.post("/rpc/transfer-stargift", async (req, res) => {
    try {
      if (!rpcAuthOk(req)) return res.status(403).json({ ok: false, code: "FORBIDDEN", error: "forbidden" });

      const { toUsername, toId, msgId } = normalizeToFields(req.body);
      if (!msgId) return res.status(400).json({ ok: false, code: "MESSAGE_ID_INVALID", error: "msgId required" });

      let toPeer;
      try {
        toPeer = await resolveInputPeer(client, { toUsername, toId });
      } catch (e) {
        return res.status(400).json({ ok: false, code: "TO_ID_INVALID", error: "Cannot resolve receiver" });
      }

      const result = await doTransferStarGift(client, { msgId, toPeer });

      if (!result.ok) {
        const code = result.code || "RELAYER_TRANSFER_FAILED";
        const status = (code === "RELAYER_STARS_LOW") ? 402 : 400;
        return res.status(status).json({ ok: false, code, error: result.error || code });
      }

      return res.json({ ok: true, paid: !!result.paid });
    } catch (e) {
      return res.status(500).json({ ok: false, code: "RELAYER_ERROR", error: e?.message || "error" });
    }
  });

  app.listen(RPC_PORT, RPC_HOST, () => {
    console.log(`[Relayer][RPC] ✅ listening on ${RPC_HOST}:${RPC_PORT}`);
    if (!SECRET) {
      console.warn('[Relayer][RPC] ⚠️ RELAYER_SECRET/MARKET_SECRET is empty. Server calls will be rejected.');
    }
  });
}

if (CMD === "login") {
  login().catch((e) => die(e?.stack || e?.message || String(e)));
} else if (CMD === "sync") {
  run({ mode: "sync" }).catch((e) => die(e?.stack || e?.message || String(e)));
} else {
  run().catch((e) => die(e?.stack || e?.message || String(e)));
}
