import "dotenv/config";

import fs from "fs/promises";
import path from "path";

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const DEFAULT_REFRESH_INTERVAL_SEC = 24 * 60 * 60;
const DEFAULT_STALE_MAX_SEC = 7 * 24 * 60 * 60;

const HTTP_TIMEOUT_MS = 15_000;
const TELEGRAM_JITTER_MS = 120;
const TELEGRAM_JITTER_SPREAD_MS = 80;
const RETRY_429_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const RETRY_5XX_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const RETRY_DEFAULT_MS = [60_000, 5 * 60_000, 15 * 60_000];

let warnedMissingTelegramResaleMethod = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFiniteNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  try {
    const raw = typeof value === "string" ? value : String(value);
    const normalized = raw.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function truthyFlag(raw, fallback = false) {
  if (raw == null || raw === "") return fallback;
  return !/^(0|false|no|off)$/i.test(String(raw).trim());
}

function optionalFlag(raw) {
  if (raw == null || raw === "") return null;
  return truthyFlag(raw, false);
}

function normalizeAlias(value) {
  return String(value || "").trim().toLowerCase();
}

function slugifyGiftName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCanonicalKey({ key, giftId, name }) {
  const rawGiftId = giftId == null ? "" : String(giftId).trim();
  if (rawGiftId) return `gift:${rawGiftId}`.toLowerCase();

  const rawKey = String(key || "").trim();
  if (rawKey) {
    if (/^\d+$/.test(rawKey)) return `gift:${rawKey}`;
    if (/^gift:\d+$/i.test(rawKey)) return rawKey.toLowerCase();
    const fromKey = slugifyGiftName(rawKey);
    if (fromKey) return fromKey;
  }

  return slugifyGiftName(name);
}

function clonePlainObject(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    out[key] = value && typeof value === "object" ? { ...value } : value;
  }
  return out;
}

function parseRetryAfterMs(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  const sec = Number(raw);
  if (Number.isFinite(sec) && sec >= 0) {
    return Math.max(1_000, Math.round(sec * 1000));
  }

  const at = Date.parse(raw);
  if (Number.isFinite(at)) {
    return Math.max(1_000, at - Date.now());
  }

  return null;
}

function pickBackoffMs(sequence, failCount) {
  const idx = Math.max(0, Math.min(sequence.length - 1, Number(failCount || 1) - 1));
  return sequence[idx];
}

function createHttpError(message, extras = {}) {
  const error = new Error(String(message || "price source error"));
  Object.assign(error, extras);
  return error;
}

function toJsNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  try {
    const stringValue = typeof value === "object" && value && typeof value.toString === "function"
      ? value.toString()
      : String(value);
    const parsed = Number(stringValue);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseTelegramAmount(amount) {
  if (!amount) return null;

  if (typeof amount.nanos !== "undefined") {
    const value = toJsNumber(amount.amount);
    const nanos = toJsNumber(amount.nanos);
    if (!Number.isFinite(value)) return null;
    return {
      type: "STARS",
      value: value + (Number.isFinite(nanos) ? (nanos / 1e9) : 0),
    };
  }

  const className = String(amount.className || amount.constructor?.name || "").toLowerCase();
  const raw = toJsNumber(amount.amount);
  if (!Number.isFinite(raw)) return null;

  if (className.includes("ton")) {
    return { type: "TON", value: raw / 1e9 };
  }

  return { type: "TON", value: raw / 1e9 };
}

function parseTonPrice(raw) {
  const value = toFiniteNumber(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value > 1_000_000) return value / 1e9;
  return value;
}

function resolveDefaultSnapshotPath() {
  if (process.env.PRICES_SNAPSHOT_PATH) {
    return path.resolve(String(process.env.PRICES_SNAPSHOT_PATH));
  }
  if (process.env.NODE_ENV === "production") {
    return "/opt/render/project/data/prices-snapshot.json";
  }
  return path.resolve(process.cwd(), "data", "prices-snapshot.json");
}

function normalizeProviderEntry(sourceName, candidate) {
  if (!candidate || typeof candidate !== "object") return null;

  const canonicalKey = normalizeCanonicalKey(candidate);
  const price = toFiniteNumber(candidate.price);
  const currency = String(candidate.currency || "").trim().toUpperCase();
  if (!canonicalKey || !Number.isFinite(price) || price <= 0 || !currency) {
    return null;
  }

  const aliases = new Set();
  const rawAliases = Array.isArray(candidate.aliases) ? candidate.aliases : [];
  for (const alias of rawAliases) {
    const normalized = normalizeAlias(alias);
    const slug = slugifyGiftName(alias);
    if (normalized) aliases.add(normalized);
    if (slug) aliases.add(slug);
  }

  if (candidate.name) {
    const normalized = normalizeAlias(candidate.name);
    const slug = slugifyGiftName(candidate.name);
    if (normalized) aliases.add(normalized);
    if (slug) aliases.add(slug);
  }

  if (canonicalKey) aliases.add(canonicalKey);
  if (canonicalKey.startsWith("gift:")) {
    aliases.add(canonicalKey.slice(5));
  }

  return {
    key: canonicalKey,
    aliases: Array.from(aliases),
    entry: {
      price,
      currency,
      source: String(candidate.source || sourceName || "").slice(0, 80) || sourceName,
      ts: Math.max(0, Math.round(toFiniteNumber(candidate.ts) || Date.now())),
      name: candidate.name ? String(candidate.name).trim() : "",
      giftId: candidate.giftId == null ? null : String(candidate.giftId).trim() || null,
    },
  };
}

function pickBestGiftAssetFloor(entry) {
  if (!entry || typeof entry !== "object") return null;
  const providerOrder = ["portals", "tonnel", "getgems", "mrkt"];
  let best = null;

  for (const provider of providerOrder) {
    const price = toFiniteNumber(entry[provider]);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!best || price < best.price) {
      best = { provider, price };
    }
  }

  return best;
}

function resolveTelegramResaleMethod() {
  const paymentsApi = Api?.payments || {};
  const candidateNames = [
    "GetResaleStarGifts",
    "GetResellStarGifts",
    "GetResaleStarGift",
    "GetResellStarGift",
  ];

  for (const name of candidateNames) {
    if (typeof paymentsApi[name] === "function") {
      return paymentsApi[name];
    }
  }

  return null;
}

class PriceManager {
  constructor() {
    this.refreshIntervalMs = Math.max(
      60_000,
      (Number(process.env.PRICES_REFRESH_INTERVAL_SEC || DEFAULT_REFRESH_INTERVAL_SEC) || DEFAULT_REFRESH_INTERVAL_SEC) * 1000,
    );
    this.staleMaxMs = Math.max(
      60_000,
      (Number(process.env.PRICES_STALE_MAX_SEC || DEFAULT_STALE_MAX_SEC) || DEFAULT_STALE_MAX_SEC) * 1000,
    );
    this.snapshotPath = resolveDefaultSnapshotPath();

    this.state = {
      updatedAt: 0,
      prices: {},
      aliases: {},
      providerStats: {},
    };

    this.initialized = false;
    this.refreshPromise = null;
    this.refreshStartedAt = 0;
    this.timer = null;

    this.sources = [
      this.createSource({
        name: "telegram-resale",
        weight: 100,
        enabled: () => {
          const explicit = optionalFlag(process.env.PRICE_SOURCE_TELEGRAM_RESALE);
          if (explicit === false) return false;
          const hasCreds =
            !!String(process.env.RELAYER_SESSION || "").trim() &&
            !!String(process.env.RELAYER_API_HASH || process.env.TG_API_HASH || "").trim() &&
            Number(process.env.RELAYER_API_ID || process.env.TG_API_ID || 0) > 0;
          if (!hasCreds) return false;
          return explicit == null ? true : explicit;
        },
        fetchPrices: async () => this.fetchTelegramResalePrices(),
      }),
      this.createSource({
        name: "giftasset",
        weight: 70,
        enabled: () => {
          const explicit = optionalFlag(process.env.PRICE_SOURCE_GIFTASSET);
          const hasKey = !!String(process.env.GIFTASSET_API_KEY || process.env.GIFTASSET_KEY || "").trim();
          if (explicit === false) return false;
          return explicit == null ? hasKey : true;
        },
        fetchPrices: async () => this.fetchGiftAssetPrices(),
      }),
      this.createSource({
        name: "tonapi",
        weight: 50,
        enabled: () => {
          const explicit = optionalFlag(process.env.PRICE_SOURCE_TON);
          if (!explicit) return false;
          return Object.keys(this.getTonCollectionMap()).length > 0;
        },
        fetchPrices: async () => this.fetchTonApiPrices(),
      }),
    ];
  }

  createSource({ name, weight, enabled, fetchPrices }) {
    return {
      name,
      weight,
      enabled,
      fetchPrices,
      cooldownMs: 0,
      failCount: 0,
      lastFailAt: 0,
      lastSuccessAt: 0,
      nextRetryAt: 0,
      lastError: "",
      lastStatus: "",
      lastResultCount: 0,
    };
  }

  async init() {
    if (this.initialized) {
      this.scheduleNextRefresh();
      this.maybeStartBackgroundRefresh("init");
      return this.getSnapshot();
    }

    await this.loadSnapshot();
    this.initialized = true;
    this.scheduleNextRefresh();
    this.maybeStartBackgroundRefresh("init");
    return this.getSnapshot();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getPrice(giftNameOrId) {
    this.maybeStartBackgroundRefresh("read:getPrice");
    const key = this.resolveKey(giftNameOrId);
    if (!key) return null;
    const entry = this.state.prices[key];
    if (!entry) return null;
    return {
      key,
      stale: this.isStale(),
      ...entry,
    };
  }

  getAllPrices() {
    this.maybeStartBackgroundRefresh("read:getAllPrices");
    return clonePlainObject(this.state.prices);
  }

  getSnapshot() {
    this.maybeStartBackgroundRefresh("read:getSnapshot");
    return {
      updatedAt: this.state.updatedAt,
      stale: this.isStale(),
      prices: clonePlainObject(this.state.prices),
      aliases: { ...this.state.aliases },
      providerStats: this.serializeProviderStats(),
      refreshing: !!this.refreshPromise,
    };
  }

  async refresh({ force = false, reason = "manual" } = {}) {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!force && this.state.updatedAt && !this.shouldRefresh()) {
      return {
        ok: true,
        status: "skipped",
        startedAt: 0,
        updatedAt: this.state.updatedAt,
        count: Object.keys(this.state.prices).length,
      };
    }

    this.refreshStartedAt = Date.now();
    this.refreshPromise = this.runRefresh({ force, reason }).finally(() => {
      this.refreshPromise = null;
      this.refreshStartedAt = 0;
      this.scheduleNextRefresh();
    });

    return this.refreshPromise;
  }

  shouldRefresh() {
    return Date.now() >= this.getNextRefreshAt();
  }

  isStale() {
    if (!this.state.updatedAt) return true;
    return (Date.now() - this.state.updatedAt) > this.staleMaxMs;
  }

  maybeStartBackgroundRefresh(reason) {
    if (this.refreshPromise) return;
    if (!this.shouldRefresh()) return;
    this.refresh({ force: false, reason }).catch((error) => {
      console.warn("[prices] background refresh failed:", error?.message || error);
    });
  }

  scheduleNextRefresh() {
    if (!this.initialized) return;
    if (this.timer) clearTimeout(this.timer);

    const now = Date.now();
    const dueAt = this.getNextRefreshAt();
    const delay = Math.max(5_000, dueAt - now);

    this.timer = setTimeout(() => {
      this.refresh({ force: false, reason: "scheduled" }).catch((error) => {
        console.warn("[prices] scheduled refresh failed:", error?.message || error);
      });
    }, delay);
  }

  getNextRefreshAt() {
    const now = Date.now();
    const enabledSources = this.sources.filter((source) => source.enabled());

    const sourceReadyNow = enabledSources.some((source) => Number(source.nextRetryAt || 0) <= now);
    const futureSourceRetryAt = enabledSources
      .map((source) => Number(source.nextRetryAt || 0))
      .filter((ts) => ts > now)
      .sort((left, right) => left - right)[0] || 0;

    const intervalDueAt = this.state.updatedAt
      ? (this.state.updatedAt + this.refreshIntervalMs)
      : (sourceReadyNow ? now : (futureSourceRetryAt || (now + this.refreshIntervalMs)));

    if (futureSourceRetryAt && !sourceReadyNow) {
      return Math.min(intervalDueAt, futureSourceRetryAt);
    }

    return intervalDueAt;
  }

  resolveKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const exact = raw.toLowerCase();
    if (this.state.prices[exact]) return exact;
    if (/^\d+$/.test(raw)) {
      const directGiftKey = `gift:${raw}`;
      if (this.state.prices[directGiftKey]) return directGiftKey;
    }
    if (this.state.prices[raw]) return raw;

    const aliasExact = this.state.aliases[normalizeAlias(raw)];
    if (aliasExact && this.state.prices[aliasExact]) return aliasExact;

    const slug = slugifyGiftName(raw);
    const aliasSlug = slug ? this.state.aliases[slug] : null;
    if (aliasSlug && this.state.prices[aliasSlug]) return aliasSlug;
    if (slug && this.state.prices[slug]) return slug;

    return null;
  }

  serializeProviderStats() {
    const now = Date.now();
    const out = {};
    for (const source of this.sources) {
      out[source.name] = {
        weight: source.weight,
        failCount: source.failCount,
        lastFailAt: source.lastFailAt,
        lastSuccessAt: source.lastSuccessAt,
        nextRetryAt: source.nextRetryAt,
        cooldownMs: source.cooldownMs,
        lastError: source.lastError,
        lastStatus: source.lastStatus,
        lastResultCount: source.lastResultCount,
        health: this.computeHealth(source, now),
      };
    }
    return out;
  }

  computeHealth(source, now = Date.now()) {
    let score = 100;
    score -= Math.min(70, Math.max(0, Number(source.failCount || 0)) * 15);
    if (source.nextRetryAt > now) score -= 20;
    if (!source.lastSuccessAt) score -= 10;
    if (source.lastStatus === "disabled") score -= 20;
    return Math.max(0, Math.min(100, score));
  }

  applyProviderStats(providerStats) {
    for (const source of this.sources) {
      const saved = providerStats?.[source.name];
      if (!saved || typeof saved !== "object") continue;
      source.failCount = Math.max(0, Math.round(toFiniteNumber(saved.failCount) || 0));
      source.lastFailAt = Math.max(0, Math.round(toFiniteNumber(saved.lastFailAt) || 0));
      source.lastSuccessAt = Math.max(0, Math.round(toFiniteNumber(saved.lastSuccessAt) || 0));
      source.nextRetryAt = Math.max(0, Math.round(toFiniteNumber(saved.nextRetryAt) || 0));
      source.cooldownMs = Math.max(0, Math.round(toFiniteNumber(saved.cooldownMs) || 0));
      source.lastError = String(saved.lastError || "");
      source.lastStatus = String(saved.lastStatus || "");
      source.lastResultCount = Math.max(0, Math.round(toFiniteNumber(saved.lastResultCount) || 0));
    }
  }

  async loadSnapshot() {
    try {
      const raw = await fs.readFile(this.snapshotPath, "utf8");
      const parsed = JSON.parse(raw || "{}");
      const prices = {};
      const aliases = {};
      const rawPrices = parsed?.prices && typeof parsed.prices === "object" ? parsed.prices : {};

      for (const [rawKey, value] of Object.entries(rawPrices)) {
        const key = normalizeCanonicalKey({ key: rawKey });
        const price = toFiniteNumber(value?.price);
        const currency = String(value?.currency || "").trim().toUpperCase();
        if (!key || !Number.isFinite(price) || price <= 0 || !currency) continue;
        prices[key] = {
          price,
          currency,
          source: String(value?.source || "snapshot").slice(0, 80) || "snapshot",
          ts: Math.max(0, Math.round(toFiniteNumber(value?.ts) || 0)),
          name: value?.name ? String(value.name).trim() : "",
          giftId: value?.giftId == null ? null : String(value.giftId).trim() || null,
        };
      }

      const rawAliases = parsed?.aliases && typeof parsed.aliases === "object" ? parsed.aliases : {};
      for (const [alias, key] of Object.entries(rawAliases)) {
        const normalizedAlias = normalizeAlias(alias);
        const normalizedKey = normalizeCanonicalKey({ key });
        if (!normalizedAlias || !normalizedKey || !prices[normalizedKey]) continue;
        aliases[normalizedAlias] = normalizedKey;
      }

      for (const [key, entry] of Object.entries(prices)) {
        this.attachKnownAliases(aliases, key, entry);
      }

      this.state.updatedAt = Math.max(0, Math.round(toFiniteNumber(parsed?.updatedAt) || 0));
      this.state.prices = prices;
      this.state.aliases = aliases;
      this.applyProviderStats(parsed?.providerStats || {});

      if (Object.keys(prices).length > 0) {
        console.log(`[prices] snapshot loaded: ${Object.keys(prices).length} keys from ${this.snapshotPath}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("[prices] snapshot load failed:", error?.message || error);
      }
    }
  }

  async saveSnapshot() {
    const payload = {
      updatedAt: this.state.updatedAt,
      providerStats: this.serializeProviderStats(),
      aliases: { ...this.state.aliases },
      prices: clonePlainObject(this.state.prices),
    };

    try {
      await fs.mkdir(path.dirname(this.snapshotPath), { recursive: true });
      const tmpPath = `${this.snapshotPath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
      await fs.rename(tmpPath, this.snapshotPath);
      return true;
    } catch (error) {
      console.warn("[prices] snapshot write failed:", error?.message || error);
      return false;
    }
  }

  attachKnownAliases(aliasStore, key, entry) {
    aliasStore[key] = key;
    if (key.startsWith("gift:")) {
      aliasStore[key.slice(5)] = key;
    }

    if (entry?.giftId) {
      aliasStore[String(entry.giftId).trim().toLowerCase()] = key;
      aliasStore[`gift:${String(entry.giftId).trim().toLowerCase()}`] = key;
    }

    if (entry?.name) {
      const nameAlias = normalizeAlias(entry.name);
      const slugAlias = slugifyGiftName(entry.name);
      if (nameAlias) aliasStore[nameAlias] = key;
      if (slugAlias) aliasStore[slugAlias] = key;
    }
  }

  async runRefresh({ force, reason }) {
    const startedAt = Date.now();
    const sourceResults = [];
    const mergedFresh = new Map();
    const freshAliases = {};
    let freshUpdateCount = 0;
    let anySourceSucceeded = false;
    let anySourceFetched = false;

    console.log(`[prices] refresh start force=${force ? 1 : 0} reason=${reason} cached=${Object.keys(this.state.prices).length}`);

    for (const source of [...this.sources].sort((left, right) => right.weight - left.weight)) {
      const now = Date.now();

      if (!source.enabled()) {
        source.lastStatus = "disabled";
        sourceResults.push(this.buildSourceResult(source, "disabled", 0));
        continue;
      }

      if (source.nextRetryAt > now) {
        source.lastStatus = "cooldown";
        sourceResults.push(this.buildSourceResult(source, "cooldown", 0));
        continue;
      }

      try {
        const items = await source.fetchPrices(source);
        const normalizedItems = Array.isArray(items)
          ? items.map((candidate) => normalizeProviderEntry(source.name, candidate)).filter(Boolean)
          : [];
        anySourceSucceeded = true;

        for (const item of normalizedItems) {
          const existing = mergedFresh.get(item.key);
          if (!existing || source.weight > existing.weight || item.entry.ts > existing.entry.ts) {
            mergedFresh.set(item.key, { weight: source.weight, entry: item.entry });
          }
          for (const alias of item.aliases) {
            freshAliases[alias] = item.key;
          }
        }

        freshUpdateCount += normalizedItems.length;
        anySourceFetched = anySourceFetched || normalizedItems.length > 0;
        this.registerSourceSuccess(source, normalizedItems.length);
        sourceResults.push(this.buildSourceResult(source, "ok", normalizedItems.length));
      } catch (error) {
        this.registerSourceFailure(source, error);
        sourceResults.push(this.buildSourceResult(source, "error", 0));
      }
    }

    const nextPrices = {};
    for (const [key, value] of mergedFresh.entries()) {
      nextPrices[key] = { ...value.entry };
    }
    for (const [key, value] of Object.entries(this.state.prices)) {
      if (!nextPrices[key]) nextPrices[key] = { ...value };
    }

    const nextAliases = {};
    for (const [alias, key] of Object.entries(this.state.aliases)) {
      if (nextPrices[key]) nextAliases[alias] = key;
    }
    for (const [alias, key] of Object.entries(freshAliases)) {
      if (nextPrices[key]) nextAliases[alias] = key;
    }
    for (const [key, entry] of Object.entries(nextPrices)) {
      this.attachKnownAliases(nextAliases, key, entry);
    }

    if (anySourceSucceeded || Object.keys(nextPrices).length > 0) {
      this.state.prices = nextPrices;
      this.state.aliases = nextAliases;
      if (anySourceSucceeded) this.state.updatedAt = startedAt;
      await this.saveSnapshot();
    }

    for (const result of sourceResults) {
      const nextRetry = result.nextRetryAt ? new Date(result.nextRetryAt).toISOString() : "-";
      console.log(
        `[prices] source=${result.name} status=${result.status} count=${result.count} health=${result.health} nextRetry=${nextRetry}${result.error ? ` error=${result.error}` : ""}`,
      );
    }

    console.log(`[prices] refresh end updated=${freshUpdateCount} total=${Object.keys(this.state.prices).length} updatedAt=${this.state.updatedAt || 0}`);

    return {
      ok: true,
      status: anySourceSucceeded ? "completed" : "cached_only",
      startedAt,
      updatedAt: this.state.updatedAt,
      count: Object.keys(this.state.prices).length,
      updated: freshUpdateCount,
      stale: this.isStale(),
      sources: sourceResults,
    };
  }

  buildSourceResult(source, status, count) {
    return {
      name: source.name,
      status,
      count,
      health: this.computeHealth(source),
      failCount: source.failCount,
      nextRetryAt: source.nextRetryAt,
      cooldownMs: source.cooldownMs,
      error: source.lastError || "",
    };
  }

  registerSourceSuccess(source, count) {
    source.failCount = 0;
    source.lastFailAt = 0;
    source.nextRetryAt = 0;
    source.cooldownMs = 0;
    source.lastError = "";
    source.lastStatus = "ok";
    source.lastSuccessAt = Date.now();
    source.lastResultCount = Math.max(0, Number(count || 0));
  }

  registerSourceFailure(source, error) {
    const now = Date.now();
    source.failCount += 1;
    source.lastFailAt = now;
    source.lastResultCount = 0;

    const status = Number(error?.status || 0);
    let cooldownMs = Math.max(60_000, pickBackoffMs(RETRY_DEFAULT_MS, source.failCount));
    let lastError = String(error?.message || "source failed");
    let lastStatus = "error";

    if (status === 401) {
      cooldownMs = Math.max(this.refreshIntervalMs, 24 * 60 * 60_000);
      lastError = "invalid key";
      lastStatus = "disabled";
      console.warn(`[prices] source=${source.name} invalid key; disabling for ${Math.round(cooldownMs / 3600000)}h`);
    } else if (status === 403) {
      cooldownMs = 6 * 60 * 60_000;
      lastStatus = "forbidden";
    } else if (status === 429) {
      cooldownMs = Math.max(1_000, Number(error?.retryAfterMs) || pickBackoffMs(RETRY_429_MS, source.failCount));
      lastStatus = "rate_limited";
    } else if (status >= 500) {
      cooldownMs = Math.max(60_000, pickBackoffMs(RETRY_5XX_MS, source.failCount));
      lastStatus = "server_error";
    }

    source.cooldownMs = cooldownMs;
    source.nextRetryAt = now + cooldownMs;
    source.lastError = lastError.slice(0, 240);
    source.lastStatus = lastStatus;
  }

  async fetchJson(url, { method = "GET", headers = {}, body, timeoutMs = HTTP_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        let snippet = "";
        try {
          snippet = (await response.text()).slice(0, 240);
        } catch {
          snippet = "";
        }

        throw createHttpError(
          `${method} ${url} failed with ${response.status}${snippet ? `: ${snippet}` : ""}`,
          {
            status: response.status,
            retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
          },
        );
      }

      try {
        return await response.json();
      } catch (error) {
        throw createHttpError(`Invalid JSON from ${url}`, {
          status: 502,
          cause: error,
        });
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw createHttpError(`Request timeout for ${url}`, { status: 504 });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchTelegramResalePrices() {
    const apiId = Number(process.env.RELAYER_API_ID || process.env.TG_API_ID || 0);
    const apiHash = String(process.env.RELAYER_API_HASH || process.env.TG_API_HASH || "").trim();
    const session = String(process.env.RELAYER_SESSION || "").trim();

    if (!apiId || !apiHash || !session) {
      throw createHttpError("Telegram resale source is not configured", { status: 503 });
    }

    const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
      connectionRetries: 5,
    });
    client.setLogLevel("none");
    const out = [];
    const ResaleMethod = resolveTelegramResaleMethod();

    try {
      await client.connect();

      const baseResponse = await client.invoke(new Api.payments.GetStarGifts({ hash: 0 }));
      const gifts = Array.isArray(baseResponse?.gifts) ? baseResponse.gifts : [];

      for (const gift of gifts) {
        const title = String(gift?.title || gift?.name || "").trim();
        const giftId = gift?.id ?? gift?.giftId ?? gift?.gift_id ?? null;
        if (!title && giftId == null) continue;

        let priceTon = null;
        let priceStars = null;

        const resellMinStars = toJsNumber(gift?.resellMinStars ?? gift?.resell_min_stars ?? null);
        if (Number.isFinite(resellMinStars) && resellMinStars > 0) {
          priceStars = resellMinStars;
        }

        if (!priceStars && giftId != null && ResaleMethod) {
          try {
            const resale = await client.invoke(new ResaleMethod({
              giftId,
              offset: "",
              limit: 1,
              sortByPrice: true,
            }));

            const listings = Array.isArray(resale?.gifts) ? resale.gifts : [];
            if (listings.length > 0) {
              const amounts = Array.isArray(listings[0]?.resellAmount)
                ? listings[0].resellAmount
                : Array.isArray(listings[0]?.resell_amount)
                  ? listings[0].resell_amount
                  : [];

              for (const amount of amounts) {
                const parsed = parseTelegramAmount(amount);
                if (!parsed) continue;
                if (parsed.type === "TON") {
                  priceTon = !priceTon ? parsed.value : Math.min(priceTon, parsed.value);
                } else if (parsed.type === "STARS") {
                  priceStars = !priceStars ? parsed.value : Math.min(priceStars, parsed.value);
                }
              }
            }

            await sleep(TELEGRAM_JITTER_MS + Math.floor(Math.random() * TELEGRAM_JITTER_SPREAD_MS));
          } catch (error) {
            const text = String(error?.message || error || "");
            const floodWait = text.match(/FLOOD_WAIT[_\s](\d+)/i);
            if (floodWait) {
              throw createHttpError(text, {
                status: 429,
                retryAfterMs: Math.max(1_000, Number(floodWait[1]) * 1000),
              });
            }
            if (/STARGIFT_INVALID/i.test(text)) continue;
            if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|AUTH_KEY_INVALID|USER_DEACTIVATED/i.test(text)) {
              throw createHttpError(text, { status: 401 });
            }
            throw createHttpError(text, { status: 503 });
          }
        }

        if ((!Number.isFinite(priceTon) || priceTon <= 0) && (!Number.isFinite(priceStars) || priceStars <= 0)) {
          continue;
        }

        out.push({
          key: giftId == null ? title : null,
          giftId,
          name: title || (giftId == null ? "" : `Gift ${giftId}`),
          aliases: [title],
          price: Number.isFinite(priceTon) && priceTon > 0 ? priceTon : priceStars,
          currency: Number.isFinite(priceTon) && priceTon > 0 ? "TON" : "STARS",
          source: "telegram-resale",
          ts: Date.now(),
        });
      }

      return out;
    } catch (error) {
      if (error?.status) throw error;
      const message = String(error?.message || error || "telegram source failed");
      if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|AUTH_KEY_INVALID|USER_DEACTIVATED/i.test(message)) {
        throw createHttpError(message, { status: 401 });
      }
      throw createHttpError(message, { status: 503 });
    } finally {
      if (!ResaleMethod && !warnedMissingTelegramResaleMethod) {
        warnedMissingTelegramResaleMethod = true;
        console.warn("[prices] telegram-resale fallback mode: current GramJS build has no GetResaleStarGifts constructor; using resellMinStars only.");
      }
      try {
        await client.disconnect();
      } catch {
        // no-op
      }
    }
  }

  async fetchGiftAssetPrices() {
    const baseUrl = String(process.env.GIFTASSET_BASE || "https://giftasset.pro").replace(/\/+$/, "");
    const apiKey = String(process.env.GIFTASSET_API_KEY || process.env.GIFTASSET_KEY || "").trim();
    const headers = {
      accept: "application/json",
      "user-agent": "WildGift/price-manager",
    };

    if (apiKey) {
      headers["x-api-key"] = apiKey;
      headers.authorization = `Bearer ${apiKey}`;
    }

    const json = await this.fetchJson(`${baseUrl}/api/v1/gifts/get_gifts_price_list`, {
      headers,
      timeoutMs: Math.max(3_000, Number(process.env.GIFTASSET_TIMEOUT_MS || HTTP_TIMEOUT_MS) || HTTP_TIMEOUT_MS),
    });

    const floors = json?.collection_floors;
    if (!floors || typeof floors !== "object") {
      throw createHttpError("GiftAsset response missing collection_floors", { status: 502 });
    }

    const out = [];
    for (const [name, value] of Object.entries(floors)) {
      const best = pickBestGiftAssetFloor(value);
      if (!best) continue;
      out.push({
        key: name,
        name,
        aliases: [name],
        price: best.price,
        currency: "TON",
        source: `giftasset:${best.provider}`,
        ts: Date.now(),
      });
    }

    return out;
  }

  getTonCollectionMap() {
    const raw = String(
      process.env.PRICE_SOURCE_TON_COLLECTIONS ||
      process.env.TONAPI_COLLECTION_MAP ||
      "",
    ).trim();

    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed;
    } catch {
      console.warn("[prices] invalid PRICE_SOURCE_TON_COLLECTIONS JSON");
      return {};
    }
  }

  async fetchTonApiPrices() {
    const token = String(process.env.TONAPI_API_KEY || "").trim();
    const headers = {
      accept: "application/json",
      "user-agent": "WildGift/price-manager",
    };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const collections = this.getTonCollectionMap();
    const out = [];

    for (const [inputKey, config] of Object.entries(collections)) {
      const value = typeof config === "string" ? { address: config } : (config || {});
      const address = String(value.address || value.collection || "").trim();
      const displayName = String(value.name || inputKey).trim();
      if (!address) continue;

      const url = `https://tonapi.io/v2/nfts/collections/${encodeURIComponent(address)}/items?limit=50&offset=0`;
      const json = await this.fetchJson(url, { headers });
      const items = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.nft_items)
          ? json.nft_items
          : [];

      let bestTon = null;
      for (const item of items) {
        const tokenName = String(
          item?.sale?.price?.token_name ||
          item?.sale?.price?.tokenName ||
          item?.price?.token_name ||
          item?.price?.tokenName ||
          "TON",
        ).toUpperCase();
        if (tokenName && tokenName !== "TON" && tokenName !== "TONCOIN") continue;

        const priceTon =
          parseTonPrice(item?.sale?.full_price) ??
          parseTonPrice(item?.sale?.fullPrice) ??
          parseTonPrice(item?.sale?.price?.value) ??
          parseTonPrice(item?.sale?.price?.amount) ??
          parseTonPrice(item?.full_price) ??
          parseTonPrice(item?.fullPrice) ??
          parseTonPrice(item?.price?.value) ??
          parseTonPrice(item?.price?.amount) ??
          parseTonPrice(item?.price);

        if (!Number.isFinite(priceTon) || priceTon <= 0) continue;
        bestTon = bestTon == null ? priceTon : Math.min(bestTon, priceTon);
      }

      if (Number.isFinite(bestTon) && bestTon > 0) {
        out.push({
          key: inputKey,
          name: displayName,
          aliases: [displayName, inputKey],
          price: bestTon,
          currency: "TON",
          source: "tonapi",
          ts: Date.now(),
        });
      }

      await sleep(100);
    }

    return out;
  }
}

export const priceManager = new PriceManager();
export default priceManager;
