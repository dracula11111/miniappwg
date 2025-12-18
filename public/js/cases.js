// public/js/cases.js - Case opening system with realistic spin animation
(() => {
  console.log('[Cases] 🎁 Starting cases module');

  const tg = window.Telegram?.WebApp;

  // ====== CASE DATA ======
  const CASES = {
    case1: {
      id: 'case1',
      name: 'Case 1',
      price: { ton: 0.01, stars: 15 },
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
        { id: 'gift11', icon: 'gift11.png', price: { ton: 0.14, stars: 15 }, rarity: 'common' }
      ]


    }
  };

  // ====== STATE ======
  let currentCase = null;
  let isAnimating = false;
  let isSpinning = false;
  let selectedCount = 1;
  let isDemoMode = false;

  let carousels = [];
  let animationFrames = [];

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
      baseItems.push(currentCase.items[Math.floor(Math.random() * currentCase.items.length)]);
    }

    // Делаем 2 копии, чтобы лента реально была бесконечной
    const items = baseItems.concat(baseItems);

    itemsContainer.innerHTML = items.map(item => (
      `<div class="case-carousel-item" data-item-id="${item.id}">
        <img src="/images/gifts/${item.icon}" alt="${item.id}">
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
      `<div class="case-carousel-item" data-item-id="${it.id}">
        <img src="/images/gifts/${it.icon}" alt="${it.id}">
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
      <div class="case-content-item" data-rarity="${item.rarity || 'common'}">
        <img src="/images/gifts/${item.icon}" alt="${item.id}">
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
  async function handleOpenCase() {
    if (isAnimating || isSpinning || !currentCase) return;

    const currency = window.WildTimeCurrency?.current || 'ton';
    const totalPrice = currentCase.price[currency] * selectedCount;

    if (!isDemoMode) {
      const balance = window.WildTimeCurrency?.balance?.[currency] || 0;
      if (balance < totalPrice) {
        tg?.HapticFeedback?.notificationOccurred?.('error');
        alert(`Insufficient ${currency.toUpperCase()} balance`);
        return;
      }
    }

    console.log('[Cases] 🎰 Opening case:', { demo: isDemoMode, count: selectedCount, currency });

    isSpinning = true;
    openBtn.disabled = true;
    openBtn.style.opacity = '0.6';

    tg?.HapticFeedback?.impactOccurred?.('heavy');

    if (!isDemoMode) {
      applyBalanceDelta(currency, -totalPrice);
    }

    try {
      await spinCarousels(currency);
    } finally {
      openBtn.disabled = false;
      openBtn.style.opacity = '1';
    }
  }

  // ====== SPIN CAROUSELS (новая логика: без резкой смены линии, старт с текущей позиции) ======
  async function spinCarousels(currency) {
    isSpinning = true;
    stopAllAnimations();

    const MIN_STRIP_LENGTH = 170;
    const TAIL_AFTER_WIN = 32;

    const spinPromises = carousels.map((carousel, index) => {
      return new Promise(resolve => {
        // выбираем выигрышный предмет для этой карусели
        const winItem = currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
        carousel.winningItem = winItem;

        // берём текущую ленту как базу
        let strip = Array.isArray(carousel.items) && carousel.items.length
          ? carousel.items.slice()
          : [];

        if (!strip.length) {
          const idleCount = 70;
          for (let i = 0; i < idleCount; i++) {
            strip.push(currentCase.items[Math.floor(Math.random() * currentCase.items.length)]);
          }
        }

        // удлиняем ленту до нужной длины (новые элементы будут справа, вне экрана)
        while (strip.length < MIN_STRIP_LENGTH) {
          strip.push(currentCase.items[Math.floor(Math.random() * currentCase.items.length)]);
        }

        // индекс, под которым приз должен остановиться
        const winAt = strip.length - TAIL_AFTER_WIN;
        strip[winAt] = winItem;

        carousel.items = strip;
        carousel.winningStripIndex = winAt;

        const cont = carousel.itemsContainer;
        const existingNodes = Array.from(cont.children);
        const needed = strip.length;

        // аккуратно синхронизируем DOM с массивом, не трогая transform
        for (let i = 0; i < needed; i++) {
          const dataItem = strip[i];
          if (i < existingNodes.length) {
            const node = existingNodes[i];
            node.dataset.itemId = dataItem.id;
            const img = node.querySelector('img');
            if (img) {
              img.src = `/images/gifts/${dataItem.icon}`;
              img.alt = dataItem.id;
            }
          } else {
            const node = document.createElement('div');
            node.className = 'case-carousel-item';
            node.dataset.itemId = dataItem.id;
            node.innerHTML = `<img src="/images/gifts/${dataItem.icon}" alt="${dataItem.id}">`;
            cont.appendChild(node);
          }
        }

        // если старых элементов больше, чем нужно — убираем лишние с конца
        if (existingNodes.length > needed) {
          for (let i = existingNodes.length - 1; i >= needed; i--) {
            cont.removeChild(existingNodes[i]);
          }
        }

        const firstItem = cont.querySelector('.case-carousel-item');
        if (!firstItem) {
          resolve();
          return;
        }

        const itemRect = firstItem.getBoundingClientRect();
        const itemWidth = itemRect.width;

        const containerRect = carousel.element.getBoundingClientRect();
        const containerWidth = containerRect.width;

        const cs = getComputedStyle(cont);
        const gap = parseFloat(cs.gap || cs.columnGap || '0') || 0;
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;

        const step = itemWidth + gap;
        const centerOffset = containerWidth / 2 - itemWidth / 2;

        // стартуем с того места, где лента остановилась на айдле
        let startPosition = carousel.position || 0;
        if (!startPosition) {
          const transform = getComputedStyle(cont).transform;
          if (transform && transform !== 'none') {
            const match = transform.match(/matrix\(([^)]+)\)/);
            if (match) {
              const parts = match[1].split(',');
              const tx = parseFloat(parts[4]) || 0;
              startPosition = -tx; // т.к. translateX(-position)
            }
          }
        }

        // целевая позиция: winAt ровно под центральной линией
        // координата центральной линии внутри itemsContainer (учитываем, что лента inset'ом от краёв, напр. left:8px)
        const contRect = cont.getBoundingClientRect();
        const contLeft = contRect.left - containerRect.left;   // смещение ленты внутри карусели
        const centerX = containerWidth / 2 - contLeft;         // X линии в координатах cont

        // X линии в координатах itemsContainer (важно!)
        const lineX = getLineXInItems(carousel);

        // рандомная точка внутри выигрышного предмета (от его левого края)
        // чтобы не попадало прямо в край — делаем небольшой отступ
        const innerMargin = Math.min(18, itemWidth * 0.18);
        const randomPointInItem =
        innerMargin + Math.random() * (itemWidth - innerMargin * 2);

        // целевая позиция: чтобы centerX попал в randomPointInItem выбранного предмета
        let targetPosition = padL + winAt * step + randomPointInItem - lineX;


        // гарантируем, что пройдем заметное расстояние, чтобы не было "дёргания"
        const minTravel = step * 20;
        if (targetPosition - startPosition < minTravel) {
          targetPosition = Math.min(maxTarget, startPosition + minTravel);
        }

        const totalDistance = targetPosition - startPosition;
        const duration = 5200 + index * 250 + Math.random() * 600;
        const startTime = performance.now();

        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // плавное замедление
          // GPU hint
        cont.style.willChange = 'transform';
        // чтобы тактилка не делала микролаги — не рандом, а раз в ~120мс
        let lastHaptic = 0;

      const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

        // более плавно: мягкий старт + мягкая остановка
      const eased = easeInOutCubic(progress);

      carousel.position = startPosition + totalDistance * eased;
        cont.style.transform = `translate3d(-${carousel.position}px, 0, 0)`;

      if (tg?.HapticFeedback && progress < 0.85 && (currentTime - lastHaptic) > 120) {
        tg.HapticFeedback.impactOccurred('light');
        lastHaptic = currentTime;
      }

      if (progress < 1) {
        animationFrames[index] = requestAnimationFrame(animate);
      } else {
      // финальная защёлка в точное значение
      carousel.position = targetPosition;
        cont.style.transform = `translate3d(-${targetPosition}px, 0, 0)`;

    // можно убрать подсказку GPU после остановки
    cont.style.willChange = '';

    highlightWinningItem(carousel, index);
    resolve();
  }
};


          // лёгкие тактильные "щёлчки" пока крутимся
          if (tg?.HapticFeedback && Math.random() < 0.04 && progress < 0.85) {
            tg.HapticFeedback.impactOccurred('light');
          }

          if (progress < 1) {
            animationFrames[index] = requestAnimationFrame(animate);
          } else {
            // финальная защёлка в точное значение
            carousel.position = targetPosition;
            cont.style.transform = `translateX(-${targetPosition}px)`;

            if (tg?.HapticFeedback) {
              tg.HapticFeedback.notificationOccurred('success');
            }

            // финальная защёлка
            carousel.position = targetPosition;
            cont.style.transform = `translate3d(${-targetPosition}px, 0, 0)`;

            // ВАЖНО: теперь выигрыш = то, что реально под линией
            syncWinByLine(carousel, targetPosition, strip, padL, step, lineX);

            highlightWinningItem(carousel, index);
            resolve();


            // подсветка выигрышного слота
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

    // помечаем все карусели как "остановлены" — для CSS, чтобы затемнить остальные подарки
    carousels.forEach(c => c.element.classList.add('cases-finished'));

    await delay(250);
    await showResult(currency);

    isSpinning = false;
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
    const winEl = carousel.itemsContainer.children?.[winIndex];

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
function showResult(currency) {
  const tg = window.Telegram?.WebApp;
  const tgUserId = tg?.initDataUnsafe?.user?.id || "guest";
  const initData = tg?.initData || "";

  const wonItems = carousels.map(c => c.winningItem).filter(Boolean);
  const totalValueRaw = wonItems.reduce((sum, item) => sum + (item.price?.[currency] || 0), 0);

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
        if (!isDemoMode) {
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
              type: 'case_win'
            })
          }).catch(() => {});
        }

        tg?.HapticFeedback?.notificationOccurred?.('success');
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
  window.addEventListener('currency:changed', (e) => {
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
      isDemoMode = mode;
      if (demoToggle) demoToggle.classList.toggle('active', mode);
      updateOpenButton();
    }
  };

  console.log('[Cases] Module loaded');
})();
