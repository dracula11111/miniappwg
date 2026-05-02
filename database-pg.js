// database-pg.js - PostgreSQL Production Database
import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("[DB] ⚠️ DATABASE_URL is not set. Postgres will not work.");
}

function envInt(name, fallback, min, max) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: envInt("PG_POOL_MAX", 2, 1, 20),
  min: 0,
  idleTimeoutMillis: envInt("PG_IDLE_TIMEOUT_MS", 5000, 1000, 60000),
  connectionTimeoutMillis: envInt("PG_CONNECTION_TIMEOUT_MS", 30000, 1000, 60000),
  allowExitOnIdle: true
});

const PG_CIRCUIT_OPEN_MS = envInt("PG_CIRCUIT_OPEN_MS", 15000, 1000, 120000);
let pgCircuitOpenUntil = 0;
let pgCircuitLastError = "";

const RLS_PROTECTED_TABLES = [
  "users",
  "balances",
  "transactions",
  "ton_deposit_claims",
  "bets",
  "inventory_claims",
  "inventory_items",
  "market_items",
  "gift_readable",
  "promo_codes",
  "promo_redemptions",
  "user_task_claims",
  "referrals",
  "webhook_events",
  "tech_pause_control",
  "case_rounds_pending",
  "game_round_meta",
  "match_players"
];

async function query(text, params) {
  const now = Date.now();
  if (pgCircuitOpenUntil > now) {
    const err = new Error(pgCircuitLastError || "Postgres temporarily unavailable");
    err.code = "PG_CIRCUIT_OPEN";
    throw err;
  }

  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    pgCircuitLastError = e?.message || String(e || "Postgres connection failed");
    pgCircuitOpenUntil = Date.now() + PG_CIRCUIT_OPEN_MS;
    throw e;
  }

  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function hardenPublicSchemaAccess() {
  // The app works via backend DB connection; public API roles should not get direct access.
  await query(`REVOKE ALL ON SCHEMA public FROM anon, authenticated`);
  await query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated`);
  await query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated`);

  for (const table of RLS_PROTECTED_TABLES) {
    await query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await query(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated`);
    await query(`DROP POLICY IF EXISTS service_role_full_access ON public.${table}`);
    await query(
      `CREATE POLICY service_role_full_access
       ON public.${table}
       FOR ALL
       TO service_role
       USING (true)
       WITH CHECK (true)`
    );
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

const RUSSIAN_UI_LANGUAGE_CODES = new Set(["ru", "uk", "be", "kk"]);
const RUSSIAN_UI_REGION_CODES = new Set(["RU", "BY", "KZ", "UA"]);

function normalizeUiLanguageCode(localeValue) {
  const raw = normalizeOptionalText(localeValue, 32);
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
  const raw = normalizeOptionalText(value, 16);
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("en")) return "en";
  return null;
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

function normalizeCaseRoundId(value) {
  const raw = normalizeOptionalText(value, 190);
  if (!raw) return "";
  if (!/^[A-Za-z0-9:_-]{8,190}$/.test(raw)) return "";
  return raw;
}

function normalizeCaseCurrency(value) {
  return String(value || "").toLowerCase() === "stars" ? "stars" : "ton";
}

function normalizeCaseCostByCurrency(value, currency) {
  const cur = normalizeCaseCurrency(currency);
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (cur === "stars") return Math.max(1, Math.round(raw));
  return Math.max(0.01, Math.round(raw * 100) / 100);
}

function normalizeGameRoundMetaKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return key === "crash" || key === "wheel" ? key : "";
}

function normalizeGameRoundCounter(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.trunc(raw));
}

function normalizeMatchCounter(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.trunc(raw));
}

const MATCH_GIVEAWAY_IDS = Object.freeze(["lol-pop", "pool-float", "snoop-dogg", "jolly-chimp"]);
const DEFAULT_MATCH_GIVEAWAY_PARTICIPANTS = Object.freeze({
  "lol-pop": 128,
  "pool-float": 96,
  "snoop-dogg": 74,
  "jolly-chimp": 52
});

function normalizeMatchGiveawayId(value) {
  const id = String(value || "").trim().toLowerCase();
  return MATCH_GIVEAWAY_IDS.includes(id) ? id : "";
}

function mapMatchPlayerRow(row = {}) {
  return {
    telegramId: String(row.telegram_id || ""),
    telegramUsername: row.telegram_username || null,
    wildCoin: normalizeMatchCounter(row.wildcoin_balance),
    tickets: {
      "lol-pop": normalizeMatchCounter(row.giveaway_1_tickets),
      "pool-float": normalizeMatchCounter(row.giveaway_2_tickets),
      "snoop-dogg": normalizeMatchCounter(row.giveaway_3_tickets),
      "jolly-chimp": normalizeMatchCounter(row.giveaway_4_tickets)
    },
    createdAt: normalizeMatchCounter(row.created_at),
    updatedAt: normalizeMatchCounter(row.updated_at)
  };
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

function normalizeGiftReadableSource(value) {
  const source = String(value || "").trim().toLowerCase();
  return source === "market" || source === "inventory" ? source : "";
}

function normalizeGiftReadableTimestamp(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return Date.now();
  const t = Math.trunc(raw);
  // Old rows can be seconds, but the rest of project mostly uses milliseconds.
  return t < 1000000000000 ? t * 1000 : t;
}

function normalizeGiftReadableNumber(value) {
  if (value === null || value === undefined) return null;
  const raw = (typeof value === "number" && Number.isFinite(value)) ? String(value) : String(value).trim();
  if (!raw) return null;
  return raw.length > 64 ? raw.slice(0, 64) : raw;
}

function normalizeGiftReadableTelegramId(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return String(BigInt(value));
  } catch {
    return null;
  }
}

function giftReadableNameFromItem(item) {
  const name =
    normalizeOptionalText(item?.displayName, 160) ||
    normalizeOptionalText(item?.name, 160) ||
    normalizeOptionalText(item?.title, 160) ||
    normalizeOptionalText(item?.tg?.title, 160) ||
    normalizeOptionalText(item?.tg?.name, 160);
  return name || "Gift";
}

function giftReadableNumberFromItem(item) {
  const candidates = [item?.number, item?.num, item?.tg?.num, item?.tg?.number];
  for (const candidate of candidates) {
    const number = normalizeGiftReadableNumber(candidate);
    if (number) return number;
  }
  return null;
}

function inventoryReadableSourceIdFromRow(row = {}) {
  const instanceId = normalizeOptionalText(row?.instance_id, 190);
  if (instanceId) return instanceId;
  const rowId = Number(row?.id);
  if (Number.isFinite(rowId) && rowId > 0) return `row_${Math.trunc(rowId)}`;
  return "";
}

function buildGiftReadableEntry(input = {}) {
  const source = normalizeGiftReadableSource(input.source);
  const sourceId = normalizeOptionalText(input.sourceId, 190);
  if (!source || !sourceId) return null;

  const createdAt = normalizeGiftReadableTimestamp(input.createdAt);
  const updatedAt = Date.now();
  const telegramId = normalizeGiftReadableTelegramId(input.telegramId);
  const giftName = giftReadableNameFromItem(input.item);
  const giftNumber = giftReadableNumberFromItem(input.item);

  return {
    entryKey: `${source}:${sourceId}`,
    source,
    sourceId,
    telegramId,
    giftName,
    giftNumber,
    createdAt,
    updatedAt
  };
}

async function upsertGiftReadableEntry(client, input = {}) {
  const entry = buildGiftReadableEntry(input);
  if (!entry) return false;

  await client.query(
    `INSERT INTO gift_readable
      (entry_key, source, source_id, telegram_id, gift_name, gift_number, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (entry_key) DO UPDATE SET
       source = EXCLUDED.source,
       source_id = EXCLUDED.source_id,
       telegram_id = EXCLUDED.telegram_id,
       gift_name = EXCLUDED.gift_name,
       gift_number = EXCLUDED.gift_number,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [
      entry.entryKey,
      entry.source,
      entry.sourceId,
      entry.telegramId,
      entry.giftName,
      entry.giftNumber,
      entry.createdAt,
      entry.updatedAt
    ]
  );
  return true;
}

async function deleteGiftReadableEntry(client, source, sourceId) {
  const s = normalizeGiftReadableSource(source);
  const sid = normalizeOptionalText(sourceId, 190);
  if (!s || !sid) return 0;
  const r = await client.query(`DELETE FROM gift_readable WHERE entry_key = $1`, [`${s}:${sid}`]);
  return Number(r.rowCount || 0);
}

async function clearGiftReadableBySource(client, source) {
  const s = normalizeGiftReadableSource(source);
  if (!s) return 0;
  const r = await client.query(`DELETE FROM gift_readable WHERE source = $1`, [s]);
  return Number(r.rowCount || 0);
}

async function rebuildGiftReadableSnapshot() {
  const now = Date.now();

  await query(
    `
    INSERT INTO gift_readable
      (entry_key, source, source_id, telegram_id, gift_name, gift_number, created_at, updated_at)
    SELECT
      CONCAT('market:', m.id) AS entry_key,
      'market' AS source,
      m.id AS source_id,
      NULL::BIGINT AS telegram_id,
      COALESCE(
        NULLIF(BTRIM(m.item_json->>'displayName'), ''),
        NULLIF(BTRIM(m.item_json->>'name'), ''),
        NULLIF(BTRIM(m.item_json->>'title'), ''),
        'Gift'
      ) AS gift_name,
      NULLIF(BTRIM(COALESCE(
        m.item_json->>'number',
        m.item_json->>'num',
        m.item_json #>> '{tg,num}',
        m.item_json #>> '{tg,number}'
      )), '') AS gift_number,
      CASE
        WHEN m.created_at < 1000000000000 THEN m.created_at * 1000
        ELSE m.created_at
      END AS created_at,
      $1::BIGINT AS updated_at
    FROM market_items AS m
    ON CONFLICT (entry_key) DO UPDATE SET
      source = EXCLUDED.source,
      source_id = EXCLUDED.source_id,
      telegram_id = EXCLUDED.telegram_id,
      gift_name = EXCLUDED.gift_name,
      gift_number = EXCLUDED.gift_number,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at
    `,
    [now]
  );

  await query(
    `
    INSERT INTO gift_readable
      (entry_key, source, source_id, telegram_id, gift_name, gift_number, created_at, updated_at)
    SELECT
      CONCAT(
        'inventory:',
        COALESCE(NULLIF(BTRIM(i.instance_id), ''), CONCAT('row_', i.id::TEXT))
      ) AS entry_key,
      'inventory' AS source,
      COALESCE(NULLIF(BTRIM(i.instance_id), ''), CONCAT('row_', i.id::TEXT)) AS source_id,
      i.telegram_id,
      COALESCE(
        NULLIF(BTRIM(i.item_json->>'displayName'), ''),
        NULLIF(BTRIM(i.item_json->>'name'), ''),
        NULLIF(BTRIM(i.item_json->>'title'), ''),
        'Gift'
      ) AS gift_name,
      NULLIF(BTRIM(COALESCE(
        i.item_json->>'number',
        i.item_json->>'num',
        i.item_json #>> '{tg,num}',
        i.item_json #>> '{tg,number}'
      )), '') AS gift_number,
      CASE
        WHEN i.created_at < 1000000000000 THEN i.created_at * 1000
        ELSE i.created_at
      END AS created_at,
      $1::BIGINT AS updated_at
    FROM inventory_items AS i
    ON CONFLICT (entry_key) DO UPDATE SET
      source = EXCLUDED.source,
      source_id = EXCLUDED.source_id,
      telegram_id = EXCLUDED.telegram_id,
      gift_name = EXCLUDED.gift_name,
      gift_number = EXCLUDED.gift_number,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at
    `,
    [now]
  );

  await query(
    `
    DELETE FROM gift_readable AS g
    WHERE g.source = 'market'
      AND NOT EXISTS (
        SELECT 1
        FROM market_items AS m
        WHERE CONCAT('market:', m.id) = g.entry_key
      )
    `
  );

  await query(
    `
    DELETE FROM gift_readable AS g
    WHERE g.source = 'inventory'
      AND NOT EXISTS (
        SELECT 1
        FROM inventory_items AS i
        WHERE CONCAT(
          'inventory:',
          COALESCE(NULLIF(BTRIM(i.instance_id), ''), CONCAT('row_', i.id::TEXT))
        ) = g.entry_key
      )
    `
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
      ui_language TEXT,
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

    CREATE TABLE IF NOT EXISTS gift_readable (
      entry_key TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK (source IN ('market','inventory')),
      source_id TEXT NOT NULL,
      telegram_id BIGINT,
      gift_name TEXT NOT NULL,
      gift_number TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gift_readable_source_created ON gift_readable(source, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gift_readable_name ON gift_readable(gift_name);

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

    CREATE TABLE IF NOT EXISTS referrals (
      invitee_telegram_id BIGINT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      inviter_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      start_param TEXT,
      created_at BIGINT NOT NULL,
      rewarded_at BIGINT,
      reward_currency TEXT CHECK (reward_currency IN ('ton','stars')),
      reward_amount NUMERIC(20,8) NOT NULL DEFAULT 0,
      CHECK (invitee_telegram_id <> inviter_telegram_id)
    );
    CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_telegram_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_referrals_rewarded ON referrals(inviter_telegram_id, rewarded_at);

    CREATE TABLE IF NOT EXISTS webhook_events (
      event_key TEXT PRIMARY KEY,
      payload_json JSONB,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);

    CREATE TABLE IF NOT EXISTS tech_pause_control (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      is_enabled SMALLINT NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_rounds_pending (
      round_id TEXT PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
      currency TEXT NOT NULL CHECK (currency IN ('ton','stars')),
      case_cost NUMERIC(20,8) NOT NULL CHECK (case_cost > 0),
      open_deposit_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','refunded')),
      resolution TEXT,
      metadata_json JSONB,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      settled_at BIGINT,
      refunded_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_case_rounds_pending_status_created
      ON case_rounds_pending(status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_case_rounds_pending_user_status
      ON case_rounds_pending(telegram_id, status);

    CREATE TABLE IF NOT EXISTS game_round_meta (
      game_key TEXT PRIMARY KEY CHECK (game_key IN ('crash','wheel')),
      round_counter BIGINT NOT NULL DEFAULT 0 CHECK (round_counter >= 0),
      round_hash TEXT,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_players (
      telegram_id BIGINT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
      telegram_username TEXT,
      wildcoin_balance BIGINT NOT NULL DEFAULT 0 CHECK (wildcoin_balance >= 0),
      giveaway_1_tickets BIGINT NOT NULL DEFAULT 0 CHECK (giveaway_1_tickets >= 0),
      giveaway_2_tickets BIGINT NOT NULL DEFAULT 0 CHECK (giveaway_2_tickets >= 0),
      giveaway_3_tickets BIGINT NOT NULL DEFAULT 0 CHECK (giveaway_3_tickets >= 0),
      giveaway_4_tickets BIGINT NOT NULL DEFAULT 0 CHECK (giveaway_4_tickets >= 0),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_match_players_updated ON match_players(updated_at DESC);

    CREATE TABLE IF NOT EXISTS match_giveaways (
      giveaway_id TEXT PRIMARY KEY CHECK (giveaway_id IN ('lol-pop','pool-float','snoop-dogg','jolly-chimp')),
      participants_count BIGINT NOT NULL DEFAULT 0 CHECK (participants_count >= 0),
      updated_at BIGINT NOT NULL
    );
  `);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ton_balance NUMERIC(20,8) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stars_balance BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban SMALLINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_language TEXT`);
  await query(`ALTER TABLE balances ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE bets ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE inventory_claims ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS reward_ton NUMERIC(20,8) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS telegram_username TEXT`);
  await query(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS wildcoin_balance BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS giveaway_1_tickets BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS giveaway_2_tickets BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS giveaway_3_tickets BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS giveaway_4_tickets BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_players ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_giveaways ADD COLUMN IF NOT EXISTS participants_count BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE match_giveaways ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0`);
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
  await query(`
    UPDATE match_players AS m
    SET telegram_username = u.username
    FROM users AS u
    WHERE m.telegram_id = u.telegram_id
      AND (m.telegram_username IS NULL OR m.telegram_username = '')
  `);
  await query(
    `INSERT INTO tech_pause_control (id, is_enabled, updated_at)
     VALUES (1, 0, $1)
     ON CONFLICT (id) DO NOTHING`,
    [Date.now()]
  );
  await query(
    `INSERT INTO game_round_meta (game_key, round_counter, round_hash, updated_at)
     VALUES
       ('crash', 0, NULL, $1),
       ('wheel', 0, NULL, $1)
     ON CONFLICT (game_key) DO NOTHING`,
    [Date.now()]
  );
  {
    const now = Math.floor(Date.now() / 1000);
    for (const id of MATCH_GIVEAWAY_IDS) {
      await query(
        `INSERT INTO match_giveaways (giveaway_id, participants_count, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (giveaway_id) DO NOTHING`,
        [id, DEFAULT_MATCH_GIVEAWAY_PARTICIPANTS[id] || 0, now]
      );
    }
  }
  await rebuildGiftReadableSnapshot();
  try {
    await hardenPublicSchemaAccess();
  } catch (error) {
    console.warn("[DB] Security hardening skipped:", error?.message || error);
  }
  console.log("[DB] ✅ Postgres schema ready");
}

export async function claimWebhookEvent(eventKey, payload = null) {
  const key = normalizeOptionalText(eventKey, 256);
  if (!key) return false;
  const now = Math.floor(Date.now() / 1000);
  const payloadJson = (payload && typeof payload === "object" && !Array.isArray(payload))
    ? payload
    : null;

  const r = await query(
    `INSERT INTO webhook_events (event_key, payload_json, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_key) DO NOTHING`,
    [key, payloadJson, now]
  );
  return Number(r.rowCount || 0) > 0;
}

export async function releaseWebhookEvent(eventKey) {
  const key = normalizeOptionalText(eventKey, 256);
  if (!key) return false;
  const r = await query(`DELETE FROM webhook_events WHERE event_key = $1`, [key]);
  return Number(r.rowCount || 0) > 0;
}

export async function getGameRoundMeta(gameKey) {
  const key = normalizeGameRoundMetaKey(gameKey);
  if (!key) {
    return { gameKey: "", counter: 0, hash: "", updatedAt: 0 };
  }

  const r = await query(
    `SELECT round_counter, round_hash, updated_at
     FROM game_round_meta
     WHERE game_key = $1
     LIMIT 1`,
    [key]
  );

  const row = r.rows?.[0] || null;
  if (!row) {
    return { gameKey: key, counter: 0, hash: "", updatedAt: 0 };
  }

  return {
    gameKey: key,
    counter: normalizeGameRoundCounter(row.round_counter),
    hash: String(row.round_hash || ""),
    updatedAt: Number(row.updated_at) || 0
  };
}

export async function setGameRoundMeta(gameKey, counter, hash = null) {
  const key = normalizeGameRoundMetaKey(gameKey);
  if (!key) throw new Error("gameKey required");

  const nextCounter = normalizeGameRoundCounter(counter);
  const roundHash = normalizeOptionalText(hash, 256);
  const now = Date.now();

  await query(
    `INSERT INTO game_round_meta (game_key, round_counter, round_hash, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (game_key)
     DO UPDATE SET round_counter = EXCLUDED.round_counter,
                   round_hash = EXCLUDED.round_hash,
                   updated_at = EXCLUDED.updated_at`,
    [key, nextCounter, roundHash, now]
  );

  return {
    gameKey: key,
    counter: nextCounter,
    hash: roundHash || "",
    updatedAt: now
  };
}

export async function getMatchPlayerState(telegramId) {
  const id = BigInt(telegramId);
  const now = Math.floor(Date.now() / 1000);

  await query(
    `
    INSERT INTO users (telegram_id, created_at, last_seen)
    VALUES ($1,$2,$2)
    ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen
    `,
    [id, now]
  );

  const r = await query(
    `
    INSERT INTO match_players (
      telegram_id,
      telegram_username,
      wildcoin_balance,
      giveaway_1_tickets,
      giveaway_2_tickets,
      giveaway_3_tickets,
      giveaway_4_tickets,
      created_at,
      updated_at
    )
    VALUES ($1, (SELECT username FROM users WHERE telegram_id = $1), 0, 0, 0, 0, 0, $2, $2)
    ON CONFLICT (telegram_id) DO UPDATE SET
      telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), match_players.telegram_username),
      updated_at = GREATEST(match_players.updated_at, $2)
    RETURNING *
    `,
    [id, now]
  );

  return mapMatchPlayerRow(r.rows[0] || {});
}

export async function getMatchGiveawayStats() {
  const r = await query(
    `SELECT giveaway_id, participants_count
     FROM match_giveaways`
  );
  const participants = { ...DEFAULT_MATCH_GIVEAWAY_PARTICIPANTS };
  for (const row of r.rows || []) {
    const id = normalizeMatchGiveawayId(row.giveaway_id);
    if (!id) continue;
    participants[id] = normalizeMatchCounter(row.participants_count);
  }
  return { participants };
}

export async function saveMatchPlayerState(telegramId, state = {}) {
  const id = BigInt(telegramId);
  const now = Math.floor(Date.now() / 1000);
  const tickets = state?.tickets || {};
  const wildCoin = normalizeMatchCounter(state?.wildCoin ?? state?.wildcoin ?? state?.wildcoinBalance);
  const giveaway1 = normalizeMatchCounter(tickets["lol-pop"] ?? state?.giveaway1Tickets ?? state?.giveaway_1_tickets);
  const giveaway2 = normalizeMatchCounter(tickets["pool-float"] ?? state?.giveaway2Tickets ?? state?.giveaway_2_tickets);
  const giveaway3 = normalizeMatchCounter(tickets["snoop-dogg"] ?? state?.giveaway3Tickets ?? state?.giveaway_3_tickets);
  const giveaway4 = normalizeMatchCounter(tickets["jolly-chimp"] ?? state?.giveaway4Tickets ?? state?.giveaway_4_tickets);

  await query(
    `
    INSERT INTO users (telegram_id, created_at, last_seen)
    VALUES ($1,$2,$2)
    ON CONFLICT (telegram_id) DO UPDATE SET last_seen = EXCLUDED.last_seen
    `,
    [id, now]
  );

  const r = await query(
    `
    INSERT INTO match_players (
      telegram_id,
      telegram_username,
      wildcoin_balance,
      giveaway_1_tickets,
      giveaway_2_tickets,
      giveaway_3_tickets,
      giveaway_4_tickets,
      created_at,
      updated_at
    )
    VALUES ($1, (SELECT username FROM users WHERE telegram_id = $1), $2, $3, $4, $5, $6, $7, $7)
    ON CONFLICT (telegram_id) DO UPDATE SET
      telegram_username = COALESCE((SELECT username FROM users WHERE telegram_id = $1), match_players.telegram_username),
      wildcoin_balance = EXCLUDED.wildcoin_balance,
      giveaway_1_tickets = EXCLUDED.giveaway_1_tickets,
      giveaway_2_tickets = EXCLUDED.giveaway_2_tickets,
      giveaway_3_tickets = EXCLUDED.giveaway_3_tickets,
      giveaway_4_tickets = EXCLUDED.giveaway_4_tickets,
      updated_at = EXCLUDED.updated_at
    RETURNING *
    `,
    [id, wildCoin, giveaway1, giveaway2, giveaway3, giveaway4, now]
  );

  return mapMatchPlayerRow(r.rows[0] || {});
}

export async function getTechPauseFlag() {
  const r = await query(
    `SELECT is_enabled, updated_at
     FROM tech_pause_control
     WHERE id = 1
     LIMIT 1`
  );

  const row = r.rows?.[0] || null;
  if (!row) {
    return { enabled: false, updatedAt: 0 };
  }

  return {
    enabled: Number(row.is_enabled) === 1,
    updatedAt: Number(row.updated_at) || 0
  };
}

export async function setTechPauseFlag(enabled) {
  const on = Number(enabled) === 1 ? 1 : 0;
  const now = Date.now();
  await query(
    `INSERT INTO tech_pause_control (id, is_enabled, updated_at)
     VALUES (1, $1, $2)
     ON CONFLICT (id)
     DO UPDATE SET is_enabled = EXCLUDED.is_enabled,
                   updated_at = EXCLUDED.updated_at`,
    [on, now]
  );
  return { enabled: on === 1, updatedAt: now };
}

function mapCaseRoundRow(row = {}) {
  return {
    roundId: String(row.round_id || ""),
    telegramId: String(row.telegram_id || ""),
    currency: normalizeCaseCurrency(row.currency),
    caseCost: Number(row.case_cost || 0),
    openDepositId: row.open_deposit_id || null,
    status: String(row.status || "pending"),
    resolution: row.resolution || null,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    settledAt: row.settled_at === null || row.settled_at === undefined ? null : Number(row.settled_at || 0),
    refundedAt: row.refunded_at === null || row.refunded_at === undefined ? null : Number(row.refunded_at || 0)
  };
}

export async function registerPendingCaseRound(input = {}) {
  const roundId = normalizeCaseRoundId(input?.roundId);
  if (!roundId) return { ok: false, error: "roundId required" };

  let telegramId;
  try {
    telegramId = BigInt(input?.telegramId);
  } catch {
    return { ok: false, error: "telegramId required" };
  }

  const currency = normalizeCaseCurrency(input?.currency);
  const caseCost = normalizeCaseCostByCurrency(input?.caseCost, currency);
  if (!(caseCost > 0)) return { ok: false, error: "caseCost required" };

  const openDepositId = normalizeOptionalText(input?.openDepositId, 190);
  const metadataJson = (input?.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata))
    ? input.metadata
    : null;
  const now = Date.now();

  const inserted = await query(
    `INSERT INTO case_rounds_pending
      (round_id, telegram_id, currency, case_cost, open_deposit_id, status, resolution, metadata_json, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, 'pending', NULL, $6, $7, $7)
     ON CONFLICT (round_id) DO NOTHING
     RETURNING round_id, telegram_id, currency, case_cost, open_deposit_id, status, resolution, created_at, updated_at, settled_at, refunded_at`,
    [roundId, telegramId, currency, caseCost, openDepositId, metadataJson, now]
  );

  if (Number(inserted.rowCount || 0) > 0) {
    return { ok: true, created: true, row: mapCaseRoundRow(inserted.rows[0]) };
  }

  const existing = await query(
    `SELECT round_id, telegram_id, currency, case_cost, open_deposit_id, status, resolution, created_at, updated_at, settled_at, refunded_at
     FROM case_rounds_pending
     WHERE round_id = $1
     LIMIT 1`,
    [roundId]
  );
  if (Number(existing.rowCount || 0) > 0) {
    return { ok: true, created: false, row: mapCaseRoundRow(existing.rows[0]) };
  }
  return { ok: false, error: "failed to upsert case round" };
}

export async function resolvePendingCaseRound(roundIdInput, options = {}) {
  const roundId = normalizeCaseRoundId(roundIdInput);
  if (!roundId) return { ok: false, error: "roundId required" };

  const status = String(options?.status || "").toLowerCase() === "refunded" ? "refunded" : "settled";
  const resolution = normalizeOptionalText(
    options?.resolution,
    64
  ) || (status === "refunded" ? "tech_pause_refund" : "claimed");
  const metadataJson = (options?.metadata && typeof options.metadata === "object" && !Array.isArray(options.metadata))
    ? options.metadata
    : null;
  const now = Date.now();
  const timeColumn = status === "refunded" ? "refunded_at" : "settled_at";

  let telegramId = null;
  if (options?.telegramId !== null && options?.telegramId !== undefined && String(options.telegramId).trim()) {
    try {
      telegramId = BigInt(options.telegramId);
    } catch {
      telegramId = null;
    }
  }

  const params = [roundId, status, resolution, now, metadataJson];
  let userFilterSql = "";
  if (telegramId !== null) {
    params.push(telegramId);
    userFilterSql = ` AND telegram_id = $6`;
  }

  const updated = await query(
    `UPDATE case_rounds_pending
     SET status = $2,
         resolution = $3,
         updated_at = $4,
         metadata_json = CASE
           WHEN $5::jsonb IS NULL THEN metadata_json
           WHEN metadata_json IS NULL THEN $5::jsonb
           ELSE metadata_json || $5::jsonb
         END,
         ${timeColumn} = COALESCE(${timeColumn}, $4)
     WHERE round_id = $1
       AND status = 'pending'
       ${userFilterSql}
     RETURNING round_id, telegram_id, currency, case_cost, open_deposit_id, status, resolution, created_at, updated_at, settled_at, refunded_at`,
    params
  );

  if (Number(updated.rowCount || 0) > 0) {
    return { ok: true, updated: true, row: mapCaseRoundRow(updated.rows[0]) };
  }

  return { ok: true, updated: false, row: null };
}

export async function listPendingCaseRoundsForRefund(limit = 200) {
  const limRaw = Number(limit);
  const lim = Number.isFinite(limRaw)
    ? Math.max(1, Math.min(5000, Math.trunc(limRaw)))
    : 200;

  const r = await query(
    `SELECT round_id, telegram_id, currency, case_cost, open_deposit_id, status, resolution, created_at, updated_at, settled_at, refunded_at
     FROM case_rounds_pending
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT $1`,
    [lim]
  );

  return (r.rows || []).map(mapCaseRoundRow);
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO market_items (id, item_json, created_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET item_json = EXCLUDED.item_json, created_at = EXCLUDED.created_at`,
      [id, item, now]
    );
    await upsertGiftReadableEntry(client, {
      source: "market",
      sourceId: id,
      item,
      createdAt: now
    });
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function clearMarketItems() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE market_items`);
    await clearGiftReadableBySource(client, "market");
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function takeMarketItemById(id) {
  const k = String(id || "").trim();
  if (!k) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `DELETE FROM market_items WHERE id = $1 RETURNING id, item_json`,
      [k]
    );
    const row = r.rows?.[0] || null;
    if (row?.id) await deleteGiftReadableEntry(client, "market", row.id);
    await client.query("COMMIT");
    return row?.item_json || null;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}


export async function saveUser(userData) {
  const now = Math.floor(Date.now() / 1000);
  const id = BigInt(userData.id);
  const hasPremiumFlag = Object.prototype.hasOwnProperty.call(userData || {}, "is_premium");
  const premium = hasPremiumFlag ? !!userData.is_premium : null;
  const username = normalizeUsername(userData?.username);
  const firstName = normalizeOptionalText(userData?.first_name, 128);
  const lastName = normalizeOptionalText(userData?.last_name, 128);
  const languageCode = normalizeUiLanguageCode(userData?.language_code);

  await query(
    `
    INSERT INTO users (telegram_id, username, first_name, last_name, language_code, is_premium, created_at, last_seen)
    VALUES ($1,$2,$3,$4,$5,COALESCE($6,false),$7,$8)
    ON CONFLICT (telegram_id) DO UPDATE SET
      username = COALESCE($2, users.username),
      first_name = COALESCE($3, users.first_name),
      last_name = COALESCE($4, users.last_name),
      language_code = COALESCE(users.language_code, $5),
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
    SELECT u.telegram_id, u.username, u.first_name, u.last_name, u.language_code, u.ui_language,
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

export async function setUserUiLanguage(telegramId, language) {
  const id = BigInt(telegramId);
  const lang = normalizeExplicitUiLanguageCode(language);
  if (!lang) throw new Error("Unsupported UI language");
  const now = Math.floor(Date.now() / 1000);

  const updated = await query(
    `
    UPDATE users
    SET ui_language = $2,
        last_seen = GREATEST(COALESCE(last_seen, 0), $3)
    WHERE telegram_id = $1
    `,
    [id, lang, now]
  );

  if (Number(updated?.rowCount || 0) < 1) {
    await query(
      `
      INSERT INTO users (telegram_id, ui_language, created_at, last_seen)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (telegram_id) DO UPDATE SET
        ui_language = EXCLUDED.ui_language,
        last_seen = EXCLUDED.last_seen
      `,
      [id, lang, now]
    );
    await query(
      `
      INSERT INTO balances (telegram_id, telegram_username, ton_balance, stars_balance, updated_at)
      VALUES ($1, (SELECT username FROM users WHERE telegram_id = $1), 0, 0, $2)
      ON CONFLICT (telegram_id) DO NOTHING
      `,
      [id, now]
    );
  }

  return lang;
}

export async function listTelegramRecipientsForBroadcast(options = {}) {
  const rawLimit = Number(options?.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(20000, Math.trunc(rawLimit)))
    : 5000;

  const includeBanned = options?.includeBanned === true;
  const activeAfterSecRaw = Number(options?.activeAfterSec || 0);
  const activeAfterSec = Number.isFinite(activeAfterSecRaw) && activeAfterSecRaw > 0
    ? Math.trunc(activeAfterSecRaw)
    : 0;

  const r = await query(
    `
    SELECT telegram_id, username, first_name, last_name, ban, last_seen
    FROM users
    WHERE ($1::boolean = true OR COALESCE(ban, 0) <> 1)
      AND ($2::bigint <= 0 OR COALESCE(last_seen, 0) >= $2::bigint)
    ORDER BY COALESCE(last_seen, 0) DESC, telegram_id DESC
    LIMIT $3
    `,
    [includeBanned, activeAfterSec, limit]
  );

  return r.rows || [];
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

export async function getTaskProgressSignals(telegramId, options = {}) {
  const id = BigInt(telegramId);
  const minTonRaw = Number(options?.topUpMinTon ?? 0.5);
  const minStarsRaw = Number(options?.topUpMinStars ?? 50);
  const topUpMinTon = Number.isFinite(minTonRaw) && minTonRaw > 0 ? minTonRaw : 0.5;
  const topUpMinStars = Number.isFinite(minStarsRaw) && minStarsRaw > 0 ? Math.max(1, Math.round(minStarsRaw)) : 50;

  const r = await query(
    `
    SELECT
      COALESCE(MAX(CASE WHEN type = 'deposit' AND currency = 'ton' AND amount > 0 THEN amount END), 0) AS max_ton_deposit,
      COALESCE(MAX(CASE WHEN type = 'deposit' AND currency = 'stars' AND amount > 0 THEN amount END), 0) AS max_stars_deposit,
      COUNT(*) FILTER (WHERE type IN ('wheel_win', 'crash_win') AND amount > 0) AS game_wins
    FROM transactions
    WHERE telegram_id = $1
    `,
    [id]
  );

  const row = r.rows[0] || {};
  const maxTonDeposit = Number(row.max_ton_deposit || 0);
  const maxStarsDeposit = Number(row.max_stars_deposit || 0);
  const gameWins = Math.max(0, Math.trunc(Number(row.game_wins || 0)));

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


function mapReferralUser(row = {}, prefix = "") {
  const keyPrefix = prefix ? `${prefix}_` : "";
  const telegramId = String(row[`${keyPrefix}telegram_id`] || "");
  const username = row[`${keyPrefix}username`] || null;
  const firstName = row[`${keyPrefix}first_name`] || null;
  const lastName = row[`${keyPrefix}last_name`] || null;
  const displayName =
    username ? `@${username}` :
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    (telegramId ? `ID ${telegramId}` : "User");
  return { telegramId, username, firstName, lastName, displayName };
}

export async function registerReferral(input = {}) {
  const inviteeId = BigInt(input?.inviteeId ?? input?.inviteeTelegramId);
  const inviterId = BigInt(input?.inviterId ?? input?.inviterTelegramId);
  if (inviteeId === inviterId) return { ok: false, registered: false, reason: "self" };

  const startParam = normalizeOptionalText(input?.startParam, 128);
  const now = Math.floor(Date.now() / 1000);
  const maxExistingAgeSec = Math.max(60, Math.min(24 * 60 * 60, Number(input?.maxExistingAgeSec || 10 * 60) || 10 * 60));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO users (telegram_id, created_at, last_seen)
       VALUES ($1,$2,$2)
       ON CONFLICT (telegram_id) DO NOTHING`,
      [inviterId, now]
    );
    await client.query(
      `INSERT INTO users (telegram_id, created_at, last_seen)
       VALUES ($1,$2,$2)
       ON CONFLICT (telegram_id) DO UPDATE SET
         last_seen = GREATEST(COALESCE(users.last_seen, 0), EXCLUDED.last_seen)`,
      [inviteeId, now]
    );

    const inserted = await client.query(
      `INSERT INTO referrals (invitee_telegram_id, inviter_telegram_id, start_param, created_at)
       SELECT $1,$2,$3,$4
       WHERE $1 <> $2
         AND COALESCE((SELECT created_at FROM users WHERE telegram_id = $1), $4) >= $4 - $5
         AND NOT EXISTS (
           SELECT 1 FROM referrals
           WHERE invitee_telegram_id = $2 AND inviter_telegram_id = $1
         )
       ON CONFLICT (invitee_telegram_id) DO NOTHING
       RETURNING invitee_telegram_id`,
      [inviteeId, inviterId, startParam, now, maxExistingAgeSec]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      registered: Number(inserted?.rowCount || 0) > 0,
      inviteeId: String(inviteeId),
      inviterId: String(inviterId)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getReferralSummary(telegramId, options = {}) {
  const id = BigInt(telegramId);
  const rawLimit = Number(options?.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.trunc(rawLimit))) : 20;

  const counts = await query(
    `SELECT
       COUNT(*)::BIGINT AS invite_count,
       COUNT(*) FILTER (WHERE rewarded_at IS NULL)::BIGINT AS pending_reward_count,
       COUNT(*) FILTER (WHERE rewarded_at IS NOT NULL)::BIGINT AS rewarded_count
     FROM referrals
     WHERE inviter_telegram_id = $1`,
    [id]
  );

  const invitesRes = await query(
    `SELECT
       r.invitee_telegram_id AS invitee_telegram_id,
       r.created_at,
       r.rewarded_at,
       u.username AS invitee_username,
       u.first_name AS invitee_first_name,
       u.last_name AS invitee_last_name
     FROM referrals r
     LEFT JOIN users u ON u.telegram_id = r.invitee_telegram_id
     WHERE r.inviter_telegram_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [id, limit]
  );

  const invitedByRes = await query(
    `SELECT
       r.inviter_telegram_id AS inviter_telegram_id,
       r.created_at,
       u.username AS inviter_username,
       u.first_name AS inviter_first_name,
       u.last_name AS inviter_last_name
     FROM referrals r
     LEFT JOIN users u ON u.telegram_id = r.inviter_telegram_id
     WHERE r.invitee_telegram_id = $1
     LIMIT 1`,
    [id]
  );

  const countRow = counts.rows[0] || {};
  const invitedByRow = invitedByRes.rows[0] || null;

  return {
    inviteCount: Math.max(0, Number(countRow.invite_count || 0)),
    pendingRewardCount: Math.max(0, Number(countRow.pending_reward_count || 0)),
    rewardedCount: Math.max(0, Number(countRow.rewarded_count || 0)),
    invitedBy: invitedByRow
      ? {
          ...mapReferralUser({
            inviter_telegram_id: invitedByRow.inviter_telegram_id,
            inviter_username: invitedByRow.inviter_username,
            inviter_first_name: invitedByRow.inviter_first_name,
            inviter_last_name: invitedByRow.inviter_last_name
          }, "inviter"),
          createdAt: Number(invitedByRow.created_at || 0)
        }
      : null,
    invites: invitesRes.rows.map((row) => ({
      ...mapReferralUser({
        invitee_telegram_id: row.invitee_telegram_id,
        invitee_username: row.invitee_username,
        invitee_first_name: row.invitee_first_name,
        invitee_last_name: row.invitee_last_name
      }, "invitee"),
      createdAt: Number(row.created_at || 0),
      rewarded: row.rewarded_at !== null && row.rewarded_at !== undefined,
      rewardedAt: row.rewarded_at === null || row.rewarded_at === undefined ? null : Number(row.rewarded_at || 0)
    }))
  };
}

export async function claimReferralRewards(
  telegramId,
  options = {}
) {
  const id = BigInt(telegramId);
  const cur = String(options?.currency || "stars").toLowerCase() === "ton" ? "ton" : "stars";
  const maxCountRaw = Number(options?.maxCount || 100);
  const maxCount = Number.isFinite(maxCountRaw) ? Math.max(1, Math.min(100, Math.trunc(maxCountRaw))) : 100;
  let amountPerInvite = Number(options?.amountPerInvite || 0);
  if (!Number.isFinite(amountPerInvite) || amountPerInvite <= 0) throw new Error("Invalid amountPerInvite");
  if (cur === "stars") amountPerInvite = Math.max(1, Math.round(amountPerInvite));
  if (cur === "ton") amountPerInvite = Math.round(amountPerInvite * 100000000) / 100000000;

  const now = Math.floor(Date.now() / 1000);
  const description = normalizeOptionalText(options?.description, 256) || "One-time referral reward";

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

    const refs = await client.query(
      `SELECT invitee_telegram_id
       FROM referrals
       WHERE inviter_telegram_id = $1 AND rewarded_at IS NULL
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE`,
      [id, maxCount]
    );

    const inviteeIds = refs.rows.map((row) => BigInt(row.invitee_telegram_id));
    const balanceRes = await client.query(
      `SELECT ton_balance, stars_balance FROM balances WHERE telegram_id = $1 FOR UPDATE`,
      [id]
    );
    const ton = Number(balanceRes.rows[0]?.ton_balance || 0);
    const stars = Number(balanceRes.rows[0]?.stars_balance || 0);

    if (!inviteeIds.length) {
      await client.query("COMMIT");
      return {
        ok: true,
        claimedCount: 0,
        currency: cur,
        added: 0,
        newBalance: cur === "ton" ? ton : stars,
        tonBalance: ton,
        starsBalance: stars,
        pendingRewardCount: 0
      };
    }

    let delta = amountPerInvite * inviteeIds.length;
    if (cur === "stars") delta = Math.max(1, Math.round(delta));
    if (cur === "ton") delta = Math.round(delta * 100000000) / 100000000;

    const before = cur === "ton" ? ton : stars;
    const after = before + delta;
    let nextTon = ton;
    let nextStars = Math.trunc(stars);

    if (cur === "ton") {
      nextTon = after;
      await client.query(
        `UPDATE balances SET ton_balance = $1, updated_at = $2 WHERE telegram_id = $3`,
        [nextTon, now, id]
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
      `UPDATE referrals
       SET rewarded_at = $3,
           reward_currency = $4,
           reward_amount = $5
       WHERE inviter_telegram_id = $1
         AND invitee_telegram_id = ANY($2::bigint[])`,
      [id, inviteeIds.map(String), now, cur, amountPerInvite]
    );

    await client.query(
      `INSERT INTO transactions
       (telegram_id, telegram_username, type, currency, amount, balance_before, balance_after, description, created_at)
       VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4,$5,$6,$7,$8)`,
      [id, "task_reward", cur, delta, before, after, description, now]
    );

    const pendingRes = await client.query(
      `SELECT COUNT(*)::BIGINT AS pending_count
       FROM referrals
       WHERE inviter_telegram_id = $1 AND rewarded_at IS NULL`,
      [id]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      claimedCount: inviteeIds.length,
      currency: cur,
      added: delta,
      newBalance: cur === "ton" ? nextTon : nextStars,
      tonBalance: nextTon,
      starsBalance: nextStars,
      pendingRewardCount: Math.max(0, Number(pendingRes.rows[0]?.pending_count || 0))
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

      const ins = await client.query(
        `INSERT INTO inventory_items (telegram_id, telegram_username, instance_id, item_json, created_at)
         VALUES ($1,(SELECT username FROM users WHERE telegram_id = $1),$2,$3,$4)
         ON CONFLICT (instance_id) DO NOTHING
         RETURNING id, instance_id, item_json, created_at`,
        [id, instanceId, enriched, nowSec]
      );

      if (ins.rowCount > 0) {
        const row = ins.rows[0] || {};
        const readableSourceId = inventoryReadableSourceIdFromRow(row) || instanceId;
        await upsertGiftReadableEntry(client, {
          source: "inventory",
          sourceId: readableSourceId,
          telegramId: id,
          item: row.item_json || enriched,
          createdAt: enriched.acquiredAt || nowMs
        });
      }
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
       RETURNING id, instance_id, item_json`,
      [id, ids]
    );

    const soldRows = Array.isArray(del.rows) ? del.rows : [];
    const soldItems = soldRows.map((r) => r.item_json);
    for (const row of soldRows) {
      const readableSourceId = inventoryReadableSourceIdFromRow(row);
      if (!readableSourceId) continue;
      await deleteGiftReadableEntry(client, "inventory", readableSourceId);
    }

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
       WHERE telegram_id = $1 AND instance_id = ANY($2::text[])
       RETURNING id, instance_id`,
      [id, ids]
    );

    for (const row of (del.rows || [])) {
      const readableSourceId = inventoryReadableSourceIdFromRow(row);
      if (!readableSourceId) continue;
      await deleteGiftReadableEntry(client, "inventory", readableSourceId);
    }

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
    if (!value) return null;
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
       RETURNING i.id, i.instance_id`,
      [id, value]
    );
    return del.rows?.[0] || null;
  };

  try {
    await client.query("BEGIN");

    let deletedRow = null;
    if (instanceId) {
      const del = await client.query(
        `DELETE FROM inventory_items
         WHERE telegram_id = $1 AND instance_id = $2
         RETURNING id, instance_id`,
        [id, instanceId]
      );
      deletedRow = del.rows?.[0] || null;
    }

    if (!deletedRow) deletedRow = await deleteByExpr(`item_json->>'marketId'`, marketId);
    if (!deletedRow) deletedRow = await deleteByExpr(`item_json->>'id'`, itemId);
    if (!deletedRow) deletedRow = await deleteByExpr(`item_json->>'baseId'`, itemId);
    if (!deletedRow) deletedRow = await deleteByExpr(`item_json #>> '{tg,messageId}'`, tgMessageId);
    if (!deletedRow) deletedRow = await deleteByExpr(`item_json #>> '{tg,msgId}'`, tgMessageId);

    if (deletedRow) {
      const readableSourceId = inventoryReadableSourceIdFromRow(deletedRow);
      if (readableSourceId) {
        await deleteGiftReadableEntry(client, "inventory", readableSourceId);
      }
    }

    await client.query("COMMIT");
    return { deleted: deletedRow ? 1 : 0 };
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
