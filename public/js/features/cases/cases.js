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
  const CASES = {
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


    }
,
// Case 2: NFT + Gifts
    case2: {
      id: 'case2',
      name: 'NFT Hunt',
      price: { ton: 0.15, stars: 30 },
      items: [
        // NFTs (put images into /public/images/nfts/)
        { id: 'Stellar Rocket', type: 'nft', icon: 'RaketaNFT.png',   nftChance: 0.01, price: { ton: 3.46, stars: 350 }, rarity: 'legendary' },
        { id: 'Ice Cream', type: 'nft', icon: 'IceCreamNFT.png', nftChance: 0.01, price: { ton: 2.83, stars: 359 }, rarity: 'epic' },
        { id: 'Instant Ramen', type: 'nft', icon: 'RamenNFT.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'rare' },

        // Gifts
        { id: 'gift1',  icon: 'gift1.png',  giftChance: 0.03, price: { ton: 0.92, stars: 100 }, rarity: 'legendary' },
        { id: 'gift4',  icon: 'gift4.png',  giftChance: 0.08, price: { ton: 0.46, stars: 50  }, rarity: 'epic' },
        { id: 'gift7',  icon: 'gift7.png',  giftChance: 0.18, price: { ton: 0.46, stars: 50  }, rarity: 'rare' },
        { id: 'gift9',  icon: 'gift9.png',  giftChance: 0.71, price: { ton: 0.23, stars: 25  }, rarity: 'common' },
        { id: 'gift12', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
      ]
    }

    ,
    case3: {
      id: 'case3',
      name: 'Sweet Sugar',
      price: { ton: 0.20, stars: 40 },
      items: [
        // Premium NFTs
        { id: 'Ice Cream', type: 'nft', icon: 'IceCreamNFtSkin.png', nftChance: 0.01, price: { ton: 3.46, stars: 350 }, rarity: 'legendary' },
        { id: 'Cookie Heart', type: 'nft', icon: 'CookieHeartNFTSkin.png', nftChance: 0.01, price: { ton: 2.83, stars: 359 }, rarity: 'legendary' },
        { id: 'Mousse Cake', type: 'nft', icon: 'MousseCakeNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'Lol Pop', type: 'nft', icon: 'LolPopNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'Berry Box', type: 'nft', icon: 'BerryBoxNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },

        // High-value Gifts       
        { id: 'gift7',  icon: 'gift7.png',  giftChance: 0.18, price: { ton: 0.46, stars: 50  }, rarity: 'rare' },   
        { id: 'gift12', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
        { id: 'gift13', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.01, stars: 3 }, rarity: 'common' },
      ]
      
    }
    ,
    case4: {
      id: 'case4',
      name: 'Ice Blue',
      price: { ton: 0.25, stars: 50 },
      items: [
        // Premium NFTs
        { id: 'Electric Skull', type: 'nft', icon: 'ElectricSkullNFTSkin.png', nftChance: 0.00, price: { ton: 3.46, stars: 350 }, rarity: 'legendary' },
        { id: 'Vintage Cigar', type: 'nft', icon: 'VintageCigarNFTSkin.png', nftChance: 0.00, price: { ton: 2.83, stars: 359 }, rarity: 'legendary' },
        { id: 'Voodoo Doll', type: 'nft', icon: 'VoodooDollNFTSkin.png', nftChance: 0.00, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'Flying Broom', type: 'nft', icon: 'FlyingBroomNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },
        { id: 'Hex Pot', type: 'nft', icon: 'HexPotNFTSkin.png', nftChance: 0.01, price: { ton: 2.7, stars: 235  }, rarity: 'epic' },

        // High-value Gifts       
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.030, stars: 10 }, rarity: 'common' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.01, stars: 3 }, rarity: 'common' },
        
      ]
      
    }

    ,
    case5: {
      id: 'case5',
      name: 'Cat House',
      price: { ton: 1, stars: 200 },
      items: [
        // Premium NFTs
   
        { id: 'Mighty Arm', type: 'nft', icon: 'MightyArmNFTSkin.png', nftChance: 0.00, price: { ton: 2.5, stars: 250 }, rarity: 'legendary' },
        { id: 'Scared Cat', type: 'nft', icon: 'ScaredCatNFTSkin.png', nftChance: 0.00, price: { ton: 2.8, stars: 280 }, rarity: 'legendary' },
        { id: 'Bonded Ring', type: 'nft', icon: 'BondedRingNFTSkin.png', nftChance: 0.00, price: { ton: 3.0, stars: 300  }, rarity: 'legendary' },
        { id: 'Genie Lamp', type: 'nft', icon: 'GenieLampNFTSkin.png', nftChance: 0.00, price: { ton: 2.7, stars: 270  }, rarity: 'legendary' },
        { id: 'Jack-In-The-Box', type: 'nft', icon: 'JackInTheBoxNFTSkin.png', nftChance: 0.01, price: { ton: 2.6, stars: 260  }, rarity: 'legendary' },
        { id: 'Winter Wreath', type: 'nft', icon: 'WinterWreathNFTSkin.png', nftChance: 0.01, price: { ton: 2.9, stars: 290  }, rarity: 'legendary' },
                // High-value Gifts       
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.065, stars: 25 }, rarity: 'common' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.030, stars: 10 }, rarity: 'common' },
        { id: '', icon: 'stars.webp', giftChance: 0.71, price: { ton: 0.015, stars: 5 }, rarity: 'common' },
        
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

  let pendingRound = null; // { roundId, currency, demo, ... }

  let carousels = [];
  let animationFrames = [];
  let caseSheetLockedScrollY = 0;
  let caseSheetPrevBodyTop = '';

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


function isStarsPrizeGift(item) {
  return itemType(item) !== 'nft' && String(item?.icon || '').toLowerCase() === 'stars.webp';
}

function normalizeItemForCurrency(item, currency) {
  if (!item) return item;
  if (currency !== 'ton') return item;
  if (!isStarsPrizeGift(item)) return item;

  const stars = Number(item?.price?.stars || 0);
  const ton = starsToTon(stars);

  return {
    ...item,
    displayName: 'TON',
    icon: assetUrl('icons/ton.svg'),
    price: {
      ...(item.price || {}),
      ton
    }
  };
  
}


// ====== PEEK FLOOR PRICES (in-memory on client) ======
const NFT_PEEK_NAME_BY_ICON = {
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

async function ensurePeekFloorsLoaded() {
  // обновлять чаще смысла нет, у нас сервер обновляет раз в час
  if (peekFloorMap && (Date.now() - peekFloorUpdatedAt) < 10 * 60 * 1000) return;

  try {
    let j = null;

    // 1) same-origin (works in production / when UI served by this server)
    try {
      const r1 = await fetch('/api/gifts/prices');
      if (r1.ok) j = await r1.json();
    } catch (e) {
      console.warn('[Cases] Failed to fetch from /api/gifts/prices:', e);
    }
    
    // 2) dev fallback: try Node on :7700
    if (!j) {
      try {
        const r2a = await fetch('http://localhost:7700/api/gifts/prices');
        if (r2a.ok) j = await r2a.json();
      } catch (e) {
        console.warn('[Cases] Failed to fetch from localhost:7700:', e);
      }
    }
    
    // 3) Alternative: try market.tonnel.network
    if (!j) {
      try {
        console.log('[Cases] Trying alternative source: market.tonnel.network');
        const r3 = await fetch('https://market.tonnel.network/api/gifts/prices');
        if (r3.ok) j = await r3.json();
      } catch (e) {
        console.warn('[Cases] Failed to fetch from market.tonnel.network:', e);
      }
    }

    if (!j) {
      console.error('[Cases] All price sources failed');
      return;
    }
    const items = Array.isArray(j?.items) ? j.items : [];

    const m = new Map();
    for (const it of items) {
      const name = String(it.name || '').trim();
      const priceTon = Number(it.priceTon);
      if (!name || !Number.isFinite(priceTon)) continue;
      m.set(name.toLowerCase(), priceTon);
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
  const v = peekFloorMap.get(peekName.toLowerCase());
  return (Number.isFinite(v) && v > 0) ? v : null;
}



// ====== DROP RATES (NFT rarity) ======
// Demo: NFT выпадает часто (почти каждый прокрут)
// Paid (TON / Stars): NFT выпадает редко
const NFT_DROP_RATES = {
  demo: 0.40,          // 90% на выигрыш в демо
  ton: 0.13,           // 3% на выигрыш за TON
  stars: 0.12          // 2% на выигрыш за Stars
};

// Для заполнения ленты (визуально): чтобы NFT не мелькали слишком часто
const STRIP_NFT_CHANCE = {
  demo: 0.28,          // в демо пусть иногда мелькают
  paid: 0.26           // в обычном режиме редко
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

function getNftWinChance(demoMode, currency) {
  if (demoMode) return NFT_DROP_RATES.demo;
  return (currency === 'ton') ? NFT_DROP_RATES.ton : NFT_DROP_RATES.stars;
}

function pickWinningItem(caseData, demoMode, currency) {
  const pools = getCasePools(caseData);
  if (!pools.items.length) return null;

  // Если NFT в кейсе нет — выбираем как обычно
  if (!pools.nfts.length) return pickWeightedGift(pools.items) || pickRandom(pools.items);

  const chance = getNftWinChance(demoMode, currency);
  const roll = Math.random();

  if (roll < chance) {
    return pickWeightedNft(pools.nfts) || pickRandom(pools.items);
  }
  // не NFT: выбираем из подарков
  return pickWeightedGift(pools.gifts) || pickRandom(pools.gifts) || pickRandom(pools.items);
}

function pickStripItem(caseData, demoMode) {
  const pools = getCasePools(caseData);
  if (!pools.items.length) return null;

  if (!pools.nfts.length) return pickWeightedGift(pools.items) || pickRandom(pools.items);

  const chance = demoMode ? STRIP_NFT_CHANCE.demo : STRIP_NFT_CHANCE.paid;
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

  if (currency === 'ton') {
    // ⭐-приз -> конвертим в TON по курсу
    if (isStarsPrizeGift(item)) {
      const s = Number(p.stars);
      return (Number.isFinite(s) && s > 0) ? starsToTon(s) : 0;
    }
    const t = Number(p.ton);
    return (Number.isFinite(t) && t > 0) ? t : 0;
  }

  // currency === 'stars'
  // ⭐-приз остаётся в звёздах как есть
  if (isStarsPrizeGift(item)) {
    const s = Number(p.stars);
    return (Number.isFinite(s) && s > 0) ? s : 0;
  }

  // Всё остальное: считаем Stars из TON (актуальный курс, чтобы цены не были завышены/занижены)
  const t = Number(p.ton);
  if (Number.isFinite(t) && t > 0) return tonToStars(t);

  const s = Number(p.stars);
  return (Number.isFinite(s) && s > 0) ? s : 0;
}

function formatAmount(currency, value) {
    if (currency === 'ton') return (Math.round((parseFloat(value) || 0) * 100) / 100).toFixed(2);
    return String(Math.round(parseFloat(value) || 0));


    
  }

  function setBalanceValue(currency, value) {
  const c = (currency === 'stars') ? 'stars' : 'ton';
  const next = (c === 'ton')
    ? Math.max(0, Math.round((parseFloat(value) || 0) * 100) / 100)
    : Math.max(0, Math.round(parseFloat(value) || 0));

  // Update internal balance if exists
  if (window.WildTimeCurrency) {
    window.WildTimeCurrency.balance = window.WildTimeCurrency.balance || { ton: 0, stars: 0 };
    window.WildTimeCurrency.balance[c] = next;
  } else {
    window.WildTimeCurrency = { current: c, balance: { ton: 0, stars: 0 } };
    window.WildTimeCurrency.balance[c] = next;
  }

  // Prefer official setter if available
  if (typeof window.WildTimeCurrency.setBalance === 'function') {
    try { window.WildTimeCurrency.setBalance(c, next); } catch (_) {}
  }

  // Notify listeners
  window.dispatchEvent(new CustomEvent('balance:update', { detail: { [c]: next } }));
  return next;
}









function applyBalanceDelta(currency, delta) {
  const c = (currency === 'stars') ? 'stars' : 'ton';
  const curr = window.WildTimeCurrency?.balance?.[c] ?? 0;
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

  function initHeroTicker() {
    heroTickerEl = document.getElementById('casesHeroTicker');
    if (!heroTickerEl) return;

    // Clear and (re)build
    heroTickerEl.innerHTML = '';
    const list = Object.values(CASES);
    const slotMs = 2200; // each case visible ~2.2s
    const totalMs = Math.max(slotMs * Math.max(1, list.length), 3000);

    list.forEach((caseData, idx) => {
      const item = document.createElement('div');
      item.className = 'cases-hero__ticker-item';
      item.style.animationDuration = `${totalMs}ms`;
      item.style.animationDelay = `${idx * slotMs}ms`;
      item.innerHTML = `<img src="images/cases/${escapeHtml(caseData.id)}.png" alt="${escapeHtml(caseData.name)}">`;
      heroTickerEl.appendChild(item);
    });
  }

  function renderHistory(items) {
    if (!historyListEl) return;
    const arr = Array.isArray(items) ? items : [];
    historyListEl.innerHTML = arr.map((h) => {
      const u = h.user || {};
      const userLabel = escapeHtml(u.username || u.name || 'User');
      const itemLabel = escapeHtml(h.drop?.label || h.drop?.id || '');
      const caseId = escapeHtml(h.caseId || 'case1');
      const dropIcon = escapeHtml(h.drop?.icon || ITEM_ICON_FALLBACK);
      return `
        <div class="cases-history-item" title="${userLabel} • ${itemLabel}">
          <div class="cases-history-item__thumb">
            <img class="cases-history-item__case" src="images/cases/${caseId}.png" alt="${caseId}">
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
    countBtns = Array.from(document.querySelectorAll('.case-count-btn'));

    createDemoToggle();
    attachListeners();
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
    const casesPath = document.getElementById('casesGrid');
    if (!casesPath) return;

    // Change class to cases-path for new styling
    casesPath.className = 'cases-path';
    casesPath.innerHTML = '';

    const casesArray = Object.values(CASES);
    const currency = window.WildTimeCurrency?.current || 'ton';
    const icon = currency === 'ton' ? assetUrl('icons/tgTonWhite.svg') : assetUrl('icons/stars.svg');

    casesArray.forEach((caseData, index) => {
      const price = caseData.price[currency];
      
      // Get 3 items for animated track display
      const displayItems = caseData.items.slice(0, 3);

      const pathItem = document.createElement('div');
      pathItem.className = 'case-path-item';
      pathItem.dataset.caseId = caseData.id;

      pathItem.innerHTML = `
        <!-- Premium horizontal track with border & shimmer -->
        <div class="case-path-track">
          <div class="case-path-track-shimmer"></div>
        </div>
        
        <!-- Animated items sliding on track -->
        <div class="case-path-items">
          ${displayItems.map(item => `
            <div class="case-path-item-float">
              <img src="${itemIconPath(item)}" 
                   alt="${item.id}"
                   onerror="this.onerror=null;this.src='${ITEM_ICON_FALLBACK}'">
            </div>
          `).join('')}
        </div>
        
        <!-- Case positioned ON the track -->
        <div class="case-path-case">
          <div class="case-path-image-wrapper">
            <div class="case-path-glow"></div>
            <img src="${assetUrl(`images/cases/${caseData.id}.png`)}" 
                 alt="${caseData.name}" 
                 class="case-path-image">
          </div>
          <!-- Liquid glass price pill OVER the case -->
          <div class="case-path-price">
            <img src="${icon}" class="case-path-price-icon" alt="${currency}">
            <span class="case-path-price-val">${price}</span>
          </div>
        </div>
      `;

      pathItem.addEventListener('click', () => openBottomSheet(caseData.id));
      casesPath.appendChild(pathItem);
    });
  }


  // ====== OPEN BOTTOM SHEET ======
  function lockCaseSheetScreen() {
    if (document.body.classList.contains('case-sheet-open')) return;

    caseSheetLockedScrollY = window.scrollY || window.pageYOffset || 0;
    caseSheetPrevBodyTop = document.body.style.top || '';

    document.documentElement.classList.add('case-sheet-open');
    document.body.classList.add('case-sheet-open');
    document.body.style.top = `-${caseSheetLockedScrollY}px`;
  }

  function unlockCaseSheetScreen() {
    if (!document.body.classList.contains('case-sheet-open')) return;

    const restoreY = caseSheetLockedScrollY || 0;

    document.documentElement.classList.remove('case-sheet-open');
    document.body.classList.remove('case-sheet-open');
    document.body.style.top = caseSheetPrevBodyTop || '';

    caseSheetPrevBodyTop = '';
    caseSheetLockedScrollY = 0;

    window.scrollTo(0, restoreY);
  }

  function openBottomSheet(caseId) {
    if (isAnimating || document.body.classList.contains('case-sheet-open')) return;

    currentCase = CASES[caseId];
    if (!currentCase) return;

    console.log('[Cases] 🎁 Opening:', currentCase.name);

    isAnimating = true;
    selectedCount = 1;

    lockCaseSheetScreen();

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

    if (sheetPanel) sheetPanel.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    unlockCaseSheetScreen();

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
    const icon = currency === 'ton' ? assetUrl('icons/ton.svg') : assetUrl('icons/stars.svg');
  
    const title = document.getElementById('caseSheetTitle');
    if (title) title.textContent = currentCase.name;
  
    const priceEl = document.getElementById('casePrice');
    const iconEl = document.getElementById('caseCurrencyIcon');
    if (priceEl) priceEl.textContent = price;
    if (iconEl) iconEl.src = icon;
  
    // Set case ID on panel for gradient styling
    if (sheetPanel) {
      sheetPanel.setAttribute('data-case-id', currentCase.id);
    }
  
    // Set case image for count section
    const countSection = document.querySelector('.case-count-section');
    if (countSection) {
      const caseImg = assetUrl(`images/cases/${currentCase.id}.png`);
      countSection.style.setProperty('--current-case-image', `url('${caseImg}')`);
}
  
    renderCarousels(selectedCount, currency);


    
    // подтянем floors и перерисуем contents
        ensurePeekFloorsLoaded().then(() => {
          if (!currentCase) return;
          const cur = window.WildTimeCurrency?.current || 'ton';
          renderContents(cur);
        });

    
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
  function renderCarousels(count, currency) {
    if (!carouselsWrapper || !currentCase) return;

    carouselsWrapper.innerHTML = '';
    carousels = [];
    stopAllAnimations();

    const heights = { 1: 100, 2: 85, 3: 70 };
    const height = heights[count] || 100;

    for (let i = 0; i < count; i++) {
      const carousel = createCarousel(height, i, currency);
      carouselsWrapper.appendChild(carousel.element);
      carousels.push(carousel);

      setTimeout(() => carousel.element.classList.add('active'), i * 100);
    }
  }

  // ====== CREATE SINGLE CAROUSEL ======
  function createCarousel(height, _idx, currency) {
    const container = document.createElement('div');
    container.className = 'case-carousel';
    container.style.height = `${height}px`;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'case-carousel-items';

    // База (не меняется сама по себе) — чтобы не было ощущения, что "линия" резко стала другой
    const IDLE_BASE_COUNT = 70;
    const baseItems = [];
    for (let i = 0; i < IDLE_BASE_COUNT; i++) {
      const raw = pickStripItem(currentCase, !!isDemoMode) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
      baseItems.push(normalizeItemForCurrency(raw, currency));
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
  
    const icon = currency === 'ton' ? assetUrl('icons/ton.svg') : assetUrl('icons/stars.svg');
  
    contentsGrid.innerHTML = currentCase.items.map(raw => {
      const item = normalizeItemForCurrency(raw, currency);
      const type = itemType(item);
      const sparkLayer = (type === 'nft')
        ? '<div class="case-nft-sparks" aria-hidden="true"></div>'
        : '';
      
      // Для NFT: показываем floor price если есть, иначе fallback
      let val = item?.price?.[currency];
      
      if (type === 'nft') {
        const floorTon = getFloorTonForItem(item);
        if (floorTon != null && floorTon > 0) {
          val = (currency === 'ton') ? floorTon : tonToStars(floorTon);
        }
      }
  
      const text = (currency === 'ton')
        ? (Math.round((Number(val) || 0) * 100) / 100).toFixed(2)
        : String(Math.round(Number(val) || 0));


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

    tg?.HapticFeedback?.selectionChanged?.();

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
    const demoModeAtStart = !!isDemoMode;
    // Важно: шанс выпадения NFT зависит ТОЛЬКО от Demo-тумблера.
    // initData может отсутствовать (например, на десктопе), но это не должно превращать режим в Demo.
    const effectiveDemo = demoModeAtStart;
    // Серверные списания/начисления делаем только если это не demo и есть реальный userId.
    const serverEnabled = (!demoModeAtStart && tgUserId !== 'guest');
    const countAtStart = selectedCount;
    const totalPrice = currentCase.price[currency] * countAtStart;

    // Lock UI immediately (prevents double tap and mode/count changes)
    isSpinning = true;
    openBtn.disabled = true;
    openBtn.style.opacity = '0.6';

    activeSpin = { demoMode: effectiveDemo, serverEnabled, currency, count: countAtStart, totalPrice, userId: tgUserId, initData, roundId: `case_${tgUserId}_${Date.now()}_${Math.random().toString(16).slice(2)}` };
    setControlsLocked(true);

    try {
      // 1) Balance check + server spend (only in normal mode)
      if (serverEnabled) {
        const balance = getBalanceSafe(currency);
        if (balance < totalPrice) {
          showToast(`Insufficient ${currency.toUpperCase()} balance`);
          tgWeb?.HapticFeedback?.notificationOccurred?.('error');
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
            type: 'case_open',
            notify: false
          })
        }, 6500);

        if (!r.ok) {
          showToast('Не удалось списать стоимость кейса. Попробуй ещё раз.');
          tgWeb?.HapticFeedback?.notificationOccurred?.('error');
          return;
        }

        if (r.json && typeof r.json.newBalance !== 'undefined') {
          setBalanceValue(currency, r.json.newBalance);
        } else {
          // fallback (rare)
          applyBalanceDelta(currency, spend);
        }
      }

      else {
        // Demo: OPEN is FREE (не списываем баланс)
        // Guest (без сервера) в обычном режиме: списываем локально, чтобы не было бесплатного фарма
        if (!demoModeAtStart) {
          const spend = (currency === 'ton') ? -Number(totalPrice.toFixed(2)) : -Math.round(totalPrice);
          if (spend !== 0) applyBalanceDelta(currency, spend);
        }
      }



      console.log('[Cases] 🎰 Opening case:', { demo: effectiveDemo, serverEnabled, count: countAtStart, currency });
      
      // 2) Активируем fullscreen режим
      document.body.classList.add("case-opening-fullscreen");
      document.body.setAttribute("data-opening-case", currentCase.id);
      
      // Центрируем карусель и сбрасываем прокрутку
      scrollCarouselToCenter();
      
      // Небольшая задержка для плавного перехода UI
      await delay(600);


      // 3) Wait for stable layout, then spin
      await waitForStableCarouselLayout();
      tgWeb?.HapticFeedback?.impactOccurred?.('heavy');

      await spinCarousels(currency, activeSpin);
    } catch (e) {
      console.error('[Cases] Open error:', e);
      showToast('Ошибка открытия кейса');
      tgWeb?.HapticFeedback?.notificationOccurred?.('error');
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

    const MIN_STRIP_LENGTH = 170;
    const TAIL_AFTER_WIN = 32;

    const spinPromises = carousels.map((carousel, index) => {
      return new Promise(async (resolve) => {
        // 1) Выбираем выигрыш
        const winRaw = pickWinningItem(currentCase, !!(spinCtx && spinCtx.demoMode), currency) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
            const winItem = normalizeItemForCurrency(winRaw, currency);
            carousel.winningItem = winItem;


        // 2) Берём текущую ленту как базу (чтобы не было резкого "скачка")
        let strip = (Array.isArray(carousel.items) && carousel.items.length) ? carousel.items.slice() : [];

        if (!strip.length) {
          const idleCount = 70;
          for (let i = 0; i < idleCount; i++) {
            const raw = pickStripItem(currentCase, !!(spinCtx && spinCtx.demoMode)) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
                strip.push(normalizeItemForCurrency(raw, currency));

          }
        }

        // 3) Удлиняем ленту
        while (strip.length < MIN_STRIP_LENGTH) {
          const raw = pickStripItem(currentCase, !!(spinCtx && spinCtx.demoMode)) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
          strip.push(normalizeItemForCurrency(raw, currency));
        }

        // 4) Фиксируем позицию выигрыша ближе к концу
        const winAt = strip.length - TAIL_AFTER_WIN;
        strip[winAt] = winItem;

        // В обычном режиме делаем "безопасную зону" вокруг выигрышной позиции,
        // чтобы из‑за пиксельного сдвига линия не могла случайно попасть на NFT.
        if (!(spinCtx && spinCtx.demoMode) && itemType(winItem) !== 'nft') {
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
            node.dataset.itemId = dataItem.id;
            node.dataset.itemType = itemType(dataItem);
            node.dataset.rarity = dataItem.rarity || "common";

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
            node.dataset.rarity = dataItem.rarity || "common";
            node.innerHTML = `<img src="${itemIconPath(dataItem)}" alt="${dataItem.id}" onerror="this.onerror=null;this.src='${ITEM_ICON_FALLBACK}'">`;
            cont.appendChild(node);
          }
        }

        if (existingNodes.length > needed) {
          for (let i = existingNodes.length - 1; i >= needed; i--) {
            cont.removeChild(existingNodes[i]);
          }
        }

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
            syncWinByLine(carousel, targetPosition, strip, padL, step, lineOffset, itemWidth);

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
    
    // Плавно возвращаем UI - переходим в режим "complete"
    document.body.classList.remove("case-opening-fullscreen");
    document.body.classList.add("case-opening-complete");
    
    // Небольшая задержка для плавной анимации возврата UI
    await delay(400);
    
    await showResult(currency, spinCtx && typeof spinCtx.demoMode === 'boolean' ? spinCtx.demoMode : undefined);
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
    <div class="case-claim-row">
      <button id="caseClaimBtn" class="case-claim-btn" type="button">
        <span class="case-claim-btn__label">Claim</span>
        <span class="case-claim-btn__amount" id="caseClaimAmount">0</span>
        <img class="case-claim-btn__icon" id="caseClaimIcon" src="icons/ton.svg" alt="">
      </button>

      <div id="caseNftActions" class="case-nft-actions-inline" style="display:none" hidden>
        <button id="caseNftClaimBtn" class="case-nft-btn-inline case-nft-btn-inline--primary" type="button">
          <img id="caseNftClaimThumb" class="case-nft-btn-inline__thumb" src="" alt="">
          <span class="case-nft-btn-inline__label">Claim</span>
        </button>

        <button id="caseNftSellBtn" class="case-nft-btn-inline case-nft-btn-inline--secondary" type="button">
          <span>Sell</span>
          <span id="caseNftSellAmount" class="case-nft-btn-inline__amount">0</span>
          <img id="caseNftSellIcon" class="case-nft-btn-inline__icon" src="icons/ton.svg" alt="">
        </button>
      </div>
    </div>

    <div class="case-claim-note" id="caseClaimNote" hidden></div>
  `;

  // Вставим после секции каруселей
  section.insertAdjacentElement('afterend', bar);

  // Bind claim buttons once (event delegation via stable handlers)
  if (!bar.dataset.bound) {
    bar.dataset.bound = '1';
    const giftBtn = bar.querySelector('#caseClaimBtn');
    const nftClaimBtn = bar.querySelector('#caseNftClaimBtn');
    const nftSellBtn  = bar.querySelector('#caseNftSellBtn');
    giftBtn && giftBtn.addEventListener('click', onGiftClaimClick);
    nftClaimBtn && nftClaimBtn.addEventListener('click', onNftClaimClick);
    nftSellBtn && nftSellBtn.addEventListener('click', onNftSellClick);
  }

  return bar;
}

function hideClaimBar() {
  const bar = document.getElementById('caseClaimBar');
  if (!bar) return;

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
async function showResult(currency, demoModeOverride) {
  const tgWeb = window.Telegram?.WebApp;
  const tgUserId = (tgWeb?.initDataUnsafe?.user?.id) ? String(tgWeb.initDataUnsafe.user.id) : "guest";
  const initData = tgWeb?.initData ? tgWeb.initData : "";

  const demoModeForRound = (typeof demoModeOverride === 'boolean') ? demoModeOverride : isDemoMode;
  // Сервер включаем только если не demo и есть реальный userId.
  const serverEnabled = (!demoModeForRound && tgUserId !== 'guest');

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


  const giftsRaw = giftEntries.reduce((sum, e) => sum + itemValue(e.item), 0);
  const giftsAmount = (currency === 'stars')
    ? Math.max(0, Math.round(giftsRaw))
    : Math.max(0, +(+giftsRaw).toFixed(2));

  const icon = currency === 'ton' ? assetUrl('icons/ton.svg') : assetUrl('icons/stars.svg');

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
      claimId: `case_nft_claim_${currentCase?.id || 'case'}_${tgUserId}_${Date.now()}_${Math.random().toString(16).slice(2)}_${idx}`
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

  const items = queue.map(q => q.item);

  if (demoModeForRound) {
    showToast('Demo: NFT не сохраняются');
    return true;
  }

  // Local mode (no server / no Telegram)
  if (!serverEnabled) {
    addToLocalInventory(tgUserId, items);
    try { window.dispatchEvent(new Event('inventory:update')); } catch (_) {}
    showToast(items.length > 1 ? 'NFT сохранены локально ✅' : 'NFT сохранено локально ✅');
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
      claimId
    })
  }, 6500);

  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      showToast('Сессия Telegram устарела. Перезапусти мини‑апп и попробуй ещё раз.');
    } else {
      showToast(r.json?.error || 'Не удалось сохранить NFT. Попробуй ещё раз.');
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

  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
  showToast(items.length > 1 ? 'NFT сохранены ✅' : 'NFT сохранено ✅');

  return true;
};

  return new Promise((resolve) => {
    if (!bar) {
      resetAfter();
      resolve();
      return;
    }

    pendingRound = {
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
      hideClaimBar();
      return;
    }

    bar.hidden = false;

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
    bar.hidden = !(hasGifts || hasNfts);
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

  const bar = document.getElementById('caseClaimBar');
  const btn = bar?.querySelector('#caseClaimBtn');

  setBtnLoading(btn, true);
  try {
    if (pr.demo) {
      showToast('Demo: награда не начисляется');
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
          type: 'case_gift_claim',
          notify: false
        })
      }, 6500);

      if (!r.ok) {
        showToast('Не удалось начислить награду. Попробуй ещё раз.');
        return;
      }
      if (r.json && typeof r.json.newBalance !== 'undefined') {
        setBalanceValue(pr.currency, r.json.newBalance);
      }
    }

    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');

    // подарки забраны -> гасим зелёную линию на тех каруселях, где выпали gifts
    clearGlowForType('gift');

    pr.giftsPending = false;
    pr.giftsAmount = 0;
    renderPendingClaimBar();
    maybeFinishPendingRound();
  } finally {
    setBtnLoading(btn, false);
  }
}

async function onNftClaimClick() {
  const pr = pendingRound;
  if (!pr) return;

  const entry = (pr.nftQueue && pr.nftQueue.length) ? pr.nftQueue[0] : null;
  if (!entry) return;

  const bar = document.getElementById('caseClaimBar');
  const btn = bar?.querySelector('#caseNftClaimBtn');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }

  try {
    const item = entry.item;

    if (pr.demo) {
      showToast('Demo: NFT не сохраняются');
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
          claimId: entry.claimId
        })
      }, 6500);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
        showToast('Сессия Telegram устарела. Перезапусти мини‑апп и попробуй ещё раз.');
      } else {
        showToast(r.json?.error || 'Не удалось сохранить NFT. Попробуй ещё раз.');
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

    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
    if (!pr.demo) showToast('NFT сохранено ✅');

    // Clear glow only for this NFT line
    clearGlowForCarousel(entry.carousel);

    // Advance to next NFT (if any)
    pr.nftQueue.shift();
    pr.nftPending = !!(pr.nftQueue && pr.nftQueue.length);

    renderPendingClaimBar();
    maybeFinishPendingRound();
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}

async function onNftSellClick() {
  const pr = pendingRound;
  if (!pr) return;

  const entry = (pr.nftQueue && pr.nftQueue.length) ? pr.nftQueue[0] : null;
  if (!entry) return;

  const bar = document.getElementById('caseClaimBar');
  const btn = bar?.querySelector('#caseNftSellBtn');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }

  try {
    const amount = entry.amount;

    if (pr.demo) {
      showToast('Demo: продажа отключена');
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
          type: 'case_nft_sell',
          notify: false
        })
      }, 6500);

      if (!r.ok) {
        showToast('Не удалось продать NFT. Попробуй ещё раз.');
        return;
      }
      if (r.json && typeof r.json.newBalance !== 'undefined') {
        setBalanceValue(pr.currency, r.json.newBalance);
      }
    }

    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
    if (!pr.demo) showToast('NFT продано ✅');

    // Clear glow only for this NFT line
    clearGlowForCarousel(entry.carousel);

    // Advance to next NFT
    pr.nftQueue.shift();
    pr.nftPending = !!(pr.nftQueue && pr.nftQueue.length);

    renderPendingClaimBar();
    maybeFinishPendingRound();
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
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
