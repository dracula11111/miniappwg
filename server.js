// server.js - CLEAN VERSION
// IMPORTANT (ESM): .env must be loaded BEFORE importing database-pg.js, otherwise it will see empty process.env.

import "dotenv/config";

import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { createServer } from 'http';

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
const httpServer = createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT = process.env.PORT || 3000; // port





// ==============================
// CRASH GAME WebSocket Server
// ==============================
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ noServer: true });
const wheelWss = new WebSocketServer({ noServer: true });

const crashGame = {
  phase: 'betting',
  phaseStart: Date.now(),
  roundId: 1,
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
    crashPoint: (crashGame.phase === 'crash' || crashGame.phase === 'wait') ? crashGame.crashPoint : null,
    currentMult: crashGame.currentMult,
    players: crashGame.players,
    history: crashGame.history.slice(0, 15)
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

  // берём первые 8 байт → число
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

function startBetting() {
  rotateServerSeed();
  crashGame.nonce = 0;

  // Cleanup any leftovers (safety)
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

  crashGame.phase = 'betting';
  crashGame.phaseStart = Date.now();
  crashGame.roundId++;
  crashGame.currentMult = 1.0;
  crashGame.crashPoint = generateCrashPoint();
  crashGame.players = [];

  console.log(`[Crash] Round ${crashGame.roundId} betting started, will crash at ${crashGame.crashPoint.toFixed(2)}x`);

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
  // Cleanup betting timers (safety)
  if (crashGame.phaseTimeout) {
    clearTimeout(crashGame.phaseTimeout);
    crashGame.phaseTimeout = null;
  }
  if (crashGame.bettingInterval) {
    clearInterval(crashGame.bettingInterval);
    crashGame.bettingInterval = null;
  }
  if (crashGame.tickInterval) {
    clearInterval(crashGame.tickInterval);
    crashGame.tickInterval = null;
  }

    
  

  crashGame.phase = 'run';
  crashGame.phaseStart = Date.now();
  crashGame.currentMult = 1.0;

  console.log(`[Crash] Round ${crashGame.roundId} running with ${crashGame.players.length} players`);

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
  if (crashGame.tickInterval) {
    clearInterval(crashGame.tickInterval);
    crashGame.tickInterval = null;
  }
  
  if (crashGame.phaseTimeout) {
    clearTimeout(crashGame.phaseTimeout);
    crashGame.phaseTimeout = null;
  }

  crashGame.phase = 'crash';
  crashGame.currentMult = crashGame.crashPoint;
  
  console.log(`[Crash] Round ${crashGame.roundId} crashed at ${crashGame.crashPoint.toFixed(2)}x`);
  
  crashGame.history.unshift(crashGame.crashPoint);
  if (crashGame.history.length > 20) crashGame.history.length = 20;
  
  broadcastGameState();
  
  crashGame.phaseTimeout = setTimeout(() => {
    crashGame.phase = 'wait';
    broadcastGameState();
    setTimeout(startBetting, 2000);
  }, 2000);
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('[Crash WS] Client connected');
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  // Send current state immediately
  wsSendSafe(ws, JSON.stringify(buildGameState()));

ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'placeBet') {
        if (crashGame.phase !== 'betting') {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Betting closed' }));
          return;
        }
        
        const existing = crashGame.players.find(p => p.userId === msg.userId);
        if (existing) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Already placed bet' }));
          return;
        }
        
        crashGame.players.push({
          userId: msg.userId,
          name: msg.userName || 'Player',
          avatar: msg.userAvatar || null,
          amount: msg.amount,
          currency: msg.currency,
          claimed: false,
          claimMult: null
        });
        
        console.log(`[Crash] ${msg.userName} bet ${msg.amount} ${msg.currency}`);
        
        wsSendSafe(ws, JSON.stringify({ type: 'betPlaced', userId: msg.userId }));
        broadcastGameState();
      }
      
      else if (msg.type === 'claim') {
        if (crashGame.phase !== 'run') {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Cannot claim now' }));
          return;
        }
        
        const player = crashGame.players.find(p => p.userId === msg.userId);
        if (!player) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'No active bet' }));
          return;
        }
        
        if (player.claimed) {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Already claimed' }));
          return;
        }
        
        player.claimed = true;
        player.claimMult = crashGame.currentMult;
        
        console.log(`[Crash] ${player.name} claimed at ${crashGame.currentMult.toFixed(2)}x`);
        
        wsSendSafe(ws, JSON.stringify({ type: 'claimed', userId: msg.userId, mult: crashGame.currentMult }));
        broadcastGameState();
      }
      
    } catch (e) {
      console.error('[Crash WS] Message error:', e);
    }
  });

  ws.on('close', () => {
    console.log('[Crash WS] Client disconnected');
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


// Start first round
startBetting();

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
const WHEEL_BONUS_TIME_BY_TYPE = {
  '50&50': 14000,
  'Loot Rush': 15000,
  'Wild Time': 15000
};
const WHEEL_BONUS_FALLBACK_MS = 15000;


const WHEEL_ALLOWED = new Set(WHEEL_ORDER);

const wheelGame = {
  phase: 'betting',           // betting | spin | bonus | result
  phaseStart: Date.now(),
  roundId: 0,
  players: new Map(),         // userId -> { userId,name,avatar,currency,totalAmount,segments:Map }
  history: [],
  spin: null,                 // { sliceIndex,type,accelMs,decelMs,extraTurns,spinStartAt,spinTotalMs }
  bonus: null,               // { id,type,startedAt,durationMs,endsAt }
  phaseTimeout: null
};

function normWheelSeg(seg) {
  if (!seg) return null;
  const s = String(seg).trim();
  if (s === '50/50' || s === '50-50') return '50&50';
  return s;
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

  // 🔥 КРИТИЧНО: всегда передаём актуальное состояние бонуса с учётом текущего времени
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
      elapsedMs: elapsed,        // 🔥 ДОБАВЛЕНО: сколько прошло
      remainingMs: remaining     // 🔥 ДОБАВЛЕНО: сколько осталось
    };
  }

  return {
    type: 'wheelState',
    serverTime: now,
    bettingTimeMs: WHEEL_BETTING_TIME,
    bettingLeftMs,
    phase: wheelGame.phase,
    phaseStart: wheelGame.phaseStart,
    roundId: wheelGame.roundId,
    spin: wheelGame.spin,
    bonus: bonusData,  // 🔥 используем обогащённые данные
    players: buildWheelPlayersArray(),
    history: wheelGame.history.slice(0, 20)
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

function wheelStartBetting() {
  wheelClearPhaseTimeout();

  wheelGame.phase = 'betting';
  wheelGame.phaseStart = Date.now();
  wheelGame.roundId += 1;
  wheelGame.spin = null;
  wheelGame.bonus = null;
  wheelGame.players.clear();

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

  const now = Date.now();
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

  // Normal result
  wheelStartResultPhase();
}

function wheelStartResultPhase() {
  wheelClearPhaseTimeout();

  wheelGame.phase = 'result';
  wheelGame.phaseStart = Date.now();
  wheelGame.bonus = null;

  broadcastWheelState();

  wheelGame.phaseTimeout = setTimeout(() => {
    wheelStartBetting();
  }, WHEEL_RESULT_TIME);
}

function wheelStartBonus(type) {
  wheelClearPhaseTimeout();

  const now = Date.now();
  const durationMs = Number(WHEEL_BONUS_TIME_BY_TYPE[type]) || WHEEL_BONUS_FALLBACK_MS;

  wheelGame.phase = 'bonus';
  wheelGame.phaseStart = now;
  wheelGame.bonus = {
    id: `${wheelGame.roundId}:${type}:${now}`,
    type,
    startedAt: now,
    durationMs,
    endsAt: now + durationMs
  };

  broadcastWheelState();

  wheelGame.phaseTimeout = setTimeout(() => {
    wheelEndBonus();
  }, durationMs);
}

function wheelEndBonus() {
  wheelClearPhaseTimeout();

  // After bonus: short result phase, then next round
  wheelGame.bonus = null;
  wheelStartResultPhase();
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
        if (wheelGame.phase !== 'betting') {
          wsSendSafe(ws, JSON.stringify({ type: 'error', message: 'Betting closed' }));
          return;
        }

        const userId = String(msg.userId || '').trim();
        if (!userId) return;

        const seg = normWheelSeg(msg.segment);
        if (!seg || !WHEEL_ALLOWED.has(seg)) return;

        const currency = (String(msg.currency || 'ton').toLowerCase() === 'stars') ? 'stars' : 'ton';
        let amount = Number(msg.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) return;

        if (currency === 'stars') amount = Math.round(amount);
        else amount = Math.round(amount * 100) / 100;

        const name = String(msg.userName || 'Player').slice(0, 64);
        const avatar = msg.userAvatar ? String(msg.userAvatar).slice(0, 500) : null;

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

        broadcastWheelState();
      }

      if (msg.type === 'clearBets') {
        if (wheelGame.phase !== 'betting') return;
        const userId = String(msg.userId || '').trim();
        if (!userId) return;
        wheelGame.players.delete(userId);
        broadcastWheelState();
      }

    } catch (e) {
      console.error('[Wheel WS] Message error:', e);
    }
  });
});

// Start shared loop
wheelStartBetting();




// --- Base settings
app.set("trust proxy", true);
app.use(express.json({ limit: "10mb" }));
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
// NOTE: Per-process cache. Resets on server restart.
const GIFT_REFRESH_MS = 60 * 60 * 1000; // 1 hour
const GIFT_CATALOG_REFRESH_MS = 6 * 60 * 60 * 1000; // every 6 hours (catalog changes not that often)
const GIFT_REQUEST_TIMEOUT_MS = 15_000;

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
        "Winter Wreath"
];
  
 // tracked gift collection names (strings)
let giftsPrices = new Map(); // name -> { priceTon, updatedAt, source }
let giftsLastUpdate = 0;
let giftsCatalogLastUpdate = 0;

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

function normalizeGiftName(s) {
  return String(s || "").trim();
}

// ==============================
// TON -> USD -> Telegram Stars RATE (in-memory)
// ==============================
// Used to show "fair" Stars prices in the mini-app based on TON market price.
// 1 Star ~= $0.013 (Telegram official for in-app purchases). You can override via env.
const STARS_USD = Number(process.env.STARS_USD || process.env.STARS_USD_PRICE || process.env.STAR_USD || 0.013);
const TON_USD_REFRESH_MS = 24 * 60 * 60 * 1000; // 24h
const TON_USD_TIMEOUT_MS = 12_000;

let tonUsdCache = {
  tonUsd: null,      // number
  updatedAt: 0,      // ms
  source: "",        // string
  error: ""          // string
};

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

  try {
    const r = await fetchTonUsdFromCoinGecko();
    tonUsdCache = {
      tonUsd: r.tonUsd,
      updatedAt: now,
      source: r.source,
      error: ""
    };
    console.log(`[rates] ✅ TON/USD updated: ${r.tonUsd} (${r.source})`);
  } catch (e) {
    tonUsdCache = {
      ...tonUsdCache,
      error: String(e?.message || e)
    };
    console.warn("[rates] ⚠️ TON/USD update failed:", tonUsdCache.error);
  }

  return tonUsdCache;
}

async function getTonUsdRate() {
  return await refreshTonUsdRate(false);
}

function tonToStars(tonAmount, tonUsd = tonUsdCache.tonUsd) {
  const ton = Number(tonAmount);
  const usd = Number(tonUsd);
  if (!Number.isFinite(ton) || ton <= 0) return null;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (!Number.isFinite(STARS_USD) || STARS_USD <= 0) return null;

  const stars = (ton * usd) / STARS_USD;

  // Intentionally round DOWN to avoid "overpriced" Stars labels.
  return Math.max(1, Math.floor(stars + 1e-9));
}

function starsPerTon(tonUsd = tonUsdCache.tonUsd) {
  const usd = Number(tonUsd);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  if (!Number.isFinite(STARS_USD) || STARS_USD <= 0) return null;
  return usd / STARS_USD;
}

// Scheduler: refresh TON/USD once a day with jitter.
(function startTonUsdScheduler() {
  const firstDelay = 3000 + Math.floor(Math.random() * 20_000);
  setTimeout(async () => {
    await refreshTonUsdRate(true);
    setInterval(() => refreshTonUsdRate(true), TON_USD_REFRESH_MS);
  }, firstDelay);
})();


// (A) Каталог:
// В Portals есть открытый endpoint для поиска коллекций, но полноценный "лист всех коллекций"
// обычно завязан на mini-app/auth. Поэтому в MVP держим список отслеживаемых подарков вручную
// (см. giftsCatalog выше). Если захочешь мониторить вообще ВСЕ подарки — добавим отдельный каталог.
async function refreshGiftsCatalogStatic() {
  giftsCatalog = (Array.isArray(giftsCatalog) ? giftsCatalog : []).map(normalizeGiftName).filter(Boolean);
  giftsCatalogLastUpdate = Date.now();
  return giftsCatalog.length;
}

// (B) Цены: Portals collections endpoint (без auth) — берём floor_price по поиску.
// Источник: пример использования /api/collections?search=...&limit=10 -> collections[0].floor_price
// Фоллбэк: если портал недоступен, используем market.tonnel.network
async function refreshGiftsPricesFromPortals() {
  if (!giftsCatalog.length) {
    await refreshGiftsCatalogStatic();
  }

  const now = Date.now();
  let updatedCount = 0;

  for (const giftName of giftsCatalog) {
    const q = normalizeGiftName(giftName);
    if (!q) continue;

    const sources = [
      {
        name: 'portal-market.com',
        url: `https://portal-market.com/api/collections?search=${encodeURIComponent(q)}&limit=10`
      },
      {
        name: 'market.tonnel.network',
        url: `https://market.tonnel.network/api/collections?search=${encodeURIComponent(q)}&limit=10`
      }
    ];

    let priceFound = false;

    for (const source of sources) {
      if (priceFound) break;

      try {
        const res = await fetchWithTimeout(source.url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) {
          console.warn(`[gifts] ${source.name} returned status ${res.status} for ${q}`);
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
        console.log(`[gifts] ✅ Updated ${giftName} from ${source.name}: ${price} TON`);
      } catch (e) {
        // не падаем, просто пропускаем этот источник и пробуем следующий
        console.warn(`[gifts] ${source.name} fetch failed for ${q} -`, e?.message || e);
      }
    }

    if (!priceFound) {
      console.warn(`[gifts] ⚠️  All sources failed for ${giftName}`);
    }

    // небольшая пауза, чтобы не долбить сервисы
    await sleep(150);
  }

  giftsLastUpdate = now;
  return updatedCount;
}

async function refreshGiftsAll() {
  // каталог — реже (но у нас он статический, это просто "sanity" + метка времени)
  if (!giftsCatalogLastUpdate || Date.now() - giftsCatalogLastUpdate > GIFT_CATALOG_REFRESH_MS) {
    try {
      await refreshGiftsCatalogStatic();
      console.log(`[gifts] catalog loaded: ${giftsCatalog.length}`);
    } catch (e) {
      console.warn('[gifts] catalog refresh failed:', e?.message || e);
    }
  }

  // цены — раз в час
  try {
    const n = await refreshGiftsPricesFromPortals();
    console.log(`[gifts] prices updated: ${n} records (tracked=${giftsCatalog.length})`);
  } catch (e) {
    console.warn('[gifts] prices refresh failed (keeping old cache):', e?.message || e);
  }
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

// GET inventory (NFTs) for a user
app.get("/api/user/inventory", requireTelegramUser, async (req, res) => {
  try {
    const userId = String(req.tg.user.id);
    const items = await inventoryGet(userId);
    return res.json({ ok: true, items, nfts: items });
  } catch (e) {
    console.error("[Inventory] get error:", e);
    return res.status(500).json({ ok: false, error: "inventory error" });
  }
});



// Add won NFTs to inventory (idempotent via claimId)
// Add inventory items (NFTs/Gifts) — Telegram user OR relayer secret.
// IMPORTANT: never trust userId from browser; for Telegram users we take id from initData.
async function handleInventoryAdd(req, res) {
  try {
    const { userId: bodyUserId, items, item, claimId } = req.body || {};

    const list = Array.isArray(items) ? items : (item ? [item] : []);
    if (!list.length) return res.status(400).json({ ok: false, error: "items required" });

    let uid = "";
    if (req.isRelayer) {
      uid = String(bodyUserId || "");
      if (!uid) return res.status(400).json({ ok: false, error: "userId required" });
    } else {
      uid = String(req.tg?.user?.id || "");
      if (!uid) return res.status(403).json({ ok: false, error: "No user in initData" });
      // Optional: if client sent userId, ensure it matches
      if (bodyUserId && String(bodyUserId) !== uid) {
        return res.status(403).json({ ok: false, error: "userId mismatch" });
      }
    }

    const result = await inventoryAdd(uid, list, claimId);
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
app.post("/api/inventory/sell", requireTelegramUser, async (req, res) => {
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
app.post("/api/inventory/sell-all", requireTelegramUser, async (req, res) => {
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


// Admin: add gifts to inventory (optional). If ADMIN_KEY is set, require header x-admin-key.
app.post("/api/admin/inventory/add", async (req, res) => {
  try {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) {
      return res.status(500).json({ ok: false, error: "ADMIN_KEY not set" });
    }
    const hdr = String(req.headers["x-admin-key"] || "");
    if (hdr !== adminKey) return res.status(403).json({ ok: false, error: "forbidden" });
    

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
      const maxAgeSec = Math.max(60, Math.min(30*24*60*60, Number(process.env.TG_INITDATA_MAX_AGE_SEC || 86400) || 86400));
  const check = verifyInitData(initData, process.env.BOT_TOKEN, maxAgeSec);
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
    const maxAgeSec = Math.max(60, Math.min(30*24*60*60, Number(process.env.TG_INITDATA_MAX_AGE_SEC || 86400) || 86400));
  const check = verifyInitData(initData, process.env.BOT_TOKEN, maxAgeSec);
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
  return token === secret || alt === secret;
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


// List (new)
app.get("/api/market/items/list", async (req, res) => {
  try {
    const items = await readMarketItems();
    const rate = await getTonUsdRate();
    const tonUsd = rate?.tonUsd;

    const outItems = items.map((it) => {
      if (!it || typeof it !== "object") return it;
      const priceTon = (it.priceTon == null ? null : Number(it.priceTon));
      const priceStars = (tonUsd && Number.isFinite(priceTon) && priceTon > 0) ? tonToStars(priceTon, tonUsd) : null;
      return { ...it, priceStars };
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
      const priceTon = (it.priceTon == null ? null : Number(it.priceTon));
      const priceStars = (tonUsd && Number.isFinite(priceTon) && priceTon > 0) ? tonToStars(priceTon, tonUsd) : null;
      return { ...it, priceStars };
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

    const id = safeMarketString(item.id, 96) || `m_${Date.now()}`;
    const name = safeMarketString(item.name, 120) || "Gift";
    const number = safeMarketString(item.number, 32) || "";
    const createdAt = Number(item.createdAt || Date.now());
    const priceTon = (item.priceTon == null ? null : Number(item.priceTon));

    // image: allow either a normal /images/... path OR a dataURL in image/imageData
    const data = String(item.imageData || "").trim() || (typeof item.image === "string" && item.image.trim().startsWith("data:") ? item.image.trim() : "");
    let image = safeMarketImagePath(item.image);
    if (data) {
      const saved = saveMarketImageFromData(data, name);
      if (saved) image = saved;
    }

    // preview: pre-rendered composite (Fragment preferred)
    let previewUrl = safeMarketPreviewRef(item.previewUrl);
    if (!previewUrl) previewUrl = fragmentMediumPreviewUrlFromSlug(item?.tg?.slug);


    const out = {
      ...item,
      id, name, number,
      image,
      previewUrl,
      priceTon: Number.isFinite(priceTon) ? priceTon : null,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    };
    delete out.imageData;
    delete out.previewData;

    const saved = await withMarketLock(async () => {
      const items = await readMarketItems();
    
      // дедуп: если такой id уже есть — убираем старую запись
      const filtered = items.filter(x => String(x?.id) !== String(out.id));
      filtered.unshift(out);
    
      const MAX = Math.max(10, Math.min(5000, Number(process.env.MARKET_MAX_ITEMS) || 1000));
      if (filtered.length > MAX) filtered.length = MAX;
    
      const ok = await writeMarketItems(filtered);
      if (!ok) throw new Error("write failed");
      return out;
    });
    
    return res.json({ ok: true, item: saved });
    
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


// ====== SPA fallback ======"
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

    return res.json({
      ok: !!tonUsd,
      tonUsd: tonUsd || null,
      starsUsd: STARS_USD,
      starsPerTon: starsPerTon(tonUsd),
      updatedAt: rate?.updatedAt || 0,
      source: rate?.source || "",
      error: tonUsd ? null : (rate?.error || "rate unavailable")
    });
  } catch (e) {
    console.error("[rates] endpoint error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});


// GET price for a single gift (by name)
app.get("/api/gifts/price", async (req, res) => {
  // dev-friendly CORS
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = normalizeGiftName(req.query?.name || req.query?.q || "");
  if (!q) return res.status(400).json({ ok: false, error: "name required" });

  // Resolve name from catalog case-insensitively
  const foundName = giftsCatalog.find(n => String(n).toLowerCase() === String(q).toLowerCase()) || q;
  const p = giftsPrices.get(foundName);

  if (!p) {
    return res.status(404).json({ ok: false, error: "gift not found (or price not cached yet)", name: foundName });
  }

  const rate = await getTonUsdRate();
  const tonUsd = rate?.tonUsd;

  return res.json({
    ok: true,
    item: { name: foundName, ...p, priceStars: tonUsd ? tonToStars(p.priceTon, tonUsd) : null },
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

  const rate = await getTonUsdRate();
  const tonUsd = rate?.tonUsd;

  const list = [];
  for (const name of giftsCatalog) {
    const p = giftsPrices.get(name);
    if (!p) continue;
    list.push({ name, ...p, priceStars: tonUsd ? tonToStars(p.priceTon, tonUsd) : null });
  }

  return res.json({
    ok: true,
    updatedAt: giftsLastUpdate,
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
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🎮 WildGift Server Running          ║
║   Port: ${PORT}                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}      ║
║   🎲 Crash WebSocket: /ws/crash       ║
╚═══════════════════════════════════════╝
  `);
  
  if (!process.env.BOT_TOKEN) {
    console.warn('⚠️  WARNING: BOT_TOKEN not set in .env');
  }
  
  console.log(`✅ Crash game running`);
});


// ====== GIFT PRICES SCHEDULER ======
(function startGiftScheduler() {
  // стартуем не мгновенно, а в пределах 5–25 секунд (чтобы меньше совпадать с другими)
  const firstDelay = 5000 + Math.floor(Math.random() * 20000);

  setTimeout(async () => {
    await refreshGiftsAll();
    setInterval(refreshGiftsAll, GIFT_REFRESH_MS);
  }, firstDelay);
})();


app.get('/api/gifts/portals-search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ ok:false, error:'q required' });

  const url = `https://portal-market.com/api/collections?search=${encodeURIComponent(q)}&limit=10`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j = await r.json();

  const cols = Array.isArray(j?.collections) ? j.collections : [];
  // Backward/forward compatible: return both `collections` and `results`
  res.json({
    ok: true,
    q,
    collections: cols,
    results: cols.map(c => ({
      name: c.name,
      short_name: c.short_name,
      floor_price: c.floor_price
    }))
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

function requireTelegramUser(req, res, next) {
  const initData = getInitDataFromReq(req);
  if (!initData) return res.status(401).json({ ok: false, error: "initData required" });
  if (!process.env.BOT_TOKEN) return res.status(500).json({ ok: false, error: "BOT_TOKEN not set" });

  const maxAgeSec = Math.max(60, Math.min(30*24*60*60, Number(process.env.TG_INITDATA_MAX_AGE_SEC || 86400) || 86400));
  const check = verifyInitData(initData, process.env.BOT_TOKEN, maxAgeSec);
  if (!check.ok) return res.status(403).json({ ok: false, error: "Bad initData" });

  let user = null;
  try { user = JSON.parse(check.params.user || "null"); } catch {}
  if (!user?.id) return res.status(403).json({ ok: false, error: "No user in initData" });

  req.tg = { user, initData, params: check.params };
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