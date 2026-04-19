(() => {
  "use strict";

  const PAGE_ID = "matchPage";
  const STORAGE_KEYS = ["wt_match_endless_v1", "wt_combo_endless_v2"];
  const MAIN_BG = "/images/match/backgrounds/matchMainback.webp";
  const LEVEL_BG = "/images/match/levels/lvl1back.webp";
  const MATCH_LOGO = "/images/match/MatchLogo.webp";
  const BOOM_IMAGE = "/images/match/boom.webp";
  const PLAY_BUTTON = Object.freeze({
    ru: "/images/match/PlayButtonRu.webp",
    en: "/images/match/PlayButtonEng.webp"
  });
  const BOMB_ITEM = Object.freeze({ id: "bomb", src: "/images/match/bomb.webp" });
  const ITEM_DEFS = Object.freeze([
    { id: "bear", src: "/images/match/items/bear.webp" },
    { id: "bottle", src: "/images/match/items/bottle.webp" },
    { id: "cake", src: "/images/match/items/cake.webp" },
    { id: "cup", src: "/images/match/items/cup.webp" },
    { id: "diamond", src: "/images/match/items/diamond.webp" },
    { id: "flowers", src: "/images/match/items/flowers.webp" },
    { id: "gift", src: "/images/match/items/gift.webp" }
  ]);
  const ITEM_BY_ID = Object.freeze(
    [BOMB_ITEM, ...ITEM_DEFS].reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {})
  );
  const BOARD_ROWS = 8;
  const BOARD_COLS = 8;
  const MATCH_MIN = 3;
  const BOMB_BLAST_RADIUS = 2;
  const RANDOM_BOMB_DROP_CHANCE = 0.2;
  const SWAP_ANIMATION_MS = 220;
  const CLEAR_ANIMATION_MS = 240;
  const DROP_ANIMATION_MS = 280;
  const CASCADE_DELAY_MS = 170;
  const SWAP_REVERT_DELAY_MS = 40;
  const HINT_IDLE_MS = 4200;

  const state = {
    page: null,
    home: null,
    game: null,
    playImg: null,
    boardEl: null,
    particlesEl: null,
    board: [],
    selected: null,
    busy: false,
    pointer: null,
    wildCoin: 0,
    hintTimer: 0,
    hintPair: null,
    defaultLogoSrc: ""
  };

  function resolveUiLanguage() {
    const candidates = [];
    try { candidates.push(window.WT?.i18n?.getLanguage?.()); } catch {}
    try { candidates.push(document.body?.getAttribute?.("data-wt-lang")); } catch {}
    try { candidates.push(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code); } catch {}
    try { candidates.push(navigator.language); } catch {}

    for (const candidate of candidates) {
      const lang = String(candidate || "").trim().toLowerCase();
      if (!lang) continue;
      if (lang.startsWith("ru")) return "ru";
      if (lang.startsWith("en")) return "en";
    }
    return "en";
  }

  function getPlayButtonSrc() {
    return resolveUiLanguage() === "ru" ? PLAY_BUTTON.ru : PLAY_BUTTON.en;
  }

  function parseWildCoin(raw) {
    const value = Math.max(0, Math.round(Number(raw) || 0));
    return Number.isFinite(value) ? value : 0;
  }

  function readWildCoin() {
    for (const key of STORAGE_KEYS) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        return parseWildCoin(parsed?.wildCoin);
      } catch {}
    }
    return 0;
  }

  function emitWildCoin(value) {
    state.wildCoin = parseWildCoin(value);
    try {
      window.dispatchEvent(
        new CustomEvent("match:wildcoin-update", {
          detail: { wildCoin: value }
        })
      );
    } catch {}
  }

  function ensurePage() {
    let page = document.getElementById(PAGE_ID);
    if (!page) {
      page = document.createElement("main");
      page.id = PAGE_ID;
      page.className = "page";
      const appRoot = document.querySelector(".app") || document.body;
      const bottomNav = appRoot.querySelector(".bottom-nav") || document.querySelector(".bottom-nav");
      if (bottomNav) appRoot.insertBefore(page, bottomNav);
      else appRoot.appendChild(page);
    }

    if (!page.querySelector(".match-screen")) {
      page.innerHTML = `
        <section class="match-screen" aria-label="Match">
          <section class="match-home" data-match-home>
            <button class="match-home__play" type="button" data-match-start aria-label="Start Match">
              <img data-match-play-image src="${PLAY_BUTTON.en}" alt="Play" draggable="false" />
            </button>
          </section>
          <section class="match-game" data-match-game hidden aria-label="Match Level 1">
            <button class="match-game__close" type="button" data-match-close aria-label="Close Match">
              <img src="/icons/ui/close.svg" alt="" aria-hidden="true" draggable="false" />
            </button>
            <div class="match-game__center">
              <div class="match-game__board-wrap">
                <div class="match-game__board" data-match-board role="grid" aria-label="Match board"></div>
                <div class="match-game__particles" data-match-particles aria-hidden="true"></div>
              </div>
            </div>
          </section>
        </section>
      `;
    }

    return page;
  }

  function preloadMatchAssets() {
    const srcList = [
      MAIN_BG,
      LEVEL_BG,
      MATCH_LOGO,
      BOOM_IMAGE,
      PLAY_BUTTON.ru,
      PLAY_BUTTON.en,
      BOMB_ITEM.src,
      ...ITEM_DEFS.map((item) => item.src)
    ];
    srcList.forEach((src) => {
      const probe = new Image();
      probe.decoding = "async";
      probe.src = src;
    });
  }

  function inBounds(row, col) {
    return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
  }

  function cellKey(row, col) {
    return `${row}:${col}`;
  }

  function parseCellKey(key) {
    const parts = String(key || "").split(":");
    return { row: Number(parts[0]), col: Number(parts[1]) };
  }

  function randomItemId() {
    const index = Math.floor(Math.random() * ITEM_DEFS.length);
    return ITEM_DEFS[index]?.id || ITEM_DEFS[0].id;
  }

  function createCell(kind = randomItemId()) {
    return { kind };
  }

  function isBombKind(kind) {
    return String(kind || "") === BOMB_ITEM.id;
  }

  function createInitialBoard() {
    const board = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null));

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        let kind = randomItemId();
        while (
          (col >= 2 &&
            board[row][col - 1] &&
            board[row][col - 2] &&
            board[row][col - 1].kind === kind &&
            board[row][col - 2].kind === kind) ||
          (row >= 2 &&
            board[row - 1][col] &&
            board[row - 2][col] &&
            board[row - 1][col].kind === kind &&
            board[row - 2][col].kind === kind)
        ) {
          kind = randomItemId();
        }
        board[row][col] = createCell(kind);
      }
    }

    if (findMatchClusters(board).length > 0) {
      return createInitialBoard();
    }

    if (!boardHasPossibleMove(board)) {
      return createInitialBoard();
    }

    return board;
  }

  function boardHasPossibleMove(board) {
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const here = board[row][col];
        if (!here) continue;

        const neighbors = [
          { row, col: col + 1 },
          { row: row + 1, col }
        ];

        for (const next of neighbors) {
          if (!inBounds(next.row, next.col)) continue;
          const there = board[next.row][next.col];
          if (!there) continue;

          if (isBombKind(here.kind) || isBombKind(there.kind)) return true;
          swapCells(board, { row, col }, next);
          const hasMatch = findMatchClusters(board).length > 0;
          swapCells(board, { row, col }, next);
          if (hasMatch) return true;
        }
      }
    }
    return false;
  }

  function clearHintTimer() {
    if (!state.hintTimer) return;
    clearTimeout(state.hintTimer);
    state.hintTimer = 0;
  }

  function clearHint({ rerender = false } = {}) {
    const hadHint = !!state.hintPair;
    state.hintPair = null;
    if (hadHint && rerender && !state.busy) renderBoard();
  }

  function registerPlayerInteraction({ rerenderHint = false } = {}) {
    clearHintTimer();
    clearHint({ rerender: rerenderHint });
  }

  function findHintMove(board) {
    const hints = [];

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const here = board[row][col];
        if (!here) continue;

        const neighbors = [
          { row, col: col + 1 },
          { row: row + 1, col }
        ];

        for (const next of neighbors) {
          if (!inBounds(next.row, next.col)) continue;
          const there = board[next.row][next.col];
          if (!there) continue;

          if (isBombKind(here.kind) || isBombKind(there.kind)) {
            hints.push({ a: { row, col }, b: { row: next.row, col: next.col } });
            continue;
          }

          swapCells(board, { row, col }, next);
          const hasMatch = findMatchClusters(board).length > 0;
          swapCells(board, { row, col }, next);
          if (hasMatch) {
            hints.push({ a: { row, col }, b: { row: next.row, col: next.col } });
          }
        }
      }
    }

    if (!hints.length) return null;
    return hints[Math.floor(Math.random() * hints.length)] || hints[0] || null;
  }

  function scheduleHint() {
    clearHintTimer();
    if (state.game?.hidden || state.busy) return;

    state.hintTimer = window.setTimeout(() => {
      state.hintTimer = 0;
      if (state.game?.hidden || state.busy || state.selected) {
        scheduleHint();
        return;
      }
      const hint = findHintMove(state.board);
      if (!hint) return;
      state.hintPair = hint;
      renderBoard();
    }, HINT_IDLE_MS);
  }

  function swapCells(board, a, b) {
    const tmp = board[a.row][a.col];
    board[a.row][a.col] = board[b.row][b.col];
    board[b.row][b.col] = tmp;
  }

  function findMatchClusters(board) {
    const matched = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => false));

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      let start = 0;
      while (start < BOARD_COLS) {
        const base = board[row][start];
        let end = start + 1;
        while (end < BOARD_COLS && board[row][end] && base && board[row][end].kind === base.kind) {
          end += 1;
        }
        if (base && end - start >= MATCH_MIN) {
          for (let col = start; col < end; col += 1) matched[row][col] = true;
        }
        start = end;
      }
    }

    for (let col = 0; col < BOARD_COLS; col += 1) {
      let start = 0;
      while (start < BOARD_ROWS) {
        const base = board[start][col];
        let end = start + 1;
        while (end < BOARD_ROWS && board[end][col] && base && board[end][col].kind === base.kind) {
          end += 1;
        }
        if (base && end - start >= MATCH_MIN) {
          for (let row = start; row < end; row += 1) matched[row][col] = true;
        }
        start = end;
      }
    }

    for (let row = 0; row < BOARD_ROWS - 1; row += 1) {
      for (let col = 0; col < BOARD_COLS - 1; col += 1) {
        const a = board[row][col];
        const b = board[row][col + 1];
        const c = board[row + 1][col];
        const d = board[row + 1][col + 1];
        if (!a || !b || !c || !d) continue;
        if (a.kind !== b.kind || a.kind !== c.kind || a.kind !== d.kind) continue;
        matched[row][col] = true;
        matched[row][col + 1] = true;
        matched[row + 1][col] = true;
        matched[row + 1][col + 1] = true;
      }
    }

    const visited = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => false));
    const clusters = [];

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        if (!matched[row][col] || visited[row][col] || !board[row][col]) continue;

        const kind = board[row][col].kind;
        const queue = [{ row, col }];
        const cells = [];
        visited[row][col] = true;

        while (queue.length) {
          const node = queue.pop();
          if (!node) continue;
          cells.push(node);

          const neighbors = [
            { row: node.row - 1, col: node.col },
            { row: node.row + 1, col: node.col },
            { row: node.row, col: node.col - 1 },
            { row: node.row, col: node.col + 1 }
          ];

          for (const n of neighbors) {
            if (!inBounds(n.row, n.col) || visited[n.row][n.col] || !matched[n.row][n.col]) continue;
            const neighborCell = board[n.row][n.col];
            if (!neighborCell || neighborCell.kind !== kind) continue;
            visited[n.row][n.col] = true;
            queue.push(n);
          }
        }

        if (cells.length) clusters.push({ kind, cells });
      }
    }

    return clusters;
  }

  function isAdjacent(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }

  function getTileEl(row, col) {
    return state.boardEl?.querySelector?.(`[data-row="${row}"][data-col="${col}"]`) || null;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function renderBoard(options = {}) {
    if (!state.boardEl) return;

    const dropMap = options?.dropMap || null;
    const selectedKey = state.selected ? cellKey(state.selected.row, state.selected.col) : "";
    const hintAKey = state.hintPair ? cellKey(state.hintPair.a.row, state.hintPair.a.col) : "";
    const hintBKey = state.hintPair ? cellKey(state.hintPair.b.row, state.hintPair.b.col) : "";
    const canShowHint = !selectedKey && !state.busy && !!state.hintPair;
    const out = [];

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const cell = state.board[row][col];
        if (!cell) continue;
        const item = ITEM_BY_ID[cell.kind] || ITEM_DEFS[0];
        const tileKey = cellKey(row, col);
        const classes = [
          "match-game__tile",
          selectedKey === tileKey ? "is-selected" : "",
          canShowHint && (tileKey === hintAKey || tileKey === hintBKey) ? "is-hint" : "",
          dropMap && Number(dropMap[tileKey] || 0) > 0 ? "is-dropping" : "",
          isBombKind(cell.kind) ? "is-bomb" : ""
        ]
          .filter(Boolean)
          .join(" ");
        const dropDistance = dropMap ? Math.max(0, Number(dropMap[tileKey] || 0)) : 0;
        const styleAttr = dropDistance > 0 ? ` style="--drop-distance:${dropDistance};"` : "";

        out.push(`
          <button class="${classes}" type="button" data-row="${row}" data-col="${col}" aria-label="${item.id}"${styleAttr}>
            <img src="${item.src}" alt="" draggable="false" />
          </button>
        `);
      }
    }

    state.boardEl.innerHTML = out.join("");
  }

  function explodeBombArea(seed, clearSet, processedBombs) {
    const queue = Array.isArray(seed) ? seed.slice() : [seed];
    while (queue.length) {
      const node = queue.pop();
      if (!node || !inBounds(node.row, node.col)) continue;
      const bombKey = cellKey(node.row, node.col);
      if (processedBombs.has(bombKey)) continue;

      const bombCell = state.board[node.row]?.[node.col];
      if (!isBombKind(bombCell?.kind)) continue;
      processedBombs.add(bombKey);
      playBoomOverlay(getBombBlastCells(node.row, node.col));

      const blastCells = getBombBlastCells(node.row, node.col);
      for (const point of blastCells) {
        const row = point.row;
        const col = point.col;
        const key = cellKey(row, col);
          clearSet.add(key);
          const candidate = state.board[row]?.[col];
          if (isBombKind(candidate?.kind) && !processedBombs.has(key)) queue.push({ row, col });
      }
    }
  }

  function getBombBlastCells(row, col) {
    const out = [];
    for (let r = row - BOMB_BLAST_RADIUS; r <= row + BOMB_BLAST_RADIUS; r += 1) {
      for (let c = col - BOMB_BLAST_RADIUS; c <= col + BOMB_BLAST_RADIUS; c += 1) {
        if (!inBounds(r, c)) continue;
        out.push({ row: r, col: c });
      }
    }
    return out;
  }

  function pickBombDropColumn(cluster, swapPair) {
    if (!cluster?.cells?.length) return -1;
    if (swapPair) {
      const first = cluster.cells.find((cell) => cell.row === swapPair.a.row && cell.col === swapPair.a.col);
      if (first && Number.isInteger(first.col)) return first.col;
      const second = cluster.cells.find((cell) => cell.row === swapPair.b.row && cell.col === swapPair.b.col);
      if (second && Number.isInteger(second.col)) return second.col;
    }
    const fallback = cluster.cells[Math.floor(Math.random() * cluster.cells.length)] || null;
    return Number.isInteger(fallback?.col) ? fallback.col : -1;
  }

  function spawnBombsFromTop(candidates = [], preferredCols = []) {
    if (!candidates.length || !preferredCols.length) return 0;
    const available = candidates
      .filter((cell) => inBounds(cell.row, cell.col) && !isBombKind(state.board[cell.row]?.[cell.col]?.kind))
      .sort((a, b) => a.row - b.row || a.col - b.col);
    if (!available.length) return 0;

    const used = new Set();
    let spawned = 0;

    const takeCell = (col) => {
      const sameCol = available.find((cell) => cell.col === col && !used.has(cellKey(cell.row, cell.col)));
      if (sameCol) return sameCol;
      return available.find((cell) => !used.has(cellKey(cell.row, cell.col))) || null;
    };

    preferredCols.forEach((col) => {
      if (!Number.isInteger(col) || col < 0 || col >= BOARD_COLS) return;
      const pick = takeCell(col);
      if (!pick) return;
      const key = cellKey(pick.row, pick.col);
      used.add(key);
      state.board[pick.row][pick.col].kind = BOMB_ITEM.id;
      spawned += 1;
    });

    return spawned;
  }

  function maybeDropRandomBomb(candidates = []) {
    if (!candidates.length || Math.random() >= RANDOM_BOMB_DROP_CHANCE) return false;
    const pool = [];
    candidates.forEach((cell) => {
      const tile = state.board[cell.row]?.[cell.col];
      if (!tile || isBombKind(tile.kind)) return;
      pool.push(cell);
    });

    if (!pool.length) return false;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return false;
    state.board[pick.row][pick.col].kind = BOMB_ITEM.id;
    return true;
  }

  function collapseAndRefill() {
    const created = [];
    const dropMap = Object.create(null);

    for (let col = 0; col < BOARD_COLS; col += 1) {
      let writeRow = BOARD_ROWS - 1;
      for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
        const cell = state.board[row][col];
        if (!cell) continue;
        if (writeRow !== row) {
          state.board[writeRow][col] = cell;
          state.board[row][col] = null;
          const movedDistance = writeRow - row;
          if (movedDistance > 0) {
            dropMap[cellKey(writeRow, col)] = movedDistance;
          }
        }
        writeRow -= 1;
      }

      while (writeRow >= 0) {
        state.board[writeRow][col] = createCell();
        created.push({ row: writeRow, col });
        dropMap[cellKey(writeRow, col)] = writeRow + 2;
        writeRow -= 1;
      }
    }

    return { created, dropMap };
  }

  function randomFloat(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function easeOutCubic(t) {
    const x = 1 - clamp01(t);
    return 1 - x * x * x;
  }

  function easeInCubic(t) {
    const x = clamp01(t);
    return x * x * x;
  }

  function animateFragment(fragment, config) {
    const delayMs = Math.max(0, Number(config?.delayMs) || 0);
    const durationMs = Math.max(380, Number(config?.durationMs) || 980);
    const durationSec = durationMs / 1000;
    const endX = Number(config?.endX) || 0;
    const endY = Math.max(0, Number(config?.endY) || 0);
    const initialVy = Math.max(8, Number(config?.initialVy) || 28);
    const swayAmp = Number(config?.swayAmp) || 0;
    const swayCycles = Number(config?.swayCycles) || 1;
    const swayPhase = Number(config?.swayPhase) || 0;
    const rotateEnd = Number(config?.rotateEnd) || 0;
    const scaleStart = Math.max(0.4, Number(config?.scaleStart) || 0.7);
    const scalePeak = Math.max(scaleStart, Number(config?.scalePeak) || 1.02);
    const scaleEnd = Math.max(0.34, Number(config?.scaleEnd) || 0.66);
    const gravity = Math.max(80, (2 * (endY - initialVy * durationSec)) / (durationSec * durationSec));
    const startTime = performance.now() + delayMs;

    const step = (now) => {
      if (!fragment.isConnected) return;
      const elapsed = now - startTime;
      if (elapsed < 0) {
        requestAnimationFrame(step);
        return;
      }

      const t = clamp01(elapsed / durationMs);
      const tSmooth = easeOutCubic(t);
      const wobble = Math.sin((t * swayCycles + swayPhase) * Math.PI * 2);
      const driftX = endX * tSmooth + wobble * swayAmp * (1 - t);
      const timeSec = durationSec * t;
      const driftY = initialVy * timeSec + 0.5 * gravity * timeSec * timeSec;

      const appear = clamp01(t / 0.11);
      const fade = clamp01((t - 0.7) / 0.3);
      const opacity = appear * (1 - easeInCubic(fade));

      const swell = Math.sin(Math.PI * clamp01(t / 0.3)) * (1 - t);
      const scale = lerp(scaleStart, scaleEnd, t) + (scalePeak - scaleStart) * swell;
      const rotate = rotateEnd * (t * (0.82 + 0.18 * t));

      fragment.style.transform = `translate(-50%, -50%) translate(${driftX.toFixed(2)}px, ${driftY.toFixed(
        2
      )}px) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      fragment.style.opacity = opacity.toFixed(3);

      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }
      fragment.remove();
    };

    requestAnimationFrame(step);
  }

  function playBoomOverlay(cells) {
    if (!state.particlesEl || !state.boardEl) return;
    const list = Array.isArray(cells) ? cells.filter(Boolean) : [];
    if (!list.length) return;

    const boardRect = state.boardEl.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return;

    const minRow = Math.min(...list.map((x) => x.row));
    const maxRow = Math.max(...list.map((x) => x.row));
    const minCol = Math.min(...list.map((x) => x.col));
    const maxCol = Math.max(...list.map((x) => x.col));

    const cellW = boardRect.width / BOARD_COLS;
    const cellH = boardRect.height / BOARD_ROWS;
    const widthCells = Math.max(1, maxCol - minCol + 1);
    const heightCells = Math.max(1, maxRow - minRow + 1);
    const centerX = (minCol + maxCol + 1) * 0.5 * cellW;
    const centerY = (minRow + maxRow + 1) * 0.5 * cellH;
    const blastSize = Math.max(cellW * widthCells, cellH * heightCells) * 1.16;

    const boom = document.createElement("span");
    boom.className = "match-boom";
    boom.style.left = `${centerX}px`;
    boom.style.top = `${centerY}px`;
    boom.style.width = `${blastSize}px`;
    boom.style.height = `${blastSize}px`;
    boom.style.backgroundImage = `url("${BOOM_IMAGE}")`;
    state.particlesEl.appendChild(boom);
    boom.addEventListener(
      "animationend",
      () => {
        boom.remove();
      },
      { once: true }
    );
  }

  function spawnFragments(cells) {
    if (!state.particlesEl || !state.boardEl || !cells.length) return;

    const boardRect = state.boardEl.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return;

    const cellW = boardRect.width / BOARD_COLS;
    const cellH = boardRect.height / BOARD_ROWS;
    const fragSize = Math.max(6, Math.floor(Math.min(cellW, cellH) * 0.33));
    const pieceCols = 3;
    const pieceRows = 3;

    cells.forEach((cell) => {
      const item = ITEM_BY_ID[cell.kind];
      if (!item) return;

      const originX = cell.col * cellW + cellW / 2;
      const originY = cell.row * cellH + cellH / 2;

      for (let i = 0; i < 10; i += 1) {
        const fragment = document.createElement("span");
        fragment.className = "match-fragment";
        fragment.style.left = `${originX + randomFloat(-cellW * 0.14, cellW * 0.14)}px`;
        fragment.style.top = `${originY + randomFloat(-cellH * 0.14, cellH * 0.14)}px`;
        fragment.style.width = `${fragSize}px`;
        fragment.style.height = `${fragSize}px`;
        fragment.style.backgroundImage = `url("${item.src}")`;
        fragment.style.backgroundSize = `${fragSize * pieceCols}px ${fragSize * pieceRows}px`;
        fragment.style.backgroundPosition = `${-Math.floor(Math.random() * pieceCols) * fragSize}px ${-Math.floor(
          Math.random() * pieceRows
        ) * fragSize}px`;
        const driftX = randomFloat(-cellW * 0.94, cellW * 0.94);
        const dropY = randomFloat(cellH * 1.4, cellH * 3.2);
        const rotateEnd = randomFloat(-260, 260);
        const scaleStart = randomFloat(0.58, 0.78);
        const scalePeak = randomFloat(0.98, 1.16);
        const scaleEnd = randomFloat(0.56, 0.9);

        state.particlesEl.appendChild(fragment);
        animateFragment(fragment, {
          delayMs: randomFloat(0, 54),
          durationMs: randomFloat(900, 1320),
          endX: driftX,
          endY: dropY,
          initialVy: randomFloat(12, cellH * 0.9),
          swayAmp: randomFloat(cellW * 0.02, cellW * 0.15),
          swayCycles: randomFloat(0.6, 1.35),
          swayPhase: randomFloat(-0.45, 0.45),
          rotateEnd,
          scaleStart,
          scalePeak,
          scaleEnd
        });
      }
    });
  }

  function markTilesAsClearing(cells) {
    cells.forEach((cell) => {
      const tileEl = getTileEl(cell.row, cell.col);
      if (tileEl) tileEl.classList.add("is-clearing");
    });
  }

  function shakeTiles(cells) {
    cells.forEach((cell) => {
      const tileEl = getTileEl(cell.row, cell.col);
      if (!tileEl) return;
      tileEl.classList.remove("is-invalid");
      void tileEl.offsetWidth;
      tileEl.classList.add("is-invalid");
      setTimeout(() => tileEl.classList.remove("is-invalid"), 260);
    });
  }

  async function animateSwapTiles(a, b) {
    const aEl = getTileEl(a.row, a.col);
    const bEl = getTileEl(b.row, b.col);
    if (!aEl || !bEl) return;

    const dx = b.col - a.col;
    const dy = b.row - a.row;

    aEl.style.setProperty("--swap-x", `${dx * 100}%`);
    aEl.style.setProperty("--swap-y", `${dy * 100}%`);
    bEl.style.setProperty("--swap-x", `${-dx * 100}%`);
    bEl.style.setProperty("--swap-y", `${-dy * 100}%`);

    aEl.classList.add("is-swapping");
    bEl.classList.add("is-swapping");
    await wait(SWAP_ANIMATION_MS);
    aEl.classList.remove("is-swapping");
    bEl.classList.remove("is-swapping");
    aEl.style.removeProperty("--swap-x");
    aEl.style.removeProperty("--swap-y");
    bEl.style.removeProperty("--swap-x");
    bEl.style.removeProperty("--swap-y");
  }

  async function resolveBoard({ bombSeeds = [], swapPair = null } = {}) {
    let resolved = false;
    let pendingBombSeeds = Array.isArray(bombSeeds) ? bombSeeds.slice() : [];

    while (true) {
      const clusters = findMatchClusters(state.board);
      const hasMatches = clusters.length > 0;
      const clearSet = new Set();

      clusters.forEach((cluster) => {
        cluster.cells.forEach((cell) => clearSet.add(cellKey(cell.row, cell.col)));
      });

      const matchBombSeeds = [];
      clearSet.forEach((key) => {
        const pos = parseCellKey(key);
        const cell = state.board[pos.row]?.[pos.col];
        if (isBombKind(cell?.kind)) matchBombSeeds.push(pos);
      });

      if (!hasMatches && !pendingBombSeeds.length && !matchBombSeeds.length) break;
      resolved = true;

      const explosionSeeds = [...pendingBombSeeds, ...matchBombSeeds];
      const processedBombs = new Set();
      if (explosionSeeds.length) explodeBombArea(explosionSeeds, clearSet, processedBombs);

      const canCreateBomb = explosionSeeds.length === 0;
      const bombDropCols = [];
      if (canCreateBomb) {
        clusters.forEach((cluster) => {
          if (cluster.cells.length < 4) return;
          const col = pickBombDropColumn(cluster, swapPair);
          if (Number.isInteger(col) && col >= 0 && col < BOARD_COLS) {
            bombDropCols.push(col);
          }
        });
      }

      const cellsToClear = [];
      clearSet.forEach((key) => {
        const pos = parseCellKey(key);
        const cell = state.board[pos.row]?.[pos.col];
        if (!cell) return;
        cellsToClear.push({ row: pos.row, col: pos.col, kind: cell.kind });
      });

      markTilesAsClearing(cellsToClear);
      spawnFragments(cellsToClear);
      await wait(CLEAR_ANIMATION_MS);

      cellsToClear.forEach((cell) => {
        state.board[cell.row][cell.col] = null;
      });

      const { created: createdCells, dropMap } = collapseAndRefill();
      const spawnedBombs = spawnBombsFromTop(createdCells, bombDropCols);
      if (!spawnedBombs) maybeDropRandomBomb(createdCells);
      renderBoard({ dropMap });

      pendingBombSeeds = [];
      await wait(DROP_ANIMATION_MS);
      await wait(CASCADE_DELAY_MS);
    }

    if (!boardHasPossibleMove(state.board)) {
      state.board = createInitialBoard();
      renderBoard();
    }

    return resolved;
  }

  async function attemptSwap(a, b) {
    if (state.busy) return;
    if (!inBounds(a.row, a.col) || !inBounds(b.row, b.col)) return;
    if (!isAdjacent(a, b)) return;

    registerPlayerInteraction({ rerenderHint: true });
    state.busy = true;
    state.selected = null;
    renderBoard();
    await animateSwapTiles(a, b);
    swapCells(state.board, a, b);
    renderBoard();

    const seedBombs = [];
    if (isBombKind(state.board[a.row]?.[a.col]?.kind)) seedBombs.push({ row: a.row, col: a.col });
    if (isBombKind(state.board[b.row]?.[b.col]?.kind)) seedBombs.push({ row: b.row, col: b.col });

    const resolved = await resolveBoard({ bombSeeds: seedBombs, swapPair: { a, b } });
    if (!resolved) {
      await wait(SWAP_REVERT_DELAY_MS);
      await animateSwapTiles(a, b);
      swapCells(state.board, a, b);
      renderBoard();
      shakeTiles([a, b]);
    }

    state.busy = false;
    scheduleHint();
  }

  async function triggerBombTap(row, col) {
    if (state.busy || !inBounds(row, col)) return;
    if (!isBombKind(state.board[row]?.[col]?.kind)) return;

    registerPlayerInteraction({ rerenderHint: true });
    state.busy = true;
    state.selected = null;
    renderBoard();
    await wait(30);
    await resolveBoard({ bombSeeds: [{ row, col }] });
    state.busy = false;
    scheduleHint();
  }

  function handleTileTap(row, col) {
    if (state.busy || !inBounds(row, col)) return;
    if (isBombKind(state.board[row]?.[col]?.kind)) {
      triggerBombTap(row, col);
      return;
    }
    registerPlayerInteraction();

    const next = { row, col };
    if (!state.selected) {
      state.selected = next;
      renderBoard();
      scheduleHint();
      return;
    }

    const prev = state.selected;
    if (prev.row === next.row && prev.col === next.col) {
      state.selected = null;
      renderBoard();
      scheduleHint();
      return;
    }

    if (isAdjacent(prev, next)) {
      attemptSwap(prev, next);
      return;
    }

    state.selected = next;
    renderBoard();
    scheduleHint();
  }

  function onBoardPointerDown(event) {
    if (state.busy) return;
    const tile = event.target?.closest?.(".match-game__tile");
    if (!tile || !state.boardEl?.contains(tile)) return;

    const row = Number(tile.getAttribute("data-row"));
    const col = Number(tile.getAttribute("data-col"));
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    registerPlayerInteraction({ rerenderHint: true });

    state.pointer = {
      row,
      col,
      x: Number(event.clientX || 0),
      y: Number(event.clientY || 0)
    };
  }

  function onGlobalPointerUp(event) {
    if (!state.pointer) return;
    if (state.busy) {
      state.pointer = null;
      return;
    }

    const pointer = state.pointer;
    state.pointer = null;

    const dx = Number(event.clientX || 0) - pointer.x;
    const dy = Number(event.clientY || 0) - pointer.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 12) {
      handleTileTap(pointer.row, pointer.col);
      return;
    }

    const horizontal = Math.abs(dx) > Math.abs(dy);
    const target = {
      row: pointer.row + (horizontal ? 0 : dy > 0 ? 1 : -1),
      col: pointer.col + (horizontal ? (dx > 0 ? 1 : -1) : 0)
    };

    if (!inBounds(target.row, target.col)) {
      handleTileTap(pointer.row, pointer.col);
      return;
    }

    state.selected = null;
    renderBoard();
    attemptSwap({ row: pointer.row, col: pointer.col }, target);
  }

  function startGame() {
    state.home.hidden = true;
    state.game.hidden = false;
    document.body?.classList?.add("match-game-open");

    clearHintTimer();
    state.selected = null;
    state.busy = false;
    state.pointer = null;
    state.hintPair = null;
    state.board = createInitialBoard();
    state.particlesEl.innerHTML = "";
    renderBoard();
    scheduleHint();
  }

  function closeGame() {
    clearHintTimer();
    state.home.hidden = false;
    state.game.hidden = true;
    document.body?.classList?.remove("match-game-open");
    state.selected = null;
    state.busy = false;
    state.pointer = null;
    state.hintPair = null;
  }

  function syncLanguage() {
    if (!state.playImg) return;
    state.playImg.src = getPlayButtonSrc();
    state.playImg.alt = resolveUiLanguage() === "ru" ? "Играть" : "Play";
  }

  function syncMatchLogo(pageId = "") {
    const logo = document.querySelector(".logo-header .main-logo");
    if (!logo) return;

    if (!state.defaultLogoSrc) {
      state.defaultLogoSrc = String(logo.getAttribute("src") || "/images/logo.png");
    }

    const isMatchPage = pageId
      ? pageId === PAGE_ID
      : (document.body?.classList?.contains("page-match") ||
          document.getElementById(PAGE_ID)?.classList?.contains("page-active"));
    const desiredSrc = isMatchPage ? MATCH_LOGO : state.defaultLogoSrc;
    if (String(logo.getAttribute("src") || "") !== desiredSrc) {
      logo.setAttribute("src", desiredSrc);
    }
  }

  function bindUi() {
    if (!state.page) return;

    state.home = state.page.querySelector("[data-match-home]");
    state.game = state.page.querySelector("[data-match-game]");
    state.playImg = state.page.querySelector("[data-match-play-image]");
    state.boardEl = state.page.querySelector("[data-match-board]");
    state.particlesEl = state.page.querySelector("[data-match-particles]");

    const startBtn = state.page.querySelector("[data-match-start]");
    const closeBtn = state.page.querySelector("[data-match-close]");

    startBtn?.addEventListener("click", () => {
      startGame();
    });
    closeBtn?.addEventListener("click", () => {
      closeGame();
    });

    state.boardEl?.addEventListener("pointerdown", onBoardPointerDown);
    window.addEventListener("pointerup", onGlobalPointerUp);
    window.addEventListener("pointercancel", onGlobalPointerUp);
  }

  function initApi() {
    const getWildCoin = () => readWildCoin();
    window.WTMatch = {
      getWildCoin: () => getWildCoin(),
      getState: () => ({
        wildCoin: getWildCoin(),
        gameOpen: !state.game?.hidden
      }),
      openEconomySheet: () => {
        const wildCoin = getWildCoin();
        const text = `WildCoin: ${wildCoin}`;
        if (typeof window.showToast === "function") {
          window.showToast(text);
          return;
        }
        try {
          window.Telegram?.WebApp?.showPopup?.({ title: "WildCoin", message: text });
        } catch {}
      }
    };
  }

  function init() {
    const page = ensurePage();
    page.style.setProperty("--match-main-bg-image", `url("${MAIN_BG}")`);
    page.style.setProperty("--match-level-bg-image", `url("${LEVEL_BG}")`);
    state.page = page;

    bindUi();
    syncLanguage();
    syncMatchLogo();
    preloadMatchAssets();
    initApi();

    const refreshWildCoin = () => emitWildCoin(readWildCoin());
    refreshWildCoin();

    window.addEventListener("language:changed", syncLanguage);
    window.WT?.bus?.addEventListener?.("language:changed", syncLanguage);

    try {
      window.WT?.bus?.addEventListener?.("page:change", (event) => {
        const pageId = event?.detail?.id;
        if (pageId === PAGE_ID) {
          syncMatchLogo(pageId);
          emitWildCoin(readWildCoin());
          if (!state.game?.hidden) scheduleHint();
          return;
        }
        syncMatchLogo(pageId);
        if (!state.game?.hidden) closeGame();
      });
    } catch {}

    window.addEventListener("storage", (event) => {
      if (!STORAGE_KEYS.includes(String(event?.key || ""))) return;
      refreshWildCoin();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
