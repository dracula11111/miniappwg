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

const API_ID_SOURCE = process.env.RELAYER_API_ID_NF
  ? "RELAYER_API_ID_NF"
  : process.env.RELAYER_API_ID
    ? "RELAYER_API_ID"
    : process.env.TG_API_ID
      ? "TG_API_ID"
      : "(empty)";
const API_HASH_SOURCE = process.env.RELAYER_API_HASH_NF
  ? "RELAYER_API_HASH_NF"
  : process.env.RELAYER_API_HASH
    ? "RELAYER_API_HASH"
    : process.env.TG_API_HASH
      ? "TG_API_HASH"
      : "(empty)";
const SESSION_SOURCE = process.env.RELAYER_SESSION_NF
  ? "RELAYER_SESSION_NF"
  : process.env.RELAYER_SESSION
    ? "RELAYER_SESSION"
    : "(empty)";

const API_ID = Number(process.env.RELAYER_API_ID_NF || process.env.RELAYER_API_ID || process.env.TG_API_ID || 0);
const API_HASH = String(process.env.RELAYER_API_HASH_NF || process.env.RELAYER_API_HASH || process.env.TG_API_HASH || "");
const SESSION_STR = String(process.env.RELAYER_SESSION_NF || process.env.RELAYER_SESSION || "");
const SERVER = String(process.env.RELAYER_SERVER || "http://localhost:3000").replace(/\/+$/, "");
const DEFAULT_SERVER_PORT = Math.max(1, Math.min(65535, Number(process.env.PORT || process.env.SERVER_PORT || 7700) || 7700));
const SECRET = String(process.env.RELAYER_SECRET || process.env.MARKET_SECRET || "");
const SERVER_CANDIDATES = buildServerCandidates();
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

function normalizeBaseServerUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildServerCandidates() {
  const seen = new Set();
  const out = [];

  const push = (value) => {
    const url = normalizeBaseServerUrl(value);
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };

  push(SERVER);
  push(process.env.SERVER_URL);
  push(process.env.APP_SERVER_URL);
  push(process.env.WEB_SERVER_URL);
  push(`http://127.0.0.1:${DEFAULT_SERVER_PORT}`);
  push(`http://localhost:${DEFAULT_SERVER_PORT}`);

  return out.length ? out : [SERVER];
}

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

function sessionFingerprint(value) {
  const raw = String(value || "");
  if (!raw) return "empty";
  const hash = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 10);
  return `${hash}:${raw.length}`;
}

const DEBUG = /^(1|true|yes)$/i.test(String(process.env.RELAYER_DEBUG || ""));
// По умолчанию 1: отправляем картинку/паттерн прямо в JSON (data:image/...)
// Если поставить 0 — релайер будет сохранять файлы локально (подходит только когда релайер и сервер на одной машине)
const INLINE_IMAGES = !/^(0|false|no)$/i.test(String(process.env.RELAYER_INLINE_IMAGES || "1"));


const ENABLE_PRICES = !/^(0|false|no)$/i.test(String(process.env.RELAYER_ENABLE_PRICES || process.env.RELAYER_PRICES || "1"));
// How often to refresh/push Telegram-based fallback prices to the server
const PRICES_INTERVAL_MS = Math.max(60_000, Math.min(60 * 60 * 1000, Number(process.env.RELAYER_PRICES_INTERVAL_MS || 10 * 60 * 1000) || (10 * 60 * 1000)));
// When calling payments.getResaleStarGifts, how many listings to request (we only need floor -> 1 is enough).
const PRICES_RESALE_LIMIT = Math.max(1, Math.min(10, Number(process.env.RELAYER_PRICES_RESALE_LIMIT || 1) || 1));
// Historical BOOT backfill is disabled by default to avoid replaying old transfers on each restart.
const BACKFILL_ON_START = !/^(0|false|no)$/i.test(String(process.env.RELAYER_BACKFILL_ON_START || "0"));
const BACKFILL_DIALOGS = Math.max(1, Math.min(200, Number(process.env.RELAYER_BACKFILL_DIALOGS || process.env.RELAYER_SYNC_DIALOGS || 60) || 60));
const BACKFILL_LIMIT = Math.max(1, Math.min(200, Number(process.env.RELAYER_BACKFILL_LIMIT || process.env.RELAYER_SYNC_LIMIT || 50) || 50));
// Some accounts receive gifts only in Saved Gifts updates (without normal message events).
const SAVED_GIFTS_WATCH = !/^(0|false|no)$/i.test(String(process.env.RELAYER_SAVED_GIFTS_WATCH || "1"));
// On startup, only prime seen saved-gifts keys by default (no import/replay).
const SAVED_GIFTS_IMPORT_BOOT = /^(1|true|yes)$/i.test(String(process.env.RELAYER_SAVED_GIFTS_IMPORT_BOOT || "0"));
const SAVED_GIFTS_POLL_MS = Math.max(5_000, Math.min(10 * 60 * 1000, Number(process.env.RELAYER_SAVED_GIFTS_POLL_MS || 30_000) || 30_000));
const SAVED_GIFTS_ERROR_BACKOFF_MAX_MS = Math.max(
  SAVED_GIFTS_POLL_MS,
  Math.min(60 * 60 * 1000, Number(process.env.RELAYER_SAVED_GIFTS_ERROR_BACKOFF_MAX_MS || 15 * 60 * 1000) || 15 * 60 * 1000)
);
const SAVED_GIFTS_AUTH_DUP_PAUSE_MS = Math.max(
  60_000,
  Math.min(6 * 60 * 60 * 1000, Number(process.env.RELAYER_SAVED_GIFTS_AUTH_DUP_PAUSE_MS || 20 * 60 * 1000) || 20 * 60 * 1000)
);
const SAVED_GIFTS_PAGE_LIMIT = Math.max(1, Math.min(200, Number(process.env.RELAYER_SAVED_GIFTS_PAGE_LIMIT || 100) || 100));
const SAVED_GIFTS_MAX_PAGES = Math.max(1, Math.min(20, Number(process.env.RELAYER_SAVED_GIFTS_MAX_PAGES || 5) || 5));
// Manual import by link can scan deeper than background polling without increasing poll load.
const IMPORT_SAVED_GIFTS_PAGE_LIMIT = Math.max(1, Math.min(200, Number(process.env.RELAYER_IMPORT_SAVED_GIFTS_PAGE_LIMIT || 200) || 200));
const IMPORT_SAVED_GIFTS_MAX_PAGES = Math.max(1, Math.min(50, Number(process.env.RELAYER_IMPORT_SAVED_GIFTS_MAX_PAGES || 20) || 20));
const IMPORT_DIALOGS_LIMIT = Math.max(1, Math.min(200, Number(process.env.RELAYER_IMPORT_DIALOGS || 80) || 80));
const IMPORT_DIALOG_MESSAGES_LIMIT = Math.max(1, Math.min(200, Number(process.env.RELAYER_IMPORT_DIALOG_MESSAGES || 120) || 120));
// Optional one-shot cleanup flag for polluted market state.
const CLEAR_MARKET_ON_START = /^(1|true|yes)$/i.test(String(process.env.RELAYER_CLEAR_MARKET_ON_START || "0"));

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

function normalizeGiftSlugForCompare(slug) {
  return String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .trim();
}

function parseNftGiftSlugAndNum(raw) {
  const source = String(raw || "")
    .replace(/[#?].*$/, "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!source) return null;

  const match = source.match(/^([a-zA-Z0-9_-]+)-(\d+)$/);
  if (!match) return null;

  const slug = String(match[1] || "").trim();
  const num = Number(match[2]);
  if (!slug || !Number.isInteger(num) || num <= 0) return null;

  const slugNorm = normalizeGiftSlugForCompare(slug);
  if (!slugNorm) return null;

  return { slug, slugNorm, num };
}

function parseNftGiftLink(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const direct = parseNftGiftSlugAndNum(raw);
  if (direct) return direct;

  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const host = String(u.hostname || "").toLowerCase();
    if (host !== "t.me") return null;
    const parts = String(u.pathname || "").split("/").filter(Boolean);
    if (parts.length < 2 || String(parts[0]).toLowerCase() !== "nft") return null;
    return parseNftGiftSlugAndNum(parts[1]);
  } catch {
    return null;
  }
}

function firstNftGiftLinkFromText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const regex = /(?:https?:\/\/)?t\.me\/nft\/[a-zA-Z0-9_-]+-\d+(?:[?#][^\s]*)?/gi;
  const matches = text.match(regex) || [];
  for (const candidateRaw of matches) {
    const candidate = String(candidateRaw || "").trim().replace(/[),.;!?]+$/g, "");
    if (!candidate) continue;
    const parsed = parseNftGiftLink(candidate);
    if (parsed) return { raw: candidate, parsed };
  }
  return null;
}

function canonicalNftGiftLink(parsed) {
  if (!parsed || !parsed.slug || !parsed.num) return "";
  return `https://t.me/nft/${parsed.slug}-${parsed.num}`;
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
  let modelRarityPermille = null;

  let patternDoc = null;
  let patternName = null;
  let patternRarityPermille = null;

  let backdrop = null;
  let backdropRarityPermille = null;

  for (const a of attrs) {
    if (a instanceof Api.StarGiftAttributeModel) {
      if (a.document) modelDoc = a.document;
      modelName = a.name || modelName;
      const rarity = Number(a.rarityPermille);
      if (Number.isFinite(rarity) && rarity >= 0) modelRarityPermille = rarity;
    }
    if (a instanceof Api.StarGiftAttributePattern) {
      if (a.document) patternDoc = a.document;
      patternName = a.name || patternName;
      const rarity = Number(a.rarityPermille);
      if (Number.isFinite(rarity) && rarity >= 0) patternRarityPermille = rarity;
    }
    if (a instanceof Api.StarGiftAttributeBackdrop) {
      const rarity = Number(a.rarityPermille);
      if (Number.isFinite(rarity) && rarity >= 0) backdropRarityPermille = rarity;
      backdrop = {
        name: a.name || null,
        center: rgb24ToHex(a.centerColor),
        edge: rgb24ToHex(a.edgeColor),
        patternColor: rgb24ToHex(a.patternColor),
        textColor: rgb24ToHex(a.textColor),
        rarityPermille: Number.isFinite(backdropRarityPermille) ? backdropRarityPermille : null,
      };
    }
  }

  const fallbackDoc = pickDocFromStarGift(gift);

  return {
    modelDoc: modelDoc || fallbackDoc || null,
    modelName: modelName || null,
    modelRarityPermille: Number.isFinite(modelRarityPermille) ? modelRarityPermille : null,
    patternDoc: patternDoc || null,
    patternName: patternName || null,
    patternRarityPermille: Number.isFinite(patternRarityPermille) ? patternRarityPermille : null,
    backdrop: backdrop || null,
    backdropRarityPermille: Number.isFinite(backdropRarityPermille) ? backdropRarityPermille : null,
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

function serverUrl(pathname, base = SERVER) {
  const p = String(pathname || "").trim();
  if (!p) return base;
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
}

async function postServerJson(pathname, body, headers = {}) {
  const errors = [];
  for (const base of SERVER_CANDIDATES) {
    const url = serverUrl(pathname, base);
    try {
      return await postJson(url, body, headers);
    } catch (e) {
      errors.push(`${base}: ${shortErrorText(e?.message || e, 220)}`);
    }
  }
  const detail = errors.length ? ` (${errors.join(" | ")})` : "";
  throw new Error(`fetch failed${detail}`);
}

async function getServerJson(pathname, headers = {}) {
  const errors = [];
  for (const base of SERVER_CANDIDATES) {
    const url = serverUrl(pathname, base);
    try {
      return await getJson(url, headers);
    } catch (e) {
      errors.push(`${base}: ${shortErrorText(e?.message || e, 220)}`);
    }
  }
  const detail = errors.length ? ` (${errors.join(" | ")})` : "";
  throw new Error(`fetch failed${detail}`);
}

async function pushRelayerPrices(items) {
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  return await postServerJson("/api/gifts/prices/push", { items }, headers);
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
  const cat = await getServerJson("/api/gifts/catalog");
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


async function addToInventory({ userId, username = "", item, claimId }) {
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  const cleanUsername = normalizeUsername(username);
  return await postServerJson("/api/inventory/nft/add", {
    userId: String(userId),
    username: cleanUsername || undefined,
    items: [item],
    claimId: String(claimId),
  }, headers);
}



async function addToMarket({ item }) {
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  return await postServerJson("/api/market/items/add", { item }, headers);
}

async function clearMarketItemsRemote() {
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  return await postServerJson("/api/market/items/clear", {}, headers);
}

async function run({ mode = "run" } = {}) {
  if (!SESSION_STR) die("[Relayer] RELAYER_SESSION is empty. Run: node relayer.js login");
  if (!INLINE_IMAGES) ensureDir(IMG_DIR);
  console.log("[Relayer] SESSION_SOURCE:", SESSION_SOURCE);
  console.log("[Relayer] API_ID_SOURCE:", API_ID_SOURCE);
  console.log("[Relayer] API_HASH_SOURCE:", API_HASH_SOURCE);
  console.log("[Relayer] SESSION_FINGERPRINT:", sessionFingerprint(SESSION_STR));
  console.log("[Relayer] API_ID:", API_ID || "(empty)");

  const client = await makeClient(SESSION_STR);
  await client.connect();

  try {
    const me = await client.getMe();
    const meId = normalizeTelegramId(me?.id || "");
    const meUsername = normalizeUsername(me?.username || "");
    const meName = [String(me?.firstName || "").trim(), String(me?.lastName || "").trim()].filter(Boolean).join(" ").trim();
    console.log(`[Relayer] ACCOUNT: ${meName || "(no name)"}${meUsername ? ` @${meUsername}` : ""}${meId ? ` (id=${meId})` : ""}`);
  } catch (e) {
    console.log("[Relayer] ACCOUNT: failed to resolve current account:", e?.message || e);
  }

  // RPC server: allows backend to request withdrawals and manual market imports.
  if (mode !== "sync") startRpcServer(client, { importMarketGiftByLink });

  console.log("[Relayer] ✅ Connected. Listening gifts...");
  console.log("[Relayer] SERVER:", SERVER);
  console.log("[Relayer] SERVER_CANDIDATES:", SERVER_CANDIDATES.join(", "));
  console.log("[Relayer] IMG_DIR:", IMG_DIR);
  console.log("[Relayer] ADMIN_IDS:", ADMIN_IDS.join(", ") || "(empty)");
  console.log("[Relayer] ADMIN_IDS(normalized):", Array.from(ADMIN_ID_SET).join(", ") || "(empty)");
  if (!ADMIN_ID_SET.size) console.log("[Relayer] ⚠️ ADMIN_IDS is empty: all gifts will go to inventory.");
  if (!SECRET) console.log("[Relayer] ⚠️ RELAYER_SECRET is empty: server can reject /api/market and /api/inventory calls.");

  if (CLEAR_MARKET_ON_START) {
    try {
      const clearRes = await clearMarketItemsRemote();
      if (clearRes.ok) {
        console.log("[Relayer][BOOT] [OK] Market cleared (RELAYER_CLEAR_MARKET_ON_START=1)");
      } else {
        console.log("[Relayer][BOOT] [ERR] market clear failed:", clearRes.status, clearRes.text);
      }
    } catch (e) {
      console.log("[Relayer][BOOT] [ERR] market clear exception:", e?.message || e);
    }
  }

  const pricesLoop = (mode === "sync") ? { stop: () => {} } : startPricesLoop(client);


  const processed = new Set();
  const processing = new Set();
  const processedTextImports = new Set();
  const processingTextImports = new Set();
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
      const senderMeta = await resolveSenderMeta(client, msg).catch(() => ({ id: fromId, username: "" }));
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
      const availabilityIssued = Number(gift?.availabilityIssued);
      const availabilityTotal = Number(gift?.availabilityTotal);

      const tgPayload = {
        kind: isStarGift ? "star_gift" : "gift",
        giftId: giftId != null ? String(giftId) : null,
        slug: slug || null,
        num: num != null ? Number(num) : null,
        ownerName: String(gift?.ownerName || "").trim() || null,
        ownerAddress: String(gift?.ownerAddress || "").trim() || null,
        availabilityIssued: Number.isFinite(availabilityIssued) ? availabilityIssued : null,
        availabilityTotal: Number.isFinite(availabilityTotal) ? availabilityTotal : null,

        // Collectible parts
        collectible: !!assets.backdrop,
        model: {
          name: assets.modelName || null,
          image: modelDataUrl || imageUrl || "",
          rarityPermille: Number.isFinite(assets.modelRarityPermille) ? assets.modelRarityPermille : null
        },
        pattern: patternDoc ? {
          name: assets.patternName || null,
          image: patternDataUrl || "",
          rarityPermille: Number.isFinite(assets.patternRarityPermille) ? assets.patternRarityPermille : null
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
        r = await addToInventory({
          userId: fromId,
          username: senderMeta?.username || "",
          item: inventoryItem,
          claimId
        });
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

  async function findSavedGiftBySlugAndNum({ slugNorm, num, pageLimit = SAVED_GIFTS_PAGE_LIMIT, maxPages = SAVED_GIFTS_MAX_PAGES }) {
    const targetSlug = normalizeGiftSlugForCompare(slugNorm);
    const targetNum = Number(num);
    if (!targetSlug || !Number.isInteger(targetNum) || targetNum <= 0) {
      return { gift: null, scanned: 0, pages: 0, matchMode: "", candidates: [] };
    }

    const limit = Math.max(1, Math.min(200, Number(pageLimit) || SAVED_GIFTS_PAGE_LIMIT));
    const pagesMax = Math.max(1, Math.min(50, Number(maxPages) || SAVED_GIFTS_MAX_PAGES));
    let offset = "";
    let scanned = 0;
    let pages = 0;
    const candidates = [];
    const candidateSet = new Set();
    let numberOnlyGift = null;
    let numberOnlyKey = "";
    let numberOnlyAmbiguous = false;
    for (let page = 0; page < pagesMax; page++) {
      pages += 1;
      const res = await client.invoke(new Api.payments.GetSavedStarGifts({
        peer: "me",
        offset,
        limit
      }));

      const gifts = Array.isArray(res?.gifts) ? res.gifts : [];
      if (!gifts.length) break;
      scanned += gifts.length;

      for (const savedGift of gifts) {
        const gift = savedGift?.gift || null;
        const savedSlug = normalizeGiftSlugForCompare(gift?.slug || "");
        const savedSlugRaw = String(gift?.slug || "").trim();
        const savedNum = Number(gift?.num ?? gift?.number ?? NaN);
        if (savedSlugRaw && Number.isInteger(savedNum) && savedNum > 0 && candidates.length < 8) {
          const key = `${savedSlugRaw}-${savedNum}`;
          if (!candidateSet.has(key)) {
            candidateSet.add(key);
            candidates.push(key);
          }
        }
        if (savedSlug && savedSlug === targetSlug && Number.isInteger(savedNum) && savedNum === targetNum) {
          return { gift: savedGift, scanned, pages, matchMode: "exact", candidates };
        }

        if (Number.isInteger(savedNum) && savedNum === targetNum) {
          const currentKey = `${savedSlug || "no_slug"}:${savedNum}`;
          if (!numberOnlyGift) {
            numberOnlyGift = savedGift;
            numberOnlyKey = currentKey;
          } else if (numberOnlyKey !== currentKey) {
            numberOnlyAmbiguous = true;
          }
        }
      }

      const nextOffset = String(res?.nextOffset ?? res?.next_offset ?? "").trim();
      if (!nextOffset || nextOffset === offset) break;
      offset = nextOffset;
    }
    if (numberOnlyGift && !numberOnlyAmbiguous) {
      return { gift: numberOnlyGift, scanned, pages, matchMode: "number_only", candidates };
    }
    return { gift: null, scanned, pages, matchMode: "", candidates };
  }

  async function findGiftActionMessageBySlugAndNum({
    slugNorm,
    num,
    dialogsLimit = IMPORT_DIALOGS_LIMIT,
    perDialogLimit = IMPORT_DIALOG_MESSAGES_LIMIT
  }) {
    const targetSlug = normalizeGiftSlugForCompare(slugNorm);
    const targetNum = Number(num);
    if (!targetSlug || !Number.isInteger(targetNum) || targetNum <= 0) {
      return { message: null, scannedMessages: 0, scannedActions: 0, dialogsScanned: 0, matchMode: "", candidates: [] };
    }

    const dl = Math.max(1, Math.min(200, Number(dialogsLimit) || IMPORT_DIALOGS_LIMIT));
    const ml = Math.max(1, Math.min(200, Number(perDialogLimit) || IMPORT_DIALOG_MESSAGES_LIMIT));

    let dialogs = [];
    try {
      dialogs = await client.getDialogs({ limit: dl });
    } catch (e) {
      return {
        message: null,
        scannedMessages: 0,
        scannedActions: 0,
        dialogsScanned: 0,
        error: String(e?.message || e || "getDialogs failed")
      };
    }

    let scannedMessages = 0;
    let scannedActions = 0;
    let dialogsScanned = 0;
    const candidates = [];
    const candidateSet = new Set();
    let numberOnlyMessage = null;
    let numberOnlyKey = "";
    let numberOnlyAmbiguous = false;

    for (const d of dialogs) {
      const entity = d?.entity || d;
      dialogsScanned += 1;
      let msgs = [];
      try {
        msgs = await client.getMessages(entity, { limit: ml });
      } catch {
        continue;
      }
      if (!Array.isArray(msgs) || !msgs.length) continue;

      scannedMessages += msgs.length;
      for (const m of msgs) {
        if (!m?.action) continue;
        scannedActions += 1;

        const action = m.action;
        const gift = extractGiftFromAction(action);
        if (!gift || !isNftGift(gift, action)) continue;

        const foundSlug = normalizeGiftSlugForCompare(gift?.slug || "");
        const foundSlugRaw = String(gift?.slug || "").trim();
        const foundNum = Number(gift?.num ?? gift?.number ?? NaN);
        if (foundSlugRaw && Number.isInteger(foundNum) && foundNum > 0 && candidates.length < 8) {
          const key = `${foundSlugRaw}-${foundNum}`;
          if (!candidateSet.has(key)) {
            candidateSet.add(key);
            candidates.push(key);
          }
        }
        if (foundSlug && foundSlug === targetSlug && Number.isInteger(foundNum) && foundNum === targetNum) {
          return { message: m, scannedMessages, scannedActions, dialogsScanned, matchMode: "exact", candidates };
        }

        if (Number.isInteger(foundNum) && foundNum === targetNum) {
          const currentKey = `${foundSlug || "no_slug"}:${foundNum}`;
          if (!numberOnlyMessage) {
            numberOnlyMessage = m;
            numberOnlyKey = currentKey;
          } else if (numberOnlyKey !== currentKey) {
            numberOnlyAmbiguous = true;
          }
        }
      }
    }

    if (numberOnlyMessage && !numberOnlyAmbiguous) {
      return { message: numberOnlyMessage, scannedMessages, scannedActions, dialogsScanned, matchMode: "number_only", candidates };
    }
    return { message: null, scannedMessages, scannedActions, dialogsScanned, matchMode: "", candidates };
  }

  async function resolveGiftModelImageDataUrl(assets, context = "") {
    const doc = assets?.modelDoc || null;
    if (!doc) return "";
    try {
      return await downloadDocAsDataUrl(client, doc);
    } catch (e) {
      if (DEBUG) {
        const reason = e?.message || e;
        console.log(`[Relayer][ImportByLink] model image download failed${context ? ` (${context})` : ""}:`, reason);
      }
      return "";
    }
  }

  async function buildMarketItemFromGiftActionMessage(msg) {
    const rawMsgId = Number(msg?.id);
    if (!Number.isInteger(rawMsgId) || rawMsgId <= 0) {
      throw new Error("MESSAGE_ID_MISSING");
    }

    const action = msg?.action || null;
    const gift = extractGiftFromAction(action);
    if (!gift || typeof gift !== "object") {
      throw new Error("GIFT_MISSING");
    }
    if (!isNftGift(gift, action)) {
      throw new Error("NOT_NFT");
    }

    const title = String(gift?.title || gift?.name || "Gift").trim() || "Gift";
    const slug = String(gift?.slug || "").trim();
    if (!slug) throw new Error("SLUG_MISSING");

    const numRaw = Number(gift?.num ?? gift?.number ?? NaN);
    const num = Number.isInteger(numRaw) && numRaw > 0 ? numRaw : null;
    if (num == null) throw new Error("NUMBER_MISSING");

    const giftId = gift?.id ?? gift?.giftId ?? null;
    const numberText = formatNum(num);
    const msgId = String(rawMsgId);
    const fromPeer = msg?.fromId || msg?.from_id || action?.fromId || action?.from_id || null;
    const peerK = peerKey(fromPeer) || "msg";
    const eventKey = `tg_link_${peerK}_${msgId}`;
    const assets = extractGiftAssets(gift);
    const modelDataUrl = await resolveGiftModelImageDataUrl(assets, `history:${msgId}`);
    const availabilityIssued = Number(gift?.availabilityIssued);
    const availabilityTotal = Number(gift?.availabilityTotal);

    const tgPayload = {
      kind: "star_gift",
      giftId: giftId != null ? String(giftId) : null,
      slug: slug || null,
      num,
      ownerName: String(gift?.ownerName || "").trim() || null,
      ownerAddress: String(gift?.ownerAddress || "").trim() || null,
      availabilityIssued: Number.isFinite(availabilityIssued) ? availabilityIssued : null,
      availabilityTotal: Number.isFinite(availabilityTotal) ? availabilityTotal : null,
      collectible: !!assets.backdrop,
      model: {
        name: assets.modelName || null,
        image: modelDataUrl || "",
        rarityPermille: Number.isFinite(assets.modelRarityPermille) ? assets.modelRarityPermille : null
      },
      pattern: assets.patternName
        ? {
            name: assets.patternName || null,
            image: "",
            rarityPermille: Number.isFinite(assets.patternRarityPermille) ? assets.patternRarityPermille : null
          }
        : null,
      backdrop: assets.backdrop || null,
      peerKey: peerK,
      messageId: msgId,
      eventKey
    };

    const marketItem = {
      id: `m_${slug || giftId || "gift"}_${String(num ?? "n")}_${peerK}_${msgId}`,
      sourceKey: eventKey,
      name: title,
      number: numberText,
      image: modelDataUrl || "",
      previewUrl: fragmentMediumPreviewUrlFromSlug(slug),
      priceTon: null,
      createdAt: Date.now(),
      tg: tgPayload
    };

    return { marketItem, title, numberText, msgId, slug, num };
  }

  async function buildMarketItemFromSavedGift(savedGift) {
    const rawMsgId = Number(savedGift?.msgId ?? savedGift?.msg_id);
    if (!Number.isInteger(rawMsgId) || rawMsgId <= 0) {
      throw new Error("MESSAGE_ID_MISSING");
    }

    const gift = savedGift?.gift || null;
    if (!gift || typeof gift !== "object") {
      throw new Error("GIFT_PAYLOAD_INVALID");
    }
    if (!isNftGift(gift)) {
      throw new Error("NOT_NFT");
    }

    const title = String(gift?.title || gift?.name || "Gift").trim() || "Gift";
    const slug = String(gift?.slug || "").trim();
    const giftId = gift?.id ?? gift?.giftId ?? null;
    const numRaw = Number(gift?.num ?? gift?.number ?? NaN);
    const num = Number.isInteger(numRaw) && numRaw > 0 ? numRaw : null;
    const numberText = num != null ? formatNum(num) : "";
    const msgId = String(rawMsgId);

    const fromPeer = savedGift?.fromId || savedGift?.from_id || null;
    const peerK = peerKey(fromPeer) || "saved";
    const eventKey = `tg_saved_${msgId}`;
    const assets = extractGiftAssets(gift);
    const modelDataUrl = await resolveGiftModelImageDataUrl(assets, `saved:${msgId}`);
    const availabilityIssued = Number(gift?.availabilityIssued);
    const availabilityTotal = Number(gift?.availabilityTotal);

    const tgPayload = {
      kind: "star_gift",
      giftId: giftId != null ? String(giftId) : null,
      slug: slug || null,
      num,
      ownerName: String(gift?.ownerName || "").trim() || null,
      ownerAddress: String(gift?.ownerAddress || "").trim() || null,
      availabilityIssued: Number.isFinite(availabilityIssued) ? availabilityIssued : null,
      availabilityTotal: Number.isFinite(availabilityTotal) ? availabilityTotal : null,
      collectible: !!assets.backdrop,
      model: {
        name: assets.modelName || null,
        image: modelDataUrl || "",
        rarityPermille: Number.isFinite(assets.modelRarityPermille) ? assets.modelRarityPermille : null
      },
      pattern: assets.patternName
        ? {
            name: assets.patternName || null,
            image: "",
            rarityPermille: Number.isFinite(assets.patternRarityPermille) ? assets.patternRarityPermille : null
          }
        : null,
      backdrop: assets.backdrop || null,
      peerKey: peerK,
      messageId: msgId,
      eventKey
    };

    const marketItem = {
      id: `m_${slug || giftId || "gift"}_${String(num ?? "n")}_${peerK}_${msgId}`,
      sourceKey: eventKey,
      name: title,
      number: numberText,
      image: modelDataUrl || "",
      previewUrl: fragmentMediumPreviewUrlFromSlug(slug),
      priceTon: null,
      createdAt: Date.now(),
      tg: tgPayload
    };

    return { marketItem, title, numberText, msgId, slug, num };
  }

  async function importMarketGiftByLink(giftLinkRaw) {
    const parsed = parseNftGiftLink(giftLinkRaw);
    if (!parsed) {
      return { ok: false, code: "BAD_LINK", error: "Invalid gift link. Expected https://t.me/nft/<Slug>-<Number>" };
    }

    let built = null;
    let source = "";
    let matchMode = "";
    let diagMsgScanned = 0;
    let diagActionScanned = 0;
    let diagDialogsScanned = 0;
    let diagSavedScanned = 0;
    let diagSavedPages = 0;
    let diagHistoryCandidates = [];
    let diagSavedCandidates = [];

    // Primary path for admin text import: search collectible gift actions in message history.
    // This avoids strict dependency on Saved Gifts state and uses real messageId for withdraw.
    try {
      const fromMessages = await findGiftActionMessageBySlugAndNum({
        slugNorm: parsed.slugNorm,
        num: parsed.num,
        dialogsLimit: IMPORT_DIALOGS_LIMIT,
        perDialogLimit: IMPORT_DIALOG_MESSAGES_LIMIT
      });
      diagMsgScanned = Number(fromMessages?.scannedMessages || 0);
      diagActionScanned = Number(fromMessages?.scannedActions || 0);
      diagDialogsScanned = Number(fromMessages?.dialogsScanned || 0);
      diagHistoryCandidates = Array.isArray(fromMessages?.candidates) ? fromMessages.candidates : [];
      if (fromMessages?.message) {
        built = await buildMarketItemFromGiftActionMessage(fromMessages.message);
        source = "history";
        matchMode = String(fromMessages?.matchMode || "exact");
      }
    } catch (e) {
      console.log("[Relayer][ImportByLink] history lookup failed:", e?.message || e);
    }

    // Fallback: Saved Gifts API.
    if (!built) {
      let savedGift = null;
      try {
        const search = await findSavedGiftBySlugAndNum({
          slugNorm: parsed.slugNorm,
          num: parsed.num,
          pageLimit: IMPORT_SAVED_GIFTS_PAGE_LIMIT,
          maxPages: IMPORT_SAVED_GIFTS_MAX_PAGES
        });
        savedGift = search?.gift || null;
        diagSavedScanned = Number(search?.scanned || 0);
        diagSavedPages = Number(search?.pages || 0);
        diagSavedCandidates = Array.isArray(search?.candidates) ? search.candidates : [];
      } catch (e) {
        return { ok: false, code: "SAVED_GIFTS_FETCH_FAILED", error: e?.message || "Failed to query Saved Gifts" };
      }

      if (savedGift) {
        try {
          built = await buildMarketItemFromSavedGift(savedGift);
          source = "saved";
          matchMode = String(search?.matchMode || "exact");
        } catch (e) {
          const code = String(e?.message || "BUILD_FAILED");
          if (code === "NOT_NFT") {
            return { ok: false, code, error: "Gift is not NFT/collectible" };
          }
          if (code === "MESSAGE_ID_MISSING") {
            return { ok: false, code, error: "Gift has no messageId in Saved Gifts" };
          }
          return { ok: false, code: "BUILD_FAILED", error: code };
        }
      }
    }

    if (!built) {
      const historyRefs = diagHistoryCandidates.slice(0, 5).join(", ");
      const savedRefs = diagSavedCandidates.slice(0, 5).join(", ");
      const refsTail = [
        historyRefs ? `historyRefs=${historyRefs}` : "",
        savedRefs ? `savedRefs=${savedRefs}` : ""
      ].filter(Boolean).join("; ");
      const hint = `Gift not found. history: dialogs=${diagDialogsScanned}, messages=${diagMsgScanned}, giftActions=${diagActionScanned}; saved: items=${diagSavedScanned}, pages=${diagSavedPages}${refsTail ? `; ${refsTail}` : ""}.`;
      return { ok: false, code: "GIFT_NOT_FOUND", error: hint };
    }

    const addRes = await addToMarket({ item: built.marketItem });
    if (!addRes?.ok) {
      return {
        ok: false,
        code: "MARKET_ADD_FAILED",
        error: shortErrorText(addRes?.json?.error || addRes?.text || `HTTP ${addRes?.status || 0}`)
      };
    }

    const marketItem = addRes?.json?.item || built.marketItem;
    return {
      ok: true,
      code: "IMPORTED",
      source,
      matchMode,
      relisted: !!addRes?.json?.relisted,
      parsed: { slug: parsed.slug, num: parsed.num },
      item: marketItem
    };
  }

  async function sendCommandReply(msg, fromId, message) {
    const targets = [
      msg?.peerId || msg?.peer_id || null,
      fromId || null
    ].filter(Boolean);
    const used = new Set();
    for (const target of targets) {
      const key = String(target);
      if (used.has(key)) continue;
      used.add(key);
      try {
        await client.sendMessage(target, { message });
        return true;
      } catch {}
    }
    return false;
  }

  async function handleAdminImportTextMessage(msg, origin = "NewMessage") {
    if (!msg || msg.id == null || msg.action) return false;

    const found = firstNftGiftLinkFromText(msg.message);
    if (!found?.parsed) return false;

    const peerK = peerKey(msg.peerId);
    const msgId = String(msg.id);
    const cmdKey = `${peerK}:${msgId}`;
    if (processedTextImports.has(cmdKey) || processingTextImports.has(cmdKey)) return true;
    processingTextImports.add(cmdKey);

    try {
      const fromId = resolveMessageFromId(msg) || "";
      const isFromAdmin = isAdmin(fromId);
      const giftLink = canonicalNftGiftLink(found.parsed) || found.raw;
      if (!isFromAdmin) {
        console.log(`[Relayer][CMD] rejected non-admin import request from=${fromId || "unknown"} msgId=${msgId} origin=${origin} link="${giftLink}"`);
        await sendCommandReply(msg, fromId, "Forbidden: only admin can import market gifts by link.");
        processedTextImports.add(cmdKey);
        return true;
      }

      console.log(`[Relayer][CMD] admin import request from=${fromId} msgId=${msgId} origin=${origin} link="${giftLink}"`);
      const result = await importMarketGiftByLink(giftLink);
      if (!result?.ok) {
        const reason = shortErrorText(result?.error || result?.code || "import failed");
        await sendCommandReply(msg, fromId, `Import failed: ${reason}`);
        processedTextImports.add(cmdKey);
        return true;
      }

      const name = String(result?.item?.name || "Gift");
      const numberText = String(result?.item?.number || "").trim();
      const label = numberText ? `${name} #${numberText}` : name;
      const relisted = result?.relisted ? " (relisted)" : "";
      const matchText = result?.matchMode === "number_only" ? " [num-only]" : "";
      const sourceText = result?.source ? ` [${String(result.source)}]` : "";
      await sendCommandReply(msg, fromId, `Added to market: ${label}${relisted}${sourceText}${matchText}`);
      processedTextImports.add(cmdKey);
      return true;
    } catch (e) {
      const errText = shortErrorText(e?.message || e || "command failed");
      const fromId = resolveMessageFromId(msg) || "";
      console.log(`[Relayer][CMD] import handler error msgId=${String(msg.id)}:`, errText);
      await sendCommandReply(msg, fromId, `Import failed: ${errText}`);
      return true;
    } finally {
      processingTextImports.delete(cmdKey);
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

  async function processSavedGiftsSnapshot(origin = "SAVED", { notify = false, process = true } = {}) {
    if (!SAVED_GIFTS_WATCH) return { fetched: 0, handled: 0 };

    let fetched = 0;
    let handled = 0;
    let offset = "";
    let failed = false;
    let authDuplicated = false;
    let lastError = "";
    const currentKeys = new Set();

    for (let page = 0; page < SAVED_GIFTS_MAX_PAGES; page++) {
      let res = null;
      try {
        res = await client.invoke(new Api.payments.GetSavedStarGifts({
          peer: "me",
          offset,
          limit: SAVED_GIFTS_PAGE_LIMIT
        }));
      } catch (e) {
        failed = true;
        lastError = String(e?.message || e || "");
        authDuplicated = /AUTH_KEY_DUPLICATED/i.test(lastError);
        console.log(`[Relayer][${origin}] ❌ getSavedStarGifts failed:`, lastError || e);
        break;
      }

      const gifts = Array.isArray(res?.gifts) ? res.gifts : [];
      if (!gifts.length) break;

      for (let i = 0; i < gifts.length; i++) {
        const g = gifts[i];
        fetched++;

        const stableKey = savedGiftStableKey(g, fetched);
        currentKeys.add(stableKey);
        if (seenSavedGiftKeys.has(stableKey)) continue;
        seenSavedGiftKeys.add(stableKey);

        if (!process) continue;

        const synthetic = savedGiftToSyntheticMessage(g, fetched);
        const before = processed.size;
        await handleGiftMessage(synthetic, origin, { notify });
        if (processed.size > before) handled++;
      }

      const nextOffset = String(res?.nextOffset ?? res?.next_offset ?? "").trim();
      if (!nextOffset || nextOffset === offset) break;
      offset = nextOffset;
    }

    if (DEBUG || handled > 0 || !process || failed) {
      const statusTail = failed
        ? ` status=error${authDuplicated ? " auth_dup=1" : ""}`
        : "";
      console.log(
        `[Relayer][${origin}] saved gifts fetched=${fetched} current=${currentKeys.size} handled=${handled} seenKeysTotal=${seenSavedGiftKeys.size} mode=${process ? "process" : "prime"}${statusTail}`
      );
    }
    return {
      fetched,
      current: currentKeys.size,
      handled,
      failed,
      authDuplicated,
      error: lastError,
      seenTotal: seenSavedGiftKeys.size
    };
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
    await processSavedGiftsSnapshot("SYNC_SAVED", { notify: false, process: true });
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
      await processSavedGiftsSnapshot("SAVED_BOOT", { notify: false, process: SAVED_GIFTS_IMPORT_BOOT });
      if (!SAVED_GIFTS_IMPORT_BOOT) {
        console.log("[Relayer][SAVED_BOOT] historical import disabled; primed seen keys only");
      }
    } catch (e) {
      console.log("[Relayer][SAVED_BOOT] ❌ saved gifts bootstrap failed:", e?.message || e);
    }
  }

  let savedGiftsTimer = null;
  let savedPollStopped = false;
  let savedPollInFlight = false;
  let savedPollFailures = 0;
  let savedPollPauseUntil = 0;

  function clearSavedGiftsTimer() {
    if (!savedGiftsTimer) return;
    try { clearTimeout(savedGiftsTimer); } catch {}
    savedGiftsTimer = null;
  }

  function scheduleSavedGiftsPoll(delayMs) {
    if (!SAVED_GIFTS_WATCH || savedPollStopped) return;
    clearSavedGiftsTimer();
    const d = Math.max(1_000, Number(delayMs) || SAVED_GIFTS_POLL_MS);
    savedGiftsTimer = setTimeout(() => {
      runSavedGiftsPoll("SAVED_POLL").catch((e) => {
        console.log("[Relayer][SAVED_POLL] ❌ poll scheduler error:", e?.message || e);
      });
    }, d);
  }

  async function runSavedGiftsPoll(origin = "SAVED_POLL") {
    if (!SAVED_GIFTS_WATCH || savedPollStopped) return;
    if (savedPollInFlight) return;

    const now = Date.now();
    if (savedPollPauseUntil > now) {
      scheduleSavedGiftsPoll(savedPollPauseUntil - now);
      return;
    }

    savedPollInFlight = true;
    try {
      const snap = await processSavedGiftsSnapshot(origin, { notify: false });

      if (snap?.authDuplicated) {
        savedPollFailures = Math.max(savedPollFailures + 1, 1);
        savedPollPauseUntil = Date.now() + SAVED_GIFTS_AUTH_DUP_PAUSE_MS;
        const waitSec = Math.max(1, Math.round(SAVED_GIFTS_AUTH_DUP_PAUSE_MS / 1000));
        console.log(`[Relayer][SAVED_POLL] ⚠️ AUTH_KEY_DUPLICATED: polling paused for ${waitSec}s`);
        scheduleSavedGiftsPoll(SAVED_GIFTS_AUTH_DUP_PAUSE_MS);
        return;
      }

      if (snap?.failed) {
        savedPollFailures = Math.max(savedPollFailures + 1, 1);
        const exp = Math.min(6, savedPollFailures - 1);
        const delay = Math.min(SAVED_GIFTS_ERROR_BACKOFF_MAX_MS, SAVED_GIFTS_POLL_MS * Math.pow(2, Math.max(0, exp)));
        scheduleSavedGiftsPoll(delay);
        return;
      }

      savedPollFailures = 0;
      savedPollPauseUntil = 0;
      scheduleSavedGiftsPoll(SAVED_GIFTS_POLL_MS);
    } catch (e) {
      savedPollFailures = Math.max(savedPollFailures + 1, 1);
      const exp = Math.min(6, savedPollFailures - 1);
      const delay = Math.min(SAVED_GIFTS_ERROR_BACKOFF_MAX_MS, SAVED_GIFTS_POLL_MS * Math.pow(2, Math.max(0, exp)));
      console.log("[Relayer][SAVED_POLL] ❌ poll error:", e?.message || e);
      scheduleSavedGiftsPoll(delay);
    } finally {
      savedPollInFlight = false;
    }
  }

  if (SAVED_GIFTS_WATCH) {
    console.log(`[Relayer][SAVED] 👀 watching saved gifts (poll=${Math.round(SAVED_GIFTS_POLL_MS / 1000)}s, pageLimit=${SAVED_GIFTS_PAGE_LIMIT}, pages=${SAVED_GIFTS_MAX_PAGES})`);
    scheduleSavedGiftsPoll(SAVED_GIFTS_POLL_MS);
  }

// 1) RAW updates (гifts часто приходят именно так)
  client.addEventHandler(async (update) => {
    if (!update) return;

    if (SAVED_GIFTS_WATCH && update instanceof Api.UpdateSavedGifs) {
      if (DEBUG) console.log("[Relayer][RAW] UpdateSavedGifs received");
      await runSavedGiftsPoll("SAVED_UPDATE");
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
      await handleAdminImportTextMessage(msg, "NewMessage");
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
  savedPollStopped = true;
  clearSavedGiftsTimer();
  try { await client.disconnect(); } catch {}
  process.exit(0);
});
  
process.on("SIGTERM", async () => {
  console.log("[Relayer] SIGTERM -> disconnect");
  try { pricesLoop?.stop?.(); } catch {}
  savedPollStopped = true;
  clearSavedGiftsTimer();
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
const RPC_HOST = String(process.env.RELAYER_RPC_HOST || process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";

function rpcAuthOk(req) {
  const secret = String(SECRET || "");
  if (!secret) return false;
  const h = String(req.headers?.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? String(m[1] || "").trim() : "";
  const alt = String(req.headers?.["x-relayer-secret"] || req.headers?.["x-relay-secret"] || "").trim();
  return safeTextEqual(token, secret) || safeTextEqual(alt, secret);
}

function safeTextEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
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
function startRpcServer(client, hooks = {}) {
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

  app.post("/rpc/market/import-by-link", async (req, res) => {
    try {
      if (!rpcAuthOk(req)) return res.status(403).json({ ok: false, code: "FORBIDDEN", error: "forbidden" });

      const giftLink = String(req.body?.giftLink || req.body?.link || req.body?.url || "").trim();
      if (!giftLink) {
        return res.status(400).json({ ok: false, code: "BAD_LINK", error: "giftLink required" });
      }

      const importer = hooks?.importMarketGiftByLink;
      if (typeof importer !== "function") {
        return res.status(503).json({ ok: false, code: "IMPORT_NOT_READY", error: "import handler not ready" });
      }

      const result = await importer(giftLink);
      if (!result?.ok) {
        const code = String(result?.code || "IMPORT_FAILED");
        const status = (
          code === "BAD_LINK" ? 400 :
          code === "GIFT_NOT_FOUND" ? 404 :
          code === "NOT_NFT" ? 409 :
          code === "MESSAGE_ID_MISSING" ? 422 :
          code === "SAVED_GIFTS_FETCH_FAILED" ? 502 :
          500
        );
        return res.status(status).json({
          ok: false,
          code,
          error: String(result?.error || code)
        });
      }

      return res.json({
        ok: true,
        code: String(result.code || "IMPORTED"),
        relisted: !!result.relisted,
        parsed: result.parsed || null,
        item: result.item || null
      });
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
