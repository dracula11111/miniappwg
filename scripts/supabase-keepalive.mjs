import pg from "pg";

const { Client } = pg;
const dbUrl = String(
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || "",
).trim();

if (!dbUrl) {
  console.error("SUPABASE_DATABASE_URL is required.");
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

const startedAt = Date.now();

try {
  await client.connect();
  const r = await client.query("select now() as ts, 1 as ok");
  const tookMs = Date.now() - startedAt;
  console.log("Supabase keepalive OK:", {
    ok: r.rows?.[0]?.ok ?? null,
    ts: r.rows?.[0]?.ts ?? null,
    tookMs,
  });
} catch (err) {
  console.error("Supabase keepalive failed:", err?.message || err);
  process.exitCode = 1;
} finally {
  try {
    await client.end();
  } catch {}
}
