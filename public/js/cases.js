// public/js/cases.js - Case opening system with realistic spin animation
(() => {
  console.log('[Cases] 🎁 Starting cases module');

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // ====== CASE DATA ======
  const CASES = {
    case1: {
      id: 'case1',
      name: 'Case 1',
      price: { ton: 0.01, stars: 2 },
      items: [

        { id: 'gift1', icon: 'gift1.png', price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift2', icon: 'gift2.png', price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift3', icon: 'gift3.png', price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift4', icon: 'gift4.png', price: { ton: 0.46, stars: 50 }, rarity: 'epic' },
        { id: 'gift5', icon: 'gift5.png', price: { ton: 0.46, stars: 50 }, rarity: 'epic' },
        { id: 'gift6', icon: 'gift6.png', price: { ton: 0.46, stars: 50 }, rarity: 'epic' },
        { id: 'gift7', icon: 'gift7.png', price: { ton: 0.46, stars: 50 }, rarity: 'rare' },
        { id: 'gift8', icon: 'gift8.png', price: { ton: 0.23, stars: 25 }, rarity: 'rare' },
        { id: 'gift9', icon: 'gift9.png', price: { ton: 0.23, stars: 25 }, rarity: 'common' },
        { id: 'gift10', icon: 'gift10.png', price: { ton: 0.14, stars: 15 }, rarity: 'common' },
        { id: 'gift11', icon: 'gift11.png', price: { ton: 0.14, stars: 15 }, rarity: 'common' },
        { id: 'gift12', icon: 'stars.webp', price: { ton: 0.015, stars: 5 }, rarity: 'common' },
      ]


    }
,
// Case 2: NFT + Gifts
case2: {
  id: 'case2',
  name: 'NFT + Gifts',
  price: { ton: 0.02, stars: 4 },
  items: [
    // NFTs (put images into /public/images/nfts/)
    { id: 'nft1', type: 'nft', icon: 'RaketaNFT.png',   price: { ton: 1.5, stars: 200 }, rarity: 'legendary' },
    { id: 'nft2', type: 'nft', icon: 'IceCreamNFT.png', price: { ton: 0.9, stars: 120 }, rarity: 'epic' },
    { id: 'nft3', type: 'nft', icon: 'RamenNFT.png',    price: { ton: 0.5, stars: 70  }, rarity: 'rare' },

    // Gifts
    { id: 'gift1',  icon: 'gift1.png',  price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
    { id: 'gift4',  icon: 'gift4.png',  price: { ton: 0.46, stars: 50  }, rarity: 'epic' },
    { id: 'gift7',  icon: 'gift7.png',  price: { ton: 0.46, stars: 50  }, rarity: 'rare' },
    { id: 'gift9',  icon: 'gift9.png',  price: { ton: 0.23, stars: 25  }, rarity: 'common' },
    { id: 'gift12', icon: 'stars.webp', price: { ton: 0.015, stars: 5 }, rarity: 'common' },
  ]
}
  };

  // ====== STATE ======
  let currentCase = null;
  let isAnimating = false;
  let isSpinning = false;
  let selectedCount = 1;
  let isDemoMode = false;
  let activeSpin = null; // locks demo/currency for current spin
  let pendingCurrencyChange = false;

  let carousels = [];
  let animationFrames = [];

// ====== ITEM HELPERS (gift / nft) ======
function itemType(item) {
  if (item && item.type) return item.type;
  var id = item && item.id ? String(item.id).toLowerCase() : '';
  if (id.indexOf('nft') === 0) return 'nft';
  return 'gift';
}

function itemIconPath(item) {
  // ВАЖНО: у тебя NFT лежат в /images/gifts/nfts/
  // (то есть папка nfts внутри gifts). Поэтому путь для NFT именно такой.
  // Если потом перенесёшь в /images/nfts/, просто поменяй строку ниже.
  var base = itemType(item) === 'nft' ? '/images/gifts/nfts/' : '/images/gifts/';
  var icon = (item && item.icon) ? String(item.icon) : 'stars.webp';
  return base + icon;
}

// общий фолбэк (если картинка не найдена)
const ITEM_ICON_FALLBACK = '/images/gifts/stars.webp';

// ====== DROP RATES (NFT rarity) ======
// Demo: NFT выпадает часто (почти каждый прокрут)
// Paid (TON / Stars): NFT выпадает редко
const NFT_DROP_RATES = {
  demo: 0.90,          // 90% на выигрыш в демо
  ton: 0.03,           // 3% на выигрыш за TON
  stars: 0.02          // 2% на выигрыш за Stars
};

// Для заполнения ленты (визуально): чтобы NFT не мелькали слишком часто
const STRIP_NFT_CHANCE = {
  demo: 0.28,          // в демо пусть иногда мелькают
  paid: 0.06           // в обычном режиме редко
};

const _casePoolsCache = new Map();

function getCasePools(caseData) {
  const key = caseData && caseData.id ? String(caseData.id) : '';
  if (key && _casePoolsCache.has(key)) return _casePoolsCache.get(key);

  const items = (caseData && Array.isArray(caseData.items)) ? caseData.items : [];
  const nfts = items.filter(it => itemType(it) === 'nft');
  const gifts = items.filter(it => itemType(it) !== 'nft');

  const pools = { items, nfts, gifts };
  if (key) _casePoolsCache.set(key, pools);
  return pools;
}

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getNftWinChance(demoMode, currency) {
  if (demoMode) return NFT_DROP_RATES.demo;
  return (currency === 'ton') ? NFT_DROP_RATES.ton : NFT_DROP_RATES.stars;
}

function pickWinningItem(caseData, demoMode, currency) {
  const pools = getCasePools(caseData);
  if (!pools.items.length) return null;

  // Если NFT в кейсе нет — выбираем как обычно
  if (!pools.nfts.length) return pickRandom(pools.items);

  const chance = getNftWinChance(demoMode, currency);
  const roll = Math.random();

  if (roll < chance) {
    return pickRandom(pools.nfts) || pickRandom(pools.items);
  }
  // не NFT: выбираем из подарков
  return pickRandom(pools.gifts) || pickRandom(pools.items);
}

function pickStripItem(caseData, demoMode) {
  const pools = getCasePools(caseData);
  if (!pools.items.length) return null;

  if (!pools.nfts.length) return pickRandom(pools.items);

  const chance = demoMode ? STRIP_NFT_CHANCE.demo : STRIP_NFT_CHANCE.paid;
  if (Math.random() < chance) return pickRandom(pools.nfts) || pickRandom(pools.items);
  return pickRandom(pools.gifts) || pickRandom(pools.items);
}




  function getLineXInItems(carousel) {
  const cont = carousel.itemsContainer;
  const w = carousel.element.getBoundingClientRect().width;

  // .case-carousel-items имеет left:8px; offsetLeft даёт это смещение БЕЗ учёта transform
  const insetLeft = cont?.offsetLeft || 0;

  // линия по центру .case-carousel => переводим в координаты cont
  return (w / 2) - insetLeft;
}

function syncWinByLine(carousel, finalPos, strip, padL, step, lineX) {
  // где линия указывает в координатах контента ленты
  const xContent = finalPos + lineX;

  let idx = Math.floor((xContent - padL) / step);
  idx = Math.max(0, Math.min(idx, strip.length - 1));

  carousel.winningStripIndex = idx;
  carousel.winningItem = strip[idx];
  return idx;
}


  // ====== HELPERS ======
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  function easeInOutCubic(t) {
  // 0..1 -> 0..1 (плавный старт + плавная остановка)
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}


  function formatAmount(currency, value) {
    if (currency === 'ton') return (Math.round((parseFloat(value) || 0) * 100) / 100).toFixed(2);
    return String(Math.round(parseFloat(value) || 0));
  }

  function applyBalanceDelta(currency, delta) {
    const curr = window.WildTimeCurrency?.balance?.[currency] ?? 0;

    if (currency === 'ton') {
      const next = Math.max(0, Math.round((parseFloat(curr) + delta) * 100) / 100);
      window.dispatchEvent(new CustomEvent('balance:update', { detail: { ton: next } }));
      return next;
    } else {
      const next = Math.max(0, Math.round(parseFloat(curr) + delta));
      window.dispatchEvent(new CustomEvent('balance:update', { detail: { stars: next } }));
      return next;
    }
  }

  function setControlsLocked(locked) {
    // Prevent switching Demo/count during spin/claim
    if (demoToggle) {
      demoToggle.classList.toggle('locked', locked);
      demoToggle.style.pointerEvents = locked ? 'none' : '';
      demoToggle.style.opacity = locked ? '0.6' : '';
    }

    // Count buttons
    countBtns.forEach(btn => {
      if (!btn) return;
      btn.disabled = !!locked;
      btn.style.pointerEvents = locked ? 'none' : '';
      btn.style.opacity = locked ? '0.6' : '';
    });
  }


  // ====== DOM ELEMENTS ======
  let overlay = null;
  let sheetPanel = null;
  let carouselsWrapper = null;
  let contentsGrid = null;
  let openBtn = null;
  let closeBtn = null;
  let countBtns = [];
  let demoToggle = null;

  // ====== PAGE STATE FLAG ======
  function setupCasesPageBodyFlag() {
    const casesPage = document.getElementById('casesPage');
    if (!casesPage) return;

    const apply = () => {
      document.body.classList.toggle('page-cases', casesPage.classList.contains('page-active'));
    };

    apply();
    new MutationObserver(apply).observe(casesPage, { attributes: true, attributeFilter: ['class'] });
  }

  // ====== INITIALIZE ======
  function init() {
    console.log('[Cases] Initializing...');
    setupCasesPageBodyFlag();

    overlay = document.getElementById('caseOverlay');
    sheetPanel = document.querySelector('.case-sheet-panel');
    carouselsWrapper = document.getElementById('caseCarouselsWrapper');
    contentsGrid = document.getElementById('caseContentsGrid');
    openBtn = document.getElementById('caseOpenBtn');
    closeBtn = document.getElementById('caseSheetClose');
    countBtns = Array.from(document.querySelectorAll('.case-count-btn'));

    createDemoToggle();
    attachListeners();
    generateCasesGrid();

    console.log('[Cases] ✅ Ready');
  }

  // ====== CREATE DEMO TOGGLE ======
  function createDemoToggle() {
    const countSection = document.querySelector('.case-count-section');
    if (!countSection || document.getElementById('caseDemoToggle')) return;

    const toggle = document.createElement('div');
    toggle.id = 'caseDemoToggle';
    toggle.className = 'case-demo-toggle';
    toggle.innerHTML = `
      <span class="case-demo-label">Demo</span>
      <div class="case-demo-switch"></div>
    `;

    toggle.addEventListener('click', () => {
      if (isSpinning) return; // нельзя менять режим во время прокрута/клейма
      isDemoMode = !isDemoMode;
      toggle.classList.toggle('active', isDemoMode);
      updateOpenButton();

      tg?.HapticFeedback?.selectionChanged?.();
      console.log('[Cases] Demo mode:', isDemoMode);
    });

    countSection.appendChild(toggle);
    demoToggle = toggle;
  }

  // ====== ATTACH EVENT LISTENERS ======
  function attachListeners() {
    overlay?.addEventListener('click', closeBottomSheet);
    closeBtn?.addEventListener('click', closeBottomSheet);

    countBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (isSpinning) return;
        const count = parseInt(btn.dataset.count);
        selectCount(count);
      });
    });

    openBtn?.addEventListener('click', handleOpenCase);
  }

  // ====== GENERATE CASES GRID ======
  function generateCasesGrid() {
    const casesGrid = document.getElementById('casesGrid');
    if (!casesGrid) return;

    casesGrid.innerHTML = '';

    Object.values(CASES).forEach(caseData => {
      const currency = window.WildTimeCurrency?.current || 'ton';
      const price = caseData.price[currency];
      const icon = currency === 'ton' ? '/icons/ton.svg' : '/icons/stars.svg';

      const card = document.createElement('div');
      card.className = 'case-card';
      card.dataset.caseId = caseData.id;

      card.innerHTML = `
        <div class="case-card__image">
          <img src="/images/cases/${caseData.id}.png" alt="${caseData.name}" class="case-img">
          <div class="case-card__glow"></div>
        </div>
        <div class="case-card__info">
          <h3 class="case-card__title">${caseData.name}</h3>
          <div class="case-card__price">
            <span>${price}</span>
            <img src="${icon}" class="price-icon" alt="${currency}">
          </div>
        </div>
      `;

      card.addEventListener('click', () => openBottomSheet(caseData.id));
      casesGrid.appendChild(card);
    });
  }

  // ====== OPEN BOTTOM SHEET ======
  function openBottomSheet(caseId) {
    if (isAnimating) return;

    currentCase = CASES[caseId];
    if (!currentCase) return;

    console.log('[Cases] 🎁 Opening:', currentCase.name);

    isAnimating = true;
    selectedCount = 1;

    document.body.classList.add('case-sheet-open');

    updateSheetContent();

    overlay?.classList.add('active');

    if (sheetPanel) {
      requestAnimationFrame(() => {
        sheetPanel.classList.add('active');
        tg?.HapticFeedback?.impactOccurred?.('medium');

        setTimeout(() => {
          isAnimating = false;
          startIdleAnimation();
        }, 400);
      });
    }
  }

  // ====== CLOSE BOTTOM SHEET ======
  function closeBottomSheet() {
    if (isAnimating || isSpinning) return;

    isAnimating = true;
    stopAllAnimations();

    document.body.classList.remove('case-sheet-open');

    if (sheetPanel) sheetPanel.classList.remove('active');
    if (overlay) overlay.classList.remove('active');

    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }

    setTimeout(() => {
      isAnimating = false;
      currentCase = null;
    }, 400);
  }

  // ====== UPDATE SHEET CONTENT ======
  function updateSheetContent() {
    if (!currentCase) return;

    const currency = window.WildTimeCurrency?.current || 'ton';
    const price = currentCase.price[currency];
    const icon = currency === 'ton' ? '/icons/ton.svg' : '/icons/stars.svg';

    const title = document.getElementById('caseSheetTitle');
    if (title) title.textContent = currentCase.name;

    const priceEl = document.getElementById('casePrice');
    const iconEl = document.getElementById('caseCurrencyIcon');
    if (priceEl) priceEl.textContent = price;
    if (iconEl) iconEl.src = icon;

    renderCarousels(selectedCount);
    renderContents(currency);
    updateOpenButton();

    countBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.count) === selectedCount);
    });

    if (demoToggle) demoToggle.classList.toggle('active', isDemoMode);
  }

  // ====== UPDATE OPEN BUTTON ======
  function updateOpenButton() {
    if (!openBtn || !currentCase) return;

    const currency = window.WildTimeCurrency?.current || 'ton';
    const totalPrice = currentCase.price[currency] * selectedCount;

    const priceEl = document.getElementById('casePrice');
    if (priceEl) {
      priceEl.textContent = isDemoMode ? 'FREE' : totalPrice.toFixed(currency === 'ton' ? 2 : 0);
    }

    openBtn.classList.toggle('demo-mode', isDemoMode);
  }

  // ====== RENDER CAROUSELS ======
  function renderCarousels(count) {
    if (!carouselsWrapper || !currentCase) return;

    carouselsWrapper.innerHTML = '';
    carousels = [];
    stopAllAnimations();

    const heights = { 1: 100, 2: 85, 3: 70 };
    const height = heights[count] || 100;

    for (let i = 0; i < count; i++) {
      const carousel = createCarousel(height, i);
      carouselsWrapper.appendChild(carousel.element);
      carousels.push(carousel);

      setTimeout(() => carousel.element.classList.add('active'), i * 100);
    }
  }

  // ====== CREATE SINGLE CAROUSEL ======
  function createCarousel(height) {
    const container = document.createElement('div');
    container.className = 'case-carousel';
    container.style.height = `${height}px`;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'case-carousel-items';

    // База (не меняется сама по себе) — чтобы не было ощущения, что "линия" резко стала другой
    const IDLE_BASE_COUNT = 70;
    const baseItems = [];
    for (let i = 0; i < IDLE_BASE_COUNT; i++) {
      baseItems.push(pickStripItem(currentCase, !!isDemoMode) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)]);
    }

    // Делаем 2 копии, чтобы лента реально была бесконечной
    const items = baseItems.concat(baseItems);

    itemsContainer.innerHTML = items.map(item => (
      `<div class="case-carousel-item" data-item-id="${item.id}" data-item-type="${itemType(item)}">
        <img src="${itemIconPath(item)}" alt="${item.id}" onerror="this.onerror=null;this.src=\'${ITEM_ICON_FALLBACK}\'">
      </div>`
    )).join('');

    container.appendChild(itemsContainer);

    const indicator = document.createElement('div');
    indicator.className = 'case-carousel-indicator';
    container.appendChild(indicator);

    return {
      element: container,
      itemsContainer,
      baseItems,
      items, // всегда актуальная "лента" (в айдле = baseItems*2, во время спина = удлинённая)
      position: 0,
      velocity: 0,
      winningItem: null,
      winningStripIndex: null
    };
  }

  function getCarouselMetrics(carousel) {
    const cont = carousel.itemsContainer;
    const firstItem = cont.querySelector('.case-carousel-item');
    if (!firstItem) return null;

    const itemWidth = firstItem.getBoundingClientRect().width;
    const cs = getComputedStyle(cont);
    const gap = parseFloat(cs.gap || cs.columnGap || '0') || 0;
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;

    const step = itemWidth + gap;
    const baseLen = (carousel.baseItems && carousel.baseItems.length)
      ? carousel.baseItems.length
      : Math.floor((carousel.items?.length || 0) / 2);

    const loopWidth = Math.max(0, baseLen * step);
    return { itemWidth, gap, padL, padR, step, baseLen, loopWidth };
  }

  function renderCarouselItems(itemsContainer, items) {
    itemsContainer.innerHTML = items.map(it => (
      `<div class="case-carousel-item" data-item-id="${it.id}" data-item-type="${itemType(it)}">
        <img src="${itemIconPath(it)}" alt="${it.id}" onerror="this.onerror=null;this.src=\'${ITEM_ICON_FALLBACK}\'">
      </div>`
    )).join('');
  }

  function resetCarouselToIdleFromCurrent(carousel) {
    const metrics = getCarouselMetrics(carousel);
    const strip = Array.isArray(carousel.items) && carousel.items.length ? carousel.items : [];

    // Если по какой-то причине ленты нет — просто пересоздадим базу
    const IDLE_BASE_COUNT = 70;
    const safePool = currentCase?.items || [];

    const cont = carousel.itemsContainer;
    if (!cont || !safePool.length) return;

    // fallback: если размеры ещё не готовы
    if (!metrics || metrics.step <= 0) {
      const base = [];
      for (let i = 0; i < IDLE_BASE_COUNT; i++) {
        base.push(safePool[Math.floor(Math.random() * safePool.length)]);
      }
      carousel.baseItems = base;
      carousel.items = base.concat(base);
      carousel.winningItem = null;
      carousel.winningStripIndex = null;
      renderCarouselItems(cont, carousel.items);
      carousel.position = 0;
      cont.style.transform = 'translateX(0px)';
      return;
    }

    // Берём "окно" из текущей ленты с того места, где она остановилась,
    // чтобы визуально НЕ было резкой смены последовательности.
    const padL = metrics.padL || 0;
    const startIndex = Math.max(0, Math.floor((carousel.position - padL) / metrics.step));

    const base = [];
    for (let i = 0; i < IDLE_BASE_COUNT; i++) {
      const idx = strip.length ? (startIndex + i) % strip.length : 0;
      base.push(strip[idx] || safePool[Math.floor(Math.random() * safePool.length)]);
    }

    carousel.baseItems = base;
    carousel.items = base.concat(base);
    carousel.winningItem = null;
    carousel.winningStripIndex = null;

    // "перебазируем" position, чтобы текущий кадр совпал
    let newPos = carousel.position - startIndex * metrics.step;

    // нормализуем в диапазон одной петли
    const loopWidth = Math.max(0, base.length * metrics.step);
    if (loopWidth > 0) {
      newPos = ((newPos % loopWidth) + loopWidth) % loopWidth;
    }

    carousel.position = newPos;

    renderCarouselItems(cont, carousel.items);
    cont.style.transform = `translateX(-${carousel.position}px)`;
  }

  // ====== IDLE ANIMATION (slow continuous scroll) ======
  function startIdleAnimation() {
  carousels.forEach((carousel, index) => {
    // было ~0.5–1 px/frame (~30–60 px/s на 60fps)
    // делаем сразу px/сек — так не дергается при просадках FPS
    carousel.velocity = 32 + Math.random() * 32; // 32–64 px/s
    carousel.position = carousel.position || 0;

    // для плавности на GPU
    if (carousel.itemsContainer) {
      carousel.itemsContainer.style.willChange = 'transform';
    }

    let lastTime = 0;

    const animate = (t) => {
      // если карусель скрыли/удалили — прекращаем
      if (!carousel.element.classList.contains('active')) return;

      if (!lastTime) lastTime = t;

      // dt в секундах, clamp чтобы после сворачивания вкладки не прыгало
      const dt = Math.min(0.05, (t - lastTime) / 1000);
      lastTime = t;

      // во время спина айдл не двигаем, но RAF оставляем живым
      if (!isSpinning) {
        const metrics = getCarouselMetrics(carousel);

        // шаг на этом кадре
        const delta = carousel.velocity * dt;
        carousel.position += delta;

        if (metrics && metrics.loopWidth > 0) {
          while (carousel.position >= metrics.loopWidth) carousel.position -= metrics.loopWidth;
          while (carousel.position < 0) carousel.position += metrics.loopWidth;
        }

        carousel.itemsContainer.style.transform = `translate3d(-${carousel.position}px, 0, 0)`;
      }

      animationFrames[index] = requestAnimationFrame(animate);
    };

    animationFrames[index] = requestAnimationFrame(animate);
  });
}


  // ====== STOP ALL ANIMATIONS ======
  function stopAllAnimations() {
    animationFrames.forEach(frameId => {
      if (frameId) cancelAnimationFrame(frameId);
    });
    animationFrames = [];
  }

  // ====== RENDER CONTENTS ======
  function renderContents(currency) {
    if (!contentsGrid) return;

    const icon = currency === 'ton' ? '/icons/ton.svg' : '/icons/stars.svg';

    contentsGrid.innerHTML = currentCase.items.map(item => `
      <div class="case-content-item" data-rarity="${item.rarity || 'common'}" data-item-type="${itemType(item)}">
        <img src="${itemIconPath(item)}" alt="${item.id}" onerror="this.onerror=null;this.src=\'${ITEM_ICON_FALLBACK}\'">
        <div class="case-content-price">
          <span>${item.price[currency]}</span>
          <img src="${icon}" alt="${currency}">
        </div>
      </div>
    `).join('');
  }

  // ====== SELECT COUNT ======
  function selectCount(count) {
    if (isAnimating || isSpinning || selectedCount === count) return;

    selectedCount = count;

    countBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
    });

    tg?.HapticFeedback?.selectionChanged?.();

    stopAllAnimations();

    setTimeout(() => {
      renderCarousels(count);
      setTimeout(() => startIdleAnimation(), 300);
    }, 100);

    updateOpenButton();
  }

  // ====== HANDLE OPEN CASE ======
  async function waitForStableCarouselLayout(timeoutMs = 1200) {
  const start = performance.now();
  let lastSig = null;

  // 2 кадра — чтобы браузер точно применил классы/разметку
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // если шрифт грузится — дождёмся (иногда влияет на высоты/лейаут)
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch (e) {}
  }

  while (performance.now() - start < timeoutMs) {
    const sig = carousels.map(c => {
      const m = getCarouselMetrics(c);
      const w = c.element.getBoundingClientRect().width;
      return m ? `${w.toFixed(2)}:${m.itemWidth.toFixed(2)}:${(m.gap||0).toFixed(2)}` : 'x';
    }).join('|');

    if (sig === lastSig) return true;
    lastSig = sig;

    await new Promise(r => requestAnimationFrame(r));
  }
  return false; // если не успели — всё равно продолжим
}


  async function handleOpenCase() {
    if (isAnimating || isSpinning || !currentCase) return;

    const currency = window.WildTimeCurrency?.current || 'ton';
    const demoModeAtStart = !!isDemoMode;
    const countAtStart = selectedCount;
    const totalPrice = currentCase.price[currency] * countAtStart;

    // фикс: блокируем возможность "переключиться" во время прокрута и забрать деньги
    activeSpin = { demoMode: demoModeAtStart, currency, count: countAtStart, totalPrice };
    setControlsLocked(true);

    if (!demoModeAtStart) {
      const balance = window.WildTimeCurrency?.balance?.[currency] || 0;
      if (balance < totalPrice) {
        setControlsLocked(false);
        activeSpin = null;

        tg?.HapticFeedback?.notificationOccurred?.('error');
        alert(`Insufficient ${currency.toUpperCase()} balance`);
        return;
      }
    }

    console.log('[Cases] 🎰 Opening case:', { demo: demoModeAtStart, count: countAtStart, currency });
    await waitForStableCarouselLayout();

    isSpinning = true;
    openBtn.disabled = true;
    openBtn.style.opacity = '0.6';

    tg?.HapticFeedback?.impactOccurred?.('heavy');

    if (!demoModeAtStart) {
      applyBalanceDelta(currency, -totalPrice);
    }

    try {
      await spinCarousels(currency, activeSpin);
    } finally {
      openBtn.disabled = false;
      openBtn.style.opacity = '1';

      isSpinning = false;
      activeSpin = null;
      setControlsLocked(false);

      // если во время спина приходила смена валюты — обновим после разблокировки
      if (pendingCurrencyChange) {
        pendingCurrencyChange = false;
        generateCasesGrid();
        if (currentCase && sheetPanel?.classList.contains('active')) updateSheetContent();
      }
    }
  }

  // ====== SPIN CAROUSELS (плавный спин, точная остановка по линии) ======
  async function spinCarousels(currency, spinCtx) {
    stopAllAnimations();

    const MIN_STRIP_LENGTH = 170;
    const TAIL_AFTER_WIN = 32;

    const spinPromises = carousels.map((carousel, index) => {
      return new Promise((resolve) => {
        // 1) Выбираем выигрыш
        const winItem = pickWinningItem(currentCase, !!(spinCtx && spinCtx.demoMode), currency) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
        carousel.winningItem = winItem;

        // 2) Берём текущую ленту как базу (чтобы не было резкого "скачка")
        let strip = (Array.isArray(carousel.items) && carousel.items.length) ? carousel.items.slice() : [];

        if (!strip.length) {
          const idleCount = 70;
          for (let i = 0; i < idleCount; i++) {
            strip.push(pickStripItem(currentCase, !!(spinCtx && spinCtx.demoMode)) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)]);
          }
        }

        // 3) Удлиняем ленту
        while (strip.length < MIN_STRIP_LENGTH) {
          strip.push(pickStripItem(currentCase, !!(spinCtx && spinCtx.demoMode)) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)]);
        }

        // 4) Фиксируем позицию выигрыша ближе к концу
        const winAt = strip.length - TAIL_AFTER_WIN;
        strip[winAt] = winItem;

        carousel.items = strip;
        carousel.winningStripIndex = winAt;

        const cont = carousel.itemsContainer;
        if (!cont) { resolve(); return; }

        // 5) Синхронизируем DOM с strip (не трогаем transform)
        const existingNodes = Array.prototype.slice.call(cont.children);
        const needed = strip.length;

        for (let i = 0; i < needed; i++) {
          const dataItem = strip[i];

          if (i < existingNodes.length) {
            const node = existingNodes[i];
            node.dataset.itemId = dataItem.id;
            node.dataset.itemType = itemType(dataItem);

            const img = node.querySelector('img');
            if (img) {
              img.onerror = null;
              img.src = itemIconPath(dataItem);
              img.alt = dataItem.id;
              img.onerror = function () { this.onerror = null; this.src = ITEM_ICON_FALLBACK; };
            }
          } else {
            const node = document.createElement('div');
            node.className = 'case-carousel-item';
            node.dataset.itemId = dataItem.id;
            node.dataset.itemType = itemType(dataItem);
            node.innerHTML = `<img src="${itemIconPath(dataItem)}" alt="${dataItem.id}" onerror="this.onerror=null;this.src='${ITEM_ICON_FALLBACK}'">`;
            cont.appendChild(node);
          }
        }

        if (existingNodes.length > needed) {
          for (let i = existingNodes.length - 1; i >= needed; i--) {
            cont.removeChild(existingNodes[i]);
          }
        }

        const firstItem = cont.querySelector('.case-carousel-item');
        if (!firstItem) { resolve(); return; }

        const itemWidth = firstItem.getBoundingClientRect().width;
        const containerWidth = carousel.element.getBoundingClientRect().width;

        const cs = getComputedStyle(cont);
        const gap = parseFloat(cs.gap || cs.columnGap || '0') || 0;
        const padL = parseFloat(cs.paddingLeft) || 0;

        const step = itemWidth + gap;

        // 6) Стартовая позиция — текущая
        let startPosition = (typeof carousel.position === 'number') ? carousel.position : 0;
        if (!startPosition) {
          const tr = getComputedStyle(cont).transform;
          if (tr && tr !== 'none') {
            const m = tr.match(/matrix\(([^)]+)\)/);
            if (m) {
              const parts = m[1].split(',');
              const tx = parseFloat(parts[4]) || 0;
              startPosition = -tx;
            }
          }
        }

        // 7) Линия (центр) в координатах itemsContainer
        const lineX = getLineXInItems(carousel);

        // 8) Точка внутри выигрышного айтема (чтобы не попадать строго в край)
        const innerMargin = Math.min(18, itemWidth * 0.18);
        const randomPoint = innerMargin + Math.random() * (itemWidth - innerMargin * 2);

        // 9) Целевая позиция: под линию попадает randomPoint у winAt
        let targetPosition = padL + winAt * step + randomPoint - lineX;

        const maxTarget = padL + (strip.length - 1) * step + (itemWidth - 1) - lineX;
        if (targetPosition < 0) targetPosition = 0;
        if (targetPosition > maxTarget) targetPosition = maxTarget;

        // 10) Минимальная "дистанция", чтобы не было ощущения микро-дерга
        const minTravel = step * 20;
        if (targetPosition - startPosition < minTravel) {
          targetPosition = Math.min(maxTarget, startPosition + minTravel);
        }

        const totalDistance = targetPosition - startPosition;

        // 11) Плавная анимация
        const duration = 5200 + index * 250 + Math.random() * 600;
        const startTime = performance.now();
        let lastHaptic = 0;

        cont.style.willChange = 'transform';

        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = easeInOutCubic(progress);

          carousel.position = startPosition + totalDistance * eased;
          cont.style.transform = `translate3d(-${carousel.position}px, 0, 0)`;

          // тактилка не чаще, чем раз в 140мс
          if (tg && tg.HapticFeedback && progress < 0.85 && (currentTime - lastHaptic) > 140) {
            try { tg.HapticFeedback.impactOccurred('light'); } catch (e) {}
            lastHaptic = currentTime;
          }

          if (progress < 1) {
            animationFrames[index] = requestAnimationFrame(animate);
          } else {
            carousel.position = targetPosition;
            cont.style.transform = `translate3d(-${targetPosition}px, 0, 0)`;
            cont.style.willChange = '';

            // ВАЖНО: финальный выигрыш = то, что реально под линией
            syncWinByLine(carousel, targetPosition, strip, padL, step, lineX);

            highlightWinningItem(carousel, index);
            resolve();
          }
        };

        setTimeout(() => {
          animationFrames[index] = requestAnimationFrame(animate);
        }, index * 140);
      });
    });

    await Promise.all(spinPromises);

    // для CSS: затемнить остальные
    carousels.forEach(c => c.element.classList.add('cases-finished'));

    await delay(250);
    await showResult(currency, spinCtx && typeof spinCtx.demoMode === 'boolean' ? spinCtx.demoMode : undefined);
  }

  // ====== HIGHLIGHT WINNING ITEM ======
  function highlightWinningItem(carousel, index) {
    // Линия — зелёный импульс
    const indicator = carousel.element.querySelector('.case-carousel-indicator');
    if (indicator) {
      indicator.classList.add('winning');
      setTimeout(() => indicator.classList.remove('winning'), 2200);
    }

    // Убираем старую подсветку
    const prev = carousel.itemsContainer.querySelector('.case-carousel-item.winning');
    if (prev) prev.classList.remove('winning');

    // Берём тот индекс, куда МЫ положили выигрышный предмет
    const winIndex = carousel.winningStripIndex;
    const winEl = (carousel.itemsContainer && carousel.itemsContainer.children) ? carousel.itemsContainer.children[winIndex] : null;

    if (winEl) {
      winEl.classList.add('winning');
      // класс winning не снимаем — при ресете карусель полностью перерисовывается
    }
  }


// ====== CLAIM BAR (under carousels) ======
function ensureClaimBar() {
  let bar = document.getElementById('caseClaimBar');
  if (bar) return bar;

  // Вставляем сразу под блоком каруселей
  const section = document.querySelector('.case-carousels-section');
  if (!section) return null;

  bar = document.createElement('div');
  bar.id = 'caseClaimBar';
  bar.className = 'case-claim-bar';
  bar.hidden = true;

  bar.innerHTML = `
    <button id="caseClaimBtn" class="case-claim-btn" type="button">
      <span class="case-claim-btn__label">Claim</span>
      <span class="case-claim-btn__amount" id="caseClaimAmount">0</span>
      <img class="case-claim-btn__icon" id="caseClaimIcon" src="/icons/ton.svg" alt="">
    </button>
  `;

  // Вставим после секции каруселей
  section.insertAdjacentElement('afterend', bar);
  return bar;
}

function hideClaimBar() {
  const bar = document.getElementById('caseClaimBar');
  if (!bar) return;
  bar.hidden = true;

  const btn = document.getElementById('caseClaimBtn');
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}


// ====== SHOW RESULT (Claim button under carousels) ======
function showResult(currency, demoModeOverride) {
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  const tgUserId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) ? tg.initDataUnsafe.user.id : "guest";
  const initData = (tg && tg.initData) ? tg.initData : "";

  const demoModeForRound = (typeof demoModeOverride === 'boolean') ? demoModeOverride : isDemoMode;

  const wonItems = carousels.map(c => c.winningItem).filter(Boolean);
  const totalValueRaw = wonItems.reduce((sum, item) => sum + ((item && item.price && item.price[currency]) ? item.price[currency] : 0), 0);

  // Нормализуем сумму
  const totalValue =
    currency === 'stars'
      ? Math.max(0, Math.round(totalValueRaw))
      : Math.max(0, +(+totalValueRaw).toFixed(2));

  const icon = currency === 'ton' ? '/icons/ton.svg' : '/icons/stars.svg';

  const bar = ensureClaimBar();
  if (!bar) return Promise.resolve();

  const btn = bar.querySelector('#caseClaimBtn');
  const amountEl = bar.querySelector('#caseClaimAmount');
  const iconEl = bar.querySelector('#caseClaimIcon');

  if (!btn || !amountEl || !iconEl) return Promise.resolve();

  iconEl.src = icon;
  amountEl.textContent = formatAmount(currency, totalValue);

  bar.hidden = false;

  // Не даём открыть ещё раз пока не заклеймили
  openBtn.disabled = true;
  openBtn.style.opacity = '0.6';

  return new Promise((resolve) => {
    const onClaim = async () => {
      btn.disabled = true;
      btn.classList.add('loading');

      try {
        if (!demoModeForRound) {
          // 1) моментально начисляем в UI
          applyBalanceDelta(currency, totalValue);

          // 2) сохраняем на сервере (чтобы после перезагрузки не пропало)
          const depositId = `casewin_${tgUserId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

          await fetch('/api/deposit-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: totalValue,
              currency,
              userId: tgUserId,
              initData,
              timestamp: Date.now(),
              depositId,
              type: 'case_win',
              notify: false
            })
          }).catch(() => {});
        }

        if (tg && tg.HapticFeedback && typeof tg.HapticFeedback.notificationOccurred === 'function') { try { tg.HapticFeedback.notificationOccurred('success'); } catch (e) {} }
      } finally {
        // прячем кнопку
        bar.hidden = true;

        // Reset carousels back to idle
        carousels.forEach((carousel) => {
          carousel.element.classList.remove('cases-finished');
          resetCarouselToIdleFromCurrent(carousel);
        });

        startIdleAnimation();

        // возвращаем Open
        openBtn.disabled = false;
        openBtn.style.opacity = '1';

        btn.disabled = false;
        btn.classList.remove('loading');
        btn.removeEventListener('click', onClaim);

        resolve();
      }
    };

    btn.addEventListener('click', onClaim, { once: true });
  });
}

  // ====== CURRENCY CHANGE LISTENER ======
  window.addEventListener('currency:changed', () => {
    if (isSpinning) {
      pendingCurrencyChange = true;
      return;
    }

    generateCasesGrid();

    if (currentCase && sheetPanel?.classList.contains('active')) {
      updateSheetContent();
    }
  });

  // ====== AUTO INIT ======
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ====== EXPORT ======
  window.WTCases = {
    openCase: openBottomSheet,
    closeCase: closeBottomSheet,
    getCases: () => CASES,
    isDemoMode: () => isDemoMode,
    setDemoMode: (mode) => {
      if (isSpinning) return false; // запрещаем менять режим во время прокрута/клейма
      isDemoMode = !!mode;
      if (demoToggle) demoToggle.classList.toggle('active', isDemoMode);
      updateOpenButton();
      return true;
    }
  };

  console.log('[Cases] Module loaded');
})();