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
      created_at BIGINT NOT NULL,
      last_seen BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS balances (
      telegram_id BIGINT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      ton_balance NUMERIC(20,8) DEFAULT 0,
      stars_balance BIGINT DEFAULT 0,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
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

    CREATE TABLE IF NOT EXISTS bets (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
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
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_claims_user ON inventory_claims(telegram_id);

    CREATE TABLE IF NOT EXISTS inventory_items (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
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
      max_uses BIGINT NOT NULL,
      used_count BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promo_redemptions (
      code_hash TEXT NOT NULL REFERENCES promo_codes(code_hash) ON DELETE CASCADE,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      redeemed_at BIGINT NOT NULL,
      PRIMARY KEY (code_hash, telegram_id)
    );

    CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(telegram_id);




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


export async function saveUser(userData) {
  const now = Math.floor(Date.now() / 1000);
  const id = BigInt(userData.id);

  await query(
    `
    INSERT INTO users (telegram_id, username, first_name, last_name, language_code, is_premium, created_at, last_seen)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (telegram_id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      language_code = EXCLUDED.language_code,
      is_premium = EXCLUDED.is_premium,
      last_seen = EXCLUDED.last_seen
    `,
    [
      id,
      userData.username || null,
      userData.first_name || null,
      userData.last_name || null,
      userData.language_code || null,
      !!userData.is_premium,
      now,
      now
    ]
  );

  await query(
    `
    INSERT INTO balances (telegram_id, ton_balance, stars_balance, updated_at)
    VALUES ($1, 0, 0, $2)
    ON CONFLICT (telegram_id) DO NOTHING
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
           u.is_premium, u.created_at, u.last_seen,
           COALESCE(b.ton_balance, 0) AS ton_balance,
           COALESCE(b.stars_balance, 0) AS stars_balance
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
    INSERT INTO balances (telegram_id, ton_balance, stars_balance, updated_at)
    VALUES ($1,0,0,$2)
    ON CONFLICT (telegram_id) DO NOTHING
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
      `INSERT INTO balances (telegram_id, ton_balance, stars_balance, updated_at)
       VALUES ($1,0,0,$2)
       ON CONFLICT (telegram_id) DO NOTHING`,
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

    if (cur === "ton") {
      await client.query(
        `UPDATE balances SET ton_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
        [after, now, id]
      );
    } else {
      await client.query(
        `UPDATE balances SET stars_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
        [Math.trunc(after), now, id]
      );
    }

    await client.query(
      `
      INSERT INTO transactions
        (telegram_id, type, currency, amount, balance_before, balance_after, description, tx_hash, invoice_id, created_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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

export async function createBet(telegramId, roundId, betData, totalAmount, currency) {
  const id = BigInt(telegramId);
  const cur = currency === "stars" ? "stars" : "ton";
  const now = Math.floor(Date.now() / 1000);

  // списываем баланс (как у тебя в sqlite: сначала updateBalance, потом INSERT bet)
  await updateBalance(id, cur, -Number(totalAmount || 0), "bet", `Bet on round ${roundId}`);

  const r = await query(
    `
    INSERT INTO bets (telegram_id, round_id, bet_data, total_amount, currency, result, win_amount, multiplier, created_at)
    VALUES ($1,$2,$3,$4,$5,'pending',0,0,$6)
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
    SELECT id, telegram_id, type, currency, amount, balance_before, balance_after,
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
        `INSERT INTO inventory_claims (claim_id, telegram_id, created_at)
         VALUES ($1,$2,$3)
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
        `INSERT INTO inventory_items (telegram_id, instance_id, item_json, created_at)
         VALUES ($1,$2,$3,$4)
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
      `INSERT INTO balances (telegram_id, ton_balance, stars_balance, updated_at)
       VALUES ($1,0,0,$2)
       ON CONFLICT (telegram_id) DO NOTHING`,
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
      } else {
        await client.query(
          `UPDATE balances SET stars_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
          [Math.trunc(after), now, id]
        );
      }

      // Record transaction
      await client.query(
        `INSERT INTO transactions
         (telegram_id, type, currency, amount, balance_before, balance_after, description, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
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


// ============================
// PROMOCODES (hashed + anti-dup)
// ============================

function promoHash(code) {
  const pepper = process.env.PROMO_PEPPER || "dev_pepper_change_me";
  const norm = String(code || "").trim().toLowerCase();
  return crypto.createHash("sha256").update(norm + ":" + pepper).digest("hex");
}

// Seed WildGiftPromo100 into DB (idempotent)
export async function ensurePromoSeed() {
  const now = Math.floor(Date.now() / 1000);
  const h = promoHash("WildGiftPromo100");
  const max = Number(process.env.PROMO_WILDGIFT100_MAX ?? 1000);

  await query(
    `INSERT INTO promo_codes (code_hash, reward_stars, max_uses, used_count, created_at)
     VALUES ($1,$2,$3,0,$4)
     ON CONFLICT (code_hash) DO NOTHING`,
    [h, 100, Number.isFinite(max) ? max : 1000, now]
  );
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
      `INSERT INTO balances (telegram_id, ton_balance, stars_balance, updated_at)
       VALUES ($1,0,0,$2)
       ON CONFLICT (telegram_id) DO NOTHING`,
      [id, now]
    );

    // Lock promo row
    const pr = await client.query(
      `SELECT reward_stars, max_uses, used_count FROM promo_codes WHERE code_hash = $1 FOR UPDATE`,
      [h]
    );
    if (!pr.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, errorCode: "PROMO_INVALID", error: "invalid promo" };
    }

    const reward = Number(pr.rows[0].reward_stars || 0);
    const maxUses = Number(pr.rows[0].max_uses || 0);   // 0 => unlimited
    const used = Number(pr.rows[0].used_count || 0);

    if (maxUses > 0 && used >= maxUses) {
      await client.query("ROLLBACK");
      return { ok: false, errorCode: "PROMO_LIMIT_REACHED", error: "limit reached" };
    }

    // Per-user anti-dup
    try {
      await client.query(
        `INSERT INTO promo_redemptions (code_hash, telegram_id, redeemed_at)
         VALUES ($1,$2,$3)`,
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
      `SELECT stars_balance FROM balances WHERE telegram_id = $1 FOR UPDATE`,
      [id]
    );
    const before = Number(br.rows[0]?.stars_balance || 0);
    const after = before + reward;

    await client.query(
      `UPDATE balances SET stars_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
      [Math.trunc(after), now, id]
    );

    await client.query(
      `INSERT INTO transactions
       (telegram_id, type, currency, amount, balance_before, balance_after, description, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, "promocode", "stars", reward, before, after, "Promocode redeem", now]
    );

    await client.query("COMMIT");
    return { ok: true, added: reward, newBalance: after };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
