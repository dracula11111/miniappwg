import { priceManager } from "../services/price-manager.js";

function formatRow([key, entry]) {
  const amount = Number(entry?.price || 0);
  const currency = String(entry?.currency || "").toUpperCase();
  const ts = Number(entry?.ts || 0);
  const at = ts ? new Date(ts).toISOString() : "-";
  return `${key} -> ${amount} ${currency} (${entry?.source || "unknown"}) @ ${at}`;
}

await priceManager.init();

const before = priceManager.getSnapshot();
console.log(`[test-prices] snapshot: count=${Object.keys(before.prices).length} updatedAt=${before.updatedAt || 0} stale=${before.stale}`);

const result = await priceManager.refresh({ force: true, reason: "script" });
console.log(`[test-prices] refresh: status=${result.status} updated=${result.updated} count=${result.count}`);

const after = priceManager.getSnapshot();
const topFive = Object.entries(after.prices)
  .sort((left, right) => Number(right[1]?.ts || 0) - Number(left[1]?.ts || 0))
  .slice(0, 5);

for (const row of topFive) {
  console.log(`[test-prices] ${formatRow(row)}`);
}

priceManager.stop();
