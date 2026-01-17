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

  // --- Core tables ---
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
  `);

  // --- Inventory tables (NFT gifts) ---
  // IMPORTANT:
  // On Render you may already have an older inventory_items schema from previous deploys.
  // CREATE TABLE IF NOT EXISTS does NOT alter existing tables, so we run a small migration
  // to add missing columns (acquired_at / item_json / created_at) safely.

  await query(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      instance_id TEXT NOT NULL,
      item_json JSONB,
      acquired_at BIGINT,
      created_at BIGINT,
      UNIQUE (telegram_id, instance_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS inventory_claims (
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      claim_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (telegram_id, claim_id)
    );
  `);

  // ---- Migration helpers ----
  async function colExists(table, col) {
    const r = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
      [table, col]
    );
    return r.rowCount > 0;
  }

  // Add missing columns (older deployments may have different names)
  if (!(await colExists('inventory_items', 'item_json'))) {
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_json JSONB;`);
  }
  if (!(await colExists('inventory_items', 'acquired_at'))) {
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS acquired_at BIGINT;`);
  }
  if (!(await colExists('inventory_items', 'created_at'))) {
    await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS created_at BIGINT;`);
  }

  // Backfill from legacy column name "item" -> "item_json" if needed
  const hasLegacyItem = await colExists('inventory_items', 'item');
  if (hasLegacyItem) {
    await query(`UPDATE inventory_items SET item_json = COALESCE(item_json, item) WHERE item_json IS NULL;`);
  }

  // Backfill timestamps so ORDER BY / inserts are consistent
  await query(`
    UPDATE inventory_items
    SET acquired_at = COALESCE(acquired_at, created_at, EXTRACT(EPOCH FROM NOW())::BIGINT)
    WHERE acquired_at IS NULL;
  `);

  await query(`
    UPDATE inventory_items
    SET created_at = COALESCE(created_at, acquired_at, EXTRACT(EPOCH FROM NOW())::BIGINT)
    WHERE created_at IS NULL;
  `);

  // Ensure indexes/constraints exist (safe even if table existed before)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_user_instance ON inventory_items(telegram_id, instance_id);`);

  // Only create acquired_at index if the column exists (it should after migration)
  if (await colExists('inventory_items', 'acquired_at')) {
    await query(`CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory_items(telegram_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_inventory_acquired ON inventory_items(acquired_at DESC);`);
  }

  console.log("[DB] ✅ Postgres schema ready");
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

  const r = await query(
    `SELECT ton_balance, stars_balance, updated_at FROM balances WHERE telegram_id = $1`,
    [id]
  );

  if (r.rows[0]) return r.rows[0];

  // если баланса нет — создадим
  await query(
    `INSERT INTO balances (telegram_id, ton_balance, stars_balance, updated_at) VALUES ($1,0,0,$2)
     ON CONFLICT (telegram_id) DO NOTHING`,
    [id, now]
  );

  return { ton_balance: "0", stars_balance: 0, updated_at: now };
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

// ===== Inventory (Postgres) =====
// We store each won gift as a separate row (instance_id) so duplicates are allowed.

async function ensureUserRow(telegramId) {
  const id = BigInt(telegramId);
  const now = Math.floor(Date.now() / 1000);
  await query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, is_premium, created_at, last_seen)
     VALUES ($1, '', '', '', '', FALSE, $2, $2)
     ON CONFLICT (telegram_id) DO NOTHING`,
    [id, now]
  );
}

export async function getUserInventory(telegramId) {
  const id = BigInt(telegramId);
  // If user doesn't exist yet, just return empty inventory
  const r = await query(
    `SELECT item_json
     FROM inventory_items
     WHERE telegram_id = $1
     ORDER BY acquired_at DESC, id DESC`,
    [id]
  );
  return r.rows.map((x) => x.item_json);
}

export async function addInventoryItems(telegramId, items = [], claimId = null) {
  const id = BigInt(telegramId);

  if (!Array.isArray(items) || items.length === 0) {
    return { added: 0, duplicated: false, items: await getUserInventory(id) };
  }

  await ensureUserRow(id);

  const now = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (claimId) {
      const claim = String(claimId);
      const cr = await client.query(
        `INSERT INTO inventory_claims (telegram_id, claim_id, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id, claim_id) DO NOTHING
         RETURNING claim_id`,
        [id, claim, now]
      );
      if (cr.rowCount === 0) {
        await client.query('COMMIT');
        return { added: 0, duplicated: true, items: await getUserInventory(id) };
      }
    }

    let added = 0;

    for (const raw of items) {
      const instanceId = String(
        raw?.instanceId || `inv_${now}_${crypto.randomBytes(6).toString('hex')}`
      );
      const acquiredAt = Number(raw?.acquiredAt || now);
      const obj = {
        ...(raw || {}),
        type: raw?.type || 'nft',
        instanceId,
        acquiredAt
      };

      const ir = await client.query(
        `INSERT INTO inventory_items (telegram_id, instance_id, item_json, acquired_at, created_at)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT (telegram_id, instance_id) DO NOTHING`,
        [id, instanceId, JSON.stringify(obj), acquiredAt, now]
      );

      if (ir.rowCount === 1) added += 1;
    }

    await client.query('COMMIT');
    return { added, duplicated: false, items: await getUserInventory(id) };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function removeInventoryItems(telegramId, instanceIds = []) {
  const id = BigInt(telegramId);
  const ids = (Array.isArray(instanceIds) ? instanceIds : [])
    .map((x) => String(x))
    .filter(Boolean);

  if (!ids.length) return [];

  const r = await query(
    `DELETE FROM inventory_items
     WHERE telegram_id = $1
       AND instance_id = ANY($2::text[])
     RETURNING item_json`,
    [id, ids]
  );

  return r.rows.map((x) => x.item_json);
}

export async function clearUserInventory(telegramId) {
  const id = BigInt(telegramId);
  const r = await query(
    `DELETE FROM inventory_items
     WHERE telegram_id = $1
     RETURNING item_json`,
    [id]
  );
  return r.rows.map((x) => x.item_json);
}
