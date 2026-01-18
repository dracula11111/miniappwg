/* public/js/nft-win-screen.js
   NFT Win Overlay (fullscreen) - Enhanced with animations and smooth scrolling

   - Blue themed, minimal effects
   - Demo:  title "You could have won" + button "Continue"
   - Real:  title "You've won!" + button "Claim"
   - 1 NFT: big hero with floating animation
   - 2+ NFTs: horizontal scrollable row with dots indicator
   - Smooth swipe with snap scrolling
   - Staggered entrance animations

   API:
     await window.NftWinOverlay.open({
       title: "You've won!",
       buttonText: "Claim",
       demo: false,
       currency: "ton"|"stars",
       currencyIcon: "/icons/ton.svg",
       nfts: [{ name, image, amount }],
       showTotal: true,
       total: 123,
       onPrimary: async () => true|false
     });
*/
(() => {
  const STYLE_ID = 'nft-win-overlay-style';
  const OVERLAY_ID = 'nftWinOverlay';

  const GAP = 14;
  const MIN_TILE = 96;
  const MAX_TILE = 132;

  let overlayEl = null;
  let titleEl, totalWrapEl, totalIconEl, totalEl, contentEl, primaryBtn, errEl, dotsEl;
  let prevBodyOverflow = '';
  let activeHandler = null;
  let scrollObserver = null;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // Generate random blue shades for background
  // Generate color shades based on case theme
  function generateThemeShades(caseId) {
    let baseHue;
    const variant = Math.random();
    
    // Case 3 (Sweet Sugar) - Pink/Rose theme
    if (caseId === 'case3') {
      if (variant < 0.5) {
        // Pure pink (most common)
        baseHue = 320 + Math.random() * 20; // 320-340
      } else if (variant < 0.8) {
        // Rose pink
        baseHue = 340 + Math.random() * 15; // 340-355
      } else {
        // Magenta pink (rare, for variety)
        baseHue = 300 + Math.random() * 20; // 300-320
      }
    } 
    // Default - Blue theme (for all other cases)
    else {
      if (variant < 0.5) {
        // Pure blue (most common)
        baseHue = 200 + Math.random() * 20; // 200-220
      } else if (variant < 0.8) {
        // Cyan-blue
        baseHue = 190 + Math.random() * 20; // 190-210
      } else {
        // Purple-blue (rare, for variety)
        baseHue = 220 + Math.random() * 20; // 220-240
      }
    }
    
    // Generate 3 shades: light, medium, dark
    const shades = {
      light: {
        h: baseHue,
        s: 70 + Math.random() * 20, // 70-90%
        l: 55 + Math.random() * 15, // 55-70%
        a: 0.45 + Math.random() * 0.15 // 0.45-0.60
      },
      medium: {
        h: baseHue - 5 + Math.random() * 10,
        s: 65 + Math.random() * 20, // 65-85%
        l: 45 + Math.random() * 15, // 45-60%
        a: 0.25 + Math.random() * 0.10 // 0.25-0.35
      },
      dark1: {
        h: baseHue - 10 + Math.random() * 15,
        s: 60 + Math.random() * 20, // 60-80%
        l: 25 + Math.random() * 15, // 25-40%
      },
      dark2: {
        h: baseHue - 15 + Math.random() * 20,
        s: 50 + Math.random() * 25, // 50-75%
        l: 15 + Math.random() * 15, // 15-30%
      },
      dark3: {
        h: baseHue - 20 + Math.random() * 25,
        s: 45 + Math.random() * 25, // 45-70%
        l: 10 + Math.random() * 12, // 10-22%
      }
    };
    
    return shades;
  }



  function applyRandomBackground(caseId) {
    const bg = overlayEl?.querySelector('.nftwo-bg');
    if (!bg) return;
    
    const shades = generateThemeShades(caseId);
    
    // Create gradient with random shades
    const gradient = `
      radial-gradient(1200px 700px at 50% -12%, 
        hsla(${shades.light.h}, ${shades.light.s}%, ${shades.light.l}%, ${shades.light.a}), 
        rgba(0,0,0,0) 55%),
      radial-gradient(900px 520px at 50% 18%, 
        hsla(${shades.medium.h}, ${shades.medium.s}%, ${shades.medium.l}%, ${shades.medium.a}), 
        rgba(0,0,0,0) 60%),
      linear-gradient(180deg, 
        hsl(${shades.dark1.h}, ${shades.dark1.s}%, ${shades.dark1.l}%) 0%, 
        hsl(${shades.dark2.h}, ${shades.dark2.s}%, ${shades.dark2.l}%) 75%, 
        hsl(${shades.dark3.h}, ${shades.dark3.s}%, ${shades.dark3.l}%) 100%)
    `.trim().replace(/\s+/g, ' ');
    
    bg.style.background = gradient;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}[hidden]{display:none!important;}
      #${OVERLAY_ID}{
        position:fixed; inset:0;
        z-index:100000;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:22px 18px 26px;
        color:#fff;
        -webkit-tap-highlight-color: transparent;
      }

      /* Background (blue with random shades applied via JS) */
      #${OVERLAY_ID} .nftwo-bg{
        position:absolute; inset:0;
        /* Default fallback gradient */
        background:
          radial-gradient(1200px 700px at 50% -12%, rgba(120, 190, 255, 0.55), rgba(0,0,0,0) 55%),
          radial-gradient(900px 520px at 50% 18%, rgba(60, 140, 255, 0.30), rgba(0,0,0,0) 60%),
          linear-gradient(180deg, #0a3e7a 0%, #071a35 75%, #06162d 100%);
        overflow:hidden;
        transition: background 0.6s ease;
      }
      #${OVERLAY_ID} .nftwo-bg::before{
        content:"";
        position:absolute; left:50%; top:-38%;
        width:1200px; height:1200px;
        transform:translateX(-50%);
        background: repeating-conic-gradient(
          from 180deg,
          rgba(255,255,255,0.12) 0deg,
          rgba(255,255,255,0.0) 10deg,
          rgba(255,255,255,0.0) 20deg
        );
        opacity:.22;
        filter: blur(1px);
        mask-image: radial-gradient(circle at 50% 50%, #000 0%, #000 40%, transparent 66%);
        -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 0%, #000 40%, transparent 66%);
        pointer-events:none;
      }

      #${OVERLAY_ID} .nftwo-panel{
        position:relative;
        width:min(520px, 100%);
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:14px;
        padding:22px 18px 18px;
      }

      #${OVERLAY_ID} .nftwo-title{
        font-size:38px;
        line-height:1.05;
        font-weight:800;
        text-align:center;
        letter-spacing:-0.02em;
        margin:0;
        text-shadow: 0 10px 32px rgba(0,0,0,0.35);
        animation: titleBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      @keyframes titleBounce {
        0% {
          opacity: 0;
          transform: scale(0.8) translateY(-20px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      
      @media (max-width: 420px){
        #${OVERLAY_ID} .nftwo-title{ font-size:34px; }
      }

      #${OVERLAY_ID} .nftwo-total{
        display:flex; align-items:center; justify-content:center;
        gap:8px;
        margin-top:6px;
        opacity:.95;
        font-size:22px;
        font-weight:700;
        animation: fadeIn 0.4s ease 0.2s both;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: .95; }
      }
      
      #${OVERLAY_ID} .nftwo-total img{
        width:18px; height:18px; object-fit:contain;
        filter: drop-shadow(0 6px 16px rgba(0,0,0,.35));
      }

      /* Single NFT */
      #${OVERLAY_ID} .nftwo-hero{
        width:100%;
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:10px;
        margin-top:2px;
      }
      #${OVERLAY_ID} .nftwo-hero-img{
        position:relative;
        width:180px; height:180px;
        display:grid; place-items:center;
        border-radius:34px;
        animation: heroEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      
      @keyframes heroEnter {
        0% {
          opacity: 0;
          transform: scale(0.7) translateY(30px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      
      /* subtle glow behind (not huge) */
      #${OVERLAY_ID} .nftwo-hero-img::before{
        content:"";
        position:absolute; inset:-10px;
        background: radial-gradient(circle at 50% 45%, rgba(140, 210, 255, 0.38), rgba(0,0,0,0) 62%);
        filter: blur(8px);
        opacity:.65;
        pointer-events:none;
        animation: glowPulse 2s ease-in-out infinite;
      }
      
      @keyframes glowPulse {
        0%, 100% { opacity: .65; }
        50% { opacity: .85; }
      }
      
      #${OVERLAY_ID} .nftwo-hero-img img{
        width:100%; height:100%;
        object-fit:contain;
        filter: drop-shadow(0 22px 44px rgba(0,0,0,0.40));
        transform: translateZ(0);
        animation: heroImgFloat 3s ease-in-out infinite;
      }
      
      @keyframes heroImgFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }
      
      #${OVERLAY_ID} .nftwo-name{
        font-size:18px;
        font-weight:700;
        opacity:.95;
        text-align:center;
        max-width: 340px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        animation: fadeInUp 0.4s ease 0.3s both;
      }
      
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: .95;
          transform: translateY(0);
        }
      }

      /* Price pill (single + multi) */
      #${OVERLAY_ID} .nftwo-pill{
        display:flex; align-items:center; justify-content:center;
        gap:8px;
        padding:10px 14px;
        border-radius:999px;
        background: rgba(255,255,255,0.12);
        border:1px solid rgba(255,255,255,0.10);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        font-weight:800;
        font-size:18px;
        animation: fadeInUp 0.4s ease 0.4s both;
      }
      #${OVERLAY_ID} .nftwo-pill img{ width:16px; height:16px; object-fit:contain; }

      /* Row (2+ NFTs) */
      #${OVERLAY_ID} .nftwo-row{
        width:100%;
        display:flex;
        gap:${GAP}px;
        padding:10px 8px 2px;
        overflow-x:auto;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type:x mandatory;
        scrollbar-width: none;
        touch-action: pan-x;
        overscroll-behavior: contain;
        scroll-padding: 0 20%;
      }
      #${OVERLAY_ID} .nftwo-row::-webkit-scrollbar{ height:0; }
      #${OVERLAY_ID} .nftwo-row.is-center{ justify-content:center; }

      /* Swipe hint animation */
      @keyframes swipeHint {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(-12px); }
      }
      #${OVERLAY_ID} .nftwo-row.show-hint{
        animation: swipeHint 1.2s ease-in-out 0.8s 2;
      }

      /* Entrance animations for tiles */
      @keyframes tileEnter {
        0% {
          opacity: 0;
          transform: translateY(20px) scale(0.85);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      #${OVERLAY_ID} .nftwo-tile{
        flex:0 0 auto;
        width: var(--tile, 132px);
        display:flex;
        flex-direction:column;
        align-items:center;
        scroll-snap-align:center;
        opacity: 0;
        animation: tileEnter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      #${OVERLAY_ID} .nftwo-tile:nth-child(1){ animation-delay: 0.1s; }
      #${OVERLAY_ID} .nftwo-tile:nth-child(2){ animation-delay: 0.2s; }
      #${OVERLAY_ID} .nftwo-tile:nth-child(3){ animation-delay: 0.3s; }
      #${OVERLAY_ID} .nftwo-tile:nth-child(4){ animation-delay: 0.4s; }
      #${OVERLAY_ID} .nftwo-tile:nth-child(5){ animation-delay: 0.5s; }

      /* Dots indicator */
      #${OVERLAY_ID} .nftwo-dots{
        display: flex;
        gap: 8px;
        justify-content: center;
        align-items: center;
        margin-top: 12px;
        padding: 8px;
      }
      #${OVERLAY_ID} .nftwo-dot{
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255,255,255,0.25);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
      }
      #${OVERLAY_ID} .nftwo-dot.active{
        width: 24px;
        border-radius: 4px;
        background: rgba(255,255,255,0.85);
        box-shadow: 0 0 12px rgba(255,255,255,0.5);
      }

      /* Remove "white panel" look */
      #${OVERLAY_ID} .nftwo-card{
        width: var(--tile, 132px);
        height: var(--tile, 132px);
        border-radius:26px;
        background: rgba(80,150,255,0.08);
        border:1px solid rgba(255,255,255,0.10);
        display:grid;
        place-items:center;
        overflow:hidden;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      #${OVERLAY_ID} .nftwo-tile:active .nftwo-card{
        transform: scale(0.95);
      }
      #${OVERLAY_ID} .nftwo-card img{
        width:72%;
        height:72%;
        object-fit:contain;
        filter: drop-shadow(0 18px 34px rgba(0,0,0,0.35));
        transform: translateZ(0);
        transition: transform 0.3s ease;
      }
      #${OVERLAY_ID} .nftwo-tile:hover .nftwo-card img{
        transform: translateZ(0) scale(1.05);
      }

      /* Multi price pill: SMALL and BELOW the image */
      #${OVERLAY_ID} .nftwo-tile .nftwo-pill{
        margin-top:10px;
        padding:7px 11px;
        font-size:14px;
        gap:6px;
      }
      #${OVERLAY_ID} .nftwo-tile .nftwo-pill img{ width:14px; height:14px; }

      /* Primary button */
      #${OVERLAY_ID} .nftwo-btn{
        width:min(520px, 100%);
        height:56px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.14);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color:#fff;
        font-size:18px;
        font-weight:800;
        letter-spacing:.01em;
        display:flex;
        align-items:center;
        justify-content:center;
        cursor:pointer;
        user-select:none;
        transition: transform 0.2s ease, background 0.2s ease;
        animation: fadeInUp 0.4s ease 0.5s both;
      }
      #${OVERLAY_ID} .nftwo-btn:hover{
        background: rgba(255,255,255,0.18);
      }
      #${OVERLAY_ID} .nftwo-btn:active{ 
        transform: scale(0.97); 
      }
      #${OVERLAY_ID} .nftwo-btn[disabled]{ 
        opacity:.6; 
        cursor:default;
        transform: none;
      }

      #${OVERLAY_ID} .nftwo-err{
        min-height:18px;
        font-size:14px;
        opacity:.85;
        text-align:center;
      }

      @media (prefers-reduced-motion: reduce){
        #${OVERLAY_ID} .nftwo-bg{ transition: none; }
        #${OVERLAY_ID} .nftwo-bg::before{ display:none; }
        #${OVERLAY_ID} .nftwo-btn:active{ transform:none; }
        #${OVERLAY_ID} .nftwo-title{ animation: none; }
        #${OVERLAY_ID} .nftwo-total{ animation: none; opacity: .95; }
        #${OVERLAY_ID} .nftwo-hero-img{ animation: none; }
        #${OVERLAY_ID} .nftwo-hero-img::before{ animation: none; }
        #${OVERLAY_ID} .nftwo-hero-img img{ animation: none; }
        #${OVERLAY_ID} .nftwo-name{ animation: none; opacity: .95; }
        #${OVERLAY_ID} .nftwo-pill{ animation: none; }
        #${OVERLAY_ID} .nftwo-btn{ animation: none; }
        #${OVERLAY_ID} .nftwo-tile{ animation: none; opacity: 1; }
        #${OVERLAY_ID} .nftwo-row.show-hint{ animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    injectStyle();

    overlayEl = document.createElement('div');
    overlayEl.id = OVERLAY_ID;
    overlayEl.hidden = true;
    overlayEl.innerHTML = `
      <div class="nftwo-bg"></div>
      <div class="nftwo-panel" role="dialog" aria-modal="true">
        <div>
          <h1 class="nftwo-title" id="nftwoTitle">You've won!</h1>
          <div class="nftwo-total" id="nftwoTotalWrap" hidden>
            <img id="nftwoTotalIcon" src="/icons/ton.svg" alt="">
            <span id="nftwoTotal">0</span>
          </div>
        </div>

        <div id="nftwoContent" style="width:100%"></div>
        <div class="nftwo-dots" id="nftwoDots" hidden></div>

        <button class="nftwo-btn" id="nftwoBtn" type="button">Claim</button>
        <div class="nftwo-err" id="nftwoErr"></div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    titleEl = overlayEl.querySelector('#nftwoTitle');
    contentEl = overlayEl.querySelector('#nftwoContent');
    totalWrapEl = overlayEl.querySelector('#nftwoTotalWrap');
    totalEl = overlayEl.querySelector('#nftwoTotal');
    totalIconEl = overlayEl.querySelector('#nftwoTotalIcon');
    primaryBtn = overlayEl.querySelector('#nftwoBtn');
    errEl = overlayEl.querySelector('#nftwoErr');
    dotsEl = overlayEl.querySelector('#nftwoDots');

    return overlayEl;
  }

  function fmt(n, currency) {
    const x = Number(n);
    if (!Number.isFinite(x)) return currency === 'stars' ? '0' : '0';
    if (currency === 'stars') return String(Math.round(x));
    const v = (Math.round(x * 100) / 100).toFixed(2);
    return v.replace(/\.00$/, '');
  }

  function lockBody(locked) {
    if (locked) {
      prevBodyOverflow = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prevBodyOverflow;
    }
  }

  function layoutRow(count) {
    const row = overlayEl?.querySelector('.nftwo-row');
    const panel = overlayEl?.querySelector('.nftwo-panel');
    if (!row || !panel || !count) return;

    const panelW = Math.max(0, panel.getBoundingClientRect().width);
    const usable = Math.max(0, panelW - 32); // More padding
    const target = Math.floor((usable - (GAP * (count - 1))) / count);
    const tile = clamp(target, MIN_TILE, MAX_TILE);

    row.style.setProperty('--tile', `${tile}px`);

    const groupW = tile * count + GAP * (count - 1);
    const needsScroll = groupW > usable - 2;
    
    row.classList.toggle('is-center', !needsScroll);
    
    // Show swipe hint for scrollable content
    if (needsScroll && count > 1) {
      setTimeout(() => row.classList.add('show-hint'), 500);
      setTimeout(() => row.classList.remove('show-hint'), 3000);
    }
    
    return needsScroll; // Return whether scroll is needed
  }

  function setupDots(count, needsScroll) {
    if (!dotsEl) return;
    
    // Hide dots if:
    // - Only 1 item (single NFT hero view)
    // - Content fits without scrolling (e.g. 2 NFTs that fit on screen)
    if (count <= 1 || !needsScroll) {
      dotsEl.hidden = true;
      dotsEl.innerHTML = ''; // Clear dots
      return;
    }

    // Show dots only when multiple items need scrolling
    dotsEl.hidden = false;
    dotsEl.innerHTML = Array.from({ length: count }, (_, i) => 
      `<div class="nftwo-dot" data-index="${i}"></div>`
    ).join('');

    const dots = dotsEl.querySelectorAll('.nftwo-dot');
    dots[0]?.classList.add('active');

    // Click handler for dots
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        const row = overlayEl?.querySelector('.nftwo-row');
        const tiles = row?.querySelectorAll('.nftwo-tile');
        if (tiles?.[i]) {
          tiles[i].scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest', 
            inline: 'center' 
          });
        }
      });
    });
  }

  function updateActiveDot() {
    if (!dotsEl) return;
    
    const row = overlayEl?.querySelector('.nftwo-row');
    const tiles = row?.querySelectorAll('.nftwo-tile');
    const dots = dotsEl.querySelectorAll('.nftwo-dot');
    
    if (!row || !tiles?.length || !dots?.length) return;

    const scrollLeft = row.scrollLeft;
    const containerWidth = row.offsetWidth;
    
    let activeIndex = 0;
    let minDistance = Infinity;

    tiles.forEach((tile, i) => {
      const tileLeft = tile.offsetLeft;
      const tileCenter = tileLeft + tile.offsetWidth / 2;
      const containerCenter = scrollLeft + containerWidth / 2;
      const distance = Math.abs(tileCenter - containerCenter);
      
      if (distance < minDistance) {
        minDistance = distance;
        activeIndex = i;
      }
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === activeIndex);
    });
  }

  function setupScrollTracking() {
    const row = overlayEl?.querySelector('.nftwo-row');
    if (!row) return;

    // Clean up previous observer
    if (scrollObserver) {
      scrollObserver.disconnect();
    }

    // Throttled scroll handler
    let scrollTimeout;
    row.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateActiveDot, 50);
    }, { passive: true });

    // Intersection observer for smooth dot updates
    const tiles = row.querySelectorAll('.nftwo-tile');
    scrollObserver = new IntersectionObserver((entries) => {
      updateActiveDot();
    }, {
      root: row,
      threshold: 0.5
    });

    tiles.forEach(tile => scrollObserver.observe(tile));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function renderContent({ nfts = [], currencyIcon, currency, hideSinglePrice }) {
    if (!contentEl) return;

    const list = Array.isArray(nfts) ? nfts : [];
    const safeIcon = currencyIcon || (currency === 'stars' ? '/icons/stars.svg' : '/icons/ton.svg');

    if (list.length <= 1) {
      const nft = list[0] || {};
      const name = (nft.name || '').toString().trim();

      const nameBlock = name ? `<div class="nftwo-name">${escapeHtml(name)}</div>` : '';
      const priceBlock = hideSinglePrice
        ? ''
        : `<div class="nftwo-pill"><img src="${safeIcon}" alt=""><span>${fmt(nft.amount, currency)}</span></div>`;

      contentEl.innerHTML = `
        <div class="nftwo-hero">
          <div class="nftwo-hero-img">
            <img src="${escapeAttr(nft.image || '')}" alt="">
          </div>
          ${nameBlock}
          ${priceBlock}
        </div>
      `;
      
      setupDots(0, false); // Hide dots for single NFT
      return;
    }

    const tiles = list.map((nft) => {
      const amount = fmt(nft.amount, currency);
      return `
        <div class="nftwo-tile">
          <div class="nftwo-card">
            <img src="${escapeAttr(nft.image || '')}" alt="">
          </div>
          <div class="nftwo-pill">
            <img src="${safeIcon}" alt="">
            <span>${amount}</span>
          </div>
        </div>
      `;
    }).join('');

    contentEl.innerHTML = `<div class="nftwo-row">${tiles}</div>`;
    
    requestAnimationFrame(() => {
      const needsScroll = layoutRow(list.length);
      setupDots(list.length, needsScroll);
      
      // Only setup scroll tracking if scroll is actually needed
      if (needsScroll) {
        setupScrollTracking();
      }
    });
  }

  function setTotal({ show, currencyIcon, total, currency }) {
    if (!totalWrapEl || !totalEl || !totalIconEl) return;
    if (!show || typeof total === 'undefined' || total === null) {
      totalWrapEl.hidden = true;
      return;
    }
    totalWrapEl.hidden = false;
    totalIconEl.src = currencyIcon || (currency === 'stars' ? '/icons/stars.svg' : '/icons/ton.svg');
    totalEl.textContent = fmt(total, currency);
  }

  function hide() {
    if (!overlayEl) return;
    
    // Clean up observer
    if (scrollObserver) {
      scrollObserver.disconnect();
      scrollObserver = null;
    }
    
    overlayEl.hidden = true;
    lockBody(false);
  }

  async function open(opts = {}) {
    ensureOverlay();

    const currency = (opts.currency === 'stars') ? 'stars' : 'ton';
    const currencyIcon = opts.currencyIcon || (currency === 'stars' ? '/icons/stars.svg' : '/icons/ton.svg');
    const caseId = opts.caseId || 'case1'; // Get case ID from options

    // Apply themed background (blue for most, pink for case3)
    applyRandomBackground(caseId);


    titleEl.textContent = String(opts.title || (opts.demo ? 'You could have won' : "You've won!"));
    primaryBtn.textContent = String(opts.buttonText || (opts.demo ? 'Continue' : 'Claim'));
    errEl.textContent = '';

    renderContent({
      nfts: opts.nfts || [],
      currencyIcon,
      currency,
      hideSinglePrice: !!opts.showTotal
    });

    setTotal({
      show: !!opts.showTotal,
      currencyIcon,
      total: opts.total,
      currency
    });

    overlayEl.hidden = false;
    lockBody(true);

    if (activeHandler) primaryBtn.removeEventListener('click', activeHandler);

    return new Promise((resolve) => {
      activeHandler = async () => {
        if (primaryBtn.disabled) return;
        errEl.textContent = '';
        primaryBtn.disabled = true;

        try {
          let ok = true;
          if (typeof opts.onPrimary === 'function') {
            const r = await opts.onPrimary();
            ok = (r !== false);
          }
          if (!ok) {
            errEl.textContent = 'Ошибка. Попробуй ещё раз.';
            return;
          }
          hide();
          resolve(true);
        } finally {
          primaryBtn.disabled = false;
        }
      };
      primaryBtn.addEventListener('click', activeHandler, { passive: true });
    });
  }

  window.NftWinOverlay = { open, hide };
})();