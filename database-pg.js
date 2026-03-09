// database-pg.js - PostgreSQL Production Database
import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("[DB] ⚠️ DATABASE_URL is not set. Postgres will not work.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

function normalizeOptionalText(value, max = 256) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.length > max ? raw.slice(0, max) : raw;
}

function normalizeUsername(value) {
  const base = normalizeOptionalText(value, 64);
  if (!base) return null;
  const cleaned = base.replace(/^@+/, "");
  return cleaned || null;
}

function normalizeHash(value) {
  const raw = normalizeOptionalText(value, 128);
  if (!raw) return null;
  const clean = raw.replace(/^0x/i, "").trim();
  if (!/^[a-fA-F0-9]{32,128}$/.test(clean)) return null;
  return clean.toUpperCase();
}

function normalizeTxLt(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  return raw;
}

function normalizeTonAddressRaw(value) {
  const raw = normalizeOptionalText(value, 256);
  if (!raw) return null;
  return raw.toLowerCase();
}

async function syncUserBalanceSnapshot(client, telegramId, tonBalance, starsBalance) {
  const id = typeof telegramId === "bigint" ? telegramId : BigInt(telegramId);
  await client.query(
    `UPDATE users
     SET ton_balance = $1,
         stars_balance = $2
     WHERE telegram_id = $3`,
    [Number(tonBalance || 0), Math.trunc(Number(starsBalance || 0)), id]
  );
}

export async function initDatabase() {
  console.log("[DB] 🚀 Initializing Postgres schema...");
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      language_code TEXT,
      is_premium BOOLEAN DEFAULT FALSE,
      ton_balance NUMERIC(20,8) NOT NULL DEFAULT 0,
      stars_balance BIGINT NOT NULL DEFAULT 0,
      ban SMALLINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      last_seen BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS balances (
      telegram_id BIGINT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      telegram_username TEXT,
      ton_balance NUMERIC(20,8) DEFAULT 0,
      stars_balance BIGINT DEFAULT 0,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      telegram_username TEXT,
      type TEXT NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('ton','stars')),
      amount NUMERIC(20,8) NOT NULL,
      balance_before NUMERIC(20,8) NOT NULL,
      balance_after NUMERIC(20,8) NOT NULL,
      description TEXT,
      tx_hash TEXT,
      invoice_id TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

    CREATE TABLE IF NOT EXISTS ton_deposit_claims (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      tx_hash TEXT NOT NULL,
      message_hash TEXT NOT NULL,
      in_msg_hash TEXT,
      tx_lt TEXT,
      from_address TEXT,
      to_address TEXT,
      amount_ton NUMERIC(20,8) NOT NULL,
      payload_json JSONB,
      created_at BIGINT NOT NULL,
      UNIQUE (tx_hash),
      UNIQUE (message_hash),
      UNIQUE (in_msg_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_ton_deposit_claims_user ON ton_deposit_claims(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_ton_deposit_claims_created ON ton_deposit_claims(created_at DESC);

    CREATE TABLE IF NOT EXISTS bets (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      telegram_username TEXT,
      round_id TEXT NOT NULL,
      bet_data JSONB NOT NULL,
      total_amount NUMERIC(20,8) NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('ton','stars')),
      result TEXT DEFAULT 'pending',
      win_amount NUMERIC(20,8) DEFAULT 0,
      multiplier NUMERIC(20,8) DEFAULT 0,
      created_at BIGINT NOT NULL,
      resolved_at BIGINT
    );

    CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_bets_result ON bets(result);
    CREATE INDEX IF NOT EXISTS idx_bets_created ON bets(created_at DESC);

    -- Inventory (gifts/NFTs)
    CREATE TABLE IF NOT EXISTS inventory_claims (
      claim_id TEXT PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      telegram_username TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_claims_user ON inventory_claims(telegram_id);

    CREATE TABLE IF NOT EXISTS inventory_items (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      telegram_username TEXT,
      instance_id TEXT UNIQUE,
      item_json JSONB NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_items_user ON inventory_items(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_created ON inventory_items(created_at DESC);


    CREATE TABLE IF NOT EXISTS market_items (
  id TEXT PRIMARY KEY,
  item_json JSONB NOT NULL,
  created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_market_items_created ON market_items(created_at DESC);

    -- Promocodes (secure, hashed)
    CREATE TABLE IF NOT EXISTS promo_codes (
      code_hash TEXT PRIMARY KEY,
      reward_stars BIGINT NOT NULL,
      reward_ton NUMERIC(20,8) NOT NULL DEFAULT 0,
      max_uses BIGINT NOT NULL,
      used_count BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promo_redemptions (
      code_hash TEXT NOT NULL REFERENCES promo_codes(code_hash) ON DELETE CASCADE,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      telegram_username TEXT,
      redeemed_at BIGINT NOT NULL,
      PRIMARY KEY (code_hash, telegram_id)
    );

    CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(telegram_id);

    CREATE TABLE IF NOT EXISTS user_task_claims (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      task_payload JSONB,
      claimed_at BIGINT NOT NULL,
      UNIQUE (telegram_id, task_key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_task_claims_user ON user_task_claims(telegram_id);
  `);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ton_balance NUMERIC(20,8) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stars_balance BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban SMALLINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE balances ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE inventory_claims ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS reward_ton NUMERIC(20,8) NOT NULL DEFAULT 0`);
  await query(`
    UPDATE users AS u
    SET ton_balance = COALESCE(b.ton_balance, 0),
        stars_balance = COALESCE(b.stars_balance, 0)
    FROM balances AS b
    WHERE b.telegram_id = u.telegram_id
  `);
  await query(`
    UPDATE balances AS b
    SET telegram_username = u.username
    FROM users AS u
    WHERE b.telegram_id = u.telegram_id
      AND (b.telegram_username IS NULL OR b.telegram_username = '')
  `);
  await query(`
    UPDATE transactions AS t
    SET telegram_username = u.username
    FROM users AS u
    WHERE t.telegram_id = u.telegram_id
      AND (t.telegram_username IS NULL OR t.telegram_username = '')
  `);
  await query(`
    UPDATE bets AS b
    SET telegram_username = u.username
    FROM users AS u
    WHERE b.telegram_id = u.telegram_id
      AND (b.telegram_username IS NULL OR b.telegram_username = '')
  `);
  await query(`
    UPDATE inventory_claims AS c
    SET telegram_username = u.username
    FROM users AS u
    WHERE c.telegram_id = u.telegram_id
      AND (c.telegram_username IS NULL OR c.telegram_username = '')
  `);
  await query(`
    UPDATE inventory_items AS i
    SET telegram_username = u.username
    FROM users AS u
    WHERE i.telegram_id = u.telegram_id
      AND (i.telegram_username IS NULL OR i.telegram_username = '')
  `);
  await query(`
    UPDATE promo_redemptions AS r
    SET telegram_username = u.username
    FROM users AS u
    WHERE r.telegram_id = u.telegram_id
      AND (r.telegram_username IS NULL OR r.telegram_username = '')
  `);
  console.log("[DB] ✅ Postgres schema ready");
}


export async function getMarketItems(limit = 200) {
  const r = await query(
    `SELECT item_json FROM market_items ORDER BY created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(5000, Number(limit) || 200))]
  );
  return r.rows.map(x => x.item_json);
}

export async function addMarketItem(item) {
  const id = String(item.id);
  const now = Date.now();
  await query(
    `INSERT INTO market_items (id, item_json, created_at)
     VALUES ($1,$2,$3)
     ON CONFLICT (id) DO UPDATE SET item_json = EXCLUDED.item_json, created_at = EXCLUDED.created_at`,
    [id, item, now]
  );
  return true;
}

export async function clearMarketItems() {
  await query(`TRUNCATE market_items`);
  return true;
}

export async function takeMarketItemById(id) {
  const k = String(id || "").trim();
  if (!k) return null;

  const r = await query(
    `DELETE FROM market_items WHERE id = $1 RETURNING item_json`,
    [k]
  );

  return r.rows?.[0]?.item_json || null;
}


export async function saveUser(userData) {
  const now = Math.floor(Date.now() / 1000);
  const id = BigInt(userData.id);
  const hasPremiumFlag = Object.prototype.hasOwnProperty.call(userData || {}, "is_premium");
  const premium = hasPremiumFlag ? !!userData.is_premium : null;
  const username = normalizeUsername(userData?.username);
  const firstName = normalizeOptionalText(userData?.first_name, 128);
  const lastName = normalizeOptionalText(userData?.last_name, 128);
  const languageCode = normalizeOptionalText(userData?.language_code, 16);

  await query(
    `
    INSERT INTO users (telegram_id, username, first_name, last_name, language_code, is_premium, created_at, last_seen)
    VALUES ($1,$2,$3,$4,$5,COALESCE($6,false),$7,$8)
    ON CONFLICT (telegram_id) DO UPDATE SET
      username = COALESCE($2, users.username),
      first_name = COALESCE($3, users.first_name),
      last_name = COALESCE($4, users.last_name),
      language_code = COALESCE($5, users.language_code),
      is_premium = COALESCE($6, users.is_premium),
      last_seen = $8
    `,
    [
      id,
      username,
      firstName,
      lastName,
      languageCode,
      premium,
      now,
      now
    ]
  );

  await query(
    `
    INSERT INTO balances (telegram_id, telegram_username, ton_balance, stars_balance, updated_at)
    VALUES ($1, (SELECT username FROM users WHERE telegram_id = $1), 0, 0, $2)
    ON CONFLICT (telegram_id) DO UPDATE SET
      telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), balances.telegram_username)
    `,
    [id, now]
  );

  return true;
}

export async function getUserById(telegramId) {
  const id = BigInt(telegramId);

  const r = await query(
    `
    SELECT u.telegram_id, u.username, u.first_name, u.last_name, u.language_code,
           u.is_premium, u.ban, u.created_at, u.last_seen,
           COALESCE(u.ton_balance, b.ton_balance, 0) AS ton_balance,
           COALESCE(u.stars_balance, b.stars_balance, 0) AS stars_balance
    FROM users u
    LEFT JOIN balances b ON b.telegram_id = u.telegram_id
    WHERE u.telegram_id = $1
    `,
    [id]
  );

  return r.rows[0] || null;
}

export async function getUserBalance(telegramId) {
  const id = BigInt(telegramId);
  const now = Math.floor(Date.now() / 1000);

  // 1) гарантируем, что user существует (иначе FK на balances упадёт)
  await query(
    `
    INSERT INTO users (telegram_id, created_at, last_seen)
    VALUES ($1,$2,$2)
    ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen
    `,
    [id, now]
  );

  // 2) гарантируем, что balance существует
  await query(
    `
    INSERT INTO balances (telegram_id, telegram_username, ton_balance, stars_balance, updated_at)
    VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),0,0,$2)
    ON CONFLICT (telegram_id) DO UPDATE SET
      telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), balances.telegram_username)
    `,
    [id, now]
  );

  // 3) читаем и возвращаем
  const r = await query(
    `SELECT ton_balance, stars_balance, updated_at FROM balances WHERE telegram_id = $1`,
    [id]
  );

  return r.rows[0] || { ton_balance: "0", stars_balance: 0, updated_at: now };
}


// ВАЖНО: атомарное изменение баланса + запись транзакции
export async function updateBalance(telegramId, currency, amount, type, description = null, metadata = {}) {
  const id = BigInt(telegramId);
  const cur = currency === "stars" ? "stars" : "ton";
  const now = Math.floor(Date.now() / 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // гарантируем наличие пользователя/баланса
    await client.query(
      `INSERT INTO users (telegram_id, created_at, last_seen) VALUES ($1,$2,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [id, now]
    );
    await client.query(
      `INSERT INTO balances (telegram_id, telegram_username, ton_balance, stars_balance, updated_at)
       VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),0,0,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET
         telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), balances.telegram_username)`,
      [id, now]
    );

    // блокируем строку баланса
    const balRes = await client.query(
      `SELECT ton_balance, stars_balance FROM balances WHERE telegram_id = $1 FOR UPDATE`,
      [id]
    );

    const ton = Number(balRes.rows[0].ton_balance || 0);
    const stars = Number(balRes.rows[0].stars_balance || 0);

    const delta = Number(amount || 0);
    if (!Number.isFinite(delta) || delta === 0) throw new Error("Invalid amount");

    const before = cur === "ton" ? ton : stars;
    const after = before + delta;

    if (after < 0) throw new Error("Insufficient balance");

    let nextTon = ton;
    let nextStars = Math.trunc(stars);

    if (cur === "ton") {
      nextTon = after;
      await client.query(
        `UPDATE balances SET ton_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
        [after, now, id]
      );
    } else {
      nextStars = Math.trunc(after);
      await client.query(
        `UPDATE balances SET stars_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
        [nextStars, now, id]
      );
    }

    await syncUserBalanceSnapshot(client, id, nextTon, nextStars);

    await client.query(
      `
      INSERT INTO transactions
        (telegram_id, telegram_username, type, currency, amount, balance_before, balance_after, description, tx_hash, invoice_id, created_at)
      VALUES
        ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        id,
        type,
        cur,
        delta,
        before,
        after,
        description,
        metadata.txHash || null,
        metadata.invoiceId || null,
        now
      ]
    );

    await client.query("COMMIT");
    return after;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Atomic TON deposit credit with DB-level idempotency keyed by tx/message hashes.
export async function applyVerifiedTonDeposit({
  telegramId,
  amountTon,
  txHash,
  messageHash,
  inMsgHash = null,
  txLt = null,
  fromAddress = null,
  toAddress = null,
  payload = null
}) {
  const id = BigInt(telegramId);
  const now = Math.floor(Date.now() / 1000);
  const delta = Number(amountTon || 0);
  if (!Number.isFinite(delta) || delta <= 0) {
    throw new Error("Invalid TON deposit amount");
  }

  const txHashNorm = normalizeHash(txHash);
  const msgHashNorm = normalizeHash(messageHash);
  const inMsgHashNorm = normalizeHash(inMsgHash);
  const txLtNorm = normalizeTxLt(txLt);
  const fromAddrNorm = normalizeTonAddressRaw(fromAddress);
  const toAddrNorm = normalizeTonAddressRaw(toAddress);

  if (!txHashNorm) throw new Error("txHash required");
  if (!msgHashNorm) throw new Error("messageHash required");

  const payloadJson = payload && typeof payload === "object"
    ? JSON.stringify(payload)
    : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure user + balance rows exist.
    await client.query(
      `INSERT INTO users (telegram_id, created_at, last_seen)
       VALUES ($1,$2,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [id, now]
    );
    await client.query(
      `INSERT INTO balances (telegram_id, telegram_username, ton_balance, stars_balance, updated_at)
       VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),0,0,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET
         telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), balances.telegram_username)`,
      [id, now]
    );

    // Claim tx hash/message hash first. If conflict -> already processed.
    const claimRes = await client.query(
      `INSERT INTO ton_deposit_claims
        (telegram_id, tx_hash, message_hash, in_msg_hash, tx_lt, from_address, to_address, amount_ton, payload_json, created_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        id,
        txHashNorm,
        msgHashNorm,
        inMsgHashNorm,
        txLtNorm,
        fromAddrNorm,
        toAddrNorm,
        delta,
        payloadJson,
        now
      ]
    );

    if (!claimRes.rowCount) {
      const existingRes = await client.query(
        `SELECT telegram_id
         FROM ton_deposit_claims
         WHERE tx_hash = $1
            OR message_hash = $2
            OR ($3 IS NOT NULL AND in_msg_hash = $3)
         ORDER BY id DESC
         LIMIT 1`,
        [txHashNorm, msgHashNorm, inMsgHashNorm]
      );

      const ownerId = existingRes.rows[0]?.telegram_id ?? null;
      if (ownerId === null) {
        throw new Error("Deposit claim conflict");
      }
      if (String(ownerId) !== String(id)) {
        throw new Error("Deposit already claimed by another user");
      }

      const balRes = await client.query(
        `SELECT ton_balance FROM balances WHERE telegram_id = $1`,
        [id]
      );
      const currentBalance = Number(balRes.rows[0]?.ton_balance || 0);
      await client.query("COMMIT");
      return { ok: true, duplicate: true, newBalance: currentBalance };
    }

    // Credit TON balance.
    const balRes = await client.query(
      `SELECT ton_balance, stars_balance FROM balances WHERE telegram_id = $1 FOR UPDATE`,
      [id]
    );

    const beforeTon = Number(balRes.rows[0]?.ton_balance || 0);
    const beforeStars = Number(balRes.rows[0]?.stars_balance || 0);
    const afterTon = beforeTon + delta;

    await client.query(
      `UPDATE balances SET ton_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
      [afterTon, now, id]
    );
    await syncUserBalanceSnapshot(client, id, afterTon, beforeStars);

    await client.query(
      `INSERT INTO transactions
        (telegram_id, telegram_username, type, currency, amount, balance_before, balance_after, description, tx_hash, invoice_id, created_at)
       VALUES
        ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        "deposit",
        "ton",
        delta,
        beforeTon,
        afterTon,
        `TON deposit ${txHashNorm.slice(0, 10)}...`,
        txHashNorm,
        msgHashNorm,
        now
      ]
    );

    await client.query("COMMIT");
    return { ok: true, duplicate: false, newBalance: afterTon };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function createBet(telegramId, roundId, betData, totalAmount, currency) {
  const id = BigInt(telegramId);
  const cur = currency === "stars" ? "stars" : "ton";
  const now = Math.floor(Date.now() / 1000);

  // списываем баланс (как у тебя в sqlite: сначала updateBalance, потом INSERT bet)
  await updateBalance(id, cur, -Number(totalAmount || 0), "bet", `Bet on round ${roundId}`);

  const r = await query(
    `
    INSERT INTO bets (telegram_id, telegram_username, round_id, bet_data, total_amount, currency, result, win_amount, multiplier, created_at)
    VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4,$5,'pending',0,0,$6)
    RETURNING id
    `,
    [id, String(roundId), betData, Number(totalAmount || 0), cur, now]
  );

  return r.rows[0]?.id;
}

export async function resolveBet(betId, result, winAmount = 0, multiplier = 0) {
  const now = Math.floor(Date.now() / 1000);

  const r = await query(`SELECT * FROM bets WHERE id = $1`, [betId]);
  const bet = r.rows[0];
  if (!bet) throw new Error("Bet not found");
  if (bet.result !== "pending") throw new Error("Bet already resolved");

  await query(
    `
    UPDATE bets
    SET result = $1,
        win_amount = $2,
        multiplier = $3,
        resolved_at = $4
    WHERE id = $5
    `,
    [String(result), Number(winAmount || 0), Number(multiplier || 0), now, betId]
  );

  // если выигрыш > 0 — начислим
  if (Number(winAmount || 0) > 0) {
    await updateBalance(
      bet.telegram_id,
      bet.currency,
      Number(winAmount || 0),
      "wheel_win",
      `Win on round ${bet.round_id}`,
      { roundId: bet.round_id }
    );
  }

  return true;
}

export async function getTransactionHistory(telegramId, limit = 50) {
  const id = BigInt(telegramId);
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));

  const r = await query(
    `
    SELECT id, telegram_id, telegram_username, type, currency, amount, balance_before, balance_after,
           description, tx_hash, invoice_id, created_at
    FROM transactions
    WHERE telegram_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT $2
    `,
    [id, lim]
  );

  return r.rows;
}

export async function getUserStats(telegramId) {
  const id = BigInt(telegramId);

  // очень простая статистика (как минимум)
  const r = await query(
    `
    SELECT
      COUNT(*) FILTER (WHERE type IN ('bet','wheel_bet')) AS total_bets,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE type IN ('bet','wheel_bet')), 0) AS total_wagered,
      COALESCE(SUM(amount) FILTER (WHERE type IN ('wheel_win')), 0) AS total_won,
      COUNT(*) FILTER (WHERE type IN ('wheel_win')) AS wins
    FROM transactions
    WHERE telegram_id = $1
    `,
    [id]
  );

  const row = r.rows[0] || {};
  const totalBets = Number(row.total_bets || 0);
  const wins = Number(row.wins || 0);

  return {
    wins,
    losses: Math.max(0, totalBets - wins),
    total_won: Number(row.total_won || 0),
    total_wagered: Number(row.total_wagered || 0),
    total_bets: totalBets
  };
}


// =====================
// INVENTORY (Postgres)
// =====================

export async function getUserInventory(telegramId) {
  const id = BigInt(telegramId);
  const r = await query(
    `SELECT item_json FROM inventory_items WHERE telegram_id = $1 ORDER BY id DESC`,
    [id]
  );
  return r.rows.map(row => row.item_json);
}

export async function addInventoryItems(telegramId, items, claimId = null) {
  const id = BigInt(telegramId);
  const nowSec = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();

  const list = Array.isArray(items) ? items : [];
  if (!list.length) return await getUserInventory(id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure user exists
    await client.query(
      `INSERT INTO users (telegram_id, created_at, last_seen) VALUES ($1,$2,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [id, nowSec]
    );

    // Claim idempotency (prevents double add on retries)
    if (claimId) {
      const cr = await client.query(
        `INSERT INTO inventory_claims (claim_id, telegram_id, telegram_username, created_at)
         VALUES ($1,$2,(SELECT username FROM users WHERE telegram_id = $2),$3)
         ON CONFLICT DO NOTHING
         RETURNING claim_id`,
        [String(claimId), id, nowSec]
      );

      if (cr.rowCount === 0) {
        // already processed
        const inv = await client.query(
          `SELECT item_json FROM inventory_items WHERE telegram_id = $1 ORDER BY id DESC`,
          [id]
        );
        await client.query("COMMIT");
        return inv.rows.map(row => row.item_json);
      }
    }

    // Insert items
    for (const it of list) {
      const instanceId = String(it?.instanceId || `${nowMs}_${crypto.randomBytes(6).toString("hex")}`);
      const enriched = { ...it, type: it?.type || "nft", instanceId, acquiredAt: it?.acquiredAt || nowMs };

      await client.query(
        `INSERT INTO inventory_items (telegram_id, telegram_username, instance_id, item_json, created_at)
         VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4)
         ON CONFLICT (instance_id) DO NOTHING`,
        [id, instanceId, enriched, nowSec]
      );
    }

    const inv = await client.query(
      `SELECT item_json FROM inventory_items WHERE telegram_id = $1 ORDER BY id DESC`,
      [id]
    );

    await client.query("COMMIT");
    return inv.rows.map(row => row.item_json);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function sellInventoryItems(telegramId, instanceIds, currency = "ton") {
  const id = BigInt(telegramId);
  const cur = currency === "stars" ? "stars" : "ton";
  const ids = Array.isArray(instanceIds) ? instanceIds.map(String) : [];
  if (!ids.length) return { sold: 0, amount: 0, newBalance: null };

  const now = Math.floor(Date.now() / 1000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure user and balances exist (so FK + lock always works)
    await client.query(
      `INSERT INTO users (telegram_id, created_at, last_seen) VALUES ($1,$2,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [id, now]
    );
    await client.query(
      `INSERT INTO balances (telegram_id, telegram_username, ton_balance, stars_balance, updated_at)
       VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),0,0,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET
         telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), balances.telegram_username)`,
      [id, now]
    );

    // Delete items and return their JSON
    const del = await client.query(
      `DELETE FROM inventory_items
       WHERE telegram_id = $1 AND instance_id = ANY($2::text[])
       RETURNING item_json`,
      [id, ids]
    );

    const soldItems = del.rows.map(r => r.item_json);

    // Compute total sell value from item.price
    let total = 0;
    for (const it of soldItems) {
      const raw = it?.price?.[cur];
      const n = (typeof raw === "string") ? parseFloat(raw) : (typeof raw === "number" ? raw : 0);
      if (!Number.isFinite(n)) continue;
      total += n;
    }

    // Normalize totals
    const amount = cur === "stars"
      ? Math.max(0, Math.round(total))
      : Math.max(0, Math.round(total * 100) / 100);

    let newBalance = null;

    if (amount > 0) {
      // Lock balance row
      const balRes = await client.query(
        `SELECT ton_balance, stars_balance FROM balances WHERE telegram_id = $1 FOR UPDATE`,
        [id]
      );

      const ton = Number(balRes.rows[0].ton_balance || 0);
      const stars = Number(balRes.rows[0].stars_balance || 0);
      const before = (cur === "ton") ? ton : stars;
      const after = before + Number(amount);

      if (cur === "ton") {
        await client.query(
          `UPDATE balances SET ton_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
          [after, now, id]
        );
        await syncUserBalanceSnapshot(client, id, after, stars);
      } else {
        await client.query(
          `UPDATE balances SET stars_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
          [Math.trunc(after), now, id]
        );
        await syncUserBalanceSnapshot(client, id, ton, Math.trunc(after));
      }

      // Record transaction
      await client.query(
        `INSERT INTO transactions
         (telegram_id, telegram_username, type, currency, amount, balance_before, balance_after, description, created_at)
         VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          "inventory_sell",
          cur,
          Number(amount),
          Number(before),
          Number(after),
          "Sell gift/NFT",
          now
        ]
      );

      newBalance = after;
    }

    await client.query("COMMIT");
    return { sold: soldItems.length, amount, newBalance };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}



export async function deleteInventoryItems(telegramId, instanceIds) {
  const id = BigInt(telegramId);
  const ids = Array.isArray(instanceIds) ? instanceIds.map(String) : [];
  if (!ids.length) return { deleted: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const del = await client.query(
      `DELETE FROM inventory_items
       WHERE telegram_id = $1 AND instance_id = ANY($2::text[])`,
      [id, ids]
    );

    await client.query("COMMIT");
    return { deleted: del.rowCount || 0 };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteInventoryItemByLookup(telegramId, lookup = {}) {
  const id = BigInt(telegramId);
  const normalize = (v, max = 256) => {
    const s = String(v ?? "").trim();
    if (!s) return "";
    return s.length > max ? s.slice(0, max) : s;
  };

  const instanceId = normalize(lookup?.instanceId, 256);
  const marketId = normalize(lookup?.marketId, 256);
  const itemId = normalize(lookup?.itemId ?? lookup?.id, 256);
  const tgMessageId = normalize(lookup?.tgMessageId ?? lookup?.messageId ?? lookup?.msgId, 128);
  if (!instanceId && !marketId && !itemId && !tgMessageId) return { deleted: 0 };

  const client = await pool.connect();
  const deleteByExpr = async (expr, value) => {
    if (!value) return 0;
    const del = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM inventory_items
         WHERE telegram_id = $1 AND ${expr} = $2
         ORDER BY id DESC
         LIMIT 1
       )
       DELETE FROM inventory_items AS i
       USING candidate AS c
       WHERE i.id = c.id
       RETURNING i.id`,
      [id, value]
    );
    return Number(del.rowCount || 0);
  };

  try {
    await client.query("BEGIN");

    let deleted = 0;
    if (instanceId) {
      const del = await client.query(
        `DELETE FROM inventory_items
         WHERE telegram_id = $1 AND instance_id = $2
         RETURNING id`,
        [id, instanceId]
      );
      deleted = Number(del.rowCount || 0);
    }

    if (!deleted) deleted = await deleteByExpr(`item_json->>'marketId'`, marketId);
    if (!deleted) deleted = await deleteByExpr(`item_json->>'id'`, itemId);
    if (!deleted) deleted = await deleteByExpr(`item_json->>'baseId'`, itemId);
    if (!deleted) deleted = await deleteByExpr(`item_json #>> '{tg,messageId}'`, tgMessageId);
    if (!deleted) deleted = await deleteByExpr(`item_json #>> '{tg,msgId}'`, tgMessageId);

    await client.query("COMMIT");
    return { deleted };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}


export async function hasTaskClaim(telegramId, taskKey) {
  const id = BigInt(telegramId);
  const key = normalizeOptionalText(taskKey, 64);
  if (!key) return false;

  const r = await query(
    `SELECT 1 FROM user_task_claims WHERE telegram_id = $1 AND task_key = $2 LIMIT 1`,
    [id, key]
  );
  return (r.rowCount || 0) > 0;
}

export async function awardTaskReward(
  telegramId,
  taskKey,
  currency = "stars",
  amount = 0,
  description = "Task reward",
  metadata = {}
) {
  const id = BigInt(telegramId);
  const key = normalizeOptionalText(taskKey, 64);
  if (!key) throw new Error("taskKey required");

  const cur = currency === "ton" ? "ton" : "stars";
  let delta = Number(amount || 0);
  if (!Number.isFinite(delta) || delta <= 0) throw new Error("Invalid amount");
  if (cur === "stars") delta = Math.max(1, Math.round(delta));
  if (cur === "ton") delta = Math.round(delta * 100000000) / 100000000;

  const now = Math.floor(Date.now() / 1000);
  const payload = (metadata && typeof metadata === "object" && !Array.isArray(metadata)) ? metadata : {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO users (telegram_id, created_at, last_seen) VALUES ($1,$2,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [id, now]
    );
    await client.query(
      `INSERT INTO balances (telegram_id, telegram_username, ton_balance, stars_balance, updated_at)
       VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),0,0,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET
         telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), balances.telegram_username)`,
      [id, now]
    );

    const claimRes = await client.query(
      `INSERT INTO user_task_claims (telegram_id, task_key, task_payload, claimed_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (telegram_id, task_key) DO NOTHING
       RETURNING id`,
      [id, key, payload, now]
    );

    const balRes = await client.query(
      `SELECT ton_balance, stars_balance FROM balances WHERE telegram_id = $1 FOR UPDATE`,
      [id]
    );
    const ton = Number(balRes.rows[0]?.ton_balance || 0);
    const stars = Number(balRes.rows[0]?.stars_balance || 0);

    if (claimRes.rowCount === 0) {
      await client.query("COMMIT");
      return {
        ok: true,
        alreadyClaimed: true,
        currency: cur,
        added: 0,
        newBalance: cur === "ton" ? ton : stars,
        tonBalance: ton,
        starsBalance: stars
      };
    }

    const before = cur === "ton" ? ton : stars;
    const after = before + delta;

    let nextTon = ton;
    let nextStars = Math.trunc(stars);
    if (cur === "ton") {
      nextTon = after;
      await client.query(
        `UPDATE balances SET ton_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
        [after, now, id]
      );
    } else {
      nextStars = Math.trunc(after);
      await client.query(
        `UPDATE balances SET stars_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
        [nextStars, now, id]
      );
    }

    await syncUserBalanceSnapshot(client, id, nextTon, nextStars);

    await client.query(
      `INSERT INTO transactions
       (telegram_id, telegram_username, type, currency, amount, balance_before, balance_after, description, created_at)
       VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4,$5,$6,$7,$8)`,
      [id, "task_reward", cur, delta, before, after, description, now]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      alreadyClaimed: false,
      currency: cur,
      added: delta,
      newBalance: cur === "ton" ? nextTon : nextStars,
      tonBalance: nextTon,
      starsBalance: nextStars
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}


// ============================
// PROMOCODES (hashed + anti-dup)
// ============================

function promoHash(code) {
  const pepper = process.env.PROMO_PEPPER || "dev_pepper_change_me";
  const norm = String(code || "").trim().toLowerCase();
  return crypto.createHash("sha256").update(norm + ":" + pepper).digest("hex");
}

export async function ensurePromoSeed() {
  const now = Math.floor(Date.now() / 1000); // ← ВАЖНО

  // ---- Promo 100 Stars ----
  {
    const h = promoHash("WildGiftPromo100");
    const max = Number(process.env.PROMO_WILDGIFT100_MAX ?? 1000);

    await query(
      `INSERT INTO promo_codes (code_hash, reward_stars, reward_ton, max_uses, used_count, created_at)
       VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (code_hash) DO NOTHING`,
      [h, 100, 0, Number.isFinite(max) ? max : 1000, now]
    );
  }

  // ---- Promo 50 Stars ----
  {
    const h = promoHash("WildGiftPromo50");
    const max = Number(process.env.PROMO_WILDGIFT50_MAX ?? 500);

    await query(
      `INSERT INTO promo_codes (code_hash, reward_stars, reward_ton, max_uses, used_count, created_at)
       VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (code_hash) DO NOTHING`,
      [h, 50, 0, Number.isFinite(max) ? max : 500, now]
    );
  }

  // ---- One-time 333 TON + 33333 Stars ----
  {
    const h = promoHash("sieufhisbfhisbfhbs333");
    await query(
      `INSERT INTO promo_codes (code_hash, reward_stars, reward_ton, max_uses, used_count, created_at)
       VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (code_hash) DO NOTHING`,
      [h, 33333, 333, 1, now]
    );
  }
}



// Redeem promocode atomically (limit + per-user anti-dup)
export async function redeemPromocode(telegramId, code) {
  const id = BigInt(telegramId);
  const now = Math.floor(Date.now() / 1000);
  const h = promoHash(code);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure user + balance exist
    await client.query(
      `INSERT INTO users (telegram_id, created_at, last_seen)
       VALUES ($1,$2,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [id, now]
    );
    await client.query(
      `INSERT INTO balances (telegram_id, telegram_username, ton_balance, stars_balance, updated_at)
       VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),0,0,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET
         telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), balances.telegram_username)`,
      [id, now]
    );

    // Lock promo row
    const pr = await client.query(
      `SELECT reward_stars, reward_ton, max_uses, used_count FROM promo_codes WHERE code_hash = $1 FOR UPDATE`,
      [h]
    );
    if (!pr.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, errorCode: "PROMO_INVALID", error: "invalid promo" };
    }

    const reward = Number(pr.rows[0].reward_stars || 0);
    const rewardTon = Number(pr.rows[0].reward_ton || 0);
    const maxUses = Number(pr.rows[0].max_uses || 0);   // 0 => unlimited
    const used = Number(pr.rows[0].used_count || 0);

    if (maxUses > 0 && used >= maxUses) {
      await client.query("ROLLBACK");
      return { ok: false, errorCode: "PROMO_LIMIT_REACHED", error: "limit reached" };
    }

    // Per-user anti-dup
    try {
      await client.query(
        `INSERT INTO promo_redemptions (code_hash, telegram_id, telegram_username, redeemed_at)
         VALUES ($1,$2,(SELECT username FROM users WHERE telegram_id = $2),$3)`,
        [h, id, now]
      );
    } catch {
      await client.query("ROLLBACK");
      return { ok: false, errorCode: "PROMO_ALREADY_REDEEMED", error: "already redeemed" };
    }

    // Increment used_count
    await client.query(
      `UPDATE promo_codes SET used_count = used_count + 1 WHERE code_hash = $1`,
      [h]
    );

    // Update stars balance atomically
    const br = await client.query(
      `SELECT ton_balance, stars_balance FROM balances WHERE telegram_id = $1 FOR UPDATE`,
      [id]
    );
    const beforeTon = Number(br.rows[0]?.ton_balance || 0);
    const before = Number(br.rows[0]?.stars_balance || 0);
    const after = before + reward;
    const afterTon = beforeTon + rewardTon;

    await client.query(
      `UPDATE balances SET ton_balance = $1, stars_balance = $2, updated_at = $3 WHERE telegram_id = $4`,
      [afterTon, Math.trunc(after), now, id]
    );
    await syncUserBalanceSnapshot(client, id, afterTon, Math.trunc(after));

    if (reward > 0) {
      await client.query(
        `INSERT INTO transactions
         (telegram_id, telegram_username, type, currency, amount, balance_before, balance_after, description, created_at)
         VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4,$5,$6,$7,$8)`,
        [id, "promocode", "stars", reward, before, after, "Promocode redeem", now]
      );
    }

    if (rewardTon > 0) {
      await client.query(
        `INSERT INTO transactions
         (telegram_id, telegram_username, type, currency, amount, balance_before, balance_after, description, created_at)
         VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4,$5,$6,$7,$8)`,
        [id, "promocode", "ton", rewardTon, beforeTon, afterTon, "Promocode redeem", now]
      );
    }

    await client.query("COMMIT");
    return { ok: true, added: reward, addedTon: rewardTon, newBalance: after, newTonBalance: afterTon };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
