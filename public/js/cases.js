/**
 * cases.js - CS:GO Style Case Opening System
 * 🔥 FIXED VERSION
 * - Постоянная анимация барабана с призами
 * - Плавная остановка при открытии кейса
 */

(function() {
  'use strict';

  // ================== GIFT DATA ==================
  const GIFTS = [
    { id: 1, name: 'Delicious Cake', emoji: '�', stars: 25, ton: 0.025, rarity: 'common' },
    { id: 2, name: 'Green Star', emoji: '⭐', stars: 50, ton: 0.05, rarity: 'common' },
    { id: 3, name: 'Blue Star', emoji: '🌟', stars: 75, ton: 0.075, rarity: 'common' },
    { id: 4, name: 'Red Heart', emoji: '❤️', stars: 100, ton: 0.1, rarity: 'uncommon' },
    { id: 5, name: 'Pig', emoji: '🐷', stars: 150, ton: 0.15, rarity: 'uncommon' },
    { id: 6, name: 'Ghost', emoji: '👻', stars: 200, ton: 0.2, rarity: 'uncommon' },
    { id: 7, name: 'Red Gift', emoji: '🎁', stars: 250, ton: 0.25, rarity: 'rare' },
    { id: 8, name: 'Champagne', emoji: '🾾', stars: 300, ton: 0.3, rarity: 'rare' },
    { id: 9, name: 'Tropical Fish', emoji: '🐠', stars: 400, ton: 0.4, rarity: 'rare' },
    { id: 10, name: 'Crystal Ball', emoji: '🔮', stars: 500, ton: 0.5, rarity: 'epic' },
    { id: 11, name: 'Elephant', emoji: '🐘', stars: 750, ton: 0.75, rarity: 'epic' },
    { id: 12, name: 'Teddy Bear', emoji: '🧸', stars: 1000, ton: 1.0, rarity: 'legendary' },
    { id: 13, name: 'Squirrel', emoji: '🐿️', stars: 2500, ton: 2.5, rarity: 'legendary' }
  ];

  const RARITY_COLORS = {
    common: '#6b7280',
    uncommon: '#3b82f6',
    rare: '#8b5cf6',
    epic: '#ec4899',
    legendary: '#fbbf24'
  };

  // ================== STATE ==================
  let currentCurrency = 'stars';
  let isOpening = false;
  const casePrice = { ton: 0, stars: 0 };

  const tg = window.Telegram?.WebApp;

  // ================== INIT ==================
  function init() {
    console.log('[Cases] Initializing CS:GO style case opening...');
    
    syncCurrency();
    renderCasePage();
    attachEventListeners();
    
    console.log('[Cases] Case opening system ready');
  }

  // ================== SYNC CURRENCY ==================
  function syncCurrency() {
    if (window.WildTimeCurrency) {
      currentCurrency = window.WildTimeCurrency.current;
    }

    window.addEventListener('currency:changed', (e) => {
      currentCurrency = e.detail.currency;
      updatePriceDisplay();
    });
  }

  // ================== RENDER ==================
  function renderCasePage() {
    const casesPage = document.getElementById('casesPage');
    if (!casesPage) return;

    casesPage.innerHTML = `
      <div class="case-opening-page">
        <div class="case-header">
          <h1 class="case-title">🎁 Gift Case</h1>
          <p class="case-subtitle">
            Open for <span id="casePriceDisplay">${casePrice.stars} ⭐</span>
          </p>
        </div>

        <div class="reel-container">
          <div class="reel-pointer">▼</div>
          <div class="reel" id="caseReel"></div>
        </div>

        <div class="open-btn-container">
          <button class="case-open-btn" id="caseOpenBtn">
            Open Case (<span id="btnPriceDisplay">${casePrice.stars} ⭐</span>)
          </button>
        </div>

        <div class="gifts-grid">
          ${GIFTS.map(gift => `
            <div class="gift-card" style="border-color: ${RARITY_COLORS[gift.rarity]}">
              <div class="gift-card-emoji">${gift.emoji}</div>
              <div class="gift-card-name">${gift.name}</div>
              <div class="gift-card-value" data-gift-id="${gift.id}">
                ${currentCurrency === 'ton' ? gift.ton + ' TON' : gift.stars + ' ⭐'}
              </div>
              <div class="gift-card-rarity" style="color: ${RARITY_COLORS[gift.rarity]}">
                ${gift.rarity}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    updatePriceDisplay();
    // 🔥 Запуск постоянной анимации барабана
    initReelAnimation();
  }

  function updatePriceDisplay() {
    const priceDisplay = document.getElementById('casePriceDisplay');
    const btnPriceDisplay = document.getElementById('btnPriceDisplay');
    
    const price = casePrice[currentCurrency];
    const symbol = currentCurrency === 'ton' ? 'TON' : '⭐';
    
    if (priceDisplay) {
      priceDisplay.textContent = `${price} ${symbol}`;
    }
    
    if (btnPriceDisplay) {
      btnPriceDisplay.textContent = `${price} ${symbol}`;
    }

    // Update gift cards
    GIFTS.forEach(gift => {
      const valueEl = document.querySelector(`[data-gift-id="${gift.id}"]`);
      if (valueEl) {
        valueEl.textContent = currentCurrency === 'ton' 
          ? `${gift.ton} TON` 
          : `${gift.stars} ⭐`;
      }
    });
  }

  // ================== EVENT LISTENERS ==================
  function attachEventListeners() {
    const openBtn = document.getElementById('caseOpenBtn');
    if (openBtn) {
      openBtn.addEventListener('click', handleOpenCase);
    }
  }

  // 🔥 ================== ПОСТОЯННАЯ АНИМАЦИЯ БАРАБАНА ==================
  function initReelAnimation() {
    const reel = document.getElementById('caseReel');
    if (!reel) return;

    // Генерируем достаточно предметов для бесшовной прокрутки
    const items = [];
    
    // Дублируем список призов 4 раза для длинного барабана
    for (let i = 0; i < 4; i++) {
      GIFTS.forEach(gift => {
        items.push(gift);
      });
    }

    // Рендерим предметы
    reel.innerHTML = items.map((gift, index) => {
      const value = currentCurrency === 'ton' ? `${gift.ton} TON` : `${gift.stars} ⭐`;
      return `
        <div class="reel-item" data-index="${index}" style="border-color: ${RARITY_COLORS[gift.rarity]}">
          <div class="reel-item-emoji">${gift.emoji}</div>
          <div class="reel-item-name">${gift.name}</div>
          <div class="reel-item-value">${value}</div>
        </div>
      `;
    }).join('');

    console.log('[Cases] 🎰 Reel animation initialized with', items.length, 'items');
  }

  // ================== OPEN CASE ==================
  async function handleOpenCase() {
    if (isOpening) return;

    const price = casePrice[currentCurrency];
    const balance = window.WildTimeCurrency?.balance?.[currentCurrency] || 0;

    console.log('[Cases] Opening case. Price:', price, 'Balance:', balance);

    // Check balance
    if (balance < price) {
      const msg = `Insufficient balance. You need ${price} ${currentCurrency === 'ton' ? 'TON' : '⭐'}`;
      if (tg?.showAlert) {
        tg.showAlert(msg);
      } else {
        alert(msg);
      }
      
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('error');
      }
      return;
    }

    isOpening = true;

    const openBtn = document.getElementById('caseOpenBtn');
    if (openBtn) {
      openBtn.disabled = true;
      openBtn.textContent = 'Opening...';
    }

    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('medium');
    }

    try {
      // Select winner
      const winner = selectWinner();
      console.log('[Cases] Winner:', winner);

      // Animate
      await animateReel(winner);

      // Deduct balance
      if (window.WildTimeCurrency) {
        const newBalance = balance - price;
        window.WildTimeCurrency.setBalance(currentCurrency, newBalance);
      }

      // Show result
      showResult(winner);

      if (tg?.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
      }

    } catch (error) {
      console.error('[Cases] Error:', error);
      
      if (tg?.showAlert) {
        tg.showAlert('Failed to open case. Please try again.');
      } else {
        alert('Failed to open case. Please try again.');
      }

      if (tg?.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('error');
      }
    } finally {
      isOpening = false;
      
      if (openBtn) {
        openBtn.disabled = false;
        const price = casePrice[currentCurrency];
        const symbol = currentCurrency === 'ton' ? 'TON' : '⭐';
        openBtn.innerHTML = `Open Case (<span id="btnPriceDisplay">${price} ${symbol}</span>)`;
      }
    }
  }

  // ================== SELECT WINNER ==================
  function selectWinner() {
    // Weighted random selection
    const weights = {
      common: 50,
      uncommon: 30,
      rare: 15,
      epic: 4,
      legendary: 1
    };

    const weightedGifts = GIFTS.flatMap(gift => 
      Array(weights[gift.rarity] || 1).fill(gift)
    );

    return weightedGifts[Math.floor(Math.random() * weightedGifts.length)];
  }

  // ================== ANIMATE REEL ==================
  function animateReel(winner) {
    return new Promise((resolve) => {
      const reel = document.getElementById('caseReel');
      if (!reel) {
        resolve();
        return;
      }

      // 🔥 Останавливаем постоянную анимацию
      reel.classList.add('opening');

      // Generate items
      const items = [];
      
      // Add 30 random items
      for (let i = 0; i < 30; i++) {
        items.push(GIFTS[Math.floor(Math.random() * GIFTS.length)]);
      }
      
      // Add winner
      items.push(winner);
      
      // Add 10 more random items
      for (let i = 0; i < 10; i++) {
        items.push(GIFTS[Math.floor(Math.random() * GIFTS.length)]);
      }

      // Render items
      reel.innerHTML = items.map((gift, index) => {
        const value = currentCurrency === 'ton' ? `${gift.ton} TON` : `${gift.stars} ⭐`;
        return `
          <div class="reel-item" data-index="${index}" style="border-color: ${RARITY_COLORS[gift.rarity]}">
            <div class="reel-item-emoji">${gift.emoji}</div>
            <div class="reel-item-name">${gift.name}</div>
            <div class="reel-item-value">${value}</div>
          </div>
        `;
      }).join('');

      // Calculate position
      const itemWidth = 180; // 160px + 20px gap
      const winnerIndex = 30;
      const centerOffset = window.innerWidth / 2 - 90;
      const finalPosition = -(winnerIndex * itemWidth) + centerOffset;

      // Start animation
      setTimeout(() => {
        reel.style.transition = 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)';
        reel.style.transform = `translateX(${finalPosition}px)`;

        // Wait for animation
        setTimeout(() => {
          // Highlight winner
          const winnerEl = reel.children[winnerIndex];
          if (winnerEl) {
            winnerEl.classList.add('reel-item-winner');
          }

          setTimeout(() => {
            resolve();
          }, 500);
        }, 4000);
      }, 100);
    });
  }

  // ================== SHOW RESULT ==================
  function showResult(gift) {
    const value = currentCurrency === 'ton' ? `${gift.ton} TON` : `${gift.stars} ⭐`;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'case-result-modal';
    modal.innerHTML = `
      <div class="case-result-content">
        <div class="case-result-confetti" id="caseConfetti"></div>
        <h2 class="case-result-title">🎉 Congratulations!</h2>
        <div class="case-result-emoji">${gift.emoji}</div>
        <h3 class="case-result-name">${gift.name}</h3>
        <div class="case-result-value">${value}</div>
        <button class="case-result-btn" id="caseResultClose">Close</button>
      </div>
    `;

    document.body.appendChild(modal);

    // Create confetti
    createConfetti();

    // Close handler
    const closeBtn = document.getElementById('caseResultClose');
    const handleClose = () => {
      modal.remove();
      resetReel();
    };

    closeBtn.addEventListener('click', handleClose);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleClose();
      }
    });
  }

  function createConfetti() {
    const container = document.getElementById('caseConfetti');
    if (!container) return;

    const colors = ['#FFD700', '#00a6ff', '#ff6b6b', '#4ecdc4', '#a855f7'];
    
    for (let i = 0; i < 20; i++) {
      const piece = document.createElement('div');
      piece.className = 'case-confetti';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = Math.random() * 0.5 + 's';
      piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
      container.appendChild(piece);
    }
  }

  function resetReel() {
    const reel = document.getElementById('caseReel');
    if (reel) {
      // 🔥 Убираем класс opening и перезапускаем постоянную анимацию
      reel.classList.remove('opening');
      reel.style.transition = 'none';
      reel.style.transform = '';
      
      // Перезапускаем постоянную анимацию
      setTimeout(() => {
        initReelAnimation();
      }, 100);
    }
  }

  // ================== AUTO-INIT ==================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[Cases] Module loaded');

})();