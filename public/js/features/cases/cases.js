// public/js/cases.js - Case opening system with realistic spin animation
(() => {
  console.log('[Cases] 🎁 Starting cases module');

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // ====== ASSET URL HELPERS ======
  // Важно для Telegram WebApp и любых деплоев в подпапку: убираем ведущий "/" и строим URL относительно document.baseURI.
  const __ASSET_BASE__ = new URL('.', document.baseURI).toString();
  function assetUrl(p) {
    if (!p) return p;
    const s = String(p);
    // абсолютные ссылки / data / blob оставляем как есть
    if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
    // если путь начинается с "/", делаем его относительным к baseURI, а не к доменному корню
    const clean = s.startsWith('/') ? s.slice(1) : s;
    return new URL(clean, __ASSET_BASE__).toString();
  }



  // ====== CASE DATA ======
  // TON and STARS use separate case pools.
  const TON_CASES = {
    case1: {
      id: 'case1',
      name: 'Basic',
      price: { ton: 0.10, stars: 20 },
      items: [
        { id: 'gift1',  icon: 'gift1.png',  giftChance: 0.001, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift2',  icon: 'gift2.png',  giftChance: 0.001, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift3',  icon: 'gift3.png',  giftChance: 0.001, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift4',  icon: 'gift4.png',  giftChance: 0.01, price: { ton: 0.46, stars: 50  }, rarity: 'epic'      },
        { id: 'gift5',  icon: 'gift5.png',  giftChance: 0.01, price: { ton: 0.46, stars: 50  }, rarity: 'epic'      },
        { id: 'gift6',  icon: 'gift6.png',  giftChance: 0.01, price: { ton: 0.46, stars: 50  }, rarity: 'epic'      },
        { id: 'gift7',  icon: 'gift7.png',  giftChance: 0.03, price: { ton: 0.46, stars: 50  }, rarity: 'rare'      },
        { id: 'gift8',  icon: 'gift8.png',  giftChance: 0.03, price: { ton: 0.23, stars: 25  }, rarity: 'rare'      },
        { id: 'gift9',  icon: 'gift9.png',  giftChance: 0.03, price: { ton: 0.23, stars: 25  }, rarity: 'common'    },
        { id: 'gift10', icon: 'gift10.png', giftChance: 0.50, price: { ton: 0.14, stars: 15  }, rarity: 'common'    },
        { id: 'gift11', icon: 'gift11.png', giftChance: 0.50, price: { ton: 0.14, stars: 15  }, rarity: 'common'    },
        { id: 'gift12', icon: 'stars.webp', giftChance: 8.00, price: { ton: 0.015, stars: 5  }, rarity: 'common'    },
      ]
    },
    case2: {
      id: 'case2',
      name: 'NFT Hunt',
      price: { ton: 0.15, stars: 30 },
      items: [
        { id: 'Stellar Rocket', type: 'nft', icon: 'RaketaNFT.png', nftChance: 0.01, price: { ton: 3.46, stars: 350 }, rarity: 'legendary' },
        { id: 'Ice Cream', type: 'nft', icon: 'IceCreamNFT.png', nftChance: 0.01, price: { ton: 2.83, stars: 359 }, rarity: 'epic' },
        { id: 'Instant Ramen', type: 'nft', icon: 'RamenNFT.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'rare' },
        { id: 'gift1',  icon: 'gift1.png',  giftChance: 0.03, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift4',  icon: 'gift4.png',  giftChance: 0.08, price: { ton: 0.46, stars: 50  }, rarity: 'epic' },
        { id: 'gift7',  icon: 'gift7.png',  giftChance: 0.18, price: { ton: 0.46, stars: 50  }, rarity: 'rare' },
        { id: 'gift9',  icon: 'gift9.png',  giftChance: 0.71, price: { ton: 0.23, stars: 25  }, rarity: 'common' },
        { id: 'gift12', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
      ]
    },
    case3: {
      id: 'case3',
      name: 'Sweet Sugar',
      price: { ton: 0.20, stars: 40 },
      items: [
        { id: 'Ice Cream', type: 'nft', icon: 'IceCreamNFtSkin.png', nftChance: 0.01, price: { ton: 3.46, stars: 350 }, rarity: 'legendary' },
        { id: 'Cookie Heart', type: 'nft', icon: 'CookieHeartNFTSkin.png', nftChance: 0.01, price: { ton: 2.83, stars: 359 }, rarity: 'legendary' },
        { id: 'Mousse Cake', type: 'nft', icon: 'MousseCakeNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'Lol Pop', type: 'nft', icon: 'LolPopNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'Berry Box', type: 'nft', icon: 'BerryBoxNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'gift7',  icon: 'gift7.png',  giftChance: 0.18, price: { ton: 0.46, stars: 50  }, rarity: 'rare' },
        { id: 'gift12', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
        { id: 'gift13', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.01, stars: 3 }, rarity: 'common' },
      ]
    },
    case4: {
      id: 'case4',
      name: 'Ice Blue',
      price: { ton: 0.25, stars: 50 },
      items: [
        { id: 'Electric Skull', type: 'nft', icon: 'ElectricSkullNFTSkin.png', nftChance: 0.00, price: { ton: 3.46, stars: 350 }, rarity: 'legendary' },
        { id: 'Vintage Cigar', type: 'nft', icon: 'VintageCigarNFTSkin.png', nftChance: 0.00, price: { ton: 2.83, stars: 359 }, rarity: 'legendary' },
        { id: 'Voodoo Doll', type: 'nft', icon: 'VoodooDollNFTSkin.png', nftChance: 0.00, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'Flying Broom', type: 'nft', icon: 'FlyingBroomNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'Hex Pot', type: 'nft', icon: 'HexPotNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.030, stars: 10 }, rarity: 'common' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.01, stars: 3 }, rarity: 'common' },
      ]
    },
    case5: {
      id: 'case5',
      name: 'Cat House',
      price: { ton: 1, stars: 200 },
      items: [
        { id: 'Mighty Arm', type: 'nft', icon: 'MightyArmNFTSkin.png', nftChance: 0.00, price: { ton: 2.5, stars: 250 }, rarity: 'legendary' },
        { id: 'Scared Cat', type: 'nft', icon: 'ScaredCatNFTSkin.png', nftChance: 0.00, price: { ton: 2.8, stars: 280 }, rarity: 'legendary' },
        { id: 'Bonded Ring', type: 'nft', icon: 'BondedRingNFTSkin.png', nftChance: 0.00, price: { ton: 3.0, stars: 300  }, rarity: 'legendary' },
        { id: 'Genie Lamp', type: 'nft', icon: 'GenieLampNFTSkin.png', nftChance: 0.00, price: { ton: 2.7, stars: 270  }, rarity: 'legendary' },
        { id: 'Jack-In-The-Box', type: 'nft', icon: 'JackInTheBoxNFTSkin.png', nftChance: 0.01, price: { ton: 2.6, stars: 260  }, rarity: 'legendary' },
        { id: 'Winter Wreath', type: 'nft', icon: 'WinterWreathNFTSkin.png', nftChance: 0.01, price: { ton: 2.9, stars: 290  }, rarity: 'legendary' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.065, stars: 25 }, rarity: 'common' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.030, stars: 10 }, rarity: 'common' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
      ]
    }
  };

  const STAR_CASES = {
    case1: {
      id: 'case1',
      name: 'Basic',
      price: { ton: 0.10, stars: 3 },
      items: [
        { id: 'Bow Tie', type: 'nft', icon: 'BowTieNFTSkin.png', nftChance: 0.01, price: { ton: 1.95, stars: 195 }, rarity: 'legendary' },
        { id: 'Pet Snake', type: 'nft', icon: 'PetSnakeNFTSkin.png', nftChance: 0.01, price: { ton: 1.85, stars: 185 }, rarity: 'epic' },
        { id: 'Restless Jar', type: 'nft', icon: 'RestlessJArNFTSkin.png', nftChance: 0.01, price: { ton: 2.05, stars: 205 }, rarity: 'legendary' },
        { id: 'Flying Broom', type: 'nft', icon: 'FlyingBroomNFTSkin2.png', nftChance: 0.01, price: { ton: 1.75, stars: 175 }, rarity: 'epic' },
        { id: 'gift1', icon: 'gift1.png', giftChance: 0.03, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift2', icon: 'gift2.png', giftChance: 0.06, price: { ton: 0.92, stars: 100 }, rarity: 'epic' },
        { id: 'stars2', icon: 'stars.webp', giftChance: 0.42, price: { ton: 0.006, stars: 2 }, rarity: 'common' },
        { id: 'stars1', icon: 'stars.webp', giftChance: 1.30, price: { ton: 0.003, stars: 1 }, rarity: 'common' },
      ]
    },
    case2: {
      id: 'case2',
      name: 'NFT Hunt',
      price: { ton: 0.15, stars: 5 },
      items: [
        { id: 'Cookie Heart', type: 'nft', icon: 'CookieHeartNFTSkin.png', nftChance: 0.01, price: { ton: 1.95, stars: 195 }, rarity: 'legendary' },
        { id: 'Pool Float', type: 'nft', icon: 'PoolFloatNFTSkin.png', nftChance: 0.01, price: { ton: 1.80, stars: 180 }, rarity: 'epic' },
        { id: 'Chill Flame', type: 'nft', icon: 'ChillFlameNFTSkin.png', nftChance: 0.01, price: { ton: 1.72, stars: 172 }, rarity: 'epic' },
        { id: 'Ginger Cookie', type: 'nft', icon: 'GingerCookieNFTSkin.png', nftChance: 0.01, price: { ton: 1.65, stars: 165 }, rarity: 'rare' },
        { id: 'gift1', icon: 'gift1.png', giftChance: 0.03, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift2', icon: 'gift2.png', giftChance: 0.06, price: { ton: 0.92, stars: 100 }, rarity: 'epic' },
        { id: 'stars3', icon: 'stars.webp', giftChance: 0.22, price: { ton: 0.009, stars: 3 }, rarity: 'common' },
        { id: 'stars2', icon: 'stars.webp', giftChance: 0.45, price: { ton: 0.006, stars: 2 }, rarity: 'common' },
        { id: 'stars1', icon: 'stars.webp', giftChance: 1.20, price: { ton: 0.003, stars: 1 }, rarity: 'common' },
      ]
    },
    case3: {
      id: 'case3',
      name: 'Sweet Sugar',
      price: { ton: 0.20, stars: 10 },
      items: [
        { id: 'Jolly Chimp', type: 'nft', icon: 'JollyChimpNFTSkin.png', nftChance: 0.01, price: { ton: 2.15, stars: 215 }, rarity: 'legendary' },
        { id: 'Gem Signet', type: 'nft', icon: 'GemSignetNFTSkin.png', nftChance: 0.01, price: { ton: 2.00, stars: 200 }, rarity: 'legendary' },
        { id: 'Vintage Cigar', type: 'nft', icon: 'VintageCigarNFTSkin2.png', nftChance: 0.01, price: { ton: 1.90, stars: 190 }, rarity: 'epic' },
        { id: 'Timeless Book', type: 'nft', icon: 'TimelessBookNFTSkin.png', nftChance: 0.01, price: { ton: 1.80, stars: 180 }, rarity: 'epic' },
        { id: 'gift1', icon: 'gift1.png', giftChance: 0.03, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift2', icon: 'gift2.png', giftChance: 0.06, price: { ton: 0.92, stars: 100 }, rarity: 'epic' },
        { id: 'stars3', icon: 'stars.webp', giftChance: 0.22, price: { ton: 0.009, stars: 3 }, rarity: 'common' },
        { id: 'stars2', icon: 'stars.webp', giftChance: 0.45, price: { ton: 0.006, stars: 2 }, rarity: 'common' },
        { id: 'stars1', icon: 'stars.webp', giftChance: 1.20, price: { ton: 0.003, stars: 1 }, rarity: 'common' },
      ]
    },
    case4: {
      id: 'case4',
      name: 'Ice Blue',
      price: { ton: 0.25, stars: 20 },
      items: [
        { id: 'Astral Shard', type: 'nft', icon: 'AstralShardNFTSkin.png', nftChance: 0.01, price: { ton: 2.40, stars: 240 }, rarity: 'legendary' },
        { id: 'Perfume Bottle', type: 'nft', icon: 'PerfumeBottleNFTSkin.png', nftChance: 0.01, price: { ton: 2.10, stars: 210 }, rarity: 'epic' },
        { id: 'Precious Peach', type: 'nft', icon: 'PreciousPeachNFTSkin.png', nftChance: 0.01, price: { ton: 2.25, stars: 225 }, rarity: 'legendary' },
        { id: 'Signet Ring', type: 'nft', icon: 'SignetRingNFTSkin.png', nftChance: 0.01, price: { ton: 1.95, stars: 195 }, rarity: 'epic' },
        { id: 'gift1', icon: 'gift1.png', giftChance: 0.03, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift2', icon: 'gift2.png', giftChance: 0.06, price: { ton: 0.92, stars: 100 }, rarity: 'epic' },
        { id: 'stars10', icon: 'stars.webp', giftChance: 0.15, price: { ton: 0.030, stars: 10 }, rarity: 'common' },
        { id: 'stars7', icon: 'stars.webp', giftChance: 0.26, price: { ton: 0.021, stars: 7 }, rarity: 'common' },
        { id: 'stars4', icon: 'stars.webp', giftChance: 0.55, price: { ton: 0.012, stars: 4 }, rarity: 'common' },
      ]
    },
    case5: {
      id: 'case5',
      name: 'Cat House',
      price: { ton: 1, stars: 30 },
      items: [
        { id: 'Plush Pepe', type: 'nft', icon: 'PlushPepeNFTSkin.png', nftChance: 0.01, price: { ton: 2.75, stars: 275 }, rarity: 'legendary' },
        { id: 'Mighty Arm', type: 'nft', icon: 'MightyArmNFTSkin2.png', nftChance: 0.01, price: { ton: 2.50, stars: 250 }, rarity: 'legendary' },
        { id: 'Heroic Helmet', type: 'nft', icon: 'HeroicHelmetNFTSkin.png', nftChance: 0.01, price: { ton: 2.35, stars: 235 }, rarity: 'epic' },
        { id: 'Durov\'s Cap', type: 'nft', icon: 'Durov\'sCapNFTSkin.png', nftChance: 0.01, price: { ton: 2.20, stars: 220 }, rarity: 'epic' },
        { id: 'gift1', icon: 'gift1.png', giftChance: 0.03, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift2', icon: 'gift2.png', giftChance: 0.05, price: { ton: 0.92, stars: 100 }, rarity: 'epic' },
        { id: 'gift4', icon: 'gift4.png', giftChance: 0.09, price: { ton: 0.46, stars: 50 }, rarity: 'epic' },
        { id: 'gift7', icon: 'gift7.png', giftChance: 0.16, price: { ton: 0.46, stars: 50 }, rarity: 'rare' },
        { id: 'gift9', icon: 'gift9.png', giftChance: 0.27, price: { ton: 0.23, stars: 25 }, rarity: 'common' },
        { id: 'stars15', icon: 'stars.webp', giftChance: 0.11, price: { ton: 0.045, stars: 15 }, rarity: 'common' },
        { id: 'stars10', icon: 'stars.webp', giftChance: 0.22, price: { ton: 0.030, stars: 10 }, rarity: 'common' },
        { id: 'stars5', icon: 'stars.webp', giftChance: 0.80, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
      ]
    }
  };

  const DEFAULT_GIFT_ICONS = [
    'gift1.png',
    'gift2.png',
    'gift3.png',
    'gift4.png',
    'gift5.png',
    'gift6.png',
    'gift7.png',
    'gift8.png',
    'gift9.png',
    'gift10.png',
    'gift11.png'
  ];

  const DEFAULT_GIFT_CANONICAL_PRICE = Object.freeze({
    'gift1.png': { ton: 0.92, stars: 100 },
    'gift2.png': { ton: 0.92, stars: 100 },
    'gift3.png': { ton: 0.92, stars: 100 },
    'gift4.png': { ton: 0.46, stars: 50 },
    'gift5.png': { ton: 0.46, stars: 50 },
    'gift6.png': { ton: 0.46, stars: 50 },
    'gift7.png': { ton: 0.46, stars: 50 },
    'gift8.png': { ton: 0.23, stars: 25 },
    'gift9.png': { ton: 0.23, stars: 25 },
    'gift10.png': { ton: 0.14, stars: 15 },
    'gift11.png': { ton: 0.14, stars: 15 }
  });

  const DEFAULT_GIFT_VALUE_RATIOS = [0.34, 0.48, 0.62, 0.76, 0.88];

  function buildDefaultGiftPrice(caseData, ratio, icon) {
    const iconKey = String(icon || '').toLowerCase();
    const canonical = DEFAULT_GIFT_CANONICAL_PRICE[iconKey];
    if (canonical) {
      return { ton: Number(canonical.ton), stars: Number(canonical.stars) };
    }

    const caseTon = Number(caseData?.price?.ton || 0);
    const caseStars = Number(caseData?.price?.stars || 0);
    const ton = Math.max(0.003, Math.round((caseTon * ratio) * 1000) / 1000);
    const stars = Math.max(1, Math.round(caseStars * ratio));
    return { ton, stars };
  }

  function createDefaultGiftEntry(caseData, currencyTag, icon, ratio, idx) {
    const price = buildDefaultGiftPrice(caseData, ratio, icon);
    const rarity = ratio >= 0.82 ? 'epic' : (ratio >= 0.62 ? 'rare' : 'common');
    const giftChance = ratio >= 0.82 ? 0.48 : (ratio >= 0.62 ? 0.92 : 1.55);
    const iconBase = String(icon || '').replace(/\.png$/i, '');

    return {
      id: `${currencyTag}_${caseData.id}_default_${iconBase}_${idx + 1}`,
      type: 'gift',
      icon,
      giftChance,
      price,
      rarity
    };
  }

  function enrichCaseWithDefaultGifts(caseData, currencyTag) {
    if (!caseData || !Array.isArray(caseData.items) || caseData.__defaultGiftEnriched) return;

    const existingGiftIcons = new Set(
      caseData.items
        .filter((it) => itemType(it) !== 'nft')
        .map((it) => String(it?.icon || '').toLowerCase())
    );

    const missingIcons = DEFAULT_GIFT_ICONS.filter((icon) => !existingGiftIcons.has(icon.toLowerCase()));
    const extra = [];
    let seq = 0;

    missingIcons.forEach((icon, idx) => {
      const ratio = DEFAULT_GIFT_VALUE_RATIOS[idx % DEFAULT_GIFT_VALUE_RATIOS.length];
      extra.push(createDefaultGiftEntry(caseData, currencyTag, icon, ratio, seq++));
    });

    // Add a few extra default gift variants to widen the paid-mode pool.
    const topupIcons = ['gift3.png', 'gift6.png', 'gift10.png', 'gift11.png'];
    const topupRatios = [0.38, 0.56, 0.72, 0.84];
    topupIcons.forEach((icon, idx) => {
      const ratio = topupRatios[idx % topupRatios.length];
      extra.push(createDefaultGiftEntry(caseData, currencyTag, icon, ratio, seq++));
    });

    const hasStarsGift = caseData.items.some(
      (it) => itemType(it) !== 'nft' && String(it?.icon || '').toLowerCase() === 'stars.webp'
    );
    if (!hasStarsGift) {
      const lowPrice = buildDefaultGiftPrice(caseData, 0.28, 'stars.webp');
      extra.push({
        id: `${currencyTag}_${caseData.id}_default_stars_low`,
        type: 'gift',
        icon: 'stars.webp',
        giftChance: 1.75,
        price: lowPrice,
        rarity: 'common'
      });
    }

    caseData.items.push(...extra);
    caseData.__defaultGiftEnriched = true;
  }

  function enrichCasesWithDefaultGifts(casesMap, currencyTag) {
    Object.values(casesMap || {}).forEach((caseData) => enrichCaseWithDefaultGifts(caseData, currencyTag));
  }

  enrichCasesWithDefaultGifts(TON_CASES, 'ton');
  enrichCasesWithDefaultGifts(STAR_CASES, 'stars');

  function getActiveCases(currencyOverride) {
    const currency = currencyOverride || (window.WildTimeCurrency?.current || 'ton');
    return currency === 'stars' ? STAR_CASES : TON_CASES;
  }

  // Use global test mode from wheel.js (window.TEST_MODE).
  const isCasesTestMode = () => !!window.TEST_MODE;

  // ====== STATE ======
  let currentCase = null;
  let isAnimating = false;
  let isSpinning = false;
  let selectedCount = 1;
  let isDemoMode = isCasesTestMode();
  let activeSpin = null; // locks demo/currency for current spin
  let pendingCurrencyChange = false;
  let casesLowMotion = false;

  let pendingRound = null; // { roundId, currency, demo, ... }

  let carousels = [];
  let animationFrames = [];
  let casesPerfResizeRaf = 0;
  let casesPathObserver = null;
  let caseSheetUiMetricsRaf = 0;
  const CASE_SHEET_HISTORY_KEY = '__wtCaseSheet';
  const APP_PAGE_HISTORY_KEY = '__wtPage';
  let caseSheetBackNavPending = false;
  let caseSheetBackNavFallbackTimer = 0;

  function detectCasesLowMotion() {
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return true;
      const coarse = !!window.matchMedia?.('(pointer: coarse)')?.matches;
      const narrow = !!window.matchMedia?.('(max-width: 900px)')?.matches;
      const lowCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
      const mem = Number(navigator.deviceMemory);
      const lowMem = Number.isFinite(mem) && mem > 0 && mem <= 4;
      return coarse && (narrow || lowCpu || lowMem);
    } catch {
      return false;
    }
  }

  function applyCasesPerformanceProfile() {
    casesLowMotion = detectCasesLowMotion();
    try {
      document.documentElement.classList.toggle('cases-low-motion', casesLowMotion);
      document.body.classList.toggle('cases-low-motion', casesLowMotion);
    } catch (_) {}
  }

  function isStarsCarouselPerfStress() {
    const currency = window.WildTimeCurrency?.current || 'ton';
    const count = Math.max(1, Math.min(3, Number(selectedCount) || 1));
    const isMeadowCurrency = currency === 'stars' || currency === 'ton';
    return isMeadowCurrency && document.body.classList.contains('case-sheet-open') && (count >= 3 || casesLowMotion);
  }

  function getIdleBaseCount() {
    const currency = window.WildTimeCurrency?.current || 'ton';
    const count = Math.max(1, Math.min(3, Number(selectedCount) || 1));

    if (currency === 'stars' || currency === 'ton') {
      if (count >= 3) return casesLowMotion ? 30 : 42;
      if (count === 2) return casesLowMotion ? 36 : 52;
      return casesLowMotion ? 42 : 62;
    }

    return casesLowMotion ? 44 : 70;
  }

// ====== ITEM HELPERS (gift / nft) ======
function itemType(item) {
  if (item && item.type) return item.type;
  var id = item && item.id ? String(item.id).toLowerCase() : '';
  if (id.indexOf('nft') === 0) return 'nft';
  return 'gift';
}

function itemIconPath(item) {
  // NFT лежат в /images/gifts/nfts/ (папка nfts внутри gifts)
  const base = itemType(item) === 'nft' ? 'images/gifts/nfts/' : 'images/gifts/';
  const icon = (item && item.icon) ? String(item.icon) : 'stars.webp';

  // Если уже дали абсолютную ссылку — не трогаем.
  if (/^(https?:)?\/\//i.test(icon) || icon.startsWith('data:') || icon.startsWith('blob:')) return icon;

  // Если пришёл абсолютный путь вида "/images/..." — всё равно делаем его относительным к baseURI (а не к корню домена)
  if (icon.startsWith('/')) return assetUrl(icon);

  return assetUrl(base + icon);
}

// общий фолбэк (если картинка не найдена)
const ITEM_ICON_FALLBACK = assetUrl('images/gifts/stars.webp');

const STARS_GLOW_FALLBACK_BY_CASE = Object.freeze({
  case1: { r: 255, g: 236, b: 202 },
  case2: { r: 138, g: 241, b: 217 },
  case3: { r: 246, g: 138, b: 198 },
  case4: { r: 138, g: 196, b: 255 },
  case5: { r: 255, g: 191, b: 124 },
  default: { r: 255, g: 206, b: 148 }
});

const starsGlowColorCache = new Map();
const starsGlowColorPending = new Map();

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function rgbToHsl(r, g, b) {
  const rr = clampInt(r, 0, 255) / 255;
  const gg = clampInt(g, 0, 255) / 255;
  const bb = clampInt(b, 0, 255) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case rr:
      h = (gg - bb) / d + (gg < bb ? 6 : 0);
      break;
    case gg:
      h = (bb - rr) / d + 2;
      break;
    default:
      h = (rr - gg) / d + 4;
      break;
  }
  h /= 6;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
    return { r: 255, g: 206, b: 148 };
  }
  const hh = ((h % 1) + 1) % 1;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));

  if (ss === 0) {
    const gray = clampInt(ll * 255, 0, 255);
    return { r: gray, g: gray, b: gray };
  }

  const hueToRgb = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return {
    r: clampInt(hueToRgb(p, q, hh + 1 / 3) * 255, 0, 255),
    g: clampInt(hueToRgb(p, q, hh) * 255, 0, 255),
    b: clampInt(hueToRgb(p, q, hh - 1 / 3) * 255, 0, 255)
  };
}

function tuneGlowColor(rgb) {
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const tunedS = Math.max(0.34, Math.min(0.95, hsl.s * 1.14));
  const tunedL = Math.max(0.32, Math.min(0.72, hsl.l));
  return hslToRgb(hsl.h, tunedS, tunedL);
}

function sampleDominantGlowColorFromImage(img) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const size = 26;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  let wr = 0;
  let wg = 0;
  let wb = 0;
  let wsum = 0;
  let fr = 0;
  let fg = 0;
  let fb = 0;
  let fsum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 24) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    fr += r * a;
    fg += g * a;
    fb += b * a;
    fsum += a;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max > 0 ? (max - min) / max : 0;
    const lum = (max + min) / 510;
    const vividness = 0.26 + sat * 0.74;
    const brightness = 0.20 + lum * 0.80;
    const weight = (a / 255) * vividness * brightness;
    if (weight <= 0) continue;

    wr += r * weight;
    wg += g * weight;
    wb += b * weight;
    wsum += weight;
  }

  if (wsum > 0.01) {
    return {
      r: clampInt(wr / wsum, 0, 255),
      g: clampInt(wg / wsum, 0, 255),
      b: clampInt(wb / wsum, 0, 255)
    };
  }

  if (fsum > 0) {
    return {
      r: clampInt(fr / fsum, 0, 255),
      g: clampInt(fg / fsum, 0, 255),
      b: clampInt(fb / fsum, 0, 255)
    };
  }
  return null;
}

function getStarsFallbackGlowColor(caseIdOverride) {
  const caseId = String(caseIdOverride || currentCase?.id || '').trim();
  return STARS_GLOW_FALLBACK_BY_CASE[caseId] || STARS_GLOW_FALLBACK_BY_CASE.default;
}

function clearCarouselNodeGlow(node) {
  if (!node || !node.style) return;
  node.style.removeProperty('--case-item-glow-r');
  node.style.removeProperty('--case-item-glow-g');
  node.style.removeProperty('--case-item-glow-b');
  try { delete node.dataset.glowKey; } catch (_) {}
}

function setCarouselNodeGlow(node, rgb) {
  if (!node || !node.style || !rgb) return;
  node.style.setProperty('--case-item-glow-r', String(clampInt(rgb.r, 0, 255)));
  node.style.setProperty('--case-item-glow-g', String(clampInt(rgb.g, 0, 255)));
  node.style.setProperty('--case-item-glow-b', String(clampInt(rgb.b, 0, 255)));
}

function clearCasePathNodeGlow(node) {
  if (!node || !node.style) return;
  node.style.removeProperty('--case-path-glow-r');
  node.style.removeProperty('--case-path-glow-g');
  node.style.removeProperty('--case-path-glow-b');
  try { delete node.dataset.casePathGlowKey; } catch (_) {}
}

function setCasePathNodeGlow(node, rgb) {
  if (!node || !node.style || !rgb) return;
  node.style.setProperty('--case-path-glow-r', String(clampInt(rgb.r, 0, 255)));
  node.style.setProperty('--case-path-glow-g', String(clampInt(rgb.g, 0, 255)));
  node.style.setProperty('--case-path-glow-b', String(clampInt(rgb.b, 0, 255)));
}

function loadGlowColorForSrc(src) {
  const key = String(src || '').trim();
  if (!key) return Promise.resolve(null);
  if (starsGlowColorCache.has(key)) return Promise.resolve(starsGlowColorCache.get(key));
  if (starsGlowColorPending.has(key)) return starsGlowColorPending.get(key);

  const pending = new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (rawColor) => {
      if (settled) return;
      settled = true;
      const tuned = tuneGlowColor(rawColor);
      starsGlowColorCache.set(key, tuned || null);
      starsGlowColorPending.delete(key);
      resolve(tuned || null);
    };

    try {
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
    } catch (_) {}

    img.onload = () => {
      try {
        done(sampleDominantGlowColorFromImage(img));
      } catch (_) {
        done(null);
      }
    };
    img.onerror = () => done(null);

    try {
      img.src = key;
    } catch (_) {
      done(null);
      return;
    }

    if (img.complete && img.naturalWidth > 0) {
      try {
        done(sampleDominantGlowColorFromImage(img));
      } catch (_) {
        done(null);
      }
    }

    setTimeout(() => done(null), 2500);
  });

  starsGlowColorPending.set(key, pending);
  return pending;
}

function applyAdaptiveStarsGlow(node, src, currency) {
  if (!node) return;
  const itemTypeOnNode = String(node.dataset?.itemType || '').toLowerCase();
  const isMeadowCurrency = currency === 'stars' || currency === 'ton';
  if (!isMeadowCurrency || itemTypeOnNode !== 'nft') {
    clearCarouselNodeGlow(node);
    return;
  }

  setCarouselNodeGlow(node, getStarsFallbackGlowColor());
  if (isStarsCarouselPerfStress()) return;
  const key = String(src || '').trim();
  if (!key) return;

  node.dataset.glowKey = key;

  const cached = starsGlowColorCache.get(key);
  if (cached) {
    setCarouselNodeGlow(node, cached);
    return;
  }

  loadGlowColorForSrc(key).then((resolved) => {
    if (!resolved || !node?.isConnected) return;
    if (String(node.dataset.glowKey || '') !== key) return;
    setCarouselNodeGlow(node, resolved);
  }).catch(() => {});
}

function applyAdaptiveCasePathGlow(node, src, currency, caseId) {
  if (!node) return;
  if (currency !== 'ton') {
    clearCasePathNodeGlow(node);
    return;
  }

  setCasePathNodeGlow(node, getStarsFallbackGlowColor(caseId));
  const key = String(src || '').trim();
  if (!key) return;
  node.dataset.casePathGlowKey = key;

  if (starsGlowColorCache.has(key)) {
    const cached = starsGlowColorCache.get(key);
    if (cached) setCasePathNodeGlow(node, cached);
    return;
  }

  loadGlowColorForSrc(key).then((resolved) => {
    if (!resolved || !node?.isConnected) return;
    if (String(node.dataset.casePathGlowKey || '') !== key) return;
    setCasePathNodeGlow(node, resolved);
  }).catch(() => {});
}


function isStarsPrizeGift(item) {
  return itemType(item) !== 'nft' && String(item?.icon || '').toLowerCase() === 'stars.webp';
}

function normalizeItemForCurrency(item, currency) {
  if (!item) return item;
  if (currency !== 'ton') return item;
  if (!isStarsPrizeGift(item)) return item;

  const stars = Number(item?.price?.stars || 0);
  const directTon = Number(item?.price?.ton || 0);
  const ton = (Number.isFinite(directTon) && directTon > 0)
    ? directTon
    : starsToTon(stars);

  return {
    ...item,
    displayName: 'TON',
    icon: assetUrl('icons/currency/ton.svg'),
    price: {
      ...(item.price || {}),
      ton
    }
  };
  
}


// ====== PEEK FLOOR PRICES (in-memory on client) ======
const NFT_PEEK_NAME_BY_ICON = {
  'BowTieNFTSkin.png': 'Bow Tie',
  'PetSnakeNFTSkin.png': 'Pet Snake',
  'RestlessJArNFTSkin.png': 'Restless Jar',
  'FlyingBroomNFTSkin2.png': 'Flying Broom',
  'PoolFloatNFTSkin.png': 'Pool Float',
  'ChillFlameNFTSkin.png': 'Chill Flame',
  'GingerCookieNFTSkin.png': 'Ginger Cookie',
  'JollyChimpNFTSkin.png': 'Jolly Chimp',
  'GemSignetNFTSkin.png': 'Gem Signet',
  'VintageCigarNFTSkin2.png': 'Vintage Cigar',
  'TimelessBookNFTSkin.png': 'Timeless Book',
  'AstralShardNFTSkin.png': 'Astral Shard',
  'PerfumeBottleNFTSkin.png': 'Perfume Bottle',
  'PreciousPeachNFTSkin.png': 'Precious Peach',
  'SignetRingNFTSkin.png': 'Signet Ring',
  'PlushPepeNFTSkin.png': 'Plush Pepe',
  'MightyArmNFTSkin2.png': 'Mighty Arm',
  'HeroicHelmetNFTSkin.png': 'Heroic Helmet',
  'Durov\'sCapNFTSkin.png': 'Durov\'s Cap',
  'StellarRocket_Telegram.png': 'Stellar Rocket',
  'RaketaNFT.png': 'Stellar Rocket',
  'RamenNFT.png': 'Instant Ramen',
  'IceCreamNFT.png': 'Ice Cream',
 
  'BerryBoxNFTSkin.png': 'Berry Box',
  'LolPopNFTSkin.png': 'Lol Pop',
  'CookieHeartNFTSkin.png': 'Cookie Heart',
  'MousseCakeNFTSkin.png': 'Mousse Cake',

  // 
  'IceCreamNFtSkin.png': 'Ice Cream',


  //case 4
  'ElectricSkullNFTSkin.png': 'Electric Skull',
  'VintageCigarNFTSkin.png': 'Vintage Cigar',
  'VoodooDollNFTSkin.png': 'Voodoo Doll',
  'FlyingBroomNFTSkin.png': 'Flying Broom',
  'HexPotNFTSkin.png': 'Hex Pot',

  //case 5
  'MightyArmNFTSkin.png':'Mighty Arm',
  'ScaredCatNFTSkin.png':'Scared Cat',
  'BondedRingNFTSkin.png':'Bonded Ring',
  'GenieLampNFTSkin.png':'Genie Lamp',
  'JackInTheBoxNFTSkin.png':'Jack-in-the-Box',
  'WinterWreathNFTSkin.png':'Winter Wreath'



};

let peekFloorMap = null;      // Map(lowerName -> priceTon)
let peekFloorUpdatedAt = 0;   // ms

function getPeekNameForItem(item) {
  if (!item || itemType(item) !== 'nft') return null;
  const icon = String(item.icon || '');
  return NFT_PEEK_NAME_BY_ICON[icon] || null;
}

function normalizePeekGiftName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u0060]/g, "'")
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ');
}

function parsePeekPriceTon(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const directTon = Number(
    entry.priceTon ??
    entry.price_ton ??
    entry.ton ??
    entry.floor_price ??
    entry.floorPrice ??
    entry.floor ??
    null
  );
  if (Number.isFinite(directTon) && directTon > 0) return directTon;

  const priceStars = Number(entry.priceStars ?? entry.price_stars ?? entry.stars ?? null);
  if (Number.isFinite(priceStars) && priceStars > 0) {
    const conv = starsToTon(priceStars);
    if (Number.isFinite(conv) && conv > 0) return conv;
  }

  const rawPrice = Number(entry.price ?? null);
  if (Number.isFinite(rawPrice) && rawPrice > 0) {
    const currencyTag = String(entry.currency || entry.currencyCode || '').toUpperCase();
    if (currencyTag === 'XTR' || currencyTag === 'STAR' || currencyTag === 'STARS') {
      const conv = starsToTon(rawPrice);
      return (Number.isFinite(conv) && conv > 0) ? conv : null;
    }
    return rawPrice;
  }

  return null;
}

function extractPeekItemsFromPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const out = [];
  if (Array.isArray(payload.items)) out.push(...payload.items);
  if (Array.isArray(payload.prices)) out.push(...payload.prices);

  if (payload.prices && typeof payload.prices === 'object' && !Array.isArray(payload.prices)) {
    out.push(...Object.values(payload.prices));
  }

  return out;
}

async function ensurePeekFloorsLoaded() {
  // обновлять чаще смысла нет, у нас сервер обновляет раз в час
  if (peekFloorMap && (Date.now() - peekFloorUpdatedAt) < 10 * 60 * 1000) return;

  try {
    let j = null;

    // 1) same-origin (supports deployments in subfolders)
    const sameOriginUrls = [];
    try { sameOriginUrls.push(new URL('api/gifts/prices', document.baseURI).toString()); } catch (_) {}
    sameOriginUrls.push('/api/gifts/prices');

    for (const url of sameOriginUrls) {
      if (j) break;
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) j = await r.json();
      } catch (e) {
        console.warn(`[Cases] Failed to fetch from ${url}:`, e);
      }
    }
    
    // 2) dev fallback: try Node on :7700
    if (!j) {
      try {
        const r2a = await fetch('http://localhost:7700/api/gifts/prices', { cache: 'no-store' });
        if (r2a.ok) j = await r2a.json();
      } catch (e) {
        console.warn('[Cases] Failed to fetch from localhost:7700:', e);
      }
    }
    
    // 3) Alternative: try market.tonnel.network
    if (!j) {
      try {
        console.log('[Cases] Trying alternative source: market.tonnel.network');
        const r3 = await fetch('https://market.tonnel.network/api/gifts/prices', { cache: 'no-store' });
        if (r3.ok) j = await r3.json();
      } catch (e) {
        console.warn('[Cases] Failed to fetch from market.tonnel.network:', e);
      }
    }

    if (!j) {
      console.error('[Cases] All price sources failed');
      return;
    }
    const items = extractPeekItemsFromPayload(j);

    const m = new Map();
    for (const it of items) {
      const name = String(it?.name || it?.title || it?.gift || it?.key || '').trim();
      const normalizedName = normalizePeekGiftName(name);
      const priceTon = parsePeekPriceTon(it);
      if (!normalizedName || !Number.isFinite(priceTon) || priceTon <= 0) continue;
      m.set(normalizedName, priceTon);
    }

    peekFloorMap = m;
    peekFloorUpdatedAt = Date.now();
    
    console.log('[Cases] ✅ Loaded floor prices:', {
      count: m.size,
      prices: Array.from(m.entries())
    });
  } catch (e) {
    console.error('[Cases] ❌ Failed to load floor prices:', e);
  }
}

function getFloorTonForItem(item) {
  const peekName = getPeekNameForItem(item);
  if (!peekName || !peekFloorMap) return null;
  const v = peekFloorMap.get(normalizePeekGiftName(peekName));
  return (Number.isFinite(v) && v > 0) ? v : null;
}

function getItemDisplayValue(item, currency) {
  if (!item) return 0;

  if (itemType(item) === 'nft') {
    const floorTon = getFloorTonForItem(item);
    if (Number.isFinite(floorTon) && floorTon > 0) {
      return currency === 'ton' ? floorTon : tonToStars(floorTon);
    }
  }

  return prizeValue(item, currency);
}



// ====== DROP RATES (NFT rarity) ======
// Demo: NFT can appear sometimes.
// Paid (TON / Stars): NFT disabled.
const NFT_DROP_RATES = {
  demo: 0.12,
  ton: 0.00,
  stars: 0.00
};

// For strip visuals: allow NFTs to fly by for excitement, more often in paid.
const STRIP_NFT_CHANCE = {
  demo: 0.14,
  paid: 0.30
};

const _casePoolsCache = new WeakMap();

function getCasePools(caseData) {
  if (!caseData || typeof caseData !== 'object') return { items: [], nfts: [], gifts: [] };
  if (_casePoolsCache.has(caseData)) return _casePoolsCache.get(caseData);

  const items = (caseData && Array.isArray(caseData.items)) ? caseData.items : [];
  const nfts = items.filter(it => itemType(it) === 'nft');
  const gifts = items.filter(it => itemType(it) !== 'nft');

  const pools = { items, nfts, gifts };
  _casePoolsCache.set(caseData, pools);
  return pools;
}

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeightedNft(nfts) {
  if (!Array.isArray(nfts) || !nfts.length) return null;

  let totalWeight = 0;
  for (const nft of nfts) {
    const w = Number(nft?.nftChance);
    if (Number.isFinite(w) && w > 0) totalWeight += w;
  }

  // Фолбэк на равномерный выбор, если веса не заданы
  if (!(totalWeight > 0)) return pickRandom(nfts);

  let roll = Math.random() * totalWeight;
  for (const nft of nfts) {
    const w = Number(nft?.nftChance);
    const weight = (Number.isFinite(w) && w > 0) ? w : 0;
    roll -= weight;
    if (roll <= 0) return nft;
  }

  return nfts[nfts.length - 1] || null;
}

const DEFAULT_GIFT_CHANCE_BY_RARITY = {
  legendary: 0.03,
  epic: 0.08,
  rare: 0.18,
  common: 0.71
};

// Paid economy profile:
// keep average result below case cost in both TON and Stars.
const PAID_PAYOUT_PROFILE = {
  targetMin: 0.42,
  targetMax: 0.78,
  nearBreakEvenChance: 0.07,
  nearBreakEvenMin: 0.88,
  nearBreakEvenMax: 0.98,
  softCap: 0.92,
  hardCap: 1.00,
  overshootPenalty: 4.8
};

function getGiftWeight(gift) {
  const explicit = Number(gift?.giftChance ?? gift?.chance);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const rarity = String(gift?.rarity || 'common').toLowerCase();
  const byRarity = Number(DEFAULT_GIFT_CHANCE_BY_RARITY[rarity]);
  if (Number.isFinite(byRarity) && byRarity > 0) return byRarity;

  return 1;
}

function pickWeightedGift(gifts) {
  if (!Array.isArray(gifts) || !gifts.length) return null;

  let totalWeight = 0;
  for (const gift of gifts) {
    totalWeight += getGiftWeight(gift);
  }

  if (!(totalWeight > 0)) return pickRandom(gifts);

  let roll = Math.random() * totalWeight;
  for (const gift of gifts) {
    roll -= getGiftWeight(gift);
    if (roll <= 0) return gift;
  }

  return gifts[gifts.length - 1] || null;
}

function randomInRange(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  if (b <= a) return a;
  return a + (Math.random() * (b - a));
}

function pickByDynamicWeight(items, getWeight) {
  if (!Array.isArray(items) || !items.length || typeof getWeight !== 'function') return null;

  const weights = [];
  let totalWeight = 0;

  for (const item of items) {
    const wRaw = Number(getWeight(item));
    const w = (Number.isFinite(wRaw) && wRaw > 0) ? wRaw : 0;
    weights.push(w);
    totalWeight += w;
  }

  if (!(totalWeight > 0)) return null;

  let roll = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }

  return items[items.length - 1] || null;
}

function makeEmergencyStarsGift(caseData) {
  const caseTon = Number(caseData?.price?.ton || 0);
  const caseStars = Number(caseData?.price?.stars || 0);
  const ton = Math.max(0.003, Math.round((caseTon * 0.25) * 1000) / 1000);
  const stars = Math.max(1, Math.round(caseStars * 0.25));
  return {
    id: `fallback_stars_${caseData?.id || 'case'}`,
    type: 'gift',
    icon: 'stars.webp',
    giftChance: 1.0,
    price: { ton, stars },
    rarity: 'common'
  };
}

function pickPaidFallbackGift(caseData, pools) {
  return pickWeightedGift(pools?.gifts) || pickRandom(pools?.gifts) || makeEmergencyStarsGift(caseData);
}

function pickPaidBalancedWinningGift(caseData, pools, currency) {
  const casePrice = Number(caseData?.price?.[currency]);
  const source = (Array.isArray(pools?.gifts) && pools.gifts.length) ? pools.gifts : [];
  if (!source.length) return null;

  if (!(casePrice > 0)) {
    return pickWeightedGift(source) || pickRandom(source);
  }

  const nearBreakEvenRoll = Math.random() < PAID_PAYOUT_PROFILE.nearBreakEvenChance;
  const targetRatio = nearBreakEvenRoll
    ? randomInRange(PAID_PAYOUT_PROFILE.nearBreakEvenMin, PAID_PAYOUT_PROFILE.nearBreakEvenMax)
    : randomInRange(PAID_PAYOUT_PROFILE.targetMin, PAID_PAYOUT_PROFILE.targetMax);

  const capRatio = nearBreakEvenRoll ? PAID_PAYOUT_PROFILE.hardCap : PAID_PAYOUT_PROFILE.softCap;
  const targetValue = casePrice * targetRatio;
  const capValue = casePrice * capRatio;

  const picked = pickByDynamicWeight(source, (item) => {
    const value = prizeValue(item, currency);
    if (!(value > 0)) return 0;

    const baseWeight = getGiftWeight(item);
    if (!(baseWeight > 0)) return 0;

    const relativeDelta = Math.abs(value - targetValue) / Math.max(targetValue, 0.01);
    let weight = baseWeight / (1 + (relativeDelta * 4.4));

    if (value > capValue) {
      const relativeOvershoot = (value - capValue) / Math.max(capValue, 0.01);
      weight /= (1 + (relativeOvershoot * PAID_PAYOUT_PROFILE.overshootPenalty));
    }

    if (value > (casePrice * 1.1)) {
      weight *= 0.02;
    }

    return weight;
  });

  if (picked) return picked;
  return pickWeightedGift(source) || pickRandom(source) || makeEmergencyStarsGift(caseData);
}

function getNftWinChance(demoMode, currency) {
  if (!demoMode) return 0;
  return NFT_DROP_RATES.demo;
}

function pickWinningItem(caseData, demoMode, currency) {
  const pools = getCasePools(caseData);
  if (!pools.items.length) return null;

  if (!demoMode) {
    const paidGift = pickPaidBalancedWinningGift(caseData, pools, currency);
    if (paidGift) return paidGift;
    return pickPaidFallbackGift(caseData, pools);
  }

  // Demo mode: NFT can appear sometimes.
  if (!pools.nfts.length) return pickWeightedGift(pools.items) || pickRandom(pools.items);

  const chance = getNftWinChance(demoMode, currency);
  const roll = Math.random();

  if (roll < chance) {
    return pickWeightedNft(pools.nfts) || pickRandom(pools.items);
  }
  // non-NFT path
  return pickWeightedGift(pools.gifts) || pickRandom(pools.gifts) || pickRandom(pools.items);
}

function pickStripItem(caseData, demoMode) {
  const pools = getCasePools(caseData);
  if (!pools.items.length) return null;

  if (!demoMode) {
    if (pools.nfts.length && Math.random() < STRIP_NFT_CHANCE.paid) {
      return pickRandom(pools.nfts) || pickPaidFallbackGift(caseData, pools);
    }
    return pickPaidFallbackGift(caseData, pools);
  }

  if (!pools.nfts.length) return pickWeightedGift(pools.items) || pickRandom(pools.items);

  const chance = STRIP_NFT_CHANCE.demo;
  if (Math.random() < chance) return pickRandom(pools.nfts) || pickRandom(pools.items);
  return pickWeightedGift(pools.gifts) || pickRandom(pools.gifts) || pickRandom(pools.items);
}




  function getLineXInItems(carousel) {
  const cont = carousel.itemsContainer;
  const indicator = carousel.element?.querySelector?.('.case-carousel-indicator');
  if (!cont || !indicator) return 0;

  const contRect = cont.getBoundingClientRect();
  const indRect = indicator.getBoundingClientRect();

  // Центр линии в координатах контента ленты (itemsContainer)
  const x = (indRect.left + indRect.width / 2) - contRect.left;
  return Number.isFinite(x) ? x : 0;
}

function syncWinByLine(carousel, finalPos, strip, padL, step, lineX, itemWidth) {
  // где линия указывает в координатах контента ленты
  const xContent = finalPos + lineX;

  const w = (Number.isFinite(itemWidth) && itemWidth > 0) ? itemWidth : step;
  let idx = Math.round((xContent - padL - (w / 2)) / step);

  if (!Number.isFinite(idx)) idx = 0;
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

function safeHaptic(kind, style) {
  const h = window.Telegram?.WebApp?.HapticFeedback || tg?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === 'selection') {
      h.selectionChanged?.();
      return;
    }
    if (kind === 'impact') {
      h.impactOccurred?.(style || 'light');
      return;
    }
    if (kind === 'notification') {
      h.notificationOccurred?.(style || 'success');
    }
  } catch (e) {
    console.warn('[Cases] Haptic call failed:', {
      kind,
      style: style || null,
      error: e?.message || String(e || 'unknown')
    });
  }
}

function isLocalRuntime() {
  try {
    const host = String(window.location.hostname || '').toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

   // ====== TON <-> STARS rate (0.4332 TON = 50 Stars) ======
      // ====== TON <-> STARS rate (0.4332 TON = 50 ⭐) ======


// =========================
// TON ↔ Stars rate (dynamic)
// =========================
// Prefer window.WildTimeRates (defined in switch.js). Fallback to cached localStorage or legacy constant.
const __Rates = (typeof window !== 'undefined') ? (window.WildTimeRates || null) : null;
try { __Rates?.ensureTonStarsRate?.(false); } catch (_) {}

function __getStarsPerTonSafe() {
  const v = Number(__Rates?.getStarsPerTon?.());
  if (Number.isFinite(v) && v > 0) return v;

  // fallback: try cached localStorage used elsewhere
  try {
    const ls = Number(localStorage.getItem('starsPerTon'));
    if (Number.isFinite(ls) && ls > 0) return ls;
  } catch {}

  // final fallback
  return 115 * 1.25;
}

function tonToStars(ton) {
  const v = Number(ton);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.max(0, Math.ceil((v * __getStarsPerTonSafe()) - 1e-9));
}

function starsToTon(stars) {
  const v = Number(stars);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const spt = __getStarsPerTonSafe();
  if (!spt) return 0;
  return Math.round((v / spt) * 10000) / 10000;
}

function prizeValue(item, currency) {
  const p = item?.price || {};
  const pTon = Number(p.ton);
  const pStars = Number(p.stars);

  if (currency === 'ton') {
    // Use explicit TON price as final value when provided.
    if (Number.isFinite(pTon) && pTon > 0) return pTon;
    if (Number.isFinite(pStars) && pStars > 0) return starsToTon(pStars);
    return 0;
  }

  // currency === 'stars'
  // Use explicit Stars price as final value when provided.
  if (Number.isFinite(pStars) && pStars > 0) return pStars;
  if (Number.isFinite(pTon) && pTon > 0) return tonToStars(pTon);
  return 0;
}

function formatAmount(currency, value) {
    if (currency === 'ton') return (Math.round((parseFloat(value) || 0) * 100) / 100).toFixed(2);
    return String(Math.round(parseFloat(value) || 0));


    
  }

function formatPillAmount(currency, value) {
  const base = formatAmount(currency, value);
  if (currency !== 'stars') return base;

  const n = Math.round(Number(value) || 0);
  if (!Number.isFinite(n) || n <= 0) return base;

  if (n >= 1_000_000_000) return `${Math.floor(n / 1_000_000_000)}b`;
  if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)}m`;
  if (n >= 1_000) return `${Math.floor(n / 1_000)}k`;

  return base;
}

function getCasesUiLang() {
  try {
    const lang = String(
      window.WT?.i18n?.getLanguage?.() ||
      document.body?.getAttribute?.('data-wt-lang') ||
      document.documentElement?.lang ||
      window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ||
      navigator?.language ||
      'en'
    ).toLowerCase();
    return lang.startsWith('ru') ? 'ru' : 'en';
  } catch (_) {
    return 'en';
  }
}

function casesText(en, ru) {
  return getCasesUiLang() === 'ru' ? ru : en;
}

  function setBalanceValue(currency, value) {
  const c = (currency === 'stars') ? 'stars' : 'ton';
  const next = (c === 'ton')
    ? Math.max(0, Math.round((parseFloat(value) || 0) * 100) / 100)
    : Math.max(0, Math.round(parseFloat(value) || 0));

  // IMPORTANT: in ESM strict mode, assigning to getter-only properties throws.
  // Update through official API only.
  const api = window.WildTimeCurrency || null;
  let applied = false;

  if (api && typeof api.setBalance === 'function') {
    try {
      api.setBalance(c, next);
      applied = true;
    } catch (e) {
      console.warn('[Cases] setBalance failed, trying fallback:', e?.message || e);
    }
  }

  if (!applied && api && typeof api.updateBalance === 'function') {
    try {
      const snap = (api.balance && typeof api.balance === 'object') ? api.balance : {};
      const merged = {
        ton: Number(snap.ton || 0),
        stars: Number(snap.stars || 0)
      };
      merged[c] = next;
      api.updateBalance(merged);
      applied = true;
    } catch (e) {
      console.warn('[Cases] updateBalance fallback failed:', e?.message || e);
    }
  }

  // Last resort local shadow state (keeps claim flow non-blocking even if currency API is unavailable)
  if (!applied) {
    try {
      const fb = (window.__WT_CASES_BALANCE_FALLBACK && typeof window.__WT_CASES_BALANCE_FALLBACK === 'object')
        ? window.__WT_CASES_BALANCE_FALLBACK
        : { ton: 0, stars: 0 };
      fb[c] = next;
      window.__WT_CASES_BALANCE_FALLBACK = fb;
    } catch (_) {}
  }

  // Notify listeners
  try {
    window.dispatchEvent(new CustomEvent('balance:update', { detail: { [c]: next } }));
  } catch (_) {
    // Legacy WebViews may not support CustomEvent constructor.
    try {
      const ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('balance:update', false, false, { [c]: next });
      window.dispatchEvent(ev);
    } catch (_) {}
  }
  return next;
}









function applyBalanceDelta(currency, delta) {
  const c = (currency === 'stars') ? 'stars' : 'ton';
  let curr = window.WildTimeCurrency?.balance?.[c];
  if (!(typeof curr === 'number' && Number.isFinite(curr))) {
    curr = Number(window.__WT_CASES_BALANCE_FALLBACK?.[c]);
  }
  if (!(typeof curr === 'number' && Number.isFinite(curr))) curr = 0;
  const d = parseFloat(delta) || 0;

  const next = (c === 'ton')
    ? Math.max(0, Math.round((parseFloat(curr) + d) * 100) / 100)
    : Math.max(0, Math.round(parseFloat(curr) + d));
  return setBalanceValue(c, next);
}

function getBalanceSafe(currency) {
  const c = (currency === 'stars') ? 'stars' : 'ton';

  const b = window.WildTimeCurrency?.balance?.[c];
  if (typeof b === 'number' && Number.isFinite(b)) return b;

   const fb = Number(window.__WT_CASES_BALANCE_FALLBACK?.[c]);
   if (Number.isFinite(fb)) return fb;

  // Fallback: try reading from the balance pill text
  const el = document.getElementById('tonAmount');
  if (el) {
    const v = parseFloat(String(el.textContent || '').replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(v)) return v;
  }

  return 0;
}

  function setControlsLocked(locked) {
    // Prevent switching Demo/count during spin/claim
    if (demoToggle) {
      const demoLocked = !!locked || isCasesTestMode();
      demoToggle.classList.toggle('locked', demoLocked);
      demoToggle.style.pointerEvents = demoLocked ? 'none' : '';
      demoToggle.style.opacity = demoLocked ? '0.6' : '';
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
  let floatingCloseBtn = null;
  let countBtns = [];
  let demoToggle = null;
  let caseThumbImg = null;

  // ====== CASES PAGE UI: HERO + GLOBAL HISTORY ======
  const MAX_CASES_HISTORY = 20;
  let heroTickerEl = null;
  let historyListEl = null;
  let historyPollTimer = null;
  let historyInFlight = false;
  let historyState = [];

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getTgUserMeta() {
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim();
    const username = u?.username ? `@${u.username}` : '';
    return {
      id: u?.id ? String(u.id) : 'guest',
      name: name || 'User',
      username: username || ''
    };
  }

  function isCasesPageActive() {
    const p = document.getElementById('casesPage');
    return !!(p && p.classList.contains('page-active'));
  }

  function getCaseImageFolder(currency) {
    return currency === 'stars' ? 'starcases' : 'toncases';
  }

  function getCaseImagePath(caseId, currency) {
    const rawId = String(caseId || 'case1').toLowerCase();
    const safeId = rawId.replace(/[^a-z0-9_-]/g, '') || 'case1';
    return assetUrl(`images/cases/${getCaseImageFolder(currency)}/${safeId}.png`);
  }

  function initHeroTicker() {
    heroTickerEl = document.getElementById('casesHeroTicker');
    if (!heroTickerEl) return;

    // Clear and (re)build
    heroTickerEl.innerHTML = '';
    const currency = window.WildTimeCurrency?.current || 'ton';
    const list = Object.values(getActiveCases(currency));
    const slotMs = 2200; // each case visible ~2.2s
    const totalMs = Math.max(slotMs * Math.max(1, list.length), 3000);

    list.forEach((caseData, idx) => {
      const item = document.createElement('div');
      item.className = 'cases-hero__ticker-item';
      item.style.animationDuration = `${totalMs}ms`;
      item.style.animationDelay = `${idx * slotMs}ms`;
      item.innerHTML = `<img src="${getCaseImagePath(caseData.id, currency)}" alt="${escapeHtml(caseData.name)}">`;
      heroTickerEl.appendChild(item);
    });
  }

  function renderHistory(items) {
    if (!historyListEl) return;
    const arr = Array.isArray(items) ? items : [];
    const currency = window.WildTimeCurrency?.current || 'ton';
    historyListEl.innerHTML = arr.map((h) => {
      const u = h.user || {};
      const userLabel = escapeHtml(u.username || u.name || 'User');
      const itemLabel = escapeHtml(h.drop?.label || h.drop?.id || '');
      const caseIdRaw = String(h.caseId || 'case1');
      const caseId = escapeHtml(caseIdRaw);
      const caseImage = getCaseImagePath(caseIdRaw, currency);
      const dropIcon = escapeHtml(h.drop?.icon || ITEM_ICON_FALLBACK);
      return `
        <div class="cases-history-item" title="${userLabel} • ${itemLabel}">
          <div class="cases-history-item__thumb">
            <img class="cases-history-item__case" src="${caseImage}" alt="${caseId}">
            <div class="cases-history-item__drop"><img src="${dropIcon}" alt="${itemLabel}" onerror="this.onerror=null;this.src='${ITEM_ICON_FALLBACK}'"></div>
          </div>
          <div class="cases-history-item__meta">
            <div class="cases-history-item__user">${userLabel}</div>
            <div class="cases-history-item__item">${itemLabel}</div>
          </div>
        </div>
      `;
    }).join('');

  }

  function mergeHistoryLocal(newItems) {
    const arr = Array.isArray(newItems) ? newItems : [];
    // Newest first
    historyState = arr.concat(historyState);
    // De-dup by id if present
    const seen = new Set();
    historyState = historyState.filter((e) => {
      const k = e?.id || `${e?.ts || 0}_${e?.user?.id || ''}_${e?.caseId || ''}_${e?.drop?.id || ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    historyState = historyState.slice(0, MAX_CASES_HISTORY);
    renderHistory(historyState);
  }

  async function fetchAndRenderHistory() {
    if (historyInFlight) return;
    historyInFlight = true;
    try {
      const r = await fetchJsonSafe(`/api/cases/history?limit=${MAX_CASES_HISTORY}&t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok && r.json && Array.isArray(r.json.items)) {
        historyState = r.json.items.slice(0, MAX_CASES_HISTORY);
        renderHistory(historyState);
      } else if (!historyState.length) {
        renderHistory([]);
      }
    } finally {
      historyInFlight = false;
    }
  }

  function startHistoryPolling() {
    if (!historyListEl) return;
    if (historyPollTimer) return;
    // initial
    fetchAndRenderHistory();
    historyPollTimer = setInterval(() => {
      if (!isCasesPageActive()) return;
      fetchAndRenderHistory();
    }, 6500);
  }

  function stopHistoryPolling() {
    if (historyPollTimer) {
      clearInterval(historyPollTimer);
      historyPollTimer = null;
    }
  }

  function setupCasesPageActivityObservers() {
    const casesPage = document.getElementById('casesPage');
    if (!casesPage) return;

    const apply = () => {
      if (casesPage.classList.contains('page-active')) {
        startHistoryPolling();
      } else {
        stopHistoryPolling();
      }
    };

    apply();
    new MutationObserver(apply).observe(casesPage, { attributes: true, attributeFilter: ['class'] });
  }

  function makeHistoryEntries(caseData, winEntries, userMeta) {
    const c = caseData || {};
    const u = userMeta || { id: 'guest', name: 'User', username: '' };
    const now = Date.now();
    return (Array.isArray(winEntries) ? winEntries : [])
      .map((e, idx) => {
        const it = e?.item;
        if (!it) return null;
        const id = `h_${now}_${idx}_${Math.random().toString(16).slice(2)}`;
        return {
          id,
          ts: now,
          user: { id: u.id, name: u.name, username: u.username },
          caseId: c.id || '',
          caseName: c.name || '',
          drop: {
            id: it.id || '',
            type: itemType(it),
            icon: itemIconPath(it),
            label: it.id || ''
          }
        };
      })
      .filter(Boolean);
  }

  function sendHistoryToServer(entries, userId, initData) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return;

    const payloadWithInit = { userId, initData, entries: list };
    const payloadNoInit   = { userId, entries: list };

    try {
      // fire-and-forget (don’t block UX)
      fetchJsonSafe('/api/cases/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithInit)
      }, 3500)
        .then((r) => {
          // Telegram initData expires (server verifies age). If we got 401/403 — retry without initData.
          if (!r.ok && (r.status === 401 || r.status === 403)) {
            return fetchJsonSafe('/api/cases/history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payloadNoInit)
            }, 3500);
          }
          return null;
        })
        .catch(() => {});
    } catch (_) {}
  }

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
    applyCasesPerformanceProfile();
    window.addEventListener('resize', () => {
      if (casesPerfResizeRaf) cancelAnimationFrame(casesPerfResizeRaf);
      casesPerfResizeRaf = requestAnimationFrame(() => {
        casesPerfResizeRaf = 0;
        const prev = casesLowMotion;
        applyCasesPerformanceProfile();
        if (prev !== casesLowMotion) {
          generateCasesGrid();
          if (currentCase && sheetPanel?.classList.contains('active')) {
            renderContents(window.WildTimeCurrency?.current || 'ton');
          }
        }
        if (document.body.classList.contains('case-sheet-open')) {
          scheduleCaseSheetUiMetricsUpdate();
        }
      });
    }, { passive: true });
    if (window.visualViewport) {
      const syncOpenCaseLayout = () => {
        if (!document.body.classList.contains('case-sheet-open')) return;
        scheduleCaseSheetUiMetricsUpdate();
      };
      window.visualViewport.addEventListener('resize', syncOpenCaseLayout, { passive: true });
      window.visualViewport.addEventListener('scroll', syncOpenCaseLayout, { passive: true });
    }
    setupCasesPageBodyFlag();

    // Poster + global history (Cases page)
    heroTickerEl = document.getElementById('casesHeroTicker');
    historyListEl = document.getElementById('casesHistoryList');
    initHeroTicker();
    setupCasesPageActivityObservers();

    overlay = document.getElementById('caseOverlay');
    sheetPanel = document.querySelector('.case-sheet-panel');
    carouselsWrapper = document.getElementById('caseCarouselsWrapper');
    contentsGrid = document.getElementById('caseContentsGrid');
    openBtn = document.getElementById('caseOpenBtn');
    closeBtn = document.getElementById('caseSheetClose');
    floatingCloseBtn = document.getElementById('caseSheetFloatingClose');
    countBtns = Array.from(document.querySelectorAll('.case-count-btn'));

    createDemoToggle();
    attachListeners();
    ensureCasesThemeBackdrop();
    preloadCasesThemeBackgrounds();
    clearLegacyCasesCurrencySwapArtifacts();
    generateCasesGrid();

    // Загрузить floor prices при старте
    ensurePeekFloorsLoaded().catch(e => {
      console.warn('[Cases] Failed to load floor prices:', e);
    });

    console.log('[Cases] ✅ Ready');
  }
  // ====== EMERGENCY FIX FOR Z-INDEX & SCROLL ======

  function applyScrollAndZIndexFix() {
    console.log('[Cases] Applying scroll & z-index fix...');
    
    // Fix 1: Ensure overlay is properly layered
    if (overlay) {
      overlay.style.zIndex = '2000';
      // When overlay becomes active, make it clickable
      const originalOverlayClick = overlay.onclick;
      overlay.addEventListener('click', function(e) {
        if (this.classList.contains('active') && e.target === this) {
          closeBottomSheet();
        }
      });
    }
    
    // Fix 2: Ensure sheet panel structure
    if (sheetPanel) {
      sheetPanel.style.zIndex = '2200';
      sheetPanel.style.overflow = 'hidden';
      sheetPanel.style.display = 'flex';
      sheetPanel.style.flexDirection = 'column';
    }
    
    // Fix 3: Make contents section scrollable
    const contentsSection = document.querySelector('.case-contents-section');
    if (contentsSection) {
      contentsSection.style.flex = '1 1 auto';
      contentsSection.style.overflowY = 'auto';
      contentsSection.style.overflowX = 'hidden';
      contentsSection.style.webkitOverflowScrolling = 'touch';
      
      // Monitor scroll capability
      const checkScroll = () => {
        const canScroll = contentsSection.scrollHeight > contentsSection.clientHeight;
        console.log('[Cases] Scroll check:', {
          scrollHeight: contentsSection.scrollHeight,
          clientHeight: contentsSection.clientHeight,
          canScroll: canScroll
        });
      };
      
      // Check scroll when panel opens
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'class' && sheetPanel.classList.contains('active')) {
            setTimeout(checkScroll, 300);
          }
        });
      });
      
      if (sheetPanel) {
        observer.observe(sheetPanel, { attributes: true });
      }
    }
    
    // Fix 4: Ensure bottom button is above content
    const bottomButton = document.querySelector('.case-bottom-button');
    if (bottomButton) {
      bottomButton.style.position = 'absolute';
      bottomButton.style.zIndex = '100';
      bottomButton.style.pointerEvents = 'none';
      
      // But make the button itself clickable
      const openButton = document.getElementById('caseOpenBtn');
      if (openButton) {
        openButton.style.pointerEvents = 'all';
      }
    }
    
    console.log('[Cases] Fix applied ✅');
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
      if (isCasesTestMode()) return;
      isDemoMode = !isDemoMode;
      toggle.classList.toggle('active', isDemoMode);
      updateOpenButton();

      safeHaptic('selection');
      console.log('[Cases] Demo mode:', isDemoMode);
    });

    countSection.appendChild(toggle);
    demoToggle = toggle;

    const thumb = document.createElement('div');
    thumb.id = 'caseCurrentThumb';
    thumb.className = 'case-current-thumb';
    thumb.innerHTML = `<img id="caseCurrentThumbImg" src="" alt="">`;
    countSection.appendChild(thumb);
    caseThumbImg = thumb.querySelector('#caseCurrentThumbImg');

    const demoActive = isCasesTestMode() || isDemoMode;
    toggle.classList.toggle('active', demoActive);
    if (isCasesTestMode()) {
      toggle.classList.add('locked');
      toggle.style.pointerEvents = 'none';
      toggle.style.opacity = '0.6';
      isDemoMode = true;
      console.log('[Cases] Test mode enabled: Demo is forced ON');
    }
  }

  // ====== ATTACH EVENT LISTENERS ======
  function attachListeners() {
    overlay?.addEventListener('click', closeBottomSheet);
    closeBtn?.addEventListener('click', closeBottomSheet);
    floatingCloseBtn?.addEventListener('click', closeBottomSheet);
    window.addEventListener('popstate', handleCaseSheetPopstate);

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

  function disconnectCasesPathObserver() {
    if (!casesPathObserver) return;
    try { casesPathObserver.disconnect(); } catch (_) {}
    casesPathObserver = null;
  }

  function setupCasesPathAnimationVisibility(casesPath) {
    const pathItems = Array.from(casesPath?.querySelectorAll?.('.case-path-item') || []);
    if (!pathItems.length) {
      disconnectCasesPathObserver();
      return;
    }

    if (!('IntersectionObserver' in window)) {
      pathItems.forEach((item) => item.classList.add('is-visible'));
      disconnectCasesPathObserver();
      return;
    }

    disconnectCasesPathObserver();
    casesPathObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry?.target;
        if (!el?.classList) return;
        el.classList.toggle('is-visible', !!entry.isIntersecting);
      });
    }, {
      root: null,
      rootMargin: '180px 0px',
      threshold: 0.01
    });

    pathItems.forEach((item) => casesPathObserver.observe(item));
  }

  function appendStarsFireflies(casesPath) {
    const layer = document.createElement('div');
    layer.className = 'case-stars-fireflies';

    const count = casesLowMotion ? 28 : 64;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      dot.className = 'case-stars-firefly';

      const size = (Math.random() * (casesLowMotion ? 1.2 : 2.0)) + 1.8;
      const duration = (Math.random() * (casesLowMotion ? 4.8 : 3.8)) + (casesLowMotion ? 7.4 : 3.6);
      const alpha = (Math.random() * 0.32) + 0.60;

      dot.style.setProperty('--x', `${(Math.random() * 95 + 2).toFixed(2)}%`);
      dot.style.setProperty('--y', `${(Math.random() * 94 + 3).toFixed(2)}%`);
      dot.style.setProperty('--size', `${size.toFixed(2)}px`);
      dot.style.setProperty('--dur', `${duration.toFixed(2)}s`);
      dot.style.setProperty('--delay', `${(-Math.random() * 9).toFixed(2)}s`);
      dot.style.setProperty('--alpha', alpha.toFixed(2));

      layer.appendChild(dot);
    }

    casesPath.appendChild(layer);
  }

  function preloadCasesThemeBackgrounds() {
    const sources = [
      assetUrl('images/cases/starcases/starsbackimg.png'),
      assetUrl('images/cases/toncases/tonbackimg.webp')
    ];
    for (const src of sources) {
      try {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
      } catch (_) {}
    }
  }

  function ensureCasesThemeBackdrop() {
    const host = document.body;
    if (!host) return;
    if (document.getElementById('casesThemeBackdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'casesThemeBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <div class="cases-theme-bg-layer cases-theme-bg-layer--stars"></div>
      <div class="cases-theme-bg-layer cases-theme-bg-layer--ton"></div>
    `;

    host.insertBefore(backdrop, host.firstChild || null);
  }

  function clearLegacyCasesCurrencySwapArtifacts() {
    try {
      document.body.classList.remove('cases-bg-swap-active');
      document.body.style.removeProperty('--cases-bg-swap-dir');
    } catch (_) {}

    const layer = document.getElementById('casesBgSwapLayer');
    if (layer?.parentNode) layer.parentNode.removeChild(layer);

    const casesPath = document.getElementById('casesGrid');
    if (!casesPath) return;
    casesPath.classList.remove(
      'cases-grid-swap',
      'cases-grid-swap-out',
      'cases-grid-swap-pre-enter',
      'cases-grid-swap-enter'
    );
    casesPath.style.removeProperty('--cases-swap-out-x');
    casesPath.style.removeProperty('--cases-swap-in-x');
  }

  function generateCasesGrid() {
    const casesPath = document.getElementById('casesGrid');
    if (!casesPath) return;

    // Change class to cases-path for new styling
    casesPath.className = 'cases-path';
    casesPath.innerHTML = '';

    const currency = window.WildTimeCurrency?.current || 'ton';
    const casesArray = Object.values(getActiveCases(currency));
    const isMeadowTheme = currency === 'stars' || currency === 'ton';
    const icon = currency === 'ton' ? assetUrl('icons/currency/tgTonWhite.svg') : assetUrl('icons/currency/tgStarsWhite.svg');

    casesArray.forEach((caseData, index) => {
      const price = caseData.price[currency];
      const priceDisplay = formatAmount(currency, price);
      const caseImageSrc = getCaseImagePath(caseData.id, currency);
      const adaptiveTileGlowMarkup = currency === 'ton'
        ? '<div class="case-path-image-glow" aria-hidden="true"></div>'
        : '';
      
      // Low-motion keeps fewer moving objects to reduce main-thread load.
      const displayItems = caseData.items.slice(0, casesLowMotion ? 2 : 3);

      const pathItem = document.createElement('div');
      pathItem.className = 'case-path-item is-visible';
      pathItem.dataset.caseId = caseData.id;
      pathItem.dataset.variant = String((index % 3) + 1);

      if (isMeadowTheme) {
        pathItem.classList.add('case-path-item--stars');
        pathItem.innerHTML = `
          <div class="case-path-case">
            <div class="case-path-image-wrapper">
              ${adaptiveTileGlowMarkup}
              <img src="${caseImageSrc}"
                   alt="${caseData.name}"
                   loading="lazy"
                   decoding="async"
                   class="case-path-image">
            </div>
            <div class="case-path-price case-path-price--stub">
              <img src="${icon}" class="case-path-price-icon" alt="${currency}">
              <span class="case-path-price-val">${priceDisplay}</span>
            </div>
          </div>
        `;
      } else {
        pathItem.innerHTML = `
          <!-- Premium horizontal track with border & shimmer -->
          <div class="case-path-track">
            <div class="case-path-track-shimmer"></div>
          </div>
          
          <!-- Animated items sliding on track -->
          <div class="case-path-items">
            ${displayItems.map((item, itemIndex) => `
              <div class="case-path-item-float" style="--gift-duration:${(casesLowMotion ? 8.2 : 5.4).toFixed(1)}s;--gift-delay:${(-(casesLowMotion ? 2.9 : 1.8) * itemIndex).toFixed(2)}s">
                <img src="${itemIconPath(item)}" 
                     alt="${item.id || caseData.name}"
                     loading="lazy"
                     decoding="async"
                     onerror="this.onerror=null;this.src='${ITEM_ICON_FALLBACK}'">
              </div>
            `).join('')}
          </div>
          
          <!-- Case positioned ON the track -->
          <div class="case-path-case">
            <div class="case-path-image-wrapper">
              <div class="case-path-glow"></div>
              <img src="${caseImageSrc}" 
                   alt="${caseData.name}" 
                   loading="lazy"
                   decoding="async"
                   class="case-path-image">
            </div>
            <!-- Liquid glass price pill OVER the case -->
            <div class="case-path-price">
              <img src="${icon}" class="case-path-price-icon" alt="${currency}">
              <span class="case-path-price-val">${priceDisplay}</span>
            </div>
          </div>
        `;
      }

      applyAdaptiveCasePathGlow(pathItem, caseImageSrc, currency, caseData.id);

      pathItem.addEventListener('click', () => openBottomSheet(caseData.id));
      casesPath.appendChild(pathItem);
    });

    if (currency === 'stars') {
      appendStarsFireflies(casesPath);
    }
    setupCasesPathAnimationVisibility(casesPath);
  }


  // ====== OPEN BOTTOM SHEET ======
  function updateCaseSheetUiMetrics(force) {
    if (!force && !document.body.classList.contains('case-sheet-open')) return;

    const root = document.documentElement;
    const appEl = document.querySelector('.app');
    const topbarEl = document.querySelector('.topbar');
    const logoEl = document.querySelector('.logo-header');
    const balanceEl = document.querySelector('.topbar > .balance');

    if (appEl) {
      const appRect = appEl.getBoundingClientRect();
      const left = Number.isFinite(appRect.left) ? Math.round(appRect.left) : 0;
      const width = (Number.isFinite(appRect.width) && appRect.width > 0)
        ? Math.round(appRect.width)
        : Math.max(0, Math.round(window.innerWidth || 0));
      root.style.setProperty('--case-sheet-ui-left', `${Math.max(0, left)}px`);
      root.style.setProperty('--case-sheet-ui-width', `${Math.max(0, width)}px`);
    } else {
      root.style.setProperty('--case-sheet-ui-left', '0px');
      root.style.setProperty('--case-sheet-ui-width', `${Math.max(0, Math.round(window.innerWidth || 0))}px`);
    }

    if (balanceEl) {
      const br = balanceEl.getBoundingClientRect();
      const bLeft = Number.isFinite(br.left) ? br.left : 0;
      const bTop = Number.isFinite(br.top) ? br.top : 0;
      const bWidth = (Number.isFinite(br.width) && br.width > 0) ? br.width : 0;
      const bRight = Number.isFinite(br.right) ? br.right : 0;
      const viewportW = Math.max(0, Number(window.innerWidth || 0));

      root.style.setProperty('--case-sheet-balance-left', `${Math.max(0, bLeft).toFixed(2)}px`);
      root.style.setProperty('--case-sheet-balance-top', `${Math.max(0, bTop).toFixed(2)}px`);
      root.style.setProperty('--case-sheet-balance-width', `${Math.max(0, bWidth).toFixed(2)}px`);
      root.style.setProperty('--case-sheet-balance-right', `${Math.max(0, viewportW - bRight).toFixed(2)}px`);
    }

    let maxBottom = 0;
    if (topbarEl) {
      const r = topbarEl.getBoundingClientRect();
      if (Number.isFinite(r.bottom)) maxBottom = Math.max(maxBottom, r.bottom);
    }
    if (logoEl) {
      const r = logoEl.getBoundingClientRect();
      if (Number.isFinite(r.bottom)) maxBottom = Math.max(maxBottom, r.bottom);
    }
    if (balanceEl) {
      const r = balanceEl.getBoundingClientRect();
      if (Number.isFinite(r.bottom)) maxBottom = Math.max(maxBottom, r.bottom);
    }

    const reserveTop = Math.max(88, Math.ceil(maxBottom + 12));
    root.style.setProperty('--case-sheet-top-offset', `${reserveTop}px`);
  }

  function scheduleCaseSheetUiMetricsUpdate() {
    if (caseSheetUiMetricsRaf) cancelAnimationFrame(caseSheetUiMetricsRaf);
    caseSheetUiMetricsRaf = requestAnimationFrame(() => {
      caseSheetUiMetricsRaf = 0;
      updateCaseSheetUiMetrics();
    });
  }

  function clearCaseSheetUiMetrics() {
    const root = document.documentElement;
    root.style.removeProperty('--case-sheet-ui-left');
    root.style.removeProperty('--case-sheet-ui-width');
    root.style.removeProperty('--case-sheet-balance-left');
    root.style.removeProperty('--case-sheet-balance-top');
    root.style.removeProperty('--case-sheet-balance-width');
    root.style.removeProperty('--case-sheet-balance-right');
    root.style.removeProperty('--case-sheet-top-offset');
  }

  function isCaseSheetHistoryState(state = window.history?.state) {
    return !!(state && typeof state === 'object' && state[CASE_SHEET_HISTORY_KEY]);
  }

  function pushCaseSheetHistoryState() {
    if (!window.history || typeof window.history.pushState !== 'function') return;
    if (isCaseSheetHistoryState()) return;

    const baseState = (window.history.state && typeof window.history.state === 'object')
      ? window.history.state
      : {};
    const activePageId = document.querySelector('.page.page-active')?.id || 'casesPage';
    const nextState = {
      ...baseState,
      [APP_PAGE_HISTORY_KEY]: baseState[APP_PAGE_HISTORY_KEY] || activePageId,
      [CASE_SHEET_HISTORY_KEY]: 1
    };

    try {
      window.history.pushState(nextState, '', window.location.href);
    } catch (_) {}
  }

  function closeCaseSheetByHistoryStep() {
    if (!window.history || typeof window.history.back !== 'function') return false;
    if (!isCaseSheetHistoryState()) return false;

    caseSheetBackNavPending = true;
    if (caseSheetBackNavFallbackTimer) clearTimeout(caseSheetBackNavFallbackTimer);

    try {
      window.history.back();
    } catch (_) {
      caseSheetBackNavPending = false;
      return false;
    }

    // Fallback: if browser/back gesture doesn't dispatch popstate quickly.
    caseSheetBackNavFallbackTimer = setTimeout(() => {
      caseSheetBackNavFallbackTimer = 0;
      if (!caseSheetBackNavPending) return;
      caseSheetBackNavPending = false;
      if (document.body.classList.contains('case-sheet-open')) {
        closeBottomSheet({ skipHistoryBack: true });
      }
    }, 220);

    return true;
  }

  function handleCaseSheetPopstate() {
    if (caseSheetBackNavFallbackTimer) {
      clearTimeout(caseSheetBackNavFallbackTimer);
      caseSheetBackNavFallbackTimer = 0;
    }

    caseSheetBackNavPending = false;

    if (!document.body.classList.contains('case-sheet-open')) return;

    // Any Back navigation while case sheet is open should close only the sheet.
    // Prevent recursive history.back() from closeBottomSheet itself.
    closeBottomSheet({ skipHistoryBack: true, force: true });
  }

  function restoreCaseSheetLayerVisibility() {
    if (sheetPanel) {
      sheetPanel.style.removeProperty('display');
      sheetPanel.style.removeProperty('visibility');
      sheetPanel.style.removeProperty('opacity');
      sheetPanel.style.removeProperty('transform');
      sheetPanel.style.removeProperty('pointer-events');
    }
    if (overlay) {
      overlay.style.removeProperty('display');
      overlay.style.removeProperty('visibility');
      overlay.style.removeProperty('opacity');
      overlay.style.removeProperty('pointer-events');
    }
  }

  function hideCaseSheetLayerImmediately() {
    if (sheetPanel) {
      sheetPanel.style.setProperty('display', 'none');
      sheetPanel.style.setProperty('visibility', 'hidden');
      sheetPanel.style.setProperty('opacity', '0');
      sheetPanel.style.setProperty('pointer-events', 'none');
    }
    if (overlay) {
      overlay.style.setProperty('display', 'none');
      overlay.style.setProperty('visibility', 'hidden');
      overlay.style.setProperty('opacity', '0');
      overlay.style.setProperty('pointer-events', 'none');
    }
  }

  function lockCaseSheetScreen() {
    if (document.body.classList.contains('case-sheet-open')) return;

    // Capture current top UI geometry before any sheet-open styles are applied.
    updateCaseSheetUiMetrics(true);

    document.documentElement.classList.add('case-sheet-open');
    document.body.classList.add('case-sheet-open');

    scheduleCaseSheetUiMetricsUpdate();
    setTimeout(() => scheduleCaseSheetUiMetricsUpdate(), 80);
    setTimeout(() => scheduleCaseSheetUiMetricsUpdate(), 180);
  }

  function unlockCaseSheetScreen() {
    if (!document.body.classList.contains('case-sheet-open')) return;

    document.documentElement.classList.remove('case-sheet-open');
    document.body.classList.remove('case-sheet-open');

    if (caseSheetUiMetricsRaf) {
      cancelAnimationFrame(caseSheetUiMetricsRaf);
      caseSheetUiMetricsRaf = 0;
    }
    clearCaseSheetUiMetrics();
  }

  function openBottomSheet(caseId) {
    if (isAnimating || document.body.classList.contains('case-sheet-open')) return;

    currentCase = getActiveCases()[caseId];
    if (!currentCase) return;

    console.log('[Cases] 🎁 Opening:', currentCase.name);

    isAnimating = true;
    selectedCount = 1;

    restoreCaseSheetLayerVisibility();
    lockCaseSheetScreen();
    pushCaseSheetHistoryState();

    updateSheetContent();

    overlay?.classList.add('active');

    if (sheetPanel) {
      requestAnimationFrame(() => {
        sheetPanel.classList.add('active');
        safeHaptic('impact', 'medium');

        setTimeout(() => {
          isAnimating = false;
          startIdleAnimation();
        }, 400);
      });
    }
  }

  // ====== CLOSE BOTTOM SHEET ======
  function closeBottomSheet(options = null) {
    const opts = (options && typeof options === 'object') ? options : {};
    const skipHistoryBack = !!opts.skipHistoryBack;
    const force = !!opts.force;

    if ((isAnimating || isSpinning) && !force) return;
    if (!skipHistoryBack && closeCaseSheetByHistoryStep()) return;

    isAnimating = true;
    stopAllAnimations();
    try { hideClaimBar(); } catch (_) {}
    pendingRound = null;

    const closeCurrency = window.WildTimeCurrency?.current || 'ton';
    const isMeadowClose = closeCurrency === 'stars' || closeCurrency === 'ton';
    const starsCloseDelayMs = 220;

    if (sheetPanel) sheetPanel.classList.remove('active');
    if (overlay) overlay.classList.remove('active');

    safeHaptic('impact', 'light');

    // In meadow mode hide the whole layer before removing `case-sheet-open`
    // so legacy bottom-sheet styles never get a chance to flash.
    const finalizeClose = () => {
      if (caseSheetBackNavFallbackTimer) {
        clearTimeout(caseSheetBackNavFallbackTimer);
        caseSheetBackNavFallbackTimer = 0;
      }
      if (isMeadowClose) hideCaseSheetLayerImmediately();
      unlockCaseSheetScreen();
      isAnimating = false;
      currentCase = null;
      caseSheetBackNavPending = false;
    };

    if (isMeadowClose) {
      setTimeout(finalizeClose, starsCloseDelayMs);
    } else {
      finalizeClose();
    }
  }

  // ====== UPDATE SHEET CONTENT ======
  function updateSheetContent() {
    if (!currentCase) return;
  
    const currency = window.WildTimeCurrency?.current || 'ton';
    const activeCases = getActiveCases(currency);
    if (currentCase?.id && activeCases[currentCase.id]) currentCase = activeCases[currentCase.id];
    const price = currentCase.price[currency];
    const icon = currency === 'ton' ? assetUrl('icons/currency/ton.svg') : assetUrl('icons/currency/tgStarsWhite.svg');
  
    const title = document.getElementById('caseSheetTitle');
    if (title) title.textContent = currentCase.name;
  
    const priceEl = document.getElementById('casePrice');
    const iconEl = document.getElementById('caseCurrencyIcon');
    if (priceEl) priceEl.textContent = formatAmount(currency, price);
    if (iconEl) iconEl.src = icon;
  
    // Set case ID on panel for gradient styling
    if (sheetPanel) {
      sheetPanel.setAttribute('data-case-id', currentCase.id);
    }
  
    // Set case image for count section
    const countSection = document.querySelector('.case-count-section');
    if (countSection) {
      const caseImg = getCaseImagePath(currentCase.id, currency);
      countSection.style.setProperty('--current-case-image', `url('${caseImg}')`);
      if (!caseThumbImg) caseThumbImg = document.getElementById('caseCurrentThumbImg');
      if (caseThumbImg) {
        caseThumbImg.src = caseImg;
        caseThumbImg.alt = currentCase.name || currentCase.id || 'Case';
      }
}
  
    renderCarousels(selectedCount, currency);


    
    // подтянем floors и перерисуем contents
        ensurePeekFloorsLoaded().then(() => {
          if (!currentCase) return;
          const cur = window.WildTimeCurrency?.current || 'ton';
          renderContents(cur);
          refreshCarouselValuePills(cur);
        });

    
    updateOpenButton();
    setBottomActionClaimMode(false);
  
    countBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.count) === selectedCount);
    });
  
    if (demoToggle) demoToggle.classList.toggle('active', isCasesTestMode() || isDemoMode);
  }



  // ====== UPDATE OPEN BUTTON ======
  function updateOpenButton() {
    if (!openBtn || !currentCase) return;

    const currency = window.WildTimeCurrency?.current || 'ton';
    const totalPrice = currentCase.price[currency] * selectedCount;
    const demoActive = isCasesTestMode() || isDemoMode;
    const iconEl = document.getElementById('caseCurrencyIcon');

    const priceEl = document.getElementById('casePrice');
    if (priceEl) {
      priceEl.textContent = demoActive ? 'FREE' : formatAmount(currency, totalPrice);
    }
    if (iconEl) {
      iconEl.src = (currency === 'ton')
        ? assetUrl('icons/currency/tgTonWhite.svg')
        : getCaseCurrencyIcon(currency);
    }

    openBtn.classList.toggle('demo-mode', demoActive);
  }

  function getCaseCurrencyIcon(currency) {
    return currency === 'stars' ? assetUrl('icons/currency/tgStarsWhite.svg') : assetUrl('icons/currency/ton.svg');
  }

  function getCarouselValuePillData(item, currency) {
    if (!item) return null;
    const amount = getItemDisplayValue(item, currency);
    if (!(Number.isFinite(amount) && amount > 0)) return null;
    return {
      amount: formatPillAmount(currency, amount),
      icon: getCaseCurrencyIcon(currency),
      currency
    };
  }

  function createCarouselItemMarkup(item, currency) {
    const id = (item && item.id != null) ? String(item.id) : '';
    const type = itemType(item);
    const rarity = (item && item.rarity) ? String(item.rarity) : 'common';
    const pill = getCarouselValuePillData(item, currency);
    const pillHtml = pill
      ? `
        <span class="case-carousel-item-pill" aria-hidden="true">
          <span class="case-carousel-item-pill__amount">${pill.amount}</span>
          <img class="case-carousel-item-pill__icon" src="${pill.icon}" alt="">
        </span>`
      : '';

    return `<div class="case-carousel-item${pill ? ' case-carousel-item--has-value-pill' : ''}" data-item-id="${id}" data-item-type="${type}" data-rarity="${rarity}">
      <img class="case-carousel-item__img" src="${itemIconPath(item)}" alt="${id}" onerror="this.onerror=null;this.src='${ITEM_ICON_FALLBACK}'">
      ${pillHtml}
    </div>`;
  }

  function syncCarouselItemNode(node, dataItem, currency) {
    if (!node || !dataItem) return;

    const id = (dataItem && dataItem.id != null) ? String(dataItem.id) : '';
    node.dataset.itemId = id;
    node.dataset.itemType = itemType(dataItem);
    node.dataset.rarity = dataItem.rarity || 'common';
    node.classList.remove('case-carousel-item--show-pill');

    let mainImg = node.querySelector('.case-carousel-item__img');
    if (!mainImg) {
      mainImg = document.createElement('img');
      mainImg.className = 'case-carousel-item__img';
      node.prepend(mainImg);
    }

    const imgSrc = itemIconPath(dataItem);
    mainImg.onerror = null;
    mainImg.src = imgSrc;
    mainImg.alt = id;
    mainImg.onerror = function () { this.onerror = null; this.src = ITEM_ICON_FALLBACK; };
    applyAdaptiveStarsGlow(node, imgSrc, currency);

    const pillData = getCarouselValuePillData(dataItem, currency);
    let pillEl = node.querySelector('.case-carousel-item-pill');

    if (pillData) {
      node.classList.add('case-carousel-item--has-value-pill');
      if (!pillEl) {
        pillEl = document.createElement('span');
        pillEl.className = 'case-carousel-item-pill';
        pillEl.setAttribute('aria-hidden', 'true');
        pillEl.innerHTML = `
          <span class="case-carousel-item-pill__amount"></span>
          <img class="case-carousel-item-pill__icon" src="" alt="">
        `;
        node.appendChild(pillEl);
      }

      const amountEl = pillEl.querySelector('.case-carousel-item-pill__amount');
      const iconEl = pillEl.querySelector('.case-carousel-item-pill__icon');
      if (amountEl) amountEl.textContent = pillData.amount;
      if (iconEl) iconEl.src = pillData.icon;
    } else {
      node.classList.remove('case-carousel-item--has-value-pill');
      if (pillEl) pillEl.remove();
    }
  }

  function refreshCarouselValuePills(currency) {
    for (const carousel of carousels) {
      const cont = carousel?.itemsContainer;
      const strip = Array.isArray(carousel?.items) ? carousel.items : [];
      if (!cont || !cont.children || !strip.length) continue;

      const len = Math.min(cont.children.length, strip.length);
      for (let i = 0; i < len; i++) {
        syncCarouselItemNode(cont.children[i], strip[i], currency);
      }
    }
  }

  function setWinningGiftPillsVisible(visible) {
    const shouldShow = !!visible;
    for (const carousel of carousels) {
      const cont = carousel?.itemsContainer;
      if (!cont) continue;

      cont.querySelectorAll('.case-carousel-item--show-pill').forEach((el) => {
        el.classList.remove('case-carousel-item--show-pill');
      });
      if (!shouldShow) continue;

      const winIndex = Number(carousel?.winningStripIndex);
      const winEl = (Number.isFinite(winIndex) && cont.children) ? cont.children[winIndex] : null;
      if (!winEl) continue;
      if (String(winEl.dataset.itemType || '') === 'nft') continue;
      if (!winEl.classList.contains('case-carousel-item--has-value-pill')) continue;

      winEl.classList.add('case-carousel-item--show-pill');
    }
  }

  // ====== RENDER CAROUSELS ======
  function renderCarousels(count, currency) {
    if (!carouselsWrapper || !currentCase) return;

    carouselsWrapper.innerHTML = '';
    carouselsWrapper.classList.remove(
      'case-carousels-wrapper--count-1',
      'case-carousels-wrapper--count-2',
      'case-carousels-wrapper--count-3'
    );
    const normalizedCount = Math.max(1, Math.min(3, Number(count) || 1));
    carouselsWrapper.classList.add(`case-carousels-wrapper--count-${normalizedCount}`);
    carouselsWrapper.dataset.count = String(normalizedCount);
    carousels = [];
    stopAllAnimations();

    const heights = (currency === 'stars' || currency === 'ton')
      ? { 1: 132, 2: 88, 3: 74 }
      : { 1: 100, 2: 85, 3: 70 };
    const height = heights[count] || 100;

    for (let i = 0; i < count; i++) {
      const carousel = createCarousel(height, i, currency);
      carouselsWrapper.appendChild(carousel.element);
      carousels.push(carousel);

      setTimeout(() => carousel.element.classList.add('active'), i * 100);
    }

    if (currency === 'stars' || currency === 'ton') {
      requestAnimationFrame(() => {
        carousels.forEach((carousel) => {
          alignCarouselToCenterLine(carousel);
          updateLeftSideCullForCarousel(carousel, { force: true });
        });
      });
    } else {
      requestAnimationFrame(() => {
        carousels.forEach((carousel) => updateLeftSideCullForCarousel(carousel, { force: true }));
      });
    }
  }

  // ====== CREATE SINGLE CAROUSEL ======
  function createCarousel(height, _idx, currency) {
    const container = document.createElement('div');
    container.className = 'case-carousel';
    if (height <= 72) container.classList.add('case-carousel--compact');
    container.style.height = `${height}px`;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'case-carousel-items';

    // База (не меняется сама по себе) — чтобы не было ощущения, что "линия" резко стала другой
    const IDLE_BASE_COUNT = getIdleBaseCount();
    const baseItems = [];
    for (let i = 0; i < IDLE_BASE_COUNT; i++) {
      const raw = pickStripItem(currentCase, !!isDemoMode) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
      baseItems.push(normalizeItemForCurrency(raw, currency));
    }

    // Делаем 2 копии, чтобы лента реально была бесконечной
    const items = baseItems.concat(baseItems);

    itemsContainer.innerHTML = items.map(item => createCarouselItemMarkup(item, currency)).join('');
    const renderedNodes = itemsContainer.children;
    for (let i = 0; i < items.length && i < renderedNodes.length; i++) {
      applyAdaptiveStarsGlow(renderedNodes[i], itemIconPath(items[i]), currency);
    }

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

  function invalidateCarouselMetrics(carousel) {
    if (!carousel) return;
    carousel._metricsCache = null;
  }

  function getCarouselMetrics(carousel, forceRecalc = false) {
    const cont = carousel?.itemsContainer;
    if (!cont || !cont.children || !cont.children.length) return null;

    const childCount = cont.children.length;
    const contW = Math.round(cont.clientWidth || 0);
    const contH = Math.round(cont.clientHeight || 0);
    const cached = carousel?._metricsCache;
    if (
      !forceRecalc &&
      cached &&
      cached.childCount === childCount &&
      cached.contW === contW &&
      cached.contH === contH
    ) {
      return cached.metrics;
    }

    const firstItem = cont.children[0];
    if (!firstItem) return null;

    const itemWidth = firstItem.getBoundingClientRect().width;
    const cs = getComputedStyle(cont);
    const gap = parseFloat(cs.gap || cs.columnGap || '0') || 0;
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const leftInset = parseFloat(cs.left || '0') || 0;
    const firstOffset = Number(firstItem.offsetLeft || 0);

    const step = itemWidth + gap;
    const baseLen = (carousel.baseItems && carousel.baseItems.length)
      ? carousel.baseItems.length
      : Math.floor((carousel.items?.length || 0) / 2);

    const loopWidth = Math.max(0, baseLen * step);
    const metrics = {
      itemWidth,
      gap,
      padL,
      padR,
      step,
      baseLen,
      loopWidth,
      leftInset,
      firstOffset,
      firstRight: firstOffset + itemWidth
    };

    carousel._metricsCache = { childCount, contW, contH, metrics };
    return metrics;
  }

  function alignCarouselToCenterLine(carousel, attempt = 0) {
    if (!carousel?.itemsContainer) return;
    const metrics = getCarouselMetrics(carousel, attempt === 0);
    if (!metrics || !Number.isFinite(metrics.step) || metrics.step <= 0) {
      if (attempt < 8) {
        requestAnimationFrame(() => alignCarouselToCenterLine(carousel, attempt + 1));
      }
      return;
    }

    const lineX = getLineXInItems(carousel);
    const half = metrics.itemWidth / 2;
    const idx = Math.max(0, Math.ceil((lineX - metrics.padL - half) / metrics.step));
    const targetCenter = metrics.padL + idx * metrics.step + half;

    let nextPos = targetCenter - lineX;
    if (Number.isFinite(metrics.loopWidth) && metrics.loopWidth > 0) {
      nextPos = ((nextPos % metrics.loopWidth) + metrics.loopWidth) % metrics.loopWidth;
    }
    if (!Number.isFinite(nextPos)) nextPos = 0;

    carousel.position = nextPos;
    carousel.itemsContainer.style.transform = `translate3d(-${nextPos}px, 0, 0)`;
  }

  function updateLeftSideCullForCarousel(carousel, options = null) {
    const cont = carousel?.itemsContainer;
    if (!cont || !cont.children || !cont.children.length) return;

    const currentCurrency = window.WildTimeCurrency?.current || 'ton';
    const starsMode = (currentCurrency === 'stars' || currentCurrency === 'ton')
      && document.body.classList.contains('case-sheet-open');
    const force = !!(options && options.force);
    const now = Number(options && options.now);

    if (!starsMode) {
      if (carousel._cullActive || force) {
        for (let i = 0; i < cont.children.length; i++) {
          const el = cont.children[i];
          if (el.classList.contains('case-carousel-item--culled-left')) {
            el.classList.remove('case-carousel-item--culled-left');
          }
          if (el.style.opacity) el.style.opacity = '';
        }
      }
      carousel._cullActive = false;
      return;
    }

    const metrics = getCarouselMetrics(carousel);
    if (!metrics || !Number.isFinite(metrics.itemWidth) || metrics.itemWidth <= 0 || !Number.isFinite(metrics.step) || metrics.step <= 0) return;

    const perfStress = isStarsCarouselPerfStress();
    const minDeltaPx = perfStress ? 1 : 0.35;
    const minIntervalMs = perfStress ? 30 : 14;
    const ts = Number.isFinite(now) ? now : performance.now();
    const pos = Number(carousel.position || 0);
    const prevPos = Number(carousel._lastCullPos);
    const prevTs = Number(carousel._lastCullTs || 0);

    if (!force && Number.isFinite(prevPos)) {
      if (Math.abs(pos - prevPos) < minDeltaPx && (ts - prevTs) < minIntervalMs) {
        return;
      }
    }

    carousel._cullActive = true;
    carousel._lastCullPos = pos;
    carousel._lastCullTs = ts;

    // Use tracked scroll position instead of per-frame viewport rect reads.
    const leftViewportX = pos - (Number(metrics.leftInset) || 0);
    const fadeStartBoundary = leftViewportX + 6;
    const fadeEndBoundary = leftViewportX - 10;
    const fadeSpan = Math.max(1, fadeStartBoundary - fadeEndBoundary);
    const firstRight = Number(metrics.firstRight) || ((Number(metrics.firstOffset) || 0) + metrics.itemWidth);

    for (let i = 0; i < cont.children.length; i++) {
      const el = cont.children[i];
      const rightEdge = firstRight + i * metrics.step;

      if (rightEdge <= fadeEndBoundary) {
        if (!el.classList.contains('case-carousel-item--culled-left')) {
          el.classList.add('case-carousel-item--culled-left');
        }
        if (el.style.opacity !== '0') el.style.opacity = '0';
      } else if (rightEdge < fadeStartBoundary) {
        if (el.classList.contains('case-carousel-item--culled-left')) {
          el.classList.remove('case-carousel-item--culled-left');
        }
        const t = (rightEdge - fadeEndBoundary) / fadeSpan;
        const nextOpacity = String(Math.max(0, Math.min(1, t)));
        if (el.style.opacity !== nextOpacity) el.style.opacity = nextOpacity;
      } else {
        if (el.classList.contains('case-carousel-item--culled-left')) {
          el.classList.remove('case-carousel-item--culled-left');
        }
        if (el.style.opacity) el.style.opacity = '';
      }
    }
  }

  function renderCarouselItems(itemsContainer, items) {
    const currency = window.WildTimeCurrency?.current || 'ton';
    itemsContainer.innerHTML = items.map(it => createCarouselItemMarkup(it, currency)).join('');
    const renderedNodes = itemsContainer.children;
    for (let i = 0; i < items.length && i < renderedNodes.length; i++) {
      applyAdaptiveStarsGlow(renderedNodes[i], itemIconPath(items[i]), currency);
    }
  }

  function resetCarouselToIdleFromCurrent(carousel) {
    const metrics = getCarouselMetrics(carousel, true);
    const strip = Array.isArray(carousel.items) && carousel.items.length ? carousel.items : [];

    // Если по какой-то причине ленты нет — просто пересоздадим базу
    const IDLE_BASE_COUNT = getIdleBaseCount();
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
      invalidateCarouselMetrics(carousel);
      carousel.position = 0;
      cont.style.transform = 'translateX(0px)';
      updateLeftSideCullForCarousel(carousel, { force: true });
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
    invalidateCarouselMetrics(carousel);
    cont.style.transform = `translateX(-${carousel.position}px)`;
    updateLeftSideCullForCarousel(carousel, { force: true });
  }

  // ====== IDLE ANIMATION (slow continuous scroll) ======
  function startIdleAnimation() {
  carousels.forEach((carousel, index) => {
    // было ~0.5–1 px/frame (~30–60 px/s на 60fps)
    // делаем сразу px/сек — так не дергается при просадках FPS
    carousel.velocity = casesLowMotion
      ? (20 + Math.random() * 14)   // 20–34 px/s
      : (32 + Math.random() * 32);  // 32–64 px/s
    carousel.position = carousel.position || 0;

    // для плавности на GPU
    if (carousel.itemsContainer) {
      carousel.itemsContainer.style.willChange = 'transform';
    }

    let lastTime = 0;
    let metrics = getCarouselMetrics(carousel, true);
    let nextMetricsRefreshAt = 0;
    const metricsRefreshMs = casesLowMotion ? 760 : (isStarsCarouselPerfStress() ? 520 : 360);

    const animate = (t) => {
      // если карусель скрыли/удалили — прекращаем
      if (!carousel.element.classList.contains('active')) return;

      if (!lastTime) lastTime = t;

      // dt в секундах, clamp чтобы после сворачивания вкладки не прыгало
      const dt = Math.min(0.05, (t - lastTime) / 1000);
      lastTime = t;

      // во время спина айдл не двигаем, но RAF оставляем живым
      if (!isSpinning) {
        if (!metrics || t >= nextMetricsRefreshAt) {
          metrics = getCarouselMetrics(carousel);
          nextMetricsRefreshAt = t + metricsRefreshMs;
        }

        // шаг на этом кадре
        const delta = carousel.velocity * dt;
        carousel.position += delta;

        if (metrics && metrics.loopWidth > 0) {
          while (carousel.position >= metrics.loopWidth) carousel.position -= metrics.loopWidth;
          while (carousel.position < 0) carousel.position += metrics.loopWidth;
        }

        carousel.itemsContainer.style.transform = `translate3d(-${carousel.position}px, 0, 0)`;
        updateLeftSideCullForCarousel(carousel, { now: t });
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
  
    const icon = currency === 'ton' ? assetUrl('icons/currency/ton.svg') : assetUrl('icons/currency/tgStarsWhite.svg');
  
    contentsGrid.innerHTML = currentCase.items.map(raw => {
      const item = normalizeItemForCurrency(raw, currency);
      const type = itemType(item);
      const sparkLayer = (type === 'nft')
        ? '<div class="case-nft-sparks" aria-hidden="true"></div>'
        : '';
      
      const val = getItemDisplayValue(item, currency);
      const text = formatAmount(currency, val);


      return `
        <div class="case-content-item" data-rarity="${item.rarity || 'common'}" data-item-type="${type}">
          ${sparkLayer}
          <img src="${itemIconPath(item)}" alt="${item.displayName || item.id}" onerror="this.onerror=null;this.src='${ITEM_ICON_FALLBACK}'">
          <div class="case-content-price">
            <span>${text}</span>
            <img src="${icon}" alt="${currency}">
          </div>
        </div>
      `;
    }).join('');

    initNftContentSparks();
  }

  function initNftContentSparks() {
    if (!contentsGrid) return;

    const cards = contentsGrid.querySelectorAll('.case-content-item[data-item-type="nft"]');
    if (!cards.length) return;
    if (casesLowMotion) {
      cards.forEach((card) => {
        const layer = card.querySelector('.case-nft-sparks');
        if (layer) layer.innerHTML = '';
      });
      return;
    }

    const rand = (min, max) => Math.random() * (max - min) + min;

    cards.forEach((card) => {
      const layer = card.querySelector('.case-nft-sparks');
      if (!layer) return;

      layer.innerHTML = '';

      const sparksCount = 6 + Math.floor(Math.random() * 3); // 6..8
      for (let i = 0; i < sparksCount; i++) {
        const spark = document.createElement('span');
        spark.className = 'case-nft-spark';

        const duration = rand(3.0, 7.0);
        const delay = -rand(0, 14);

        spark.style.setProperty('--spark-x', `${rand(10, 90).toFixed(2)}%`);
        spark.style.setProperty('--spark-drift', `${rand(-14, 14).toFixed(2)}px`);
        spark.style.setProperty('--spark-rise', `${rand(42, 98).toFixed(2)}px`);
        spark.style.setProperty('--spark-size', `${rand(1.2, 3.0).toFixed(2)}px`);
        spark.style.setProperty('--spark-duration', `${duration.toFixed(2)}s`);
        spark.style.setProperty('--spark-delay', `${delay.toFixed(2)}s`);
        spark.style.setProperty('--spark-alpha', `${rand(0.30, 0.88).toFixed(2)}`);
        spark.style.setProperty('--spark-blur', `${rand(2.0, 6.0).toFixed(2)}px`);
        spark.style.setProperty('--spark-twinkle', `${rand(0.8, 2.0).toFixed(2)}s`);

        layer.appendChild(spark);
      }
    });
  }
  
  

  // ====== SELECT COUNT ======
  function selectCount(count) {
    if (isAnimating || isSpinning || selectedCount === count) return;

    selectedCount = count;

    countBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
    });

    safeHaptic('selection');

    stopAllAnimations();

    setTimeout(() => {
      const currency = window.WildTimeCurrency?.current || 'ton';
        renderCarousels(count, currency);

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
      try {
        if (!c?.element || !c?.itemsContainer) return 'x';
        const m = getCarouselMetrics(c, true);
        const w = c.element.getBoundingClientRect().width;
        return m ? `${w.toFixed(2)}:${m.itemWidth.toFixed(2)}:${(m.gap||0).toFixed(2)}` : 'x';
      } catch {
        return 'x';
      }
    }).join('|');

    if (sig === lastSig) return true;
    lastSig = sig;

    await new Promise(r => requestAnimationFrame(r));
  }
  return false; // если не успели — всё равно продолжим
}

  // Функция для блокировки прокрутки в fullscreen режиме
  function scrollCarouselToCenter() {
    // В fullscreen режиме карусель позиционируется через CSS (position: fixed, top: 50%)
    // Просто блокируем прокрутку body, но не трогаем панель
    requestAnimationFrame(() => {
      // Сохраняем текущую позицию прокрутки панели
      const panel = document.querySelector('.case-sheet-panel');
      if (panel) {
        // Запоминаем позицию для возможного восстановления
        panel.dataset.scrollTop = panel.scrollTop;
      }
    });
  }
    async function handleOpenCase() {
    if (isAnimating || isSpinning || !currentCase || !openBtn) return;

    const tgWeb = window.Telegram?.WebApp;
    const tgUserId = (tgWeb?.initDataUnsafe?.user?.id) ? String(tgWeb.initDataUnsafe.user.id) : "guest";
    const initData = tgWeb?.initData ? tgWeb.initData : "";

    const currency = window.WildTimeCurrency?.current || 'ton';
    const demoModeAtStart = isCasesTestMode() ? true : !!isDemoMode;
    const hasInitData = (typeof initData === 'string') && initData.trim().length > 0;
    // Важно: шанс выпадения NFT зависит ТОЛЬКО от Demo-тумблера.
    // initData может отсутствовать (например, на десктопе), но это не должно превращать режим в Demo.
    const effectiveDemo = demoModeAtStart;
    // Серверные списания/начисления делаем только если это не demo, есть userId и валидный initData.
    let serverEnabled = (!demoModeAtStart && tgUserId !== 'guest' && hasInitData);
    const countAtStart = selectedCount;
    const totalPrice = currentCase.price[currency] * countAtStart;

    // Lock UI immediately (prevents double tap and mode/count changes)
    isSpinning = true;
    openBtn.disabled = true;
    openBtn.style.opacity = '0.6';

    activeSpin = { demoMode: effectiveDemo, serverEnabled, currency, count: countAtStart, totalPrice, userId: tgUserId, initData, roundId: `case_${tgUserId}_${Date.now()}_${Math.random().toString(16).slice(2)}` };
    setControlsLocked(true);
    let openStep = 'start';
    let spendApplied = false;
    let fallbackRetried = false;

    try {
      // 1) Balance check + server spend (only in normal mode)
      openStep = 'balance_and_spend';
      if (serverEnabled) {
        const balance = getBalanceSafe(currency);
        if (balance < totalPrice) {
          showToast(casesText(
            `Insufficient ${currency.toUpperCase()} balance`,
            `������������ ${currency.toUpperCase()} �� �������`
          ));
          safeHaptic('notification', 'error');
          return;
        }

        const spendId = `case_open_${tgUserId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const spend = (currency === 'ton')
          ? -Number(totalPrice.toFixed(2))
          : -Math.round(totalPrice);

        const r = await fetchJsonSafe('/api/deposit-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: spend,
            currency,
            userId: tgUserId,
            initData,
            timestamp: Date.now(),
            depositId: spendId,
            roundId: activeSpin?.roundId || null,
            type: 'case_open',
            notify: false
          })
        }, 6500);

        if (!r.ok) {
          const canFallbackToLocal =
            r.status === 0 ||
            r.status === 401 ||
            r.status === 403;

          if (canFallbackToLocal) {
            console.warn('[Cases] Server spend failed, falling back to local mode', {
              status: r.status,
              error: r.error || r.json?.error || null
            });
            spendApplied = true;
            try {
              if (spend !== 0) applyBalanceDelta(currency, spend);
            } catch (balanceErr) {
              console.warn('[Cases] Failed to apply local spend fallback:', {
                error: balanceErr?.message || String(balanceErr || 'unknown')
              });
            }
            serverEnabled = false;
            if (activeSpin) {
              activeSpin.serverEnabled = false;
              activeSpin.initData = '';
            }
            if (r.status === 401 || r.status === 403) {
              showToast(casesText(
                'Telegram session expired. Continuing in local mode.',
                '������ Telegram ��������. ���������� � ��������� ������.'
              ));
            } else {
              showToast(casesText(
                'Server unavailable. Continuing in local mode.',
                '������ ����������. ���������� � ��������� ������.'
              ));
            }
          } else {
            if (r.status === 503) {
              showToast(casesText(
                'Maintenance mode is active. Case opening is temporarily unavailable.',
                '����������� ����� �������. �������� ������ �������� ����������.'
              ));
            } else {
              showToast(casesText(
                'Failed to charge case cost. Please try again.',
                '�� ������� ������� ��������� �����. �������� ��� ���.'
              ));
            }
            safeHaptic('notification', 'error');
            return;
          }
        }

        if (r.ok && r.json && typeof r.json.newBalance !== 'undefined') {
          spendApplied = true;
          try {
            setBalanceValue(currency, r.json.newBalance);
          } catch (balanceErr) {
            console.warn('[Cases] Failed to apply server balance update:', {
              error: balanceErr?.message || String(balanceErr || 'unknown')
            });
          }
        } else if (r.ok) {
          // fallback (rare)
          spendApplied = true;
          try {
            applyBalanceDelta(currency, spend);
          } catch (balanceErr) {
            console.warn('[Cases] Failed to apply spend delta:', {
              error: balanceErr?.message || String(balanceErr || 'unknown')
            });
          }
        }
      }

      else {
        // Demo: OPEN is FREE (не списываем баланс)
        // Guest (без сервера) в обычном режиме: списываем локально, чтобы не было бесплатного фарма
        if (!demoModeAtStart) {
          const spend = (currency === 'ton') ? -Number(totalPrice.toFixed(2)) : -Math.round(totalPrice);
          spendApplied = true;
          try {
            if (spend !== 0) applyBalanceDelta(currency, spend);
          } catch (balanceErr) {
            console.warn('[Cases] Failed to apply local spend:', {
              error: balanceErr?.message || String(balanceErr || 'unknown')
            });
          }
        }
      }



      console.log('[Cases] 🎰 Opening case:', { demo: effectiveDemo, serverEnabled, count: countAtStart, currency });
      
      // 2) Активируем fullscreen режим
      openStep = 'fullscreen';
      document.body.classList.add("case-opening-fullscreen");
      document.body.setAttribute("data-opening-case", currentCase.id);
      
      // Центрируем карусель и сбрасываем прокрутку
      scrollCarouselToCenter();
      
      // Небольшая задержка для плавного перехода UI
      await delay(casesLowMotion ? 280 : 600);


      // 3) Wait for stable layout, then spin
      openStep = 'layout_ready';
      await waitForStableCarouselLayout();
      safeHaptic('impact', 'heavy');

      openStep = 'spin';
      await spinCarousels(currency, activeSpin);
      openStep = 'done';
    } catch (e) {
      console.error('[Cases] Open error:', {
        step: openStep,
        error: e?.message || String(e || 'unknown'),
        stack: e?.stack || null
      });

      const canRetrySafely =
        !fallbackRetried &&
        openStep !== 'spin' &&
        openStep !== 'done' &&
        (effectiveDemo || spendApplied || !serverEnabled);

      // Safe fallback: retry one local spin in any runtime (without extra charge).
      if (canRetrySafely) {
        fallbackRetried = true;
        try {
          console.warn('[Cases] Safe fallback: retrying open in local mode', {
            openStep,
            spendApplied,
            serverEnabled
          });
          if (activeSpin) {
            activeSpin.serverEnabled = false;
            activeSpin.initData = '';
            activeSpin.demoMode = !!effectiveDemo;
          }
          document.body.classList.add('case-opening-fullscreen');
          document.body.setAttribute('data-opening-case', currentCase?.id || '');
          await delay(casesLowMotion ? 80 : 120);
          await waitForStableCarouselLayout(casesLowMotion ? 420 : 600);
          await spinCarousels(currency, activeSpin || {
            demoMode: !!effectiveDemo,
            serverEnabled: false
          });
          return;
        } catch (fallbackErr) {
          console.error('[Cases] Safe fallback open failed:', fallbackErr);
        }
      }

      if (isLocalRuntime()) {
        showToast(casesText(
          `Case open error (${openStep})`,
          `������ �������� ����� (${openStep})`
        ));
      } else {
        showToast(casesText(
          'Case open error',
          '������ �������� �����'
        ));
      }
      safeHaptic('notification', 'error');
    } finally {
      // NOTE: spinCarousels awaits showResult (claims), so this runs only after claim/sell is done.
      openBtn.disabled = false;
      openBtn.style.opacity = '1';

      isSpinning = false;
      activeSpin = null;
      setControlsLocked(false);

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
    setWinningGiftPillsVisible(false);

    const starsPerfMode = (currency === 'stars' || currency === 'ton') && (carousels.length >= 3 || isStarsCarouselPerfStress());
    const MIN_STRIP_LENGTH = starsPerfMode
      ? (casesLowMotion ? 116 : 140)
      : (casesLowMotion ? 128 : 170);
    const TAIL_AFTER_WIN = starsPerfMode
      ? (casesLowMotion ? 20 : 26)
      : (casesLowMotion ? 24 : 32);

    const spinPromises = carousels.map((carousel, index) => {
      return new Promise(async (resolve) => {
        try {
        // 1) Выбираем выигрыш
        const winRaw = pickWinningItem(currentCase, !!(spinCtx && spinCtx.demoMode), currency) || makeEmergencyStarsGift(currentCase);
            const winItem = normalizeItemForCurrency(winRaw, currency);
            carousel.winningItem = winItem;


        // 2) Берём текущую ленту как базу (чтобы не было резкого "скачка")
        const demoSpin = !!(spinCtx && spinCtx.demoMode);
        let strip = (Array.isArray(carousel.items) && carousel.items.length) ? carousel.items.slice() : [];

        if (!strip.length) {
          const idleCount = getIdleBaseCount();
          for (let i = 0; i < idleCount; i++) {
            const raw = pickStripItem(currentCase, demoSpin) || makeEmergencyStarsGift(currentCase);
                strip.push(normalizeItemForCurrency(raw, currency));

          }
        }

        // 3) Удлиняем ленту
        while (strip.length < MIN_STRIP_LENGTH) {
          const raw = pickStripItem(currentCase, demoSpin) || makeEmergencyStarsGift(currentCase);
          strip.push(normalizeItemForCurrency(raw, currency));
        }

        // 4) Фиксируем позицию выигрыша ближе к концу
        const winAt = strip.length - TAIL_AFTER_WIN;
        strip[winAt] = winItem;

        // В обычном режиме делаем "безопасную зону" вокруг выигрышной позиции,
        // чтобы из‑за пиксельного сдвига линия не могла случайно попасть на NFT.
        if (!demoSpin && itemType(winItem) !== 'nft') {
          const poolsSafe = getCasePools(currentCase);
          const giftsPool = (poolsSafe && poolsSafe.gifts && poolsSafe.gifts.length) ? poolsSafe.gifts : null;
          if (giftsPool) {
            const safeRadius = 5; // +-5 слотов вокруг выигрыша
            for (let k = -safeRadius; k <= safeRadius; k++) {
              const ii = winAt + k;
              if (ii < 0 || ii >= strip.length) continue;
              strip[ii] = normalizeItemForCurrency(pickRandom(giftsPool) || strip[ii], currency);

            }
            // гарантируем сам выигрыш
            strip[winAt] = winItem;
          }
        }

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
            syncCarouselItemNode(node, dataItem, currency);
          } else {
            const node = document.createElement('div');
            node.innerHTML = createCarouselItemMarkup(dataItem, currency);
            const actualNode = node.firstElementChild;
            if (actualNode) cont.appendChild(actualNode);
          }
        }

        if (existingNodes.length > needed) {
          for (let i = existingNodes.length - 1; i >= needed; i--) {
            cont.removeChild(existingNodes[i]);
          }
        }
        invalidateCarouselMetrics(carousel);

        // 5.5) Надёжный замер размеров (иногда в момент переключения fullscreen браузер может вернуть 0)
let itemWidth = 0;
let gap = 0;
let padL = 0;
let step = 0;

for (let a = 0; a < 12; a++) {
  const firstItem = cont.querySelector('.case-carousel-item');
  if (!firstItem) break;

  itemWidth = firstItem.getBoundingClientRect().width;

  const cs = getComputedStyle(cont);
  gap = parseFloat(cs.gap || cs.columnGap || '0') || 0;
  padL = parseFloat(cs.paddingLeft) || 0;

  step = itemWidth + gap;

  if (Number.isFinite(step) && step > 5) break;
  await new Promise(r => requestAnimationFrame(r));
}

if (!(Number.isFinite(step) && step > 5)) { resolve(); return; }


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

        // 🔥 FIX: lineX зависит от текущей позиции ленты (contRect сдвигается при translateX).
        // Вычитаем startPosition, чтобы получить КОНСТАНТУ — смещение индикатора
        // относительно начала контента при position=0.
        const lineOffset = lineX - startPosition;

        // 8) Точка внутри выигрышного айтема (чтобы не попадать строго в край)
        const innerMargin = Math.max(0, Math.min(18, itemWidth * 0.18));
        const span = Math.max(0, itemWidth - innerMargin * 2);
        const randomPoint = innerMargin + Math.random() * span;

        // 9) Целевая позиция: под линию попадает randomPoint у winAt
        let targetPosition = padL + winAt * step + randomPoint - lineOffset;

        const maxTarget = padL + (strip.length - 1) * step + (itemWidth - 1) - lineOffset;
        targetPosition = Math.max(0, Math.min(targetPosition, maxTarget));

        // 10) Минимальная "дистанция", чтобы не было ощущения микро-дерга
        const minTravel = step * 20;
        if (targetPosition - startPosition < minTravel) {
          targetPosition = Math.min(maxTarget, startPosition + minTravel);
        }

        const totalDistance = targetPosition - startPosition;

        // 11) Плавная анимация
        const duration = (casesLowMotion ? 3600 : 5200) + index * (casesLowMotion ? 180 : 250) + Math.random() * (casesLowMotion ? 320 : 600);
        const startTime = performance.now();
        let lastHaptic = 0;

        cont.style.willChange = 'transform';

        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = easeInOutCubic(progress);

          carousel.position = startPosition + totalDistance * eased;
          cont.style.transform = `translate3d(-${carousel.position}px, 0, 0)`;
          updateLeftSideCullForCarousel(carousel, { now: currentTime });

          // тактилка не чаще, чем раз в 140мс
          if (progress < 0.85 && (currentTime - lastHaptic) > 140) {
            safeHaptic('impact', 'light');
            lastHaptic = currentTime;
          }

          if (progress < 1) {
            animationFrames[index] = requestAnimationFrame(animate);
          } else {
            carousel.position = targetPosition;
            cont.style.transform = `translate3d(-${targetPosition}px, 0, 0)`;
            cont.style.willChange = '';
            updateLeftSideCullForCarousel(carousel, { force: true });

            // ВАЖНО: финальный выигрыш = то, что реально под линией
            syncWinByLine(carousel, targetPosition, strip, padL, step, lineOffset, itemWidth);

            highlightWinningItem(carousel, index);
            resolve();
          }
        };

        setTimeout(() => {
          animationFrames[index] = requestAnimationFrame(animate);
        }, index * 140);
        } catch (spinLineError) {
          console.error('[Cases] spin line error:', {
            index,
            error: spinLineError?.message || String(spinLineError || 'unknown')
          });
          resolve();
        }
      });
    });

    await Promise.all(spinPromises);

    // для CSS: затемнить остальные
    carousels.forEach(c => {
      try { c?.element?.classList?.add('cases-finished'); } catch (_) {}
    });

    await delay(250);
    
    // Плавно возвращаем UI - переходим в режим "complete"
    document.body.classList.remove("case-opening-fullscreen");
    document.body.classList.add("case-opening-complete");
    
    // Небольшая задержка для плавной анимации возврата UI
    await delay(400);
    
    try {
      await showResult(
        currency,
        spinCtx && typeof spinCtx.demoMode === 'boolean' ? spinCtx.demoMode : undefined,
        spinCtx && typeof spinCtx.serverEnabled === 'boolean' ? spinCtx.serverEnabled : undefined
      );
    } catch (showResultError) {
      console.error('[Cases] showResult error:', showResultError);
      showToast(casesText(
        'Failed to render result. Please try again.',
        '�� ������� ���������� ���������. �������� ��� ���.'
      ));
      safeHaptic('notification', 'error');

      // Fail-safe UI reset
      try { hideClaimBar(); } catch (_) {}
      document.body.classList.remove('case-opening-fullscreen', 'case-opening-complete', 'case-opening-finished');
      document.body.removeAttribute('data-opening-case');
      carousels.forEach((carousel) => {
        if (!carousel) return;
        try { carousel.element?.classList?.remove('cases-finished'); } catch (_) {}
        try {
          const ind = carousel.element?.querySelector?.('.case-carousel-indicator');
          if (ind) ind.classList.remove('won', 'winning');
        } catch (_) {}
        try { delete carousel._clearedGlow; } catch (_) { carousel._clearedGlow = false; }
        try { resetCarouselToIdleFromCurrent(carousel); } catch (_) {}
      });
      try { startIdleAnimation(); } catch (_) {}
    }
  }

  // ====== HIGHLIGHT WINNING ITEM ======
  function highlightWinningItem(carousel, index) {
    // Линия — зелёный импульс + фиксируем зелёный до клейма
    const indicator = carousel.element.querySelector('.case-carousel-indicator');
    if (indicator) {
      // держим зелёным, пока юзер не заберёт награду (claim/sell)
      indicator.classList.add('won');
      // короткий импульс (чтобы было понятно что выпало) — потом убираем, оставляя won
      indicator.classList.add('winning');
      setTimeout(() => indicator.classList.remove('winning'), 650);
    }

    // Убираем старую подсветку предмета
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


  // ====== CLEAR GLOW AFTER CLAIM ======
  function clearGlowForType(typeToClear) {
    const t = (typeToClear === 'nft') ? 'nft' : 'gift';
    for (const carousel of carousels) {
      if (!carousel || !carousel.winningItem) continue;
      const wt = itemType(carousel.winningItem);
      if (wt !== t) continue;
      if (carousel._clearedGlow) continue;

      carousel._clearedGlow = true;

      const indicator = carousel.element?.querySelector?.('.case-carousel-indicator');
      if (indicator) indicator.classList.remove('won', 'winning');

      const winIndex = carousel.winningStripIndex;
      const winEl = (carousel.itemsContainer && carousel.itemsContainer.children) ? carousel.itemsContainer.children[winIndex] : null;
      if (winEl) winEl.classList.remove('winning');
    }
  }


  function clearGlowForCarousel(carousel) {
    if (!carousel || !carousel.winningItem) return;
    if (carousel._clearedGlow) return;

    carousel._clearedGlow = true;

    const indicator = carousel.element?.querySelector?.('.case-carousel-indicator');
    if (indicator) indicator.classList.remove('won', 'winning');

    const winIndex = carousel.winningStripIndex;
    const winEl = (carousel.itemsContainer && carousel.itemsContainer.children) ? carousel.itemsContainer.children[winIndex] : null;
    if (winEl) winEl.classList.remove('winning');
  }

// ====== CLAIM BAR (under carousels) ======
function setBottomActionClaimMode(enabled) {
  const bottom = document.querySelector('.case-bottom-button');
  if (!bottom) return;
  bottom.classList.toggle('has-claim', !!enabled);
}

function bindClaimBarHandlers(bar) {
  if (!bar) return;

  const giftBtn = bar.querySelector('#caseClaimBtn');
  const nftClaimBtn = bar.querySelector('#caseNftClaimBtn');
  const nftSellBtn  = bar.querySelector('#caseNftSellBtn');

  // Use explicit onclick rebinding so handlers stay alive even if bar survived a hot/shell remount.
  if (giftBtn) {
    giftBtn.onclick = (ev) => {
      try { ev?.preventDefault?.(); ev?.stopPropagation?.(); } catch (_) {}
      onGiftClaimClick();
    };
  }
  if (nftClaimBtn) {
    nftClaimBtn.onclick = (ev) => {
      try { ev?.preventDefault?.(); ev?.stopPropagation?.(); } catch (_) {}
      onNftClaimClick();
    };
  }
  if (nftSellBtn) {
    nftSellBtn.onclick = (ev) => {
      try { ev?.preventDefault?.(); ev?.stopPropagation?.(); } catch (_) {}
      onNftSellClick();
    };
  }

  bar.dataset.bound = '1';
}

function ensureClaimBar() {
  const bottomActions = document.querySelector('.case-bottom-button');
  if (!bottomActions) return null;

  let bar = document.getElementById('caseClaimBar');
  if (bar) {
    if (bar.parentElement !== bottomActions) {
      bottomActions.appendChild(bar);
    }
    bindClaimBarHandlers(bar);
    return bar;
  }

  bar = document.createElement('div');
  bar.id = 'caseClaimBar';
  bar.className = 'case-claim-bar';
  bar.hidden = true;

  bar.innerHTML = `
    <div class="case-claim-row">
      <button id="caseClaimBtn" class="case-claim-btn" type="button">
        <span class="case-claim-btn__label">Claim</span>
        <span class="case-claim-btn__amount" id="caseClaimAmount">0</span>
        <img class="case-claim-btn__icon" id="caseClaimIcon" src="icons/currency/tgStarsWhite.svg" alt="">
      </button>

      <div id="caseNftActions" class="case-nft-actions-inline" style="display:none" hidden>
        <button id="caseNftClaimBtn" class="case-nft-btn-inline case-nft-btn-inline--primary" type="button">
          <img id="caseNftClaimThumb" class="case-nft-btn-inline__thumb" src="" alt="">
          <span class="case-nft-btn-inline__label">Claim</span>
        </button>

        <button id="caseNftSellBtn" class="case-nft-btn-inline case-nft-btn-inline--secondary" type="button">
          <span>Sell</span>
          <span id="caseNftSellAmount" class="case-nft-btn-inline__amount">0</span>
          <img id="caseNftSellIcon" class="case-nft-btn-inline__icon" src="icons/currency/tgStarsWhite.svg" alt="">
        </button>
      </div>
    </div>

    <div class="case-claim-note" id="caseClaimNote" hidden></div>
  `;

  // Place claim actions into the bottom action zone (instead of Open button area).
  bottomActions.appendChild(bar);

  bindClaimBarHandlers(bar);

  return bar;
}

function hideClaimBar() {
  const bar = document.getElementById('caseClaimBar');
  if (!bar) return;

  setBottomActionClaimMode(false);
  bar.classList.remove('is-visible');
  setWinningGiftPillsVisible(false);
  bar.hidden = true;

  // gifts (left)
  const giftBtn = bar.querySelector('#caseClaimBtn');
  const giftAmt = bar.querySelector('#caseClaimAmount');
  if (giftAmt) giftAmt.textContent = '0';
  if (giftBtn) {
    giftBtn.disabled = false;
    giftBtn.hidden = false;
    giftBtn.style.display = '';
    giftBtn.classList.remove('loading', 'claimed');
  }

  // nft actions (right)
  const nftWrap = bar.querySelector('#caseNftActions');
  if (nftWrap) nftWrap.hidden = true;
  if (nftWrap) nftWrap.style.display = 'none';

  const nftThumb = bar.querySelector('#caseNftClaimThumb');
  if (nftThumb) { nftThumb.src = ''; nftThumb.style.display = 'none'; }

  const nftClaimBtn = bar.querySelector('#caseNftClaimBtn');
  const nftSellBtn  = bar.querySelector('#caseNftSellBtn');
  const sellAmt = bar.querySelector('#caseNftSellAmount');

  if (sellAmt) sellAmt.textContent = '0';
  if (nftClaimBtn) { nftClaimBtn.disabled = false; nftClaimBtn.classList.remove('loading'); }
  if (nftSellBtn)  { nftSellBtn.disabled = false;  nftSellBtn.classList.remove('loading'); }

  const note = bar.querySelector('#caseClaimNote');
  if (note) { note.hidden = true; note.textContent = ''; }
}




const INV_LS_PREFIX = 'WT_INV_'; // keep in sync with profile.js
function inventoryLocalKey(userId) {
  return INV_LS_PREFIX + String(userId);
}
function legacyInventoryLocalKey(userId) {
  return `wt_inventory_${String(userId)}`;
}

function normalizeInventory(arr) {
  const a = Array.isArray(arr) ? arr : [];
  const seen = new Set();
  const out = [];
  for (const it of a) {
    if (!it) continue;
    const key = it.instanceId || it.id || JSON.stringify(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function readLocalInventory(userId) {
  try {
    const rawNew = localStorage.getItem(inventoryLocalKey(userId));
    const rawOld = localStorage.getItem(legacyInventoryLocalKey(userId));
    const a = rawNew ? JSON.parse(rawNew) : [];
    const b = rawOld ? JSON.parse(rawOld) : [];
    return normalizeInventory([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
  } catch {
    return [];
  }
}

function writeLocalInventory(userId, arr) {
  const clean = normalizeInventory(arr);
  try { localStorage.setItem(inventoryLocalKey(userId), JSON.stringify(clean)); } catch {}
  // legacy mirror for older builds
  try { localStorage.setItem(legacyInventoryLocalKey(userId), JSON.stringify(clean)); } catch {}
}

function addToLocalInventory(userId, items) {
  const prev = readLocalInventory(userId);
  writeLocalInventory(userId, prev.concat(items || []));
}

async function fetchJsonSafe(url, options = {}, timeoutMs = 6000) {
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;

  try {
    const resp = await fetch(url, { ...options, signal: ctrl ? ctrl.signal : undefined });
    let json = null;
    try { json = await resp.json(); } catch (_) {}
    return { ok: resp.ok, status: resp.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: (e && e.name === 'AbortError') ? 'timeout' : (e?.message || 'fetch_failed') };
  } finally {
    if (t) clearTimeout(t);
  }
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = !!loading;
  btn.classList.toggle('loading', !!loading);
}

function showToast(msg) {
  if (typeof window.showToast === 'function') {
    try { window.showToast(msg); return; } catch (_) {}
  }
  const tg = window.Telegram?.WebApp;
  if (tg?.showToast) { try { tg.showToast({ message: msg }); return; } catch (_) {} }
  if (tg?.showAlert) { try { tg.showAlert(msg); return; } catch (_) {} }
  try { alert(msg); } catch (_) {}
}

// ====== SHOW RESULT (Gift: Claim; NFT: Claim/Sell) ======

// ====== SHOW RESULT (Gift: Claim; NFT: Claim/Sell) ======
async function showResult(currency, demoModeOverride, serverEnabledOverride) {
  const tgWeb = window.Telegram?.WebApp;
  const tgUserId = (tgWeb?.initDataUnsafe?.user?.id) ? String(tgWeb.initDataUnsafe.user.id) : "guest";
  const initData = tgWeb?.initData ? tgWeb.initData : "";

  const demoModeForRound = (typeof demoModeOverride === 'boolean') ? demoModeOverride : isDemoMode;
  const hasInitData = (typeof initData === 'string') && initData.trim().length > 0;
  // Сервер включаем только если не demo, есть userId и валидный initData.
  const serverEnabled = (typeof serverEnabledOverride === 'boolean')
    ? serverEnabledOverride
    : (!demoModeForRound && tgUserId !== 'guest' && hasInitData);

  // Collect wins with carousel refs (needed for per-line glow clearing)
  const winEntries = carousels
    .map((c, lineIndex) => ({ carousel: c, item: c?.winningItem || null, lineIndex }))
    .filter(e => !!e.item);

  const giftEntries = winEntries.filter(e => itemType(e.item) !== 'nft');
  const nftEntries  = winEntries.filter(e => itemType(e.item) === 'nft');

  // Global history (server + local)
  try {
    const meta = getTgUserMeta();
    const entries = makeHistoryEntries(currentCase, winEntries, meta);
    // Always show locally (useful on localhost); send to server only when not demo
    if (entries.length) {
      mergeHistoryLocal(entries);
      if (!demoModeForRound && serverEnabled) {
        sendHistoryToServer(entries, tgUserId, initData);
      }
    }
  } catch (_) {}

  const itemValue = (it) => prizeValue(it, currency);


  const giftsAmount = (currency === 'stars')
    ? Math.max(0, giftEntries.reduce((sum, e) => sum + Math.round(itemValue(e.item) || 0), 0))
    // TON: sum rounded item cents to avoid float drift (e.g. 0.015 becoming 0.01).
    : Math.max(
      0,
      giftEntries.reduce((sum, e) => sum + Math.round((itemValue(e.item) || 0) * 100), 0) / 100
    );

  const icon = currency === 'ton' ? assetUrl('icons/currency/ton.svg') : assetUrl('icons/currency/tgStarsWhite.svg');

  // Use one roundId for the whole open -> claim flow
  const roundId = activeSpin?.roundId || `case_${tgUserId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
 // чтобы getFloorTonForItem() уже знал цены
  try { await ensurePeekFloorsLoaded(); } catch (_) {}

  // Build NFT queue (we will CLAIM ALL from overlay at once)
  const nftQueue = nftEntries.map((e, idx) => {
    const floorTon = getFloorTonForItem(e.item);
    const tonVal = (floorTon != null) ? Number(floorTon) : Number(e.item?.price?.ton || 0);
  
    const fixedTon = (Number.isFinite(tonVal) && tonVal > 0) ? Math.round(tonVal * 100) / 100 : 0;
    const starsVal = (fixedTon > 0) ? tonToStars(fixedTon) : 0;
  
    // ВАЖНО: сохраняем цену в item.price => попадёт в Inventory
    const item = {
      ...e.item,
      price: {
        ...(e.item?.price || {}),
        ton: fixedTon,
        stars: starsVal
      }
    };
  
    // amount -> это то, что увидит Winning Screen (nft-win-screen.js берет nft.amount) :contentReference[oaicite:3]{index=3}
    const amount = (currency === 'stars') ? starsVal : fixedTon;
  
    return {
      ...e,
      item,
      amount,
      claimId: `case_nft_claim_${currentCase?.id || 'case'}_${tgUserId}_${Date.now()}_${Math.random().toString(16).slice(2)}_${idx}`,
      sellDepositId: `case_nft_sell_${roundId}_${idx}_${Date.now()}_${Math.random().toString(16).slice(2)}`
    };
  });
  

  const bar = ensureClaimBar();

  // Lock opening until user finishes claim
  if (openBtn) {
    openBtn.disabled = true;
    openBtn.style.opacity = '0.6';
  }

  const resetAfter = () => {
    hideClaimBar();
    
    // Добавляем класс finished для убирания оверлея
    document.body.classList.add("case-opening-finished");
    
    // Через задержку убираем все классы
    setTimeout(() => {
      document.body.classList.remove("case-opening-complete", "case-opening-finished");
      document.body.removeAttribute("data-opening-case");
    }, 600);
    
    carousels.forEach((carousel) => {
      carousel.element.classList.remove('cases-finished');
      const ind = carousel.element.querySelector('.case-carousel-indicator');
      if (ind) ind.classList.remove('won', 'winning');
      try { delete carousel._clearedGlow; } catch (_) { carousel._clearedGlow = false; }
      resetCarouselToIdleFromCurrent(carousel);
    });
    startIdleAnimation();
    if (openBtn) {
      openBtn.disabled = false;
      openBtn.style.opacity = '1';
    }
  };

  // Claim all NFTs (real mode saves them; demo just clears highlight)
  
// Claim all NFTs (real mode saves them; demo just clears highlight)
const claimAllNfts = async (queue) => {
  if (!queue || !queue.length) return true;

  const nowMs = Date.now();
  const withdrawLockUntil = (currency === 'stars')
    ? (nowMs + 5 * 24 * 60 * 60 * 1000)
    : null;
  const items = queue.map((q) => {
    const src = (q && q.item && typeof q.item === 'object') ? q.item : {};
    const out = { ...src };
    if (!out.acquiredCurrency) out.acquiredCurrency = currency;
    if (withdrawLockUntil && !out.withdrawLockUntil) out.withdrawLockUntil = withdrawLockUntil;
    return out;
  });

  if (demoModeForRound) {
    showToast(casesText(
      'Demo: NFTs are not saved.',
      'Demo: NFT �� �����������'
    ));
    return true;
  }

  // Local mode (no server / no Telegram)
  if (!serverEnabled) {
    addToLocalInventory(tgUserId, items);
    try { window.dispatchEvent(new Event('inventory:update')); } catch (_) {}
    showToast(items.length > 1
      ? casesText('NFTs saved locally', 'NFT ��������� ��������')
      : casesText('NFT saved locally', 'NFT ��������� ��������'));
    return true;
  }

  const claimId = `case_nft_claim_${roundId}`;

  const r = await fetchJsonSafe('/api/inventory/nft/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: tgUserId,
      initData,
      items,
      claimId,
      roundId
    })
  }, 6500);

  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      showToast(casesText(
        'Telegram session expired. Reopen the mini app and try again.',
        '������ Telegram ��������. ����������� ����-��� � �������� ��� ���.'
      ));
    } else {
      showToast(r.json?.error || casesText(
        'Failed to save NFT. Please try again.',
        '�� ������� ��������� NFT. �������� ��� ���.'
      ));
    }
    return false;
  }

  // Server returns full inventory list
  const list = r.json?.items || r.json?.nfts;
  if (Array.isArray(list)) {
    writeLocalInventory(tgUserId, list);
  } else {
    addToLocalInventory(tgUserId, items);
  }
  try { window.dispatchEvent(new Event('inventory:update')); } catch (_) {}

  safeHaptic('notification', 'success');
  showToast(items.length > 1
    ? casesText('NFTs saved', 'NFT ���������')
    : casesText('NFT saved', 'NFT ���������'));

  return true;
};

  return new Promise((resolve) => {
    if (!bar) {
      resetAfter();
      resolve();
      return;
    }

    pendingRound = {
      roundId,
      userId: tgUserId,
      initData,
      currency,
      icon,

      demo: !!demoModeForRound,
      serverEnabled: !!serverEnabled,

      // Gifts
      giftsAmount,
      giftEntries,
      giftsPending: giftsAmount > 0,

      // NFTs (overlay first)
      nftQueue,
      nftEntries,
      nftPending: nftQueue.length > 0,

      depositIds: {
        giftClaim: `case_gift_claim_${roundId}`,
      },

      _resolve: resolve,
      _resetAfter: resetAfter
    };

    // Show NFT overlay FIRST (even if there are normal gifts too)
    (async () => {
      const pr = pendingRound;
      if (!pr) return;

      if (pr.nftPending && window.NftWinOverlay?.open) {
        const uiNfts = pr.nftQueue.map((q) => ({
          name: q.item?.name || q.item?.title || q.item?.displayName || '',
          image: itemIconPath(q.item),
          amount: q.amount,
        }));
        const total = pr.nftQueue.reduce((s, q) => s + (Number(q.amount) || 0), 0);

        await window.NftWinOverlay.open({
          title: pr.demo ? 'You could have won' : "You've won!",
          buttonText: pr.demo ? 'Continue' : 'Claim',
          demo: pr.demo,
          currency,
          currencyIcon: pr.icon,
          caseId: currentCase?.id || 'case1', // Pass case ID for theme
          nfts: uiNfts,
          // В примере часто показывают value под заголовком — включаем, когда выпало >= 1 NFT
          showTotal: true,
          total,
          
          onPrimary: async () => {
            // Claim/Continue pressed
            if (!pr.demo) {
              const ok = await claimAllNfts(pr.nftQueue);
              if (!ok) return false; // keep overlay open
            } else {
              // demo: just close + clear UI highlight
              // (toast inside claimAllNfts not нужен, чтобы не спамить)
            }

            // Clear highlight for all NFT lines (these are "already claimed")
            pr.nftQueue.forEach((entry) => clearGlowForCarousel(entry.carousel));

            // Mark NFTs as done so claim bar shows ONLY gift claim
            pr.nftQueue = [];
            pr.nftPending = false;

            return true;
          }
        });
      }

      renderPendingClaimBar();
      maybeFinishPendingRound();
    })();
  });
}

function renderPendingClaimBar() {
  try {
    const bar = ensureClaimBar();
    if (!bar) return;

    const giftBtn = bar.querySelector('#caseClaimBtn');
    const amountEl = bar.querySelector('#caseClaimAmount');
    const iconEl = bar.querySelector('#caseClaimIcon');

    const nftWrap = bar.querySelector('#caseNftActions');
    const nftThumb = bar.querySelector('#caseNftClaimThumb');
    const sellAmountEl = bar.querySelector('#caseNftSellAmount');
    const sellIconEl = bar.querySelector('#caseNftSellIcon');
    const nftClaimBtn = bar.querySelector('#caseNftClaimBtn');
    const nftSellBtn = bar.querySelector('#caseNftSellBtn');

    if (!pendingRound) {
      setWinningGiftPillsVisible(false);
      hideClaimBar();
      return;
    }

    const row = bar.querySelector('.case-claim-row');
    const hasGifts = !!pendingRound.giftsPending;
    const hasNfts = !!(pendingRound.nftQueue && pendingRound.nftQueue.length);
    pendingRound.nftPending = hasNfts;
    if (row) {
      row.classList.toggle('no-nft', !hasNfts);
      row.classList.toggle('no-gift', !hasGifts);
      row.classList.toggle('only-nft', hasNfts && !hasGifts);
      row.classList.toggle('only-gift', hasGifts && !hasNfts);
    }

    // Gifts (left)
    // Если выпали ТОЛЬКО NFT (и нет валюты) — левую кнопку скрываем полностью.
    if (giftBtn) {
      const hideGiftBtn = (!hasGifts && hasNfts);
      giftBtn.hidden = hideGiftBtn;
      giftBtn.style.display = hideGiftBtn ? 'none' : '';
    }

    const giftAmt = hasGifts ? pendingRound.giftsAmount : 0;
    if (amountEl) amountEl.textContent = formatAmount(pendingRound.currency, giftAmt);
    if (iconEl) iconEl.src = pendingRound.icon;
    if (giftBtn) {
      giftBtn.disabled = !hasGifts;
      giftBtn.classList.toggle('claimed', !hasGifts);
      giftBtn.classList.remove('loading');
    }

    // NFT actions (right block) — показываем только когда реально выпало NFT
    if (hasNfts) {
      if (nftWrap) { nftWrap.hidden = false; nftWrap.style.display = ''; }

      // Preview NFT image in the Claim button (current NFT in queue)
      const currentEntry = (pendingRound.nftQueue && pendingRound.nftQueue.length) ? pendingRound.nftQueue[0] : null;
      const currentNft = currentEntry ? currentEntry.item : null;

      if (nftThumb) {
        nftThumb.src = currentNft ? itemIconPath(currentNft) : '';
        nftThumb.style.display = currentNft ? '' : 'none';
      }

      if (sellAmountEl) sellAmountEl.textContent = formatAmount(pendingRound.currency, currentEntry ? currentEntry.amount : 0);
      if (sellIconEl) sellIconEl.src = pendingRound.icon;
      if (nftClaimBtn) { nftClaimBtn.disabled = false; nftClaimBtn.classList.remove('loading'); }
      if (nftSellBtn) { nftSellBtn.disabled = false; nftSellBtn.classList.remove('loading'); }
    } else {
      if (nftWrap) { nftWrap.hidden = true; nftWrap.style.display = 'none'; }
      if (nftThumb) { nftThumb.src = ''; nftThumb.style.display = 'none'; }
      if (sellAmountEl) sellAmountEl.textContent = formatAmount(pendingRound.currency, 0);
    }

    // Скрываем панель только если нечего клеймить/продавать
    const shouldShowBar = !!(hasGifts || hasNfts);
    setWinningGiftPillsVisible(shouldShowBar && hasGifts);

    if (!shouldShowBar) {
      setBottomActionClaimMode(false);
      bar.classList.remove('is-visible');
      bar.hidden = true;
      return;
    }

    setBottomActionClaimMode(true);
    if (bar.hidden) {
      bar.hidden = false;
      bar.classList.remove('is-visible');
      requestAnimationFrame(() => {
        const currentBar = document.getElementById('caseClaimBar');
        if (!currentBar || currentBar.hidden) return;
        currentBar.classList.add('is-visible');
      });
    } else {
      bar.classList.add('is-visible');
    }
  } catch (e) {
    console.error('[Cases] renderPendingClaimBar error:', e);
    // Fail-safe: don't freeze the UI
    try { hideClaimBar(); } catch (_) {}
    if (pendingRound && pendingRound._resetAfter) {
      const res = pendingRound._resolve;
      const reset = pendingRound._resetAfter;
      pendingRound = null;
      try { reset(); } catch (_) {}
      try { res && res(); } catch (_) {}
    } else {
      try {
        if (openBtn) { openBtn.disabled = false; openBtn.style.opacity = '1'; }
        isSpinning = false;
        activeSpin = null;
        setControlsLocked(false);
      } catch (_) {}
    }
  }
}

function maybeFinishPendingRound() {
  const pr = pendingRound;
  if (!pr) return;
  if (pr.giftsPending || pr.nftPending) return;

  // Done
  const resolve = pr._resolve;
  const resetAfter = pr._resetAfter;

  pendingRound = null;
  resetAfter();
  resolve && resolve();
}

// ===== Button handlers (bound once in ensureClaimBar) =====
async function onGiftClaimClick() {
  const pr = pendingRound;
  if (!pr || !pr.giftsPending) return;
  if (pr._giftClaimInFlight) return;

  const bar = document.getElementById('caseClaimBar');
  const btn = bar?.querySelector('#caseClaimBtn');

  pr._giftClaimInFlight = true;
  setBtnLoading(btn, true);
  try {
    if (!Number.isFinite(Number(pr.giftsAmount)) || Number(pr.giftsAmount) <= 0) {
      pr.giftsPending = false;
      pr.giftsAmount = 0;
      renderPendingClaimBar();
      maybeFinishPendingRound();
      return;
    }

    if (pr.demo) {
      showToast(casesText(
        'Demo: reward is not credited.',
        'Demo: ������� �� �����������'
      ));
    } else if (!pr.serverEnabled) {
      applyBalanceDelta(pr.currency, pr.giftsAmount);
    } else {
      const r = await fetchJsonSafe('/api/deposit-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: pr.giftsAmount,
          currency: pr.currency,
          userId: pr.userId,
          initData: pr.initData,
          timestamp: Date.now(),
          depositId: pr.depositIds.giftClaim,
          roundId: pr.roundId || null,
          type: 'case_gift_claim',
          notify: false
        })
      }, 6500);

      if (!r.ok) {
        const canFallbackToLocal =
          r.status === 0 ||
          r.status === 401 ||
          r.status === 409 ||
          r.status === 429 ||
          r.status === 500 ||
          r.status === 502;

        if (canFallbackToLocal) {
          console.warn('[Cases] Gift claim failed on server, falling back to local credit', {
            status: r.status,
            error: r.error || r.json?.error || null
          });
          applyBalanceDelta(pr.currency, pr.giftsAmount);
          pr.serverEnabled = false;
          if (r.status === 401) {
            showToast(casesText(
              'Telegram session expired. Reward was credited locally.',
              '������ Telegram ��������. ������� ��������� ��������.'
            ));
          } else {
            showToast(casesText(
              'Server unavailable. Reward was credited locally.',
              '������ ����������. ������� ��������� ��������.'
            ));
          }
        } else {
          if (r.status === 503) {
            showToast(casesText(
              'Maintenance mode. Unclaimed case value will be refunded.',
              '����������� �����. ��������� ������������ ����� ����� ����������.'
            ));
            return;
          }
          showToast(casesText(
            'Failed to credit reward. Please try again.',
            '�� ������� ��������� �������. �������� ��� ���.'
          ));
          return;
        }
      }
      if (r.ok && r.json && typeof r.json.newBalance !== 'undefined') {
        setBalanceValue(pr.currency, r.json.newBalance);
      } else if (r.ok) {
        // fallback (rare)
        applyBalanceDelta(pr.currency, pr.giftsAmount);
      }
    }

    safeHaptic('notification', 'success');

    // подарки забраны -> гасим зелёную линию на тех каруселях, где выпали gifts
    clearGlowForType('gift');

    pr.giftsPending = false;
    pr.giftsAmount = 0;
    renderPendingClaimBar();
    maybeFinishPendingRound();
  } catch (e) {
    console.error('[Cases] Gift claim click failed:', e);
    showToast(casesText(
      'Failed to process claim. Please try again.',
      '�� ������� ���������� �����. �������� ��� ���.'
    ));
  } finally {
    pr._giftClaimInFlight = false;
    setBtnLoading(btn, false);
  }
}

async function onNftClaimClick() {
  const pr = pendingRound;
  if (!pr) return;
  if (pr._nftClaimInFlight) return;

  const entry = (pr.nftQueue && pr.nftQueue.length) ? pr.nftQueue[0] : null;
  if (!entry) return;

  const bar = document.getElementById('caseClaimBar');
  const btn = bar?.querySelector('#caseNftClaimBtn');
  pr._nftClaimInFlight = true;
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }

  try {
    const item = entry.item;

    if (pr.demo) {
      showToast(casesText(
        'Demo: NFTs are not saved.',
        'Demo: NFT �� �����������'
      ));
    } else if (!pr.serverEnabled) {
      addToLocalInventory(pr.userId, [item]);
    } else {
      // Save NFT to profile inventory (one-by-one)
      let r = await fetchJsonSafe('/api/inventory/nft/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: pr.userId,
          initData: pr.initData,
          items: [item],
          claimId: entry.claimId,
          roundId: pr.roundId || null
        })
      }, 6500);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
        showToast(casesText(
          'Telegram session expired. Reopen the mini app and try again.',
          '������ Telegram ��������. ����������� ����-��� � �������� ��� ���.'
        ));
      } else {
        showToast(r.json?.error || casesText(
          'Failed to save NFT. Please try again.',
          '�� ������� ��������� NFT. �������� ��� ���.'
        ));
      }
        return;
      }

      const list = r.json?.items || r.json?.nfts;
      if (Array.isArray(list)) {
        writeLocalInventory(pr.userId, list);
      } else {
        addToLocalInventory(pr.userId, [item]);
      }
      try { window.dispatchEvent(new Event('inventory:update')); } catch (_) {}
    }

    safeHaptic('notification', 'success');
    if (!pr.demo) showToast(casesText('NFT saved', 'NFT ���������'));

    // Clear glow only for this NFT line
    clearGlowForCarousel(entry.carousel);

    // Advance to next NFT (if any)
    pr.nftQueue.shift();
    pr.nftPending = !!(pr.nftQueue && pr.nftQueue.length);

    renderPendingClaimBar();
    maybeFinishPendingRound();
  } finally {
    pr._nftClaimInFlight = false;
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}

async function onNftSellClick() {
  const pr = pendingRound;
  if (!pr) return;
  if (pr._nftSellInFlight) return;

  const entry = (pr.nftQueue && pr.nftQueue.length) ? pr.nftQueue[0] : null;
  if (!entry) return;

  const bar = document.getElementById('caseClaimBar');
  const btn = bar?.querySelector('#caseNftSellBtn');
  pr._nftSellInFlight = true;
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }

  try {
    const amount = entry.amount;

    if (pr.demo) {
      showToast(casesText(
        'Demo: selling is disabled.',
        'Demo: ������� ���������'
      ));
    } else if (!pr.serverEnabled) {
      applyBalanceDelta(pr.currency, amount);
    } else {
      const r = await fetchJsonSafe('/api/deposit-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency: pr.currency,
          userId: pr.userId,
          initData: pr.initData,
          timestamp: Date.now(),
          depositId: entry.sellDepositId,
          roundId: pr.roundId || null,
          type: 'case_nft_sell',
          notify: false
        })
      }, 6500);

      if (!r.ok) {
        showToast(casesText(
          'Failed to sell NFT. Please try again.',
          '�� ������� ������� NFT. �������� ��� ���.'
        ));
        return;
      }
      if (r.json && typeof r.json.newBalance !== 'undefined') {
        setBalanceValue(pr.currency, r.json.newBalance);
      }
    }

    safeHaptic('notification', 'success');
    if (!pr.demo) showToast(casesText('NFT sold', 'NFT �������'));

    // Clear glow only for this NFT line
    clearGlowForCarousel(entry.carousel);

    // Advance to next NFT
    pr.nftQueue.shift();
    pr.nftPending = !!(pr.nftQueue && pr.nftQueue.length);

    renderPendingClaimBar();
    maybeFinishPendingRound();
  } finally {
    pr._nftSellInFlight = false;
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}


// ====== CURRENCY CHANGE LISTENER ======
  window.addEventListener('currency:changed', () => {
    if (isSpinning) {
      pendingCurrencyChange = true;
      return;
    }

    initHeroTicker();
    renderHistory(historyState);
    ensureCasesThemeBackdrop();
    clearLegacyCasesCurrencySwapArtifacts();
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
    getCases: () => getActiveCases(),
    isDemoMode: () => isDemoMode,
    setDemoMode: (mode) => {
      if (isSpinning) return false; // запрещаем менять режим во время прокрута/клейма
      if (isCasesTestMode()) {
        isDemoMode = true;
        if (demoToggle) demoToggle.classList.add('active');
        updateOpenButton();
        return true;
      }
      isDemoMode = !!mode;
      if (demoToggle) demoToggle.classList.toggle('active', isDemoMode);
      updateOpenButton();
      return true;
    }
  };

  console.log('[Cases] Module loaded');
})();

