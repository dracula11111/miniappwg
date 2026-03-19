// public/js/cases.js - Case opening system with realistic spin animation
(() => {
  console.log('[Cases] рџЋЃ Starting cases module');

  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // ====== ASSET URL HELPERS ======
  // Р’Р°Р¶РЅРѕ РґР»СЏ Telegram WebApp Рё Р»СЋР±С‹С… РґРµРїР»РѕРµРІ РІ РїРѕРґРїР°РїРєСѓ: СѓР±РёСЂР°РµРј РІРµРґСѓС‰РёР№ "/" Рё СЃС‚СЂРѕРёРј URL РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ document.baseURI.
  const __ASSET_BASE__ = new URL('.', document.baseURI).toString();
  function assetUrl(p) {
    if (!p) return p;
    const s = String(p);
    // Р°Р±СЃРѕР»СЋС‚РЅС‹Рµ СЃСЃС‹Р»РєРё / data / blob РѕСЃС‚Р°РІР»СЏРµРј РєР°Рє РµСЃС‚СЊ
    if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
    // РµСЃР»Рё РїСѓС‚СЊ РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ "/", РґРµР»Р°РµРј РµРіРѕ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Рј Рє baseURI, Р° РЅРµ Рє РґРѕРјРµРЅРЅРѕРјСѓ РєРѕСЂРЅСЋ
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
  let caseSheetLockedScrollY = 0;
  let caseSheetPrevBodyTop = '';
  let casesPerfResizeRaf = 0;
  let casesPathObserver = null;
  let caseSheetUiMetricsRaf = 0;

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

  function getIdleBaseCount() {
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
  // NFT Р»РµР¶Р°С‚ РІ /images/gifts/nfts/ (РїР°РїРєР° nfts РІРЅСѓС‚СЂРё gifts)
  const base = itemType(item) === 'nft' ? 'images/gifts/nfts/' : 'images/gifts/';
  const icon = (item && item.icon) ? String(item.icon) : 'stars.webp';

  // Р•СЃР»Рё СѓР¶Рµ РґР°Р»Рё Р°Р±СЃРѕР»СЋС‚РЅСѓСЋ СЃСЃС‹Р»РєСѓ вЂ” РЅРµ С‚СЂРѕРіР°РµРј.
  if (/^(https?:)?\/\//i.test(icon) || icon.startsWith('data:') || icon.startsWith('blob:')) return icon;

  // Р•СЃР»Рё РїСЂРёС€С‘Р» Р°Р±СЃРѕР»СЋС‚РЅС‹Р№ РїСѓС‚СЊ РІРёРґР° "/images/..." вЂ” РІСЃС‘ СЂР°РІРЅРѕ РґРµР»Р°РµРј РµРіРѕ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Рј Рє baseURI (Р° РЅРµ Рє РєРѕСЂРЅСЋ РґРѕРјРµРЅР°)
  if (icon.startsWith('/')) return assetUrl(icon);

  return assetUrl(base + icon);
}

// РѕР±С‰РёР№ С„РѕР»Р±СЌРє (РµСЃР»Рё РєР°СЂС‚РёРЅРєР° РЅРµ РЅР°Р№РґРµРЅР°)
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
  // РѕР±РЅРѕРІР»СЏС‚СЊ С‡Р°С‰Рµ СЃРјС‹СЃР»Р° РЅРµС‚, Сѓ РЅР°СЃ СЃРµСЂРІРµСЂ РѕР±РЅРѕРІР»СЏРµС‚ СЂР°Р· РІ С‡Р°СЃ
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
    
    console.log('[Cases] вњ… Loaded floor prices:', {
      count: m.size,
      prices: Array.from(m.entries())
    });
  } catch (e) {
    console.error('[Cases] вќЊ Failed to load floor prices:', e);
  }
}

function getFloorTonForItem(item) {
  const peekName = getPeekNameForItem(item);
  if (!peekName || !peekFloorMap) return null;
  const v = peekFloorMap.get(peekName.toLowerCase());
  return (Number.isFinite(v) && v > 0) ? v : null;
}



// ====== DROP RATES (NFT rarity) ======
// Demo: NFT РІС‹РїР°РґР°РµС‚ С‡Р°СЃС‚Рѕ (РїРѕС‡С‚Рё РєР°Р¶РґС‹Р№ РїСЂРѕРєСЂСѓС‚)
// Paid (TON / Stars): NFT РІС‹РїР°РґР°РµС‚ СЂРµРґРєРѕ
const NFT_DROP_RATES = {
  demo: 0.40,          // 90% РЅР° РІС‹РёРіСЂС‹С€ РІ РґРµРјРѕ
  ton: 0.13,           // 3% РЅР° РІС‹РёРіСЂС‹С€ Р·Р° TON
  stars: 0.12          // 2% РЅР° РІС‹РёРіСЂС‹С€ Р·Р° Stars
};

// Р”Р»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ Р»РµРЅС‚С‹ (РІРёР·СѓР°Р»СЊРЅРѕ): С‡С‚РѕР±С‹ NFT РЅРµ РјРµР»СЊРєР°Р»Рё СЃР»РёС€РєРѕРј С‡Р°СЃС‚Рѕ
const STRIP_NFT_CHANCE = {
  demo: 0.28,          // РІ РґРµРјРѕ РїСѓСЃС‚СЊ РёРЅРѕРіРґР° РјРµР»СЊРєР°СЋС‚
  paid: 0.26           // РІ РѕР±С‹С‡РЅРѕРј СЂРµР¶РёРјРµ СЂРµРґРєРѕ
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

  // Р¤РѕР»Р±СЌРє РЅР° СЂР°РІРЅРѕРјРµСЂРЅС‹Р№ РІС‹Р±РѕСЂ, РµСЃР»Рё РІРµСЃР° РЅРµ Р·Р°РґР°РЅС‹
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

// TON economy profile:
// keep expected return below 1x while still allowing occasional near-breakeven rounds.
const TON_PAYOUT_PROFILE = {
  targetMin: 0.58,          // usual return floor (58% of case price)
  targetMax: 0.90,          // usual return ceiling (90% of case price)
  nearBreakEvenChance: 0.22, // more rounds can land near break-even
  nearBreakEvenMin: 0.97,
  nearBreakEvenMax: 1.05,
  softCap: 1.02,            // allow around-zero outcomes in normal rounds
  hardCap: 1.25,            // soft ceiling in near-break-even rounds
  overshootPenalty: 3.2,
  nftChanceScale: 0.34      // slightly higher jackpot lane for TON paid opens
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

function pickTonBalancedWinningItem(caseData, pools, demoMode) {
  if (demoMode) return null;

  const casePriceTon = Number(caseData?.price?.ton);
  if (!(casePriceTon > 0)) return null;

  // Rare jackpot lane: keep excitement, but with strongly reduced NFT chance.
  if (Array.isArray(pools?.nfts) && pools.nfts.length) {
    const tonedNftChance = Math.max(0.0025, getNftWinChance(false, 'ton') * TON_PAYOUT_PROFILE.nftChanceScale);
    if (Math.random() < tonedNftChance) {
      return pickWeightedNft(pools.nfts) || pickRandom(pools.items);
    }
  }

  const nearBreakEvenRoll = Math.random() < TON_PAYOUT_PROFILE.nearBreakEvenChance;
  const targetRatio = nearBreakEvenRoll
    ? randomInRange(TON_PAYOUT_PROFILE.nearBreakEvenMin, TON_PAYOUT_PROFILE.nearBreakEvenMax)
    : randomInRange(TON_PAYOUT_PROFILE.targetMin, TON_PAYOUT_PROFILE.targetMax);

  const capRatio = nearBreakEvenRoll ? TON_PAYOUT_PROFILE.hardCap : TON_PAYOUT_PROFILE.softCap;
  const targetTon = casePriceTon * targetRatio;
  const capTon = casePriceTon * capRatio;

  const source = (Array.isArray(pools?.items) && pools.items.length) ? pools.items : [];
  const picked = pickByDynamicWeight(source, (item) => {
    const valueTon = prizeValue(item, 'ton');
    if (!(valueTon > 0)) return 0;

    const baseWeight = (itemType(item) === 'nft')
      ? Math.max(0.0001, Number(item?.nftChance) || 0)
      : getGiftWeight(item);

    if (!(baseWeight > 0)) return 0;

    const relativeDelta = Math.abs(valueTon - targetTon) / Math.max(targetTon, 0.01);
    let weight = baseWeight / (1 + relativeDelta * 3.8);

    // Values above the cap are still possible, but become much less likely.
    if (valueTon > capTon) {
      const relativeOvershoot = (valueTon - capTon) / Math.max(capTon, 0.01);
      weight /= (1 + (relativeOvershoot * TON_PAYOUT_PROFILE.overshootPenalty));
    }

    return weight;
  });

  if (picked) return picked;
  return pickWeightedGift(pools?.gifts) || pickRandom(pools?.gifts) || pickRandom(pools?.items);
}

function getNftWinChance(demoMode, currency) {
  if (demoMode) return NFT_DROP_RATES.demo;
  return (currency === 'ton') ? NFT_DROP_RATES.ton : NFT_DROP_RATES.stars;
}

function pickWinningItem(caseData, demoMode, currency) {
  const pools = getCasePools(caseData);
  if (!pools.items.length) return null;

  // TON paid mode: controlled return profile (soft negative EV).
  if (!demoMode && currency === 'ton') {
    const tonBalanced = pickTonBalancedWinningItem(caseData, pools, demoMode);
    if (tonBalanced) return tonBalanced;
  }

  // Р•СЃР»Рё NFT РІ РєРµР№СЃРµ РЅРµС‚ вЂ” РІС‹Р±РёСЂР°РµРј РєР°Рє РѕР±С‹С‡РЅРѕ
  if (!pools.nfts.length) return pickWeightedGift(pools.items) || pickRandom(pools.items);

  const chance = getNftWinChance(demoMode, currency);
  const roll = Math.random();

  if (roll < chance) {
    return pickWeightedNft(pools.nfts) || pickRandom(pools.items);
  }
  // РЅРµ NFT: РІС‹Р±РёСЂР°РµРј РёР· РїРѕРґР°СЂРєРѕРІ
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

  // Р¦РµРЅС‚СЂ Р»РёРЅРёРё РІ РєРѕРѕСЂРґРёРЅР°С‚Р°С… РєРѕРЅС‚РµРЅС‚Р° Р»РµРЅС‚С‹ (itemsContainer)
  const x = (indRect.left + indRect.width / 2) - contRect.left;
  return Number.isFinite(x) ? x : 0;
}

function syncWinByLine(carousel, finalPos, strip, padL, step, lineX, itemWidth) {
  // РіРґРµ Р»РёРЅРёСЏ СѓРєР°Р·С‹РІР°РµС‚ РІ РєРѕРѕСЂРґРёРЅР°С‚Р°С… РєРѕРЅС‚РµРЅС‚Р° Р»РµРЅС‚С‹
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
  // 0..1 -> 0..1 (РїР»Р°РІРЅС‹Р№ СЃС‚Р°СЂС‚ + РїР»Р°РІРЅР°СЏ РѕСЃС‚Р°РЅРѕРІРєР°)
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
      // ====== TON <-> STARS rate (0.4332 TON = 50 в­ђ) ======


// =========================
// TON в†” Stars rate (dynamic)
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
    // в­ђ-РїСЂРёР· -> РєРѕРЅРІРµСЂС‚РёРј РІ TON РїРѕ РєСѓСЂСЃСѓ
    if (isStarsPrizeGift(item)) {
      const s = Number(p.stars);
      return (Number.isFinite(s) && s > 0) ? starsToTon(s) : 0;
    }
    const t = Number(p.ton);
    return (Number.isFinite(t) && t > 0) ? t : 0;
  }

  // currency === 'stars'
  // в­ђ-РїСЂРёР· РѕСЃС‚Р°С‘С‚СЃСЏ РІ Р·РІС‘Р·РґР°С… РєР°Рє РµСЃС‚СЊ
  if (isStarsPrizeGift(item)) {
    const s = Number(p.stars);
    return (Number.isFinite(s) && s > 0) ? s : 0;
  }

  // Р’СЃС‘ РѕСЃС‚Р°Р»СЊРЅРѕРµ: СЃС‡РёС‚Р°РµРј Stars РёР· TON (Р°РєС‚СѓР°Р»СЊРЅС‹Р№ РєСѓСЂСЃ, С‡С‚РѕР±С‹ С†РµРЅС‹ РЅРµ Р±С‹Р»Рё Р·Р°РІС‹С€РµРЅС‹/Р·Р°РЅРёР¶РµРЅС‹)
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

  function getCaseImageFolder(currency) {
    return currency === 'stars' ? 'starcases' : 'toncases';
  }

  function getCaseImagePath(caseId, currency) {
    const rawId = String(caseId || 'case1').toLowerCase();
    const safeId = rawId.replace(/[^a-z0-9_-]/g, '') || 'case1';
    const effectiveId = (currency === 'stars') ? 'case1' : safeId;
    return assetUrl(`images/cases/${getCaseImageFolder(currency)}/${effectiveId}.png`);
  }

  function initHeroTicker() {
    heroTickerEl = document.getElementById('casesHeroTicker');
    if (!heroTickerEl) return;

    // Clear and (re)build
    heroTickerEl.innerHTML = '';
    const list = Object.values(CASES);
    const currency = window.WildTimeCurrency?.current || 'ton';
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
        <div class="cases-history-item" title="${userLabel} вЂў ${itemLabel}">
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
      // fire-and-forget (donвЂ™t block UX)
      fetchJsonSafe('/api/cases/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithInit)
      }, 3500)
        .then((r) => {
          // Telegram initData expires (server verifies age). If we got 401/403 вЂ” retry without initData.
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
    countBtns = Array.from(document.querySelectorAll('.case-count-btn'));

    createDemoToggle();
    attachListeners();
    generateCasesGrid();

    // Р—Р°РіСЂСѓР·РёС‚СЊ floor prices РїСЂРё СЃС‚Р°СЂС‚Рµ
    ensurePeekFloorsLoaded().catch(e => {
      console.warn('[Cases] Failed to load floor prices:', e);
    });

    console.log('[Cases] вњ… Ready');
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
    
    console.log('[Cases] Fix applied вњ…');
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
      if (isSpinning) return; // РЅРµР»СЊР·СЏ РјРµРЅСЏС‚СЊ СЂРµР¶РёРј РІРѕ РІСЂРµРјСЏ РїСЂРѕРєСЂСѓС‚Р°/РєР»РµР№РјР°
      if (isCasesTestMode()) return;
      isDemoMode = !isDemoMode;
      toggle.classList.toggle('active', isDemoMode);
      updateOpenButton();

      safeHaptic('selection');
      console.log('[Cases] Demo mode:', isDemoMode);
    });

    countSection.appendChild(toggle);
    demoToggle = toggle;

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

  function generateCasesGrid() {
    const casesPath = document.getElementById('casesGrid');
    if (!casesPath) return;

    // Change class to cases-path for new styling
    casesPath.className = 'cases-path';
    casesPath.innerHTML = '';

    const casesArray = Object.values(CASES);
    const currency = window.WildTimeCurrency?.current || 'ton';
    const isStarsTheme = currency === 'stars';
    const icon = currency === 'ton' ? assetUrl('icons/tgTonWhite.svg') : assetUrl('icons/stars.svg');

    casesArray.forEach((caseData, index) => {
      const price = caseData.price[currency];
      const priceDisplay = isStarsTheme ? '-' : price;
      
      // Low-motion keeps fewer moving objects to reduce main-thread load.
      const displayItems = caseData.items.slice(0, casesLowMotion ? 2 : 3);

      const pathItem = document.createElement('div');
      pathItem.className = 'case-path-item is-visible';
      pathItem.dataset.caseId = caseData.id;
      pathItem.dataset.variant = String((index % 3) + 1);

      if (isStarsTheme) {
        pathItem.classList.add('case-path-item--stars');
        pathItem.innerHTML = `
          <div class="case-path-case">
            <div class="case-path-image-wrapper">
              <img src="${getCaseImagePath(caseData.id, currency)}"
                   alt="${caseData.name}"
                   loading="lazy"
                   decoding="async"
                   class="case-path-image">
            </div>
            <div class="case-path-price case-path-price--stub">
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
              <img src="${getCaseImagePath(caseData.id, currency)}" 
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

      pathItem.addEventListener('click', () => openBottomSheet(caseData.id));
      casesPath.appendChild(pathItem);
    });

    if (isStarsTheme) appendStarsFireflies(casesPath);

    setupCasesPathAnimationVisibility(casesPath);
  }


  // ====== OPEN BOTTOM SHEET ======
  function updateCaseSheetUiMetrics() {
    if (!document.body.classList.contains('case-sheet-open')) return;

    const root = document.documentElement;
    const appEl = document.querySelector('.app');
    const topbarEl = document.querySelector('.topbar');
    const logoEl = document.querySelector('.logo-header');

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

    let maxBottom = 0;
    if (topbarEl) {
      const r = topbarEl.getBoundingClientRect();
      if (Number.isFinite(r.bottom)) maxBottom = Math.max(maxBottom, r.bottom);
    }
    if (logoEl) {
      const r = logoEl.getBoundingClientRect();
      if (Number.isFinite(r.bottom)) maxBottom = Math.max(maxBottom, r.bottom);
    }

    const reserveTop = Math.max(96, Math.ceil(maxBottom + 10));
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
    root.style.removeProperty('--case-sheet-top-offset');
  }

  function lockCaseSheetScreen() {
    if (document.body.classList.contains('case-sheet-open')) return;

    caseSheetLockedScrollY = window.scrollY || window.pageYOffset || 0;
    caseSheetPrevBodyTop = document.body.style.top || '';

    document.documentElement.classList.add('case-sheet-open');
    document.body.classList.add('case-sheet-open');
    document.body.style.top = `-${caseSheetLockedScrollY}px`;

    scheduleCaseSheetUiMetricsUpdate();
    setTimeout(() => scheduleCaseSheetUiMetricsUpdate(), 80);
    setTimeout(() => scheduleCaseSheetUiMetricsUpdate(), 180);
  }

  function unlockCaseSheetScreen() {
    if (!document.body.classList.contains('case-sheet-open')) return;

    const restoreY = caseSheetLockedScrollY || 0;

    document.documentElement.classList.remove('case-sheet-open');
    document.body.classList.remove('case-sheet-open');
    document.body.style.top = caseSheetPrevBodyTop || '';

    if (caseSheetUiMetricsRaf) {
      cancelAnimationFrame(caseSheetUiMetricsRaf);
      caseSheetUiMetricsRaf = 0;
    }
    clearCaseSheetUiMetrics();

    caseSheetPrevBodyTop = '';
    caseSheetLockedScrollY = 0;

    window.scrollTo(0, restoreY);
  }

  function openBottomSheet(caseId) {
    if (isAnimating || document.body.classList.contains('case-sheet-open')) return;

    currentCase = CASES[caseId];
    if (!currentCase) return;

    console.log('[Cases] рџЋЃ Opening:', currentCase.name);

    isAnimating = true;
    selectedCount = 1;

    lockCaseSheetScreen();

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
  function closeBottomSheet() {
    if (isAnimating || isSpinning) return;

    isAnimating = true;
    stopAllAnimations();

    if (sheetPanel) sheetPanel.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    unlockCaseSheetScreen();

    safeHaptic('impact', 'light');

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
    if (priceEl) priceEl.textContent = (currency === 'stars') ? '-' : price;
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
}
  
    renderCarousels(selectedCount, currency);


    
    // РїРѕРґС‚СЏРЅРµРј floors Рё РїРµСЂРµСЂРёСЃСѓРµРј contents
        ensurePeekFloorsLoaded().then(() => {
          if (!currentCase) return;
          const cur = window.WildTimeCurrency?.current || 'ton';
          renderContents(cur);
        });

    
    updateOpenButton();
  
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

    const priceEl = document.getElementById('casePrice');
    if (priceEl) {
      if (currency === 'stars') {
        priceEl.textContent = '-';
      } else {
        priceEl.textContent = demoActive ? 'FREE' : totalPrice.toFixed(currency === 'ton' ? 2 : 0);
      }
    }

    openBtn.classList.toggle('demo-mode', demoActive);
  }

  function getCaseCurrencyIcon(currency) {
    return currency === 'stars' ? assetUrl('icons/stars.svg') : assetUrl('icons/ton.svg');
  }

  function getCarouselValuePillData(item, currency) {
    if (!item || itemType(item) === 'nft') return null;
    const amount = prizeValue(item, currency);
    if (!(Number.isFinite(amount) && amount > 0)) return null;
    return {
      amount: formatAmount(currency, amount),
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

    mainImg.onerror = null;
    mainImg.src = itemIconPath(dataItem);
    mainImg.alt = id;
    mainImg.onerror = function () { this.onerror = null; this.src = ITEM_ICON_FALLBACK; };

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
    if (height <= 72) container.classList.add('case-carousel--compact');
    container.style.height = `${height}px`;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'case-carousel-items';

    // Р‘Р°Р·Р° (РЅРµ РјРµРЅСЏРµС‚СЃСЏ СЃР°РјР° РїРѕ СЃРµР±Рµ) вЂ” С‡С‚РѕР±С‹ РЅРµ Р±С‹Р»Рѕ РѕС‰СѓС‰РµРЅРёСЏ, С‡С‚Рѕ "Р»РёРЅРёСЏ" СЂРµР·РєРѕ СЃС‚Р°Р»Р° РґСЂСѓРіРѕР№
    const IDLE_BASE_COUNT = getIdleBaseCount();
    const baseItems = [];
    for (let i = 0; i < IDLE_BASE_COUNT; i++) {
      const raw = pickStripItem(currentCase, !!isDemoMode) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
      baseItems.push(normalizeItemForCurrency(raw, currency));
    }

    // Р”РµР»Р°РµРј 2 РєРѕРїРёРё, С‡С‚РѕР±С‹ Р»РµРЅС‚Р° СЂРµР°Р»СЊРЅРѕ Р±С‹Р»Р° Р±РµСЃРєРѕРЅРµС‡РЅРѕР№
    const items = baseItems.concat(baseItems);

    itemsContainer.innerHTML = items.map(item => createCarouselItemMarkup(item, currency)).join('');

    container.appendChild(itemsContainer);

    const indicator = document.createElement('div');
    indicator.className = 'case-carousel-indicator';
    container.appendChild(indicator);

    return {
      element: container,
      itemsContainer,
      baseItems,
      items, // РІСЃРµРіРґР° Р°РєС‚СѓР°Р»СЊРЅР°СЏ "Р»РµРЅС‚Р°" (РІ Р°Р№РґР»Рµ = baseItems*2, РІРѕ РІСЂРµРјСЏ СЃРїРёРЅР° = СѓРґР»РёРЅС‘РЅРЅР°СЏ)
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
    const currency = window.WildTimeCurrency?.current || 'ton';
    itemsContainer.innerHTML = items.map(it => createCarouselItemMarkup(it, currency)).join('');
  }

  function resetCarouselToIdleFromCurrent(carousel) {
    const metrics = getCarouselMetrics(carousel);
    const strip = Array.isArray(carousel.items) && carousel.items.length ? carousel.items : [];

    // Р•СЃР»Рё РїРѕ РєР°РєРѕР№-С‚Рѕ РїСЂРёС‡РёРЅРµ Р»РµРЅС‚С‹ РЅРµС‚ вЂ” РїСЂРѕСЃС‚Рѕ РїРµСЂРµСЃРѕР·РґР°РґРёРј Р±Р°Р·Сѓ
    const IDLE_BASE_COUNT = getIdleBaseCount();
    const safePool = currentCase?.items || [];

    const cont = carousel.itemsContainer;
    if (!cont || !safePool.length) return;

    // fallback: РµСЃР»Рё СЂР°Р·РјРµСЂС‹ РµС‰С‘ РЅРµ РіРѕС‚РѕРІС‹
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

    // Р‘РµСЂС‘Рј "РѕРєРЅРѕ" РёР· С‚РµРєСѓС‰РµР№ Р»РµРЅС‚С‹ СЃ С‚РѕРіРѕ РјРµСЃС‚Р°, РіРґРµ РѕРЅР° РѕСЃС‚Р°РЅРѕРІРёР»Р°СЃСЊ,
    // С‡С‚РѕР±С‹ РІРёР·СѓР°Р»СЊРЅРѕ РќР• Р±С‹Р»Рѕ СЂРµР·РєРѕР№ СЃРјРµРЅС‹ РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅРѕСЃС‚Рё.
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

    // "РїРµСЂРµР±Р°Р·РёСЂСѓРµРј" position, С‡С‚РѕР±С‹ С‚РµРєСѓС‰РёР№ РєР°РґСЂ СЃРѕРІРїР°Р»
    let newPos = carousel.position - startIndex * metrics.step;

    // РЅРѕСЂРјР°Р»РёР·СѓРµРј РІ РґРёР°РїР°Р·РѕРЅ РѕРґРЅРѕР№ РїРµС‚Р»Рё
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
    // Р±С‹Р»Рѕ ~0.5вЂ“1 px/frame (~30вЂ“60 px/s РЅР° 60fps)
    // РґРµР»Р°РµРј СЃСЂР°Р·Сѓ px/СЃРµРє вЂ” С‚Р°Рє РЅРµ РґРµСЂРіР°РµС‚СЃСЏ РїСЂРё РїСЂРѕСЃР°РґРєР°С… FPS
    carousel.velocity = casesLowMotion
      ? (20 + Math.random() * 14)   // 20вЂ“34 px/s
      : (32 + Math.random() * 32);  // 32вЂ“64 px/s
    carousel.position = carousel.position || 0;

    // РґР»СЏ РїР»Р°РІРЅРѕСЃС‚Рё РЅР° GPU
    if (carousel.itemsContainer) {
      carousel.itemsContainer.style.willChange = 'transform';
    }

    let lastTime = 0;

    const animate = (t) => {
      // РµСЃР»Рё РєР°СЂСѓСЃРµР»СЊ СЃРєСЂС‹Р»Рё/СѓРґР°Р»РёР»Рё вЂ” РїСЂРµРєСЂР°С‰Р°РµРј
      if (!carousel.element.classList.contains('active')) return;

      if (!lastTime) lastTime = t;

      // dt РІ СЃРµРєСѓРЅРґР°С…, clamp С‡С‚РѕР±С‹ РїРѕСЃР»Рµ СЃРІРѕСЂР°С‡РёРІР°РЅРёСЏ РІРєР»Р°РґРєРё РЅРµ РїСЂС‹РіР°Р»Рѕ
      const dt = Math.min(0.05, (t - lastTime) / 1000);
      lastTime = t;

      // РІРѕ РІСЂРµРјСЏ СЃРїРёРЅР° Р°Р№РґР» РЅРµ РґРІРёРіР°РµРј, РЅРѕ RAF РѕСЃС‚Р°РІР»СЏРµРј Р¶РёРІС‹Рј
      if (!isSpinning) {
        const metrics = getCarouselMetrics(carousel);

        // С€Р°Рі РЅР° СЌС‚РѕРј РєР°РґСЂРµ
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
      
      // Р”Р»СЏ NFT: РїРѕРєР°Р·С‹РІР°РµРј floor price РµСЃР»Рё РµСЃС‚СЊ, РёРЅР°С‡Рµ fallback
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

  // 2 РєР°РґСЂР° вЂ” С‡С‚РѕР±С‹ Р±СЂР°СѓР·РµСЂ С‚РѕС‡РЅРѕ РїСЂРёРјРµРЅРёР» РєР»Р°СЃСЃС‹/СЂР°Р·РјРµС‚РєСѓ
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // РµСЃР»Рё С€СЂРёС„С‚ РіСЂСѓР·РёС‚СЃСЏ вЂ” РґРѕР¶РґС‘РјСЃСЏ (РёРЅРѕРіРґР° РІР»РёСЏРµС‚ РЅР° РІС‹СЃРѕС‚С‹/Р»РµР№Р°СѓС‚)
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch (e) {}
  }

  while (performance.now() - start < timeoutMs) {
    const sig = carousels.map(c => {
      try {
        if (!c?.element || !c?.itemsContainer) return 'x';
        const m = getCarouselMetrics(c);
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
  return false; // РµСЃР»Рё РЅРµ СѓСЃРїРµР»Рё вЂ” РІСЃС‘ СЂР°РІРЅРѕ РїСЂРѕРґРѕР»Р¶РёРј
}

  // Р¤СѓРЅРєС†РёСЏ РґР»СЏ Р±Р»РѕРєРёСЂРѕРІРєРё РїСЂРѕРєСЂСѓС‚РєРё РІ fullscreen СЂРµР¶РёРјРµ
  function scrollCarouselToCenter() {
    // Р’ fullscreen СЂРµР¶РёРјРµ РєР°СЂСѓСЃРµР»СЊ РїРѕР·РёС†РёРѕРЅРёСЂСѓРµС‚СЃСЏ С‡РµСЂРµР· CSS (position: fixed, top: 50%)
    // РџСЂРѕСЃС‚Рѕ Р±Р»РѕРєРёСЂСѓРµРј РїСЂРѕРєСЂСѓС‚РєСѓ body, РЅРѕ РЅРµ С‚СЂРѕРіР°РµРј РїР°РЅРµР»СЊ
    requestAnimationFrame(() => {
      // РЎРѕС…СЂР°РЅСЏРµРј С‚РµРєСѓС‰СѓСЋ РїРѕР·РёС†РёСЋ РїСЂРѕРєСЂСѓС‚РєРё РїР°РЅРµР»Рё
      const panel = document.querySelector('.case-sheet-panel');
      if (panel) {
        // Р—Р°РїРѕРјРёРЅР°РµРј РїРѕР·РёС†РёСЋ РґР»СЏ РІРѕР·РјРѕР¶РЅРѕРіРѕ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ
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
    // Р’Р°Р¶РЅРѕ: С€Р°РЅСЃ РІС‹РїР°РґРµРЅРёСЏ NFT Р·Р°РІРёСЃРёС‚ РўРћР›Р¬РљРћ РѕС‚ Demo-С‚СѓРјР±Р»РµСЂР°.
    // initData РјРѕР¶РµС‚ РѕС‚СЃСѓС‚СЃС‚РІРѕРІР°С‚СЊ (РЅР°РїСЂРёРјРµСЂ, РЅР° РґРµСЃРєС‚РѕРїРµ), РЅРѕ СЌС‚Рѕ РЅРµ РґРѕР»Р¶РЅРѕ РїСЂРµРІСЂР°С‰Р°С‚СЊ СЂРµР¶РёРј РІ Demo.
    const effectiveDemo = demoModeAtStart;
    // РЎРµСЂРІРµСЂРЅС‹Рµ СЃРїРёСЃР°РЅРёСЏ/РЅР°С‡РёСЃР»РµРЅРёСЏ РґРµР»Р°РµРј С‚РѕР»СЊРєРѕ РµСЃР»Рё СЌС‚Рѕ РЅРµ demo, РµСЃС‚СЊ userId Рё РІР°Р»РёРґРЅС‹Р№ initData.
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
          showToast(`Insufficient ${currency.toUpperCase()} balance`);
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
            type: 'case_open',
            notify: false
          })
        }, 6500);

        if (!r.ok) {
          const canFallbackToLocal =
            r.status === 0 ||
            r.status === 401 ||
            r.status === 403 ||
            r.status === 503;

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
              showToast('Сессия Telegram устарела. Продолжаем в локальном режиме.');
            } else {
              showToast('Сервер недоступен. Продолжаем в локальном режиме.');
            }
          } else {
            showToast('Не удалось списать стоимость кейса. Попробуй еще раз.');
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
        // Demo: OPEN is FREE (РЅРµ СЃРїРёСЃС‹РІР°РµРј Р±Р°Р»Р°РЅСЃ)
        // Guest (Р±РµР· СЃРµСЂРІРµСЂР°) РІ РѕР±С‹С‡РЅРѕРј СЂРµР¶РёРјРµ: СЃРїРёСЃС‹РІР°РµРј Р»РѕРєР°Р»СЊРЅРѕ, С‡С‚РѕР±С‹ РЅРµ Р±С‹Р»Рѕ Р±РµСЃРїР»Р°С‚РЅРѕРіРѕ С„Р°СЂРјР°
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



      console.log('[Cases] рџЋ° Opening case:', { demo: effectiveDemo, serverEnabled, count: countAtStart, currency });
      
      // 2) РђРєС‚РёРІРёСЂСѓРµРј fullscreen СЂРµР¶РёРј
      openStep = 'fullscreen';
      document.body.classList.add("case-opening-fullscreen");
      document.body.setAttribute("data-opening-case", currentCase.id);
      
      // Р¦РµРЅС‚СЂРёСЂСѓРµРј РєР°СЂСѓСЃРµР»СЊ Рё СЃР±СЂР°СЃС‹РІР°РµРј РїСЂРѕРєСЂСѓС‚РєСѓ
      scrollCarouselToCenter();
      
      // РќРµР±РѕР»СЊС€Р°СЏ Р·Р°РґРµСЂР¶РєР° РґР»СЏ РїР»Р°РІРЅРѕРіРѕ РїРµСЂРµС…РѕРґР° UI
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
        showToast(`Ошибка открытия кейса (${openStep})`);
      } else {
        showToast('Ошибка открытия кейса');
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

  // ====== SPIN CAROUSELS (РїР»Р°РІРЅС‹Р№ СЃРїРёРЅ, С‚РѕС‡РЅР°СЏ РѕСЃС‚Р°РЅРѕРІРєР° РїРѕ Р»РёРЅРёРё) ======
  async function spinCarousels(currency, spinCtx) {
    stopAllAnimations();
    setWinningGiftPillsVisible(false);

    const MIN_STRIP_LENGTH = casesLowMotion ? 128 : 170;
    const TAIL_AFTER_WIN = casesLowMotion ? 24 : 32;

    const spinPromises = carousels.map((carousel, index) => {
      return new Promise(async (resolve) => {
        try {
        // 1) Р’С‹Р±РёСЂР°РµРј РІС‹РёРіСЂС‹С€
        const winRaw = pickWinningItem(currentCase, !!(spinCtx && spinCtx.demoMode), currency) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
            const winItem = normalizeItemForCurrency(winRaw, currency);
            carousel.winningItem = winItem;


        // 2) Р‘РµСЂС‘Рј С‚РµРєСѓС‰СѓСЋ Р»РµРЅС‚Сѓ РєР°Рє Р±Р°Р·Сѓ (С‡С‚РѕР±С‹ РЅРµ Р±С‹Р»Рѕ СЂРµР·РєРѕРіРѕ "СЃРєР°С‡РєР°")
        let strip = (Array.isArray(carousel.items) && carousel.items.length) ? carousel.items.slice() : [];

        if (!strip.length) {
          const idleCount = getIdleBaseCount();
          for (let i = 0; i < idleCount; i++) {
            const raw = pickStripItem(currentCase, !!(spinCtx && spinCtx.demoMode)) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
                strip.push(normalizeItemForCurrency(raw, currency));

          }
        }

        // 3) РЈРґР»РёРЅСЏРµРј Р»РµРЅС‚Сѓ
        while (strip.length < MIN_STRIP_LENGTH) {
          const raw = pickStripItem(currentCase, !!(spinCtx && spinCtx.demoMode)) || currentCase.items[Math.floor(Math.random() * currentCase.items.length)];
          strip.push(normalizeItemForCurrency(raw, currency));
        }

        // 4) Р¤РёРєСЃРёСЂСѓРµРј РїРѕР·РёС†РёСЋ РІС‹РёРіСЂС‹С€Р° Р±Р»РёР¶Рµ Рє РєРѕРЅС†Сѓ
        const winAt = strip.length - TAIL_AFTER_WIN;
        strip[winAt] = winItem;

        // Р’ РѕР±С‹С‡РЅРѕРј СЂРµР¶РёРјРµ РґРµР»Р°РµРј "Р±РµР·РѕРїР°СЃРЅСѓСЋ Р·РѕРЅСѓ" РІРѕРєСЂСѓРі РІС‹РёРіСЂС‹С€РЅРѕР№ РїРѕР·РёС†РёРё,
        // С‡С‚РѕР±С‹ РёР·вЂ‘Р·Р° РїРёРєСЃРµР»СЊРЅРѕРіРѕ СЃРґРІРёРіР° Р»РёРЅРёСЏ РЅРµ РјРѕРіР»Р° СЃР»СѓС‡Р°Р№РЅРѕ РїРѕРїР°СЃС‚СЊ РЅР° NFT.
        if (!(spinCtx && spinCtx.demoMode) && itemType(winItem) !== 'nft') {
          const poolsSafe = getCasePools(currentCase);
          const giftsPool = (poolsSafe && poolsSafe.gifts && poolsSafe.gifts.length) ? poolsSafe.gifts : null;
          if (giftsPool) {
            const safeRadius = 5; // +-5 СЃР»РѕС‚РѕРІ РІРѕРєСЂСѓРі РІС‹РёРіСЂС‹С€Р°
            for (let k = -safeRadius; k <= safeRadius; k++) {
              const ii = winAt + k;
              if (ii < 0 || ii >= strip.length) continue;
              strip[ii] = normalizeItemForCurrency(pickRandom(giftsPool) || strip[ii], currency);

            }
            // РіР°СЂР°РЅС‚РёСЂСѓРµРј СЃР°Рј РІС‹РёРіСЂС‹С€
            strip[winAt] = winItem;
          }
        }

        carousel.items = strip;
        carousel.winningStripIndex = winAt;

        const cont = carousel.itemsContainer;
        if (!cont) { resolve(); return; }

        // 5) РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј DOM СЃ strip (РЅРµ С‚СЂРѕРіР°РµРј transform)
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

        // 5.5) РќР°РґС‘Р¶РЅС‹Р№ Р·Р°РјРµСЂ СЂР°Р·РјРµСЂРѕРІ (РёРЅРѕРіРґР° РІ РјРѕРјРµРЅС‚ РїРµСЂРµРєР»СЋС‡РµРЅРёСЏ fullscreen Р±СЂР°СѓР·РµСЂ РјРѕР¶РµС‚ РІРµСЂРЅСѓС‚СЊ 0)
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


        // 6) РЎС‚Р°СЂС‚РѕРІР°СЏ РїРѕР·РёС†РёСЏ вЂ” С‚РµРєСѓС‰Р°СЏ
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

        // 7) Р›РёРЅРёСЏ (С†РµРЅС‚СЂ) РІ РєРѕРѕСЂРґРёРЅР°С‚Р°С… itemsContainer
        const lineX = getLineXInItems(carousel);

        // рџ”Ґ FIX: lineX Р·Р°РІРёСЃРёС‚ РѕС‚ С‚РµРєСѓС‰РµР№ РїРѕР·РёС†РёРё Р»РµРЅС‚С‹ (contRect СЃРґРІРёРіР°РµС‚СЃСЏ РїСЂРё translateX).
        // Р’С‹С‡РёС‚Р°РµРј startPosition, С‡С‚РѕР±С‹ РїРѕР»СѓС‡РёС‚СЊ РљРћРќРЎРўРђРќРўРЈ вЂ” СЃРјРµС‰РµРЅРёРµ РёРЅРґРёРєР°С‚РѕСЂР°
        // РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РЅР°С‡Р°Р»Р° РєРѕРЅС‚РµРЅС‚Р° РїСЂРё position=0.
        const lineOffset = lineX - startPosition;

        // 8) РўРѕС‡РєР° РІРЅСѓС‚СЂРё РІС‹РёРіСЂС‹С€РЅРѕРіРѕ Р°Р№С‚РµРјР° (С‡С‚РѕР±С‹ РЅРµ РїРѕРїР°РґР°С‚СЊ СЃС‚СЂРѕРіРѕ РІ РєСЂР°Р№)
        const innerMargin = Math.max(0, Math.min(18, itemWidth * 0.18));
        const span = Math.max(0, itemWidth - innerMargin * 2);
        const randomPoint = innerMargin + Math.random() * span;

        // 9) Р¦РµР»РµРІР°СЏ РїРѕР·РёС†РёСЏ: РїРѕРґ Р»РёРЅРёСЋ РїРѕРїР°РґР°РµС‚ randomPoint Сѓ winAt
        let targetPosition = padL + winAt * step + randomPoint - lineOffset;

        const maxTarget = padL + (strip.length - 1) * step + (itemWidth - 1) - lineOffset;
        targetPosition = Math.max(0, Math.min(targetPosition, maxTarget));

        // 10) РњРёРЅРёРјР°Р»СЊРЅР°СЏ "РґРёСЃС‚Р°РЅС†РёСЏ", С‡С‚РѕР±С‹ РЅРµ Р±С‹Р»Рѕ РѕС‰СѓС‰РµРЅРёСЏ РјРёРєСЂРѕ-РґРµСЂРіР°
        const minTravel = step * 20;
        if (targetPosition - startPosition < minTravel) {
          targetPosition = Math.min(maxTarget, startPosition + minTravel);
        }

        const totalDistance = targetPosition - startPosition;

        // 11) РџР»Р°РІРЅР°СЏ Р°РЅРёРјР°С†РёСЏ
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

          // С‚Р°РєС‚РёР»РєР° РЅРµ С‡Р°С‰Рµ, С‡РµРј СЂР°Р· РІ 140РјСЃ
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

            // Р’РђР–РќРћ: С„РёРЅР°Р»СЊРЅС‹Р№ РІС‹РёРіСЂС‹С€ = С‚Рѕ, С‡С‚Рѕ СЂРµР°Р»СЊРЅРѕ РїРѕРґ Р»РёРЅРёРµР№
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

    // РґР»СЏ CSS: Р·Р°С‚РµРјРЅРёС‚СЊ РѕСЃС‚Р°Р»СЊРЅС‹Рµ
    carousels.forEach(c => {
      try { c?.element?.classList?.add('cases-finished'); } catch (_) {}
    });

    await delay(250);
    
    // РџР»Р°РІРЅРѕ РІРѕР·РІСЂР°С‰Р°РµРј UI - РїРµСЂРµС…РѕРґРёРј РІ СЂРµР¶РёРј "complete"
    document.body.classList.remove("case-opening-fullscreen");
    document.body.classList.add("case-opening-complete");
    
    // РќРµР±РѕР»СЊС€Р°СЏ Р·Р°РґРµСЂР¶РєР° РґР»СЏ РїР»Р°РІРЅРѕР№ Р°РЅРёРјР°С†РёРё РІРѕР·РІСЂР°С‚Р° UI
    await delay(400);
    
    try {
      await showResult(
        currency,
        spinCtx && typeof spinCtx.demoMode === 'boolean' ? spinCtx.demoMode : undefined,
        spinCtx && typeof spinCtx.serverEnabled === 'boolean' ? spinCtx.serverEnabled : undefined
      );
    } catch (showResultError) {
      console.error('[Cases] showResult error:', showResultError);
      showToast('Не удалось отобразить результат. Попробуй еще раз.');
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
    // Р›РёРЅРёСЏ вЂ” Р·РµР»С‘РЅС‹Р№ РёРјРїСѓР»СЊСЃ + С„РёРєСЃРёСЂСѓРµРј Р·РµР»С‘РЅС‹Р№ РґРѕ РєР»РµР№РјР°
    const indicator = carousel.element.querySelector('.case-carousel-indicator');
    if (indicator) {
      // РґРµСЂР¶РёРј Р·РµР»С‘РЅС‹Рј, РїРѕРєР° СЋР·РµСЂ РЅРµ Р·Р°Р±РµСЂС‘С‚ РЅР°РіСЂР°РґСѓ (claim/sell)
      indicator.classList.add('won');
      // РєРѕСЂРѕС‚РєРёР№ РёРјРїСѓР»СЊСЃ (С‡С‚РѕР±С‹ Р±С‹Р»Рѕ РїРѕРЅСЏС‚РЅРѕ С‡С‚Рѕ РІС‹РїР°Р»Рѕ) вЂ” РїРѕС‚РѕРј СѓР±РёСЂР°РµРј, РѕСЃС‚Р°РІР»СЏСЏ won
      indicator.classList.add('winning');
      setTimeout(() => indicator.classList.remove('winning'), 650);
    }

    // РЈР±РёСЂР°РµРј СЃС‚Р°СЂСѓСЋ РїРѕРґСЃРІРµС‚РєСѓ РїСЂРµРґРјРµС‚Р°
    const prev = carousel.itemsContainer.querySelector('.case-carousel-item.winning');
    if (prev) prev.classList.remove('winning');

    // Р‘РµСЂС‘Рј С‚РѕС‚ РёРЅРґРµРєСЃ, РєСѓРґР° РњР« РїРѕР»РѕР¶РёР»Рё РІС‹РёРіСЂС‹С€РЅС‹Р№ РїСЂРµРґРјРµС‚
    const winIndex = carousel.winningStripIndex;
    const winEl = (carousel.itemsContainer && carousel.itemsContainer.children) ? carousel.itemsContainer.children[winIndex] : null;

    if (winEl) {
      winEl.classList.add('winning');
      // РєР»Р°СЃСЃ winning РЅРµ СЃРЅРёРјР°РµРј вЂ” РїСЂРё СЂРµСЃРµС‚Рµ РєР°СЂСѓСЃРµР»СЊ РїРѕР»РЅРѕСЃС‚СЊСЋ РїРµСЂРµСЂРёСЃРѕРІС‹РІР°РµС‚СЃСЏ
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
  let bar = document.getElementById('caseClaimBar');
  if (bar) {
    bindClaimBarHandlers(bar);
    return bar;
  }

  // Р’СЃС‚Р°РІР»СЏРµРј СЃСЂР°Р·Сѓ РїРѕРґ Р±Р»РѕРєРѕРј РєР°СЂСѓСЃРµР»РµР№
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

  // Р’СЃС‚Р°РІРёРј РїРѕСЃР»Рµ СЃРµРєС†РёРё РєР°СЂСѓСЃРµР»РµР№
  section.insertAdjacentElement('afterend', bar);

  bindClaimBarHandlers(bar);

  return bar;
}

function hideClaimBar() {
  const bar = document.getElementById('caseClaimBar');
  if (!bar) return;

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
  // РЎРµСЂРІРµСЂ РІРєР»СЋС‡Р°РµРј С‚РѕР»СЊРєРѕ РµСЃР»Рё РЅРµ demo, РµСЃС‚СЊ userId Рё РІР°Р»РёРґРЅС‹Р№ initData.
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


  const giftsRaw = giftEntries.reduce((sum, e) => sum + itemValue(e.item), 0);
  const giftsAmount = (currency === 'stars')
    ? Math.max(0, Math.round(giftsRaw))
    : Math.max(0, +(+giftsRaw).toFixed(2));

  const icon = currency === 'ton' ? assetUrl('icons/ton.svg') : assetUrl('icons/stars.svg');

  // Use one roundId for the whole open -> claim flow
  const roundId = activeSpin?.roundId || `case_${tgUserId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
 // С‡С‚РѕР±С‹ getFloorTonForItem() СѓР¶Рµ Р·РЅР°Р» С†РµРЅС‹
  try { await ensurePeekFloorsLoaded(); } catch (_) {}

  // Build NFT queue (we will CLAIM ALL from overlay at once)
  const nftQueue = nftEntries.map((e, idx) => {
    const floorTon = getFloorTonForItem(e.item);
    const tonVal = (floorTon != null) ? Number(floorTon) : Number(e.item?.price?.ton || 0);
  
    const fixedTon = (Number.isFinite(tonVal) && tonVal > 0) ? Math.round(tonVal * 100) / 100 : 0;
    const starsVal = (fixedTon > 0) ? tonToStars(fixedTon) : 0;
  
    // Р’РђР–РќРћ: СЃРѕС…СЂР°РЅСЏРµРј С†РµРЅСѓ РІ item.price => РїРѕРїР°РґС‘С‚ РІ Inventory
    const item = {
      ...e.item,
      price: {
        ...(e.item?.price || {}),
        ton: fixedTon,
        stars: starsVal
      }
    };
  
    // amount -> СЌС‚Рѕ С‚Рѕ, С‡С‚Рѕ СѓРІРёРґРёС‚ Winning Screen (nft-win-screen.js Р±РµСЂРµС‚ nft.amount) :contentReference[oaicite:3]{index=3}
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
    
    // Р”РѕР±Р°РІР»СЏРµРј РєР»Р°СЃСЃ finished РґР»СЏ СѓР±РёСЂР°РЅРёСЏ РѕРІРµСЂР»РµСЏ
    document.body.classList.add("case-opening-finished");
    
    // Р§РµСЂРµР· Р·Р°РґРµСЂР¶РєСѓ СѓР±РёСЂР°РµРј РІСЃРµ РєР»Р°СЃСЃС‹
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
    showToast(items.length > 1 ? 'NFT сохранены локально' : 'NFT сохранено локально');
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
      showToast('Сессия Telegram устарела. Перезапусти мини-апп и попробуй еще раз.');
    } else {
      showToast(r.json?.error || 'Не удалось сохранить NFT. Попробуй еще раз.');
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
  showToast(items.length > 1 ? 'NFT сохранены' : 'NFT сохранено');

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
          // Р’ РїСЂРёРјРµСЂРµ С‡Р°СЃС‚Рѕ РїРѕРєР°Р·С‹РІР°СЋС‚ value РїРѕРґ Р·Р°РіРѕР»РѕРІРєРѕРј вЂ” РІРєР»СЋС‡Р°РµРј, РєРѕРіРґР° РІС‹РїР°Р»Рѕ >= 1 NFT
          showTotal: true,
          total,
          
          onPrimary: async () => {
            // Claim/Continue pressed
            if (!pr.demo) {
              const ok = await claimAllNfts(pr.nftQueue);
              if (!ok) return false; // keep overlay open
            } else {
              // demo: just close + clear UI highlight
              // (toast inside claimAllNfts not РЅСѓР¶РµРЅ, С‡С‚РѕР±С‹ РЅРµ СЃРїР°РјРёС‚СЊ)
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
    // Р•СЃР»Рё РІС‹РїР°Р»Рё РўРћР›Р¬РљРћ NFT (Рё РЅРµС‚ РІР°Р»СЋС‚С‹) вЂ” Р»РµРІСѓСЋ РєРЅРѕРїРєСѓ СЃРєСЂС‹РІР°РµРј РїРѕР»РЅРѕСЃС‚СЊСЋ.
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

    // NFT actions (right block) вЂ” РїРѕРєР°Р·С‹РІР°РµРј С‚РѕР»СЊРєРѕ РєРѕРіРґР° СЂРµР°Р»СЊРЅРѕ РІС‹РїР°Р»Рѕ NFT
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

    // РЎРєСЂС‹РІР°РµРј РїР°РЅРµР»СЊ С‚РѕР»СЊРєРѕ РµСЃР»Рё РЅРµС‡РµРіРѕ РєР»РµР№РјРёС‚СЊ/РїСЂРѕРґР°РІР°С‚СЊ
    const shouldShowBar = !!(hasGifts || hasNfts);
    setWinningGiftPillsVisible(shouldShowBar && hasGifts);

    if (!shouldShowBar) {
      bar.classList.remove('is-visible');
      bar.hidden = true;
      return;
    }

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
        const canFallbackToLocal =
          r.status === 0 ||
          r.status === 401 ||
          r.status === 409 ||
          r.status === 429 ||
          r.status === 500 ||
          r.status === 502 ||
          r.status === 503;

        if (canFallbackToLocal) {
          console.warn('[Cases] Gift claim failed on server, falling back to local credit', {
            status: r.status,
            error: r.error || r.json?.error || null
          });
          applyBalanceDelta(pr.currency, pr.giftsAmount);
          pr.serverEnabled = false;
          if (r.status === 401) {
            showToast('Сессия Telegram устарела. Награда начислена локально.');
          } else {
            showToast('Сервер недоступен. Награда начислена локально.');
          }
        } else {
          showToast('Не удалось начислить награду. Попробуй еще раз.');
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

    // РїРѕРґР°СЂРєРё Р·Р°Р±СЂР°РЅС‹ -> РіР°СЃРёРј Р·РµР»С‘РЅСѓСЋ Р»РёРЅРёСЋ РЅР° С‚РµС… РєР°СЂСѓСЃРµР»СЏС…, РіРґРµ РІС‹РїР°Р»Рё gifts
    clearGlowForType('gift');

    pr.giftsPending = false;
    pr.giftsAmount = 0;
    renderPendingClaimBar();
    maybeFinishPendingRound();
  } catch (e) {
    console.error('[Cases] Gift claim click failed:', e);
    showToast('Не удалось обработать клейм. Попробуй еще раз.');
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
        showToast('Сессия Telegram устарела. Перезапусти мини-апп и попробуй еще раз.');
      } else {
        showToast(r.json?.error || 'Не удалось сохранить NFT. Попробуй еще раз.');
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
    if (!pr.demo) showToast('NFT сохранено');

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
        showToast('Не удалось продать NFT. Попробуй еще раз.');
        return;
      }
      if (r.json && typeof r.json.newBalance !== 'undefined') {
        setBalanceValue(pr.currency, r.json.newBalance);
      }
    }

    safeHaptic('notification', 'success');
    if (!pr.demo) showToast('NFT продано');

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
      if (isSpinning) return false; // Р·Р°РїСЂРµС‰Р°РµРј РјРµРЅСЏС‚СЊ СЂРµР¶РёРј РІРѕ РІСЂРµРјСЏ РїСЂРѕРєСЂСѓС‚Р°/РєР»РµР№РјР°
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

