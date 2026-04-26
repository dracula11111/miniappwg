// admin-panel.js (FIXED) — test/admin tools for Wheel (TEST_MODE)
// Self-contained: injects its own UI, and works with wheel.js exports (window.WheelAdmin, window.stopOnSegment, etc.)
(() => {
  const isTest = (typeof window.__SERVER_TEST_MODE === 'boolean')
    ? window.__SERVER_TEST_MODE
    : !!window.TEST_MODE;
  const host = String(window.location?.hostname || '').toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const allowLocalTestPanel = isTest && isLocalHost;

  const SEGMENTS = ['1.1x', '3x', '5x', '11x', '50&50', 'Loot Rush', 'Wild Time'];
  const SEGMENT_ALIAS = Object.freeze({
    '50/50': '50&50',
    '5050': '50&50',
    '50 & 50': '50&50',
    'lootrush': 'Loot Rush',
    'wildtime': 'Wild Time'
  });
  let panelUnlocked = false;
  let panelAdminSessionToken = '';
  let panelMode = allowLocalTestPanel ? 'LOCAL_TEST' : 'ADMIN';

  // ===== Utils =====
  const $ = (sel, root = document) => root.querySelector(sel);

  function normSeg(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (SEGMENTS.includes(value)) return value;
    const compact = value.toLowerCase().replace(/\s+/g, '');
    return SEGMENT_ALIAS[value] || SEGMENT_ALIAS[compact] || value;
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureLootRushLoaded() {
    if (typeof window.startLootRushBonus === 'function') return true;
    const candidates = [
      '/js/features/wheel/lootrush.js',
      '/public/js/features/wheel/lootrush.js',
      '/js/lootrush.js',
      '/public/js/lootrush.js',
      '/lootrush.js'
    ];
    for (const src of candidates) {
      try {
        await loadScriptOnce(src);
        if (typeof window.startLootRushBonus === 'function') return true;
      } catch (_) {}
    }
    return false;
  }

  async function ensure5050Loaded() {
    if (typeof window.start5050Bonus === 'function') return true;
    // bonus-5050.js already подключён в index.html, но на всякий случай:
    const candidates = [
      '/js/features/wheel/bonus-5050.js',
      '/public/js/features/wheel/bonus-5050.js',
      '/js/bonus-5050.js',
      '/public/js/bonus-5050.js',
      '/bonus-5050.js'
    ];
    for (const src of candidates) {
      try {
        await loadScriptOnce(src);
        if (typeof window.start5050Bonus === 'function') return true;
      } catch (_) {}
    }
    return false;
  }

  async function ensureWildTimeLoaded() {
    if (typeof window.startWildTimeBonus === 'function') return true;
    const candidates = [
      '/js/features/wheel/wildtime.js',
      '/public/js/features/wheel/wildtime.js',
      '/js/wildtime.js',
      '/public/js/wildtime.js',
      '/wildtime.js'
    ];
    for (const src of candidates) {
      try {
        await loadScriptOnce(src);
        if (typeof window.startWildTimeBonus === 'function') return true;
      } catch (_) {}
    }
    return false;
  }

  function fmt(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    return String(v);
  }

  function getInitData() {
    try { return String(window.Telegram?.WebApp?.initData || ''); } catch {}
    return '';
  }

  function buildAuthHeaders(withJson = false) {
    const headers = withJson ? { 'Content-Type': 'application/json' } : {};
    const initData = getInitData();
    if (initData) headers['x-telegram-init-data'] = initData;
    if (panelAdminSessionToken) headers['x-admin-session'] = panelAdminSessionToken;
    return headers;
  }

  async function resolveAdminAccess() {
    if (allowLocalTestPanel) {
      return { allowed: true, mode: 'LOCAL_TEST' };
    }

    const initData = getInitData();
    if (!initData) return { allowed: false, mode: 'NONE' };

    try {
      const r = await fetch('/api/user/inventory', {
        method: 'GET',
        headers: { 'x-telegram-init-data': initData }
      });
      const j = await r.json().catch(() => null);
      const isAdmin = !!(r.ok && j && j.ok === true && j.isAdmin === true);
      return { allowed: isAdmin, mode: isAdmin ? 'ADMIN' : 'NONE' };
    } catch {
      return { allowed: false, mode: 'NONE' };
    }
  }

  async function authPanelPassword(password) {
    const initData = getInitData();
    if (!initData) {
      return { ok: false, error: 'Telegram initData missing' };
    }
    try {
      const r = await fetch('/api/admin/panel/auth', {
        method: 'POST',
        headers: buildAuthHeaders(true),
        body: JSON.stringify({ password })
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) {
        return { ok: false, error: (j && j.error) ? j.error : `HTTP ${r.status}` };
      }
      return {
        ok: true,
        sessionToken: String(j.sessionToken || ''),
        expiresAt: Number(j.expiresAt || 0) || 0
      };
    } catch (e) {
      return { ok: false, error: String(e?.message || e || 'auth failed') };
    }
  }

  // ===== UI =====
  function injectStyles() {
    if ($('#adminPanelStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminPanelStyles';
    style.textContent = `
      #adminToggleBtn{
        position:fixed; right:14px; bottom:59px; z-index:99999;
        padding:10px 12px; border-radius:14px; border:1px solid rgba(255,255,255,.12);
        background: rgba(20,20,20,.72); color:#fff; font-weight:700; font-size:13px;
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 12px 30px rgba(0,0,0,.28);
      }
      #adminPanel{
        position:fixed; right:14px; bottom:62px; z-index:99999;
        width:min(360px, calc(100vw - 28px));
        max-height:min(680px, calc(100vh - 120px));
        overflow:hidden;
        border-radius:18px;
        border:1px solid rgba(255,255,255,.12);
        background: rgba(14,14,16,.86);
        color:#fff;
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        box-shadow: 0 18px 50px rgba(0,0,0,.42);
        display:none;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }
      #adminPanel.open{ display:block; }
      .ap-head{
        padding:12px 12px 10px;
        display:flex; align-items:center; justify-content:space-between;
        border-bottom:1px solid rgba(255,255,255,.10);
      }
      .ap-title{ font-size:13px; font-weight:800; letter-spacing:.2px; }
      .ap-sub{ font-size:11px; opacity:.75; margin-top:2px; }
      .ap-close{
        border:1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color:#fff;
        border-radius:12px;
        padding:6px 9px;
        font-weight:700;
        cursor:pointer;
      }
      .ap-body{ padding:12px; display:flex; flex-direction:column; gap:12px; overflow:auto; max-height: calc(680px - 52px); }
      .ap-card{
        border:1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.05);
        border-radius:16px;
        padding:10px;
      }
      .ap-row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .ap-row > *{ flex: 1 1 auto; }
      .ap-label{ font-size:11px; opacity:.75; margin-bottom:6px; }
      .ap-pill{
        display:inline-flex; align-items:center; gap:6px;
        padding:6px 10px; border-radius:999px;
        border:1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.25);
        font-size:11px;
        white-space:nowrap;
      }
      .ap-btn{
        border:1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color:#fff;
        border-radius:14px;
        padding:9px 10px;
        font-weight:800;
        font-size:12px;
        cursor:pointer;
      }
      .ap-btn.primary{ background: rgba(99,102,241,.22); border-color: rgba(99,102,241,.35); }
      .ap-btn.danger{ background: rgba(239,68,68,.18); border-color: rgba(239,68,68,.30); }
      .ap-btn:disabled{ opacity:.5; cursor:not-allowed; }
      .ap-select{
        width:100%;
        border:1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.28);
        color:#fff;
        border-radius:14px;
        padding:9px 10px;
        font-weight:700;
        font-size:12px;
      }
      .ap-input{
        width:100%;
        border:1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.28);
        color:#fff;
        border-radius:14px;
        padding:9px 10px;
        font-weight:700;
        font-size:12px;
      }
      .ap-techpause-state{
        font-size:12px;
        line-height:1.35;
        padding:8px 10px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.22);
      }
      .ap-log{
        font-size:11px;
        line-height:1.25;
        max-height:160px;
        overflow:auto;
        padding:8px;
        border-radius:14px;
        background: rgba(0,0,0,.28);
        border:1px solid rgba(255,255,255,.10);
      }
      .ap-line{ margin:0 0 6px 0; }
      .ap-line b{ font-weight:900; }
      .ap-ok{ color: #34d399; }
      .ap-warn{ color: #fbbf24; }
      .ap-err{ color: #fb7185; }
    `;
    document.head.appendChild(style);
  }

  function createUI() {
    injectStyles();

    if (!$('#adminToggleBtn')) {
      const btn = document.createElement('button');
      btn.id = 'adminToggleBtn';
      btn.textContent = '🧪 Admin';
      document.body.appendChild(btn);
    }

    if ($('#adminPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'adminPanel';
    panel.innerHTML = `
      <div class="ap-head">
        <div>
          <div class="ap-title">${panelMode === 'LOCAL_TEST' ? 'TEST Admin Panel' : 'Admin Panel'}</div>
          <div class="ap-sub">${panelMode === 'LOCAL_TEST' ? 'Local Test' : 'Secured Admin Access'}</div>
        </div>
        <button class="ap-close" id="apClose">Close</button>
      </div>
      <div class="ap-body">
        <div class="ap-card" id="apStateCard">
          <div class="ap-label">State</div>
          <div class="ap-row" id="apStateRow"></div>
        </div>

        <div class="ap-card" id="apTechPauseCard">
          <div class="ap-label">Tech Pause</div>
          <div class="ap-techpause-state" id="apTechPauseState">Loading...</div>
          <div class="ap-row" style="margin-top:10px">
            <button class="ap-btn danger" id="apTechPauseOn">Turn ON</button>
            <button class="ap-btn primary" id="apTechPauseOff">Turn OFF</button>
            <button class="ap-btn" id="apTechPauseRefresh">Refresh</button>
          </div>
        </div>

        <div class="ap-card">
          <div class="ap-label">Force next landing</div>
          <div class="ap-row">
            <select class="ap-select" id="apForceSelect">
              <option value="">— none —</option>
            </select>
            <button class="ap-btn" id="apForceClear">Clear</button>
          </div>
        </div>

        <div class="ap-card">
          <div class="ap-label">Quick tests</div>
          <div class="ap-row" id="apQuickBtns"></div>
        </div>

        <div class="ap-card">
          <div class="ap-label">Tools</div>
          <div class="ap-row">
            <button class="ap-btn" id="apResetBal">Reset 999</button>
            <button class="ap-btn" id="apSwitchCur">Switch currency</button>
            <button class="ap-btn" id="apSpeed">Toggle speed</button>
            <button class="ap-btn danger" id="apStop">Stop wheel</button>
          </div>
        </div>

        <div class="ap-card">
          <div class="ap-label">Inventory</div>
          <div class="ap-sub" style="margin-top:-4px; opacity:.85">Add gifts / items to a user</div>

          <div class="ap-row" style="margin-top:10px">
            <input class="ap-input" id="apInvUserId" placeholder="Telegram userId (e.g. 1142079504)" />
          </div>

          <div class="ap-row">
            <select class="ap-select" id="apInvType">
              <option value="gift">gift</option>
              <option value="nft">nft</option>
            </select>
            <select class="ap-select" id="apInvCurrency">
              <option value="ton">ton</option>
              <option value="stars">stars</option>
            </select>
            <input class="ap-input" id="apInvPrice" type="number" step="0.01" min="0" placeholder="Price" />
          </div>

          <div class="ap-row">
            <input class="ap-input" id="apInvIcon" placeholder="Icon filename (e.g. bday_candle.webp)" />
          </div>

          <div class="ap-row">
            <input class="ap-input" id="apInvName" placeholder="Name (optional)" />
            <input class="ap-input" id="apInvCount" type="number" min="1" step="1" value="1" placeholder="Count" style="max-width:90px" />
            <button class="ap-btn primary" id="apInvAdd">Add</button>
          </div>

          <div class="ap-sub" style="margin-top:8px; opacity:.75">
            Admin key is loaded only after password unlock and kept in memory until page refresh.
          </div>
        </div>

        <div class="ap-card">
          <div class="ap-label">Relayer Import</div>
          <div class="ap-sub" style="margin-top:-4px; opacity:.85">Import gift to Market from relayer Saved Gifts via link</div>

          <div class="ap-row" style="margin-top:10px">
            <input class="ap-input" id="apRelayerGiftLink" placeholder="https://t.me/nft/PoolFloat-117217" />
            <button class="ap-btn primary" id="apRelayerImportBtn">Import</button>
          </div>
        </div>

        <div class="ap-card">
          <div class="ap-label">Logs</div>
          <div class="ap-log" id="apLog"></div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    // ===== Inventory tool =====
    const invUserIdEl = $('#apInvUserId', panel);
    const invTypeEl = $('#apInvType', panel);
    const invCurrencyEl = $('#apInvCurrency', panel);
    const invPriceEl = $('#apInvPrice', panel);
    const invIconEl = $('#apInvIcon', panel);
    const invNameEl = $('#apInvName', panel);
    const invCountEl = $('#apInvCount', panel);
    const invAddBtn = $('#apInvAdd', panel);
    const relayerGiftLinkEl = $('#apRelayerGiftLink', panel);
    const relayerImportBtn = $('#apRelayerImportBtn', panel);
    const techPauseStateEl = $('#apTechPauseState', panel);
    const techPauseOnBtn = $('#apTechPauseOn', panel);
    const techPauseOffBtn = $('#apTechPauseOff', panel);
    const techPauseRefreshBtn = $('#apTechPauseRefresh', panel);
    let techPauseUiState = null;

    // try to auto-fill userId from Telegram WebApp
    try {
      const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (tgId && !invUserIdEl.value) invUserIdEl.value = String(tgId);
    } catch {}

    const slugify = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_\-]/g, '')
        .slice(0, 48);

    async function adminAddItems(userId, items) {
      if (panelMode !== 'LOCAL_TEST' && !panelAdminSessionToken) {
        throw new Error('Admin panel is locked');
      }
      const headers = buildAuthHeaders(true);

      const r = await fetch('/api/admin/inventory/add', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, items }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) {
        throw new Error((j && j.error) ? j.error : `HTTP ${r.status}`);
      }
      return j;
    }

    async function adminImportRelayerGift(giftLink) {
      if (panelMode !== 'LOCAL_TEST' && !panelAdminSessionToken) {
        throw new Error('Admin panel is locked');
      }
      const headers = buildAuthHeaders(true);

      const r = await fetch('/api/admin/relayer/import-market-gift', {
        method: 'POST',
        headers,
        body: JSON.stringify({ giftLink }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) {
        throw new Error((j && (j.error || j.code)) ? (j.error || j.code) : `HTTP ${r.status}`);
      }
      return j;
    }

    function normalizeTechPauseState(raw) {
      const modeRaw = String(raw?.mode || '').trim().toLowerCase();
      const mode = (modeRaw === 'active' || modeRaw === 'draining') ? modeRaw : 'off';
      return {
        enabled: raw?.enabled === true || Number(raw?.enabled) === 1 || mode !== 'off',
        mode,
        isDraining: mode === 'draining',
        isActive: mode === 'active',
        updatedAt: Number(raw?.updatedAt || 0) || 0
      };
    }

    function renderTechPauseState() {
      if (!techPauseStateEl) return;

      if (panelMode === 'LOCAL_TEST') {
        techPauseStateEl.innerHTML = '<b>Local test mode</b><br><span style="opacity:.75">Tech Pause switch is available only in secured admin mode.</span>';
        if (techPauseOnBtn) techPauseOnBtn.disabled = true;
        if (techPauseOffBtn) techPauseOffBtn.disabled = true;
        if (techPauseRefreshBtn) techPauseRefreshBtn.disabled = true;
        return;
      }

      if (!techPauseUiState) {
        techPauseStateEl.textContent = 'Unknown';
        if (techPauseOnBtn) techPauseOnBtn.disabled = false;
        if (techPauseOffBtn) techPauseOffBtn.disabled = false;
        if (techPauseRefreshBtn) techPauseRefreshBtn.disabled = false;
        return;
      }

      const updatedText = techPauseUiState.updatedAt
        ? new Date(techPauseUiState.updatedAt).toLocaleString()
        : 'n/a';
      const modeLabel = techPauseUiState.mode.toUpperCase();
      const modeColor = techPauseUiState.isActive
        ? '#fb7185'
        : (techPauseUiState.isDraining ? '#fbbf24' : '#34d399');

      techPauseStateEl.innerHTML =
        `<b style="color:${modeColor}">${modeLabel}</b><br><span style="opacity:.78">Updated: ${updatedText}</span>`;

      if (techPauseOnBtn) techPauseOnBtn.disabled = techPauseUiState.enabled === true;
      if (techPauseOffBtn) techPauseOffBtn.disabled = techPauseUiState.enabled === false;
      if (techPauseRefreshBtn) techPauseRefreshBtn.disabled = false;
    }

    async function adminFetchTechPauseState() {
      if (panelMode !== 'LOCAL_TEST' && !panelAdminSessionToken) {
        throw new Error('Admin panel is locked');
      }
      const headers = buildAuthHeaders(false);
      const r = await fetch('/api/admin/tech-pause', { method: 'GET', headers });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) {
        throw new Error((j && j.error) ? j.error : `HTTP ${r.status}`);
      }
      return normalizeTechPauseState(j.techPause || {});
    }

    async function adminSetTechPause(enabled) {
      if (panelMode !== 'LOCAL_TEST' && !panelAdminSessionToken) {
        throw new Error('Admin panel is locked');
      }
      const headers = buildAuthHeaders(true);
      const r = await fetch('/api/admin/tech-pause', {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: !!enabled }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) {
        throw new Error((j && j.error) ? j.error : `HTTP ${r.status}`);
      }
      return normalizeTechPauseState(j.techPause || {});
    }

    async function refreshTechPauseState(logResult = false) {
      if (panelMode === 'LOCAL_TEST') {
        renderTechPauseState();
        return;
      }
      try {
        if (techPauseRefreshBtn) techPauseRefreshBtn.disabled = true;
        techPauseUiState = await adminFetchTechPauseState();
        renderTechPauseState();
        if (logResult) {
          log(`Tech Pause state: <b>${String(techPauseUiState.mode || 'off').toUpperCase()}</b>`, 'ok');
        }
      } catch (e) {
        renderTechPauseState();
        if (logResult) log(`Tech Pause refresh error: ${e?.message || e}`, 'err');
      } finally {
        if (techPauseRefreshBtn && panelMode !== 'LOCAL_TEST') techPauseRefreshBtn.disabled = false;
      }
    }

    invAddBtn.addEventListener('click', async () => {
      try {
        const uid = String(invUserIdEl.value || '').trim();
        if (!uid) return log('Inventory: userId required');

        const type = String(invTypeEl.value || 'gift');
        const currency = (String(invCurrencyEl.value || 'ton') === 'stars') ? 'stars' : 'ton';

        const rawPrice = Number(invPriceEl.value || 0);
        const price = currency === 'stars' ? Math.max(0, Math.round(rawPrice)) : Math.max(0, Math.round(rawPrice * 100) / 100);

        const icon = String(invIconEl.value || '').trim();
        const name = String(invNameEl.value || '').trim() || 'Name';

        const count = Math.max(1, parseInt(invCountEl.value || '1', 10) || 1);

        const baseKey = slugify(icon || name || type) || type;
        const baseId = (type === 'nft') ? `nft_${baseKey}` : `gift_${baseKey}`;

        const items = Array.from({ length: count }).map(() => ({
          type,
          baseId,
          name,
          icon,
          price: {
            ton: currency === 'ton' ? price : 0,
            stars: currency === 'stars' ? price : 0,
          },
          source: 'admin',
        }));

        invAddBtn.disabled = true;
        invAddBtn.textContent = 'Adding...';
        const res = await adminAddItems(uid, items);
        log(`Inventory: added ${res.added} item(s) for user ${uid}`);
      } catch (e) {
        log(`Inventory error: ${e.message || e}`);
      } finally {
        invAddBtn.disabled = false;
        invAddBtn.textContent = 'Add';
      }
    });

    relayerImportBtn.addEventListener('click', async () => {
      const link = String(relayerGiftLinkEl?.value || '').trim();
      if (!link) {
        log('Relayer import: gift link required', 'warn');
        return;
      }

      try {
        relayerImportBtn.disabled = true;
        relayerImportBtn.textContent = 'Importing...';
        const result = await adminImportRelayerGift(link);
        const itemName = String(result?.item?.name || 'Gift');
        const itemNumber = String(result?.item?.number || '').trim();
        const suffix = itemNumber ? ` #${itemNumber}` : '';
        const relisted = result?.relisted ? ' (relisted)' : '';
        log(`Relayer import: added to market <b>${itemName}${suffix}</b>${relisted}`, 'ok');
      } catch (e) {
        log(`Relayer import error: ${e?.message || e}`, 'err');
      } finally {
        relayerImportBtn.disabled = false;
        relayerImportBtn.textContent = 'Import';
      }
    });

    if (techPauseOnBtn) {
      techPauseOnBtn.addEventListener('click', async () => {
        try {
          techPauseOnBtn.disabled = true;
          if (techPauseOffBtn) techPauseOffBtn.disabled = true;
          if (techPauseRefreshBtn) techPauseRefreshBtn.disabled = true;
          techPauseUiState = await adminSetTechPause(true);
          renderTechPauseState();
          log('Tech Pause switched <b>ON</b>', 'warn');
        } catch (e) {
          renderTechPauseState();
          log(`Tech Pause ON error: ${e?.message || e}`, 'err');
        } finally {
          renderTechPauseState();
        }
      });
    }

    if (techPauseOffBtn) {
      techPauseOffBtn.addEventListener('click', async () => {
        try {
          techPauseOffBtn.disabled = true;
          if (techPauseOnBtn) techPauseOnBtn.disabled = true;
          if (techPauseRefreshBtn) techPauseRefreshBtn.disabled = true;
          techPauseUiState = await adminSetTechPause(false);
          renderTechPauseState();
          log('Tech Pause switched <b>OFF</b>', 'ok');
        } catch (e) {
          renderTechPauseState();
          log(`Tech Pause OFF error: ${e?.message || e}`, 'err');
        } finally {
          renderTechPauseState();
        }
      });
    }

    if (techPauseRefreshBtn) {
      techPauseRefreshBtn.addEventListener('click', () => {
        refreshTechPauseState(true);
      });
    }



    // fill options
    const forceSelect = $('#apForceSelect', panel);
    SEGMENTS.forEach(s => {
      const o = document.createElement('option');
      o.value = s;
      o.textContent = s;
      forceSelect.appendChild(o);
    });

    // quick buttons
    const btnWrap = $('#apQuickBtns', panel);
    SEGMENTS.forEach(s => {
      const b = document.createElement('button');
      b.className = 'ap-btn' + (s === 'Loot Rush' || s === '50&50' || s === 'Wild Time' ? ' primary' : '');
      b.textContent = s;
      b.addEventListener('click', () => onTestSegment(s));
      btnWrap.appendChild(b);
    });

    // toggle open/close
    const toggleBtn = $('#adminToggleBtn');
    toggleBtn.addEventListener('click', async () => {
      if (panelMode !== 'LOCAL_TEST' && !panelUnlocked) {
        const passRaw = window.prompt('Enter admin panel password');
        if (passRaw == null) return;
        const password = String(passRaw || '').trim();
        if (!password) {
          log('Password is required', 'warn');
          return;
        }
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'Auth...';
        const auth = await authPanelPassword(password);
        toggleBtn.disabled = false;
        toggleBtn.textContent = '🧪 Admin';
        if (!auth.ok) {
          log(`Auth failed: ${auth.error || 'forbidden'}`, 'err');
          return;
        }
        panelAdminSessionToken = String(auth.sessionToken || '');
        panelUnlocked = true;
        log('Admin access granted for current page session', 'ok');
      }
      panel.classList.toggle('open');
      renderState();
      renderTechPauseState();
      if (panel.classList.contains('open')) {
        refreshTechPauseState(false);
      }
    });
    $('#apClose', panel).addEventListener('click', () => panel.classList.remove('open'));

    // actions
    forceSelect.addEventListener('change', () => {
      const seg = normSeg(forceSelect.value);

      if (!seg) return clearForced();
      forceNext(seg);
    });
    $('#apForceClear', panel).addEventListener('click', clearForced);

    $('#apResetBal', panel).addEventListener('click', resetBalance);
    $('#apSwitchCur', panel).addEventListener('click', switchCurrency);
    $('#apSpeed', panel).addEventListener('click', toggleSpeed);
    $('#apStop', panel).addEventListener('click', stopWheel);

    // events -> state refresh
    window.addEventListener('wheel:landed', (e) => {
      log(`wheel:landed → <b>${fmt(e?.detail?.segment)}</b>`, 'ok');
      renderState();
    });
    window.addEventListener('balance:update', () => renderState());
    window.addEventListener('techpause:update', (event) => {
      try {
        techPauseUiState = normalizeTechPauseState(event?.detail || {});
        renderTechPauseState();
      } catch {}
    });

    renderTechPauseState();
    refreshTechPauseState(false);
  }

  function log(html, level = 'ok') {
    const el = $('#apLog');
    if (!el) return;
    const p = document.createElement('p');
    p.className = 'ap-line ' + (level === 'err' ? 'ap-err' : level === 'warn' ? 'ap-warn' : 'ap-ok');
    const ts = new Date().toLocaleTimeString();
    p.innerHTML = `[${ts}] ${html}`;
    el.prepend(p);
    // keep last ~60 lines
    while (el.children.length > 60) el.removeChild(el.lastChild);
  }

  function renderState() {
    const row = $('#apStateRow');
    if (!row) return;

    const st = (window.WheelAdmin && typeof window.WheelAdmin.getCurrentState === 'function')
      ? window.WheelAdmin.getCurrentState()
      : {
          testMode: !!window.TEST_MODE,
          balance: window.userBalance || { ton: 0, stars: 0 },
          currency: window.currentCurrency || 'ton',
          phase: window.phase || 'unknown',
          omega: window.omega || 0
        };

    row.innerHTML = '';
    const pills = [
      ['mode', st.testMode ? 'TEST' : 'LIVE'],
      ['cur', (st.currency || 'ton').toUpperCase()],
      ['phase', st.phase],
      ['ω', Number(st.omega).toFixed(2)],
      ['TON', Number(st.balance?.ton ?? 0).toFixed(2)],
      ['Stars', Math.round(Number(st.balance?.stars ?? 0))]
    ];

    pills.forEach(([k, v]) => {
      const d = document.createElement('div');
      d.className = 'ap-pill';
      d.innerHTML = `<span style="opacity:.7">${k}:</span><b>${v}</b>`;
      row.appendChild(d);
    });
  }

  // ===== Actions =====
  function forceNext(seg) {
    seg = normSeg(seg);

    if (window.WheelAdmin && typeof window.WheelAdmin.forceNextSegment === 'function') {
      window.WheelAdmin.forceNextSegment(seg);
      log(`Forced next landing: <b>${seg}</b>`, 'warn');
    } else {
      window.forcedNextSegment = seg;
      log(`Forced next landing (fallback): <b>${seg}</b>`, 'warn');
    }
  }

  function clearForced() {
    if (window.WheelAdmin && typeof window.WheelAdmin.clearForcedSegment === 'function') {
      window.WheelAdmin.clearForcedSegment();
    } else {
      window.forcedNextSegment = null;
    }
    const s = $('#apForceSelect');
    if (s) s.value = '';
    log('Forced landing cleared', 'ok');
  }

  function resetBalance() {
    if (window.WheelAdmin && typeof window.WheelAdmin.resetBalance === 'function') {
      window.WheelAdmin.resetBalance();
    } else {
      window.userBalance = { ton: 999, stars: 999 };
      if (window.WildTimeCurrency) {
        window.WildTimeCurrency.setBalance('ton', 999);
        window.WildTimeCurrency.setBalance('stars', 999);
      }
      if (typeof window.updateTestBalance === 'function') window.updateTestBalance();
      window.dispatchEvent(new CustomEvent('balance:update', { detail: { ton: 999, stars: 999, _testMode: true } }));
    }
    log('Balance reset → 999 / 999', 'ok');
    renderState();
  }

  function switchCurrency() {
    if (window.WheelAdmin && typeof window.WheelAdmin.switchCurrency === 'function') {
      window.WheelAdmin.switchCurrency();
      log('Currency switched (WheelAdmin)', 'ok');
      renderState();
      return;
    }
    if (window.WildTimeCurrency && (typeof window.WildTimeCurrency.switchTo === 'function' || typeof window.WildTimeCurrency.switch === 'function')) {
      const current = window.WildTimeCurrency.current || 'ton';
      const next = current === 'ton' ? 'stars' : 'ton';
      if (typeof window.WildTimeCurrency.switchTo === 'function') {
        window.WildTimeCurrency.switchTo(next);
      } else {
        window.WildTimeCurrency.switch(next);
      }
      log(`Currency switched → <b>${next.toUpperCase()}</b>`, 'ok');
      renderState();
      return;
    }
    // fallback
    window.currentCurrency = (window.currentCurrency === 'ton') ? 'stars' : 'ton';
    window.dispatchEvent(new CustomEvent('currency:changed', { detail: { currency: window.currentCurrency } }));
    log(`Currency switched (fallback) → <b>${String(window.currentCurrency).toUpperCase()}</b>`, 'warn');
    renderState();
  }

  function toggleSpeed() {
    if (window.WheelAdmin && typeof window.WheelAdmin.setWheelSpeed === 'function') {
      const isFast = (window.omega || 0) > 5;
      window.WheelAdmin.setWheelSpeed(isFast ? 'slow' : 'fast');
      log(`Wheel speed → <b>${isFast ? 'Normal' : 'Fast'}</b>`, 'ok');
      renderState();
      return;
    }
    const isFast = (window.omega || 0) > 5;
    if (typeof window.setOmega === 'function') window.setOmega(isFast ? 0.35 : 9.0, { force: true });
    else window.omega = isFast ? 0.35 : 9.0;
    log(`Wheel speed (fallback) → <b>${isFast ? 'Normal' : 'Fast'}</b>`, 'warn');
    renderState();
  }

  function stopWheel() {
    if (window.WheelAdmin && typeof window.WheelAdmin.stopWheel === 'function') {
      window.WheelAdmin.stopWheel();
      log('Wheel stopped (WheelAdmin)', 'ok');
    } else {
      if (typeof window.setOmega === 'function') window.setOmega(0, { force: true });
      else window.omega = 0;
      if (typeof window.setPhase === 'function') window.setPhase('betting', { force: true });
      else window.phase = 'betting';
      log('Wheel stopped (fallback)', 'warn');
    }
    renderState();
  }

  async function onTestSegment(seg) {
    seg = normSeg(seg);

    // Bonuses: run directly (it’s how admin тест обычно делают)
    if (seg === '50&50') {
      const ok = await ensure5050Loaded();
      if (!ok) {
        log('50/50 module not loaded (start5050Bonus missing)', 'err');
        return;
      }
      if (typeof window.stopOnSegment === 'function') window.stopOnSegment('50&50');
      else if (typeof window.bonusLockStart === 'function') window.bonusLockStart();

      log('Launching <b>50&50</b> bonus...', 'ok');
      try {
        const res = await window.start5050Bonus(1);
        log(`50/50 completed → <b>${fmt(res)}</b>`, 'ok');
      } catch (e) {
        log(`50/50 error → ${fmt(e?.message || e)}`, 'err');
      } finally {
        if (typeof window.bonusLockEnd === 'function') window.bonusLockEnd({ phase: 'betting', omega: 0.35 });
      }
      renderState();
      return;
    }

    if (seg === 'Loot Rush') {
      const ok = await ensureLootRushLoaded();
      if (!ok) {
        log('Loot Rush module not loaded: добавь <script src="/js/lootrush.js" defer></script> в index.html', 'err');
        return;
      }
      if (typeof window.stopOnSegment === 'function') window.stopOnSegment('Loot Rush');
      else if (typeof window.bonusLockStart === 'function') window.bonusLockStart();

      log('Launching <b>Loot Rush</b> bonus...', 'ok');
      try {
        const res = await window.startLootRushBonus(1);
        log(`Loot Rush completed → <b>${fmt(res)}</b>`, 'ok');
      } catch (e) {
        log(`Loot Rush error → ${fmt(e?.message || e)}`, 'err');
      } finally {
        if (typeof window.bonusLockEnd === 'function') window.bonusLockEnd({ phase: 'betting', omega: 0.35 });
      }
      renderState();
      return;
    }

    if (seg === 'Wild Time') {
	      if (typeof window.bonusLockStart === 'function') window.bonusLockStart();
	      log('Launching <b>Wild Time</b> bonus...', 'ok');
	      try {
	        const ok = await ensureWildTimeLoaded();
	        if (!ok) throw new Error('wildtime.js not loaded');
	        const res = await window.startWildTimeBonus(1);
	        const choice = res && typeof res === 'object' ? (res.choice || res.result || '') : res;
	        log(`Wild Time completed → <b>${fmt(choice)}</b>`, 'ok');
	      } catch (e) {
	        log(`Wild Time error → ${fmt(e?.message || e)}`, 'err');
	      } finally {
	        if (typeof window.bonusLockEnd === 'function') window.bonusLockEnd({ phase: 'betting', omega: 0.35 });
	      }
	      renderState();
	      return;
    }

    // Multipliers: easiest is to use WheelAdmin simulation if available
    if (window.WheelAdmin && typeof window.WheelAdmin.simulateSegmentWin === 'function') {
      window.WheelAdmin.simulateSegmentWin(seg, 1);
      log(`Simulated landed → <b>${seg}</b>`, 'ok');
      renderState();
      return;
    }

    // Fallback: just show win toast if exists
    const multipliers = { '1.1x': 1.1, '3x': 3, '5x': 5, '11x': 11 };
    const m = multipliers[seg] || 1;
    const bet = 1;
    const win = bet * m;
    if (typeof window.showWinNotification === 'function') window.showWinNotification(win);
    if (typeof window.addWinAmount === 'function') window.addWinAmount(win, window.currentCurrency || 'ton');
    window.dispatchEvent(new CustomEvent('wheel:landed', { detail: { segment: seg, betAmount: bet } }));
    log(`Fallback simulate: <b>${seg}</b> (win ${win})`, 'warn');
    renderState();
  }

  // Boot
  document.addEventListener('DOMContentLoaded', async () => {
    const access = await resolveAdminAccess();
    if (!access.allowed) return;
    panelMode = access.mode || panelMode;

    createUI();
    renderState();
    log('Admin panel loaded', 'ok');

    // small hint if lootrush.js is not connected in html
    if (typeof window.startLootRushBonus !== 'function') {
      log('Hint: Loot Rush не подключен. Добавь /js/lootrush.js в index.html или запускай через кнопку (она подгрузит сама).', 'warn');
    }
  });
})();
