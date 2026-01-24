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

function peerUserId(peer) {
  if (!peer) return null;
  // GramJS peers can be PeerUser / PeerChannel / PeerChat
  if (peer.userId != null) return String(peer.userId);
  if (peer instanceof Api.PeerUser && peer.userId != null) return String(peer.userId);
  // sometimes message.fromId is InputPeerUser-like
  if (peer?.value != null) return String(peer.value);
  return null;
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
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: r.ok, status: r.status, json, text };
}

async function addToInventory({ userId, item, claimId }) {
  const url = `${SERVER}/api/inventory/nft/add`;
  return await postJson(url, {
    userId: String(userId),
    items: [item],
    claimId: String(claimId),
    initData: "" // relayer is trusted, no initData
  });
}

async function addToMarket({ item }) {
  const url = `${SERVER}/api/market/items/add`;
  const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};
  return await postJson(url, { item }, headers);
}

async function run() {
  if (!SESSION_STR) die("[Relayer] RELAYER_SESSION is empty. Run: node relayer.js login");
  ensureDir(IMG_DIR);

  const client = await makeClient(SESSION_STR);
  await client.connect();

  console.log("[Relayer] ✅ Connected. Listening gifts...");
  console.log("[Relayer] SERVER:", SERVER);
  console.log("[Relayer] IMG_DIR:", IMG_DIR);
  console.log("[Relayer] ADMIN_IDS:", ADMIN_IDS.join(", ") || "(empty)");

  client.addEventHandler(async (event) => {
    const msg = event?.message;
    if (!msg) return;

    const action = msg.action;
    if (!action) return;

    // We handle: Star Gifts (regular/unique), and fallback GiftPremium/GiftStars if present
    const isStarGift =
      (action instanceof Api.MessageActionStarGift) ||
      (action instanceof Api.MessageActionStarGiftUnique);

    const isOtherGift =
      (action instanceof Api.MessageActionGiftPremium) ||
      (action instanceof Api.MessageActionGiftStars);

    if (!isStarGift && !isOtherGift) return;

    const fromId = actionFromId(action) || peerUserId(msg.fromId);
    if (!fromId) {
      console.log("[Relayer] ⚠️ gift without fromId (skipped). msgId=", msg.id);
      return;
    }

    // Parse gift object
    const gift = action.gift || null;
    const title = String(gift?.title || gift?.name || "Gift");
    const slug = String(gift?.slug || "").trim();
    const num = gift?.num ?? gift?.number ?? null;
    const giftId = gift?.id ?? gift?.giftId ?? null;

    const { model, backdrop, pattern } = extractAttrs(gift);
    const doc = pickDocFromStarGift(gift);

    // Download image / thumb
    let imageUrl = "";
    try {
      if (doc) {
        const mime = String(doc.mimeType || "");
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
          await client.downloadMedia(doc, dlOpts);
          ok = fs.existsSync(outPath);
        } catch (_) {}
        if (!ok) {
          await client.downloadMedia(doc, { outputFile: outPath });
          ok = fs.existsSync(outPath);
        }

        if (ok) {
          imageUrl = `/images/gifts/marketnfts/${fileName}`;
        }
      }
    } catch (e) {
      console.log("[Relayer] download error:", e?.message || e);
    }

    const numberText = num != null ? formatNum(num) : "";

    const instanceId = `tg_gift_${fromId}_${String(msg.id)}`;
    const inventoryItem = {
      type: "nft",
      id: `nft_${slug || giftId || "gift"}_${String(num ?? msg.id)}`,
      name: title,
      displayName: title,
      icon: imageUrl || "/images/gifts/stars.webp",
      instanceId,
      acquiredAt: Date.now(),
      price: { ton: null, stars: null },
      tg: {
        kind: isStarGift ? "star_gift" : "gift",
        giftId: giftId != null ? String(giftId) : null,
        slug: slug || null,
        num: num != null ? Number(num) : null,
        model, backdrop, pattern
      }
    };

    const marketItem = {
      id: `m_${slug || giftId || "gift"}_${String(num ?? msg.id)}`,
      name: title,
      number: numberText,
      image: imageUrl || "",
      priceTon: null,
      createdAt: Date.now(),
      tg: {
        giftId: giftId != null ? String(giftId) : null,
        slug: slug || null,
        num: num != null ? Number(num) : null,
        model, backdrop, pattern
      }
    };

    const claimId = `tg_msg_${String(msg.id)}`;

    try {
      let r;
      if (isAdmin(fromId)) {
        r = await addToMarket({ item: marketItem });
        if (!r.ok) {
          console.log("[Relayer] ❌ market add failed:", r.status, r.text);
          return;
        }
        console.log(`[Relayer] ✅ Market +1: ${title} #${numberText || "—"} (from ${fromId})`);
        await client.sendMessage(fromId, { message: `✅ Added to Market: ${title}${numberText ? ` #${numberText}` : ""}` });
      } else {
        r = await addToInventory({ userId: fromId, item: inventoryItem, claimId });
        if (!r.ok) {
          console.log("[Relayer] ❌ inventory add failed:", r.status, r.text);
          return;
        }
        console.log(`[Relayer] ✅ Inventory +1: ${title} (to ${fromId})`);
        await client.sendMessage(fromId, { message: `✅ Gift added to your inventory: ${title}${numberText ? ` #${numberText}` : ""}` });
      }
    } catch (e) {
      console.log("[Relayer] ❌ handler error:", e?.message || e);
    }
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
} else {
  run().catch((e) => die(e?.stack || e?.message || String(e)));
}
