// server.js - CLEAN VERSION
// IMPORTANT (ESM): .env must be loaded BEFORE importing database-pg.js, otherwise it will see empty process.env.
import "dotenv/config";

import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";
import { Readable } from "stream";

// We import Postgres DB module dynamically AFTER dotenv has loaded.
// This fixes the common issue when database-pg.js reads process.env during module initialization.
let dbReal = null;

// =====================
// ENV / DB MODE
// =====================
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
// In non-prod, set TEST_MODE=1 to make DB non-persistent (in-memory only)
const IS_TEST = !IS_PROD && process.env.TEST_MODE === "1";

// ---- Memory DB (per-process; resets on restart). Used only when IS_TEST === true ----
function createMemoryDb() {
  const users = new Map();    // telegram_id(string) -> user
  const balances = new Map(); // telegram_id(string) -> { ton_balance, stars_balance, updated_at }
  const txs = new Map();      // telegram_id(string) -> tx[]
  let txId = 1;
  let betId = 1;

  const nowSec = () => Math.floor(Date.now() / 1000);

  function key(id) {
    const s = String(id ?? "").trim();
    if (!s) throw new Error("userId required");
    return s;
  }
  function ensure(id) {
    const k = key(id);
    if (!users.has(k)) {
      users.set(k, {
        telegram_id: Number.isFinite(+k) ? +k : k,
        username: null,
        first_name: "Test",
        last_name: "",
        language_code: null,
        is_premium: false,
        created_at: nowSec(),
        last_seen: nowSec(),
      });
    }
    if (!balances.has(k)) {
      balances.set(k, { ton_balance: "0", stars_balance: 0, updated_at: nowSec() });
    }
    if (!txs.has(k)) txs.set(k, []);
    return k;
  }

  function addTx(k, t) {
    const list = txs.get(k) || [];
    list.unshift(t);
    txs.set(k, list);
  }

  return {
    async initDatabase() {
      console.log("[DB] 🧪 Memory DB enabled (TEST_MODE=1). Nothing will be persisted.");
    },
    async saveUser(userData) {
      const k = ensure(userData?.id ?? userData?.telegram_id ?? userData);
      const u = users.get(k);
      users.set(k, {
        ...u,
        username: userData?.username ?? u.username,
        first_name: userData?.first_name ?? u.first_name,
        last_name: userData?.last_name ?? u.last_name,
        language_code: userData?.language_code ?? u.language_code,
        is_premium: !!userData?.is_premium,
        last_seen: nowSec(),
      });
      return true;
    },
    async getUserById(telegramId) {
      const k = ensure(telegramId);
      const u = users.get(k);
      const b = balances.get(k);
      return { ...u, ...b };
    },
    async getUserBalance(telegramId) {
      const k = ensure(telegramId);
      return balances.get(k);
    },
    async updateBalance(telegramId, currency, amount, type, description = null, metadata = {}) {
      const k = ensure(telegramId);
      const cur = String(currency || "ton").toLowerCase() === "stars" ? "stars" : "ton";
      const delta = Number(amount || 0);
      if (!Number.isFinite(delta) || delta === 0) throw new Error("Invalid amount");

      const b = balances.get(k);
      const before = cur === "ton" ? Number(b.ton_balance || 0) : Number(b.stars_balance || 0);
      const after = before + delta;
      if (after < 0) throw new Error("Insufficient balance");

      if (cur === "ton") b.ton_balance = String(after);
      else b.stars_balance = Math.trunc(after);

      b.updated_at = nowSec();
      balances.set(k, b);

      addTx(k, {
        id: txId++,
        telegram_id: Number.isFinite(+k) ? +k : k,
        type: String(type || "test"),
        currency: cur,
        amount: delta,
        balance_before: before,
        balance_after: after,
        description: description || null,
        tx_hash: metadata?.txHash || null,
        invoice_id: metadata?.invoiceId || null,
        created_at: nowSec(),
      });

      return after;
    },
    async createBet(telegramId, roundId, betData, totalAmount, currency) {
      const cur = String(currency || "ton").toLowerCase() === "stars" ? "stars" : "ton";
      const amt = Number(totalAmount || 0);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid totalAmount");
      await this.updateBalance(telegramId, cur, -amt, "bet", `Bet on round ${roundId}`, { roundId });
      return betId++;
    },
    async getTransactionHistory(telegramId, limit = 50) {
      const k = ensure(telegramId);
      const lim = Math.max(1, Math.min(200, Number(limit) || 50));
      return (txs.get(k) || []).slice(0, lim);
    },
    async getUserStats(telegramId) {
      const k = ensure(telegramId);
      const list = txs.get(k) || [];
      const bets = list.filter(t => t.type === "bet" || t.type === "wheel_bet");
      const wins = list.filter(t => t.type === "wheel_win");
      const total_bets = bets.length;
      const total_wagered = bets.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
      const total_won = wins.reduce((s, t) => s + Math.max(0, Number(t.amount || 0)), 0);
      return {
        wins: wins.length,
        losses: Math.max(0, total_bets - wins.length),
        total_won,
        total_wagered,
        total_bets
      };
    }
  };
}

const dbMem = createMemoryDb();

// Real DB init (Postgres) — load only after dotenv has run.
if (!IS_TEST) {
  dbReal = await import("./database-pg.js");
  await dbReal.initDatabase();
} else {
  await dbMem.initDatabase();
}

// Select DB
const db = IS_TEST ? dbMem : dbReal;


const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Wheel configuration (must match public/js/wheel.js)
const WHEEL_ORDER = [
  '1.1x','1.5x','Loot Rush','1.1x','5x','50&50','1.1x',
  '1.5x','11x','1.1x','1.5x','Loot Rush','1.1x','5x','50&50',
  '1.1x','1.5x','1.1x','Wild Time','11x','1.5x','1.1x','5x','50&50'
];

// --- Base settings
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

// --- Static files from ./public (Render)
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".json")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
  }
}));


// ==============================
// CASES GLOBAL HISTORY (in-memory)
// ==============================
// NOTE: This is per-server-instance. If you need persistence across restarts or
// multiple instances, move this to Postgres.
const CASES_HISTORY_MAX = 20;
const casesHistory = []; // newest first

function clampHistoryLimit(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return CASES_HISTORY_MAX;
  return Math.max(1, Math.min(CASES_HISTORY_MAX, Math.floor(v)));
}

function safeShortText(s, max = 48) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

function safePath(p) {
  const t = String(p ?? "").trim();
  // allow only local images under /images/
  if (!t.startsWith("/images/")) return "";
  // avoid accidental protocols
  if (t.includes("://")) return "";
  return t;
}

function pushCasesHistory(entry) {
  casesHistory.unshift(entry);
  if (casesHistory.length > CASES_HISTORY_MAX) casesHistory.length = CASES_HISTORY_MAX;
}

// GET latest case drops
app.get("/api/cases/history", (req, res) => {
  const limit = clampHistoryLimit(req.query.limit);
  return res.json({ ok: true, items: casesHistory.slice(0, limit) });
});

// POST one or multiple history entries
app.post("/api/cases/history", (req, res) => {
  try {
    const { userId, initData, entries } = req.body || {};

    // Optional initData verification (same pattern as other endpoints)
    if (initData && process.env.BOT_TOKEN) {
      const check = verifyInitData(initData, process.env.BOT_TOKEN, 300);
      if (!check.ok) return res.status(403).json({ ok: false, error: "Invalid initData" });
    }

    const list = Array.isArray(entries) ? entries : (req.body && typeof req.body === "object" ? [req.body] : []);
    const now = Date.now();

    for (const raw of list) {
      if (!raw) continue;
      const u = raw.user || {};
      const clean = {
        id: safeShortText(raw.id || crypto.randomUUID(), 96),
        ts: Number.isFinite(+raw.ts) ? +raw.ts : now,
        user: {
          id: safeShortText(u.id || userId || raw.userId || "", 64),
          name: safeShortText(u.name || raw.userName || "", 48),
          username: safeShortText(u.username || raw.username || "", 48)
        },
        caseId: safeShortText(raw.caseId || "", 32),
        caseName: safeShortText(raw.caseName || "", 48),
        drop: {
          id: safeShortText(raw.drop?.id || raw.itemId || "", 48),
          type: safeShortText(raw.drop?.type || raw.itemType || "", 16),
          icon: safePath(raw.drop?.icon || raw.itemIcon || ""),
          label: safeShortText(raw.drop?.label || raw.itemLabel || raw.drop?.id || raw.itemId || "", 48)
        }
      };

      // minimal sanity: must have caseId and drop id/icon
      if (!clean.caseId || !clean.drop.id) continue;
      pushCasesHistory(clean);
    }

    return res.json({ ok: true, items: casesHistory.slice(0, CASES_HISTORY_MAX) });
  } catch (e) {
    console.error("[cases.history]", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});


// ====== INVENTORY (Postgres) ======
// Inventory is persisted in Postgres via database-pg.js.
// Endpoints return { items, nfts } for backward compatibility.

async function inventoryGet(userId) {
  if (typeof db.getUserInventory === "function") return await db.getUserInventory(userId);
  return [];
}

async function inventoryAdd(userId, items, claimId) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { added: 0, items: await inventoryGet(userId), duplicated: false };

  if (typeof db.addInventoryItems === "function") {
    const prev = await inventoryGet(userId);
    const next = await db.addInventoryItems(userId, list, claimId || null);
    // best-effort: added = delta length (may be 0 if claimId duplicated)
    const added = Math.max(0, (next?.length || 0) - (prev?.length || 0));
    return { added, items: next || [], duplicated: (added === 0 && !!claimId) };
  }

  // Fallback: no inventory support in current DB driver
  return { added: 0, items: await inventoryGet(userId), duplicated: false };
}

async function inventorySell(userId, instanceIds, currency) {
  const ids = Array.isArray(instanceIds) ? instanceIds.map(String) : [];
  const cur = (currency === "stars") ? "stars" : "ton";
  if (!ids.length) return { ok: false, sold: 0, amount: 0, newBalance: null, items: await inventoryGet(userId) };

  if (typeof db.sellInventoryItems === "function") {
    const res = await db.sellInventoryItems(userId, ids, cur);
    const items = await inventoryGet(userId);
    return { ok: true, currency: cur, ...res, items, nfts: items };
  }

  return { ok: true, currency: cur, sold: 0, amount: 0, newBalance: null, items: await inventoryGet(userId), nfts: await inventoryGet(userId) };
}

// GET inventory (NFTs) for a user
app.get("/api/user/inventory", async (req, res) => {
  try {
    const userId = String(req.query.userId || "");
    if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
    const items = await inventoryGet(userId);
    return res.json({ ok: true, items, nfts: items });
  } catch (e) {
    console.error("[Inventory] get error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});

// Add won NFTs to inventory (idempotent via claimId)
app.post("/api/inventory/nft/add", async (req, res) => {
  try {
    const { userId, initData, items, item, claimId } = req.body || {};
    const uid = String(userId || "");
    if (!uid) return res.status(400).json({ ok: false, error: "userId required" });

    // Optional: verify initData (if provided)
    if (initData && process.env.BOT_TOKEN) {
      const check = verifyInitData(initData, process.env.BOT_TOKEN, 300);
      if (!check.ok) return res.status(403).json({ ok: false, error: "Bad initData" });
    }

    const list = Array.isArray(items) ? items : (item ? [item] : []);
    if (!list.length) return res.status(400).json({ ok: false, error: "items required" });

    const result = await inventoryAdd(uid, list, claimId);
    return res.json({ ok: true, added: result.added, items: result.items, nfts: result.items, duplicated: !!result.duplicated });
  } catch (e) {
    console.error("[Inventory] add error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});

// Compatibility: front-end uses /api/inventory/add
app.post("/api/inventory/add", async (req, res) => {
  try {
    const { userId, initData, items, item, claimId } = req.body || {};
    const uid = String(userId || "");
    if (!uid) return res.status(400).json({ ok: false, error: "userId required" });

    if (initData && process.env.BOT_TOKEN) {
      const check = verifyInitData(initData, process.env.BOT_TOKEN, 300);
      if (!check.ok) return res.status(403).json({ ok: false, error: "Bad initData" });
    }

    const list = Array.isArray(items) ? items : (item ? [item] : []);
    if (!list.length) return res.status(400).json({ ok: false, error: "items required" });

    const result = await inventoryAdd(uid, list, claimId);
    return res.json({ ok: true, added: result.added, items: result.items, nfts: result.items, duplicated: !!result.duplicated });
  } catch (e) {
    console.error("[Inventory] add error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});

// Sell selected NFTs from inventory -> credit balance
app.post("/api/inventory/sell", async (req, res) => {
  try {
    const { userId, instanceIds, currency } = req.body || {};
    const uid = String(userId || "");
    if (!uid) return res.status(400).json({ ok: false, error: "userId required" });

    const ids = Array.isArray(instanceIds) ? instanceIds.map(String) : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: "instanceIds required" });

    const result = await inventorySell(uid, ids, currency);
    return res.json(result);
  } catch (e) {
    console.error("[Inventory] sell error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});

// Sell ALL NFTs
app.post("/api/inventory/sell-all", async (req, res) => {
  try {
    const { userId, currency } = req.body || {};
    const uid = String(userId || "");
    if (!uid) return res.status(400).json({ ok: false, error: "userId required" });

    const items = await inventoryGet(uid);
    const ids = items.map(it => it?.instanceId).filter(Boolean).map(String);
    if (!ids.length) return res.json({ ok: true, sold: 0, amount: 0, currency: (currency === "stars") ? "stars" : "ton", items: [], nfts: [] });

    const result = await inventorySell(uid, ids, currency);
    return res.json(result);
  } catch (e) {
    console.error("[Inventory] sell-all error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});

// Admin: add gifts to inventory (optional). If ADMIN_KEY is set, require header x-admin-key.
app.post("/api/admin/inventory/add", async (req, res) => {
  try {
    const adminKey = process.env.ADMIN_KEY;
    if (adminKey) {
      const hdr = String(req.headers["x-admin-key"] || "");
      if (hdr !== adminKey) return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const { userId, items, item, claimId } = req.body || {};
    const uid = String(userId || "");
    if (!uid) return res.status(400).json({ ok: false, error: "userId required" });

    const list = Array.isArray(items) ? items : (item ? [item] : []);
    if (!list.length) return res.status(400).json({ ok: false, error: "items required" });

    const result = await inventoryAdd(uid, list, claimId || `admin_${Date.now()}`);
    return res.json({ ok: true, added: result.added, items: result.items, nfts: result.items });
  } catch (e) {
    console.error("[Admin Inventory] add error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});

// ====== DEPOSIT NOTIFICATION ======
app.post("/api/deposit-notification", async (req, res) => {
  try {
    const { amount, currency, userId, txHash, timestamp, initData, invoiceId, depositId: bodyDepositId, type, roundId, bets, notify } = req.body;
    
    const depositId = bodyDepositId || invoiceId || txHash || `${userId}_${currency}_${Math.abs(amount)}_${timestamp}`;
    
    console.log('[Deposit] Notification received:', {
      amount,
      currency,
      userId,
      type: type || 'deposit',
      depositId: depositId?.substring(0, 20) + '...',
      timestamp
    });

    // 🔥 Idempotency: dedupe deposits AND wheel bets/wins (even for negative amounts)
    const shouldDedupe = !!depositId && (amount > 0 || type === 'wheel_bet' || type === 'wheel_win' || type === 'bet');

    if (shouldDedupe && isDepositProcessed(depositId)) {
      console.log('[Deposit] ⚠️ Duplicate detected, skipping:', depositId);
      return res.json({ 
        ok: true, 
        message: 'Already processed',
        duplicate: true
      });
    }

    // Validation
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'User ID required' });
    }

    // 🔥 Разрешаем отрицательные суммы (списание)
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum === 0) {
      return res.status(400).json({ ok: false, error: 'Invalid amount' });
    }

    if (!currency || !['ton', 'stars'].includes(currency)) {
      return res.status(400).json({ ok: false, error: 'Invalid currency' });
    }

    // Extract user data from initData
    let user = null;
    if (initData) {
      const check = verifyInitData(initData, process.env.BOT_TOKEN, 300);
      if (check.ok && check.params.user) {
        try { 
          user = JSON.parse(check.params.user);
          await db.saveUser(user);
          console.log('[Deposit] User saved:', user.id);
        } catch (err) {
          console.error('[Deposit] Failed to parse user:', err);
        }
      }
    }

    // 🔥 Mark as processed (same rule as dedupe)
    if (shouldDedupe) {
      markDepositProcessed(depositId);
    }

    // Send Telegram message ONLY for real deposits (not case wins / wheel / etc.)
    const shouldSendDepositMessage =
      notify !== false &&
      amount > 0 &&
      process.env.BOT_TOKEN &&
      (type === 'deposit' || (!type && (txHash || invoiceId)));

    // Process transaction
    try {
      if (currency === 'ton') {
        const newBalance = await db.updateBalance(
          userId,
          'ton',
          parseFloat(amount),
          type || 'deposit',
          generateDescription(type, amount, txHash, roundId),
          { txHash, roundId, bets: bets ? JSON.stringify(bets) : null }
        );
        
        console.log('[Deposit] ✅ TON balance updated:', { userId, amount, newBalance });
        
        // 🔥 BROADCAST BALANCE UPDATE
        broadcastBalanceUpdate(userId);
        
        // Send notification only for real deposits
        if (shouldSendDepositMessage) {
          await sendTelegramMessage(userId, `✅ Deposit confirmed!\n\nYou received ${amount} TON`);
        }
        
        return res.json({ 
          ok: true, 
          message: amount > 0 ? 'TON deposit processed' : 'TON deducted',
          newBalance: newBalance,
          amount: amount
        });
        
      } else if (currency === 'stars') {
        const newBalance = await db.updateBalance(
          userId,
          'stars',
          parseInt(amount),
          type || 'deposit',
          generateDescription(type, amount, null, roundId),
          { invoiceId: depositId, roundId, bets: bets ? JSON.stringify(bets) : null }
        );
        
        console.log('[Deposit] ✅ Stars balance updated:', { userId, amount, newBalance });
        
        // 🔥 BROADCAST BALANCE UPDATE
        broadcastBalanceUpdate(userId);
        
        // Send notification only for real deposits
        if (shouldSendDepositMessage) {
          await sendTelegramMessage(userId, `✅ Payment successful!\n\nYou received ${amount} ⭐ Stars`);
        }
        
        return res.json({ 
          ok: true, 
          message: amount > 0 ? 'Stars deposit processed' : 'Stars deducted',
          newBalance: newBalance,
          amount: amount
        });
      }
      
    } catch (err) {
      console.error('[Deposit] Error updating balance:', err);
      // Remove from processed if failed
      if (amount > 0) {
        processedDeposits.delete(depositId);
      }
      
      return res.status(500).json({ 
        ok: false, 
        error: 'Failed to update balance',
        details: err.message 
      });
    }

  } catch (error) {
    console.error('[Deposit] Error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Internal server error'
    });
  }
});

// 🔥 Helper: Generate transaction description
function generateDescription(type, amount, txHash, roundId) {
  switch (type) {
    case 'wheel_bet':
      return `Wheel bet${roundId ? ` (${roundId})` : ''}`;
    case 'wheel_win':
      return `Wheel win${roundId ? ` (${roundId})` : ''}`;
    case 'deposit':
      if (txHash) {
        return `TON deposit ${txHash.substring(0, 10)}...`;
      }
      return amount > 0 ? 'Deposit' : 'Withdrawal';
    default:
      return amount > 0 ? 'Deposit' : 'Withdrawal';
  }
}
// ====== SSE для автообновления баланса ======
const balanceClients = new Map(); // userId -> Set of response objects

app.get("/api/balance/stream", async (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  console.log('[SSE] Client connected:', userId);
  
  // Add client to list
  if (!balanceClients.has(userId)) {
    balanceClients.set(userId, new Set());
  }
  balanceClients.get(userId).add(res);
  
  // Send initial balance
  try {
    const balance = await db.getUserBalance(parseInt(userId));
    res.write(`data: ${JSON.stringify({
      type: 'balance',
      ton: parseFloat(balance.ton_balance) || 0,
      stars: parseInt(balance.stars_balance) || 0,
      timestamp: Date.now()
    })}\n\n`);
  } catch (err) {
    console.error('[SSE] Error sending initial balance:', err);
  }
  
  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000); // Every 30 seconds
  
  // Cleanup on disconnect
  req.on('close', () => {
    console.log('[SSE] Client disconnected:', userId);
    clearInterval(heartbeat);
    const clients = balanceClients.get(userId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        balanceClients.delete(userId);
      }
    }
  });
});

// Function to broadcast balance updates
async function broadcastBalanceUpdate(userId) {
  const clients = balanceClients.get(String(userId));
  if (!clients || clients.size === 0) {
    console.log('[SSE] No clients to notify for user:', userId);
    return;
  }
  
  console.log('[SSE] Broadcasting update to', clients.size, 'clients for user:', userId);
  
  // Get full balance
  try {
    const balance = await db.getUserBalance(parseInt(userId, 10));
    const data = JSON.stringify({
      type: 'balance',
      ton: parseFloat(balance.ton_balance) || 0,
      stars: parseInt(balance.stars_balance) || 0,
      timestamp: Date.now()
    });
    
    clients.forEach(client => {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (err) {
        console.error('[SSE] Error sending to client:', err);
        clients.delete(client);
      }
    });
  } catch (err) {
    console.error('[SSE] Error broadcasting:', err);
  }
}

// ====== DEPOSIT TRACKING (prevent duplicates) ======
const processedDeposits = new Map(); // invoiceId/txHash -> timestamp

function isDepositProcessed(identifier) {
  if (!identifier) return false;
  
  // Clean old entries (older than 10 minutes)
  const now = Date.now();
  for (const [key, timestamp] of processedDeposits.entries()) {
    if (now - timestamp > 600000) {
      processedDeposits.delete(key);
    }
  }
  
  return processedDeposits.has(identifier);
}

function markDepositProcessed(identifier) {
  if (identifier) {
    processedDeposits.set(identifier, Date.now());
  }
}

// ====== BALANCE API ======
app.get("/api/balance", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: 'User ID is required'
      });
    }

    console.log('[Balance] Request for user:', userId);

    // 🔥 FIX: Handle guest users
    if (userId === 'guest' || isNaN(parseInt(userId))) {
      console.log('[Balance] Guest user, returning zero balance');
      return res.json({
        ok: true,
        userId: userId,
        ton: 0,
        stars: 0,
        updatedAt: Math.floor(Date.now() / 1000)
      });
    }

    const balance = await db.getUserBalance(parseInt(userId));

    console.log('[Balance] ✅ Retrieved:', balance);

    res.json({
      ok: true,
      userId: parseInt(userId),
      ton: parseFloat(balance.ton_balance) || 0,
      stars: parseInt(balance.stars_balance) || 0,
      updatedAt: balance.updated_at
    });

  } catch (error) {
    console.error('[Balance] ❌ Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get balance'
    });
  }
});



// ====== STARS PAYMENT API ======
app.post("/api/stars/create-invoice", async (req, res) => {
  try {
    const { amount, userId } = req.body;

    console.log('[Stars API] Creating invoice:', { amount, userId });

    if (!amount || amount < 1) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid amount. Minimum is 1 Star'
      });
    }

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: 'User ID is required'
      });
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      console.error('[Stars API] Bot token not configured!');
      return res.status(500).json({
        ok: false,
        error: 'Payment system not configured'
      });
    }

    const payload = `stars_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${amount} Telegram Stars`,
          description: `Top up your WildGift balance`,
          payload: payload,
          provider_token: '',
          currency: 'XTR',
          prices: [
            {
              label: `${amount} Stars`,
              amount: amount
            }
          ]
        })
      }
    );

    const invoiceData = await telegramResponse.json();

    console.log('[Stars API] Telegram response:', invoiceData);

    if (!invoiceData.ok) {
      const errorMsg = invoiceData.description || 'Failed to create invoice';
      console.error('[Stars API] Error:', errorMsg);
      return res.status(500).json({
        ok: false,
        error: errorMsg
      });
    }

    res.json({
      ok: true,
      invoiceLink: invoiceData.result,
      invoiceId: payload,
      amount: amount
    });

  } catch (error) {
    console.error('[Stars API] Error creating invoice:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error'
    });
  }
});

// ====== STARS WEBHOOK ======
app.post("/api/stars/webhook", async (req, res) => {
  try {
    const update = req.body;

    console.log('[Stars Webhook] Received update:', JSON.stringify(update, null, 2));

    // Handle pre_checkout_query
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const BOT_TOKEN = process.env.BOT_TOKEN;

      console.log('[Stars Webhook] Pre-checkout query:', query.id);

      await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pre_checkout_query_id: query.id,
            ok: true
          })
        }
      );

      return res.json({ ok: true });
    }

    // Handle successful_payment
    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const userId = update.message.from.id;
      const userFrom = update.message.from;

      console.log('[Stars Webhook] Successful payment:', {
        userId,
        amount: payment.total_amount,
        payload: payment.invoice_payload,
        telegramPaymentChargeId: payment.telegram_payment_charge_id
      });

      await db.saveUser(userFrom);

      try {
        const newBalance = await db.updateBalance(
          userId,
          'stars',
          payment.total_amount,
          'deposit',
          `Stars payment ${payment.telegram_payment_charge_id}`,
          { invoiceId: payment.invoice_payload }
        );

        console.log('[Stars Webhook] Balance updated:', { userId, newBalance });
        
        await sendTelegramMessage(
          userId, 
          `✅ Payment successful!\n\nYou received ${payment.total_amount} ⭐ Stars`
        );
        
      } catch (err) {
        console.error('[Stars Webhook] Error updating balance:', err);
      }

      res.json({ ok: true });
    } else {
      res.json({ ok: true, message: 'Not a payment update' });
    }

  } catch (error) {
    console.error('[Stars Webhook] Error processing webhook:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ====== USER PROFILE API ======
app.get("/api/user/profile", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: 'User ID is required'
      });
    }

    const user = await db.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'User not found'
      });
    }

    res.json({
      ok: true,
      user: {
        id: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        isPremium: user.is_premium === 1,
        tonBalance: user.ton_balance || 0,
        starsBalance: user.stars_balance || 0,
        createdAt: user.created_at,
        lastSeen: user.last_seen
      }
    });

  } catch (error) {
    console.error('[Profile] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get profile'
    });
  }
});

// ====== USER STATS API ======
app.get("/api/user/stats", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: 'User ID is required'
      });
    }

    const stats = await db.getUserStats(userId);

    res.json({
      ok: true,
      stats: {
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        totalWon: stats.total_won || 0,
        totalWagered: stats.total_wagered || 0,
        totalBets: stats.total_bets || 0,
        winRate: stats.total_bets > 0 ? ((stats.wins / stats.total_bets) * 100).toFixed(1) : 0
      }
    });

  } catch (error) {
    console.error('[Stats] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get stats'
    });
  }
});

// ====== TRANSACTION HISTORY API ======
app.get("/api/user/transactions", async (req, res) => {
  try {
    const { userId, limit } = req.query;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: 'User ID is required'
      });
    }

    const transactions = await db.getTransactionHistory(userId, parseInt(limit) || 50);

    res.json({
      ok: true,
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        currency: tx.currency,
        amount: tx.amount,
        balanceBefore: tx.balance_before,
        balanceAfter: tx.balance_after,
        description: tx.description,
        txHash: tx.tx_hash,
        invoiceId: tx.invoice_id,
        createdAt: tx.created_at
      }))
    });

  } catch (error) {
    console.error('[Transactions] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get transactions'
    });
  }
});

// ====== WHEEL ROUND API ======
app.get("/api/round/start", async (req, res) => {
  try {
    const sliceIndex = Math.floor(Math.random() * WHEEL_ORDER.length);
    const type = WHEEL_ORDER[sliceIndex];
    
    console.log('[Round API] Generated:', { sliceIndex, type });
    
    res.json({
      ok: true,
      sliceIndex: sliceIndex,
      type: type,
      serverSeed: crypto.randomBytes(16).toString("hex"),
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[Round API] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to generate round'
    });
  }
});

// ====== PLACE BET ======
app.post("/api/round/place-bet", async (req, res) => {
  try {
    const { bets, currency, roundId, initData } = req.body || {};
    
    // Check authorization
    const check = verifyInitData(initData, process.env.BOT_TOKEN, 300);
    if (!check.ok) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    let user = null;
    if (check.params.user) {
      try { user = JSON.parse(check.params.user); } catch {}
    }
    const userId = user?.id;

    if (!userId) {
      return res.status(400).json({ ok: false, error: "User ID required" });
    }

    if (!bets || typeof bets !== 'object') {
      return res.status(400).json({ ok: false, error: "Invalid bets format" });
    }

    if (!currency || !['ton', 'stars'].includes(currency)) {
      return res.status(400).json({ ok: false, error: "Invalid currency" });
    }

    // Calculate total bet amount
    const totalAmount = Object.values(bets).reduce((sum, amount) => sum + parseFloat(amount || 0), 0);

    if (totalAmount <= 0) {
      return res.status(400).json({ ok: false, error: "Bet amount must be greater than 0" });
    }

    console.log('[Bets] Received:', { userId, bets, currency, totalAmount, roundId });

    // Save user
    await db.saveUser(user);

    // Check balance
    const balance = await db.getUserBalance(parseInt(userId, 10));
    const currentBalance = currency === 'ton' ? balance.ton_balance : balance.stars_balance;

    if (currentBalance < totalAmount) {
      return res.status(400).json({ 
        ok: false, 
        error: "Insufficient balance",
        currentBalance,
        required: totalAmount
      });
    }

    // Create bet in DB
    const betId = await db.createBet(userId, roundId || `round_${Date.now()}`, bets, totalAmount, currency);

    // Get new balance
    const newBalance = await db.getUserBalance(userId);

    res.json({
      ok: true,
      userId,
      betId,
      bets,
      totalAmount,
      currency,
      balance: {
        ton: newBalance.ton_balance,
        stars: newBalance.stars_balance
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[Bets] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to place bet'
    });
  }
});
// ============================================
// 🧪 TEST BALANCE SYSTEM
// Добавь эти эндпоинты в server.js ПЕРЕД строкой "// ====== SPA fallback ======"
// ============================================

// 🎁 ДАТЬ ТЕСТОВЫЕ ДЕНЬГИ (только в development)
app.post("/api/test/give-balance", async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'This endpoint is disabled in production' });
    }

    const { userId, ton, stars } = req.body;
    const uid = parseInt(userId, 10);
    if (!userId || Number.isNaN(uid)) {
      return res.status(400).json({ ok: false, error: 'Numeric user ID is required' });
    }

    // ensure user exists for FK
    try {
      await db.saveUser({
        id: uid,
        is_bot: false,
        first_name: 'Test',
        last_name: '',
        username: 'tester',
        language_code: 'en',
        is_premium: false
      });
    } catch (e) { /* ok: уже есть */ }

    console.log('[TEST] 🎁 Giving test balance:', { userId: uid, ton, stars });

    let results = {};

    if (ton && ton > 0) {
      const newTonBalance = await db.updateBalance(
        uid,
        'ton',
        parseFloat(ton),
        'test',
        '🧪 Test TON deposit',
        { test: true }
      );
      results.ton = newTonBalance;
      console.log('[TEST] ✅ Added TON:', newTonBalance);
    }

    if (stars && stars > 0) {
      const newStarsBalance = await db.updateBalance(
        uid,
        'stars',
        parseInt(stars, 10),
        'test',
        '🧪 Test Stars deposit',
        { test: true }
      );
      results.stars = newStarsBalance;
      console.log('[TEST] ✅ Added Stars:', newStarsBalance);
    }

    if (ton || stars) {
      broadcastBalanceUpdate(uid);
    }

    const finalBalance = await db.getUserBalance(uid);

    res.json({
      ok: true,
      message: 'Test balance added successfully',
      balance: {
        ton: parseFloat(finalBalance.ton_balance) || 0,
        stars: parseInt(finalBalance.stars_balance) || 0
      },
      added: {
        ton: ton || 0,
        stars: stars || 0
      }
    });

  } catch (error) {
    console.error('[TEST] Error giving balance:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to give test balance' });
  }
});

// 🔄 СБРОСИТЬ БАЛАНС (только в development)
app.post("/api/test/reset-balance", async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'This endpoint is disabled in production' });
    }

    const { userId } = req.body;
    const uid = parseInt(userId, 10);
    if (!userId || Number.isNaN(uid)) {
      return res.status(400).json({ ok: false, error: 'Numeric user ID is required' });
    }

    // ensure user exists (на случай чистой БД)
    try {
      await db.saveUser({
        id: uid,
        is_bot: false,
        first_name: 'Test',
        last_name: '',
        username: 'tester',
        language_code: 'en',
        is_premium: false
      });
    } catch (e) {}

    console.log('[TEST] 🔄 Resetting balance for user:', uid);

    // Reset to zero via deltas (updateBalance adds, so we subtract current)
    const current = await db.getUserBalance(uid);
    const curTon = parseFloat(current.ton_balance) || 0;
    const curStars = parseInt(current.stars_balance) || 0;

    if (curTon !== 0) {
      await db.updateBalance(uid, 'ton', -curTon, 'test', '🧪 Balance reset (TON→0)', { test: true, reset: true });
    }
    if (curStars !== 0) {
      await db.updateBalance(uid, 'stars', -curStars, 'test', '🧪 Balance reset (Stars→0)', { test: true, reset: true });
    }

    broadcastBalanceUpdate(uid);

    const finalBalance = await db.getUserBalance(uid);
    res.json({
      ok: true,
      message: 'Balance reset to 0',
      balance: {
        ton: parseFloat(finalBalance.ton_balance) || 0,
        stars: parseInt(finalBalance.stars_balance) || 0
      }
    });
  } catch (error) {
    console.error('[TEST] Error resetting balance:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to reset balance' });
  }
});


// 💰 УСТАНОВИТЬ ТОЧНЫЙ БАЛАНС (только в development)
app.post("/api/test/set-balance", async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'This endpoint is disabled in production' });
    }

    const { userId, ton, stars } = req.body;
    const uid = parseInt(userId, 10);
    if (!userId || Number.isNaN(uid)) {
      return res.status(400).json({ ok: false, error: 'Numeric user ID is required' });
    }

    // ensure user exists (для FK)
    try {
      await db.saveUser({
        id: uid,
        is_bot: false,
        first_name: 'Test',
        last_name: '',
        username: 'tester',
        language_code: 'en',
        is_premium: false
      });
    } catch (e) {}

    console.log('[TEST] 💰 Setting exact balance:', { userId: uid, ton, stars });

    const currentBalance = await db.getUserBalance(uid);
    let results = {};

    if (ton !== undefined) {
      const currentTon = parseFloat(currentBalance.ton_balance) || 0;
      const diff = parseFloat(ton) - currentTon;
      if (diff !== 0) {
        results.ton = await db.updateBalance(
          uid, 'ton', diff, 'test', `🧪 Set TON balance to ${ton}`, { test: true, setBalance: true }
        );
      } else {
        results.ton = currentTon;
      }
    }

    if (stars !== undefined) {
      const currentStars = parseInt(currentBalance.stars_balance) || 0;
      const diff = parseInt(stars, 10) - currentStars;
      if (diff !== 0) {
        results.stars = await db.updateBalance(
          uid, 'stars', diff, 'test', `🧪 Set Stars balance to ${stars}`, { test: true, setBalance: true }
        );
      } else {
        results.stars = currentStars;
      }
    }

    broadcastBalanceUpdate(uid);

    const finalBalance = await db.getUserBalance(uid);
    res.json({
      ok: true,
      message: 'Balance set successfully',
      balance: {
        ton: parseFloat(finalBalance.ton_balance) || 0,
        stars: parseInt(finalBalance.stars_balance) || 0
      }
    });
  } catch (error) {
    console.error('[TEST] Error setting balance:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to set balance' });
  }
});


// 📊 ПОЛУЧИТЬ ИНФОРМАЦИЮ О ТЕСТОВОМ РЕЖИМЕ
app.get("/api/test/info", async (req, res) => {
  res.json({
    ok: true,
    testMode: process.env.NODE_ENV !== 'production',
    environment: process.env.NODE_ENV || 'development',
    endpoints: process.env.NODE_ENV !== 'production' ? {
      giveBalance: 'POST /api/test/give-balance',
      resetBalance: 'POST /api/test/reset-balance',
      setBalance: 'POST /api/test/set-balance'
    } : null,
    message: process.env.NODE_ENV === 'production' 
      ? 'Test endpoints are disabled in production' 
      : 'Test endpoints are available'
  });
});

// ====== SPA fallback ======
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path === "/tonconnect-manifest.json") {
    return next();
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ====== Error handling ======
app.use((err, req, res, next) => {
  console.error('[Server] Error:', err);
  res.status(500).json({
    ok: false,
    error: err.message || 'Internal server error'
  });
});

// ====== START ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🎮 WildGift Server Running          ║
║   Port: ${PORT}                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}      ║
╚═══════════════════════════════════════╝
  `);
  
  if (!process.env.BOT_TOKEN) {
    console.warn('⚠️  WARNING: BOT_TOKEN not set in .env');
    console.warn('   Stars payments will not work!');
  } else {
    console.log('✅ BOT_TOKEN configured');
  }
  
  console.log(`✅ Wheel configured with ${WHEEL_ORDER.length} segments`);
});

// ========== HELPERS ==========
function baseUrlFrom(req) {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  const host  = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

// Verify Telegram initData
function verifyInitData(initDataStr, botToken, maxAgeSeconds = 300) {
  try {
    if (!initDataStr || !botToken) return { ok: false, params: {} };

    const params = new URLSearchParams(initDataStr);
    const hash = params.get("hash");
    params.delete("hash");

    // Check validity
    const authDate = Number(params.get("auth_date"));
    if (!Number.isNaN(authDate)) {
      const age = Date.now() / 1000 - authDate;
      if (age > maxAgeSeconds) return { ok: false, params: {} };
    }

    const dataCheckString = [...params.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calcHash  = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    const ok = hash && crypto.timingSafeEqual(Buffer.from(calcHash, "hex"), Buffer.from(hash, "hex"));
    return { ok, params: Object.fromEntries(params.entries()) };
  } catch {
    return { ok: false, params: {} };
  }
}

// Send Telegram message
async function sendTelegramMessage(chatId, text) {
  if (!process.env.BOT_TOKEN) return;
  
  try {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('[Telegram] Failed to send message:', err);
  }
}
