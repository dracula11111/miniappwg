// server.js 
// IMPORTANT (ESM): .env must be loaded BEFORE importing database-pg.js, otherwise it will see empty process.env.

import "dotenv/config";

import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { Address, Cell } from "@ton/core";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { createServer } from 'http';
import { priceManager } from "./services/price-manager.js";

// We import Postgres DB module dynamically AFTER dotenv has loaded.
// This fixes the common issue when database-pg.js reads process.env during module initialization.
let dbReal = null;
function rotateServerSeed() {
  crashGame.prevServerSeed = crashGame.serverSeed;
  crashGame.serverSeed = crypto.randomBytes(32).toString("hex");
}

// =====================
// ENV / DB MODE
// =====================
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
// In non-prod, set TEST_MODE=1 to make DB non-persistent (in-memory only)
const IS_TEST = !IS_PROD && process.env.TEST_MODE === "1";
const TEST_API_ENABLED = !IS_PROD && /^(1|true|yes)$/i.test(String(process.env.TEST_API_ENABLED || ""));
const CASES_BROWSER_PLAY_ENABLED = /^(1|true|yes)$/i.test(String(process.env.CASES_BROWSER_PLAY_ENABLED || ""));
// Manual frontend test toggle (wheel/cases demo behavior). Change true/false here when needed.
const FRONTEND_TEST_MODE = false;
const DEFAULT_NOTIFY_EMOJI_ID_TON = "5239983985156703956";
const DEFAULT_NOTIFY_EMOJI_ID_STARS = "6005661956931850799";
const DEFAULT_WELCOME_EMOJI_ID = "5330356071364046086";
const DEFAULT_WELCOME_CTA_EMOJI_ID = "5470177992950946662";
const DEFAULT_WELCOME_BUTTON_TEXT = "Claim gifts";
const DEFAULT_WELCOME_BUTTON_STYLE = "danger";
const DEFAULT_WELCOME_STARTAPP_URL = "https://t.me/wildgiftrobot?startapp=1";
const DEFAULT_WELCOME_PHOTO_URL = "https://ibb.co/vFzkMcg";
const DEFAULT_WELCOME_PHOTO_PATH = "/images/bot/startNtf.png";
// Temporary safety lock: allow market buy/withdraw only for relayer admins.
const ADMIN_ONLY_TRADING_MODE = !/^(0|false|no)$/i.test(String(process.env.ADMIN_ONLY_TRADING_MODE || "1"));

function getTonDepositNotifyCustomEmojiId() {
  return String(
    process.env.TG_NOTIFY_DEPOSIT_EMOJI_ID ||
    process.env.TG_NOTIFY_EMOJI_ID ||
    DEFAULT_NOTIFY_EMOJI_ID_TON
  ).trim();
}

function getStarsDepositNotifyCustomEmojiId() {
  return String(
    process.env.TG_NOTIFY_STARS_EMOJI_ID ||
    process.env.TG_NOTIFY_EMOJI_ID ||
    DEFAULT_NOTIFY_EMOJI_ID_STARS
  ).trim();
}

const RUSSIAN_UI_LANGUAGE_CODES = new Set(["ru", "uk", "be", "kk"]);
const RUSSIAN_UI_REGION_CODES = new Set(["RU", "BY", "KZ", "UA"]);

function normalizeUiLanguageCode(localeValue) {
  const raw = String(localeValue || "").trim();
  if (!raw) return null;

  const parts = raw.replace(/_/g, "-").split("-").filter(Boolean);
  const lang = String(parts[0] || "").toLowerCase();
  const region = String(parts[1] || "").toUpperCase();

  if (region) {
    return RUSSIAN_UI_REGION_CODES.has(region) ? "ru" : "en";
  }
  if (RUSSIAN_UI_LANGUAGE_CODES.has(lang)) return "ru";
  return "en";
}

function normalizeExplicitUiLanguageCode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("ru")) return "ru";
  if (raw.startsWith("en")) return "en";
  return null;
}

function resolveUserUiLanguagePreference(dbUser, tgUser = null) {
  const manualLanguage = normalizeExplicitUiLanguageCode(dbUser?.ui_language);
  if (manualLanguage) {
    return { language: manualLanguage, source: "manual", manualLanguage };
  }

  const profileLanguage = normalizeUiLanguageCode(dbUser?.language_code);
  if (profileLanguage) {
    return { language: profileLanguage, source: "telegram_profile", manualLanguage: null };
  }

  const telegramLiveLanguage = normalizeUiLanguageCode(
    tgUser?.language_code ?? tgUser?.languageCode
  );
  if (telegramLiveLanguage) {
    return { language: telegramLiveLanguage, source: "telegram_live", manualLanguage: null };
  }

  return { language: "en", source: "fallback", manualLanguage: null };
}

// ---- Memory DB (per-process; resets on restart). Used only when IS_TEST === true ----
function createMemoryDb() {
  const users = new Map();    // telegram_id(string) -> user
  const balances = new Map(); // telegram_id(string) -> { ton_balance, stars_balance, updated_at }
  const txs = new Map();      // telegram_id(string) -> tx[]
  const promoCodes = new Map(); // code(lower) -> { reward_stars, reward_ton, max_uses, used_count }
  const promoRedemptions = new Map(); // code(lower) -> Set(telegram_id)
  const taskClaims = new Map(); // telegram_id(string) -> Set(taskKey)
  const tonDepositClaims = new Map(); // hash key -> { telegramId, amountTon, txHash, messageHash }
  const webhookEvents = new Map(); // eventKey -> { createdAt, payload }
  const pendingCaseRounds = new Map(); // roundId -> pending/refunded metadata
  const gameRoundMeta = new Map([
    ["crash", { counter: 0, hash: "", updatedAt: Date.now() }],
    ["wheel", { counter: 0, hash: "", updatedAt: Date.now() }]
  ]);
  let techPauseEnabled = 0;
  let techPauseUpdatedAt = Date.now();
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
        ui_language: null,
        is_premium: false,
        ton_balance: "0",
        stars_balance: 0,
        ban: 0,
        created_at: nowSec(),
        last_seen: nowSec(),
      });
    }
    if (!balances.has(k)) {
      balances.set(k, { ton_balance: "0", stars_balance: 0, updated_at: nowSec() });
    }
    if (!txs.has(k)) txs.set(k, []);
    syncUserBalanceSnapshot(k);
    return k;
  }

  function syncUserBalanceSnapshot(k) {
    const u = users.get(k);
    const b = balances.get(k);
    if (!u || !b) return;
    users.set(k, {
      ...u,
      ton_balance: b.ton_balance,
      stars_balance: b.stars_balance
    });
  }

  function addTx(k, t) {
    const list = txs.get(k) || [];
    list.unshift(t);
    txs.set(k, list);
  }

  function normPromo(code) {
    return String(code || "").trim().toLowerCase();
  }

  function normHash(v) {
    const s = String(v || "").replace(/^0x/i, "").trim();
    if (!s || !/^[a-fA-F0-9]{32,128}$/.test(s)) return "";
    return s.toUpperCase();
  }

  function normalizeCaseRoundId(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    if (!/^[A-Za-z0-9:_-]{8,190}$/.test(s)) return "";
    return s;
  }

  function normalizeCaseCurrency(v) {
    return String(v || "").toLowerCase() === "stars" ? "stars" : "ton";
  }

  function normalizeCaseCostByCurrency(v, currency) {
    const cur = normalizeCaseCurrency(currency);
    const raw = Number(v);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (cur === "stars") return Math.max(1, Math.round(raw));
    return Math.max(0.01, Math.round(raw * 100) / 100);
  }

  function normalizeGameRoundMetaKey(value) {
    const keyValue = String(value || "").trim().toLowerCase();
    return keyValue === "crash" || keyValue === "wheel" ? keyValue : "";
  }

  function normalizeGameRoundCounter(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.max(0, Math.trunc(raw));
  }

  function mapPendingCaseRound(row = {}) {
    return {
      roundId: String(row.roundId || ""),
      telegramId: String(row.telegramId || ""),
      currency: normalizeCaseCurrency(row.currency),
      caseCost: Number(row.caseCost || 0),
      openDepositId: row.openDepositId || null,
      status: String(row.status || "pending"),
      resolution: row.resolution || null,
      createdAt: Number(row.createdAt || 0),
      updatedAt: Number(row.updatedAt || 0),
      settledAt: row.settledAt ? Number(row.settledAt || 0) : null,
      refundedAt: row.refundedAt ? Number(row.refundedAt || 0) : null
    };
  }

  return {
    async initDatabase() {
      console.log("[DB] рџ§Є Memory DB enabled (TEST_MODE=1). Nothing will be persisted.");
    },
    async saveUser(userData) {
      const k = ensure(userData?.id ?? userData?.telegram_id ?? userData);
      const u = users.get(k);
      const preferredLanguageCode = normalizeUiLanguageCode(userData?.language_code);
      users.set(k, {
        ...u,
        username: userData?.username ?? u.username,
        first_name: userData?.first_name ?? u.first_name,
        last_name: userData?.last_name ?? u.last_name,
        language_code: u.language_code ?? preferredLanguageCode ?? null,
        is_premium: !!userData?.is_premium,
        ban: Number(userData?.ban) === 1 ? 1 : (u?.ban === 1 ? 1 : 0),
        last_seen: nowSec(),
      });
      return true;
    },
    async setUserUiLanguage(telegramId, language) {
      const k = ensure(telegramId);
      const normalized = normalizeExplicitUiLanguageCode(language);
      if (!normalized) throw new Error("Unsupported UI language");

      const u = users.get(k);
      users.set(k, {
        ...u,
        ui_language: normalized,
        last_seen: nowSec()
      });
      return normalized;
    },
    async getUserById(telegramId) {
      const k = ensure(telegramId);
      const u = users.get(k);
      const b = balances.get(k);
      return { ...u, ...b };
    },
    async listTelegramRecipientsForBroadcast(options = {}) {
      const rawLimit = Number(options?.limit);
      const limit = Number.isFinite(rawLimit)
        ? Math.max(1, Math.min(20000, Math.trunc(rawLimit)))
        : 5000;

      const includeBanned = options?.includeBanned === true;
      const activeAfterSecRaw = Number(options?.activeAfterSec || 0);
      const activeAfterSec = Number.isFinite(activeAfterSecRaw) && activeAfterSecRaw > 0
        ? Math.trunc(activeAfterSecRaw)
        : 0;

      const rows = [];
      for (const [telegramId, user] of users.entries()) {
        const ban = Number(user?.ban || 0);
        if (!includeBanned && ban === 1) continue;

        const lastSeen = Number(user?.last_seen || 0);
        if (activeAfterSec > 0 && (!Number.isFinite(lastSeen) || lastSeen < activeAfterSec)) continue;

        rows.push({
          telegram_id: telegramId,
          username: user?.username || null,
          first_name: user?.first_name || null,
          last_name: user?.last_name || null,
          ban,
          last_seen: Number.isFinite(lastSeen) ? lastSeen : 0
        });
      }

      rows.sort((a, b) => {
        const lsA = Number(a?.last_seen || 0);
        const lsB = Number(b?.last_seen || 0);
        if (lsB !== lsA) return lsB - lsA;
        return String(b?.telegram_id || "").localeCompare(String(a?.telegram_id || ""));
      });

      return rows.slice(0, limit);
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
      syncUserBalanceSnapshot(k);

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
    async applyVerifiedTonDeposit({
      telegramId,
      amountTon,
      txHash,
      messageHash,
      inMsgHash = null
    }) {
      const k = ensure(telegramId);
      const delta = Number(amountTon || 0);
      if (!Number.isFinite(delta) || delta <= 0) throw new Error("Invalid TON deposit amount");

      const txKey = normHash(txHash);
      const msgKey = normHash(messageHash);
      const inKey = normHash(inMsgHash);
      if (!txKey) throw new Error("txHash required");
      if (!msgKey) throw new Error("messageHash required");

      const keys = [txKey, msgKey, inKey].filter(Boolean);
      for (const key of keys) {
        const existing = tonDepositClaims.get(key);
        if (!existing) continue;
        if (String(existing.telegramId) !== String(k)) {
          throw new Error("Deposit already claimed by another user");
        }
        const bal = balances.get(k) || { ton_balance: "0" };
        return { ok: true, duplicate: true, newBalance: Number(bal.ton_balance || 0) };
      }

      const newBalance = await this.updateBalance(
        k,
        "ton",
        delta,
        "deposit",
        `TON deposit ${txKey.slice(0, 10)}...`,
        { txHash: txKey, invoiceId: msgKey }
      );

      const entry = { telegramId: k, amountTon: delta, txHash: txKey, messageHash: msgKey };
      for (const key of keys) tonDepositClaims.set(key, entry);
      return { ok: true, duplicate: false, newBalance: Number(newBalance || 0) };
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
    },
    async getTaskProgressSignals(telegramId, options = {}) {
      const k = ensure(telegramId);
      const list = txs.get(k) || [];
      const minTonRaw = Number(options?.topUpMinTon ?? 0.5);
      const minStarsRaw = Number(options?.topUpMinStars ?? 50);
      const topUpMinTon = Number.isFinite(minTonRaw) && minTonRaw > 0 ? minTonRaw : 0.5;
      const topUpMinStars = Number.isFinite(minStarsRaw) && minStarsRaw > 0 ? Math.max(1, Math.round(minStarsRaw)) : 50;

      let maxTonDeposit = 0;
      let maxStarsDeposit = 0;
      let gameWins = 0;

      for (const tx of list) {
        const type = String(tx?.type || "").toLowerCase();
        const cur = String(tx?.currency || "").toLowerCase();
        const amount = Number(tx?.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        if (type === "deposit") {
          if (cur === "ton") maxTonDeposit = Math.max(maxTonDeposit, amount);
          if (cur === "stars") maxStarsDeposit = Math.max(maxStarsDeposit, amount);
        }

        if (type === "wheel_win" || type === "crash_win") {
          gameWins += 1;
        }
      }

      return {
        topUpMinTon,
        topUpMinStars,
        maxTonDeposit,
        maxStarsDeposit,
        topUpCompleted: maxTonDeposit >= topUpMinTon || maxStarsDeposit >= topUpMinStars,
        gameWins,
        gameWinCompleted: gameWins > 0
      };
    },
    async ensurePromoSeed() {
      const defaults = [
        { code: "WildGiftPromo100", reward_stars: 100, reward_ton: 0, max_uses: Number(process.env.PROMO_WILDGIFT100_MAX ?? 1000) },
        { code: "WildGiftPromo50", reward_stars: 50, reward_ton: 0, max_uses: Number(process.env.PROMO_WILDGIFT50_MAX ?? 500) },
        { code: "sieufhisbfhisbfhbs333", reward_stars: 33333, reward_ton: 333, max_uses: 1 }
      ];

      for (const p of defaults) {
        const key = normPromo(p.code);
        if (!promoCodes.has(key)) {
          promoCodes.set(key, {
            reward_stars: Math.max(0, Math.trunc(Number(p.reward_stars || 0))),
            reward_ton: Number(p.reward_ton || 0),
            max_uses: Math.max(0, Math.trunc(Number(p.max_uses || 0))),
            used_count: 0
          });
        }
      }
      return true;
    },
    async redeemPromocode(telegramId, code) {
      const promoKey = normPromo(code);
      if (!promoKey) return { ok: false, errorCode: "PROMO_EMPTY", error: "promo required" };

      await this.ensurePromoSeed();
      const promo = promoCodes.get(promoKey);
      if (!promo) return { ok: false, errorCode: "PROMO_INVALID", error: "invalid promo" };

      if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) {
        return { ok: false, errorCode: "PROMO_LIMIT_REACHED", error: "limit reached" };
      }

      const uid = ensure(telegramId);
      if (!promoRedemptions.has(promoKey)) promoRedemptions.set(promoKey, new Set());
      const usedBy = promoRedemptions.get(promoKey);
      if (usedBy.has(uid)) return { ok: false, errorCode: "PROMO_ALREADY_REDEEMED", error: "already redeemed" };

      const b = balances.get(uid);
      const added = Math.max(0, Math.trunc(Number(promo.reward_stars || 0)));
      const addedTon = Number(promo.reward_ton || 0);

      const beforeStars = Number(b.stars_balance || 0);
      const beforeTon = Number(b.ton_balance || 0);
      const nextStars = beforeStars + added;
      const nextTon = beforeTon + addedTon;

      b.stars_balance = nextStars;
      b.ton_balance = String(nextTon);
      b.updated_at = nowSec();
      balances.set(uid, b);
      syncUserBalanceSnapshot(uid);

      promo.used_count += 1;
      promoCodes.set(promoKey, promo);
      usedBy.add(uid);

      if (added > 0) {
        addTx(uid, {
          id: txId++, telegram_id: Number.isFinite(+uid) ? +uid : uid,
          type: "promocode", currency: "stars", amount: added,
          balance_before: beforeStars, balance_after: nextStars,
          description: "Promocode redeem", tx_hash: null, invoice_id: null, created_at: nowSec()
        });
      }
      if (addedTon > 0) {
        addTx(uid, {
          id: txId++, telegram_id: Number.isFinite(+uid) ? +uid : uid,
          type: "promocode", currency: "ton", amount: addedTon,
          balance_before: beforeTon, balance_after: nextTon,
          description: "Promocode redeem", tx_hash: null, invoice_id: null, created_at: nowSec()
        });
      }

      return { ok: true, added, addedTon, newBalance: nextStars, newTonBalance: nextTon };
    },
    async hasTaskClaim(telegramId, taskKey) {
      const uid = ensure(telegramId);
      const key = String(taskKey || "").trim();
      if (!key) return false;
      return !!taskClaims.get(uid)?.has(key);
    },
    async awardTaskReward(telegramId, taskKey, currency = "stars", amount = 0, description = "Task reward") {
      const uid = ensure(telegramId);
      const key = String(taskKey || "").trim();
      if (!key) throw new Error("taskKey required");

      let delta = Number(amount || 0);
      if (!Number.isFinite(delta) || delta <= 0) throw new Error("Invalid amount");
      const cur = String(currency || "stars").toLowerCase() === "ton" ? "ton" : "stars";
      if (cur === "stars") delta = Math.max(1, Math.round(delta));
      if (cur === "ton") delta = Math.round(delta * 100000000) / 100000000;

      if (!taskClaims.has(uid)) taskClaims.set(uid, new Set());
      const userClaims = taskClaims.get(uid);
      if (userClaims.has(key)) {
        const bal = balances.get(uid) || { ton_balance: "0", stars_balance: 0 };
        return {
          ok: true,
          alreadyClaimed: true,
          currency: cur,
          added: 0,
          newBalance: cur === "ton" ? Number(bal.ton_balance || 0) : Number(bal.stars_balance || 0),
          tonBalance: Number(bal.ton_balance || 0),
          starsBalance: Number(bal.stars_balance || 0)
        };
      }

      userClaims.add(key);
      let newBalance = 0;
      try {
        newBalance = await this.updateBalance(uid, cur, delta, "task_reward", description, { taskKey: key });
      } catch (error) {
        userClaims.delete(key);
        throw error;
      }

      const bal = balances.get(uid) || { ton_balance: "0", stars_balance: 0 };
      return {
        ok: true,
        alreadyClaimed: false,
        currency: cur,
        added: delta,
        newBalance: Number(newBalance || 0),
        tonBalance: Number(bal.ton_balance || 0),
        starsBalance: Number(bal.stars_balance || 0)
      };
    },
    async claimWebhookEvent(eventKey, payload = null) {
      const keyRaw = String(eventKey || "").trim();
      if (!keyRaw) return false;
      if (webhookEvents.has(keyRaw)) return false;
      webhookEvents.set(keyRaw, {
        createdAt: nowSec(),
        payload: payload && typeof payload === "object" ? { ...payload } : payload
      });
      return true;
    },
    async releaseWebhookEvent(eventKey) {
      const keyRaw = String(eventKey || "").trim();
      if (!keyRaw) return false;
      return webhookEvents.delete(keyRaw);
    },
    async registerPendingCaseRound(input = {}) {
      const roundId = normalizeCaseRoundId(input?.roundId);
      if (!roundId) return { ok: false, error: "roundId required" };

      const uid = key(input?.telegramId);
      const currency = normalizeCaseCurrency(input?.currency);
      const caseCost = normalizeCaseCostByCurrency(input?.caseCost, currency);
      if (!(caseCost > 0)) return { ok: false, error: "caseCost required" };

      const existing = pendingCaseRounds.get(roundId);
      if (existing) {
        return { ok: true, created: false, row: mapPendingCaseRound(existing) };
      }

      const now = Date.now();
      const row = {
        roundId,
        telegramId: uid,
        currency,
        caseCost,
        openDepositId: String(input?.openDepositId || "").trim() || null,
        status: "pending",
        resolution: null,
        createdAt: now,
        updatedAt: now,
        settledAt: null,
        refundedAt: null
      };
      pendingCaseRounds.set(roundId, row);
      return { ok: true, created: true, row: mapPendingCaseRound(row) };
    },
    async resolvePendingCaseRound(roundIdInput, options = {}) {
      const roundId = normalizeCaseRoundId(roundIdInput);
      if (!roundId) return { ok: false, error: "roundId required" };

      const row = pendingCaseRounds.get(roundId);
      if (!row) return { ok: true, updated: false, row: null };
      if (row.status !== "pending") {
        return { ok: true, updated: false, row: mapPendingCaseRound(row) };
      }

      if (options?.telegramId !== undefined && options?.telegramId !== null && String(options.telegramId).trim()) {
        const expected = key(options.telegramId);
        if (String(row.telegramId) !== String(expected)) {
          return { ok: true, updated: false, row: mapPendingCaseRound(row) };
        }
      }

      const now = Date.now();
      const status = String(options?.status || "").toLowerCase() === "refunded" ? "refunded" : "settled";
      row.status = status;
      row.resolution = String(options?.resolution || "").trim() || (status === "refunded" ? "tech_pause_refund" : "claimed");
      row.updatedAt = now;
      if (status === "refunded") row.refundedAt = row.refundedAt || now;
      else row.settledAt = row.settledAt || now;
      pendingCaseRounds.set(roundId, row);

      return { ok: true, updated: true, row: mapPendingCaseRound(row) };
    },
    async listPendingCaseRoundsForRefund(limit = 200) {
      const raw = Number(limit);
      const lim = Number.isFinite(raw) ? Math.max(1, Math.min(5000, Math.trunc(raw))) : 200;
      const rows = Array.from(pendingCaseRounds.values())
        .filter((x) => String(x?.status || "pending") === "pending")
        .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0))
        .slice(0, lim)
        .map((x) => mapPendingCaseRound(x));
      return rows;
    },
    async getGameRoundMeta(gameKey) {
      const keyValue = normalizeGameRoundMetaKey(gameKey);
      if (!keyValue) return { gameKey: "", counter: 0, hash: "", updatedAt: 0 };
      const row = gameRoundMeta.get(keyValue) || null;
      if (!row) return { gameKey: keyValue, counter: 0, hash: "", updatedAt: 0 };
      return {
        gameKey: keyValue,
        counter: normalizeGameRoundCounter(row.counter),
        hash: String(row.hash || ""),
        updatedAt: Number(row.updatedAt) || 0
      };
    },
    async setGameRoundMeta(gameKey, counter, hash = null) {
      const keyValue = normalizeGameRoundMetaKey(gameKey);
      if (!keyValue) throw new Error("gameKey required");
      const now = Date.now();
      const next = {
        counter: normalizeGameRoundCounter(counter),
        hash: String(hash || ""),
        updatedAt: now
      };
      gameRoundMeta.set(keyValue, next);
      return {
        gameKey: keyValue,
        counter: next.counter,
        hash: next.hash,
        updatedAt: now
      };
    },
    async getTechPauseFlag() {
      return {
        enabled: Number(techPauseEnabled) === 1,
        updatedAt: Number(techPauseUpdatedAt) || 0
      };
    },
    async setTechPauseFlag(enabled) {
      techPauseEnabled = Number(enabled) === 1 ? 1 : 0;
      techPauseUpdatedAt = Date.now();
      return {
        enabled: techPauseEnabled === 1,
        updatedAt: techPauseUpdatedAt
      };
    },

// ===== Inventory (TEST_MODE memory) =====
async getUserInventory(telegramId) {
  const k = ensure(telegramId);
  const u = users.get(k);
  if (!u.__inv) u.__inv = [];
  return u.__inv.slice();
},
async addInventoryItems(telegramId, items, claimId = null) {
  const k = ensure(telegramId);
  const u = users.get(k);
  if (!u.__inv) u.__inv = [];
  if (!u.__claims) u.__claims = new Set();
  if (claimId && u.__claims.has(String(claimId))) return u.__inv.slice();
  if (claimId) u.__claims.add(String(claimId));

  const nowMs = Date.now();
  const list = Array.isArray(items) ? items : [];
  for (const it of list) {
    const instanceId = String(it?.instanceId || `${nowMs}_${crypto.randomBytes(6).toString('hex')}`);
    u.__inv.unshift({ ...(it && typeof it === 'object' ? it : {}), instanceId });
  }
  users.set(k, u);
  return u.__inv.slice();
},
async sellInventoryItems(telegramId, instanceIds, currency = 'ton') {
  const k = ensure(telegramId);
  const u = users.get(k);
  if (!u.__inv) u.__inv = [];
  const ids = Array.isArray(instanceIds) ? instanceIds.map(String) : [];
  const before = u.__inv.length;
  u.__inv = u.__inv.filter(it => !ids.includes(String(it?.instanceId || '')));
  users.set(k, u);
  return { sold: Math.max(0, before - u.__inv.length), amount: 0, newBalance: null };
},
async deleteInventoryItems(telegramId, instanceIds) {
  const k = ensure(telegramId);
  const u = users.get(k);
  if (!u.__inv) u.__inv = [];
  const ids = Array.isArray(instanceIds) ? instanceIds.map(String) : [];
  const before = u.__inv.length;
  u.__inv = u.__inv.filter(it => !ids.includes(String(it?.instanceId || '')));
  users.set(k, u);
  return { deleted: Math.max(0, before - u.__inv.length) };
},
async deleteInventoryItemByLookup(telegramId, lookup = {}) {
  const k = ensure(telegramId);
  const u = users.get(k);
  if (!u.__inv) u.__inv = [];
  const list = u.__inv;
  const norm = (v, max = 256) => {
    const s = String(v ?? "").trim();
    if (!s) return "";
    return s.length > max ? s.slice(0, max) : s;
  };
  const same = (a, b, max = 256) => {
    const left = norm(a, max);
    const right = norm(b, max);
    return !!left && !!right && left === right;
  };

  const instanceId = norm(lookup?.instanceId, 256);
  const marketId = norm(lookup?.marketId, 256);
  const itemId = norm(lookup?.itemId ?? lookup?.id, 256);
  const tgMessageId = norm(lookup?.tgMessageId ?? lookup?.messageId ?? lookup?.msgId, 128);

  let idx = -1;
  if (instanceId) idx = list.findIndex((x) => same(x?.instanceId, instanceId));
  if (idx < 0 && marketId) idx = list.findIndex((x) => same(x?.marketId, marketId));
  if (idx < 0 && itemId) idx = list.findIndex((x) => same(x?.id, itemId) || same(x?.baseId, itemId));
  if (idx < 0 && tgMessageId) {
    idx = list.findIndex((x) =>
      same(x?.tg?.messageId, tgMessageId, 128) ||
      same(x?.tg?.msgId, tgMessageId, 128)
    );
  }
  if (idx < 0) return { deleted: 0 };

  list.splice(idx, 1);
  users.set(k, u);
  return { deleted: 1 };
}
  };
}

const dbMem = createMemoryDb();

// Real DB init (Postgres) вЂ” load only after dotenv has run.
if (!IS_TEST) {
  dbReal = await import("./database-pg.js");
  await dbReal.initDatabase();
  if (typeof dbReal.ensurePromoSeed === "function") {
    await dbReal.ensurePromoSeed();
  }
} else {
  await dbMem.initDatabase();
  if (typeof dbMem.ensurePromoSeed === "function") {
    await dbMem.ensurePromoSeed();
  }
}

// Select DB
const db = IS_TEST ? dbMem : dbReal;

// SSE clients: userId -> Set(response)
const balanceClients = new Map();
const adminPanelSessions = new Map();
const ADMIN_PANEL_SESSION_TTL_MS = Math.max(
  60_000,
  Math.min(24 * 60 * 60 * 1000, Number(process.env.ADMIN_PANEL_SESSION_TTL_MS || (2 * 60 * 60 * 1000)) || (2 * 60 * 60 * 1000))
);

const TECH_PAUSE_MODE_OFF = "off";
const TECH_PAUSE_MODE_DRAINING = "draining";
const TECH_PAUSE_MODE_ACTIVE = "active";
const TECH_PAUSE_ERROR_CODE = "TECH_PAUSE";
const TECH_PAUSE_DB_POLL_MS = Math.max(
  1000,
  Math.min(30000, Number(process.env.TECH_PAUSE_DB_POLL_MS || 3000) || 3000)
);
const TECH_PAUSE_DRAINING_MIN_MS = Math.max(
  1000,
  Math.min(120000, Number(process.env.TECH_PAUSE_DRAINING_MIN_MS || 6000) || 6000)
);

const techPauseState = {
  mode: TECH_PAUSE_MODE_OFF,
  flagEnabled: false,
  updatedAt: Date.now(),
  drainingStartedAt: 0,
  activatedAt: 0
};

let techPauseSyncPromise = null;
let caseRoundRefundSweepPromise = null;
const CASE_ROUND_REFUND_EVENT_PREFIX = "case_round_refund:";
const CASE_ROUND_REFUND_SWEEP_LIMIT = Math.max(
  10,
  Math.min(5000, Number(process.env.CASE_ROUND_REFUND_SWEEP_LIMIT || 500) || 500)
);
const CASE_ROUND_REFUND_MAX_AGE_MS = Math.max(
  60_000,
  Math.min(24 * 60 * 60 * 1000, Number(process.env.CASE_ROUND_REFUND_MAX_AGE_MS || (30 * 60 * 1000)) || (30 * 60 * 1000))
);

function normalizeCaseRoundIdValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[A-Za-z0-9:_-]{8,190}$/.test(raw)) return "";
  return raw;
}

function normalizeCaseRoundCurrency(value) {
  return String(value || "").toLowerCase() === "stars" ? "stars" : "ton";
}

function normalizeCaseRoundCost(value, currency) {
  const cur = normalizeCaseRoundCurrency(currency);
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (cur === "stars") return Math.max(1, Math.round(raw));
  return Math.max(0.01, Math.round(raw * 100) / 100);
}

function extractCaseRoundIdFromDepositPayload(typeNorm, roundIdRaw, depositIdRaw) {
  const direct = normalizeCaseRoundIdValue(roundIdRaw);
  if (direct) return direct;

  const depositId = String(depositIdRaw || "").trim();
  if (!depositId) return "";

  if (typeNorm === "case_gift_claim") {
    const m = depositId.match(/^case_gift_claim_(.+)$/i);
    return normalizeCaseRoundIdValue(m?.[1] || "");
  }
  if (typeNorm === "case_nft_sell") {
    const m = depositId.match(/^case_nft_sell_(.+)$/i);
    return normalizeCaseRoundIdValue(m?.[1] || "");
  }
  return "";
}

function extractCaseRoundIdFromClaimId(claimIdRaw) {
  const claimId = String(claimIdRaw || "").trim();
  if (!claimId) return "";
  const m = claimId.match(/^case_nft_claim_(.+)$/i);
  if (!m) return "";
  return normalizeCaseRoundIdValue(m[1] || "");
}

async function registerPendingCaseRound(input = {}) {
  if (typeof db?.registerPendingCaseRound !== "function") {
    return { ok: false, error: "registerPendingCaseRound unsupported" };
  }
  return db.registerPendingCaseRound(input);
}

async function resolvePendingCaseRound(roundId, options = {}) {
  if (typeof db?.resolvePendingCaseRound !== "function") {
    return { ok: false, error: "resolvePendingCaseRound unsupported" };
  }
  return db.resolvePendingCaseRound(roundId, options);
}

async function listPendingCaseRoundsForRefund(limit = CASE_ROUND_REFUND_SWEEP_LIMIT) {
  if (typeof db?.listPendingCaseRoundsForRefund !== "function") return [];
  const rows = await db.listPendingCaseRoundsForRefund(limit);
  return Array.isArray(rows) ? rows : [];
}

async function sweepPendingCaseRoundsForTechPause(source = "tech_pause") {
  if (caseRoundRefundSweepPromise) return caseRoundRefundSweepPromise;

  caseRoundRefundSweepPromise = (async () => {
    const pendingRows = await listPendingCaseRoundsForRefund(CASE_ROUND_REFUND_SWEEP_LIMIT);
    if (!pendingRows.length) return { scanned: 0, refunded: 0 };

    let refunded = 0;
    for (const row of pendingRows) {
      const roundId = normalizeCaseRoundIdValue(row?.roundId || row?.round_id);
      const userId = String(row?.telegramId || row?.telegram_id || "").trim();
      const currency = normalizeCaseRoundCurrency(row?.currency);
      const amount = normalizeCaseRoundCost(row?.caseCost ?? row?.case_cost, currency);
      if (!roundId || !userId || !(amount > 0)) continue;

      const createdAt = Number(row?.createdAt ?? row?.created_at ?? 0);
      const ageMs = createdAt > 0 ? (Date.now() - createdAt) : 0;
      if (Number.isFinite(ageMs) && ageMs > CASE_ROUND_REFUND_MAX_AGE_MS) {
        await resolvePendingCaseRound(roundId, {
          telegramId: userId,
          status: "settled",
          resolution: "expired_no_refund"
        }).catch(() => {});
        continue;
      }

      const eventKey = `${CASE_ROUND_REFUND_EVENT_PREFIX}${roundId}`;
      const claimed = await claimWebhookEvent(eventKey, {
        roundId,
        userId,
        currency,
        amount,
        source
      });
      if (!claimed) continue;

      try {
        await db.updateBalance(
          userId,
          currency,
          amount,
          "case_open_refund",
          `Case refund (${source})`,
          { roundId, invoiceId: `case_refund_${roundId}` }
        );

        await resolvePendingCaseRound(roundId, {
          telegramId: userId,
          status: "refunded",
          resolution: source
        }).catch(() => {});

        refunded += 1;
        try { broadcastBalanceUpdate(userId); } catch {}
      } catch (error) {
        await releaseWebhookEvent(eventKey).catch(() => {});
        console.error("[CaseRefund] Failed to refund pending case round:", {
          roundId,
          userId,
          currency,
          amount,
          error: error?.message || error
        });
      }
    }

    return { scanned: pendingRows.length, refunded };
  })()
    .catch((error) => {
      console.error("[CaseRefund] Sweep error:", error?.message || error);
      return { scanned: 0, refunded: 0 };
    })
    .finally(() => {
      caseRoundRefundSweepPromise = null;
    });

  return caseRoundRefundSweepPromise;
}

function triggerPendingCaseRoundRefundSweep(source = "tech_pause") {
  sweepPendingCaseRoundsForTechPause(source).catch(() => {});
}


const app = express();
const httpServer = createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT = process.env.PORT || 3000; // port
const HOST = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";

const TG_CHROME_METRICS_PATH =
  process.env.TG_CHROME_METRICS_PATH ||
  (IS_PROD
    ? "/opt/render/project/data/telegram-chrome-metrics.ndjson"
    : path.join(__dirname, "data", "telegram-chrome-metrics.ndjson"));
const TG_CHROME_METRICS_MAX_BYTES = Math.max(
  256 * 1024,
  Math.min(20 * 1024 * 1024, Number(process.env.TG_CHROME_METRICS_MAX_BYTES || 5 * 1024 * 1024) || 5 * 1024 * 1024)
);

function ensureTelegramChromeMetricsDir() {
  const dir = path.dirname(TG_CHROME_METRICS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function clampFiniteNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clipText(value, maxLen = 64) {
  return String(value || "").trim().slice(0, maxLen);
}

function sanitizeTelegramChromeSample(raw = {}) {
  return {
    reason: clipText(raw.reason || "unknown", 48),
    tsClient: clampFiniteNumber(raw.tsClient, 0, 9_999_999_999_999, Date.now()),
    platform: clipText(raw.platform, 32),
    isFullscreen: !!raw.isFullscreen,
    safeTop: clampFiniteNumber(raw.safeTop, 0, 320, 0),
    safeLeft: clampFiniteNumber(raw.safeLeft, 0, 240, 0),
    safeRight: clampFiniteNumber(raw.safeRight, 0, 240, 0),
    contentTop: clampFiniteNumber(raw.contentTop, 0, 480, 0),
    contentLeft: clampFiniteNumber(raw.contentLeft, 0, 240, 0),
    contentRight: clampFiniteNumber(raw.contentRight, 0, 240, 0),
    overlayTop: clampFiniteNumber(raw.overlayTop, 0, 320, 0),
    headerSideLeft: clampFiniteNumber(raw.headerSideLeft, 0, 320, 0),
    headerSideRight: clampFiniteNumber(raw.headerSideRight, 0, 320, 0),
    logoNudgeY: clampFiniteNumber(raw.logoNudgeY, -80, 120, 0),
    viewportW: clampFiniteNumber(raw.viewportW, 0, 6000, 0),
    viewportH: clampFiniteNumber(raw.viewportH, 0, 6000, 0),
    visualViewportW: clampFiniteNumber(raw.visualViewportW, 0, 6000, 0),
    visualViewportH: clampFiniteNumber(raw.visualViewportH, 0, 6000, 0),
    visualViewportOffsetTop: clampFiniteNumber(raw.visualViewportOffsetTop, 0, 1200, 0),
    dpr: clampFiniteNumber(raw.dpr, 0, 8, 1),
    path: clipText(raw.path || "/", 180)
  };
}

function appendTelegramChromeMetricRecord(record) {
  try {
    ensureTelegramChromeMetricsDir();
    if (fs.existsSync(TG_CHROME_METRICS_PATH)) {
      const st = fs.statSync(TG_CHROME_METRICS_PATH);
      if (Number(st?.size || 0) > TG_CHROME_METRICS_MAX_BYTES) {
        const rotated = `${TG_CHROME_METRICS_PATH}.${Date.now()}.bak`;
        try { fs.renameSync(TG_CHROME_METRICS_PATH, rotated); } catch {}
      }
    }
    fs.appendFileSync(TG_CHROME_METRICS_PATH, `${JSON.stringify(record)}\n`, "utf8");
    return true;
  } catch (error) {
    console.error("[TGChromeMetrics] append error:", error?.message || error);
    return false;
  }
}

function readTelegramChromeMetricRecords(limit = 100) {
  const max = Math.max(1, Math.min(1000, Number(limit) || 100));
  try {
    if (!fs.existsSync(TG_CHROME_METRICS_PATH)) return [];
    const raw = fs.readFileSync(TG_CHROME_METRICS_PATH, "utf8");
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).filter(Boolean).slice(-max);
    const list = [];
    for (const line of lines) {
      try { list.push(JSON.parse(line)); } catch {}
    }
    return list;
  } catch (error) {
    console.error("[TGChromeMetrics] read error:", error?.message || error);
    return [];
  }
}





// ==============================
// CRASH GAME WebSocket Server
// ==============================
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ noServer: true });
const wheelWss = new WebSocketServer({ noServer: true });

const crashGame = {
  phase: 'waiting',
  phaseStart: Date.now(),
  roundId: 0,
  roundHash: "",
  crashPoint: 2.0,
  currentMult: 1.0,
  players: [],
  history: [],
  tickInterval: null,
  bettingInterval: null,
  phaseTimeout: null,
  serverSeed: null,
  prevServerSeed: null,
  clientSeed: "public",
  nonce: 0

};

const BETTING_TIME = 10000; // 10 seconds
const CRASH_MIN = 1.01;
const CRASH_MAX = 100;
const TICK_MS = 100; // send multiplier updates 10 times per second (clients interpolate)
const HEARTBEAT_MS = 30000;
const WS_MAX_BUFFERED = 2 * 1024 * 1024;      // 2MB -> skip non-critical sends
const WS_HARD_CLOSE_BUFFERED = 8 * 1024 * 1024; // 8MB -> terminate the socket
const CRASH_VERBOSE_LOGS = /^(1|true|yes|on)$/i.test(String(process.env.CRASH_VERBOSE_LOGS || "").trim());
const crashBetCredits = new Map(); // "<crashRoundId>|<userId>|<currency>" -> remaining amount
const GAME_META_KEYS = Object.freeze({ crash: "crash", wheel: "wheel" });

function crashLog(...args) {
  if (CRASH_VERBOSE_LOGS) console.log(...args);
}

function normalizeCrashCurrency(currency) {
  return String(currency || "ton").toLowerCase() === "stars" ? "stars" : "ton";
}

function normalizeCrashRoundIdForUser(roundId, userId) {
  const uid = String(userId || "").trim();
  const raw = String(roundId || "").trim();
  if (!uid || !raw) return "";

  const strictMatch = /^crash_(\d+)_(.+)$/.exec(raw);
  if (strictMatch) {
    const roundNum = Number(strictMatch[1]);
    const suffixUserId = String(strictMatch[2] || "");
    if (!Number.isInteger(roundNum) || roundNum <= 0) return "";
    if (suffixUserId !== uid) return "";
    return `crash_${roundNum}_${uid}`;
  }

  const numericRound = Number(raw);
  if (Number.isInteger(numericRound) && numericRound > 0) {
    return `crash_${numericRound}_${uid}`;
  }

  return "";
}

function getCurrentCrashRoundIdForUser(userId) {
  return normalizeCrashRoundIdForUser(`crash_${crashGame.roundId}_${String(userId || "").trim()}`, userId);
}

function roundCrashAmountByCurrency(amount, currency) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (normalizeCrashCurrency(currency) === "stars") {
    return Math.max(1, Math.round(n));
  }
  return Math.round(n * 100) / 100;
}

function crashBetCreditKey(roundId, userId, currency) {
  const uid = String(userId || "").trim();
  const rid = normalizeCrashRoundIdForUser(roundId, uid);
  const cur = normalizeCrashCurrency(currency);
  if (!rid || !uid) return "";
  return `${rid}|${uid}|${cur}`;
}

function registerCrashBetCredit(roundId, userId, currency, amount) {
  const key = crashBetCreditKey(roundId, userId, currency);
  const delta = Number(amount || 0);
  if (!key || !Number.isFinite(delta) || delta <= 0) return false;
  const cur = key.endsWith("|stars") ? "stars" : "ton";
  const prev = Number(crashBetCredits.get(key) || 0);
  const nextRaw = prev + delta;
  const next = cur === "stars"
    ? Math.max(0, Math.round(nextRaw))
    : Math.max(0, Math.round(nextRaw * 100) / 100);
  crashBetCredits.set(key, next);
  return true;
}

function consumeCrashBetCredit(roundId, userId, currency, amount) {
  const key = crashBetCreditKey(roundId, userId, currency);
  const needRaw = Number(amount || 0);
  if (!key || !Number.isFinite(needRaw) || needRaw <= 0) return false;
  const cur = key.endsWith("|stars") ? "stars" : "ton";
  const need = cur === "stars"
    ? Math.max(1, Math.round(needRaw))
    : Math.round(needRaw * 100) / 100;

  const available = Number(crashBetCredits.get(key) || 0);
  const epsilon = cur === "stars" ? 0 : 0.0000001;
  if (!Number.isFinite(available) || available + epsilon < need) {
    return false;
  }

  const leftRaw = available - need;
  const left = cur === "stars"
    ? Math.max(0, Math.round(leftRaw))
    : Math.max(0, Math.round(leftRaw * 100) / 100);
  if (left <= epsilon) crashBetCredits.delete(key);
  else crashBetCredits.set(key, left);
  return true;
}

function pruneCrashBetCredits(activeRoundId) {
  const round = Number(activeRoundId || 0);
  if (!Number.isInteger(round) || round <= 0) return;
  const roundPrefix = `crash_${round}_`;
  for (const key of crashBetCredits.keys()) {
    const rid = String(key).split("|")[0] || "";
    if (!rid.startsWith(roundPrefix)) {
      crashBetCredits.delete(key);
    }
  }
}

function normalizeGameCounterValue(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.trunc(raw));
}

function normalizeRoundHashValue(value) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 256) : "";
}

function makeRoundHash(gameKey, counter, entropy = "") {
  const payload = `${gameKey}|${normalizeGameCounterValue(counter)}|${Date.now()}|${String(entropy || "")}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function loadGameRoundMeta(gameKey) {
  if (typeof db?.getGameRoundMeta !== "function") {
    return { counter: 0, hash: "", updatedAt: 0 };
  }
  try {
    const snapshot = await db.getGameRoundMeta(gameKey);
    return {
      counter: normalizeGameCounterValue(snapshot?.counter),
      hash: normalizeRoundHashValue(snapshot?.hash),
      updatedAt: Number(snapshot?.updatedAt) || 0
    };
  } catch (error) {
    console.warn(`[Games] Failed to load round meta for ${gameKey}:`, error?.message || error);
    return { counter: 0, hash: "", updatedAt: 0 };
  }
}

function persistGameRoundMeta(gameKey, counter, hash) {
  if (typeof db?.setGameRoundMeta !== "function") return;
  const safeCounter = normalizeGameCounterValue(counter);
  const safeHash = normalizeRoundHashValue(hash);
  db.setGameRoundMeta(gameKey, safeCounter, safeHash || null).catch((error) => {
    console.warn(`[Games] Failed to persist round meta for ${gameKey}:`, error?.message || error);
  });
}

function wsSendSafe(ws, data) {
  try {
    if (!ws || ws.readyState !== 1) return false;
    const buffered = typeof ws.bufferedAmount === 'number' ? ws.bufferedAmount : 0;

    // Kill totally stuck sockets
    if (buffered > WS_HARD_CLOSE_BUFFERED) {
      try { ws.terminate(); } catch {}
      return false;
    }

    // For slow sockets: skip to avoid unbounded queue growth / stack overflow
    if (buffered > WS_MAX_BUFFERED) return false;

    ws.send(data);
    return true;
  } catch {
    try { ws.terminate(); } catch {}
    return false;
  }
}

function computeBettingLeftMs(now = Date.now()) {
  if (crashGame.phase !== 'betting') return null;
  return Math.max(0, (crashGame.phaseStart + BETTING_TIME) - now);
}

function buildGameState(now = Date.now()) {
  return {
    type: 'gameState',
    serverTime: now,
    bettingTimeMs: BETTING_TIME,
    bettingLeftMs: computeBettingLeftMs(now),
    phase: crashGame.phase,
    phaseStart: crashGame.phaseStart,
    roundId: crashGame.roundId,
    gameCounter: crashGame.roundId,
    roundHash: crashGame.roundHash || "",
    crashPoint: (crashGame.phase === 'crash' || crashGame.phase === 'wait') ? crashGame.crashPoint : null,
    currentMult: crashGame.currentMult,
    players: crashGame.players,
    history: crashGame.history.slice(0, 15),
    techPause: getPublicTechPauseState()
  };
}

// WS heartbeat (close dead/stuck sockets)
function heartbeat(wssInst) {
  wssInst.clients.forEach(ws => {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}

setInterval(() => {
  heartbeat(wss);
  heartbeat(wheelWss);
}, HEARTBEAT_MS);



function getXFromSeeds(serverSeed, clientSeed, nonce) {
  // HMAC_SHA512(serverSeed, clientSeed:nonce)
  const hmac = crypto
    .createHmac("sha512", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest();

  // Р±РµСЂС‘Рј РїРµСЂРІС‹Рµ 8 Р±Р°Р№С‚ в†’ С‡РёСЃР»Рѕ
  let r = 0;
  for (let i = 0; i < 8; i++) {
    r += hmac[i] / Math.pow(256, i + 1);
  }

  // [0 .. 999999]
  return Math.floor(r * 1_000_000);
}




function crashFromX(x) {
  const HOUSE_EDGE = 0.07;
  const MAX_X = 100;

  let crash = (1_000_000 / (x + 1)) * (1 - HOUSE_EDGE);
  crash = Math.max(1, Math.min(crash, MAX_X));

  return Math.floor(crash * 100) / 100;
}

function generateCrashPoint() {
  const x = getXFromSeeds(
    crashGame.serverSeed,
    crashGame.clientSeed,
    crashGame.nonce++
  );

  return crashFromX(x);
}



function broadcastGameState() {
  const msg = JSON.stringify(buildGameState());
  wss.clients.forEach(ws => wsSendSafe(ws, msg));
}

function clearCrashTimers() {
  if (crashGame.tickInterval) {
    clearInterval(crashGame.tickInterval);
    crashGame.tickInterval = null;
  }
  if (crashGame.phaseTimeout) {
    clearTimeout(crashGame.phaseTimeout);
    crashGame.phaseTimeout = null;
  }
  if (crashGame.bettingInterval) {
    clearInterval(crashGame.bettingInterval);
    crashGame.bettingInterval = null;
  }
}

function startCrashWaitingRound() {
  rotateServerSeed();
  crashGame.nonce = 0;

  // Cleanup any leftovers (safety)
  clearCrashTimers();

  crashGame.phase = 'waiting';
  crashGame.phaseStart = Date.now();
  crashGame.roundId++;
  crashGame.roundHash = makeRoundHash(
    GAME_META_KEYS.crash,
    crashGame.roundId,
    `${crashGame.serverSeed}:${crashGame.clientSeed}:${crashGame.nonce}`
  );
  persistGameRoundMeta(GAME_META_KEYS.crash, crashGame.roundId, crashGame.roundHash);
  pruneCrashBetCredits(crashGame.roundId);
  crashGame.currentMult = 1.0;
  crashGame.crashPoint = generateCrashPoint();
  crashGame.players = [];

  crashLog(`[Crash] Round ${crashGame.roundId} waiting for first bet`);

  broadcastGameState();
}

function startBetting() {
  if (crashGame.phase !== 'waiting') return;

  // Cleanup any leftovers (safety)
  clearCrashTimers();

  crashGame.phase = 'betting';
  crashGame.phaseStart = Date.now();

  crashLog(`[Crash] Round ${crashGame.roundId} betting started (${crashGame.players.length} players)`);

  broadcastGameState();

  // Send countdown sync once per second (cheap)
  crashGame.bettingInterval = setInterval(() => {
    if (crashGame.phase === 'betting') {
      broadcastGameState();
    }
  }, 1000);

  crashGame.phaseTimeout = setTimeout(() => {
    if (crashGame.bettingInterval) {
      clearInterval(crashGame.bettingInterval);
      crashGame.bettingInterval = null;
    }
    startRunning();
  }, BETTING_TIME);
}


function startRunning() {
  if (crashGame.phase !== 'betting') return;
  if (!Array.isArray(crashGame.players) || crashGame.players.length === 0) {
    crashGame.phase = 'waiting';
    crashGame.phaseStart = Date.now();
    crashGame.currentMult = 1.0;
    broadcastGameState();
    return;
  }

  // Cleanup betting timers (safety)
  clearCrashTimers();

  crashGame.phase = 'run';
  crashGame.phaseStart = Date.now();
  crashGame.currentMult = 1.0;

  crashLog(`[Crash] Round ${crashGame.roundId} running with ${crashGame.players.length} players`);

  // Full state once at phase start
  broadcastGameState();

  const startTime = Date.now();
  crashGame.tickInterval = setInterval(() => {
    if (crashGame.phase !== 'run') return;

    const elapsed = Date.now() - startTime;
    crashGame.currentMult = Math.pow(Math.E, elapsed / 10000);

    if (crashGame.currentMult >= crashGame.crashPoint) {
      crash();
    } else {
      // Lightweight multiplier updates (no heavy DOM on clients)
      broadcastTick();
    }
  }, TICK_MS);
}

function crash() {
  clearCrashTimers();

  crashGame.phase = 'crash';
  crashGame.currentMult = crashGame.crashPoint;
  
  crashLog(`[Crash] Round ${crashGame.roundId} crashed`);
  
  crashGame.history.unshift(crashGame.crashPoint);
  if (crashGame.history.length > 20) crashGame.history.length = 20;
  
  broadcastGameState();
  
  crashGame.phaseTimeout = setTimeout(() => {
    crashGame.phase = 'wait';
    broadcastGameState();
    setTimeout(startCrashWaitingRound, 2000);
  }, 2000);
}

// WebSocket connection handler
function resolveCrashWsUser(msg) {
  const initData = String(msg?.initData || "").trim();
  if (!initData || !process.env.BOT_TOKEN) {
    return { ok: false, error: "Unauthorized" };
  }

  const maxAgeSec = getTelegramInitDataMaxAgeSec();
  const initCheck = verifyInitData(initData, process.env.BOT_TOKEN, maxAgeSec);
  if (!initCheck.ok) {
    return { ok: false, error: "Unauthorized" };
  }

  let wsUser = null;
  try {
    wsUser = JSON.parse(initCheck.params.user || "null");
  } catch {
    wsUser = null;
  }

  const wsUserId = String(wsUser?.id || "").trim();
  if (!wsUserId) {
    return { ok: false, error: "Unauthorized" };
  }

  const requestedUserId = String(msg?.userId || "").trim();
  if (requestedUserId && requestedUserId !== wsUserId) {
    return { ok: false, error: "Unauthorized" };
  }

  return { ok: true, userId: wsUserId, user: wsUser };
}

wss.on('connection', (ws) => {
  crashLog('[Crash WS] Client connected');
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  // Send current state immediately
  wsSendSafe(ws, JSON.stringify(buildGameState()));

ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'placeBet') {
        if (isTechPauseBlockingActions()) {
          wsSendSafe(ws, JSON.stringify({
            type: 'error',
            code: TECH_PAUSE_ERROR_CODE,
            message: 'Technical pause is active',
            techPause: getPublicTechPauseState()
          }));
          return;
        }

        if (crashGame.phase !== 'betting' && crashGame.phase !== 'waiting') {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Betting closed' }));
          return;
        }

        const auth = resolveCrashWsUser(msg);
        if (!auth.ok) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: auth.error || 'Unauthorized' }));
          return;
        }

        const userId = auth.userId;
        const existing = crashGame.players.find(p => String(p.userId) === userId);
        if (existing) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Already placed bet' }));
          return;
        }

        const currency = normalizeCrashCurrency(msg.currency);
        const amount = roundCrashAmountByCurrency(msg.amount, currency);
        if (!Number.isFinite(amount) || amount <= 0) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Invalid bet amount' }));
          return;
        }

        const expectedRoundId = getCurrentCrashRoundIdForUser(userId);
        const requestedRoundId = normalizeCrashRoundIdForUser(msg.roundId || expectedRoundId, userId);
        if (!requestedRoundId || requestedRoundId !== expectedRoundId) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Round mismatch' }));
          return;
        }

        // Bet must be pre-authorized by a successful crash bet debit for this round.
        if (!consumeCrashBetCredit(requestedRoundId, userId, currency, amount)) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Bet not authorized' }));
          return;
        }

        const name = safeShortText(
          auth.user?.first_name || auth.user?.username || msg.userName || "Player",
          64
        ) || "Player";
        const avatar = msg.userAvatar ? String(msg.userAvatar).slice(0, 500) : null;

        crashGame.players.push({
          userId,
          name,
          avatar,
          amount,
          currency,
          claimed: false,
          claimMult: null
        });
        
        crashLog(`[Crash] ${name} bet ${amount} ${currency}`);
        
        wsSendSafe(ws, JSON.stringify({ type: 'betPlaced', userId }));
        if (crashGame.phase === 'waiting') {
          startBetting();
        } else {
          broadcastGameState();
        }
      }
      
      else if (msg.type === 'claim') {
        if (crashGame.phase !== 'run') {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Cannot claim now' }));
          return;
        }

        const auth = resolveCrashWsUser(msg);
        if (!auth.ok) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: auth.error || 'Unauthorized' }));
          return;
        }

        const userId = auth.userId;
        const player = crashGame.players.find(p => String(p.userId) === userId);
        if (!player) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'No active bet' }));
          return;
        }
        
        if (player.claimed) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Already claimed' }));
          return;
        }

        if (player.claiming) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Claim in progress' }));
          return;
        }

        const claimMult = Number.isFinite(Number(crashGame.currentMult))
          ? Math.max(CRASH_MIN, Number(crashGame.currentMult))
          : CRASH_MIN;
        const currency = normalizeCrashCurrency(player.currency);
        const payout = roundCrashAmountByCurrency(Number(player.amount || 0) * claimMult, currency);
        if (!Number.isFinite(payout) || payout <= 0) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Invalid payout' }));
          return;
        }

        const roundId = getCurrentCrashRoundIdForUser(userId);
        player.claiming = true;

        try {
          await db.updateBalance(
            userId,
            currency,
            payout,
            'crash_win',
            `Crash win (${roundId})`,
            { roundId, multiplier: claimMult }
          );

          player.claimed = true;
          player.claimMult = claimMult;
          player.claiming = false;

          broadcastBalanceUpdate(userId);
          crashLog(`[Crash] ${player.name} claimed at ${claimMult.toFixed(2)}x, payout: ${payout} ${currency}`);

          wsSendSafe(ws, JSON.stringify({ type: 'claimed', userId, mult: claimMult, payout, currency }));
          broadcastGameState();
        } catch (claimError) {
          player.claiming = false;
          console.error(`[Crash] Claim settlement failed for user ${userId}:`, claimError);
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Claim failed' }));
        }
      }
      
    } catch (e) {
      console.error('[Crash WS] Message error:', e);
    }
  });

  ws.on('close', () => {
    crashLog('[Crash WS] Client disconnected');
  });
});

// HTTP upgrade handler for WebSocket
httpServer.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws/crash') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (request.url === '/ws/wheel') {
    wheelWss.handleUpgrade(request, socket, head, (ws) => {
      wheelWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Rest of your Express routes below...








// Wheel configuration (must match public/js/wheel.js)
const WHEEL_ORDER = [
  '1.1x','1.5x','Loot Rush','1.1x','5x','50&50','1.1x',
  '1.5x','11x','1.1x','1.5x','Loot Rush','1.1x','5x','50&50',
  '1.1x','1.5x','1.1x','Wild Time','11x','1.5x','1.1x','5x','50&50'
];
// ==============================
// WHEEL GAME WebSocket Server (shared wheel for everyone, Crash-style)
// ==============================

const WHEEL_BETTING_TIME = 9000;     // ms
const WHEEL_ACCEL_MS = 1200;         // ms
const WHEEL_DECEL_MIN_MS = 5000;     // ms
const WHEEL_DECEL_MAX_MS = 7000;     // ms
const WHEEL_EXTRA_TURNS = 4;
const WHEEL_RESULT_TIME = 2500;      // ms
const WHEEL_BONUS_TYPES = new Set(['50&50','Loot Rush','Wild Time']);
function wheelClampBonusMs(raw, fallbackMs) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallbackMs;
  return Math.max(12000, Math.min(45000, Math.round(n)));
}
const WHEEL_BONUS_TIME_BY_TYPE = {
  // Keep bonus phase longer than visual overlays (including close animations),
  // so the next round never starts while a bonus is still finishing.
  '50&50': wheelClampBonusMs(process.env.WHEEL_BONUS_5050_MS, 17000),
  'Loot Rush': wheelClampBonusMs(process.env.WHEEL_BONUS_LOOTRUSH_MS, 17000),
  'Wild Time': wheelClampBonusMs(process.env.WHEEL_BONUS_WILDTIME_MS, 18000)
};
const WHEEL_BONUS_FALLBACK_MS = wheelClampBonusMs(process.env.WHEEL_BONUS_FALLBACK_MS, 18000);
const WHEEL_SEGMENT_MULTIPLIERS = Object.freeze({
  '1.1x': 1.1,
  '1.5x': 1.5,
  '5x': 5,
  '11x': 11
});


const WHEEL_ALLOWED = new Set(WHEEL_ORDER);

const wheelGame = {
  phase: 'waiting',           // waiting | betting | spin | bonus | result
  phaseStart: Date.now(),
  roundId: 0,
  roundHash: "",
  players: new Map(),         // userId -> { userId,name,avatar,currency,totalAmount,segments:Map }
  history: [],
  spin: null,                 // { sliceIndex,type,accelMs,decelMs,extraTurns,spinStartAt,spinTotalMs }
  bonus: null,               // { id,type,startedAt,durationMs,endsAt,outcome }
  settlement: null,          // { roundId,resultType,multiplier,winnersCount,paidTon,paidStars,bonusOutcome }
  settlementPromise: null,
  phaseTimeout: null
};

// Authorized wheel bet credits registered by /api/deposit-notification (wheel_bet debits).
// Key format: "<roundId>|<userId>|<currency>" -> remaining amount.
const wheelBetCredits = new Map();

function wheelBetCreditKey(roundId, userId, currency) {
  const r = Number(roundId || 0);
  const uid = String(userId || "").trim();
  const cur = String(currency || "ton").toLowerCase() === "stars" ? "stars" : "ton";
  if (!Number.isFinite(r) || r <= 0 || !uid) return "";
  return `${Math.trunc(r)}|${uid}|${cur}`;
}

function registerWheelBetCredit(roundId, userId, currency, amount) {
  const key = wheelBetCreditKey(roundId, userId, currency);
  const delta = Number(amount || 0);
  if (!key || !Number.isFinite(delta) || delta <= 0) return false;

  const cur = key.endsWith("|stars") ? "stars" : "ton";
  const prev = Number(wheelBetCredits.get(key) || 0);
  const nextRaw = prev + delta;
  const next = cur === "stars"
    ? Math.max(0, Math.round(nextRaw))
    : Math.max(0, Math.round(nextRaw * 100) / 100);
  wheelBetCredits.set(key, next);
  return true;
}

function consumeWheelBetCredit(roundId, userId, currency, amount) {
  const key = wheelBetCreditKey(roundId, userId, currency);
  const need = Number(amount || 0);
  if (!key || !Number.isFinite(need) || need <= 0) return false;

  const cur = key.endsWith("|stars") ? "stars" : "ton";
  const available = Number(wheelBetCredits.get(key) || 0);
  const epsilon = cur === "stars" ? 0 : 1e-9;
  if (!Number.isFinite(available) || available + epsilon < need) {
    return false;
  }

  const leftRaw = available - need;
  const left = cur === "stars"
    ? Math.max(0, Math.round(leftRaw))
    : Math.max(0, Math.round(leftRaw * 100) / 100);
  if (left <= epsilon) {
    wheelBetCredits.delete(key);
  } else {
    wheelBetCredits.set(key, left);
  }
  return true;
}

function cleanupWheelBetCredits(currentRoundId) {
  const round = Number(currentRoundId || 0);
  if (!Number.isFinite(round) || round <= 0) return;

  for (const key of wheelBetCredits.keys()) {
    const kRound = Number(String(key).split("|")[0] || 0);
    if (!Number.isFinite(kRound) || kRound < round) {
      wheelBetCredits.delete(key);
    }
  }
}

function normWheelSeg(seg) {
  if (!seg) return null;
  const s = String(seg).trim();
  if (s === '50/50' || s === '50-50') return '50&50';
  return s;
}

function roundWheelAmount(amount, currency) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (currency === 'stars') return Math.max(0, Math.round(n));
  return Math.max(0, Math.round(n * 100) / 100);
}

// Bonus outcome data sent to clients should not reveal private pick indices.
// Server keeps full outcome internally for settlement integrity.
function wheelBuildClientBonusOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object') return null;
  const t = normWheelSeg(outcome.type);
  if (!t) return null;

  if (t === '50&50') {
    const goodX = Number(outcome.goodX);
    const badX = Number(outcome.badX);
    const multiplier = Number(outcome.multiplier);
    return {
      type: t,
      goodX: Number.isFinite(goodX) && goodX > 0 ? goodX : null,
      badX: Number.isFinite(badX) && badX > 0 ? badX : null,
      multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null
    };
  }

  if (t === 'Loot Rush') {
    const multiplier = Number(outcome.multiplier);
    return {
      type: t,
      multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null
    };
  }

  if (t === 'Wild Time') {
    const centerIdxRaw = Number(outcome.centerIdx);
    const centerIdx = Number.isInteger(centerIdxRaw) && centerIdxRaw >= 0 ? centerIdxRaw : null;
    const triSrc = (outcome.tri && typeof outcome.tri === 'object') ? outcome.tri : null;
    const tri = triSrc
      ? {
          left: Number.isFinite(Number(triSrc.left)) ? Number(triSrc.left) : null,
          center: Number.isFinite(Number(triSrc.center)) ? Number(triSrc.center) : null,
          right: Number.isFinite(Number(triSrc.right)) ? Number(triSrc.right) : null
        }
      : null;
    const multiplier = Number(outcome.multiplier);
    return {
      type: t,
      centerIdx,
      tri,
      multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null
    };
  }

  return { type: t };
}

function wheelPickBonusOutcome(type) {
  const t = normWheelSeg(type);

  if (t === '50&50') {
    const goodPool = [5, 6, 7, 8, 9, 10, 12, 15];
    const badPool = [1.5, 2, 3, 4];
    const goodX = goodPool[Math.floor(Math.random() * goodPool.length)];
    const badX = badPool[Math.floor(Math.random() * badPool.length)];
    const pickGood = Math.random() < 0.5;
    return {
      type: t,
      pickGood,
      goodX,
      badX,
      multiplier: pickGood ? goodX : badX
    };
  }

  if (t === 'Loot Rush') {
    const pool = [];
    const pushN = (v, n) => { for (let i = 0; i < n; i++) pool.push(v); };
    pushN(1.1, 8);
    pushN(1.5, 6);
    pushN(2, 4);
    pushN(4, 3);
    pushN(8, 2);
    pushN(25, 1);
    const pickedIndex = Math.floor(Math.random() * pool.length);
    const multiplier = Number(pool[pickedIndex] || 1.1);
    return {
      type: t,
      pickedIndex,
      multiplier
    };
  }

  if (t === 'Wild Time') {
    const pattern = [2, 6, 14, 6, 2, 6, 14, 22];
    const sectors = pattern.concat(pattern, pattern); // 24
    const off = 2;
    const n = sectors.length;
    const mod = (x, m) => ((x % m) + m) % m;
    const valid = [];

    for (let i = 0; i < n; i++) {
      const left = sectors[mod(i - off, n)];
      const center = sectors[i];
      const right = sectors[mod(i + off, n)];
      if (!(left === center && center === right)) valid.push(i);
    }

    const centerIdx = valid.length
      ? valid[Math.floor(Math.random() * valid.length)]
      : Math.floor(Math.random() * n);

    const tri = {
      left: sectors[mod(centerIdx - off, n)],
      center: sectors[centerIdx],
      right: sectors[mod(centerIdx + off, n)]
    };

    const choiceIndex = Math.floor(Math.random() * 3);
    const triArr = [tri.left, tri.center, tri.right];

    return {
      type: t,
      centerIdx,
      choiceIndex,
      tri,
      multiplier: Number(triArr[choiceIndex] || tri.center)
    };
  }

  return { type: t, multiplier: null };
}

function wheelGetResultType() {
  return normWheelSeg(wheelGame.spin?.type || null);
}

function wheelResolveWinMultiplier(resultType) {
  const t = normWheelSeg(resultType);
  if (!t) return 0;

  if (Object.prototype.hasOwnProperty.call(WHEEL_SEGMENT_MULTIPLIERS, t)) {
    return Number(WHEEL_SEGMENT_MULTIPLIERS[t]);
  }

  if (WHEEL_BONUS_TYPES.has(t)) {
    const m = Number(
      wheelGame.bonus?.outcome?.multiplier ??
      wheelGame.settlement?.bonusOutcome?.multiplier
    );
    if (Number.isFinite(m) && m > 0) return m;
    const fallback = { '50&50': 2, 'Loot Rush': 5, 'Wild Time': 10 };
    if (Number.isFinite(fallback[t]) && fallback[t] > 0) return fallback[t];
  }

  return 0;
}

async function wheelSettleRound(roundId = wheelGame.roundId) {
  if (wheelGame.settlement && wheelGame.settlement.roundId === roundId) {
    return wheelGame.settlement;
  }
  if (wheelGame.settlementPromise) {
    return wheelGame.settlementPromise;
  }

  wheelGame.settlementPromise = (async () => {
    const resultType = wheelGetResultType();
    const multiplier = wheelResolveWinMultiplier(resultType);
    const settlement = {
      roundId,
      resultType,
      multiplier,
      bonusOutcome: wheelGame.bonus?.outcome || null,
      winnersCount: 0,
      paidTon: 0,
      paidStars: 0
    };

    if (!resultType || !Number.isFinite(multiplier) || multiplier <= 0) {
      wheelGame.settlement = settlement;
      return settlement;
    }

    for (const p of wheelGame.players.values()) {
      const userId = String(p.userId || '').trim();
      if (!userId) continue;

      const currency = (String(p.currency || 'ton').toLowerCase() === 'stars') ? 'stars' : 'ton';
      const betAmount = Number(p.segments.get(resultType) || 0);
      if (!Number.isFinite(betAmount) || betAmount <= 0) continue;

      const winAmount = roundWheelAmount(betAmount * multiplier, currency);
      if (!Number.isFinite(winAmount) || winAmount <= 0) continue;

      try {
        await db.updateBalance(
          userId,
          currency,
          winAmount,
          'wheel_win',
          `Wheel win (round ${roundId})`,
          { roundId, result: resultType, multiplier }
        );
        broadcastBalanceUpdate(userId);

        settlement.winnersCount += 1;
        if (currency === 'stars') settlement.paidStars += winAmount;
        else settlement.paidTon += winAmount;
      } catch (err) {
        console.error(`[Wheel] Failed to settle win for user ${userId} in round ${roundId}:`, err);
      }
    }

    settlement.paidTon = roundWheelAmount(settlement.paidTon, 'ton');
    settlement.paidStars = roundWheelAmount(settlement.paidStars, 'stars');
    wheelGame.settlement = settlement;
    return settlement;
  })();

  try {
    return await wheelGame.settlementPromise;
  } finally {
    wheelGame.settlementPromise = null;
  }
}

function buildWheelPlayersArray() {
  const order = ['1.1x','1.5x','5x','11x','50&50','Loot Rush','Wild Time'];

  const list = Array.from(wheelGame.players.values()).map(p => {
    const segEntries = Array.from(p.segments.entries())
      .map(([seg, amount]) => [normWheelSeg(seg), Number(amount || 0)])
      .filter(([seg, amount]) => seg && WHEEL_ALLOWED.has(seg) && Number.isFinite(amount) && amount > 0)
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([segment, amount]) => ({
        segment,
        amount: (p.currency === 'stars') ? Math.round(amount) : (Math.round(amount * 100) / 100)
      }));

    return {
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      currency: p.currency,
      totalAmount: p.totalAmount,
      segments: segEntries
    };
  });

  // Sort by bet size desc (Crash-style)
  list.sort((a, b) => Number(b.totalAmount || 0) - Number(a.totalAmount || 0));
  return list;
}

function buildWheelState(now = Date.now()) {
  const bettingLeftMs = (wheelGame.phase === 'betting')
    ? Math.max(0, (wheelGame.phaseStart + WHEEL_BETTING_TIME) - now)
    : null;

  let bonusData = null;
  if (wheelGame.bonus) {
    const elapsed = now - wheelGame.bonus.startedAt;
    const remaining = Math.max(0, wheelGame.bonus.endsAt - now);

    bonusData = {
      id: wheelGame.bonus.id,
      type: wheelGame.bonus.type,
      startedAt: wheelGame.bonus.startedAt,
      durationMs: wheelGame.bonus.durationMs,
      endsAt: wheelGame.bonus.endsAt,
      elapsedMs: elapsed,
      remainingMs: remaining,
      outcome: wheelBuildClientBonusOutcome(wheelGame.bonus.outcome)
    };
  }

  const settlement = (wheelGame.settlement && wheelGame.settlement.roundId === wheelGame.roundId)
    ? wheelGame.settlement
    : null;

  return {
    type: 'wheelState',
    serverTime: now,
    bettingTimeMs: WHEEL_BETTING_TIME,
    bettingLeftMs,
    phase: wheelGame.phase,
    phaseStart: wheelGame.phaseStart,
    roundId: wheelGame.roundId,
    gameCounter: wheelGame.roundId,
    roundHash: wheelGame.roundHash || "",
    spin: wheelGame.spin,
    bonus: bonusData,
    payoutMode: 'server',
    settlement: settlement ? {
      roundId: settlement.roundId,
      resultType: settlement.resultType,
      multiplier: settlement.multiplier,
      winnersCount: settlement.winnersCount,
      paidTon: settlement.paidTon,
      paidStars: settlement.paidStars
    } : null,
    players: buildWheelPlayersArray(),
    history: wheelGame.history.slice(0, 20),
    techPause: getPublicTechPauseState()
  };
}

function broadcastWheelState() {
  const payload = JSON.stringify(buildWheelState());
  wheelWss.clients.forEach(ws => wsSendSafe(ws, payload));
}

function wheelClearPhaseTimeout() {
  if (wheelGame.phaseTimeout) {
    clearTimeout(wheelGame.phaseTimeout);
    wheelGame.phaseTimeout = null;
  }
}

function wheelStartWaitingRound() {
  wheelClearPhaseTimeout();

  wheelGame.phase = 'waiting';
  wheelGame.phaseStart = Date.now();
  wheelGame.roundId += 1;
  wheelGame.roundHash = makeRoundHash(
    GAME_META_KEYS.wheel,
    wheelGame.roundId,
    `${wheelGame.phaseStart}:${crypto.randomBytes(8).toString("hex")}`
  );
  persistGameRoundMeta(GAME_META_KEYS.wheel, wheelGame.roundId, wheelGame.roundHash);
  cleanupWheelBetCredits(wheelGame.roundId);
  wheelGame.spin = null;
  wheelGame.bonus = null;
  wheelGame.settlement = null;
  wheelGame.settlementPromise = null;
  wheelGame.players.clear();

  broadcastWheelState();
}

function wheelStartBetting() {
  if (wheelGame.phase !== 'waiting') return;

  wheelClearPhaseTimeout();

  wheelGame.phase = 'betting';
  wheelGame.phaseStart = Date.now();

  broadcastWheelState();

  wheelGame.phaseTimeout = setTimeout(() => {
    wheelStartSpin();
  }, WHEEL_BETTING_TIME);
}

function wheelPickResult() {
  const sliceIndex = Math.floor(Math.random() * WHEEL_ORDER.length);
  const type = WHEEL_ORDER[sliceIndex];
  return { sliceIndex, type };
}

function wheelStartSpin() {
  if (wheelGame.phase !== 'betting') return;
  if ((wheelGame.players?.size || 0) <= 0) {
    wheelClearPhaseTimeout();
    wheelGame.phase = 'waiting';
    wheelGame.phaseStart = Date.now();
    broadcastWheelState();
    return;
  }

  wheelClearPhaseTimeout();

  wheelGame.phase = 'spin';
  wheelGame.phaseStart = Date.now();

  const { sliceIndex, type } = wheelPickResult();
  const decelMs = WHEEL_DECEL_MIN_MS + Math.floor(Math.random() * (WHEEL_DECEL_MAX_MS - WHEEL_DECEL_MIN_MS + 1));

  wheelGame.spin = {
    sliceIndex,
    type,
    accelMs: WHEEL_ACCEL_MS,
    decelMs,
    extraTurns: WHEEL_EXTRA_TURNS,
    spinStartAt: wheelGame.phaseStart,
    spinTotalMs: WHEEL_ACCEL_MS + decelMs
  };

  broadcastWheelState();

  wheelGame.phaseTimeout = setTimeout(() => {
    wheelSpinFinished();
  }, wheelGame.spin.spinTotalMs);
}

function wheelSpinFinished() {
  wheelClearPhaseTimeout();

  const resultType = wheelGame.spin?.type || null;

  // Update history once per spin
  if (resultType) {
    wheelGame.history.unshift(resultType);
    if (wheelGame.history.length > 20) wheelGame.history.length = 20;
  }

  // Bonus handling: pause game until bonus is over
  if (resultType && WHEEL_BONUS_TYPES.has(resultType)) {
    wheelStartBonus(resultType);
    return;
  }

  // Normal result: settle balances first, then show result phase.
  void wheelFinalizeRoundAndStartResult();
}

async function wheelFinalizeRoundAndStartResult() {
  wheelClearPhaseTimeout();
  const roundId = wheelGame.roundId;

  try {
    await wheelSettleRound(roundId);
  } catch (err) {
    console.error(`[Wheel] Settlement failed for round ${roundId}:`, err);
  }

  if (wheelGame.roundId !== roundId) return;
  wheelStartResultPhase();
}

function wheelStartResultPhase() {
  wheelClearPhaseTimeout();

  wheelGame.phase = 'result';
  wheelGame.phaseStart = Date.now();
  wheelGame.bonus = null;

  broadcastWheelState();

  wheelGame.phaseTimeout = setTimeout(() => {
    wheelStartWaitingRound();
  }, WHEEL_RESULT_TIME);
}

function wheelStartBonus(type) {
  wheelClearPhaseTimeout();

  const now = Date.now();
  const durationMs = Number(WHEEL_BONUS_TIME_BY_TYPE[type]) || WHEEL_BONUS_FALLBACK_MS;
  const outcome = wheelPickBonusOutcome(type);

  wheelGame.phase = 'bonus';
  wheelGame.phaseStart = now;
  wheelGame.bonus = {
    id: `${wheelGame.roundId}:${type}:${now}`,
    type,
    startedAt: now,
    durationMs,
    endsAt: now + durationMs,
    outcome
  };

  broadcastWheelState();

  wheelGame.phaseTimeout = setTimeout(() => {
    wheelEndBonus();
  }, durationMs);
}

function wheelEndBonus() {
  wheelClearPhaseTimeout();

  // After bonus: settle wins first, then show result, then next round.
  void wheelFinalizeRoundAndStartResult();
}

// WS: Wheel connections
wheelWss.on('connection', (ws) => {
  console.log('[Wheel WS] Client connected');
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  wsSendSafe(ws, JSON.stringify(buildWheelState()));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'placeBet') {
        if (isTechPauseBlockingActions()) {
          wsSendSafe(ws, JSON.stringify({
            type: 'error',
            code: TECH_PAUSE_ERROR_CODE,
            message: 'Technical pause is active',
            techPause: getPublicTechPauseState()
          }));
          return;
        }

        if (wheelGame.phase !== 'betting' && wheelGame.phase !== 'waiting') {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Betting closed' }));
          return;
        }

        const userId = String(msg.userId || '').trim();
        if (!userId) return;

        const initData = String(msg.initData || "");
        if (!initData || !process.env.BOT_TOKEN) {
          wsSendSafe(ws, JSON.stringify({ type: "error", message: "Unauthorized" }));
          return;
        }
        const initCheck = verifyInitData(initData, process.env.BOT_TOKEN, 24 * 60 * 60);
        if (!initCheck.ok) {
          wsSendSafe(ws, JSON.stringify({ type: "error", message: "Unauthorized" }));
          return;
        }
        let wsUser = null;
        try {
          wsUser = JSON.parse(initCheck.params.user || "null");
        } catch {
          wsUser = null;
        }
        if (!wsUser?.id || String(wsUser.id) !== userId) {
          wsSendSafe(ws, JSON.stringify({ type: "error", message: "Unauthorized" }));
          return;
        }

        const seg = normWheelSeg(msg.segment);
        if (!seg || !WHEEL_ALLOWED.has(seg)) return;

        const currency = (String(msg.currency || 'ton').toLowerCase() === 'stars') ? 'stars' : 'ton';
        let amount = Number(msg.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) return;

        if (currency === 'stars') amount = Math.round(amount);
        else amount = Math.round(amount * 100) / 100;

        // Bet must be pre-authorized by a successful wheel_bet debit for this round.
        if (!consumeWheelBetCredit(wheelGame.roundId, userId, currency, amount)) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Bet not authorized' }));
          return;
        }

        const name = String(msg.userName || 'Player').slice(0, 64);
        const avatar = msg.userAvatar ? String(msg.userAvatar).slice(0, 500) : null;
        const wasWaitingPhase = wheelGame.phase === 'waiting';

        let p = wheelGame.players.get(userId);
        if (!p) {
          p = { userId, name, avatar, currency, totalAmount: 0, segments: new Map() };
          wheelGame.players.set(userId, p);
        }

        if (name) p.name = name;
        if (avatar) p.avatar = avatar;

        if (p.currency !== currency) return;

        const prevSeg = Number(p.segments.get(seg) || 0);
        p.segments.set(seg, prevSeg + amount);

        p.totalAmount = (Number(p.totalAmount) || 0) + amount;
        if (currency === 'stars') p.totalAmount = Math.round(p.totalAmount);
        else p.totalAmount = Math.round(p.totalAmount * 100) / 100;

        if (wasWaitingPhase) {
          wheelStartBetting();
        } else {
          broadcastWheelState();
        }
      }

      if (msg.type === 'clearBets') {
        if (wheelGame.phase !== 'betting') return;
        const userId = String(msg.userId || '').trim();
        if (!userId) return;
        wheelGame.players.delete(userId);
        if ((wheelGame.players?.size || 0) <= 0) {
          wheelClearPhaseTimeout();
          wheelGame.phase = 'waiting';
          wheelGame.phaseStart = Date.now();
          broadcastWheelState();
          return;
        }
        broadcastWheelState();
      }

    } catch (e) {
      console.error('[Wheel WS] Message error:', e);
    }
  });
});

async function startGameLoops() {
  const crashMeta = await loadGameRoundMeta(GAME_META_KEYS.crash);
  crashGame.roundId = normalizeGameCounterValue(crashMeta.counter);
  crashGame.roundHash = normalizeRoundHashValue(crashMeta.hash);

  const wheelMeta = await loadGameRoundMeta(GAME_META_KEYS.wheel);
  wheelGame.roundId = normalizeGameCounterValue(wheelMeta.counter);
  wheelGame.roundHash = normalizeRoundHashValue(wheelMeta.hash);

  startCrashWaitingRound();
  wheelStartWaitingRound();
}

await startGameLoops();

function hasUnresolvedCrashBetsForTechPause() {
  const playersCount = Array.isArray(crashGame?.players) ? crashGame.players.length : 0;
  if (!playersCount) return false;
  return crashGame.phase === "waiting" || crashGame.phase === "betting" || crashGame.phase === "run";
}

function hasUnresolvedWheelBetsForTechPause() {
  const playersCount = wheelGame?.players?.size || 0;
  if (!playersCount) return false;
  return wheelGame.phase === "waiting" || wheelGame.phase === "betting" || wheelGame.phase === "spin" || wheelGame.phase === "bonus";
}

function resolveTechPauseMode(flagEnabled) {
  if (!flagEnabled) return TECH_PAUSE_MODE_OFF;
  if (hasUnresolvedCrashBetsForTechPause() || hasUnresolvedWheelBetsForTechPause()) {
    return TECH_PAUSE_MODE_DRAINING;
  }
  return TECH_PAUSE_MODE_ACTIVE;
}

function getPublicTechPauseState() {
  return {
    enabled: techPauseState.flagEnabled === true,
    mode: techPauseState.mode,
    isDraining: techPauseState.mode === TECH_PAUSE_MODE_DRAINING,
    isActive: techPauseState.mode === TECH_PAUSE_MODE_ACTIVE,
    blocking: techPauseState.mode === TECH_PAUSE_MODE_DRAINING || techPauseState.mode === TECH_PAUSE_MODE_ACTIVE,
    updatedAt: techPauseState.updatedAt,
    drainingStartedAt: techPauseState.drainingStartedAt || null,
    activatedAt: techPauseState.activatedAt || null
  };
}

function isTechPauseBlockingActions() {
  return techPauseState.mode === TECH_PAUSE_MODE_DRAINING || techPauseState.mode === TECH_PAUSE_MODE_ACTIVE;
}

function buildTechPauseApiErrorPayload() {
  const state = getPublicTechPauseState();
  return {
    ok: false,
    code: TECH_PAUSE_ERROR_CODE,
    error: state.isDraining
      ? "Technical pause is preparing. Please finish active rounds and try again later."
      : "Technical pause is active. Actions are temporarily disabled.",
    techPause: state
  };
}

function sendTechPauseToSseClient(client) {
  if (!client || typeof client.write !== "function") return false;
  try {
    const payload = JSON.stringify({
      type: "tech_pause",
      ...getPublicTechPauseState(),
      timestamp: Date.now()
    });
    client.write(`data: ${payload}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function broadcastTechPauseState() {
  const payload = JSON.stringify({
    type: "tech_pause",
    ...getPublicTechPauseState(),
    timestamp: Date.now()
  });

  balanceClients.forEach((clients, userId) => {
    if (!clients || !clients.size) return;
    for (const client of clients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch {
        try { clients.delete(client); } catch {}
      }
    }
    if (clients.size === 0) {
      try { balanceClients.delete(userId); } catch {}
    }
  });

  wss.clients.forEach((ws) => wsSendSafe(ws, payload));
  wheelWss.clients.forEach((ws) => wsSendSafe(ws, payload));
}

function applyTechPauseState(flagEnabled, source = "sync") {
  const enabled = flagEnabled === true;
  const prevMode = techPauseState.mode;
  const prevEnabled = techPauseState.flagEnabled;
  const now = Date.now();
  const shouldTriggerCaseRefundSweep = enabled && !prevEnabled;
  let nextMode = resolveTechPauseMode(enabled);

  if (enabled && prevMode === TECH_PAUSE_MODE_OFF && nextMode === TECH_PAUSE_MODE_ACTIVE) {
    nextMode = TECH_PAUSE_MODE_DRAINING;
  }
  if (
    enabled &&
    prevMode === TECH_PAUSE_MODE_DRAINING &&
    nextMode === TECH_PAUSE_MODE_ACTIVE &&
    techPauseState.drainingStartedAt > 0 &&
    now - techPauseState.drainingStartedAt < TECH_PAUSE_DRAINING_MIN_MS
  ) {
    nextMode = TECH_PAUSE_MODE_DRAINING;
  }

  if (prevMode === nextMode && prevEnabled === enabled) return false;

  techPauseState.flagEnabled = enabled;
  techPauseState.mode = nextMode;
  techPauseState.updatedAt = now;

  if (nextMode === TECH_PAUSE_MODE_DRAINING && prevMode !== TECH_PAUSE_MODE_DRAINING) {
    techPauseState.drainingStartedAt = techPauseState.updatedAt;
    techPauseState.activatedAt = 0;
  } else if (nextMode === TECH_PAUSE_MODE_ACTIVE && prevMode !== TECH_PAUSE_MODE_ACTIVE) {
    techPauseState.activatedAt = techPauseState.updatedAt;
    if (!techPauseState.drainingStartedAt) {
      techPauseState.drainingStartedAt = techPauseState.updatedAt;
    }
  } else if (nextMode === TECH_PAUSE_MODE_OFF) {
    techPauseState.drainingStartedAt = 0;
    techPauseState.activatedAt = 0;
  }

  console.log(`[TechPause] ${prevMode} -> ${nextMode} (flag=${enabled ? 1 : 0}, source=${source})`);
  if (shouldTriggerCaseRefundSweep) {
    triggerPendingCaseRoundRefundSweep(`tech_pause:${source}`);
  }
  broadcastTechPauseState();
  try { broadcastGameState(); } catch {}
  try { broadcastWheelState(); } catch {}
  return true;
}

async function syncTechPauseFromDb(source = "poll") {
  if (techPauseSyncPromise) return techPauseSyncPromise;

  techPauseSyncPromise = (async () => {
    try {
      if (typeof db?.getTechPauseFlag === "function") {
        const snapshot = await db.getTechPauseFlag();
        const enabled = Number(snapshot?.enabled) === 1 || snapshot?.enabled === true;
        applyTechPauseState(enabled, source);
        return;
      }
      applyTechPauseState(false, source);
    } catch (error) {
      console.error("[TechPause] sync error:", error?.message || error);
    }
  })().finally(() => {
    techPauseSyncPromise = null;
  });

  return techPauseSyncPromise;
}

function requireTechPauseActionsAllowed(req, res, next) {
  if (!isTechPauseBlockingActions()) return next();
  return res.status(503).json(buildTechPauseApiErrorPayload());
}

await syncTechPauseFromDb("startup");
setInterval(() => {
  syncTechPauseFromDb("poll").catch(() => {});
}, TECH_PAUSE_DB_POLL_MS);
setInterval(() => {
  if (!techPauseState.flagEnabled) return;
  applyTechPauseState(true, "tick");
}, 1000);




// --- Base settings
app.set("trust proxy", true);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

const PUBLIC_DIR = path.join(__dirname, "public");
const DIST_DIR = path.join(__dirname, "dist");
const HAS_DIST_BUILD = fs.existsSync(path.join(DIST_DIR, "index.html"));
const USE_DIST_IN_DEV = String(process.env.USE_DIST_IN_DEV || "1").trim() !== "0";
// Default to /dist in local/dev too (public/js/main.js is Vite source and may white-screen without bundling).
const FRONTEND_DIR = (HAS_DIST_BUILD && (IS_PROD || USE_DIST_IN_DEV)) ? DIST_DIR : PUBLIC_DIR;
const FRONTEND_INDEX_PATH = path.join(FRONTEND_DIR, "index.html");
console.log(`[Static] Frontend dir: ${FRONTEND_DIR} (IS_PROD=${IS_PROD}, HAS_DIST_BUILD=${HAS_DIST_BUILD}, USE_DIST_IN_DEV=${USE_DIST_IN_DEV})`);
console.log(`[Static] Frontend test mode: ${FRONTEND_TEST_MODE}`);

function renderIndexHtmlWithRuntimeFlags() {
  try {
    const raw = fs.readFileSync(FRONTEND_INDEX_PATH, "utf8");
    const runtimeScript = `<script>window.__SERVER_TEST_MODE=${FRONTEND_TEST_MODE ? "true" : "false"};window.TEST_MODE=window.__SERVER_TEST_MODE;</script>`;
    if (raw.includes("__SERVER_TEST_MODE")) return raw;
    if (raw.includes("<head>")) {
      return raw.replace("<head>", `<head>\n    ${runtimeScript}`);
    }
    return `${runtimeScript}\n${raw}`;
  } catch (e) {
    console.warn("[Static] Failed to render runtime flags:", e?.message || e);
    return null;
  }
}

// --- Static frontend
app.use(express.static(FRONTEND_DIR, {
  index: false,
  extensions: ["html"],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".json")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
  }
}));

// Keep legacy public assets available when running built frontend from /dist.
if (FRONTEND_DIR !== PUBLIC_DIR) {
  app.use(express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".json")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
    }
  }));
}

// --- Market images (persist on Render under /opt/render/project/data)
const MARKET_GIFTS_IMG_DIR =
  process.env.MARKET_GIFTS_IMG_DIR ||
  (process.env.NODE_ENV === "production"
    ? "/opt/render/project/data/marketnfts"
    : path.join(__dirname, "public", "images", "gifts", "marketnfts"));

try { fs.mkdirSync(MARKET_GIFTS_IMG_DIR, { recursive: true }); } catch {}

// Serve relayer-uploaded images (works even if they are NOT inside /public)
app.use("/images/gifts/marketnfts", express.static(MARKET_GIFTS_IMG_DIR, {
  fallthrough: true,
  maxAge: "1h"
}));

function safeMarketFileBase(s) {
  return String(s || "gift")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "gift";
}

function saveMarketImageFromData(imageData, baseName = "gift") {
  const s = String(imageData || "").trim();
  const m = s.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return "";
  const mime = String(m[1] || "").toLowerCase();
  const b64 = String(m[2] || "");
  let buf;
  try { buf = Buffer.from(b64, "base64"); } catch { return ""; }

  // Hard limit to protect server (base64 usually ~1.33x bigger than file)
  if (!buf || !buf.length || buf.length > 4 * 1024 * 1024) return "";

  let ext = ".bin";
  if (mime.includes("png")) ext = ".png";
  else if (mime.includes("jpeg") || mime.includes("jpg")) ext = ".jpg";
  else if (mime.includes("webp")) ext = ".webp";
  else if (mime.includes("gif")) ext = ".gif";

  const fileName = `${safeMarketFileBase(baseName)}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}${ext}`;
  const outPath = path.join(MARKET_GIFTS_IMG_DIR, fileName);

  try {
    fs.writeFileSync(outPath, buf);
    return `/images/gifts/marketnfts/${fileName}`;
  } catch (e) {
    console.error("[MarketStore] image save error:", e);
    return "";
  }
}

function marketImageExtFromMimeOrUrl(mimeRaw, urlRaw) {
  const mime = String(mimeRaw || "").toLowerCase();
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";

  const url = String(urlRaw || "").toLowerCase();
  if (url.includes(".png")) return ".png";
  if (url.includes(".jpeg") || url.includes(".jpg")) return ".jpg";
  if (url.includes(".webp")) return ".webp";
  if (url.includes(".gif")) return ".gif";
  return ".jpg";
}

function safeMarketRemoteImageUrl(rawUrl) {
  const s = String(rawUrl || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    const host = String(u.hostname || "").toLowerCase();
    const isTelegramCdn =
      host === "telesco.pe" ||
      host.endsWith(".telesco.pe") ||
      /^cdn\d+\.telesco\.pe$/i.test(host);
    const isFragmentPreview = host === "nft.fragment.com";
    if (!isTelegramCdn && !isFragmentPreview) return "";
    return u.toString();
  } catch {
    return "";
  }
}

async function saveMarketImageFromRemoteUrl(imageUrl, baseName = "gift", { timeoutMs = 12_000 } = {}) {
  const safeUrl = safeMarketRemoteImageUrl(imageUrl);
  if (!safeUrl) return "";

  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort("timeout"); } catch {} }, timeoutMs) : null;
  try {
    const res = await fetch(safeUrl, {
      method: "GET",
      headers: {
        "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "referer": "https://t.me/"
      },
      signal: ctrl ? ctrl.signal : undefined
    });
    if (!res.ok) return "";
    const ctype = String(res.headers.get("content-type") || "").toLowerCase();
    if (ctype && !ctype.includes("image/")) return "";

    const ab = await res.arrayBuffer();
    if (!ab || !ab.byteLength) return "";
    if (ab.byteLength > 4 * 1024 * 1024) return "";

    const ext = marketImageExtFromMimeOrUrl(res.headers.get("content-type"), safeUrl);
    const fileName = `${safeMarketFileBase(baseName)}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}${ext}`;
    const outPath = path.join(MARKET_GIFTS_IMG_DIR, fileName);
    fs.writeFileSync(outPath, Buffer.from(ab));
    return `/images/gifts/marketnfts/${fileName}`;
  } catch (e) {
    console.warn("[MarketStore] remote image save warning:", e?.message || e);
    return "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}



function broadcastTick() {
  // Keep ticks tiny (clients interpolate)
  const msg = JSON.stringify({
    type: 'tick',
    roundId: crashGame.roundId,
    phase: crashGame.phase,
    currentMult: crashGame.currentMult
  });

  wss.clients.forEach(ws => wsSendSafe(ws, msg));
}



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
  // Prevent caching in Telegram WebView / proxies
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");

  const limit = clampHistoryLimit(req.query.limit);
  return res.json({ ok: true, items: casesHistory.slice(0, limit) });
});

// POST one or multiple history entries
app.post("/api/cases/history", (req, res) => {
  try {
    const { userId, initData, entries } = req.body || {};
    // Optional initData verification. NOTE: Telegram initData has auth_date and can become "too old"
    // while the user keeps the WebApp open. For history feed we don't want to break UX,
    // so we verify when possible, but we do NOT reject on failure/expiration.
    if (initData && process.env.BOT_TOKEN) {
      const check = verifyInitData(initData, process.env.BOT_TOKEN, 365 * 24 * 60 * 60);
      if (!check.ok) {
        console.warn('[cases.history] invalid/expired initData (accepted)');
      }
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



// ==============================
// GIFT PRICES CACHE (in-memory)
// ==============================
// NOTE: In-memory cache with disk snapshot restore to survive restarts when possible.
const GIFT_REFRESH_MS = Math.max(60_000, Number(process.env.GIFT_REFRESH_MS || (24 * 60 * 60 * 1000)) || (24 * 60 * 60 * 1000)); // 1 day
const GIFT_BOOTSTRAP_RETRY_MS = Math.max(60_000, Math.min(GIFT_REFRESH_MS, Number(process.env.GIFT_BOOTSTRAP_RETRY_MS || (5 * 60 * 1000)) || (5 * 60 * 1000)));
const GIFT_CATALOG_REFRESH_MS = 6 * 60 * 60 * 1000; // every 6 hours (catalog changes not that often)
const GIFT_REQUEST_TIMEOUT_MS = 15_000;
const GIFT_SOURCE_BLOCK_COOLDOWN_MS = Math.max(5 * 60 * 1000, Number(process.env.GIFT_SOURCE_BLOCK_COOLDOWN_MS || (24 * 60 * 60 * 1000)) || (24 * 60 * 60 * 1000));
const GIFT_SOURCE_RATE_LIMIT_COOLDOWN_MS = Math.max(60_000, Number(process.env.GIFT_SOURCE_RATE_LIMIT_COOLDOWN_MS || (6 * 60 * 60 * 1000)) || (6 * 60 * 60 * 1000));
const GIFT_SOURCE_TRANSIENT_COOLDOWN_MS = Math.max(60_000, Number(process.env.GIFT_SOURCE_TRANSIENT_COOLDOWN_MS || (60 * 60 * 1000)) || (60 * 60 * 1000));
const GIFTS_PRICE_CACHE_PATH =
  process.env.GIFTS_PRICE_CACHE_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/opt/render/project/data/gifts-prices-cache.json"
    : path.join(__dirname, "data", "gifts-prices-cache.json"));

let giftsCatalog = [
  "Stellar Rocket",
  "Instant Ramen",
  "Ice Cream",
    "Berry Box",
    "Lol Pop",
    "Cookie Heart",
    "Mousse Cake",
      "Electric Skull",
      "Vintage Cigar",
      "Voodoo Doll",
      "Flying Broom",
      "Hex Pot",
        "Mighty Arm",
        "Scared Cat",
        "Bonded Ring",
        "Genie Lamp",
        "Jack-in-the-Box",
        "Winter Wreath",
        "Snoop Dogg",
        "Neko Helmet",
        "Pet Snake",
        "Bow Tie",
        "Restless Jar",
        "Xmas Stocking",
          "Pool Float",
          "Chill Flame",
          "Jolly Chimp",
          "Gem Signet",
          "Timeless Book",
          "Astral Shard",
          "Perfume Bottle",
          "Precious Peach",
          "Signet Ring",
          "Plush Pepe",
          "Heroic Helmet",
          "Durov's Cap",
          "Mood Pack",
          "B-Day Candle",
          "Snake Box",
          "Lunar Snake",
          "Happy Brownie",
          "Ginger Cookie",
          "Whip Cupcake",
          "Desk Calendar",
          "Fresh Socks",
          "Jester Hat"

];
  
 // tracked gift collection names (strings)
let giftsPrices = new Map(); // name -> { priceTon, updatedAt, source }
let giftsLastUpdate = 0;
let giftsLastAttemptAt = 0;
let giftsCatalogLastUpdate = 0;

// Relayer fallback cache (optional)
// Relayer pushes prices derived from Telegram MTProto (payments.getStarGifts / payments.getResaleStarGifts).
// Used ONLY when direct marketplace fetches (portal-market / tonnel) are blocked.
const GIFT_RELAYER_FALLBACK = !/^(0|false|no)$/i.test(String(process.env.GIFT_RELAYER_FALLBACK || "1"));
const GIFT_RELAYER_STALE_MS = Math.max(
  60_000,
  Math.min(7 * 24 * 60 * 60 * 1000, Number(process.env.GIFT_RELAYER_STALE_MS || 6 * 60 * 60 * 1000) || (6 * 60 * 60 * 1000))
);

// key: lowercased gift name
let giftsRelayerPrices = new Map(); // key -> { priceTon?, priceStars?, updatedAt, source }
let giftsRelayerLastPush = 0;
let giftsSourceCooldowns = new Map(); // source -> { until, reason }
let getGemsSnapshotCache = { updatedAt: 0, html: "", error: "" };

// small helper
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithTimeout(url, opts = {}, timeoutMs = GIFT_REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function ensureGiftsPriceCacheDir() {
  try {
    const dir = path.dirname(GIFTS_PRICE_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn("[gifts] cache dir ensure failed:", e?.message || e);
  }
}

function persistGiftsPriceState() {
  try {
    ensureGiftsPriceCacheDir();
    const payload = {
      updatedAt: giftsLastUpdate || 0,
      catalogUpdatedAt: giftsCatalogLastUpdate || 0,
      prices: Array.from(giftsPrices.entries()).map(([name, value]) => ({ name, ...value })),
      relayerUpdatedAt: giftsRelayerLastPush || 0,
      relayerPrices: Array.from(giftsRelayerPrices.entries()).map(([name, value]) => ({ name, ...value }))
    };
    const tmp = `${GIFTS_PRICE_CACHE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmp, GIFTS_PRICE_CACHE_PATH);
    return true;
  } catch (e) {
    console.warn("[gifts] cache write failed:", e?.message || e);
    return false;
  }
}

function restoreGiftsPriceState() {
  try {
    ensureGiftsPriceCacheDir();
    if (!fs.existsSync(GIFTS_PRICE_CACHE_PATH)) return false;

    const raw = fs.readFileSync(GIFTS_PRICE_CACHE_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    const priceItems = Array.isArray(data?.prices) ? data.prices : [];
    const relayerItems = Array.isArray(data?.relayerPrices) ? data.relayerPrices : [];

    for (const it of priceItems) {
      const name = normalizeGiftName(it?.name || "");
      const priceTon = Number(it?.priceTon ?? it?.price_ton ?? it?.price ?? null);
      const updatedAt = Number(it?.updatedAt || data?.updatedAt || 0);
      const source = String(it?.source || "cache").slice(0, 64);
      if (!name || !Number.isFinite(priceTon) || priceTon <= 0) continue;
      giftsPrices.set(name, { priceTon, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0, source });
    }

    for (const it of relayerItems) {
      const key = giftKey(it?.name || "");
      const priceTon = Number(it?.priceTon ?? it?.price_ton ?? null);
      const priceStars = Number(it?.priceStars ?? it?.price_stars ?? null);
      const updatedAt = Number(it?.updatedAt || data?.relayerUpdatedAt || 0);
      const source = String(it?.source || "cache").slice(0, 64);
      const hasTon = Number.isFinite(priceTon) && priceTon > 0;
      const hasStars = Number.isFinite(priceStars) && priceStars > 0;
      if (!key || (!hasTon && !hasStars)) continue;
      giftsRelayerPrices.set(key, {
        priceTon: hasTon ? priceTon : null,
        priceStars: hasStars ? priceStars : null,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
        source
      });
    }

    const restoredUpdatedAt = Number(data?.updatedAt || 0);
    const restoredCatalogUpdatedAt = Number(data?.catalogUpdatedAt || 0);
    const restoredRelayerUpdatedAt = Number(data?.relayerUpdatedAt || 0);

    if (Number.isFinite(restoredUpdatedAt) && restoredUpdatedAt > 0) giftsLastUpdate = restoredUpdatedAt;
    if (Number.isFinite(restoredCatalogUpdatedAt) && restoredCatalogUpdatedAt > 0) giftsCatalogLastUpdate = restoredCatalogUpdatedAt;
    if (Number.isFinite(restoredRelayerUpdatedAt) && restoredRelayerUpdatedAt > 0) giftsRelayerLastPush = restoredRelayerUpdatedAt;

    if (giftsPrices.size || giftsRelayerPrices.size) {
      console.log(`[gifts] cache restored: direct=${giftsPrices.size} relayer=${giftsRelayerPrices.size}`);
    }

    return true;
  } catch (e) {
    console.warn("[gifts] cache restore failed:", e?.message || e);
    return false;
  }
}

function getGiftSourceCooldown(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  const cur = giftsSourceCooldowns.get(key);
  if (!cur) return null;
  if (Number(cur.until || 0) <= Date.now()) {
    giftsSourceCooldowns.delete(key);
    return null;
  }
  return cur;
}

function clearGiftSourceCooldown(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return;
  giftsSourceCooldowns.delete(key);
}

function classifyGiftSourceCooldown(kindOrStatus) {
  const raw = String(kindOrStatus || "").trim().toLowerCase();
  const status = Number(kindOrStatus);

  if (raw === "auth" || status === 401 || status === 403) {
    return { kind: "auth", ms: GIFT_SOURCE_BLOCK_COOLDOWN_MS };
  }
  if (raw === "rate_limit" || status === 429) {
    return { kind: "rate_limit", ms: GIFT_SOURCE_RATE_LIMIT_COOLDOWN_MS };
  }
  return { kind: "transient", ms: GIFT_SOURCE_TRANSIENT_COOLDOWN_MS };
}

function blockGiftSource(name, reason, kindOrStatus = "") {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;

  const cooldown = classifyGiftSourceCooldown(kindOrStatus);
  giftsSourceCooldowns.set(key, {
    until: Date.now() + cooldown.ms,
    reason: String(reason || cooldown.kind).slice(0, 180)
  });
  return cooldown;
}

function createGiftSourceError(message, extras = {}) {
  const err = new Error(String(message || "gift source error"));
  Object.assign(err, extras);
  return err;
}

function normalizeGiftName(s) {
  return String(s || "").trim();
}


function giftKey(name) {
  return String(name || "").trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getGiftNameVariants(name) {
  const base = normalizeGiftName(name);
  const out = new Set();
  if (base) out.add(base);
  if (base && !base.endsWith("s")) out.add(`${base}s`);
  return Array.from(out);
}

async function fetchGetGemsSnapshot(baseHeaders, force = false) {
  const now = Date.now();
  if (!force && getGemsSnapshotCache.html && (now - getGemsSnapshotCache.updatedAt) < GIFT_REFRESH_MS) {
    return getGemsSnapshotCache.html;
  }

  let res = null;
  try {
    res = await fetchWithTimeout(
      "https://getgems.io/",
      { headers: { ...baseHeaders, referer: "https://getgems.io/", origin: "https://getgems.io" } }
    );
  } catch (e) {
    throw createGiftSourceError(`Getgems fetch failed: ${e?.message || e}`, {
      blockSource: true,
      cooldownKind: "transient"
    });
  }

  if (!res.ok) {
    let body = "";
    try { body = (await res.text()).slice(0, 180); } catch {}
    throw createGiftSourceError(
      `Getgems status ${res.status}${body ? `: ${body}` : ""}`,
      { status: res.status, blockSource: true, cooldownKind: res.status }
    );
  }

  const html = await res.text();
  if (!html || html.length < 256) {
    throw createGiftSourceError("Getgems returned an empty page", {
      blockSource: true,
      cooldownKind: "transient"
    });
  }

  getGemsSnapshotCache = { updatedAt: now, html, error: "" };
  return html;
}

function parseGetGemsPriceFromHtml(html, giftName) {
  const text = String(html || "");
  if (!text) return null;

  const field = String.raw`(?:floorPrice|floor_price|floor)`;
  const number = String.raw`"?([0-9]+(?:[.,][0-9]+)?)"?`;

  for (const variant of getGiftNameVariants(giftName)) {
    const escaped = escapeRegExp(variant);
    const patterns = [
      new RegExp(`"(?:name|title|collectionName)"\\s*:\\s*"${escaped}"[\\s\\S]{0,320}?"${field}"\\s*:\\s*${number}`, "i"),
      new RegExp(`"${field}"\\s*:\\s*${number}[\\s\\S]{0,320}"(?:name|title|collectionName)"\\s*:\\s*"${escaped}"`, "i")
    ];

    for (const rx of patterns) {
      const m = text.match(rx);
      const raw = m?.[1] ?? null;
      const price = Number(String(raw || "").replace(",", "."));
      if (Number.isFinite(price) && price > 0) return price;
    }
  }

  return null;
}

restoreGiftsPriceState();

function getRelayerPriceEntry(name) {
  return giftsRelayerPrices.get(giftKey(name)) || null;
}

function computeRelayerPriceTon(entry, tonUsd) {
  if (!entry) return null;

  const pTon = Number(entry.priceTon);
  if (Number.isFinite(pTon) && pTon > 0) return pTon;

  const pStars = Number(entry.priceStars);
  if (Number.isFinite(pStars) && pStars > 0) {
    const usd = Number(tonUsd);
    if (Number.isFinite(usd) && usd > 0) {
      return starsToTon(pStars, usd);
    }
  }

  return null;
}

function computeRelayerPriceStars(entry, tonUsd) {
  if (!entry) return null;

  const pStars = Number(entry.priceStars);
  if (Number.isFinite(pStars) && pStars > 0) return Math.max(1, Math.round(pStars));

  const pTon = Number(entry.priceTon);
  if (Number.isFinite(pTon) && pTon > 0) {
    const converted = tonToStars(pTon, tonUsd);
    if (Number.isFinite(converted) && converted > 0) return converted;
  }

  return null;
}

// ==============================
// GiftAsset aggregated gift prices (optional)
// ==============================
// Why: many marketplaces (portals/tonnel) often return 403 / require Telegram authData or block server-side fetches.
// GiftAsset provides an aggregated price list (collection floors) across providers in one request.
const GIFT_PRICE_PROVIDER = String(process.env.GIFT_PRICE_PROVIDER || "direct").toLowerCase(); // auto | giftasset | direct
const GIFTASSET_BASE = String(process.env.GIFTASSET_BASE || "https://giftasset.pro").replace(/\/+$/, "");
const GIFTASSET_TIMEOUT_MS = Math.max(3000, Math.min(60000, Number(process.env.GIFTASSET_TIMEOUT_MS || 15000) || 15000));
// Some deployments may require a key; docs mention contacting for a test key. If you have one, set GIFTASSET_API_KEY.
const GIFTASSET_API_KEY = String(process.env.GIFTASSET_API_KEY || process.env.GIFTASSET_KEY || "").trim();

let giftAssetCache = {
  updatedAt: 0,
  data: null,
  error: ""
};

function giftAssetHeaders() {
  const h = { "accept": "application/json", "user-agent": "Mozilla/5.0" };
  if (GIFTASSET_API_KEY) {
    // We don't know the exact auth header contract for all endpoints, so we send the common variants.
    h["x-api-key"] = GIFTASSET_API_KEY;
    h["authorization"] = `Bearer ${GIFTASSET_API_KEY}`;
  }
  return h;
}

async function fetchGiftAssetPriceList(force = false) {
  const now = Date.now();
  if (!force && giftAssetCache.data && (now - giftAssetCache.updatedAt) < 5 * 60 * 1000) return giftAssetCache.data;

  const url = `${GIFTASSET_BASE}/api/v1/gifts/get_gifts_price_list`;
  const res = await fetchWithTimeout(url, { headers: giftAssetHeaders() }, GIFTASSET_TIMEOUT_MS);
  if (!res.ok) {
    // try to read a small body snippet for debugging (donвЂ™t blow logs)
    let body = "";
    try { body = (await res.text()).slice(0, 250); } catch {}
    blockGiftSource("giftasset", `GiftAsset status ${res.status}`, res.status);
    throw new Error(`GiftAsset status ${res.status}${body ? `: ${body}` : ""}`);
  }
  const j = await res.json();
  if (!j || typeof j !== "object") throw new Error("GiftAsset response is not JSON object");
  if (!j.collection_floors || typeof j.collection_floors !== "object") throw new Error("GiftAsset response missing collection_floors");

  giftAssetCache = { updatedAt: now, data: j, error: "" };
  return j;
}

function pickBestFloorFromGiftAsset(entry) {
  if (!entry || typeof entry !== "object") return null;
  // Providers typically present in GiftAsset docs: portals / tonnel / getgems (and sometimes mrkt).
  const providerOrder = ["portals", "tonnel", "getgems", "mrkt"];
  let best = null;
  for (const p of providerOrder) {
    const v = Number(entry[p]);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (!best || v < best.priceTon) best = { provider: p, priceTon: v };
  }
  return best;
}

async function refreshGiftsPricesFromGiftAsset() {
  if (!giftsCatalog.length) await refreshGiftsCatalogStatic();

  const now = Date.now();
  const j = await fetchGiftAssetPriceList(true);
  const floors = j.collection_floors || {};
  let updated = 0;

  for (const giftName of giftsCatalog) {
    const key = String(giftName || "").trim();
    const entry = floors[key] || floors[normalizeGiftName(key)] || null;
    const best = pickBestFloorFromGiftAsset(entry);
    if (!best) continue;

    giftsPrices.set(giftName, {
      priceTon: best.priceTon,
      updatedAt: now,
      source: `giftasset:${best.provider}`
    });
    updated++;
  }

  if (updated > 0) {
    giftsLastUpdate = now;
    clearGiftSourceCooldown("giftasset");
    persistGiftsPriceState();
  }
  return updated;
}


// ==============================
// TON -> USD -> Telegram Stars RATE (in-memory)
// ==============================
// Used to show "fair" Stars prices in the mini-app based on TON market price.
// 1 Star ~= $0.013 (Telegram official for in-app purchases). You can override via env.
const STARS_USD = Number(process.env.STARS_USD || process.env.STARS_USD_PRICE || process.env.STAR_USD || 0.013);
const STARS_MARKUP_MULTIPLIER = Math.max(1, Number(process.env.STARS_MARKUP_MULTIPLIER || 1.25) || 1.25);
const STARS_PER_TON_FALLBACK = Math.max(1, Number(process.env.STARS_PER_TON_FALLBACK || 115) || 115);
const TON_USD_REFRESH_MS = 24 * 60 * 60 * 1000; // 24h
const TON_USD_ERROR_RETRY_MS = Math.max(60_000, Math.min(TON_USD_REFRESH_MS, Number(process.env.TON_USD_ERROR_RETRY_MS || (30 * 60 * 1000)) || (30 * 60 * 1000)));
const TON_USD_TIMEOUT_MS = 12_000;

let tonUsdCache = {
  tonUsd: null,      // number
  updatedAt: 0,      // ms
  lastAttemptAt: 0,  // ms
  source: "",        // string
  error: ""          // string
};
let tonUsdRefreshPromise = null;

function clampFinite(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

async function fetchTonUsdFromCoinGecko() {
  // Try both IDs to be safe (CoinGecko has used both "toncoin" and "the-open-network")
  const ids = ["toncoin", "the-open-network"];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`;
  const res = await fetchWithTimeout(url, { headers: { "accept": "application/json" } }, TON_USD_TIMEOUT_MS);
  if (!res.ok) throw new Error(`CoinGecko status ${res.status}`);
  const j = await res.json();

  let price = null;
  for (const id of ids) {
    const p = clampFinite(j?.[id]?.usd);
    if (p && p > 0) { price = p; break; }
  }
  if (!price) throw new Error("CoinGecko response missing TON usd price");
  return { tonUsd: price, source: "coingecko" };
}

async function refreshTonUsdRate(force = false) {
  const now = Date.now();

  // Keep last good value until a successful refresh.
  if (!force && tonUsdCache.updatedAt && (now - tonUsdCache.updatedAt) < TON_USD_REFRESH_MS && tonUsdCache.tonUsd) {
    return tonUsdCache;
  }

  // After a failed or stale refresh attempt, avoid hammering CoinGecko on every request.
  if (!force && tonUsdCache.lastAttemptAt && (now - tonUsdCache.lastAttemptAt) < TON_USD_ERROR_RETRY_MS) {
    return tonUsdCache;
  }

  if (tonUsdRefreshPromise) {
    await tonUsdRefreshPromise;
    return tonUsdCache;
  }

  tonUsdRefreshPromise = fetchTonUsdFromCoinGecko();

  try {
    const r = await tonUsdRefreshPromise;
    tonUsdCache = {
      tonUsd: r.tonUsd,
      updatedAt: now,
      lastAttemptAt: now,
      source: r.source,
      error: ""
    };
    console.log(`[rates] вњ… TON/USD updated: ${r.tonUsd} (${r.source})`);
  } catch (e) {
    tonUsdCache = {
      ...tonUsdCache,
      lastAttemptAt: now,
      error: String(e?.message || e)
    };
    console.warn("[rates] вљ пёЏ TON/USD update failed:", tonUsdCache.error);
  } finally {
    tonUsdRefreshPromise = null;
  }

  return tonUsdCache;
}

async function getTonUsdRate() {
  return await refreshTonUsdRate(false);
}

function tonToStars(tonAmount, tonUsd = tonUsdCache.tonUsd) {
  const ton = Number(tonAmount);
  if (!Number.isFinite(ton) || ton <= 0) return null;

  const spt = starsPerTon(tonUsd);
  if (!Number.isFinite(spt) || spt <= 0) return null;

  return Math.max(1, Math.ceil((ton * spt) - 1e-9));
}


function starsToTon(starsAmount, tonUsd = tonUsdCache.tonUsd) {
  const stars = Number(starsAmount);
  const usd = Number(tonUsd);
  if (!Number.isFinite(stars) || stars <= 0) return null;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (!Number.isFinite(STARS_USD) || STARS_USD <= 0) return null;

  // stars -> USD -> TON
  return (stars * STARS_USD) / usd;
}


function starsPerTon(tonUsd = tonUsdCache.tonUsd) {
  const usd = Number(tonUsd);
  let base = null;

  if (Number.isFinite(usd) && usd > 0 && Number.isFinite(STARS_USD) && STARS_USD > 0) {
    base = usd / STARS_USD;
  } else {
    const fallback = Number(STARS_PER_TON_FALLBACK);
    if (Number.isFinite(fallback) && fallback > 0) base = fallback;
  }

  if (!Number.isFinite(base) || base <= 0) return null;
  return base * STARS_MARKUP_MULTIPLIER;
}

// Scheduler: refresh TON/USD once a day with jitter.
(function startTonUsdScheduler() {
  const firstDelay = 3000 + Math.floor(Math.random() * 20_000);
  setTimeout(async () => {
    await refreshTonUsdRate(true);
    setInterval(() => refreshTonUsdRate(true), TON_USD_REFRESH_MS);
  }, firstDelay);
})();


// (A) РљР°С‚Р°Р»РѕРі:
// Р’ Portals РµСЃС‚СЊ РѕС‚РєСЂС‹С‚С‹Р№ endpoint РґР»СЏ РїРѕРёСЃРєР° РєРѕР»Р»РµРєС†РёР№, РЅРѕ РїРѕР»РЅРѕС†РµРЅРЅС‹Р№ "Р»РёСЃС‚ РІСЃРµС… РєРѕР»Р»РµРєС†РёР№"
// РѕР±С‹С‡РЅРѕ Р·Р°РІСЏР·Р°РЅ РЅР° mini-app/auth. РџРѕСЌС‚РѕРјСѓ РІ MVP РґРµСЂР¶РёРј СЃРїРёСЃРѕРє РѕС‚СЃР»РµР¶РёРІР°РµРјС‹С… РїРѕРґР°СЂРєРѕРІ РІСЂСѓС‡РЅСѓСЋ
// (СЃРј. giftsCatalog РІС‹С€Рµ). Р•СЃР»Рё Р·Р°С…РѕС‡РµС€СЊ РјРѕРЅРёС‚РѕСЂРёС‚СЊ РІРѕРѕР±С‰Рµ Р’РЎР• РїРѕРґР°СЂРєРё вЂ” РґРѕР±Р°РІРёРј РѕС‚РґРµР»СЊРЅС‹Р№ РєР°С‚Р°Р»РѕРі.
async function refreshGiftsCatalogStatic() {
  giftsCatalog = (Array.isArray(giftsCatalog) ? giftsCatalog : []).map(normalizeGiftName).filter(Boolean);
  giftsCatalogLastUpdate = Date.now();
  return giftsCatalog.length;
}

// (B) Р¦РµРЅС‹: Portals collections endpoint (Р±РµР· auth) вЂ” Р±РµСЂС‘Рј floor_price РїРѕ РїРѕРёСЃРєСѓ.
// РСЃС‚РѕС‡РЅРёРє: РїСЂРёРјРµСЂ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ /api/collections?search=...&limit=10 -> collections[0].floor_price
// Р¤РѕР»Р»Р±СЌРє: РµСЃР»Рё РїРѕСЂС‚Р°Р» РЅРµРґРѕСЃС‚СѓРїРµРЅ, РёСЃРїРѕР»СЊР·СѓРµРј market.tonnel.network
async function refreshGiftsPricesFromPortalsLegacy() {
  if (!giftsCatalog.length) {
    await refreshGiftsCatalogStatic();
  }

  const now = Date.now();
  let updatedCount = 0;

  // Some marketplaces rate-limit / block bots. We use browser-like headers and small jitter.
  const baseHeaders = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,ru;q=0.8",
    "cache-control": "no-cache",
    "pragma": "no-cache"
  };

  const disableTonnel = !/^(0|false|no)$/i.test(String(process.env.DISABLE_TONNEL_PRICES || "1").trim());

  for (const giftName of giftsCatalog) {
    const q = normalizeGiftName(giftName);
    if (!q) continue;

    const sources = [
      {
        name: "portal-market.com",
        url: `https://portal-market.com/api/collections?search=${encodeURIComponent(q)}&limit=10`,
        headers: { ...baseHeaders, "referer": "https://portal-market.com/", "origin": "https://portal-market.com" }
      },
      ...(disableTonnel ? [] : [{
        name: "market.tonnel.network",
        url: `https://market.tonnel.network/api/collections?search=${encodeURIComponent(q)}&limit=10`,
        headers: { ...baseHeaders, "referer": "https://market.tonnel.network/", "origin": "https://market.tonnel.network" }
      }])
    ];

    let priceFound = false;

    for (const source of sources) {
      if (priceFound) break;

      try {
        const res = await fetchWithTimeout(source.url, { headers: source.headers });
        if (!res.ok) {
          // 403 is common for Tonnel / WAF-protected endpoints.
          console.warn(`[gifts] ${source.name} returned status ${res.status} for ${q}`);
          continue;
        }

        const ct = String(res.headers?.get?.("content-type") || "");
        if (ct.includes("text/html")) {
          // Often a WAF / Cloudflare challenge.
          console.warn(`[gifts] ${source.name} returned HTML (likely blocked) for ${q}`);
          continue;
        }

        const data = await res.json();

        const cols = Array.isArray(data?.collections) ? data.collections
                  : Array.isArray(data?.items) ? data.items
                  : [];
        if (!cols.length) {
          console.warn(`[gifts] ${source.name} returned no results for ${q}`);
          continue;
        }

        const target = q.toLowerCase();
        let best = cols[0];

        for (const c of cols) {
          const nm = normalizeGiftName(c?.name || c?.title || c?.gift || "");
          if (nm && nm.toLowerCase() === target) { best = c; break; }
        }

        const floorRaw = (best && (best.floor_price ?? best.floorPrice ?? best.floor)) ?? null;
        const price = Number(floorRaw);
        if (!Number.isFinite(price) || price <= 0) {
          console.warn(`[gifts] ${source.name} returned invalid price for ${q}: ${floorRaw}`);
          continue;
        }

        giftsPrices.set(giftName, {
          priceTon: price,
          updatedAt: now,
          source: source.name
        });
        updatedCount++;
        priceFound = true;
        // Keep logs compact in production
        if (!IS_PROD) console.log(`[gifts] вњ… Updated ${giftName} from ${source.name}: ${price} TON`);
      } catch (e) {
        console.warn(`[gifts] ${source.name} fetch failed for ${q} -`, e?.message || e);
      }
    }

// If direct markets are blocked, try relayer cache as a LAST resort (only when direct sources failed).
if (!priceFound && GIFT_RELAYER_FALLBACK) {
  const rel = getRelayerPriceEntry(giftName);
  const relUpdatedAt = Number(rel?.updatedAt || 0);
  const fresh = rel && relUpdatedAt > 0 && (now - relUpdatedAt) <= GIFT_RELAYER_STALE_MS;

  if (fresh) {
    // Convert Stars->TON only if needed
    let tonUsd = null;
    if ((!Number.isFinite(Number(rel?.priceTon)) || Number(rel?.priceTon) <= 0) && Number.isFinite(Number(rel?.priceStars))) {
      try {
        const rate = await getTonUsdRate();
        tonUsd = rate?.tonUsd || null;
      } catch {}
    }

    const relTon = computeRelayerPriceTon(rel, tonUsd);

    if (Number.isFinite(relTon) && relTon > 0) {
      giftsPrices.set(giftName, {
        priceTon: relTon,
        updatedAt: now,
        source: String(rel.source || "relayer")
      });
      updatedCount++;
      priceFound = true;
      if (!IS_PROD) console.log(`[gifts] вњ… Updated ${giftName} from relayer fallback: ${relTon} TON`);
    }
  }
}

if (!priceFound) {
  console.warn(`[gifts] вљ пёЏ  All sources failed for ${giftName}`);
}

    // small pause (w/ jitter) to avoid bursts
    await sleep(120 + Math.floor(Math.random() * 120));
  }

  giftsLastUpdate = now;
  return updatedCount;
}

function pickGiftPriceFromCollectionPayload(giftName, data) {
  const cols = Array.isArray(data?.collections) ? data.collections
            : Array.isArray(data?.items) ? data.items
            : [];
  if (!cols.length) return null;

  const variants = new Set(getGiftNameVariants(giftName).map((x) => x.toLowerCase()));
  let best = cols[0];

  for (const c of cols) {
    const nm = normalizeGiftName(c?.name || c?.title || c?.gift || "").toLowerCase();
    if (nm && variants.has(nm)) {
      best = c;
      break;
    }
  }

  const floorRaw = (best && (best.floor_price ?? best.floorPrice ?? best.floor)) ?? null;
  const price = Number(floorRaw);
  return (Number.isFinite(price) && price > 0) ? price : null;
}

async function fetchGiftPriceFromJsonSource(source, giftName) {
  const url = `${source.baseUrl}${encodeURIComponent(giftName)}&limit=10`;
  let res = null;
  try {
    res = await fetchWithTimeout(url, { headers: source.headers });
  } catch (e) {
    throw createGiftSourceError(`${source.name} fetch failed: ${e?.message || e}`, {
      blockSource: true,
      cooldownKind: "transient"
    });
  }
  if (!res.ok) {
    throw createGiftSourceError(`${source.name} returned status ${res.status} for ${giftName}`, {
      status: res.status,
      blockSource: [401, 403, 429].includes(res.status),
      cooldownKind: res.status
    });
  }

  const ct = String(res.headers?.get?.("content-type") || "");
  if (ct.includes("text/html")) {
    throw createGiftSourceError(`${source.name} returned HTML (likely blocked)`, {
      blockSource: true,
      cooldownKind: "auth"
    });
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    throw createGiftSourceError(`${source.name} returned invalid JSON`, {
      blockSource: true,
      cooldownKind: "transient"
    });
  }
  return pickGiftPriceFromCollectionPayload(giftName, data);
}

async function fetchGiftPriceFromGetGems(baseHeaders, giftName) {
  const html = await fetchGetGemsSnapshot(baseHeaders);
  return parseGetGemsPriceFromHtml(html, giftName);
}

async function refreshGiftsPricesFromPortals() {
  if (!giftsCatalog.length) {
    await refreshGiftsCatalogStatic();
  }

  const now = Date.now();
  let updatedCount = 0;

  const baseHeaders = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,ru;q=0.8",
    "cache-control": "no-cache",
    "pragma": "no-cache"
  };

  const disableTonnel = !/^(0|false|no)$/i.test(String(process.env.DISABLE_TONNEL_PRICES || "1").trim());
  const skippedOnce = new Set();
  const disabledThisRun = new Set();

  const sources = [
    {
      name: "portal-market.com",
      fetchPrice: (giftName) => fetchGiftPriceFromJsonSource({
        name: "portal-market.com",
        baseUrl: "https://portal-market.com/api/collections?search=",
        headers: { ...baseHeaders, referer: "https://portal-market.com/", origin: "https://portal-market.com" }
      }, giftName)
    },
    ...(disableTonnel ? [] : [{
      name: "market.tonnel.network",
      fetchPrice: (giftName) => fetchGiftPriceFromJsonSource({
        name: "market.tonnel.network",
        baseUrl: "https://market.tonnel.network/api/collections?search=",
        headers: { ...baseHeaders, referer: "https://market.tonnel.network/", origin: "https://market.tonnel.network" }
      }, giftName)
    }]),
    {
      name: "getgems.io",
      fetchPrice: (giftName) => fetchGiftPriceFromGetGems(baseHeaders, giftName)
    }
  ];

  // Fragment's /gifts landing page is public, but collection pages commonly return 403
  // to server-side requests, so it is not reliable enough here as an automated price source.

  const activeSources = sources.filter((source) => {
    const cooldown = getGiftSourceCooldown(source.name);
    if (!cooldown) return true;
    if (!skippedOnce.has(source.name)) {
      skippedOnce.add(source.name);
      console.warn(`[gifts] ${source.name} skipped (cooldown active: ${cooldown.reason})`);
    }
    return false;
  });

  for (const giftName of giftsCatalog) {
    const q = normalizeGiftName(giftName);
    if (!q) continue;

    let priceFound = false;

    for (const source of activeSources) {
      if (priceFound) break;
      if (disabledThisRun.has(source.name)) continue;

      try {
        const price = await source.fetchPrice(q);
        if (!Number.isFinite(price) || price <= 0) continue;

        giftsPrices.set(giftName, {
          priceTon: price,
          updatedAt: now,
          source: source.name
        });
        updatedCount++;
        priceFound = true;
        clearGiftSourceCooldown(source.name);
        if (!IS_PROD) console.log(`[gifts] Updated ${giftName} from ${source.name}: ${price} TON`);
      } catch (e) {
        const reason = String(e?.message || e || "source error");
        if (e?.blockSource) {
          blockGiftSource(source.name, reason, e?.cooldownKind || e?.status || "");
          disabledThisRun.add(source.name);
          console.warn(`[gifts] ${reason}`);
          continue;
        }
        console.warn(`[gifts] ${source.name} fetch failed for ${q} - ${reason}`);
      }
    }

    if (!priceFound && GIFT_RELAYER_FALLBACK) {
      const rel = getRelayerPriceEntry(giftName);
      const relUpdatedAt = Number(rel?.updatedAt || 0);
      const fresh = rel && relUpdatedAt > 0 && (now - relUpdatedAt) <= GIFT_RELAYER_STALE_MS;

      if (fresh) {
        let tonUsd = null;
        if ((!Number.isFinite(Number(rel?.priceTon)) || Number(rel?.priceTon) <= 0) && Number.isFinite(Number(rel?.priceStars))) {
          try {
            const rate = await getTonUsdRate();
            tonUsd = rate?.tonUsd || null;
          } catch {}
        }

        const relTon = computeRelayerPriceTon(rel, tonUsd);
        if (Number.isFinite(relTon) && relTon > 0) {
          giftsPrices.set(giftName, {
            priceTon: relTon,
            updatedAt: now,
            source: String(rel.source || "relayer")
          });
          updatedCount++;
          priceFound = true;
          if (!IS_PROD) console.log(`[gifts] Updated ${giftName} from relayer fallback: ${relTon} TON`);
        }
      }
    }

    if (!priceFound) {
      console.warn(`[gifts] No direct price for ${giftName}; keeping previous cached value if present.`);
    }

    await sleep(120 + Math.floor(Math.random() * 120));
  }

  if (updatedCount > 0) {
    giftsLastUpdate = now;
    persistGiftsPriceState();
  }
  return updatedCount;
}

async function refreshGiftsAll() {
  giftsLastAttemptAt = Date.now();
  // РєР°С‚Р°Р»РѕРі вЂ” СЂРµР¶Рµ (РЅРѕ Сѓ РЅР°СЃ РѕРЅ СЃС‚Р°С‚РёС‡РµСЃРєРёР№, СЌС‚Рѕ РїСЂРѕСЃС‚Рѕ "sanity" + РјРµС‚РєР° РІСЂРµРјРµРЅРё)
  if (!giftsCatalogLastUpdate || Date.now() - giftsCatalogLastUpdate > GIFT_CATALOG_REFRESH_MS) {
    try {
      await refreshGiftsCatalogStatic();
      console.log(`[gifts] catalog loaded: ${giftsCatalog.length}`);
    } catch (e) {
      console.warn('[gifts] catalog refresh failed:', e?.message || e);
    }
  }

  // С†РµРЅС‹ вЂ” СЂР°Р· РІ С‡Р°СЃ (provider: auto -> try GiftAsset first, then direct markets)
  let updated = 0;
  let usedProvider = "";

  if (GIFT_PRICE_PROVIDER !== "direct") {
    const cooldown = getGiftSourceCooldown("giftasset");
    if (cooldown) {
      console.warn(`[gifts] GiftAsset skipped (cooldown active: ${cooldown.reason})`);
    } else {
      try {
        updated = await refreshGiftsPricesFromGiftAsset();
        usedProvider = updated > 0 ? "giftasset" : "";
        console.log(`[gifts] GiftAsset price list updated: ${updated} records (tracked=${giftsCatalog.length})`);
      } catch (e) {
        console.warn('[gifts] GiftAsset refresh failed:', e?.message || e);
      }
    }
  }

  if ((!updated || updated <= 0) && GIFT_PRICE_PROVIDER !== "giftasset") {
    try {
      updated = await refreshGiftsPricesFromPortals();
      usedProvider = "direct";
      console.log(`[gifts] direct market prices updated: ${updated} records (tracked=${giftsCatalog.length})`);
    } catch (e) {
      console.warn('[gifts] direct market prices refresh failed (keeping old cache):', e?.message || e);
    }
  }

  if (!updated || updated <= 0) {
    if (giftsPrices.size > 0) {
      console.log(`[gifts] No fresh prices updated (provider=${GIFT_PRICE_PROVIDER || "auto"}). Reusing ${giftsPrices.size} cached records.`);
    } else {
    console.warn(`[gifts] вљ пёЏ No prices updated (provider=${GIFT_PRICE_PROVIDER || "auto"}). Keeping old cache.`);
    }
  } else {
    giftsLastUpdate = Date.now();
  }
}


function getRelayerAdminIds() {
  return String(
    process.env.RELAYER_ADMIN_IDS ||
    process.env.RELAYER_ADMIN_ID ||
    process.env.MARKET_ADMIN_IDS ||
    process.env.MARKET_ADMIN_ID ||
    ""
  )
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isRelayerAdminUserId(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  return getRelayerAdminIds().includes(uid);
}

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

function normalizeInventoryLookupValue(v, max = 256) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function buildInventoryLookup(body = {}) {
  return {
    instanceId: normalizeInventoryLookupValue(body?.instanceId, 256),
    marketId: normalizeInventoryLookupValue(body?.marketId, 256),
    itemId: normalizeInventoryLookupValue(body?.itemId ?? body?.id, 256),
    tgMessageId: normalizeInventoryLookupValue(body?.tgMessageId ?? body?.messageId ?? body?.msgId, 128)
  };
}

function sameInventoryLookupValue(a, b) {
  const left = normalizeInventoryLookupValue(a, 256);
  const right = normalizeInventoryLookupValue(b, 256);
  return !!left && !!right && left === right;
}

function findInventoryItemForAction(items, lookup = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  const findBy = (pred) => list.find(pred) || null;

  if (lookup.instanceId) {
    const byInstance = findBy((x) => sameInventoryLookupValue(x?.instanceId, lookup.instanceId));
    if (byInstance) return byInstance;
  }

  if (lookup.marketId) {
    const byMarket = findBy((x) => sameInventoryLookupValue(x?.marketId, lookup.marketId));
    if (byMarket) return byMarket;
  }

  if (lookup.itemId) {
    const byItemId = findBy((x) =>
      sameInventoryLookupValue(x?.id, lookup.itemId) ||
      sameInventoryLookupValue(x?.baseId, lookup.itemId)
    );
    if (byItemId) return byItemId;
  }

  if (lookup.tgMessageId) {
    const byMsgId = findBy((x) =>
      sameInventoryLookupValue(x?.tg?.messageId, lookup.tgMessageId) ||
      sameInventoryLookupValue(x?.tg?.msgId, lookup.tgMessageId)
    );
    if (byMsgId) return byMsgId;
  }

  // market.js can briefly keep optimistic ids in local cache: optimistic_<marketId>_<ts>
  if (lookup.instanceId.startsWith("optimistic_")) {
    const m = lookup.instanceId.match(/^optimistic_(.+)_\d+$/);
    const optimisticMarketId = normalizeInventoryLookupValue(m?.[1] || "", 256);
    if (optimisticMarketId) {
      const byOptimisticMarket = findBy((x) =>
        sameInventoryLookupValue(x?.marketId, optimisticMarketId) ||
        sameInventoryLookupValue(x?.id, optimisticMarketId) ||
        sameInventoryLookupValue(x?.baseId, optimisticMarketId)
      );
      if (byOptimisticMarket) return byOptimisticMarket;
    }
  }

  return null;
}

function normalizeInventoryCurrencyTag(v) {
  return String(v || "").trim().toLowerCase();
}

function getInventoryWithdrawLockUntil(item) {
  const explicitUntil = Number(
    item?.withdrawLockUntil ??
    item?.withdraw_lock_until ??
    item?.tg?.withdrawLockUntil ??
    0
  );
  if (Number.isFinite(explicitUntil) && explicitUntil > 0) return explicitUntil;

  const isStarsOrigin =
    normalizeInventoryCurrencyTag(item?.acquiredCurrency) === "stars" ||
    normalizeInventoryCurrencyTag(item?.buyCurrency) === "stars" ||
    normalizeInventoryCurrencyTag(item?.purchaseCurrency) === "stars" ||
    normalizeInventoryCurrencyTag(item?.currency) === "stars" ||
    normalizeInventoryCurrencyTag(item?.tg?.currency) === "stars" ||
    normalizeInventoryCurrencyTag(item?.tg?.kind) === "star_gift";
  if (!isStarsOrigin) return 0;

  const acquiredAt = Number(item?.acquiredAt || item?.createdAt || item?.ts || 0);
  if (Number.isFinite(acquiredAt) && acquiredAt > 0) {
    return acquiredAt + 5 * 24 * 60 * 60 * 1000;
  }
  return 0;
}

// GET inventory (NFTs) for a user
app.get("/api/user/inventory", requireTelegramUser, async (req, res) => {
  try {
    const userId = String(req.tg.user.id);
    const items = await inventoryGet(userId);
    const isAdmin = isRelayerAdminUserId(userId);
    return res.json({ ok: true, items, nfts: items, isAdmin });
  } catch (e) {
    console.error("[Inventory] get error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});



// Add inventory items (NFTs/Gifts).
// Browser-originated inventory adds are disabled because they allow client-side item injection.
async function handleInventoryAdd(req, res) {
  try {
    const { userId: bodyUserId, items, item, claimId, roundId } = req.body || {};

    const list = Array.isArray(items) ? items : (item ? [item] : []);
    if (!list.length) return res.status(400).json({ ok: false, error: "items required" });

    if (!req.isRelayer) {
      return res.status(403).json({
        ok: false,
        code: "INVENTORY_BROWSER_ADD_FORBIDDEN",
        error: "Browser-side inventory adds are disabled"
      });
    }

    const uid = String(bodyUserId || "");
    if (!uid) return res.status(400).json({ ok: false, error: "userId required" });
    const username = safeShortText(req.body?.username || req.body?.userName || "", 64) || null;
    const firstName = safeShortText(req.body?.first_name || req.body?.firstName || "", 64) || null;
    const lastName = safeShortText(req.body?.last_name || req.body?.lastName || "", 64) || null;
    try {
      await db.saveUser({
        id: uid,
        username,
        first_name: firstName,
        last_name: lastName
      });
    } catch (saveErr) {
      console.error("[Inventory] Failed to save relayer user profile:", saveErr);
    }

    const result = await inventoryAdd(uid, list, claimId);
    const caseRoundId =
      normalizeCaseRoundIdValue(roundId) ||
      extractCaseRoundIdFromClaimId(claimId);
    if (caseRoundId) {
      await resolvePendingCaseRound(caseRoundId, {
        telegramId: uid,
        status: "settled",
        resolution: "case_nft_claim"
      }).catch((e) => {
        console.error("[Cases] Failed to settle case round from NFT claim:", e?.message || e);
      });
    }
    return res.json({
      ok: true,
      added: result.added,
      duplicated: !!result.duplicated,
      items: result.items,
      nfts: result.items
    });
  } catch (e) {
    console.error("[Inventory] add error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
}

app.post("/api/inventory/nft/add", requireRelayerOrTelegramUser, handleInventoryAdd);
// Compatibility alias
app.post("/api/inventory/add", requireRelayerOrTelegramUser, handleInventoryAdd);

;


// Sell selected NFTs from inventory -> credit balance
app.post("/api/inventory/sell", requireTelegramUser, requireTechPauseActionsAllowed, async (req, res) => {
  try {
    const userId = String(req.tg.user.id);
    const { instanceIds, currency } = req.body || {};

    const ids = Array.isArray(instanceIds) ? instanceIds.map(String) : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: "instanceIds required" });

    const result = await inventorySell(userId, ids, currency);
    return res.json(result);
  } catch (e) {
    console.error("[Inventory] sell error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});


// Sell ALL NFTs
app.post("/api/inventory/sell-all", requireTelegramUser, requireTechPauseActionsAllowed, async (req, res) => {
  try {
    const userId = String(req.tg.user.id);
    const { currency } = req.body || {};

    const items = await inventoryGet(userId);
    const ids = items.map(it => it?.instanceId).filter(Boolean).map(String);
    if (!ids.length) {
      return res.json({ ok: true, sold: 0, amount: 0, currency: (currency === "stars") ? "stars" : "ton", items: [], nfts: [] });
    }

    const result = await inventorySell(userId, ids, currency);
    return res.json(result);
  } catch (e) {
    console.error("[Inventory] sell-all error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});

// Redeem promo code
app.post("/api/promocode/redeem", requireTelegramUser, requireTechPauseActionsAllowed, async (req, res) => {
  try {
    const userId = String(req.tg.user.id || "");
    const code = String(req.body?.code || "").trim();

    if (!code) {
      return res.status(400).json({ ok: false, errorCode: "PROMO_EMPTY", error: "promo required" });
    }
    if (typeof db.redeemPromocode !== "function") {
      return res.status(503).json({ ok: false, errorCode: "PROMO_DB_NOT_READY", error: "promos not configured" });
    }

    const result = await db.redeemPromocode(userId, code);
    if (!result?.ok) {
      const code = String(result?.errorCode || "PROMO_INVALID");
      const status = code === "PROMO_LIMIT_REACHED" ? 409 : (code === "PROMO_ALREADY_REDEEMED" ? 409 : 400);
      return res.status(status).json({ ok: false, errorCode: code, error: result?.error || "Failed to redeem" });
    }

    return res.json({
      ok: true,
      added: Number(result.added || 0),
      addedTon: Number(result.addedTon || 0),
      newBalance: Number(result.newBalance || 0),
      newTonBalance: Number(result.newTonBalance || 0)
    });
  } catch (e) {
    console.error("[Promo] redeem error:", e);
    return res.status(500).json({ ok: false, errorCode: "PROMO_REDEEM_FAILED", error: "internal error" });
  }
});


const TASK_SUBSCRIBE_KEY = "subscribe_wildgift_channel_v1";
const TASK_SUBSCRIBE_REWARD_STARS = 1;
const TASK_TOP_UP_KEY = "top_up_05_v1";
const TASK_TOP_UP_REWARD_STARS = 10;
const TASK_TOP_UP_MIN_TON = 0.5;
const TASK_TOP_UP_MIN_STARS = 50;
const TASK_WIN_ONCE_KEY = "win_once_wheel_crash_v1";
const TASK_WIN_ONCE_REWARD_STARS = 10;
const TASK_SUBSCRIBE_CHANNEL_DEFAULT = "@wildgift_channel";
const TASK_SUBSCRIBE_CHANNEL_RAW = String(process.env.TASK_SUBSCRIBE_CHANNEL || TASK_SUBSCRIBE_CHANNEL_DEFAULT).trim() || TASK_SUBSCRIBE_CHANNEL_DEFAULT;
const TASK_SUBSCRIBE_CHANNEL_URL_RAW = String(process.env.TASK_SUBSCRIBE_CHANNEL_URL || "").trim();

function parseTelegramChannel(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return { chatId: TASK_SUBSCRIBE_CHANNEL_DEFAULT, username: "wildgift_channel", url: "https://t.me/wildgift_channel" };
  }

  if (/^-?\d+$/.test(raw)) {
    return { chatId: raw, username: "", url: "" };
  }

  let username = raw
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim();

  if (!username) username = "wildgift_channel";
  return {
    chatId: `@${username}`,
    username,
    url: `https://t.me/${username}`
  };
}

const TASK_SUBSCRIBE_CHANNEL = parseTelegramChannel(TASK_SUBSCRIBE_CHANNEL_RAW);
const TASK_SUBSCRIBE_CHANNEL_CHAT_ID = TASK_SUBSCRIBE_CHANNEL.chatId;
const TASK_SUBSCRIBE_CHANNEL_URL = TASK_SUBSCRIBE_CHANNEL_URL_RAW || TASK_SUBSCRIBE_CHANNEL.url || "https://t.me/wildgift_channel";

function isSubscribedMemberStatus(status, isMemberFlag = false) {
  const s = String(status || "").toLowerCase();
  if (s === "member" || s === "administrator" || s === "creator") return true;
  if (s === "restricted" && isMemberFlag === true) return true;
  return false;
}

async function checkTaskChannelMembership(telegramUserId) {
  if (!process.env.BOT_TOKEN) {
    return { ok: false, isMember: false, status: null, error: "BOT_TOKEN not set" };
  }
  if (!TASK_SUBSCRIBE_CHANNEL_CHAT_ID) {
    return { ok: false, isMember: false, status: null, error: "TASK_SUBSCRIBE_CHANNEL not configured" };
  }

  try {
    const numericUserId = Number(telegramUserId);
    const userIdPayload = Number.isFinite(numericUserId) ? numericUserId : String(telegramUserId || "");
    const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TASK_SUBSCRIBE_CHANNEL_CHAT_ID,
        user_id: userIdPayload
      })
    });

    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      return {
        ok: false,
        isMember: false,
        status: null,
        error: String(body?.description || `Telegram API error (${response.status})`)
      };
    }

    const status = String(body?.result?.status || "").toLowerCase();
    const isMember = isSubscribedMemberStatus(status, body?.result?.is_member === true);
    return { ok: true, isMember, status, error: null };
  } catch (error) {
    return {
      ok: false,
      isMember: false,
      status: null,
      error: String(error?.message || error || "Failed to check channel membership")
    };
  }
}

const TON_PROJECT_ADDRESS = String(
  process.env.PROJECT_TON_ADDRESS || "UQCtVhhBFPBvCoT8H7szNQUhEvHgbvnX50r8v6d8y5wdr19J"
).trim();
const TONAPI_BASE = String(process.env.TONAPI_BASE || "https://tonapi.io/v2").replace(/\/+$/, "");
const TONAPI_KEY = String(process.env.TONAPI_KEY || process.env.TON_API_KEY || "").trim();
const TON_DEPOSIT_HTTP_TIMEOUT_MS = Math.max(
  3000,
  Math.min(30000, Number(process.env.TON_DEPOSIT_HTTP_TIMEOUT_MS || 12000) || 12000)
);
const TON_DEPOSIT_MIN_CONFIRM_AGE_SEC = Math.max(
  0,
  Math.min(300, Number(process.env.TON_DEPOSIT_MIN_CONFIRM_AGE_SEC || 10) || 10)
);
const TON_DEPOSIT_MAX_AGE_SEC = Math.max(
  300,
  Math.min(30 * 24 * 60 * 60, Number(process.env.TON_DEPOSIT_MAX_AGE_SEC || 24 * 60 * 60) || 24 * 60 * 60)
);
const TON_DEPOSIT_MIN_NANO = BigInt(
  Math.max(1, Number(process.env.TON_DEPOSIT_MIN_NANO || 1000000) || 1000000)
);

function tonApiHeaders() {
  const h = { accept: "application/json" };
  if (TONAPI_KEY) {
    h.authorization = `Bearer ${TONAPI_KEY}`;
  }
  return h;
}

function normalizeTonHash(value) {
  const s = String(value || "").replace(/^0x/i, "").trim();
  if (!s || !/^[a-fA-F0-9]{32,128}$/.test(s)) return "";
  return s.toUpperCase();
}

function normalizeTonLt(value) {
  const s = String(value ?? "").trim();
  if (!s || !/^\d+$/.test(s)) return "";
  return s;
}

function normalizeTonAddressRaw(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  try {
    return Address.parse(s).toRawString().toLowerCase();
  } catch {
    return "";
  }
}

const TON_PROJECT_ADDRESS_RAW = normalizeTonAddressRaw(TON_PROJECT_ADDRESS);
if (!TON_PROJECT_ADDRESS_RAW) {
  console.warn("[TON Deposit] PROJECT_TON_ADDRESS is invalid; TON deposits will be rejected.");
}

function toBigIntSafe(value) {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    const s = String(value ?? "").trim();
    if (!s) return 0n;
    return BigInt(s);
  } catch {
    return 0n;
  }
}

function nanoToTon8(nanoValue) {
  const n = toBigIntSafe(nanoValue);
  if (n <= 0n) return 0;
  const units = 100000000n; // 1e8
  const rounded = (n * units + 500000000n) / 1000000000n; // round to 8 decimals
  return Number(rounded) / 1e8;
}

function getTonMessageHashFromBoc(boc) {
  const raw = String(boc || "").trim();
  if (!raw) throw new Error("BOC is required");
  const cell = Cell.fromBase64(raw);
  return normalizeTonHash(cell.hash().toString("hex"));
}

async function fetchTonTxByMessageHash(messageHash) {
  const hash = normalizeTonHash(messageHash);
  if (!hash) throw new Error("Invalid message hash");

  const url = `${TONAPI_BASE}/blockchain/messages/${hash}/transaction`;
  const res = await fetchWithTimeout(url, { headers: tonApiHeaders() }, TON_DEPOSIT_HTTP_TIMEOUT_MS);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (!res.ok) {
    const msg = data?.error || text || `HTTP ${res.status}`;
    throw new Error(`TONAPI transaction lookup failed: ${msg}`);
  }

  return data || {};
}

function extractProjectTransferFromTx(tx) {
  const outMsgs = Array.isArray(tx?.out_msgs) ? tx.out_msgs : [];
  const projectRaw = TON_PROJECT_ADDRESS_RAW;
  if (!projectRaw) return null;

  let sumNano = 0n;
  let inMsgHash = "";
  let fromRaw = "";
  let toRaw = projectRaw;

  for (const msg of outMsgs) {
    const destRaw = normalizeTonAddressRaw(msg?.destination?.address || msg?.destination || "");
    if (!destRaw || destRaw !== projectRaw) continue;

    const valueNano = toBigIntSafe(msg?.value);
    if (valueNano <= 0n) continue;

    sumNano += valueNano;
    if (!inMsgHash) inMsgHash = normalizeTonHash(msg?.hash || "");
    if (!fromRaw) {
      fromRaw = normalizeTonAddressRaw(msg?.source?.address || msg?.source || tx?.account?.address || "");
    }
  }

  if (sumNano <= 0n) return null;
  return {
    amountNano: sumNano,
    amountTon: nanoToTon8(sumNano),
    inMsgHash,
    fromAddressRaw: fromRaw,
    toAddressRaw: toRaw
  };
}

async function resolveTaskRewardForCurrency(baseStars, preferredCurrency) {
  const starsReward = Math.max(1, Math.round(Number(baseStars || 0)));
  const currency = String(preferredCurrency || "stars").toLowerCase() === "ton" ? "ton" : "stars";
  if (currency === "stars") {
    return { currency: "stars", amount: starsReward, baseStars: starsReward };
  }

  const rate = await getTonUsdRate().catch(() => ({ tonUsd: tonUsdCache.tonUsd }));
  const starsPerTonRate = starsPerTon(rate?.tonUsd);
  let tonAmount = Number.isFinite(starsPerTonRate) && starsPerTonRate > 0
    ? (starsReward / starsPerTonRate)
    : null;
  if (!Number.isFinite(tonAmount) || tonAmount <= 0) {
    tonAmount = starsToTon(starsReward, rate?.tonUsd);
  }

  let rounded = 0;
  if (Number.isFinite(tonAmount) && tonAmount > 0) {
    const precision = tonAmount < 0.01 ? 3 : 2;
    const factor = precision === 3 ? 1000 : 100;
    rounded = Math.round(tonAmount * factor) / factor;
  }
  if (!(rounded > 0)) rounded = 0.001;
  return { currency: "ton", amount: rounded, baseStars: starsReward };
}

app.get("/api/tasks/channel-subscription/status", requireTelegramUser, async (req, res) => {
  try {
    const userId = String(req.tg?.user?.id || "");
    if (!userId) return res.status(403).json({ ok: false, error: "No user in initData" });

    const claimed = typeof db.hasTaskClaim === "function"
      ? !!(await db.hasTaskClaim(userId, TASK_SUBSCRIBE_KEY))
      : false;

    let membership = { ok: true, isMember: false, status: null, error: null };
    if (!claimed) {
      membership = await checkTaskChannelMembership(userId);
    }

    const subscribed = claimed ? true : !!membership.isMember;
    return res.json({
      ok: true,
      taskKey: TASK_SUBSCRIBE_KEY,
      claimed,
      subscribed,
      canClaim: subscribed && !claimed,
      membershipStatus: membership.status || null,
      checkError: membership.ok ? null : membership.error || "Subscription check failed",
      channel: {
        chatId: TASK_SUBSCRIBE_CHANNEL_CHAT_ID,
        username: TASK_SUBSCRIBE_CHANNEL.username ? `@${TASK_SUBSCRIBE_CHANNEL.username}` : null,
        url: TASK_SUBSCRIBE_CHANNEL_URL
      }
    });
  } catch (error) {
    console.error("[Tasks] status error:", error);
    return res.status(500).json({ ok: false, error: "Failed to load task status" });
  }
});

app.post("/api/tasks/channel-subscription/claim", requireTelegramUser, requireTechPauseActionsAllowed, async (req, res) => {
  try {
    const userId = String(req.tg?.user?.id || "");
    if (!userId) return res.status(403).json({ ok: false, error: "No user in initData" });

    const preferredCurrency = String(req.body?.currency || "stars").toLowerCase() === "ton" ? "ton" : "stars";

    const alreadyClaimed = typeof db.hasTaskClaim === "function"
      ? !!(await db.hasTaskClaim(userId, TASK_SUBSCRIBE_KEY))
      : false;
    if (alreadyClaimed) {
      const balance = await db.getUserBalance(userId).catch(() => null);
      const newBalance = preferredCurrency === "ton"
        ? Number(balance?.ton_balance || 0)
        : Number(balance?.stars_balance || 0);
      return res.json({
        ok: true,
        claimed: true,
        alreadyClaimed: true,
        currency: preferredCurrency,
        added: 0,
        newBalance,
        tonBalance: Number(balance?.ton_balance || 0),
        starsBalance: Number(balance?.stars_balance || 0),
        channel: {
          chatId: TASK_SUBSCRIBE_CHANNEL_CHAT_ID,
          username: TASK_SUBSCRIBE_CHANNEL.username ? `@${TASK_SUBSCRIBE_CHANNEL.username}` : null,
          url: TASK_SUBSCRIBE_CHANNEL_URL
        }
      });
    }

    const membership = await checkTaskChannelMembership(userId);
    if (!membership.ok) {
      return res.status(502).json({
        ok: false,
        code: "TASK_CHANNEL_CHECK_FAILED",
        error: membership.error || "Failed to verify channel subscription"
      });
    }
    if (!membership.isMember) {
      return res.status(409).json({
        ok: false,
        code: "TASK_NOT_COMPLETED",
        error: "Subscribe to the channel first",
        channel: {
          chatId: TASK_SUBSCRIBE_CHANNEL_CHAT_ID,
          username: TASK_SUBSCRIBE_CHANNEL.username ? `@${TASK_SUBSCRIBE_CHANNEL.username}` : null,
          url: TASK_SUBSCRIBE_CHANNEL_URL
        }
      });
    }

    if (typeof db.awardTaskReward !== "function") {
      return res.status(503).json({ ok: false, code: "TASK_DB_NOT_READY", error: "Task rewards are not configured" });
    }

    const reward = await resolveTaskRewardForCurrency(TASK_SUBSCRIBE_REWARD_STARS, preferredCurrency);
    const claimResult = await db.awardTaskReward(
      userId,
      TASK_SUBSCRIBE_KEY,
      reward.currency,
      reward.amount,
      "Task reward: subscribe to channel",
      {
        task: TASK_SUBSCRIBE_KEY,
        channel: TASK_SUBSCRIBE_CHANNEL_CHAT_ID,
        membershipStatus: membership.status || null,
        baseRewardStars: reward.baseStars
      }
    );

    try { broadcastBalanceUpdate(userId); } catch {}

    return res.json({
      ok: true,
      claimed: true,
      alreadyClaimed: !!claimResult?.alreadyClaimed,
      currency: String(claimResult?.currency || reward.currency),
      added: Number(claimResult?.added || 0),
      newBalance: Number(claimResult?.newBalance || 0),
      tonBalance: Number(claimResult?.tonBalance || 0),
      starsBalance: Number(claimResult?.starsBalance || 0),
      channel: {
        chatId: TASK_SUBSCRIBE_CHANNEL_CHAT_ID,
        username: TASK_SUBSCRIBE_CHANNEL.username ? `@${TASK_SUBSCRIBE_CHANNEL.username}` : null,
        url: TASK_SUBSCRIBE_CHANNEL_URL
      }
    });
  } catch (error) {
    console.error("[Tasks] claim error:", error);
    return res.status(500).json({ ok: false, error: "Failed to claim reward" });
  }
});

app.get("/api/tasks/top-up/status", requireTelegramUser, async (req, res) => {
  try {
    const userId = String(req.tg?.user?.id || "");
    if (!userId) return res.status(403).json({ ok: false, error: "No user in initData" });

    const claimed = typeof db.hasTaskClaim === "function"
      ? !!(await db.hasTaskClaim(userId, TASK_TOP_UP_KEY))
      : false;
    const signals = claimed
      ? {
          topUpMinTon: TASK_TOP_UP_MIN_TON,
          topUpMinStars: TASK_TOP_UP_MIN_STARS,
          maxTonDeposit: 0,
          maxStarsDeposit: 0,
          topUpCompleted: true
        }
      : await getTaskProgressSignalsForUser(userId);

    const completed = claimed ? true : !!signals.topUpCompleted;

    return res.json({
      ok: true,
      taskKey: TASK_TOP_UP_KEY,
      claimed,
      completed,
      canClaim: completed && !claimed,
      requirement: {
        tonMin: Number(signals.topUpMinTon || TASK_TOP_UP_MIN_TON),
        starsMin: Number(signals.topUpMinStars || TASK_TOP_UP_MIN_STARS)
      },
      progress: {
        maxTonDeposit: Number(signals.maxTonDeposit || 0),
        maxStarsDeposit: Number(signals.maxStarsDeposit || 0)
      }
    });
  } catch (error) {
    console.error("[Tasks] top-up status error:", error);
    return res.status(500).json({ ok: false, error: "Failed to load task status" });
  }
});

app.post("/api/tasks/top-up/claim", requireTelegramUser, requireTechPauseActionsAllowed, async (req, res) => {
  try {
    const userId = String(req.tg?.user?.id || "");
    if (!userId) return res.status(403).json({ ok: false, error: "No user in initData" });

    const preferredCurrency = String(req.body?.currency || "stars").toLowerCase() === "ton" ? "ton" : "stars";
    const alreadyClaimed = typeof db.hasTaskClaim === "function"
      ? !!(await db.hasTaskClaim(userId, TASK_TOP_UP_KEY))
      : false;

    if (alreadyClaimed) {
      const balance = await db.getUserBalance(userId).catch(() => null);
      const newBalance = preferredCurrency === "ton"
        ? Number(balance?.ton_balance || 0)
        : Number(balance?.stars_balance || 0);
      return res.json({
        ok: true,
        claimed: true,
        alreadyClaimed: true,
        currency: preferredCurrency,
        added: 0,
        newBalance,
        tonBalance: Number(balance?.ton_balance || 0),
        starsBalance: Number(balance?.stars_balance || 0)
      });
    }

    const signals = await getTaskProgressSignalsForUser(userId);
    if (!signals.topUpCompleted) {
      return res.status(409).json({
        ok: false,
        code: "TASK_NOT_COMPLETED",
        error: `Top up at least ${signals.topUpMinTon} TON or ${signals.topUpMinStars} Stars first`
      });
    }

    if (typeof db.awardTaskReward !== "function") {
      return res.status(503).json({ ok: false, code: "TASK_DB_NOT_READY", error: "Task rewards are not configured" });
    }

    const reward = await resolveTaskRewardForCurrency(TASK_TOP_UP_REWARD_STARS, preferredCurrency);
    const claimResult = await db.awardTaskReward(
      userId,
      TASK_TOP_UP_KEY,
      reward.currency,
      reward.amount,
      "Task reward: top up",
      {
        task: TASK_TOP_UP_KEY,
        baseRewardStars: reward.baseStars,
        requirement: {
          tonMin: Number(signals.topUpMinTon || TASK_TOP_UP_MIN_TON),
          starsMin: Number(signals.topUpMinStars || TASK_TOP_UP_MIN_STARS)
        },
        progress: {
          maxTonDeposit: Number(signals.maxTonDeposit || 0),
          maxStarsDeposit: Number(signals.maxStarsDeposit || 0)
        }
      }
    );

    try { broadcastBalanceUpdate(userId); } catch {}

    return res.json({
      ok: true,
      claimed: true,
      alreadyClaimed: !!claimResult?.alreadyClaimed,
      currency: String(claimResult?.currency || reward.currency),
      added: Number(claimResult?.added || 0),
      newBalance: Number(claimResult?.newBalance || 0),
      tonBalance: Number(claimResult?.tonBalance || 0),
      starsBalance: Number(claimResult?.starsBalance || 0)
    });
  } catch (error) {
    console.error("[Tasks] top-up claim error:", error);
    return res.status(500).json({ ok: false, error: "Failed to claim reward" });
  }
});

app.get("/api/tasks/game-win/status", requireTelegramUser, async (req, res) => {
  try {
    const userId = String(req.tg?.user?.id || "");
    if (!userId) return res.status(403).json({ ok: false, error: "No user in initData" });

    const claimed = typeof db.hasTaskClaim === "function"
      ? !!(await db.hasTaskClaim(userId, TASK_WIN_ONCE_KEY))
      : false;
    const signals = claimed
      ? { gameWins: 1, gameWinCompleted: true }
      : await getTaskProgressSignalsForUser(userId);

    const completed = claimed ? true : !!signals.gameWinCompleted;

    return res.json({
      ok: true,
      taskKey: TASK_WIN_ONCE_KEY,
      claimed,
      completed,
      canClaim: completed && !claimed,
      requirement: { winsMin: 1 },
      progress: { wins: Math.max(0, Math.trunc(Number(signals.gameWins || 0))) }
    });
  } catch (error) {
    console.error("[Tasks] game-win status error:", error);
    return res.status(500).json({ ok: false, error: "Failed to load task status" });
  }
});

app.post("/api/tasks/game-win/claim", requireTelegramUser, requireTechPauseActionsAllowed, async (req, res) => {
  try {
    const userId = String(req.tg?.user?.id || "");
    if (!userId) return res.status(403).json({ ok: false, error: "No user in initData" });

    const preferredCurrency = String(req.body?.currency || "stars").toLowerCase() === "ton" ? "ton" : "stars";
    const alreadyClaimed = typeof db.hasTaskClaim === "function"
      ? !!(await db.hasTaskClaim(userId, TASK_WIN_ONCE_KEY))
      : false;

    if (alreadyClaimed) {
      const balance = await db.getUserBalance(userId).catch(() => null);
      const newBalance = preferredCurrency === "ton"
        ? Number(balance?.ton_balance || 0)
        : Number(balance?.stars_balance || 0);
      return res.json({
        ok: true,
        claimed: true,
        alreadyClaimed: true,
        currency: preferredCurrency,
        added: 0,
        newBalance,
        tonBalance: Number(balance?.ton_balance || 0),
        starsBalance: Number(balance?.stars_balance || 0)
      });
    }

    const signals = await getTaskProgressSignalsForUser(userId);
    if (!signals.gameWinCompleted) {
      return res.status(409).json({
        ok: false,
        code: "TASK_NOT_COMPLETED",
        error: "Win once in Wheel or Crash first"
      });
    }

    if (typeof db.awardTaskReward !== "function") {
      return res.status(503).json({ ok: false, code: "TASK_DB_NOT_READY", error: "Task rewards are not configured" });
    }

    const reward = await resolveTaskRewardForCurrency(TASK_WIN_ONCE_REWARD_STARS, preferredCurrency);
    const claimResult = await db.awardTaskReward(
      userId,
      TASK_WIN_ONCE_KEY,
      reward.currency,
      reward.amount,
      "Task reward: win once in Wheel/Crash",
      {
        task: TASK_WIN_ONCE_KEY,
        baseRewardStars: reward.baseStars,
        wins: Math.max(0, Math.trunc(Number(signals.gameWins || 0)))
      }
    );

    try { broadcastBalanceUpdate(userId); } catch {}

    return res.json({
      ok: true,
      claimed: true,
      alreadyClaimed: !!claimResult?.alreadyClaimed,
      currency: String(claimResult?.currency || reward.currency),
      added: Number(claimResult?.added || 0),
      newBalance: Number(claimResult?.newBalance || 0),
      tonBalance: Number(claimResult?.tonBalance || 0),
      starsBalance: Number(claimResult?.starsBalance || 0)
    });
  } catch (error) {
    console.error("[Tasks] game-win claim error:", error);
    return res.status(500).json({ ok: false, error: "Failed to claim reward" });
  }
});


// Withdraw (send gift via relayer): charges fee and removes from inventory on success
app.post("/api/inventory/withdraw", requireTelegramUser, requireTechPauseActionsAllowed, async (req, res) => {
  let withdrawEventKey = "";
  let keepWithdrawLock = false;
  try {
    const userId = String(req.tg.user.id);
    if (ADMIN_ONLY_TRADING_MODE && !isRelayerAdminUserId(userId)) {
      return res.status(403).json({
        ok: false,
        code: "ADMIN_ONLY_TRADING",
        error: "Withdraw is temporarily available only for admins"
      });
    }
    const { currency } = req.body || {};
    const lookup = buildInventoryLookup(req.body || {});

    // recipient: take from Telegram profile (username preferred), fallback to telegram_id
    const toUsername = String(req.tg.user.username || "").trim();
    const toId = String(req.tg.user.id);
    const to = toUsername ? toUsername : toId;

    const cur = String(currency || "ton").toLowerCase() === "stars" ? "stars" : "ton";
    if (!lookup.instanceId && !lookup.marketId && !lookup.itemId && !lookup.tgMessageId) {
      return res.status(400).json({ ok: false, error: "instanceId required" });
    }

    const FEE_TON = 0.2;
    const FEE_STARS = 25;

    const items = await inventoryGet(userId);
    const item = findInventoryItemForAction(items, lookup);
    if (!item) {
      return res.status(404).json({ ok: false, code: "NO_STOCK", error: "Item not found in inventory", support: "@wildgift_support" });
    }
    const inst = normalizeInventoryLookupValue(item?.instanceId || lookup.instanceId, 256);
    if (!inst) {
      return res.status(404).json({ ok: false, code: "NO_STOCK", error: "Item not found in inventory", support: "@wildgift_support" });
    }

    withdrawEventKey = `withdraw:${userId}:${inst}`;
    const claimedWithdraw = await claimWebhookEvent(withdrawEventKey, {
      userId,
      instanceId: inst,
      marketId: normalizeInventoryLookupValue(item?.marketId || lookup.marketId, 256) || null,
      itemId: normalizeInventoryLookupValue(item?.id || item?.baseId || lookup.itemId, 256) || null,
      source: "inventory_withdraw",
      createdAt: Date.now()
    });
    if (!claimedWithdraw) {
      return res.status(409).json({
        ok: false,
        code: "WITHDRAW_ALREADY_PROCESSING",
        error: "Withdraw for this item is already processing",
        support: "@wildgift_support"
      });
    }

    const lockUntil = getInventoryWithdrawLockUntil(item);
    if (lockUntil > Date.now()) {
      return res.status(423).json({
        ok: false,
        code: "WITHDRAW_LOCKED",
        lockUntil,
        remainingMs: lockUntil - Date.now(),
        error: "Withdrawal of this gift is temporarily unavailable"
      });
    }

    const msgId = item?.tg?.messageId;
    if (!msgId) {
      return res.status(400).json({ ok: false, code: "ITEM_NOT_WITHDRAWABLE", error: "This item cannot be withdrawn", support: "@wildgift_support" });
    }

    // Telegram MTProto often cannot resolve random numeric user IDs without access_hash.
    // Username gives a stable path via contacts.ResolveUsername in relayer.
    if (!toUsername) {
      return res.status(400).json({
        ok: false,
        code: "USERNAME_REQUIRED",
        error: "Set a Telegram username in your profile and try withdraw again",
        support: "@wildgift_support"
      });
    }

    const fee = (cur === "stars") ? FEE_STARS : FEE_TON;

    let newBalance = null;

    try {
      newBalance = await db.updateBalance(userId, cur, -fee, "withdraw_fee", `Withdraw fee`, { instanceId: inst });
    } catch (e) {
      return res.status(402).json({ ok: false, code: "INSUFFICIENT_BALANCE", error: "Insufficient balance for withdraw fee", support: "@wildgift_support" });
    }

    const rpcPort = Math.max(1, Math.min(65535, Number(process.env.RELAYER_RPC_PORT || 3300) || 3300));
    const rpcUrl = String(
      process.env.RELAYER_RPC_URL ||
      process.env.RELAYER_SERVER ||
      `http://127.0.0.1:${rpcPort}`
    ).replace(/\/+$/, "");
    const secret = String(process.env.RELAYER_SECRET || process.env.MARKET_SECRET || "");
    if (!secret) {
      try { await db.updateBalance(userId, cur, +fee, "withdraw_fee_refund", "Withdraw fee refund (server misconfig)", { instanceId: inst }); } catch {}
      return res.status(500).json({ ok: false, code: "RELAYER_NOT_CONFIGURED", error: "Relayer secret is not configured on server", support: "@wildgift_support" });
    }

    try {
      const r = await fetch(`${rpcUrl}/rpc/transfer-stargift`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${secret}` },
        body: JSON.stringify({
          toUserId: to,
          toUsername,
          toId,
          msgId: String(msgId),
          requestId: withdrawEventKey || `withdraw:${userId}:${inst}`
        })
      });

      const raw = await r.text();
      let j = null;
      try { j = raw ? JSON.parse(raw) : null; } catch {}

      if (!r.ok || !j?.ok) {
        const code = j?.code || `RELAYER_${r.status}`;
        const errText = String(j?.error || raw || "").trim();
        const error = errText || `Withdraw failed (relayer HTTP ${r.status})`;
        try { await db.updateBalance(userId, cur, +fee, "withdraw_fee_refund", `Withdraw fee refund (${code})`, { instanceId: inst }); } catch {}
        return res.status(400).json({ ok: false, code, error, support: "@wildgift_support" });
      }
    } catch (e) {
      try { await db.updateBalance(userId, cur, +fee, "withdraw_fee_refund", `Withdraw fee refund (network)`, { instanceId: inst }); } catch {}
      return res.status(502).json({ ok: false, code: "RELAYER_UNREACHABLE", error: "Relayer unreachable", support: "@wildgift_support" });
    }

    let deleted = 0;
    if (typeof db.deleteInventoryItems === "function") {
      const delRes = await db.deleteInventoryItems(userId, [inst]);
      deleted = Number(delRes?.deleted || 0);
    }
    if (!deleted && typeof db.deleteInventoryItemByLookup === "function") {
      const delRes = await db.deleteInventoryItemByLookup(userId, {
        instanceId: inst,
        marketId: normalizeInventoryLookupValue(item?.marketId || lookup.marketId, 256),
        itemId: normalizeInventoryLookupValue(item?.id || item?.baseId || lookup.itemId, 256),
        tgMessageId: normalizeInventoryLookupValue(item?.tg?.messageId || item?.tg?.msgId || lookup.tgMessageId, 128)
      });
      deleted = Number(delRes?.deleted || 0);
    }
    if (!deleted && typeof db.sellInventoryItems === "function") {
      const sellRes = await db.sellInventoryItems(userId, [inst], cur);
      deleted = Number(sellRes?.sold || 0);
    }
    if (!deleted) {
      keepWithdrawLock = true;
      console.error("[Withdraw] Transfer succeeded but inventory cleanup failed:", {
        userId,
        instanceId: inst,
        marketId: item?.marketId || lookup.marketId || null,
        itemId: item?.id || item?.baseId || lookup.itemId || null,
        tgMessageId: item?.tg?.messageId || item?.tg?.msgId || lookup.tgMessageId || null
      });
      return res.status(500).json({
        ok: false,
        code: "WITHDRAW_REVIEW_REQUIRED",
        error: "Gift transfer succeeded but inventory cleanup requires manual review",
        support: "@wildgift_support"
      });
    }

    const left = await inventoryGet(userId);
    return res.json({ ok: true, newBalance, items: left, nfts: left });
  } catch (e) {
    console.error("[Withdraw] error:", e);
    return res.status(500).json({ ok: false, error: "withdraw error", support: "@wildgift_support" });
  } finally {
    if (withdrawEventKey && !keepWithdrawLock) {
      await releaseWebhookEvent(withdrawEventKey).catch(() => {});
    }
  }
});



// Debug: check relayer RPC config/reachability (without exposing secrets)
app.get("/api/relayer/rpc-health", async (req, res) => {
  try {
    const rpcPort = Math.max(1, Math.min(65535, Number(process.env.RELAYER_RPC_PORT || 3300) || 3300));
    const rpcUrl = String(
      process.env.RELAYER_RPC_URL ||
      process.env.RELAYER_SERVER ||
      `http://127.0.0.1:${rpcPort}`
    ).replace(/\/+$/, "");
    const hasSecret = !!String(process.env.RELAYER_SECRET || process.env.MARKET_SECRET || "").trim();

    if (!hasSecret) {
      return res.status(500).json({ ok: false, code: "RELAYER_NOT_CONFIGURED", rpcUrl, hasSecret: false });
    }

    try {
      const r = await fetch(`${rpcUrl}/rpc/health`, { method: "GET" });
      const j = await r.json().catch(() => null);
      return res.status(r.ok ? 200 : 502).json({ ok: !!(r.ok && j?.ok), rpcUrl, hasSecret: true, status: r.status, body: j || null });
    } catch (e) {
      return res.status(502).json({ ok: false, code: "RELAYER_UNREACHABLE", rpcUrl, hasSecret: true, error: e?.message || "network error" });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "rpc health error" });
  }
});

// Admin panel unlock: Telegram admin + panel password -> returns per-request admin key for current page session.
app.post("/api/admin/panel/auth", requireTelegramUser, async (req, res) => {
  try {
    const userId = String(req.tg?.user?.id || "").trim();
    if (!userId || !isRelayerAdminUserId(userId)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const expectedPassword = getAdminPanelPassword();
    if (!expectedPassword) {
      return res.status(503).json({ ok: false, error: "ADMIN_PANEL_PASSWORD not set" });
    }
    const providedPassword = String(req.body?.password || "").trim();
    if (!expectedPassword || !safeTextEqual(providedPassword, expectedPassword)) {
      return res.status(403).json({ ok: false, error: "wrong password" });
    }

    const session = createAdminPanelSession(userId);
    if (!session) {
      return res.status(500).json({ ok: false, error: "Failed to create admin session" });
    }

    return res.json({
      ok: true,
      sessionToken: session.token,
      expiresAt: session.expiresAt
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "auth failed" });
  }
});

app.get("/api/admin/tech-pause", requireAdminKey, async (req, res) => {
  try {
    await syncTechPauseFromDb("admin_get");
    return res.json({
      ok: true,
      techPause: getPublicTechPauseState()
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to fetch tech pause state"
    });
  }
});

app.post("/api/admin/tech-pause", requireAdminKey, async (req, res) => {
  try {
    const rawEnabled = req.body?.enabled;
    const enabled = rawEnabled === true ||
      Number(rawEnabled) === 1 ||
      /^(1|true|on|yes)$/i.test(String(rawEnabled || "").trim());

    if (typeof db?.setTechPauseFlag !== "function") {
      return res.status(500).json({
        ok: false,
        error: "DB adapter does not support tech pause control"
      });
    }

    await db.setTechPauseFlag(enabled ? 1 : 0);
    applyTechPauseState(enabled, "admin_api");

    return res.json({
      ok: true,
      techPause: getPublicTechPauseState()
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to update tech pause state"
    });
  }
});

// Admin: import gift from relayer Saved Gifts to market by public link (no transfer needed).
app.post("/api/admin/relayer/import-market-gift", requireAdminKey, async (req, res) => {
  try {
    const giftLink = String(req.body?.giftLink || req.body?.link || req.body?.url || "").trim();
    if (!giftLink) {
      return res.status(400).json({ ok: false, code: "BAD_LINK", error: "giftLink required" });
    }

    const rpcPort = Math.max(1, Math.min(65535, Number(process.env.RELAYER_RPC_PORT || 3300) || 3300));
    const rpcUrl = String(
      process.env.RELAYER_RPC_URL ||
      process.env.RELAYER_SERVER ||
      `http://127.0.0.1:${rpcPort}`
    ).replace(/\/+$/, "");
    const secret = String(process.env.RELAYER_SECRET || process.env.MARKET_SECRET || "").trim();
    if (!secret) {
      return res.status(500).json({ ok: false, code: "RELAYER_NOT_CONFIGURED", error: "Relayer secret is not configured" });
    }

    let rpcResponse = null;
    try {
      rpcResponse = await fetch(`${rpcUrl}/rpc/market/import-by-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`
        },
        body: JSON.stringify({ giftLink })
      });
    } catch (e) {
      return res.status(502).json({
        ok: false,
        code: "RELAYER_UNREACHABLE",
        error: e?.message || "Relayer RPC unreachable"
      });
    }

    const body = await rpcResponse.json().catch(() => null);
    if (!rpcResponse.ok || !body?.ok) {
      return res.status(rpcResponse.status || 502).json({
        ok: false,
        code: String(body?.code || "RELAYER_IMPORT_FAILED"),
        error: String(body?.error || `Relayer RPC error (${rpcResponse.status})`)
      });
    }

    return res.json({
      ok: true,
      code: String(body.code || "IMPORTED"),
      relisted: !!body.relisted,
      parsed: body.parsed || null,
      item: body.item || null
    });
  } catch (e) {
    return res.status(500).json({ ok: false, code: "IMPORT_FAILED", error: e?.message || "import failed" });
  }
});

// Admin: add gifts to inventory (optional). If ADMIN_KEY is set, require header x-admin-key.
app.post("/api/admin/inventory/add", requireAdminKey, async (req, res) => {
  try {
    const { userId, items, item, claimId } = req.body || {};
    const uid = String(userId || "");
    if (!uid) return res.status(400).json({ ok: false, error: "userId required" });

    const list = Array.isArray(items) ? items : (item ? [item] : []);
    if (!list.length) return res.status(400).json({ ok: false, error: "items required" });

    const normalized = list.map((it) => {
      const x = (it && typeof it === "object") ? { ...it } : it;
      if (!x || typeof x !== "object") return x;

      const data =
        String(x.iconData || "").trim() ||
        (typeof x.icon === "string" && x.icon.trim().startsWith("data:") ? x.icon.trim() : "");

      if (data) {
        const saved = saveMarketImageFromData(data, x.name || x.displayName || "nft");
        if (saved) x.icon = saved;
        delete x.iconData;
      }
      return x;
    });

    const result = await inventoryAdd(uid, normalized, claimId || `admin_${Date.now()}`);
    return res.json({ ok: true, added: result.added, items: result.items, nfts: result.items });
  } catch (e) {
    console.error("[Admin Inventory] add error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});

// Admin: send custom Telegram message to users saved in DB (or explicit userIds).
app.post("/api/admin/telegram/broadcast", requireAdminKey, async (req, res) => {
  try {
    const rawText = String(req.body?.text ?? req.body?.message ?? "").trim();
    const rawCaption = String(req.body?.caption ?? "").trim();
    const text = rawCaption || rawText;
    const photo = normalizeTelegramMediaRef(req.body?.photo ?? req.body?.photoUrl ?? req.body?.image ?? "");
    if (!photo && !text) return res.status(400).json({ ok: false, error: "text or photo required" });
    if (!photo && text.length > 4096) return res.status(400).json({ ok: false, error: "text is too long (max 4096 chars)" });
    if (photo && text.length > 1024) return res.status(400).json({ ok: false, error: "caption is too long (max 1024 chars)" });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok: false, error: "BOT_TOKEN not set" });

    const dryRun = req.body?.dryRun === true;
    const includeBanned = req.body?.includeBanned === true;
    const allowPaidBroadcast = req.body?.allowPaidBroadcast === true;
    const parseMode = normalizeTelegramParseMode(req.body?.parseMode, "HTML");
    const customEmojiId = normalizeTelegramCustomEmojiId(
      req.body?.customEmojiId ||
      process.env.TG_BROADCAST_EMOJI_ID ||
      process.env.TELEGRAM_BROADCAST_EMOJI_ID ||
      ""
    );
    const buttonText = normalizeTelegramButtonText(
      req.body?.buttonText ||
      req.body?.ctaText ||
      req.body?.buttonLabel ||
      "Play!"
    );
    const buttonUrl = normalizeTelegramButtonUrl(req.body?.buttonUrl || req.body?.url || "");
    const miniAppUrl = normalizeTelegramButtonUrl(req.body?.miniAppUrl || req.body?.webAppUrl || req.body?.appUrl || "");
    const replyMarkup = buildTelegramReplyMarkup({ buttonText, buttonUrl, miniAppUrl });

    const rawLimit = Number(req.body?.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(20000, Math.trunc(rawLimit)))
      : 5000;

    const rawDays = Number(req.body?.onlyActiveDays ?? req.body?.activeDays ?? req.body?.recentDays);
    const activeDays = Number.isFinite(rawDays) && rawDays > 0
      ? Math.max(1, Math.min(3650, Math.trunc(rawDays)))
      : 0;
    const activeAfterSec = activeDays > 0
      ? Math.floor(Date.now() / 1000) - activeDays * 24 * 60 * 60
      : 0;

    const rawThrottleMs = Number(req.body?.throttleMs);
    const throttleMs = Number.isFinite(rawThrottleMs)
      ? Math.max(0, Math.min(2000, Math.trunc(rawThrottleMs)))
      : 60;

    const requestedUserIds = Array.isArray(req.body?.userIds) ? req.body.userIds : null;
    let recipients = [];

    if (requestedUserIds && requestedUserIds.length) {
      const unique = new Set();
      for (const value of requestedUserIds) {
        const id = String(value ?? "").trim();
        if (!id) continue;
        if (!/^-?\d+$/.test(id)) continue;
        unique.add(id);
      }
      recipients = Array.from(unique).slice(0, limit).map((id) => ({
        telegram_id: id,
        username: null,
        first_name: null,
        last_name: null,
        last_seen: null,
        ban: null
      }));
    } else {
      if (typeof db.listTelegramRecipientsForBroadcast !== "function") {
        return res.status(500).json({ ok: false, error: "DB adapter does not support broadcast audience listing" });
      }
      recipients = await db.listTelegramRecipientsForBroadcast({ limit, activeAfterSec, includeBanned });
    }

    const audience = recipients
      .map((row) => ({
        chatId: String(row?.telegram_id ?? row?.id ?? "").trim(),
        username: row?.username || null,
        firstName: row?.first_name || null,
        lastName: row?.last_name || null,
        lastSeen: row?.last_seen ?? null,
        ban: row?.ban ?? null
      }))
      .filter((row) => row.chatId);

    if (!audience.length) {
      return res.json({
        ok: true,
        dryRun,
        message: "No recipients found",
        total: 0,
        sent: 0,
        failed: 0
      });
    }

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        total: audience.length,
        parseMode,
        hasPhoto: !!photo,
        hasButton: !!replyMarkup,
        isMiniAppButton: !!(replyMarkup && miniAppUrl),
        hasCustomEmoji: !!customEmojiId,
        allowPaidBroadcast,
        throttleMs,
        sample: audience.slice(0, 20)
      });
    }

    const stats = {
      total: audience.length,
      sent: 0,
      failed: 0,
      blocked: 0,
      deactivated: 0,
      chatNotFound: 0,
      forbidden: 0,
      rateLimited: 0,
      other: 0
    };
    const errors = [];

    for (let i = 0; i < audience.length; i += 1) {
      const row = audience[i];

      try {
        await sendTelegramBroadcastContent(row.chatId, {
          text,
          photo,
          replyMarkup
        }, {
          parseMode,
          customEmojiId,
          allowPaidBroadcast,
          throwOnError: true
        });
        stats.sent += 1;
      } catch (error) {
        const firstErrorText = String(error?.description || error?.message || error || "");
        const shouldRetryWithoutCustomEmoji =
          !!customEmojiId &&
          /ENTITY_TEXT_INVALID|custom_emoji|can't parse entities/i.test(firstErrorText);

        if (shouldRetryWithoutCustomEmoji) {
          try {
            await sendTelegramBroadcastContent(row.chatId, {
              text,
              photo,
              replyMarkup
            }, {
              parseMode,
              allowPaidBroadcast,
              throwOnError: true
            });
            stats.sent += 1;
            continue;
          } catch (retryErr) {
            error = retryErr;
          }
        }

        stats.failed += 1;
        const reason = classifyTelegramSendError(error);
        if (reason === "blocked") stats.blocked += 1;
        else if (reason === "deactivated") stats.deactivated += 1;
        else if (reason === "chat_not_found") stats.chatNotFound += 1;
        else if (reason === "forbidden") stats.forbidden += 1;
        else if (reason === "rate_limited") stats.rateLimited += 1;
        else stats.other += 1;

        if (errors.length < 25) {
          errors.push({
            chatId: row.chatId,
            username: row.username,
            reason,
            error: String(error?.description || error?.message || error || "send failed")
          });
        }

        const retryAfterSec = Number(error?.retryAfter || 0);
        if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
          await sleep(Math.min(20000, Math.max(1000, Math.trunc(retryAfterSec * 1000))));
        }
      }

      if (throttleMs > 0 && i < audience.length - 1) {
        await sleep(throttleMs);
      }
    }

    return res.json({
      ok: true,
      dryRun: false,
      parseMode,
      hasPhoto: !!photo,
      hasButton: !!replyMarkup,
      isMiniAppButton: !!(replyMarkup && miniAppUrl),
      hasCustomEmoji: !!customEmojiId,
      allowPaidBroadcast,
      throttleMs,
      ...stats,
      errors
    });
  } catch (error) {
    console.error("[Admin Broadcast] failed:", error);
    return res.status(500).json({ ok: false, error: error?.message || "broadcast failed" });
  }
});

// Admin: return gift from inventory back to market.
app.post("/api/admin/inventory/return-to-market", requireTelegramUser, async (req, res) => {
  let returnEventKey = "";
  try {
    const userId = String(req.tg?.user?.id || "");
    if (!isRelayerAdminUserId(userId)) return res.status(403).json({ ok: false, error: "forbidden" });

    const lookup = buildInventoryLookup(req.body || {});
    if (!userId) return res.status(403).json({ ok: false, error: "No user in initData" });
    if (!lookup.instanceId && !lookup.marketId && !lookup.itemId && !lookup.tgMessageId) {
      return res.status(400).json({ ok: false, error: "item identifier required" });
    }

    const items = await inventoryGet(userId);
    const item = findInventoryItemForAction(items, lookup);
    if (!item) return res.status(404).json({ ok: false, error: "item not found" });
    const instanceId = normalizeInventoryLookupValue(item?.instanceId || lookup.instanceId, 256);
    returnEventKey = `admin:return-to-market:${userId}:${instanceId || normalizeInventoryLookupValue(item?.marketId || item?.id || item?.baseId, 256)}`;
    const claimedReturn = await claimWebhookEvent(returnEventKey, {
      adminUserId: userId,
      instanceId: instanceId || null,
      marketId: normalizeInventoryLookupValue(item?.marketId || lookup.marketId, 256) || null,
      itemId: normalizeInventoryLookupValue(item?.id || item?.baseId || lookup.itemId, 256) || null,
      source: "admin_return_to_market",
      createdAt: Date.now()
    });
    if (!claimedReturn) {
      return res.status(409).json({ ok: false, code: "RETURN_ALREADY_PROCESSING", error: "return to market already processing" });
    }

    const deletionLookup = {
      instanceId,
      marketId: normalizeInventoryLookupValue(lookup.marketId || item?.marketId, 256),
      itemId: normalizeInventoryLookupValue(lookup.itemId || item?.id || item?.baseId, 256),
      tgMessageId: normalizeInventoryLookupValue(
        lookup.tgMessageId || item?.tg?.messageId || item?.tg?.msgId,
        128
      )
    };

    const now = Date.now();
    const baseMarketId =
      safeMarketString(item?.marketId, 96) ||
      safeMarketString(item?.id, 96) ||
      safeMarketString(item?.baseId, 96) ||
      safeMarketString(instanceId, 96) ||
      "gift";
    const marketImageCandidates = [
      item?.image,
      item?.icon,
      item?.tg?.model?.image,
      item?.previewUrl
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    let marketImage = safeMarketImagePath(marketImageCandidates[0] || "");
    if (!marketImage) {
      const inlineCandidate = marketImageCandidates.find((v) => v.startsWith("data:")) || "";
      if (inlineCandidate) {
        marketImage = saveMarketImageFromData(inlineCandidate, baseMarketId);
      }
    }
    if (!marketImage) {
      for (const candidate of marketImageCandidates) {
        const remoteUrl = safeMarketRemoteImageUrl(candidate);
        if (!remoteUrl) continue;
        const savedRemote = await saveMarketImageFromRemoteUrl(remoteUrl, baseMarketId);
        if (savedRemote) {
          marketImage = savedRemote;
          break;
        }
      }
    }

    let tgPayload = item?.tg || null;
    if (marketImage && tgPayload && typeof tgPayload === "object") {
      const model = tgPayload.model;
      if (model && typeof model === "object") {
        tgPayload = {
          ...tgPayload,
          model: {
            ...model,
            image: marketImage
          }
        };
      }
    }
    const marketItem = {
      id: `ret_${baseMarketId}_${now}`,
      name: safeMarketString(item?.displayName || item?.name, 120) || "Gift",
      number: safeMarketString(item?.tg?.num || item?.number || item?.tg?.number, 32) || "",
      image: marketImage,
      previewUrl: safeMarketPreviewRef(item?.previewUrl || item?.icon || item?.image) || fragmentMediumPreviewUrlFromSlug(item?.tg?.slug),
      priceTon: Number.isFinite(Number(item?.price?.ton)) ? Number(item.price.ton) : null,
      priceStars: Number.isFinite(Number(item?.price?.stars)) ? Number(item.price.stars) : null,
      createdAt: now,
      source: "admin_inventory_return",
      tg: tgPayload
    };

    let marketAdded = false;
    await withMarketLock(async () => {
      const marketItems = await readMarketItems();
      marketItems.unshift(marketItem);
      const MAX = Math.max(10, Math.min(5000, Number(process.env.MARKET_MAX_ITEMS) || 1000));
      if (marketItems.length > MAX) marketItems.length = MAX;
      const ok = await writeMarketItems(marketItems);
      if (!ok) throw new Error("market write failed");
      marketAdded = true;
    });

    const toCount = (v) => {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
      return v === true ? 1 : 0;
    };

    let deleted = 0;
    if (instanceId && typeof db.deleteInventoryItems === "function") {
      const delRes = await db.deleteInventoryItems(userId, [instanceId]);
      deleted = toCount(delRes?.deleted ?? delRes?.rowCount ?? delRes?.sold ?? delRes);
    }
    if (!deleted && typeof db.deleteInventoryItemByLookup === "function") {
      const delRes = await db.deleteInventoryItemByLookup(userId, deletionLookup);
      deleted = toCount(delRes?.deleted ?? delRes?.rowCount ?? delRes?.sold ?? delRes);
    }
    if (!deleted && instanceId && typeof db.sellInventoryItems === "function") {
      const sellRes = await db.sellInventoryItems(userId, [instanceId], "ton");
      deleted = toCount(sellRes?.sold ?? sellRes?.deleted ?? sellRes);
    }

    if (!deleted) {
      if (marketAdded) {
        try {
          await withMarketLock(async () => {
            const marketItems = await readMarketItems();
            const filtered = marketItems.filter((x) => String(x?.id || "") !== String(marketItem.id));
            if (filtered.length !== marketItems.length) await writeMarketItems(filtered);
          });
        } catch (rollbackErr) {
          console.error("[Admin Inventory] return-to-market rollback failed:", rollbackErr);
        }
      }
      return res.status(409).json({ ok: false, error: "failed to remove gift from inventory" });
    }

    const left = await inventoryGet(userId);
    return res.json({ ok: true, item: marketItem, items: left, nfts: left });
  } catch (e) {
    console.error("[Admin Inventory] return-to-market error:", e);
    return res.status(500).json({ ok: false, error: "return to market error" });
  } finally {
    if (returnEventKey) {
      await releaseWebhookEvent(returnEventKey).catch(() => {});
    }
  }
});

// ====== TON DEPOSIT CONFIRM (on-chain verified) ======
app.post("/api/ton/deposit/confirm", async (req, res) => {
  try {
    if (!TON_PROJECT_ADDRESS_RAW) {
      return res.status(500).json({ ok: false, error: "PROJECT_TON_ADDRESS is not configured" });
    }

    const initData = getInitDataFromReq(req);
    if (!initData) {
      return res.status(401).json({ ok: false, error: "initData required" });
    }
    if (!process.env.BOT_TOKEN) {
      return res.status(500).json({ ok: false, error: "BOT_TOKEN not set" });
    }

    const maxAgeSec = getTelegramInitDataMaxAgeSec();
    const check = verifyInitData(initData, process.env.BOT_TOKEN, maxAgeSec);
    if (!check.ok) {
      return res.status(403).json({ ok: false, error: "Bad initData" });
    }

    let user = null;
    try { user = JSON.parse(check.params.user || "null"); } catch {}
    if (!user?.id) {
      return res.status(403).json({ ok: false, error: "No user in initData" });
    }
    const userId = String(user.id);

    try {
      await db.saveUser(user);
    } catch (saveErr) {
      console.error("[TON Deposit] Failed to save user profile:", saveErr);
    }

    const boc = String(req.body?.boc || req.body?.txBoc || req.body?.txHash || "").trim();
    if (!boc) {
      return res.status(400).json({ ok: false, error: "boc required" });
    }
    if (boc.length > 12000) {
      return res.status(400).json({ ok: false, error: "boc is too large" });
    }

    let messageHash = "";
    try {
      messageHash = getTonMessageHashFromBoc(boc);
    } catch (hashErr) {
      return res.status(400).json({ ok: false, error: `Invalid boc: ${hashErr.message}` });
    }

    let tx = null;
    try {
      tx = await fetchTonTxByMessageHash(messageHash);
    } catch (lookupErr) {
      const text = String(lookupErr?.message || "");
      if (/not found|can't find|cannot find/i.test(text)) {
        return res.status(202).json({
          ok: false,
          pending: true,
          messageHash,
          error: "Transaction is not indexed yet, retry in a few seconds"
        });
      }
      throw lookupErr;
    }

    const txHash = normalizeTonHash(tx?.hash || "");
    const txLt = normalizeTonLt(tx?.lt);
    const txUtime = Number(tx?.utime || 0);
    if (!txHash || !txLt || !Number.isFinite(txUtime) || txUtime <= 0) {
      return res.status(422).json({ ok: false, error: "Invalid TON transaction payload" });
    }

    if (tx?.success !== true) {
      return res.status(422).json({ ok: false, error: "TON transaction is not successful" });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - txUtime < TON_DEPOSIT_MIN_CONFIRM_AGE_SEC) {
      return res.status(425).json({
        ok: false,
        pending: true,
        error: "Transaction is too fresh, wait for confirmations"
      });
    }
    if (nowSec - txUtime > TON_DEPOSIT_MAX_AGE_SEC) {
      return res.status(422).json({ ok: false, error: "Transaction is too old to claim" });
    }

    const transfer = extractProjectTransferFromTx(tx);
    if (!transfer) {
      return res.status(422).json({
        ok: false,
        error: "No outgoing transfer to project wallet found in transaction"
      });
    }
    if (transfer.amountNano < TON_DEPOSIT_MIN_NANO) {
      return res.status(422).json({ ok: false, error: "Deposit amount is below minimum" });
    }

    const claimedWalletRaw = normalizeTonAddressRaw(
      req.body?.walletAddress ||
      req.body?.fromAddress ||
      req.body?.senderAddress ||
      ""
    );
    if (claimedWalletRaw && transfer.fromAddressRaw && claimedWalletRaw !== transfer.fromAddressRaw) {
      return res.status(403).json({ ok: false, error: "Sender wallet mismatch" });
    }

    const expectedAmountTon = Number(req.body?.amount || req.body?.expectedAmountTon || 0);
    if (Number.isFinite(expectedAmountTon) && expectedAmountTon > 0) {
      const diff = Math.abs(expectedAmountTon - transfer.amountTon);
      if (diff > 0.00000002) {
        console.warn("[TON Deposit] expected amount differs from on-chain amount:", {
          userId,
          expectedAmountTon,
          actualAmountTon: transfer.amountTon,
          txHash
        });
      }
    }

    if (typeof db.applyVerifiedTonDeposit !== "function") {
      return res.status(500).json({ ok: false, error: "TON deposit claims are not supported by DB driver" });
    }

    const claimRes = await db.applyVerifiedTonDeposit({
      telegramId: userId,
      amountTon: transfer.amountTon,
      txHash,
      messageHash,
      inMsgHash: transfer.inMsgHash || null,
      txLt,
      fromAddress: transfer.fromAddressRaw || null,
      toAddress: transfer.toAddressRaw || null,
      payload: {
        provider: "tonapi",
        txHash,
        txLt,
        txUtime,
        messageHash,
        inMsgHash: transfer.inMsgHash || null,
        amountNano: String(transfer.amountNano),
        amountTon: transfer.amountTon,
        from: transfer.fromAddressRaw || null,
        to: transfer.toAddressRaw || null
      }
    });

    broadcastBalanceUpdate(userId);

    if (!claimRes?.duplicate && process.env.BOT_TOKEN) {
      await sendTelegramMessage(
        userId,
        buildDepositNotifyText(transfer.amountTon, "ton"),
        {
          parseMode: "HTML",
          customEmojiId: getTonDepositNotifyCustomEmojiId(),
          customEmojiFallback: "\uD83D\uDC8E"
        }
      );
    }

    return res.json({
      ok: true,
      duplicate: !!claimRes?.duplicate,
      userId: Number(userId),
      amountTon: transfer.amountTon,
      amountNano: String(transfer.amountNano),
      newBalance: Number(claimRes?.newBalance || 0),
      txHash,
      txLt,
      messageHash,
      indexedAt: txUtime
    });
  } catch (error) {
    console.error("[TON Deposit] confirm error:", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to confirm TON deposit"
    });
  }
});

// ====== DEPOSIT NOTIFICATION ======
app.post("/api/deposit-notification", async (req, res) => {
  let claimedDepositEventKey = "";
  try {
    const {
      amount,
      currency,
      userId,
      txHash,
      timestamp,
      initData,
      invoiceId,
      depositId: bodyDepositId,
      type,
      roundId,
      bets,
      notify
    } = req.body || {};

    const amountNum = Number(amount);
    const typeNorm = String(type || "deposit").trim().toLowerCase();

    // Validation
    if (!userId) {
      return res.status(400).json({ ok: false, error: "User ID required" });
    }

    if (!Number.isFinite(amountNum) || amountNum === 0) {
      return res.status(400).json({ ok: false, error: "Invalid amount" });
    }

    if (!currency || !["ton", "stars"].includes(currency)) {
      return res.status(400).json({ ok: false, error: "Invalid currency" });
    }

    const isTechPauseBlockedDebit =
      isTechPauseBlockingActions() &&
      amountNum < 0 &&
      (typeNorm === "bet" || typeNorm === "wheel_bet" || typeNorm === "case_open");
    if (isTechPauseBlockedDebit) {
      return res.status(503).json(buildTechPauseApiErrorPayload());
    }

    const isRelayer = isRelayerSecretOk(req);
    const maxAgeSec = Math.max(
      60,
      Math.min(30 * 24 * 60 * 60, Number(process.env.TG_INITDATA_MAX_AGE_SEC || 86400) || 86400)
    );

    // For browser-originated requests, require valid Telegram initData and strict userId match.
    let user = null;
    if (!isRelayer) {
      if (!initData) {
        return res.status(401).json({ ok: false, error: "initData required" });
      }
      if (!process.env.BOT_TOKEN) {
        return res.status(500).json({ ok: false, error: "BOT_TOKEN not set" });
      }

      const check = verifyInitData(initData, process.env.BOT_TOKEN, maxAgeSec);
      if (!check.ok) {
        return res.status(403).json({ ok: false, error: "Bad initData" });
      }

      try {
        user = JSON.parse(check.params.user || "null");
      } catch {
        user = null;
      }

      if (!user?.id) {
        return res.status(403).json({ ok: false, error: "No user in initData" });
      }
      if (String(user.id) !== String(userId)) {
        return res.status(403).json({ ok: false, error: "userId mismatch" });
      }
    }

    const allowedUntrustedDebitTypes = new Set(["bet", "case_open", "wheel_bet"]);
    const isUntrustedClientCredit =
      !isRelayer &&
      amountNum > 0;
    if (isUntrustedClientCredit) {
      console.warn("[Deposit][SECURITY] Rejected untrusted positive credit:", {
        userId,
        amount: amountNum,
        currency,
        type: typeNorm,
        depositId: String(bodyDepositId || invoiceId || txHash || "").slice(0, 64)
      });
      return res.status(403).json({
        ok: false,
        error: "Client-originated positive credits are forbidden"
      });
    }

    const isBlockedUntrustedDebit =
      !isRelayer &&
      amountNum < 0 &&
      !allowedUntrustedDebitTypes.has(typeNorm);
    if (isBlockedUntrustedDebit) {
      return res.status(403).json({
        ok: false,
        error: "Untrusted debit type is forbidden"
      });
    }

    const isBlockedBrowserCaseOpen =
      !isRelayer &&
      amountNum < 0 &&
      typeNorm === "case_open" &&
      !CASES_BROWSER_PLAY_ENABLED;
    if (isBlockedBrowserCaseOpen) {
      return res.status(503).json({
        ok: false,
        code: "CASES_BROWSER_DISABLED",
        error: "Case openings are temporarily unavailable"
      });
    }

    let crashRoundCreditId = "";
    if (typeNorm === "bet" && amountNum < 0) {
      crashRoundCreditId = normalizeCrashRoundIdForUser(roundId, userId);
      if (!crashRoundCreditId) {
        return res.status(400).json({ ok: false, error: "Invalid crash roundId" });
      }

      const expectedRoundId = getCurrentCrashRoundIdForUser(userId);
      if (
        (crashGame.phase !== "betting" && crashGame.phase !== "waiting") ||
        !expectedRoundId ||
        crashRoundCreditId !== expectedRoundId
      ) {
        return res.status(409).json({ ok: false, error: "Crash round is closed" });
      }
    }

    if (typeNorm === "wheel_bet" && amountNum < 0) {
      const wheelRoundId = Number(roundId || 0);
      const normalizedWheelRoundId = Number.isFinite(wheelRoundId) ? Math.trunc(wheelRoundId) : 0;
      if (!normalizedWheelRoundId) {
        return res.status(400).json({ ok: false, error: "Invalid wheel roundId" });
      }

      const isWheelRoundOpen = wheelGame.phase === "waiting" || wheelGame.phase === "betting";
      if (!isWheelRoundOpen || normalizedWheelRoundId !== wheelGame.roundId) {
        return res.status(409).json({ ok: false, error: "Wheel round is closed" });
      }
    }

    const depositId = bodyDepositId || invoiceId || txHash || `${userId}_${currency}_${Math.abs(amountNum)}_${timestamp}`;
    const caseRoundId = extractCaseRoundIdFromDepositPayload(typeNorm, roundId, depositId);
    const isCaseOpenDebit = typeNorm === "case_open" && amountNum < 0;
    const isCaseRoundSettleCredit =
      amountNum > 0 &&
      (typeNorm === "case_gift_claim" || typeNorm === "case_nft_sell");

    const reconcileCaseRoundState = async () => {
      if (!caseRoundId) return;
      if (isCaseOpenDebit) {
        const caseCost = normalizeCaseRoundCost(Math.abs(amountNum), currency);
        if (!(caseCost > 0)) return;
        try {
          await registerPendingCaseRound({
            roundId: caseRoundId,
            telegramId: userId,
            currency,
            caseCost,
            openDepositId: depositId,
            metadata: {
              type: typeNorm,
              source: isRelayer ? "relayer" : "client",
              createdAt: Date.now()
            }
          });
        } catch (e) {
          console.error("[Cases] Failed to register pending round:", e?.message || e);
        }
        return;
      }

      if (isCaseRoundSettleCredit) {
        try {
          await resolvePendingCaseRound(caseRoundId, {
            telegramId: userId,
            status: "settled",
            resolution: typeNorm
          });
        } catch (e) {
          console.error("[Cases] Failed to settle pending round:", e?.message || e);
        }
      }
    };
    const shouldPersistentCreditDedupe =
      amountNum > 0 &&
      typeNorm === "deposit";

    if (shouldPersistentCreditDedupe && !String(depositId || "").trim()) {
      return res.status(400).json({ ok: false, error: "depositId/invoiceId/txHash required for deposit credit" });
    }

    console.log("[Deposit] Notification received:", {
      amount: amountNum,
      currency,
      userId,
      type: typeNorm,
      caseRoundId: caseRoundId || null,
      depositId: depositId ? `${String(depositId).substring(0, 20)}...` : null,
      timestamp
    });

    // Idempotency: dedupe positive credits and key bet/win events.
    const shouldDedupe = !!depositId && (
      amountNum > 0 ||
      typeNorm === "wheel_bet" ||
      typeNorm === "wheel_win" ||
      typeNorm === "bet" ||
      typeNorm === "case_open"
    );

    if (shouldDedupe && isDepositProcessed(depositId)) {
      console.log("[Deposit] Duplicate detected, skipping:", depositId);
      return res.json({
        ok: true,
        message: "Already processed",
        duplicate: true
      });
    }

    if (shouldPersistentCreditDedupe) {
      claimedDepositEventKey = buildDepositDedupeEventKey({
        userId,
        currency,
        type: typeNorm,
        depositId
      });
      const claimed = await claimWebhookEvent(claimedDepositEventKey, {
        userId: String(userId || ""),
        currency: String(currency || ""),
        type: typeNorm,
        amount: amountNum,
        depositId: String(depositId || "").slice(0, 128)
      });
      if (!claimed) {
        console.log("[Deposit] Duplicate credit event ignored:", claimedDepositEventKey);
        return res.json({
          ok: true,
          message: "Already processed",
          duplicate: true
        });
      }
    }

    if (user) {
      try {
        await db.saveUser(user);
        console.log("[Deposit] User saved:", user.id);
      } catch (err) {
        console.error("[Deposit] Failed to save user:", err);
      }
    } else {
      const fallbackUsername = safeShortText(req.body?.username || req.body?.tgUsername || "", 64) || null;
      const fallbackFirstName = safeShortText(
        req.body?.first_name || req.body?.firstName || req.body?.userName || req.body?.name || "",
        64
      ) || null;
      const fallbackLastName = safeShortText(req.body?.last_name || req.body?.lastName || "", 64) || null;
      if (fallbackUsername || fallbackFirstName || fallbackLastName) {
        try {
          await db.saveUser({
            id: userId,
            username: fallbackUsername,
            first_name: fallbackFirstName,
            last_name: fallbackLastName
          });
        } catch (fallbackErr) {
          console.error("[Deposit] Failed to save fallback user profile:", fallbackErr);
        }
      }
    }

    if (shouldDedupe) {
      markDepositProcessed(depositId);
    }

    // Send Telegram message only for trusted real deposits.
    const shouldSendDepositMessage =
      amountNum > 0 &&
      process.env.BOT_TOKEN &&
      typeNorm === "deposit";

    // Process transaction
    try {
      if (currency === "ton") {
        const newBalance = await db.updateBalance(
          userId,
          "ton",
          amountNum,
          typeNorm,
          generateDescription(typeNorm, amountNum, txHash, roundId),
          { txHash, roundId, bets: bets ? JSON.stringify(bets) : null }
        );

        await reconcileCaseRoundState();

        if (typeNorm === "wheel_bet" && amountNum < 0) {
          registerWheelBetCredit(roundId, userId, "ton", Math.abs(amountNum));
        }
        if (typeNorm === "bet" && amountNum < 0 && crashRoundCreditId) {
          registerCrashBetCredit(crashRoundCreditId, userId, "ton", Math.abs(amountNum));
        }

        console.log("[Deposit] TON balance updated:", { userId, amount: amountNum, newBalance });

        // BROADCAST BALANCE UPDATE
        broadcastBalanceUpdate(userId);

        // Send notification only for real deposits
        if (shouldSendDepositMessage) {
          await sendTelegramMessage(
            userId,
            buildDepositNotifyText(amountNum, "ton"),
            {
              parseMode: "HTML",
              customEmojiId: getTonDepositNotifyCustomEmojiId(),
              customEmojiFallback: "\uD83D\uDC8E"
            }
          );
        }

        return res.json({
          ok: true,
          message: amountNum > 0 ? "TON deposit processed" : "TON deducted",
          newBalance,
          amount: amountNum
        });
      }

      if (currency === "stars") {
        const newBalance = await db.updateBalance(
          userId,
          "stars",
          amountNum,
          typeNorm,
          generateDescription(typeNorm, amountNum, null, roundId),
          { invoiceId: depositId, roundId, bets: bets ? JSON.stringify(bets) : null }
        );

        await reconcileCaseRoundState();

        if (typeNorm === "wheel_bet" && amountNum < 0) {
          registerWheelBetCredit(roundId, userId, "stars", Math.abs(amountNum));
        }
        if (typeNorm === "bet" && amountNum < 0 && crashRoundCreditId) {
          registerCrashBetCredit(crashRoundCreditId, userId, "stars", Math.abs(amountNum));
        }

        console.log("[Deposit] Stars balance updated:", { userId, amount: amountNum, newBalance });

        // BROADCAST BALANCE UPDATE
        broadcastBalanceUpdate(userId);

        // Send notification only for real deposits
        if (shouldSendDepositMessage) {
          await sendTelegramMessage(
            userId,
            buildDepositNotifyText(amountNum, "stars"),
            {
              parseMode: "HTML",
              customEmojiId: getStarsDepositNotifyCustomEmojiId(),
              customEmojiFallback: "\u2B50"
            }
          );
        }

        return res.json({
          ok: true,
          message: amountNum > 0 ? "Stars deposit processed" : "Stars deducted",
          newBalance,
          amount: amountNum
        });
      }

      return res.status(400).json({ ok: false, error: "Invalid currency" });
    } catch (err) {
      console.error("[Deposit] Error updating balance:", err);
      // Remove from processed if failed
      if (shouldDedupe) {
        processedDeposits.delete(depositId);
      }
      if (claimedDepositEventKey) {
        await releaseWebhookEvent(claimedDepositEventKey).catch(() => {});
      }

      return res.status(500).json({
        ok: false,
        error: "Failed to update balance",
        details: err.message
      });
    }
  } catch (error) {
    if (claimedDepositEventKey) {
      await releaseWebhookEvent(claimedDepositEventKey).catch(() => {});
    }
    console.error("[Deposit] Error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Internal server error"
    });
  }
});

function generateDescription(type, amount, txHash, roundId) {
  switch (type) {
    case 'bet':
      return `Crash bet${roundId ? ` (${roundId})` : ''}`;
    case 'crash_win':
      return `Crash win${roundId ? ` (${roundId})` : ''}`;
    case 'case_open':
      return `Case open${roundId ? ` (${roundId})` : ''}`;
    case 'case_gift_claim':
      return `Case gift claim${roundId ? ` (${roundId})` : ''}`;
    case 'case_nft_sell':
      return `Case NFT sell${roundId ? ` (${roundId})` : ''}`;
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
// ====== SSE РґР»СЏ Р°РІС‚РѕРѕР±РЅРѕРІР»РµРЅРёСЏ Р±Р°Р»Р°РЅСЃР° ======

app.get("/api/balance/stream", requireTelegramUser, async (req, res) => {
  const tgUserId = String(req.tg?.user?.id || "").trim();
  const requestedUserId = String(req.query?.userId || "").trim();
  const userId = requestedUserId || tgUserId;

  if (!userId) {
    return res.status(400).json({ ok: false, error: "User ID required" });
  }
  if (userId !== tgUserId) {
    return res.status(403).json({ ok: false, error: "Forbidden userId" });
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
    const balance = await db.getUserBalance(parseInt(userId, 10));
    res.write(`data: ${JSON.stringify({
      type: 'balance',
      ton: parseFloat(balance.ton_balance) || 0,
      stars: parseInt(balance.stars_balance) || 0,
      timestamp: Date.now()
    })}\n\n`);
  } catch (err) {
    console.error('[SSE] Error sending initial balance:', err);
  }
  sendTechPauseToSseClient(res);
  
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
const processedWebhookEvents = new Map(); // webhook event key -> timestamp

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

function buildDepositDedupeEventKey({ userId, currency, type, depositId }) {
  const base = `${String(userId || "").trim()}|${String(currency || "").trim()}|${String(type || "").trim()}|${String(depositId || "").trim()}`;
  const hash = crypto.createHash("sha256").update(base).digest("hex");
  return `deposit:${hash}`;
}

async function getTaskProgressSignalsForUser(userId) {
  const topUpMinTon = TASK_TOP_UP_MIN_TON;
  const topUpMinStars = TASK_TOP_UP_MIN_STARS;

  if (typeof db.getTaskProgressSignals === "function") {
    const direct = await db.getTaskProgressSignals(userId, { topUpMinTon, topUpMinStars });
    return {
      topUpMinTon,
      topUpMinStars,
      maxTonDeposit: Number(direct?.maxTonDeposit || 0),
      maxStarsDeposit: Number(direct?.maxStarsDeposit || 0),
      topUpCompleted: !!direct?.topUpCompleted,
      gameWins: Math.max(0, Math.trunc(Number(direct?.gameWins || 0))),
      gameWinCompleted: !!direct?.gameWinCompleted
    };
  }

  // Fallback for DB drivers that don't implement task signals.
  const tx = typeof db.getTransactionHistory === "function"
    ? await db.getTransactionHistory(userId, 500).catch(() => [])
    : [];

  let maxTonDeposit = 0;
  let maxStarsDeposit = 0;
  let gameWins = 0;

  for (const row of Array.isArray(tx) ? tx : []) {
    const type = String(row?.type || "").toLowerCase();
    const currency = String(row?.currency || "").toLowerCase();
    const amount = Number(row?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (type === "deposit") {
      if (currency === "ton") maxTonDeposit = Math.max(maxTonDeposit, amount);
      if (currency === "stars") maxStarsDeposit = Math.max(maxStarsDeposit, amount);
    }
    if (type === "wheel_win" || type === "crash_win") gameWins += 1;
  }

  return {
    topUpMinTon,
    topUpMinStars,
    maxTonDeposit,
    maxStarsDeposit,
    topUpCompleted: maxTonDeposit >= topUpMinTon || maxStarsDeposit >= topUpMinStars,
    gameWins,
    gameWinCompleted: gameWins > 0
  };
}

function cleanupProcessedWebhookEvents() {
  const now = Date.now();
  for (const [key, ts] of processedWebhookEvents.entries()) {
    if (!key || !Number.isFinite(ts) || now - ts > 7 * 24 * 60 * 60 * 1000) {
      processedWebhookEvents.delete(key);
    }
  }
}

function getConfiguredWebhookSecret() {
  return String(
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    process.env.TG_WEBHOOK_SECRET ||
    ""
  ).trim();
}

function secureStringEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function isTelegramWebhookSecretOk(req) {
  const configured = getConfiguredWebhookSecret();
  if (!configured) return process.env.NODE_ENV !== "production";
  const headerToken = String(req.headers?.["x-telegram-bot-api-secret-token"] || "").trim();
  return secureStringEqual(headerToken, configured);
}

async function claimWebhookEvent(eventKey, payload = null) {
  const key = String(eventKey || "").trim();
  if (!key) return false;

  if (typeof db?.claimWebhookEvent === "function") {
    return !!(await db.claimWebhookEvent(key, payload));
  }

  cleanupProcessedWebhookEvents();
  if (processedWebhookEvents.has(key)) return false;
  processedWebhookEvents.set(key, Date.now());
  return true;
}

async function releaseWebhookEvent(eventKey) {
  const key = String(eventKey || "").trim();
  if (!key) return false;

  if (typeof db?.releaseWebhookEvent === "function") {
    return !!(await db.releaseWebhookEvent(key));
  }

  return processedWebhookEvents.delete(key);
}

// ====== BALANCE API ======
app.get("/api/balance", requireTelegramUser, async (req, res) => {
  try {
    const tgUserId = String(req.tg?.user?.id || "").trim();
    const userIdFromQuery = String(req.query?.userId || "").trim();

    if (userIdFromQuery && userIdFromQuery !== tgUserId) {
      return res.status(403).json({ ok: false, error: "Forbidden userId" });
    }
    if (!tgUserId) {
      return res.status(400).json({ ok: false, error: "User ID is required" });
    }

    const numericUserId = Number(tgUserId);
    if (!Number.isFinite(numericUserId)) {
      return res.status(400).json({ ok: false, error: "Invalid user ID" });
    }

    console.log('[Balance] Request for user:', numericUserId);

    const balance = await db.getUserBalance(numericUserId);

    console.log('[Balance] вњ… Retrieved:', balance);

    res.json({
      ok: true,
      userId: numericUserId,
      ton: parseFloat(balance.ton_balance) || 0,
      stars: parseInt(balance.stars_balance) || 0,
      updatedAt: balance.updated_at,
      techPause: getPublicTechPauseState()
    });

  } catch (error) {
    console.error('[Balance] вќЊ Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get balance'
    });
  }
});

app.get("/api/system/state", requireTelegramUser, async (req, res) => {
  try {
    const tgUserId = String(req.tg?.user?.id || "").trim();
    const userIdFromQuery = String(req.query?.userId || "").trim();
    if (userIdFromQuery && userIdFromQuery !== tgUserId) {
      return res.status(403).json({ ok: false, error: "Forbidden userId" });
    }

    return res.json({
      ok: true,
      serverTime: Date.now(),
      techPause: getPublicTechPauseState()
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to fetch system state"
    });
  }
});



// ====== STARS PAYMENT API ======
app.post("/api/stars/create-invoice", async (req, res) => {
  try {
    if (isTechPauseBlockingActions()) {
      return res.status(503).json(buildTechPauseApiErrorPayload());
    }

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

// ====== TELEGRAM WEBHOOK (Stars payments + start/write-access events) ======
app.post("/api/stars/webhook", async (req, res) => {
  try {
    const configuredWebhookSecret = getConfiguredWebhookSecret();
    if (!isTelegramWebhookSecretOk(req)) {
      console.warn("[Stars Webhook] Rejected request: invalid webhook secret token");
      const missingSecretInProd =
        process.env.NODE_ENV === "production" && !configuredWebhookSecret;
      return res.status(403).json({
        ok: false,
        error: missingSecretInProd ? "webhook secret is not configured" : "forbidden"
      });
    }

    const update = (req.body && typeof req.body === "object") ? req.body : {};

    console.log('[Stars Webhook] Received update:', JSON.stringify(update, null, 2));

    // Handle pre_checkout_query
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const BOT_TOKEN = process.env.BOT_TOKEN;
      if (!BOT_TOKEN) {
        return res.status(500).json({ ok: false, error: "BOT_TOKEN not set" });
      }

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
      const userId = update.message.from?.id;
      const userFrom = update.message.from;
      const chargeId = String(payment.telegram_payment_charge_id || "").trim();
      const amountStars = Number(payment.total_amount || 0);
      const invoicePayload = String(payment.invoice_payload || "").trim();
      const eventKey = `telegram:stars:${chargeId}`;
      const txInvoiceId = `tgpay:${chargeId}`;

      if (!userId) {
        return res.status(400).json({ ok: false, error: "user id missing in payment update" });
      }
      if (!chargeId) {
        return res.status(400).json({ ok: false, error: "telegram_payment_charge_id missing" });
      }
      if (!Number.isFinite(amountStars) || amountStars <= 0) {
        return res.status(400).json({ ok: false, error: "Invalid payment amount" });
      }

      console.log('[Stars Webhook] Successful payment:', {
        userId,
        amount: amountStars,
        payload: invoicePayload,
        telegramPaymentChargeId: chargeId
      });

      const claimed = await claimWebhookEvent(eventKey, {
        chargeId,
        userId: String(userId || ""),
        amount: amountStars,
        payload: invoicePayload || null
      });
      if (!claimed) {
        console.log("[Stars Webhook] Duplicate event ignored:", chargeId);
        return res.json({ ok: true, duplicate: true });
      }

      try { await db.saveUser(userFrom); } catch {}

      try {
        const newBalance = await db.updateBalance(
          userId,
          'stars',
          amountStars,
          'deposit',
          `Stars payment ${chargeId}`,
          { invoiceId: txInvoiceId, txHash: chargeId }
        );

        console.log('[Stars Webhook] Balance updated:', { userId, newBalance });

        await sendTelegramMessage(
          userId,
          buildDepositNotifyText(amountStars, "stars"),
          {
            parseMode: "HTML",
            customEmojiId: getStarsDepositNotifyCustomEmojiId(),
            customEmojiFallback: "\u2B50"
          }
        );

        return res.json({ ok: true, duplicate: false });
      } catch (err) {
        await releaseWebhookEvent(eventKey).catch(() => {});
        console.error('[Stars Webhook] Error updating balance:', err);
        return res.status(500).json({ ok: false, error: "Failed to apply stars payment" });
      }
    }

    const welcomeTrigger = isTelegramWelcomeTrigger(update);
    if (welcomeTrigger) {
      const userId = String(welcomeTrigger?.user?.id || "").trim();
      const updateIdRaw = Number(update?.update_id);
      const fallbackMsgId = String(welcomeTrigger?.message?.message_id || "").trim();
      const eventSuffix = Number.isFinite(updateIdRaw) ? String(updateIdRaw) : `${userId}:${fallbackMsgId || "na"}`;
      const eventKey = `telegram:welcome:${welcomeTrigger.reason}:${eventSuffix}`;

      if (!userId) {
        return res.json({ ok: true, welcomeSent: false, reason: "missing_user_id" });
      }

      const claimed = await claimWebhookEvent(eventKey, {
        reason: welcomeTrigger.reason,
        userId,
        updateId: Number.isFinite(updateIdRaw) ? updateIdRaw : null
      });
      if (!claimed) {
        return res.json({ ok: true, duplicate: true, reason: "welcome_duplicate" });
      }

      try { await db.saveUser(welcomeTrigger.user); } catch {}

      const welcomeResult = await sendTelegramWelcomeMessage(userId);
      if (!welcomeResult?.ok) {
        const classification = classifyTelegramSendError({
          description: welcomeResult?.error || ""
        });
        const isTerminalSendError =
          classification === "blocked" ||
          classification === "chat_not_found" ||
          classification === "forbidden" ||
          classification === "deactivated";

        if (!isTerminalSendError) {
          await releaseWebhookEvent(eventKey).catch(() => {});
          console.error("[Telegram Welcome] send failed:", {
            userId,
            reason: welcomeTrigger.reason,
            error: String(welcomeResult?.error || "send failed")
          });
          return res.status(500).json({ ok: false, error: "Failed to send welcome message" });
        }

        console.warn("[Telegram Welcome] terminal send error:", {
          userId,
          reason: welcomeTrigger.reason,
          class: classification,
          error: String(welcomeResult?.error || "")
        });
        return res.json({ ok: true, welcomeSent: false, skipped: classification });
      }

      return res.json({ ok: true, welcomeSent: true, trigger: welcomeTrigger.reason });
    }

    return res.json({ ok: true, message: "Update ignored" });

  } catch (error) {
    console.error('[Stars Webhook] Error processing webhook:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});
// ====== USER PROFILE API ======
app.get("/api/user/profile", requireTelegramUser, async (req, res) => {
  try {
    const tgUserId = String(req.tg?.user?.id || "").trim();
    const userId = String(req.query?.userId || "").trim() || tgUserId;
    if (!userId) return res.status(400).json({ ok: false, error: 'User ID is required' });
    if (userId !== tgUserId) return res.status(403).json({ ok: false, error: "Forbidden userId" });

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
        languageCode: user.language_code || null,
        uiLanguage: normalizeExplicitUiLanguageCode(user.ui_language) || null,
        isPremium: user.is_premium === true || user.is_premium === 1,
        tonBalance: user.ton_balance || 0,
        starsBalance: user.stars_balance || 0,
        ban: Number(user.ban) === 1 ? 1 : 0,
        createdAt: user.created_at,
        lastSeen: user.last_seen
      },
      techPause: getPublicTechPauseState()
    });

  } catch (error) {
    console.error('[Profile] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to get profile'
    });
  }
});

app.get("/api/user/language", requireTelegramUser, async (req, res) => {
  try {
    const tgUser = req.tg?.user || null;
    const userId = String(tgUser?.id || "").trim();
    if (!userId) return res.status(400).json({ ok: false, error: "User ID is required" });

    const dbUser = req.dbUser || await db.getUserById(userId).catch(() => null);
    const resolved = resolveUserUiLanguagePreference(dbUser, tgUser);
    const defaultLanguage = normalizeUiLanguageCode(
      dbUser?.language_code ?? tgUser?.language_code ?? tgUser?.languageCode
    ) || "en";

    return res.json({
      ok: true,
      language: resolved.language,
      source: resolved.source,
      manualLanguage: resolved.manualLanguage,
      defaultLanguage
    });
  } catch (error) {
    console.error("[Language] Failed to resolve user language:", error);
    return res.status(500).json({ ok: false, error: "Failed to resolve language" });
  }
});

app.post("/api/user/language", requireTelegramUser, async (req, res) => {
  try {
    const tgUser = req.tg?.user || null;
    const userId = String(tgUser?.id || "").trim();
    if (!userId) return res.status(400).json({ ok: false, error: "User ID is required" });

    const rawLanguage = req.body?.language ?? req.body?.lang;
    const language = normalizeExplicitUiLanguageCode(rawLanguage);
    if (!language) {
      return res.status(400).json({ ok: false, error: "Unsupported language", supported: ["en", "ru"] });
    }
    if (typeof db?.setUserUiLanguage !== "function") {
      return res.status(500).json({ ok: false, error: "Language persistence is unavailable" });
    }

    await db.setUserUiLanguage(userId, language);
    return res.json({ ok: true, language });
  } catch (error) {
    console.error("[Language] Failed to save user language:", error);
    return res.status(500).json({ ok: false, error: "Failed to save language" });
  }
});

// ====== USER STATS API ======
app.get("/api/user/stats", requireTelegramUser, async (req, res) => {
  try {
    const tgUserId = String(req.tg?.user?.id || "").trim();
    const userId = String(req.query?.userId || "").trim() || tgUserId;
    if (!userId) return res.status(400).json({ ok: false, error: 'User ID is required' });
    if (userId !== tgUserId) return res.status(403).json({ ok: false, error: "Forbidden userId" });

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
app.get("/api/user/transactions", requireTelegramUser, async (req, res) => {
  try {
    const tgUserId = String(req.tg?.user?.id || "").trim();
    const userId = String(req.query?.userId || "").trim() || tgUserId;
    const { limit } = req.query;
    if (!userId) return res.status(400).json({ ok: false, error: 'User ID is required' });
    if (userId !== tgUserId) return res.status(403).json({ ok: false, error: "Forbidden userId" });

    const transactions = await db.getTransactionHistory(userId, parseInt(limit) || 50);

    res.json({
      ok: true,
      transactions: transactions.map(tx => ({
        id: tx.id,
        telegramUsername: tx.telegram_username || null,
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
    if (isTechPauseBlockingActions()) {
      return res.status(503).json(buildTechPauseApiErrorPayload());
    }

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
// рџ§Є TEST BALANCE SYSTEM
//  "

// ====== MARKET STORE (Relayer -> Server) ======
// Relayer posts to:
//   POST /api/market/items/add   (requires secret)
// Frontend reads from:
//   GET  /api/market/items/list

const MARKET_DB_PATH =
  process.env.MARKET_DB_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/opt/render/project/data/market-items.json"
    : path.join(__dirname, "market-items.json"));


// ====== MARKET SOLD (anti-readd / hard remove) ======
// Once an item is bought, we store its sourceKey here to prevent the relayer from re-adding it.
const MARKET_SOLD_PATH =
  process.env.MARKET_SOLD_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/opt/render/project/data/market-sold.json"
    : path.join(__dirname, "market-sold.json"));

async function readMarketSoldSet() {
  try {
    const dir = path.dirname(MARKET_SOLD_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(MARKET_SOLD_PATH)) return new Set();
    const raw = fs.readFileSync(MARKET_SOLD_PATH, "utf8");
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch (e) {
    console.error("[MarketSold] read error:", e);
    return new Set();
  }
}

async function writeMarketSoldSet(set) {
  try {
    const dir = path.dirname(MARKET_SOLD_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${MARKET_SOLD_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Array.from(set || new Set()), null, 2), "utf8");
    fs.renameSync(tmp, MARKET_SOLD_PATH);
    return true;
  } catch (e) {
    console.error("[MarketSold] write error:", e);
    return false;
  }
}

async function markMarketSold(sourceKey) {
  const k = String(sourceKey || "").trim();
  if (!k) return false;
  return await withMarketLock(async () => {
    const set = await readMarketSoldSet();
    set.add(k);
    await writeMarketSoldSet(set);
    return true;
  });
}

async function isMarketSold(sourceKey) {
  const k = String(sourceKey || "").trim();
  if (!k) return false;
  const set = await readMarketSoldSet();
  return set.has(k);
}

async function unmarkMarketSold(sourceKey) {
  const k = String(sourceKey || "").trim();
  if (!k) return false;
  return await withMarketLock(async () => {
    const set = await readMarketSoldSet();
    if (!set.has(k)) return false;
    set.delete(k);
    await writeMarketSoldSet(set);
    return true;
  });
}

function getBearerToken(req) {
  const h = String(req.headers?.authorization || "");
  if (!h) return "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || "").trim() : "";
}

function isRelayerSecretOk(req) {
  const secret = process.env.RELAYER_SECRET || process.env.MARKET_SECRET || "";
  if (!secret) return false;
  const token = getBearerToken(req);
  const alt = String(req.headers?.["x-relayer-secret"] || req.headers?.["x-relay-secret"] || "").trim();
  return safeTextEqual(token, secret) || safeTextEqual(alt, secret);
}

async function ensureMarketDir() {
  try {
    const dir = path.dirname(MARKET_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error("[MarketStore] ensure dir error:", e);
  }
}

async function readMarketItems() {
  try {
    if (typeof db.getMarketItems === "function") {
      return await db.getMarketItems(5000);
    }

    await ensureMarketDir();
    if (!fs.existsSync(MARKET_DB_PATH)) return [];
    const raw = fs.readFileSync(MARKET_DB_PATH, "utf8");
    const data = JSON.parse(raw || "[]");
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("[MarketStore] read error:", e);
    return [];
  }
}


let marketQueue = Promise.resolve();

function withMarketLock(fn) {
  const run = marketQueue.then(fn, fn);
  marketQueue = run.catch(() => {});
  return run;
}

async function writeMarketItems(items) {
  try {
    if (typeof db.clearMarketItems === "function" && typeof db.addMarketItem === "function") {
      await db.clearMarketItems();
      const arr = Array.isArray(items) ? items : [];
      for (const it of arr) {
        if (!it || typeof it !== "object") continue;
        if (!it.id) continue;
        await db.addMarketItem(it);
      }
      return true;
    }

    await ensureMarketDir();
    const tmp = `${MARKET_DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, MARKET_DB_PATH);
    return true;
  } catch (e) {
    console.error("[MarketStore] write error:", e);
    return false;
  }
}

function safeMarketString(s, max = 120) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

function safeMarketImagePath(p) {
  const t = String(p ?? "").trim();
  if (!t) return "";
  if (!t.startsWith("/images/")) return "";
  if (t.includes("://")) return "";
  return t;
}


function safeMarketPreviewRef(p) {
  const t = String(p ?? "").trim();
  if (!t) return "";
  // allow data: (used only in dev); do not truncate base64 here
  if (t.startsWith("data:")) return t;

  // allow local assets
  const local = safeMarketImagePath(t);
  if (local) return local;

  // allow Fragment preview URLs (pre-rendered composite: backdrop + pattern + model)
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return "";
    const host = String(u.hostname || "").toLowerCase();
    if (host !== "nft.fragment.com") return "";
    if (!u.pathname.startsWith("/gift/")) return "";
    if (!/\.(small|medium|large)\.(jpg|jpeg|webp)$/i.test(u.pathname)) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function fragmentMediumPreviewUrlFromSlug(slug) {
  const s = safeMarketString(slug, 160);
  if (!s) return "";
  const base = s.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
  if (!base) return "";
  return `https://nft.fragment.com/gift/${base}.medium.jpg`;
}

function resolveMarketItemPriceTon(item, tonUsd = null) {
  const direct = Number(item?.priceTon ?? item?.price_ton ?? item?.price?.ton ?? item?.price ?? null);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const name = normalizeGiftName(item?.name || item?.displayName || "");
  if (!name) return null;

  const q = String(name).toLowerCase();
  let cached = giftsPrices.get(name) || null;
  if (!cached && giftsPrices?.size) {
    for (const [nm, val] of giftsPrices.entries()) {
      if (String(nm).toLowerCase() === q) {
        cached = val;
        break;
      }
    }
  }

  const cachedTon = Number(cached?.priceTon ?? cached?.price_ton ?? cached?.price ?? null);
  if (Number.isFinite(cachedTon) && cachedTon > 0) return cachedTon;

  const rel = getRelayerPriceEntry(name);
  const relTon = computeRelayerPriceTon(rel, tonUsd);
  return (Number.isFinite(relTon) && relTon > 0) ? relTon : null;
}

function resolveMarketItemPriceStars(item, tonUsd = null) {
  const direct = Number(item?.priceStars ?? item?.price_stars ?? item?.price?.stars ?? null);
  if (Number.isFinite(direct) && direct > 0) return Math.max(1, Math.round(direct));

  const priceTon = resolveMarketItemPriceTon(item, tonUsd);
  if (Number.isFinite(priceTon) && priceTon > 0) {
    const converted = tonToStars(priceTon, tonUsd);
    if (Number.isFinite(converted) && converted > 0) return converted;
  }

  const name = normalizeGiftName(item?.name || item?.displayName || "");
  if (!name) return null;

  const rel = getRelayerPriceEntry(name);
  const relStars = computeRelayerPriceStars(rel, tonUsd);
  return (Number.isFinite(relStars) && relStars > 0) ? relStars : null;
}


// List (new)
app.get("/api/market/items/list", async (req, res) => {
  try {
    const items = await readMarketItems();
    const rate = await getTonUsdRate();
    const tonUsd = rate?.tonUsd;

    const outItems = items.map((it) => {
      if (!it || typeof it !== "object") return it;
      const priceTon = resolveMarketItemPriceTon(it, tonUsd);
      const priceStars = resolveMarketItemPriceStars(it, tonUsd);
      return {
        ...it,
        priceTon: Number.isFinite(priceTon) && priceTon > 0 ? priceTon : null,
        priceStars
      };
    });

    return res.json({
      ok: true,
      count: outItems.length,
      items: outItems,
      rate: {
        tonUsd: tonUsd || null,
        starsUsd: STARS_USD,
        starsPerTon: starsPerTon(tonUsd),
        updatedAt: rate?.updatedAt || 0,
        source: rate?.source || "",
        error: tonUsd ? null : (rate?.error || "rate unavailable")
      }
    });
  } catch (e) {
    console.error("[MarketStore] list error:", e);
    return res.status(500).json({ ok: false, error: "market list error" });
  }
});

// List (legacy alias)
app.get("/api/market/items", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit) || 200));
    const items = await readMarketItems();
    const rate = await getTonUsdRate();
    const tonUsd = rate?.tonUsd;

    const slice = items.slice(0, limit);
    const outItems = slice.map((it) => {
      if (!it || typeof it !== "object") return it;
      const priceTon = resolveMarketItemPriceTon(it, tonUsd);
      const priceStars = resolveMarketItemPriceStars(it, tonUsd);
      return {
        ...it,
        priceTon: Number.isFinite(priceTon) && priceTon > 0 ? priceTon : null,
        priceStars
      };
    });

    return res.json({
      ok: true,
      count: items.length,
      items: outItems,
      rate: {
        tonUsd: tonUsd || null,
        starsUsd: STARS_USD,
        starsPerTon: starsPerTon(tonUsd),
        updatedAt: rate?.updatedAt || 0,
        source: rate?.source || "",
        error: tonUsd ? null : (rate?.error || "rate unavailable")
      }
    });
  } catch (e) {
    console.error("[MarketStore] list error:", e);
    return res.status(500).json({ ok: false, error: "market list error" });
  }
});

// Add item (relayer only)
app.post("/api/market/items/add", async (req, res) => {
  try {
    if (!isRelayerSecretOk(req)) return res.status(403).json({ ok: false, error: "forbidden" });
    const item = req.body?.item;
    if (!item || typeof item !== "object") return res.status(400).json({ ok: false, error: "item required" });
    // If this sourceKey was marked as sold earlier, this is an explicit relist attempt.
    // Remove sold flag so gift cannot be silently dropped/lost on market return.
    let relisted = false;
    if (item?.sourceKey && await isMarketSold(item.sourceKey)) {
      relisted = await unmarkMarketSold(item.sourceKey);
    }

    const id = safeMarketString(item.id, 96) || `m_${Date.now()}`;
    const name = safeMarketString(item.name, 120) || "Gift";
    const number = safeMarketString(item.number, 32) || "";
    const createdAt = Number(item.createdAt || Date.now());
    const priceTon = (item.priceTon == null ? null : Number(item.priceTon));

    // image: prefer local /images/...; otherwise materialize inline/remote image to local file.
    const rawImage = String(item.image || "").trim();
    const imageCandidates = [
      rawImage,
      item?.tg?.model?.image,
      item?.icon
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    const data =
      String(item.imageData || "").trim() ||
      (rawImage.startsWith("data:") ? rawImage : "");
    let image = safeMarketImagePath(rawImage);
    if (data) {
      const saved = saveMarketImageFromData(data, name);
      if (saved) image = saved;
    }
    if (!image && !data) {
      const inlineCandidate = imageCandidates.find((v) => v.startsWith("data:")) || "";
      if (inlineCandidate) {
        const savedInline = saveMarketImageFromData(inlineCandidate, name);
        if (savedInline) image = savedInline;
      }
    }
    if (!image) {
      for (const candidate of imageCandidates) {
        const remoteUrl = safeMarketRemoteImageUrl(candidate);
        if (!remoteUrl) continue;
        const savedRemote = await saveMarketImageFromRemoteUrl(remoteUrl, name);
        if (savedRemote) {
          image = savedRemote;
          break;
        }
      }
    }

    // preview: pre-rendered composite (Fragment preferred)
    let previewUrl = safeMarketPreviewRef(item.previewUrl);
    if (!previewUrl) previewUrl = fragmentMediumPreviewUrlFromSlug(item?.tg?.slug);

    let tgPayload = item?.tg || null;
    if (image && tgPayload && typeof tgPayload === "object") {
      const model = tgPayload.model;
      if (model && typeof model === "object") {
        tgPayload = {
          ...tgPayload,
          model: {
            ...model,
            image
          }
        };
      }
    }

    const out = {
      ...item,
      id, name, number,
      image,
      previewUrl,
      tg: tgPayload,
      priceTon: Number.isFinite(priceTon) ? priceTon : null,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    };
    delete out.imageData;
    delete out.previewData;
    let saved = out;
    if (typeof db.addMarketItem === "function" && typeof db.getMarketItems === "function") {
      // Fast path for Postgres: upsert single row instead of rewriting full market.
      await db.addMarketItem(out);
    } else {
      saved = await withMarketLock(async () => {
        const items = await readMarketItems();
        const filtered = items.filter(x => String(x?.id) !== String(out.id));
        filtered.unshift(out);

        const MAX = Math.max(10, Math.min(5000, Number(process.env.MARKET_MAX_ITEMS) || 1000));
        if (filtered.length > MAX) filtered.length = MAX;

        const ok = await writeMarketItems(filtered);
        if (!ok) throw new Error("write failed");
        return out;
      });
    }

    return res.json({ ok: true, item: saved, relisted });
  } catch (e) {
    console.error("[MarketStore] add error:", e);
    return res.status(500).json({ ok: false, error: "market add error" });
  }
});

// Clear (relayer only)
app.post("/api/market/items/clear", async (req, res) => {
  try {
    if (!isRelayerSecretOk(req)) return res.status(403).json({ ok: false, error: "forbidden" });
    await withMarketLock(() => writeMarketItems([]));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[MarketStore] clear error:", e);
    return res.status(500).json({ ok: false, error: "market clear error" });
  }
});



// Buy item (Telegram user only): move market -> inventory, charge balance, and mark as sold
app.post("/api/market/items/buy", requireTelegramUser, requireTechPauseActionsAllowed, async (req, res) => {
  try {
    const userId = String(req.tg.user.id);
    if (ADMIN_ONLY_TRADING_MODE && !isRelayerAdminUserId(userId)) {
      return res.status(403).json({
        ok: false,
        code: "ADMIN_ONLY_TRADING",
        error: "Market buy is temporarily available only for admins"
      });
    }
    const { id, currency } = req.body || {};
    const itemId = safeMarketString(id, 128);
    if (!itemId) return res.status(400).json({ ok: false, error: "id required" });

    const cur = String(currency || "ton").toLowerCase() === "stars" ? "stars" : "ton";
    const hasDbMarketOps = typeof db.takeMarketItemById === "function" && typeof db.addMarketItem === "function";
    const MAX_MARKET_ITEMS = Math.max(10, Math.min(5000, Number(process.env.MARKET_MAX_ITEMS) || 1000));

    let it = null;
    if (hasDbMarketOps) {
      // Fast DB path: reserve item atomically without waiting on global in-memory lock queue.
      it = await db.takeMarketItemById(itemId);
    } else {
      // File fallback path still needs lock for atomic reserve.
      it = await withMarketLock(async () => {
        const items = await readMarketItems();
        const idx = items.findIndex(x => String(x?.id) === itemId);
        if (idx < 0) return null;
        const picked = items[idx];
        items.splice(idx, 1);
        const ok = await writeMarketItems(items);
        if (!ok) throw new Error("market write failed");
        return picked;
      });
    }
    if (!it) return res.status(409).json({ ok: false, code: "ALREADY_SOLD", error: "ALREADY_SOLD" });

    const rollbackMarketItem = async () => {
      if (!it || typeof it !== "object") return;

      if (hasDbMarketOps) {
        try { await db.addMarketItem(it); } catch {}
        return;
      }

      try {
        await withMarketLock(async () => {
          const items = await readMarketItems();
          const exists = items.some(x => String(x?.id) === String(it?.id));
          if (exists) return;
          items.unshift(it);
          if (items.length > MAX_MARKET_ITEMS) items.length = MAX_MARKET_ITEMS;
          await writeMarketItems(items);
        });
      } catch {}
    };

    // Buy must be instant. Never block on external TON/USD fetch in purchase path.
    const tonUsd = Number.isFinite(Number(tonUsdCache?.tonUsd)) && Number(tonUsdCache?.tonUsd) > 0
      ? Number(tonUsdCache.tonUsd)
      : null;

    const priceTon = resolveMarketItemPriceTon(it, tonUsd);
    const priceStars = resolveMarketItemPriceStars(it, tonUsd);

    const price = (cur === "stars") ? Number(priceStars || 0) : priceTon;
    if (!Number.isFinite(price) || price <= 0) {
      await rollbackMarketItem();
      return res.status(400).json({ ok: false, code: "BAD_PRICE", error: "BAD_PRICE" });
    }

    // explicit guard before attempting debit to keep error semantics predictable
    // across db backends and avoid progressing purchase flow with stale/invalid funds.
    try {
      const bal = await db.getUserBalance(userId);
      const available = cur === "stars"
        ? Number(bal?.stars_balance ?? 0)
        : Number(bal?.ton_balance ?? 0);
      if (!Number.isFinite(available) || available < price) {
        await rollbackMarketItem();
        return res.status(402).json({ ok: false, code: "INSUFFICIENT_BALANCE", error: "Insufficient balance" });
      }
    } catch {}

    // charge
    let newBalance = null;
    try {
      newBalance = await db.updateBalance(userId, cur, -price, "market_buy", `Market buy: ${it?.name || "Gift"}`, { marketItemId: itemId });
    } catch (e) {
      await rollbackMarketItem();
      return res.status(402).json({ ok: false, code: "INSUFFICIENT_BALANCE", error: e?.message || "Insufficient balance" });
    }

    // build inventory item
    const nowMs = Date.now();
    const withdrawLockUntil = cur === "stars" ? (nowMs + 5 * 24 * 60 * 60 * 1000) : null;
    const instanceId = `mkt_${itemId}_${crypto.randomBytes(6).toString("hex")}`;
    const invItem = {
      type: "nft",
      id: String(it?.tg?.slug || it?.tg?.giftId || it?.id || "gift"),
      name: it?.name || "Gift",
      displayName: it?.name || "Gift",
      icon: it?.previewUrl || it?.image || it?.tg?.model?.image || "/images/gifts/stars.webp",
      previewUrl: it?.previewUrl || "",
      image: it?.image || "",
      instanceId,
      acquiredAt: nowMs,
      acquiredCurrency: cur,
      buyCurrency: cur,
      withdrawLockUntil,
      price: { ton: priceTon || null, stars: priceStars || null },
      fromMarket: true,
      marketId: itemId,
      tg: it?.tg || null
    };

    const addRes = await inventoryAdd(userId, [invItem], `buy_${itemId}`);
    if (!addRes?.items) {
      try { await db.updateBalance(userId, cur, +price, "market_buy_refund", `Refund market buy: ${it?.name || "Gift"}`, { marketItemId: itemId }); } catch {}
      await rollbackMarketItem();
      return res.status(400).json({ ok: false, code: "INV_ADD_FAILED", error: "INV_ADD_FAILED" });
    }

    if (it?.sourceKey) {
      try { await markMarketSold(it.sourceKey); }
      catch (soldErr) { console.warn("[Market] mark sold warning:", soldErr?.message || soldErr); }
    }

    return res.json({ ok: true, id: itemId, newBalance, inventory: addRes.items });
  } catch (e) {
    console.error("[Market] buy error:", e);
    return res.status(500).json({ ok: false, error: "market buy error" });
  }
});

// ====== SPA fallback ======"
// ============================================

// рџЋЃ Р”РђРўР¬ РўР•РЎРўРћР’Р«Р• Р”Р•РќР¬Р“Р (explicitly enabled non-prod only)
app.post("/api/test/give-balance", requireTestApiEnabled, async (req, res) => {
  try {
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
    } catch (e) { /* ok: СѓР¶Рµ РµСЃС‚СЊ */ }

    console.log('[TEST] рџЋЃ Giving test balance:', { userId: uid, ton, stars });

    let results = {};

    if (ton && ton > 0) {
      const newTonBalance = await db.updateBalance(
        uid,
        'ton',
        parseFloat(ton),
        'test',
        'рџ§Є Test TON deposit',
        { test: true }
      );
      results.ton = newTonBalance;
      console.log('[TEST] вњ… Added TON:', newTonBalance);
    }

    if (stars && stars > 0) {
      const newStarsBalance = await db.updateBalance(
        uid,
        'stars',
        parseInt(stars, 10),
        'test',
        'рџ§Є Test Stars deposit',
        { test: true }
      );
      results.stars = newStarsBalance;
      console.log('[TEST] вњ… Added Stars:', newStarsBalance);
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

// рџ”„ РЎР‘Р РћРЎРРўР¬ Р‘РђР›РђРќРЎ (explicitly enabled non-prod only)
app.post("/api/test/reset-balance", requireTestApiEnabled, async (req, res) => {
  try {
    const { userId } = req.body;
    const uid = parseInt(userId, 10);
    if (!userId || Number.isNaN(uid)) {
      return res.status(400).json({ ok: false, error: 'Numeric user ID is required' });
    }

    // ensure user exists (РЅР° СЃР»СѓС‡Р°Р№ С‡РёСЃС‚РѕР№ Р‘Р”)
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

    console.log('[TEST] рџ”„ Resetting balance for user:', uid);

    // Reset to zero via deltas (updateBalance adds, so we subtract current)
    const current = await db.getUserBalance(uid);
    const curTon = parseFloat(current.ton_balance) || 0;
    const curStars = parseInt(current.stars_balance) || 0;

    if (curTon !== 0) {
      await db.updateBalance(uid, 'ton', -curTon, 'test', 'рџ§Є Balance reset (TONв†’0)', { test: true, reset: true });
    }
    if (curStars !== 0) {
      await db.updateBalance(uid, 'stars', -curStars, 'test', 'рџ§Є Balance reset (Starsв†’0)', { test: true, reset: true });
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


// рџ’° РЈРЎРўРђРќРћР’РРўР¬ РўРћР§РќР«Р™ Р‘РђР›РђРќРЎ (explicitly enabled non-prod only)
app.post("/api/test/set-balance", requireTestApiEnabled, async (req, res) => {
  try {
    const { userId, ton, stars } = req.body;
    const uid = parseInt(userId, 10);
    if (!userId || Number.isNaN(uid)) {
      return res.status(400).json({ ok: false, error: 'Numeric user ID is required' });
    }

    // ensure user exists (РґР»СЏ FK)
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

    console.log('[TEST] рџ’° Setting exact balance:', { userId: uid, ton, stars });

    const currentBalance = await db.getUserBalance(uid);
    let results = {};

    if (ton !== undefined) {
      const currentTon = parseFloat(currentBalance.ton_balance) || 0;
      const diff = parseFloat(ton) - currentTon;
      if (diff !== 0) {
        results.ton = await db.updateBalance(
          uid, 'ton', diff, 'test', `рџ§Є Set TON balance to ${ton}`, { test: true, setBalance: true }
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
          uid, 'stars', diff, 'test', `рџ§Є Set Stars balance to ${stars}`, { test: true, setBalance: true }
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


// рџ“Љ РџРћР›РЈР§РРўР¬ РРќР¤РћР РњРђР¦РР® Рћ РўР•РЎРўРћР’РћРњ Р Р•Р–РРњР•
app.get("/api/test/info", requireTestApiEnabled, async (req, res) => {
  res.json({
    ok: true,
    testMode: TEST_API_ENABLED,
    environment: NODE_ENV,
    endpoints: {
      giveBalance: 'POST /api/test/give-balance',
      resetBalance: 'POST /api/test/reset-balance',
      setBalance: 'POST /api/test/set-balance'
    },
    message: 'Test endpoints are explicitly enabled'
  });
});

// Telegram Mini App chrome telemetry (safe/content insets + viewport) for cross-device calibration.
app.post("/api/debug/telegram-chrome", requireTelegramUser, async (req, res) => {
  try {
    const user = req?.tg?.user || null;
    if (!user?.id) return res.status(403).json({ ok: false, error: "No user in initData" });

    const sample = sanitizeTelegramChromeSample(req.body || {});
    const record = {
      ...sample,
      userId: String(user.id),
      username: clipText(user.username || "", 64),
      lang: clipText(user.language_code || "", 24),
      tsServer: Date.now()
    };

    appendTelegramChromeMetricRecord(record);
    return res.json({ ok: true });
  } catch (error) {
    console.error("[TGChromeMetrics] POST error:", error?.message || error);
    return res.status(500).json({ ok: false, error: "telemetry write failed" });
  }
});

app.get("/api/debug/telegram-chrome/recent", requireAdminKey, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 120));
    const items = readTelegramChromeMetricRecords(limit);
    return res.json({
      ok: true,
      count: items.length,
      limit,
      path: TG_CHROME_METRICS_PATH,
      items
    });
  } catch (error) {
    console.error("[TGChromeMetrics] GET error:", error?.message || error);
    return res.status(500).json({ ok: false, error: "telemetry read failed" });
  }
});






// ====== CORS for gifts endpoints (dev) ======
app.use(['/api/gifts/prices','/api/gifts/catalog','/api/gifts/price','/api/gifts/portals-search','/api/rates/ton-stars'], (req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get("/api/rates/ton-stars", async (req, res) => {
  try {
    // Prevent caching in Telegram WebView / proxies
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const rate = await getTonUsdRate();
    const tonUsd = rate?.tonUsd;
    const chargedStarsPerTon = starsPerTon(tonUsd);
    const hasRate = Number.isFinite(chargedStarsPerTon) && chargedStarsPerTon > 0;

    return res.json({
      ok: hasRate,
      tonUsd: tonUsd || null,
      starsUsd: STARS_USD,
      starsPerTon: hasRate ? chargedStarsPerTon : null,
      updatedAt: rate?.updatedAt || 0,
      source: rate?.source || "",
      error: hasRate ? null : (rate?.error || "rate unavailable")
    });
  } catch (e) {
    console.error("[rates] endpoint error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

function resolveManagedGiftPricing(priceEntry, tonUsd) {
  if (!priceEntry) {
    return { priceTon: null, priceStars: null };
  }

  const rawPrice = Number(priceEntry.price);
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
    return { priceTon: null, priceStars: null };
  }

  const currency = String(priceEntry.currency || "").toUpperCase();
  if (currency === "STARS") {
    return {
      priceTon: Number.isFinite(Number(tonUsd)) && Number(tonUsd) > 0 ? starsToTon(rawPrice, tonUsd) : null,
      priceStars: Math.max(1, Math.round(rawPrice)),
    };
  }

  return {
    priceTon: rawPrice,
    priceStars: tonToStars(rawPrice, tonUsd),
  };
}

function buildManagedGiftResponse(name, priceEntry, tonUsd) {
  const resolved = resolveManagedGiftPricing(priceEntry, tonUsd);
  return {
    name,
    priceTon: resolved.priceTon,
    priceStars: resolved.priceStars,
    updatedAt: Number(priceEntry?.ts || 0),
    source: String(priceEntry?.source || ""),
    currency: String(priceEntry?.currency || "").toUpperCase() || null,
    key: priceEntry?.key || null,
    stale: !!priceEntry?.stale,
  };
}

function getLegacySeedEntries() {
  const entries = [];

  for (const [name, value] of giftsPrices.entries()) {
    const priceTon = Number(value?.priceTon ?? value?.price_ton ?? value?.price ?? null);
    const updatedAt = Number(value?.updatedAt || giftsLastUpdate || 0);
    if (!name || !Number.isFinite(priceTon) || priceTon <= 0) continue;

    entries.push({
      key: name,
      name,
      aliases: [name],
      price: priceTon,
      currency: "TON",
      source: String(value?.source || "legacy-cache"),
      ts: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    });
  }

  for (const [key, value] of giftsRelayerPrices.entries()) {
    const priceTon = Number(value?.priceTon ?? value?.price_ton ?? null);
    const priceStars = Number(value?.priceStars ?? value?.price_stars ?? null);
    const updatedAt = Number(value?.updatedAt || giftsRelayerLastPush || 0);
    const hasTon = Number.isFinite(priceTon) && priceTon > 0;
    const hasStars = Number.isFinite(priceStars) && priceStars > 0;
    if (!key || (!hasTon && !hasStars)) continue;

    entries.push({
      key,
      name: key,
      aliases: [key],
      price: hasTon ? priceTon : priceStars,
      currency: hasTon ? "TON" : "STARS",
      source: String(value?.source || "legacy-relayer"),
      ts: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    });
  }

  return entries;
}

function getLegacySeedUpdatedAt(entries = []) {
  let updatedAt = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const ts = Number(entry?.ts || 0);
    if (Number.isFinite(ts) && ts > updatedAt) updatedAt = ts;
  }
  return updatedAt;
}

async function syncLegacyGiftCacheToPriceManager({ overwrite = true, sourceName = "legacy-cache" } = {}) {
  const entries = getLegacySeedEntries();
  if (!entries.length) {
    return { added: 0, total: 0, updatedAt: 0 };
  }

  return await priceManager.seed(entries, {
    updatedAt: Math.max(
      Number(giftsLastUpdate || 0),
      Number(giftsRelayerLastPush || 0),
      getLegacySeedUpdatedAt(entries),
    ),
    sourceName,
    overwrite,
  });
}


// GET price for a single gift (by name)
app.get("/api/gifts/price", async (req, res) => {
  // dev-friendly CORS
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = normalizeGiftName(req.query?.name || req.query?.q || "");
  if (!q) return res.status(400).json({ ok: false, error: "name required" });

  // Resolve name from catalog case-insensitively
  const foundName = giftsCatalog.find(n => String(n).toLowerCase() === String(q).toLowerCase()) || q;
  const p = priceManager.getPrice(foundName);

  if (!p) {
    return res.status(404).json({ ok: false, error: "gift not found (or price not cached yet)", name: foundName });
  }

  const rate = await getTonUsdRate();
  const tonUsd = rate?.tonUsd;

  return res.json({
    ok: true,
    item: buildManagedGiftResponse(foundName, p, tonUsd),
    rate: {
      tonUsd: tonUsd || null,
      starsUsd: STARS_USD,
      starsPerTon: starsPerTon(tonUsd),
      updatedAt: rate?.updatedAt || 0,
      source: rate?.source || "",
      error: tonUsd ? null : (rate?.error || "rate unavailable")
    }
  });
});


// GET prices cache
app.get("/api/gifts/prices", async (req, res) => {
  // dev-friendly CORS (helps if you open UI on another port like 5500)
  res.setHeader("Access-Control-Allow-Origin", "*");

  const snapshot = priceManager.getSnapshot();
  const rate = await getTonUsdRate();
  const tonUsd = rate?.tonUsd;

  const list = [];
  for (const name of giftsCatalog) {
    const p = priceManager.getPrice(name);
    if (!p) continue;
    list.push(buildManagedGiftResponse(name, p, tonUsd));
  }

  return res.json({
    ok: true,
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale,
    catalogUpdatedAt: giftsCatalogLastUpdate,
    count: list.length,
    items: list,
    rate: {
      tonUsd: tonUsd || null,
      starsUsd: STARS_USD,
      starsPerTon: starsPerTon(tonUsd),
      updatedAt: rate?.updatedAt || 0,
      source: rate?.source || "",
      error: tonUsd ? null : (rate?.error || "rate unavailable")
    }
  });
});

app.get("/api/prices", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const snapshot = priceManager.getSnapshot();
  return res.json({
    ok: true,
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale,
    refreshing: snapshot.refreshing,
    count: Object.keys(snapshot.prices).length,
    providerStats: snapshot.providerStats,
    prices: snapshot.prices,
  });
});

app.get("/api/prices/:key", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key = String(req.params?.key || "").trim();
  const price = priceManager.getPrice(key);
  if (!price) {
    return res.status(404).json({ ok: false, error: "price not found", key });
  }
  return res.json({ ok: true, key: price.key, ...price });
});

app.post("/api/prices/refresh", requireAdminKey, async (req, res) => {
  try {
    const result = await priceManager.refresh({ force: true, reason: "admin" });
    return res.json({ ok: true, ...result });
  } catch (e) {
    const snapshot = priceManager.getSnapshot();
    return res.status(200).json({
      ok: false,
      error: e?.message || "refresh failed",
      updatedAt: snapshot.updatedAt,
      stale: snapshot.stale,
      count: Object.keys(snapshot.prices).length,
    });
  }
});

// GET catalog only
app.get("/api/gifts/catalog", (req, res) => {
  // dev-friendly CORS (helps if you open UI on another port like 5500)
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.json({
    ok: true,
    updatedAt: giftsCatalogLastUpdate,
    count: giftsCatalog.length,
    items: giftsCatalog
  });
});


app.post("/api/gifts/prices/push", requireRelayer, async (req, res) => {
  try {
    const now = Date.now();

    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : (Array.isArray(body) ? body : []);
    if (!items.length) return res.status(400).json({ ok: false, error: "items required" });

    let accepted = 0;

    for (const it of items) {
      const name = String(it?.name || "").trim();
      if (!name) continue;

      const key = giftKey(name);

      const priceTon = Number(it?.priceTon ?? it?.price_ton ?? null);
      const priceStars = Number(it?.priceStars ?? it?.price_stars ?? null);
      const updatedAt = Number(it?.updatedAt || it?.ts || now);
      const source = String(it?.source || "relayer").slice(0, 64);

      // At least one numeric value must exist
      const hasTon = Number.isFinite(priceTon) && priceTon > 0;
      const hasStars = Number.isFinite(priceStars) && priceStars > 0;
      if (!hasTon && !hasStars) continue;

      giftsRelayerPrices.set(key, {
        priceTon: hasTon ? priceTon : null,
        priceStars: hasStars ? priceStars : null,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : now,
        source
      });
      accepted++;
    }

    giftsRelayerLastPush = now;
    if (accepted > 0) persistGiftsPriceState();

    return res.json({ ok: true, accepted, relayerUpdatedAt: giftsRelayerLastPush });
  } catch (e) {
    console.error("[gifts] relayer push error:", e);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});




// ====== SPA fallback ======
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path === "/tonconnect-manifest.json") {
    return next();
  }
  const html = renderIndexHtmlWithRuntimeFlags();
  if (html) {
    return res.type("html").send(html);
  }
  res.sendFile(FRONTEND_INDEX_PATH);
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
await priceManager.init();
try {
  await syncLegacyGiftCacheToPriceManager({
    overwrite: false,
    sourceName: "legacy-cache",
  });
} catch (e) {
  console.warn("[prices] legacy seed failed:", e?.message || e);
}

httpServer.listen(PORT, HOST, () => {
  const environment = process.env.NODE_ENV || "development";
  console.log("");
  console.log("[Server] WildGift Server Running");
  console.log(`[Server] Host: ${HOST}`);
  console.log(`[Server] Port: ${PORT}`);
  console.log(`[Server] Environment: ${environment}`);
  console.log("[Server] Crash WebSocket: /ws/crash");

  if (!process.env.BOT_TOKEN) {
    console.warn("[Server] WARNING: BOT_TOKEN not set in .env");
  }

  console.log("[Server] Crash game running");
});


// ====== GIFT PRICES SCHEDULER ======
(function startGiftScheduler() {
  const schedulerDisabled = /^(1|true|yes)$/i.test(String(process.env.DISABLE_OPEN_GIFT_PRICE_SCHEDULER || ""));
  if (schedulerDisabled) {
    console.log("[gifts] open-source gift scheduler disabled by DISABLE_OPEN_GIFT_PRICE_SCHEDULER.");
    return;
  }

  let running = false;

  const runSync = async (reason) => {
    if (running) return;
    running = true;
    try {
      await refreshGiftsAll();
      await syncLegacyGiftCacheToPriceManager({
        overwrite: true,
        sourceName: `legacy-${reason}`,
      });
    } catch (e) {
      console.warn(`[gifts] ${reason} sync failed:`, e?.message || e);
    } finally {
      running = false;
    }
  };

  // СЃС‚Р°СЂС‚СѓРµРј РІСЃРєРѕСЂРµ РїРѕСЃР»Рµ Р·Р°РїСѓСЃРєР°, РЅРѕ РЅРµ СЃРёРЅС…СЂРѕРЅРЅРѕ СЃ РїРѕРґРЅСЏС‚РёРµРј СЃРµСЂРІРµСЂР°
  const firstDelay = 1000 + Math.floor(Math.random() * 4000);

  setTimeout(() => {
    runSync("startup").catch((e) => {
      console.warn("[gifts] startup sync failed:", e?.message || e);
    });

    setInterval(() => {
      runSync("scheduled").catch((e) => {
        console.warn("[gifts] scheduled sync failed:", e?.message || e);
      });
    }, GIFT_REFRESH_MS);
  }, firstDelay);
})();


app.get('/api/gifts/portals-search', async (req, res) => {
  const qRaw = String(req.query.q || '').trim();
  if (!qRaw) return res.status(400).json({ ok: false, error: 'q required' });

  const needle = qRaw.toLowerCase();
  const snapshot = priceManager.getSnapshot();
  const rate = await getTonUsdRate();
  const tonUsd = rate?.tonUsd;

  if (!snapshot.updatedAt || Object.keys(snapshot.prices || {}).length === 0) {
    priceManager.refresh({ force: false, reason: "portals-search" }).catch(() => {});
  }

  // Local search over tracked catalog + cached prices (so we don't depend on upstream WAF on every request)
  const matched = giftsCatalog
    .filter(name => String(name).toLowerCase().includes(needle))
    .slice(0, 10)
    .map(name => {
      const p = priceManager.getPrice(name);
      const resolved = resolveManagedGiftPricing(p, tonUsd);
      return {
        name,
        short_name: name,
        floor_price: resolved.priceTon,
        source: p?.source ?? null,
        updatedAt: Number(p?.ts || 0) || null
      };
    });

  return res.json({
    ok: true,
    q: qRaw,
    collections: matched,
    results: matched
  });
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

function getInitDataFromReq(req) {
  return String(
    req.body?.initData ||
    req.query?.initData ||
    req.headers["x-telegram-init-data"] ||
    ""
  );
}

function getTelegramInitDataMaxAgeSec() {
  return Math.max(
    60,
    Math.min(30 * 24 * 60 * 60, Number(process.env.TG_INITDATA_MAX_AGE_SEC || 86400) || 86400)
  );
}

async function requireTelegramUser(req, res, next) {
  try {
    const initData = getInitDataFromReq(req);
    if (!initData) return res.status(401).json({ ok: false, error: "initData required" });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ ok: false, error: "BOT_TOKEN not set" });

    const check = verifyInitData(initData, process.env.BOT_TOKEN, getTelegramInitDataMaxAgeSec());
    if (!check.ok) return res.status(403).json({ ok: false, error: "Bad initData" });

    let user = null;
    try { user = JSON.parse(check.params.user || "null"); } catch {}
    if (!user?.id) return res.status(403).json({ ok: false, error: "No user in initData" });

    try {
      await db.saveUser(user);
    } catch (saveErr) {
      console.error("[Auth] Failed to save Telegram user profile:", saveErr);
    }

    const dbUser = await db.getUserById(user.id).catch(() => null);
    if (Number(dbUser?.ban) === 1) {
      return res.status(403).json({
        ok: false,
        code: "ACCOUNT_BANNED",
        error: "Account is banned",
        support: "@wildgift_support"
      });
    }

    req.tg = { user, initData, params: check.params };
    req.dbUser = dbUser || null;
    return next();
  } catch (error) {
    console.error("[Auth] Failed to validate Telegram user:", error);
    return res.status(500).json({ ok: false, error: "Failed to validate user" });
  }
}

function safeTextEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getAdminPanelPassword() {
  return String(process.env.ADMIN_PANEL_PASSWORD || "").trim();
}

function pruneExpiredAdminPanelSessions(now = Date.now()) {
  for (const [token, session] of adminPanelSessions.entries()) {
    if (!session || Number(session.expiresAt || 0) <= now) {
      adminPanelSessions.delete(token);
    }
  }
}

function createAdminPanelSession(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  const now = Date.now();
  pruneExpiredAdminPanelSessions(now);
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = now + ADMIN_PANEL_SESSION_TTL_MS;
  adminPanelSessions.set(token, {
    userId: uid,
    createdAt: now,
    expiresAt
  });
  return { token, expiresAt };
}

function getAdminPanelSessionFromReq(req) {
  pruneExpiredAdminPanelSessions();
  const sessionToken = String(req.headers["x-admin-session"] || "").trim();
  if (!sessionToken) return null;
  const session = adminPanelSessions.get(sessionToken) || null;
  if (!session) return null;
  if (Number(session.expiresAt || 0) <= Date.now()) {
    adminPanelSessions.delete(sessionToken);
    return null;
  }
  return session;
}

function requireAdminKey(req, res, next) {
  const session = getAdminPanelSessionFromReq(req);
  if (session && isRelayerAdminUserId(session.userId)) {
    req.adminSession = session;
    return next();
  }

  const adminKey = String(process.env.ADMIN_KEY || "").trim();
  if (!adminKey) {
    return res.status(500).json({ ok: false, error: "ADMIN_KEY not set" });
  }

  const headerKey = String(req.headers["x-admin-key"] || "").trim();
  const authHeader = String(req.headers.authorization || "");
  const bearerKey = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!safeTextEqual(headerKey, adminKey) && !safeTextEqual(bearerKey, adminKey)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  return next();
}

function requireTestApiEnabled(req, res, next) {
  if (!TEST_API_ENABLED) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  return next();
}

// internal (relayer/server-to-server)
function requireRelayer(req, res, next) {
  if (!isRelayerSecretOk(req)) return res.status(403).json({ ok: false, error: "forbidden" });
  req.isRelayer = true;
  return next();
}

// allow either Telegram user OR relayer secret
function requireRelayerOrTelegramUser(req, res, next) {
  if (isRelayerSecretOk(req)) { req.isRelayer = true; return next(); }
  return requireTelegramUser(req, res, next);
}


function normalizeTelegramParseMode(value, fallback = "HTML") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (raw === "HTML" || raw === "Markdown" || raw === "MarkdownV2") return raw;
  return fallback;
}

function normalizeTelegramCustomEmojiId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^\d{5,64}$/.test(raw) ? raw : "";
}

function normalizeTelegramMediaRef(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 4096) return "";
  return raw;
}

function normalizeTelegramButtonText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.length > 64 ? raw.slice(0, 64) : raw;
}

function normalizeTelegramButtonUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw.length > 2048 ? raw.slice(0, 2048) : raw;
}

function normalizeTelegramButtonStyle(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "primary" || raw === "success" || raw === "danger") return raw;
  return "";
}

function buildTelegramReplyMarkup(options = {}) {
  const text = normalizeTelegramButtonText(options?.buttonText || "");
  const miniAppUrl = normalizeTelegramButtonUrl(options?.miniAppUrl || "");
  const buttonUrl = normalizeTelegramButtonUrl(options?.buttonUrl || "");
  const buttonStyle = normalizeTelegramButtonStyle(options?.buttonStyle || "");
  if (!text) return null;
  if (!miniAppUrl && !buttonUrl) return null;

  const button = miniAppUrl
    ? { text, web_app: { url: miniAppUrl } }
    : { text, url: buttonUrl };
  if (buttonStyle) button.style = buttonStyle;

  return { inline_keyboard: [[button]] };
}

function escapeTelegramHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildDepositNotifyText(amount, currency) {
  const currencyNorm = String(currency || "").toLowerCase() === "stars" ? "stars" : "ton";
  const currencyLabel = currencyNorm === "stars" ? "Stars" : "TON";
  const amountNum = Number(amount);
  const amountText = Number.isFinite(amountNum)
    ? (currencyNorm === "stars" ? String(Math.round(amountNum)) : String(amountNum))
    : String(amount ?? "");
  const safeAmount = escapeTelegramHtml(amountText);
  return `<b>Top-up successful</b>\n\nCredited: <b>${safeAmount} ${currencyLabel}</b>`;
}

function stripTelegramButtonStyles(replyMarkup) {
  if (!replyMarkup || typeof replyMarkup !== "object") return null;
  const rows = Array.isArray(replyMarkup.inline_keyboard) ? replyMarkup.inline_keyboard : [];
  const inlineKeyboard = rows.map((row) => {
    if (!Array.isArray(row)) return [];
    return row.map((button) => {
      if (!button || typeof button !== "object") return button;
      const clone = { ...button };
      delete clone.style;
      return clone;
    });
  });
  return { inline_keyboard: inlineKeyboard };
}

function getWelcomeMiniAppUrl() {
  const preferred = normalizeTelegramButtonUrl(
    process.env.TG_WELCOME_MINI_APP_URL ||
    process.env.TELEGRAM_WELCOME_MINI_APP_URL ||
    ""
  );
  if (preferred) return preferred;
  const startAppUrl = normalizeTelegramButtonUrl(
    process.env.TG_WELCOME_STARTAPP_URL ||
    process.env.TELEGRAM_WELCOME_STARTAPP_URL ||
    DEFAULT_WELCOME_STARTAPP_URL
  );
  if (startAppUrl) return startAppUrl;
  return normalizeTelegramButtonUrl(process.env.WEBAPP_URL || "");
}

function isTelegramStartAppLink(urlValue) {
  try {
    const parsed = new URL(String(urlValue || "").trim());
    const host = String(parsed.hostname || "").toLowerCase();
    if (host !== "t.me" && host !== "www.t.me" && host !== "telegram.me" && host !== "www.telegram.me") {
      return false;
    }
    return parsed.searchParams.has("startapp");
  } catch {
    return false;
  }
}

const resolvedTelegramPhotoRefCache = new Map();

function normalizeTelegramPhotoUrlCandidate(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  raw = raw
    .replace(/^thtp:/i, "https:")
    .replace(/^http:/i, "https:")
    .replace(/^https:(?!\/\/)/i, "https://")
    .replace(/sibb\/\.co/ig, "ibb.co")
    .replace(/sibb\.co/ig, "ibb.co");

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }

  try {
    const parsed = new URL(raw);
    parsed.protocol = "https:";
    if (String(parsed.hostname || "").toLowerCase() === "www.ibb.co") {
      parsed.hostname = "ibb.co";
    }
    parsed.pathname = `/${String(parsed.pathname || "").replace(/^\/+/, "")}`;
    return parsed.toString();
  } catch {
    return raw;
  }
}

function shouldResolveIbbShareUrl(urlValue) {
  try {
    const parsed = new URL(urlValue);
    const host = String(parsed.hostname || "").toLowerCase();
    if (host !== "ibb.co" && host !== "www.ibb.co") return false;
    const segments = String(parsed.pathname || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    return segments.length > 0;
  } catch {
    return false;
  }
}

function extractOgImageUrlFromHtml(html) {
  const source = String(html || "");
  if (!source) return "";

  const patterns = [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = String(match?.[1] || "").trim();
    if (!value) continue;
    return value.replace(/&amp;/gi, "&");
  }
  return "";
}

async function resolveTelegramPhotoRef(photoRef) {
  const normalizedMediaRef = normalizeTelegramMediaRef(photoRef);
  if (!normalizedMediaRef) return "";

  const normalizedUrlCandidate = normalizeTelegramPhotoUrlCandidate(normalizedMediaRef);
  if (!/^https?:\/\//i.test(normalizedUrlCandidate)) {
    return normalizedMediaRef;
  }

  if (!shouldResolveIbbShareUrl(normalizedUrlCandidate)) {
    return normalizeTelegramMediaRef(normalizedUrlCandidate) || normalizedMediaRef;
  }

  const cacheKey = normalizedUrlCandidate;
  const now = Date.now();
  const cached = resolvedTelegramPhotoRefCache.get(cacheKey);
  if (cached && Number.isFinite(cached.expiresAt) && cached.expiresAt > now && cached.value) {
    return cached.value;
  }

  try {
    const response = await fetch(normalizedUrlCandidate, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WildGiftBot/1.0; +https://wildgiftapp.onrender.com)"
      }
    });
    const html = await response.text().catch(() => "");
    const ogImageRaw = extractOgImageUrlFromHtml(html);
    const ogImageNorm = normalizeTelegramMediaRef(normalizeTelegramPhotoUrlCandidate(ogImageRaw));
    if (ogImageNorm && /^https?:\/\//i.test(ogImageNorm)) {
      resolvedTelegramPhotoRefCache.set(cacheKey, {
        value: ogImageNorm,
        expiresAt: now + 6 * 60 * 60 * 1000
      });
      return ogImageNorm;
    }
  } catch {}

  resolvedTelegramPhotoRefCache.set(cacheKey, {
    value: normalizeTelegramMediaRef(normalizedUrlCandidate) || normalizedMediaRef,
    expiresAt: now + 10 * 60 * 1000
  });
  return normalizeTelegramMediaRef(normalizedUrlCandidate) || normalizedMediaRef;
}

function getWelcomePhotoRef() {
  const direct = normalizeTelegramMediaRef(
    process.env.TG_WELCOME_PHOTO_URL ||
    process.env.TELEGRAM_WELCOME_PHOTO_URL ||
    DEFAULT_WELCOME_PHOTO_URL
  );
  if (direct) return direct;

  const base = normalizeTelegramButtonUrl(
    process.env.TG_WELCOME_BASE_URL ||
    process.env.PUBLIC_URL ||
    process.env.WEBAPP_URL ||
    ""
  ).replace(/\/+$/g, "");
  if (!base) return "";
  return normalizeTelegramMediaRef(`${base}${DEFAULT_WELCOME_PHOTO_PATH}`);
}

function getWelcomeButtonText() {
  return normalizeTelegramButtonText(process.env.TG_WELCOME_BUTTON_TEXT || DEFAULT_WELCOME_BUTTON_TEXT);
}

function getWelcomeButtonStyle() {
  return normalizeTelegramButtonStyle(process.env.TG_WELCOME_BUTTON_STYLE || DEFAULT_WELCOME_BUTTON_STYLE);
}

function buildWelcomeMessageText(options = {}) {
  const introEmojiId = normalizeTelegramCustomEmojiId(process.env.TG_WELCOME_EMOJI_ID || DEFAULT_WELCOME_EMOJI_ID);
  const ctaEmojiId = normalizeTelegramCustomEmojiId(process.env.TG_WELCOME_CTA_EMOJI_ID || DEFAULT_WELCOME_CTA_EMOJI_ID);
  const introCustom = options?.introCustom !== false;
  const ctaCustom = options?.ctaCustom !== false;
  const introEmoji = (introCustom && introEmojiId)
    ? `<tg-emoji emoji-id="${introEmojiId}">\u2728</tg-emoji>`
    : "\u2728";
  const ctaEmoji = (ctaCustom && ctaEmojiId)
    ? `<tg-emoji emoji-id="${ctaEmojiId}">\ud83c\udf81</tg-emoji>`
    : "\ud83c\udf81";

  return [
    `${introEmoji} <b>Welcome to Wild Gift!</b>`,
    "Discover how easy it is to win, collect, and claim unique NFT gifts right inside Telegram. Open cases, complete simple tasks, and grab fresh drops in just a few taps.",
    `${ctaEmoji} Jump in now and claim your NFT gifts.`
  ].join("\n\n");
}

function isTelegramReplyMarkupParseError(errorText) {
  const text = String(errorText || "");
  return /reply markup|can't parse|button style|BUTTON_STYLE|INLINE_KEYBOARD/i.test(text);
}

function isTelegramWelcomeTrigger(update = {}) {
  const message = (update && typeof update === "object" && update.message && typeof update.message === "object")
    ? update.message
    : null;
  if (!message) return null;

  const from = (message.from && typeof message.from === "object") ? message.from : null;
  if (!from || from.is_bot) return null;

  const chatType = String(message?.chat?.type || "").toLowerCase();
  if (chatType && chatType !== "private") return null;

  const text = String(message?.text || "").trim();
  const firstToken = (text.split(/\s+/)[0] || "").trim();
  if (/^\/start(?:@[a-z0-9_]+)?$/i.test(firstToken)) {
    return {
      reason: "start",
      user: from,
      message
    };
  }

  if (message?.write_access_allowed && typeof message.write_access_allowed === "object") {
    return {
      reason: "write_access_allowed",
      user: from,
      message,
      writeAccessAllowed: message.write_access_allowed
    };
  }

  return null;
}

async function sendTelegramWelcomeMessage(chatId) {
  const buttonText = getWelcomeButtonText();
  const welcomeEntryUrl = getWelcomeMiniAppUrl();
  const buttonStyle = getWelcomeButtonStyle();
  const captionBothCustom = buildWelcomeMessageText({ introCustom: true, ctaCustom: true });
  const captionIntroCustom = buildWelcomeMessageText({ introCustom: true, ctaCustom: false });
  const captionFallbackHtml = buildWelcomeMessageText({ introCustom: false, ctaCustom: false });
  const photo = await resolveTelegramPhotoRef(getWelcomePhotoRef());

  const useStartAppUrlButton = isTelegramStartAppLink(welcomeEntryUrl);
  const buildMarkup = (withStyle) => buildTelegramReplyMarkup({
    buttonText,
    miniAppUrl: useStartAppUrlButton ? "" : welcomeEntryUrl,
    buttonUrl: useStartAppUrlButton ? welcomeEntryUrl : "",
    buttonStyle: withStyle ? buttonStyle : ""
  });

  async function sendWith(contentText, replyMarkup, withPhoto) {
    if (withPhoto && photo) {
      return sendTelegramPhoto(chatId, contentText, {
        photo,
        parseMode: "HTML",
        replyMarkup
      });
    }
    return sendTelegramMessage(chatId, contentText, {
      parseMode: "HTML",
      replyMarkup,
      disableWebPagePreview: true
    });
  }

  const styledMarkup = buildMarkup(true);
  const plainMarkup = stripTelegramButtonStyles(styledMarkup) || buildMarkup(false);

  async function sendWelcomeVariant(contentText) {
    let result = await sendWith(contentText, styledMarkup, true);
    if (!result?.ok && isTelegramReplyMarkupParseError(result?.error)) {
      result = await sendWith(contentText, plainMarkup, true);
    }
    if (!result?.ok) {
      result = await sendWith(contentText, styledMarkup, false);
      if (!result?.ok && isTelegramReplyMarkupParseError(result?.error)) {
        result = await sendWith(contentText, plainMarkup, false);
      }
    }
    return result;
  }

  let result = await sendWelcomeVariant(captionBothCustom);

  if (!result?.ok && isCustomEmojiEntityError(result?.error)) {
    console.warn("[Telegram Welcome] full custom emoji set rejected, retrying with intro emoji only:", {
      chatId,
      error: String(result?.error || "")
    });
    result = await sendWelcomeVariant(captionIntroCustom);
  }

  if (!result?.ok && isCustomEmojiEntityError(result?.error)) {
    console.warn("[Telegram Welcome] intro custom emoji rejected, retrying with standard emoji:", {
      chatId,
      error: String(result?.error || "")
    });
    result = await sendWelcomeVariant(captionFallbackHtml);
  }

  return result;
}

function prependFallbackEmoji(text, fallbackEmoji) {
  const sourceText = String(text ?? "");
  const fallback = String(fallbackEmoji || "").trim();
  if (!fallback) return sourceText;
  return sourceText ? `${fallback} ${sourceText}` : fallback;
}

function buildTelegramMessagePayload(text, options = {}) {
  const sourceText = String(text ?? "");
  const parseMode = normalizeTelegramParseMode(options?.parseMode, "HTML");
  const customEmojiId = normalizeTelegramCustomEmojiId(options?.customEmojiId);
  const customEmojiFallbackRaw = String(options?.customEmojiFallback || "\u2728").trim();
  const customEmojiFallback = customEmojiFallbackRaw || "\u2728";

  if (!customEmojiId) {
    return { text: sourceText, entities: null, forceParseMode: null };
  }

  if (!Array.isArray(options?.entities) && parseMode === "HTML") {
    const fallbackSafe = escapeTelegramHtml(customEmojiFallback);
    return {
      text: `<tg-emoji emoji-id="${customEmojiId}">${fallbackSafe}</tg-emoji> ${sourceText}`,
      entities: null,
      forceParseMode: "HTML"
    };
  }

  const decoratedText = `${customEmojiFallback} ${sourceText}`;
  return {
    text: decoratedText,
    entities: [
      {
        offset: 0,
        length: customEmojiFallback.length,
        type: "custom_emoji",
        custom_emoji_id: customEmojiId
      }
    ],
    forceParseMode: null
  };
}

function classifyTelegramSendError(error) {
  const description = String(error?.description || error?.message || error || "").toLowerCase();
  if (!description) return "other";
  if (description.includes("too many requests")) return "rate_limited";
  if (description.includes("bot was blocked by the user")) return "blocked";
  if (description.includes("user is deactivated")) return "deactivated";
  if (description.includes("chat not found")) return "chat_not_found";
  if (description.includes("forbidden")) return "forbidden";
  return "other";
}

function isCustomEmojiEntityError(text) {
  const raw = String(text || "");
  return /ENTITY_TEXT_INVALID|custom_emoji|can't parse entities|DOCUMENT_INVALID|EMOJI_INVALID/i.test(raw);
}

function buildTelegramResultError(result) {
  const err = new Error(String(result?.error || "Telegram request failed"));
  err.description = String(result?.error || err.message);
  err.status = Number(result?.status || 0);
  err.retryAfter = Number(result?.payload?.parameters?.retry_after || 0);
  err.telegram = result?.payload || null;
  return err;
}

async function callTelegramBotApi(method, body, options = {}) {
  if (!process.env.BOT_TOKEN) {
    const err = new Error("BOT_TOKEN not set");
    err.description = "BOT_TOKEN not set";
    if (options?.throwOnError) throw err;
    return { ok: false, error: err.description };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const description = String(payload?.description || `HTTP ${response.status}`);
      const err = new Error(description);
      err.status = response.status;
      err.description = description;
      err.retryAfter = Number(payload?.parameters?.retry_after || 0);
      err.telegram = payload;
      if (options?.throwOnError) throw err;
      return { ok: false, error: description, status: response.status, payload };
    }

    return { ok: true, result: payload.result || null };
  } catch (err) {
    if (options?.throwOnError) throw err;
    return { ok: false, error: String(err?.message || err || "request failed") };
  }
}

async function sendTelegramPhoto(chatId, caption = "", options = {}) {
  const body = {
    chat_id: chatId,
    photo: String(options?.photo || "")
  };
  if (!body.photo) {
    const err = new Error("photo required");
    err.description = "photo required";
    if (options?.throwOnError) throw err;
    return { ok: false, error: err.description };
  }

  const captionText = String(caption ?? "");
  if (captionText) {
    const prepared = buildTelegramMessagePayload(captionText, options);
    body.caption = prepared.text;
    if (Array.isArray(options?.entities) && options.entities.length) {
      body.caption_entities = options.entities;
    } else if (Array.isArray(prepared.entities) && prepared.entities.length) {
      body.caption_entities = prepared.entities;
    } else {
      body.parse_mode = prepared.forceParseMode || normalizeTelegramParseMode(options?.parseMode, "HTML");
    }
  }

  if (options?.replyMarkup && typeof options.replyMarkup === "object") body.reply_markup = options.replyMarkup;
  if (options?.disableNotification === true) body.disable_notification = true;
  if (options?.allowPaidBroadcast === true) body.allow_paid_broadcast = true;

  const apiOptions = { ...options, throwOnError: false };
  let result = await callTelegramBotApi("sendPhoto", body, apiOptions);

  if (
    !result?.ok &&
    options?.customEmojiId &&
    (isCustomEmojiEntityError(result?.error) || Number(result?.status || 0) === 400)
  ) {
    console.warn("[Telegram] sendPhoto custom emoji rejected, retrying without emoji:", {
      chatId,
      customEmojiId: String(options?.customEmojiId || ""),
      error: String(result?.error || "")
    });
    const retryBody = { ...body };
    const retryText = prependFallbackEmoji(captionText, options?.customEmojiFallback || "\u2728");
    const retryPrepared = buildTelegramMessagePayload(retryText, { ...options, customEmojiId: "" });
    retryBody.caption = retryPrepared.text;
    delete retryBody.caption_entities;
    retryBody.parse_mode = retryPrepared.forceParseMode || normalizeTelegramParseMode(options?.parseMode, "HTML");
    result = await callTelegramBotApi("sendPhoto", retryBody, apiOptions);
  }

  if (!result?.ok) {
    console.error("[Telegram] sendPhoto failed:", {
      chatId,
      status: result?.status || 0,
      description: result?.error || "sendPhoto failed"
    });
    if (options?.throwOnError) throw buildTelegramResultError(result);
  }

  return result;
}

async function sendTelegramBroadcastContent(chatId, content = {}, options = {}) {
  const text = String(content?.text ?? "");
  const photo = String(content?.photo || "").trim();
  const replyMarkup = content?.replyMarkup && typeof content.replyMarkup === "object"
    ? content.replyMarkup
    : null;

  if (photo) {
    return sendTelegramPhoto(chatId, text, {
      ...options,
      photo,
      replyMarkup
    });
  }

  return sendTelegramMessage(chatId, text, {
    ...options,
    replyMarkup
  });
}

// Send Telegram message
async function sendTelegramMessage(chatId, text, options = {}) {
  const prepared = buildTelegramMessagePayload(text, options);
  const body = {
    chat_id: chatId,
    text: prepared.text
  };

  if (Array.isArray(options?.entities) && options.entities.length) {
    body.entities = options.entities;
  } else if (Array.isArray(prepared.entities) && prepared.entities.length) {
    body.entities = prepared.entities;
  } else {
    body.parse_mode = prepared.forceParseMode || normalizeTelegramParseMode(options?.parseMode, "HTML");
  }

  if (options?.replyMarkup && typeof options.replyMarkup === "object") body.reply_markup = options.replyMarkup;
  if (options?.disableNotification === true) body.disable_notification = true;
  if (options?.disableWebPagePreview === true) body.disable_web_page_preview = true;
  if (options?.allowPaidBroadcast === true) body.allow_paid_broadcast = true;

  const apiOptions = { ...options, throwOnError: false };
  let result = await callTelegramBotApi("sendMessage", body, apiOptions);

  if (
    !result?.ok &&
    options?.customEmojiId &&
    (isCustomEmojiEntityError(result?.error) || Number(result?.status || 0) === 400)
  ) {
    console.warn("[Telegram] sendMessage custom emoji rejected, retrying without emoji:", {
      chatId,
      customEmojiId: String(options?.customEmojiId || ""),
      error: String(result?.error || "")
    });
    const retryText = prependFallbackEmoji(text, options?.customEmojiFallback || "\u2728");
    const retryPrepared = buildTelegramMessagePayload(retryText, { ...options, customEmojiId: "" });
    const retryBody = {
      chat_id: chatId,
      text: retryPrepared.text
    };
    if (Array.isArray(options?.entities) && options.entities.length) {
      retryBody.entities = options.entities;
    } else if (Array.isArray(retryPrepared.entities) && retryPrepared.entities.length) {
      retryBody.entities = retryPrepared.entities;
    } else {
      retryBody.parse_mode = retryPrepared.forceParseMode || normalizeTelegramParseMode(options?.parseMode, "HTML");
    }
    if (options?.replyMarkup && typeof options.replyMarkup === "object") retryBody.reply_markup = options.replyMarkup;
    if (options?.disableNotification === true) retryBody.disable_notification = true;
    if (options?.disableWebPagePreview === true) retryBody.disable_web_page_preview = true;
    if (options?.allowPaidBroadcast === true) retryBody.allow_paid_broadcast = true;
    result = await callTelegramBotApi("sendMessage", retryBody, apiOptions);
  }

  if (!result?.ok) {
    console.error("[Telegram] sendMessage failed:", {
      chatId,
      status: result?.status || 0,
      description: result?.error || "sendMessage failed"
    });
    if (options?.throwOnError) throw buildTelegramResultError(result);
  }

  return result;
}
