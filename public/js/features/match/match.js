(() => {
  'use strict';

  const PAGE_ID = 'matchPage';
  const STORAGE_KEY = 'wt_match_endless_v1';
  const SIZE = 8;
  const WILDCOIN_ICON = '/images/match/wildcoin.svg';
  const BG_PRIMARY = '/images/match/backgrounds/matchMainback.webp';
  const BG_FALLBACK = '/images/match/backgrounds/1.webp';

  const TILE_TYPES = [
    {
      id: '01',
      src: '/images/match/items/item-01.png',
      fallback: '/images/match/items/item-01-fallback.svg'
    },
    {
      id: '02',
      src: '/images/match/items/item-02.png',
      fallback: '/images/match/items/item-02-fallback.svg'
    },
    {
      id: '03',
      src: '/images/match/items/item-03.png',
      fallback: '/images/match/items/item-03-fallback.svg'
    },
    {
      id: '04',
      src: '/images/match/items/item-04.png',
      fallback: '/images/match/items/item-04-fallback.svg'
    },
    {
      id: '05',
      src: '/images/match/items/item-05.png',
      fallback: '/images/match/items/item-05-fallback.svg'
    },
    {
      id: '06',
      src: '/images/match/items/item-06.png',
      fallback: '/images/match/items/item-06-fallback.svg'
    },
    {
      id: '07',
      src: '/images/match/items/item-07.png',
      fallback: '/images/match/items/item-07-fallback.svg'
    },
    {
      id: '08',
      src: '/images/match/items/item-08.png',
      fallback: '/images/match/items/item-08-fallback.svg'
    }
  ];

  const TILE_BY_ID = new Map(TILE_TYPES.map((tile) => [tile.id, tile]));
  const TILE_IDS = TILE_TYPES.map((tile) => tile.id);
  const ASSET_PROBE_TAG = String(Date.now());

  const ui = {};
  const state = {
    board: [],
    selected: null,
    busy: false,
    popKeys: new Set(),
    spawnKeys: new Set(),
    score: 0,
    bestScore: 0,
    moves: 0,
    wildCoin: 0,
    modalOpen: false
  };

  let page = null;
  let fitRaf = 0;
  let toastTimer = 0;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const keyOf = (r, c) => `${r}:${c}`;

  function assetExists(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = `${url}?v=${ASSET_PROBE_TAG}`;
    });
  }

  async function resolveAssetSources() {
    const bgOk = await assetExists(BG_PRIMARY);
    page?.style?.setProperty('--combo-bg-image', `url(\"${bgOk ? BG_PRIMARY : BG_FALLBACK}\")`);

    await Promise.all(TILE_TYPES.map(async (tile) => {
      const ok = await assetExists(tile.src);
      tile.renderSrc = ok ? tile.src : tile.fallback;
    }));
  }

  function readPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { wildCoin: 0, bestScore: 0 };
      const parsed = JSON.parse(raw);
      const wildCoin = Math.max(0, Math.round(Number(parsed?.wildCoin) || 0));
      const bestScore = Math.max(0, Math.round(Number(parsed?.bestScore) || 0));
      return { wildCoin, bestScore };
    } catch {
      return { wildCoin: 0, bestScore: 0 };
    }
  }

  function savePersisted() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        wildCoin: Math.max(0, Math.round(state.wildCoin || 0)),
        bestScore: Math.max(0, Math.round(state.bestScore || 0))
      }));
    } catch {}
  }

  function emitWildCoin() {
    try {
      window.dispatchEvent(new CustomEvent('match:wildcoin-update', {
        detail: { wildCoin: Math.max(0, Math.round(state.wildCoin || 0)) }
      }));
    } catch {}
  }

  function showToast(message, ttl = 1400) {
    if (!ui.toast) return;
    const text = String(message || '').trim();
    if (!text) return;

    ui.toast.textContent = text;
    ui.toast.classList.add('is-visible');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastTimer = 0;
      ui.toast?.classList.remove('is-visible');
    }, Math.max(700, Math.min(5000, Number(ttl) || 1400)));
  }

  function openModal(title, text, actions) {
    if (!ui.modal || !ui.modalTitle || !ui.modalText || !ui.modalActions) return;

    ui.modalTitle.textContent = String(title || 'Info');
    ui.modalText.textContent = String(text || '');
    ui.modalActions.innerHTML = '';

    const safeActions = Array.isArray(actions) ? actions : [];
    safeActions.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `combo-btn ${entry?.kind === 'primary' ? 'combo-btn--primary' : ''}`;
      button.textContent = String(entry?.label || 'Close');
      button.addEventListener('click', () => {
        entry?.onClick?.();
      });
      ui.modalActions.appendChild(button);
    });

    state.modalOpen = true;
    ui.modal.classList.add('is-open');
  }

  function closeModal() {
    state.modalOpen = false;
    ui.modal?.classList.remove('is-open');
  }

  function randomTile(excludeA = null, excludeB = null) {
    let pool = TILE_IDS;
    if (excludeA || excludeB) {
      pool = TILE_IDS.filter((id) => id !== excludeA && id !== excludeB);
      if (!pool.length) pool = TILE_IDS;
    }
    return pool[Math.floor(Math.random() * pool.length)] || TILE_IDS[0];
  }

  function createBoardNoInitialMatches() {
    const board = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));

    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        let banA = null;
        let banB = null;

        if (c >= 2 && board[r][c - 1] === board[r][c - 2]) {
          banA = board[r][c - 1];
        }
        if (r >= 2 && board[r - 1][c] === board[r - 2][c]) {
          banB = board[r - 1][c];
        }

        board[r][c] = randomTile(banA, banB);
      }
    }

    return board;
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function swapInBoard(board, a, b) {
    const t = board[a.r][a.c];
    board[a.r][a.c] = board[b.r][b.c];
    board[b.r][b.c] = t;
  }

  function isAdjacent(a, b) {
    if (!a || !b) return false;
    return (Math.abs(a.r - b.r) + Math.abs(a.c - b.c)) === 1;
  }

  function findMatches(board) {
    const keys = new Set();

    for (let r = 0; r < SIZE; r += 1) {
      let streakType = board[r][0];
      let streakStart = 0;

      for (let c = 1; c <= SIZE; c += 1) {
        const type = c < SIZE ? board[r][c] : null;
        if (type === streakType) continue;

        if (streakType !== null && (c - streakStart) >= 3) {
          for (let i = streakStart; i < c; i += 1) {
            keys.add(keyOf(r, i));
          }
        }

        streakType = type;
        streakStart = c;
      }
    }

    for (let c = 0; c < SIZE; c += 1) {
      let streakType = board[0][c];
      let streakStart = 0;

      for (let r = 1; r <= SIZE; r += 1) {
        const type = r < SIZE ? board[r][c] : null;
        if (type === streakType) continue;

        if (streakType !== null && (r - streakStart) >= 3) {
          for (let i = streakStart; i < r; i += 1) {
            keys.add(keyOf(i, c));
          }
        }

        streakType = type;
        streakStart = r;
      }
    }

    return keys;
  }

  function hasPossibleMove(board) {
    const test = cloneBoard(board);

    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const right = c + 1;
        const down = r + 1;

        if (right < SIZE) {
          swapInBoard(test, { r, c }, { r, c: right });
          const ok = findMatches(test).size > 0;
          swapInBoard(test, { r, c }, { r, c: right });
          if (ok) return true;
        }

        if (down < SIZE) {
          swapInBoard(test, { r, c }, { r: down, c });
          const ok = findMatches(test).size > 0;
          swapInBoard(test, { r, c }, { r: down, c });
          if (ok) return true;
        }
      }
    }

    return false;
  }

  function createPlayableBoard() {
    for (let i = 0; i < 120; i += 1) {
      const board = createBoardNoInitialMatches();
      if (hasPossibleMove(board)) return board;
    }

    return createBoardNoInitialMatches();
  }

  function renderHud() {
    if (ui.scoreValue) ui.scoreValue.textContent = String(Math.max(0, Math.round(state.score || 0)));
    if (ui.bestScoreValue) ui.bestScoreValue.textContent = String(Math.max(0, Math.round(state.bestScore || 0)));
    if (ui.wildCoinValue) ui.wildCoinValue.textContent = String(Math.max(0, Math.round(state.wildCoin || 0)));
  }

  function renderBoard() {
    if (!ui.board) return;

    const fragment = document.createDocumentFragment();

    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const tileId = state.board[r]?.[c];
        const tile = TILE_BY_ID.get(tileId) || TILE_BY_ID.get('01');
        const cellKey = keyOf(r, c);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'combo-cell';
        button.dataset.r = String(r);
        button.dataset.c = String(c);

        if (state.selected && state.selected.r === r && state.selected.c === c) {
          button.classList.add('combo-cell--selected');
        }
        if (state.popKeys.has(cellKey)) {
          button.classList.add('combo-cell--pop');
        }
        if (state.spawnKeys.has(cellKey)) {
          button.classList.add('combo-cell--spawn');
        }

        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.src = tile?.renderSrc || tile?.fallback || '/images/match/items/item-01-fallback.svg';
        img.addEventListener('error', () => {
          if (!tile?.fallback) return;
          if (img.dataset.fallbackApplied === '1') return;
          img.dataset.fallbackApplied = '1';
          img.src = tile.fallback;
        }, { once: true });

        button.appendChild(img);
        fragment.appendChild(button);
      }
    }

    ui.board.replaceChildren(fragment);
  }

  function bumpWildCoin(amount) {
    const delta = Math.max(0, Math.round(Number(amount) || 0));
    if (!delta) return;

    state.wildCoin += delta;
    savePersisted();
    emitWildCoin();
  }

  function applyCollapseAndSpawn() {
    const spawned = new Set();

    for (let c = 0; c < SIZE; c += 1) {
      const col = [];
      for (let r = SIZE - 1; r >= 0; r -= 1) {
        const value = state.board[r][c];
        if (value !== null) col.push(value);
      }

      let pointer = SIZE - 1;
      for (let i = 0; i < col.length; i += 1) {
        state.board[pointer][c] = col[i];
        pointer -= 1;
      }

      while (pointer >= 0) {
        state.board[pointer][c] = randomTile();
        spawned.add(keyOf(pointer, c));
        pointer -= 1;
      }
    }

    state.spawnKeys = spawned;
  }

  function removeMatched(keys) {
    let removed = 0;

    keys.forEach((cellKey) => {
      const parts = cellKey.split(':');
      const r = Number.parseInt(parts[0], 10);
      const c = Number.parseInt(parts[1], 10);
      if (!Number.isInteger(r) || !Number.isInteger(c)) return;
      if (state.board[r][c] === null) return;
      state.board[r][c] = null;
      removed += 1;
    });

    return removed;
  }

  async function resolveCascades(initialKeys) {
    let combo = 1;
    let keys = initialKeys;

    while (keys.size > 0) {
      state.popKeys = new Set(keys);
      renderBoard();
      await wait(140);

      const removed = removeMatched(keys);
      state.popKeys.clear();

      if (removed > 0) {
        state.score += removed * (10 + ((combo - 1) * 4));
        bumpWildCoin(removed + (combo - 1));
      }

      applyCollapseAndSpawn();
      renderBoard();
      renderHud();
      await wait(150);

      state.spawnKeys.clear();
      keys = findMatches(state.board);
      combo += 1;
    }

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      savePersisted();
    }

    renderHud();
    renderBoard();

    if (!hasPossibleMove(state.board)) {
      await wait(60);
      shuffleBoard(false);
      showToast('Dead board, shuffled');
    }
  }

  async function trySwap(a, b) {
    if (state.busy || state.modalOpen) return;
    if (!isAdjacent(a, b)) return;

    state.busy = true;

    swapInBoard(state.board, a, b);
    state.selected = null;
    renderBoard();
    await wait(110);

    const matches = findMatches(state.board);
    if (!matches.size) {
      swapInBoard(state.board, a, b);
      renderBoard();
      ui.board?.classList.add('is-shaking');
      setTimeout(() => ui.board?.classList.remove('is-shaking'), 240);
      await wait(140);
      state.busy = false;
      return;
    }

    state.moves += 1;
    await resolveCascades(matches);

    state.busy = false;
  }

  function onBoardClick(event) {
    if (state.busy || state.modalOpen) return;

    const cell = event.target?.closest?.('.combo-cell');
    if (!cell || !ui.board?.contains(cell)) return;

    const r = Number.parseInt(cell.dataset.r, 10);
    const c = Number.parseInt(cell.dataset.c, 10);
    if (!Number.isInteger(r) || !Number.isInteger(c)) return;

    if (!state.selected) {
      state.selected = { r, c };
      renderBoard();
      return;
    }

    if (state.selected.r === r && state.selected.c === c) {
      state.selected = null;
      renderBoard();
      return;
    }

    const from = { ...state.selected };
    const to = { r, c };

    if (!isAdjacent(from, to)) {
      state.selected = { r, c };
      renderBoard();
      return;
    }

    trySwap(from, to);
  }

  function newBoard(resetScore) {
    state.board = createPlayableBoard();
    state.selected = null;
    state.popKeys.clear();
    state.spawnKeys.clear();

    if (resetScore) {
      if (state.score > state.bestScore) {
        state.bestScore = state.score;
      }
      state.score = 0;
      state.moves = 0;
      savePersisted();
    }

    renderHud();
    renderBoard();
  }

  function shuffleBoard(showMessage = true) {
    if (state.busy) return;

    const values = [];
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        values.push(state.board[r][c]);
      }
    }

    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = values[i];
      values[i] = values[j];
      values[j] = t;
    }

    let index = 0;
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        state.board[r][c] = values[index] || randomTile();
        index += 1;
      }
    }

    for (let i = 0; i < 20; i += 1) {
      if (!findMatches(state.board).size && hasPossibleMove(state.board)) break;
      state.board = createPlayableBoard();
    }

    state.selected = null;
    renderBoard();

    if (showMessage) showToast('Board shuffled');
  }

  function applyViewportFit() {
    if (!page || !ui.boardWrap) return;

    const viewport = window.innerHeight || document.documentElement?.clientHeight || 0;
    const topbarBottom = document.querySelector('.topbar')?.getBoundingClientRect?.().bottom || 0;
    const navTop = document.querySelector('.bottom-nav')?.getBoundingClientRect?.().top || viewport;
    const available = Math.max(280, Math.floor(navTop - topbarBottom - 4));

    page.style.setProperty('--combo-available-height', `${available}px`);

    const activePageId = document.querySelector('.page.page-active')?.id || '';
    if (activePageId !== PAGE_ID) return;

    const headH = ui.head?.getBoundingClientRect?.().height || 0;
    const controlsH = ui.controls?.getBoundingClientRect?.().height || 0;
    const verticalGap = 56;

    const freeByHeight = Math.max(210, Math.floor(available - headH - controlsH - verticalGap));
    const freeByWidth = Math.max(210, Math.floor((page.clientWidth || window.innerWidth || 360) - 26));
    const boardSize = Math.min(freeByHeight, freeByWidth);

    page.style.setProperty('--combo-board-size', `${boardSize}px`);
  }

  function scheduleViewportFit() {
    if (fitRaf) cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => {
      fitRaf = 0;
      applyViewportFit();
    });
  }

  function ensurePage() {
    const existing = document.getElementById(PAGE_ID);
    if (existing) return existing;

    const node = document.createElement('main');
    node.id = PAGE_ID;
    node.className = 'page';

    node.innerHTML = `
      <section class="combo-root" aria-label="Match">
        <div class="combo-head" id="comboHead">
          <h1 class="combo-title">Match</h1>
          <div class="combo-level-chip">Score: <strong id="comboScoreValue">0</strong> | Best: <strong id="comboBestScoreValue">0</strong></div>
          <div class="combo-mini-card">
            <span class="combo-mini-card__label">WildCoin</span>
            <span class="combo-mini-card__value"><img src="${WILDCOIN_ICON}" alt="" /><span id="comboWildCoinValue">0</span></span>
          </div>
        </div>

        <div class="combo-board-wrap" id="comboBoardWrap">
          <div class="combo-board" id="comboBoard" role="grid" aria-label="Match board"></div>
        </div>

        <div class="combo-controls" id="comboControls">
          <button class="combo-btn combo-btn--primary" id="comboNewBtn" type="button">New Board</button>
          <button class="combo-btn" id="comboShuffleBtn" type="button">Shuffle</button>
        </div>

        <div class="combo-toast" id="comboToast" aria-live="polite" aria-atomic="true"></div>

        <div class="combo-modal" id="comboModal" aria-hidden="true">
          <div class="combo-modal__card">
            <h3 class="combo-modal__title" id="comboModalTitle">WildCoin</h3>
            <p class="combo-modal__text" id="comboModalText"></p>
            <div class="combo-modal__actions" id="comboModalActions"></div>
          </div>
        </div>
      </section>
    `;

    const appRoot = document.querySelector('.app') || document.body;
    const bottomNav = appRoot.querySelector('.bottom-nav') || document.querySelector('.bottom-nav');
    if (bottomNav) appRoot.insertBefore(node, bottomNav);
    else appRoot.appendChild(node);

    return node;
  }

  function cacheUi() {
    ui.head = document.getElementById('comboHead');
    ui.boardWrap = document.getElementById('comboBoardWrap');
    ui.board = document.getElementById('comboBoard');
    ui.controls = document.getElementById('comboControls');
    ui.scoreValue = document.getElementById('comboScoreValue');
    ui.bestScoreValue = document.getElementById('comboBestScoreValue');
    ui.wildCoinValue = document.getElementById('comboWildCoinValue');
    ui.newBtn = document.getElementById('comboNewBtn');
    ui.shuffleBtn = document.getElementById('comboShuffleBtn');
    ui.toast = document.getElementById('comboToast');
    ui.modal = document.getElementById('comboModal');
    ui.modalTitle = document.getElementById('comboModalTitle');
    ui.modalText = document.getElementById('comboModalText');
    ui.modalActions = document.getElementById('comboModalActions');
  }

  function bindEvents() {
    ui.board?.addEventListener('click', onBoardClick);

    ui.newBtn?.addEventListener('click', () => {
      if (state.busy) return;
      newBoard(true);
      showToast('New board ready');
    });

    ui.shuffleBtn?.addEventListener('click', () => {
      if (state.busy) return;
      shuffleBoard(true);
    });

    ui.modal?.addEventListener('click', (event) => {
      if (event.target === ui.modal) closeModal();
    });

    window.addEventListener('resize', scheduleViewportFit, { passive: true });
    window.addEventListener('orientationchange', scheduleViewportFit, { passive: true });

    try {
      window.WT?.bus?.addEventListener?.('page:change', (event) => {
        const id = event?.detail?.id || '';
        if (id !== PAGE_ID) return;
        renderHud();
        renderBoard();
        emitWildCoin();
        scheduleViewportFit();
      });
    } catch {}
  }

  function exposeApi() {
    window.WTMatch = {
      getWildCoin: () => Math.max(0, Math.round(state.wildCoin || 0)),
      getState: () => ({
        score: Math.max(0, Math.round(state.score || 0)),
        bestScore: Math.max(0, Math.round(state.bestScore || 0)),
        moves: Math.max(0, Math.round(state.moves || 0)),
        wildCoin: Math.max(0, Math.round(state.wildCoin || 0))
      }),
      openEconomySheet: () => {
        openModal(
          'WildCoin',
          `Balance: ${Math.max(0, Math.round(state.wildCoin || 0))}. Earn more by matching tiles in Match.`,
          [
            {
              label: 'Close',
              kind: 'primary',
              onClick: () => closeModal()
            }
          ]
        );
      }
    };
  }

  async function init() {
    page = ensurePage();
    cacheUi();
    await resolveAssetSources();

    const persisted = readPersisted();
    state.wildCoin = persisted.wildCoin;
    state.bestScore = persisted.bestScore;
    state.score = 0;
    state.moves = 0;

    newBoard(false);
    bindEvents();
    exposeApi();
    renderHud();
    emitWildCoin();

    scheduleViewportFit();
    setTimeout(scheduleViewportFit, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

