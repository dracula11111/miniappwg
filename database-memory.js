// database-memory.js — TEST DB (ничего не пишет на диск, всё в памяти)
const balances = new Map(); // telegramId -> { ton, stars, updatedAt }

export async function initDatabase() {
  console.log("[DB] 🧪 Using MEMORY DB (TEST_MODE) — nothing will be persisted");
}

export async function saveUser(_userData) {
  // можно ничего не делать
  return true;
}

export async function getUserBalance(telegramId) {
  const key = String(telegramId);
  const now = Math.floor(Date.now() / 1000);

  if (!balances.has(key)) {
    balances.set(key, { ton_balance: "0", stars_balance: 0, updated_at: now });
  }
  return balances.get(key);
}

export async function updateBalance(telegramId, currency, amount, type, description = null, metadata = {}) {
  const key = String(telegramId);
  const now = Math.floor(Date.now() / 1000);

  const cur = currency === "stars" ? "stars" : "ton";
  const delta = Number(amount || 0);
  if (!Number.isFinite(delta) || delta === 0) throw new Error("Invalid amount");

  const bal = await getUserBalance(key);
  const before = cur === "ton" ? Number(bal.ton_balance || 0) : Number(bal.stars_balance || 0);
  const after = before + delta;

  if (after < 0) throw new Error("Insufficient balance");

  if (cur === "ton") bal.ton_balance = String(after);
  else bal.stars_balance = Math.trunc(after);

  bal.updated_at = now;
  balances.set(key, bal);

  console.log("[DB][TEST] updateBalance:", { telegramId: key, cur, delta, before, after, type, description, metadata });
  return after;
}

export async function createBet() {
  throw new Error("Bets are disabled in TEST memory DB (or implement if needed)");
}

export async function resolveBet() {
  throw new Error("Bets are disabled in TEST memory DB (or implement if needed)");
}

export async function getTransactionHistory() {
  return [];
}

export async function getUserStats() {
  return { wins: 0, losses: 0, total_won: 0, total_wagered: 0, total_bets: 0 };
}
