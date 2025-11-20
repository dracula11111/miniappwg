// admin-panel-styled.js - Admin Panel with Professional Design

class AdminPanel {
    constructor() {
      this.isOpen = false;
      this.panel = null;
      this.button = null;
      
      // Все доступные сегменты
      this.segments = [
        { name: '1x', type: 'multiplier', multiplier: 1, color: '#6f6a00' },
        { name: '3x', type: 'multiplier', multiplier: 3, color: '#6e4200' },
        { name: '7x', type: 'multiplier', multiplier: 7, color: '#0f5a2e' },
        { name: '11x', type: 'multiplier', multiplier: 11, color: '#0a3f64' },
        { name: '50&50', type: 'bonus', description: '50/50 Bonus Game', color: '#d9197a' },
        { name: 'Loot Rush', type: 'bonus', description: 'Loot Rush Bonus', color: '#6c2bd9' },
        { name: 'Wild Time', type: 'bonus', description: 'Wild Time Bonus', color: '#c5161d' }
      ];
      
      this.init();
    }
    
    init() {
      // Проверяем, что включен тестовый режим
      if (!window.TEST_MODE) {
        console.log('[AdminPanel] Not in test mode, skipping initialization');
        return;
      }
      
      console.log('[AdminPanel] 🛠️ Initializing admin panel');
      
      // Создаем кнопку открытия панели
      this.createButton();
      
      // Создаем саму панель
      this.createPanel();
      
      // Добавляем стили
      this.addStyles();
      
      // Добавляем обработчики горячих клавиш
      this.addKeyboardShortcuts();
    }
    
    createButton() {
      this.button = document.createElement('button');
      this.button.id = 'admin-panel-button';
      this.button.className = 'admin-panel-button';
      this.button.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
          <path d="M20.5 7.5L16 12l4.5 4.5M3.5 7.5L8 12l-4.5 4.5"/>
        </svg>
      `;
      
      this.button.addEventListener('click', () => this.toggle());
      
      document.body.appendChild(this.button);
    }
    
    createPanel() {
      this.panel = document.createElement('div');
      this.panel.id = 'admin-panel';
      this.panel.className = 'admin-panel';
      
      this.panel.innerHTML = `
        <div class="admin-panel-overlay"></div>
        <div class="admin-panel-content">
          <div class="admin-panel-header">
            <div class="admin-panel-header-left">
              <div class="admin-panel-logo">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" stroke="currentColor" stroke-width="2" fill="rgba(0,166,255,0.1)"/>
                  <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="admin-panel-title">
                <h2>Admin Console</h2>
                <span class="admin-panel-subtitle">Developer Mode</span>
              </div>
            </div>
            <button class="admin-panel-close" id="admin-panel-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          
          <div class="admin-panel-body">
            <!-- Status Bar -->
            <div class="admin-status-bar">
              <div class="admin-status-item">
                <span class="status-label">Mode</span>
                <span class="status-value active">TEST</span>
              </div>
              <div class="admin-status-item">
                <span class="status-label">Balance</span>
                <span class="status-value" id="admin-balance">999 TON</span>
              </div>
              <div class="admin-status-item">
                <span class="status-label">Currency</span>
                <span class="status-value" id="admin-currency">TON</span>
              </div>
              <div class="admin-status-item">
                <span class="status-label">Last Win</span>
                <span class="status-value" id="admin-last-result">—</span>
              </div>
            </div>
            
            <!-- Quick Actions -->
            <div class="admin-section">
              <div class="admin-section-header">
                <h3>Quick Actions</h3>
                <div class="admin-section-line"></div>
              </div>
              <div class="admin-actions">
                <button class="admin-action-btn" data-action="reset-balance">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2v6m0 4v6m0 4v-2M8 8h8M6 12h12M10 16h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <span>Reset Balance</span>
                </button>
                <button class="admin-action-btn" data-action="switch-currency">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2v20M17 7l-5-5-5 5M7 17l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <span>Switch Currency</span>
                </button>
                <button class="admin-action-btn" data-action="clear-history">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2m3 0v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <span>Clear History</span>
                </button>
                <button class="admin-action-btn" data-action="speed-up">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span>Speed Mode</span>
                </button>
              </div>
            </div>
            
            <!-- Segment Tester -->
            <div class="admin-section">
              <div class="admin-section-header">
                <h3>Test Segments</h3>
                <div class="admin-section-line"></div>
              </div>
              <div class="admin-segments-grid" id="admin-segments-grid">
                <!-- Segments will be added here -->
              </div>
            </div>
            
            <!-- Force Landing -->
            <div class="admin-section">
              <div class="admin-section-header">
                <h3>Force Next Spin</h3>
                <div class="admin-section-line"></div>
              </div>
              <div class="admin-force-container">
                <select class="admin-select" id="admin-force-segment">
                  <option value="">Random (Default)</option>
                  ${this.segments.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                </select>
                <button class="admin-btn-primary" id="admin-apply-force">
                  Apply Force
                </button>
              </div>
            </div>
            
            <!-- Console Log -->
            <div class="admin-section">
              <div class="admin-section-header">
                <h3>Debug Console</h3>
                <div class="admin-section-line"></div>
              </div>
              <div class="admin-console" id="admin-console">
                <div class="console-line welcome">System ready...</div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(this.panel);
      
      // Заполняем сетку сегментов
      this.populateSegments();
      
      // Добавляем обработчики
      this.attachEventHandlers();
      
      // Обновляем информацию
      this.updateInfo();
    }
    
    populateSegments() {
      const grid = document.getElementById('admin-segments-grid');
      
      this.segments.forEach(segment => {
        const tile = document.createElement('button');
        tile.className = 'admin-segment-tile';
        tile.dataset.segment = segment.name;
        
        // Используем цвет сегмента для акцента
        tile.style.setProperty('--segment-color', segment.color);
        
        tile.innerHTML = `
          <div class="segment-icon">
            ${segment.type === 'multiplier' ? 
              `<span class="multiplier-text">${segment.multiplier}×</span>` :
              `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" 
                  fill="currentColor" opacity="0.3"/>
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" 
                  stroke="currentColor" stroke-width="2"/>
              </svg>`
            }
          </div>
          <div class="segment-name">${segment.name}</div>
          <div class="segment-type">${segment.type}</div>
        `;
        
        tile.addEventListener('click', () => this.testSegment(segment));
        
        grid.appendChild(tile);
      });
    }
    
    attachEventHandlers() {
      // Close button
      document.getElementById('admin-panel-close').addEventListener('click', () => this.close());
      
      // Overlay click
      this.panel.querySelector('.admin-panel-overlay').addEventListener('click', () => this.close());
      
      // Action buttons
      this.panel.querySelectorAll('.admin-action-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => this.handleAction(e.currentTarget.dataset.action));
      });
      
      // Force landing
      document.getElementById('admin-apply-force').addEventListener('click', () => {
        const select = document.getElementById('admin-force-segment');
        const segment = select.value;
        
        if (segment) {
          this.forceNextLanding(segment);
        } else {
          this.clearForceLanding();
        }
      });
      
      // Listen to wheel events
      window.addEventListener('wheel:landed', (e) => {
        this.log(`Wheel landed on: ${e.detail.segment}`, 'success');
        document.getElementById('admin-last-result').textContent = e.detail.segment;
      });
      
      window.addEventListener('balance:update', (e) => {
        this.updateBalance(e.detail);
      });
    }
    
    testSegment(segment) {
      this.log(`Testing segment: ${segment.name}`, 'info');
      
      // Имитируем выпадение сегмента
      if (segment.type === 'multiplier') {
        // Для обычных множителей
        this.simulateMultiplierWin(segment);
      } else if (segment.type === 'bonus') {
        // Для бонусных игр
        this.simulateBonusGame(segment);
      }
    }
    
    simulateMultiplierWin(segment) {
      const betAmount = 1; // Тестовая ставка
      const winAmount = betAmount * segment.multiplier;
      
      this.log(`Simulating ${segment.name} win:`, 'info');
      this.log(`Bet: ${betAmount} → Win: ${winAmount} (×${segment.multiplier})`, 'success');
      
      // Показываем уведомление о выигрыше
      if (window.showWinNotification) {
        window.showWinNotification(winAmount);
      }
      
      // Обновляем баланс
      if (window.WheelGame && window.WheelGame.addWinAmount) {
        const currency = window.WheelGame.getCurrentCurrency();
        window.WheelGame.addWinAmount(winAmount, currency);
        this.log(`Added ${winAmount} ${currency.toUpperCase()} to balance`, 'success');
      }
      
      // Добавляем в историю
      this.addToHistory(segment.name);
    }
    
    simulateBonusGame(segment) {
      this.log(`Launching ${segment.name} bonus game...`, 'info');
      
      switch(segment.name) {
        case '50&50':
          this.launch5050Bonus();
          break;
        case 'Loot Rush':
          this.log('Loot Rush bonus not implemented yet', 'warning');
          break;
        case 'Wild Time':
          this.log('Wild Time bonus not implemented yet', 'warning');
          break;
      }
    }
    
    launch5050Bonus() {
      const betAmount = 1;
      
      if (window.start5050Bonus) {
        window.start5050Bonus(betAmount);
        this.log('50/50 Bonus launched with bet: ' + betAmount, 'success');
      } else if (window.Bonus5050) {
        const overlay = document.getElementById('bonus5050Overlay');
        const container = document.getElementById('bonus5050Container');
        
        if (overlay && container) {
          overlay.style.display = 'flex';
          
          const bonus = new window.Bonus5050(container, {
            onComplete: (result) => {
              this.log(`50/50 Bonus completed: ${result}`, result === '2x' ? 'success' : 'error');
            }
          });
          
          bonus.start();
        }
      } else {
        this.log('50/50 Bonus module not loaded', 'error');
      }
    }
    
    handleAction(action) {
      switch(action) {
        case 'reset-balance':
          this.resetBalance();
          break;
        case 'switch-currency':
          this.switchCurrency();
          break;
        case 'clear-history':
          this.clearHistory();
          break;
        case 'speed-up':
          this.toggleSpeedMode();
          break;
      }
    }
    
    resetBalance() {
      if (window.WildTimeCurrency) {
        window.WildTimeCurrency.setBalance('ton', 999);
        window.WildTimeCurrency.setBalance('stars', 999);
      }
      
      if (window.WheelGame) {
        window.userBalance = { ton: 999, stars: 999 };
      }
      
      window.dispatchEvent(new CustomEvent('balance:update', {
        detail: { ton: 999, stars: 999 }
      }));
      
      this.log('Balance reset to 999 TON and 999 Stars', 'success');
    }
    
    switchCurrency() {
      if (window.WildTimeCurrency) {
        const current = window.WildTimeCurrency.current;
        const newCurrency = current === 'ton' ? 'stars' : 'ton';
        window.WildTimeCurrency.switch(newCurrency);
        
        document.getElementById('admin-currency').textContent = newCurrency.toUpperCase();
        this.log(`Switched currency to ${newCurrency.toUpperCase()}`, 'success');
      }
    }
    
    clearHistory() {
      const historyList = document.getElementById('historyList');
      if (historyList) {
        historyList.innerHTML = '';
        this.log('History cleared', 'success');
      }
    }
    
    toggleSpeedMode() {
      if (window.FAST_OMEGA) {
        const isfast = window.omega > 5;
        window.omega = isfast ? 0.35 : 9.0;
        this.log(`Wheel speed: ${isfast ? 'Normal' : 'Fast'}`, 'info');
      }
    }
    
    forceNextLanding(segment) {
      if (window.WheelGame) {
        window.WheelGame.forcedSegment = segment;
        this.log(`Next landing forced to: ${segment}`, 'warning');
        
        const select = document.getElementById('admin-force-segment');
        select.classList.add('force-active');
        setTimeout(() => {
          select.classList.remove('force-active');
        }, 2000);
      }
    }
    
    clearForceLanding() {
      if (window.WheelGame) {
        window.WheelGame.forcedSegment = null;
        this.log('Force landing cleared', 'info');
      }
    }
    
    addToHistory(segment) {
      const historyList = document.getElementById('historyList');
      if (!historyList) return;
      
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      
      const historyIcons = {
        '1x': '/images/history/1x_small.png',
        '3x': '/images/history/3x_small.png',
        '7x': '/images/history/7x_small.png',
        '11x': '/images/history/11x_small.png',
        '50&50': '/images/history/50-50_small.png',
        'Loot Rush': '/images/history/loot_small.png',
        'Wild Time': '/images/history/wild_small.png'
      };
      
      historyItem.innerHTML = `<img src="${historyIcons[segment] || '/images/history/1x_small.png'}" alt="${segment}" />`;
      
      historyList.insertBefore(historyItem, historyList.firstChild);
      
      while (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild);
      }
    }
    
    updateBalance(balance) {
      const balanceEl = document.getElementById('admin-balance');
      if (balanceEl) {
        const current = window.currentCurrency || 'ton';
        const amount = current === 'ton' ? balance.ton?.toFixed(2) : balance.stars;
        balanceEl.textContent = `${amount} ${current.toUpperCase()}`;
      }
    }
    
    updateInfo() {
      if (window.userBalance) {
        this.updateBalance(window.userBalance);
      }
      
      if (window.WildTimeCurrency) {
        document.getElementById('admin-currency').textContent = window.WildTimeCurrency.current.toUpperCase();
      }
      
      setInterval(() => {
        if (this.isOpen && window.userBalance) {
          this.updateBalance(window.userBalance);
        }
      }, 2000);
    }
    
    log(message, type = 'info') {
      const console = document.getElementById('admin-console');
      if (!console) return;
      
      const line = document.createElement('div');
      line.className = `console-line ${type}`;
      
      const time = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      
      line.innerHTML = `<span class="time">${time}</span><span class="message">${message}</span>`;
      
      console.appendChild(line);
      console.scrollTop = console.scrollHeight;
      
      while (console.children.length > 50) {
        console.removeChild(console.firstChild);
      }
    }
    
    addKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
          e.preventDefault();
          this.toggle();
        }
        
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });
    }
    
    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }
    
    open() {
      if (!this.panel) return;
      
      this.panel.style.display = 'flex';
      this.isOpen = true;
      this.button.classList.add('active');
      
      this.log('Admin panel opened', 'info');
    }
    
    close() {
      if (!this.panel) return;
      
      this.panel.style.display = 'none';
      this.isOpen = false;
      this.button.classList.remove('active');
    }
    
    addStyles() {
      const style = document.createElement('style');
      style.id = 'admin-panel-styles';
      style.textContent = `
        /* CSS Variables */
        :root {
      --admin-bg: rgba(13, 14, 15, 0.7);
      --admin-bg-solid: #0d0e0f;
      --admin-bg-2: rgba(15, 20, 28, 0.5);
      --admin-panel: rgba(18, 24, 35, 0.6);
      --admin-card: rgba(20, 28, 42, 0.7);
      --admin-border: rgba(37, 50, 71, 0.5);
      --admin-text: #e7edf7;
      --admin-muted: rgba(153, 167, 187, 0.9);
      --admin-accent: #00a6ff;
      --admin-accent-ghost: rgba(0, 166, 255, .14);
      --admin-glow-soft: rgba(21, 32, 51, .6);
      --admin-danger: #ff4d4f;
      --admin-ok: #27c93f;
      --admin-warning: #ffb84d;
      --admin-blur: 20px;
      --admin-blur-heavy: 30px;
    }
    
    /* Admin Panel Button */
    .admin-panel-button {
      position: fixed;
      bottom: 62px;
      right: 24px;
      z-index: 9998;
      background: rgba(18, 24, 35, 0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: var(--admin-accent);
      border: 1px solid rgba(37, 50, 71, 0.4);
      border-radius: 12px;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 
        0 2px 8px rgba(0, 0, 0, 0.2),
        0 0 24px rgba(0, 166, 255, 0.1);
    }
    
    .admin-panel-button:hover {
      background: rgba(20, 28, 42, 0.9);
      border-color: rgba(0, 166, 255, 0.5);
      transform: translateY(-2px) scale(1.05);
      box-shadow: 
        0 4px 16px rgba(0, 166, 255, 0.3),
        0 0 32px rgba(0, 166, 255, 0.2);
    }
    
    .admin-panel-button.active {
      background: rgba(0, 166, 255, 0.9);
      color: white;
      border-color: var(--admin-accent);
    }
    
    .admin-panel-button svg {
      width: 24px;
      height: 24px;
    }
    
    /* Admin Panel */
    .admin-panel {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9999;
      display: none;
      justify-content: center;
      align-items: center;
    }
    
    .admin-panel-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      animation: fadeIn 0.3s ease;
    }
    
    .admin-panel-content {
      position: relative;
      width: 90%;
      max-width: 1000px;
      height: 85%;
      max-height: 800px;
      background: rgba(13, 14, 15, 0.85);
      backdrop-filter: blur(var(--admin-blur-heavy));
      -webkit-backdrop-filter: blur(var(--admin-blur-heavy));
      border: 1px solid rgba(37, 50, 71, 0.3);
      border-radius: 20px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 
        0 24px 48px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(0, 166, 255, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.02),
        0 0 120px rgba(0, 166, 255, 0.05);
      animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    /* Glass morphism effect */
    .admin-panel-content::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, 
        transparent,
        rgba(255, 255, 255, 0.1) 20%,
        rgba(255, 255, 255, 0.1) 80%,
        transparent
      );
    }
    
    /* Header */
    .admin-panel-header {
      background: rgba(15, 20, 28, 0.6);
      backdrop-filter: blur(var(--admin-blur));
      -webkit-backdrop-filter: blur(var(--admin-blur));
      border-bottom: 1px solid rgba(37, 50, 71, 0.3);
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
    }
    
    .admin-panel-header::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg,
        transparent,
        rgba(0, 166, 255, 0.2) 50%,
        transparent
      );
    }
    
    .admin-panel-header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .admin-panel-logo {
      width: 40px;
      height: 40px;
      background: rgba(0, 166, 255, 0.1);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(0, 166, 255, 0.2);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--admin-accent);
    }
    
    .admin-panel-title h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: rgba(231, 237, 247, 0.95);
      letter-spacing: -0.02em;
      text-shadow: 0 0 20px rgba(0, 166, 255, 0.3);
    }
    
    .admin-panel-subtitle {
      font-size: 12px;
      color: rgba(153, 167, 187, 0.8);
      margin-top: 2px;
    }
    
    .admin-panel-close {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(37, 50, 71, 0.4);
      color: var(--admin-muted);
      width: 36px;
      height: 36px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .admin-panel-close:hover {
      background: rgba(255, 77, 79, 0.1);
      backdrop-filter: blur(12px);
      color: var(--admin-danger);
      border-color: rgba(255, 77, 79, 0.3);
      transform: rotate(90deg);
    }
    
    /* Body */
    .admin-panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      background: transparent;
    }
    
    /* Status Bar */
    .admin-status-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    
    .admin-status-item {
      background: rgba(18, 24, 35, 0.4);
      backdrop-filter: blur(var(--admin-blur));
      -webkit-backdrop-filter: blur(var(--admin-blur));
      border: 1px solid rgba(37, 50, 71, 0.3);
      border-radius: 10px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: all 0.2s ease;
    }
    
    .admin-status-item:hover {
      background: rgba(18, 24, 35, 0.6);
      border-color: rgba(0, 166, 255, 0.3);
      transform: translateY(-2px);
    }
    
    .status-label {
      font-size: 11px;
      color: rgba(153, 167, 187, 0.8);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .status-value {
      font-size: 16px;
      font-weight: 600;
      color: rgba(231, 237, 247, 0.95);
    }
    
    .status-value.active {
      color: var(--admin-ok);
      text-shadow: 0 0 10px rgba(39, 201, 63, 0.5);
    }
    
    /* Sections */
    .admin-section {
      margin-bottom: 24px;
    }
    
    .admin-section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .admin-section-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: rgba(231, 237, 247, 0.9);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .admin-section-line {
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg,
        rgba(37, 50, 71, 0.5),
        transparent
      );
    }
    
    /* Action Buttons */
    .admin-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    
    .admin-action-btn {
      background: rgba(18, 24, 35, 0.4);
      backdrop-filter: blur(var(--admin-blur));
      -webkit-backdrop-filter: blur(var(--admin-blur));
      border: 1px solid rgba(37, 50, 71, 0.3);
      color: rgba(231, 237, 247, 0.9);
      padding: 12px 16px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .admin-action-btn:hover {
      background: rgba(0, 166, 255, 0.1);
      backdrop-filter: blur(var(--admin-blur-heavy));
      border-color: rgba(0, 166, 255, 0.4);
      color: var(--admin-accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 166, 255, 0.2);
    }
    
    .admin-action-btn:active {
      transform: translateY(0);
    }
    
    .admin-action-btn svg {
      opacity: 0.7;
    }
    
    .admin-action-btn:hover svg {
      opacity: 1;
    }
    
    /* Segments Grid */
    .admin-segments-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 12px;
    }
    
    .admin-segment-tile {
      background: rgba(18, 24, 35, 0.4);
      backdrop-filter: blur(var(--admin-blur));
      -webkit-backdrop-filter: blur(var(--admin-blur));
      border: 1px solid rgba(37, 50, 71, 0.3);
      border-radius: 12px;
      padding: 16px 8px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }
    
    .admin-segment-tile::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--segment-color, var(--admin-accent));
      opacity: 0.6;
      transition: all 0.2s ease;
    }
    
    .admin-segment-tile:hover {
      background: rgba(20, 28, 42, 0.6);
      backdrop-filter: blur(var(--admin-blur-heavy));
      border-color: var(--segment-color, var(--admin-accent));
      transform: translateY(-3px) scale(1.05);
      box-shadow: 
        0 8px 16px rgba(0, 0, 0, 0.2),
        0 0 24px var(--segment-color, var(--admin-accent));
    }
    
    .admin-segment-tile:hover::before {
      height: 100%;
      opacity: 0.1;
    }
    
    .admin-segment-tile:active {
      transform: translateY(0) scale(0.98);
    }
    
    .segment-icon {
      margin-bottom: 8px;
      color: var(--admin-accent);
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 0 8px currentColor);
    }
    
    .multiplier-text {
      font-size: 20px;
      font-weight: 700;
      color: rgba(231, 237, 247, 0.95);
      text-shadow: 0 0 10px rgba(0, 166, 255, 0.4);
    }
    
    .segment-name {
      font-size: 14px;
      font-weight: 600;
      color: rgba(231, 237, 247, 0.95);
      margin-bottom: 4px;
    }
    
    .segment-type {
      font-size: 10px;
      color: rgba(153, 167, 187, 0.8);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    /* Force Landing */
    .admin-force-container {
      display: flex;
      gap: 12px;
    }
    
    .admin-select {
      flex: 1;
      padding: 10px 12px;
      background: rgba(18, 24, 35, 0.4);
      backdrop-filter: blur(var(--admin-blur));
      -webkit-backdrop-filter: blur(var(--admin-blur));
      border: 1px solid rgba(37, 50, 71, 0.3);
      border-radius: 10px;
      color: rgba(231, 237, 247, 0.9);
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .admin-select:hover {
      background: rgba(20, 28, 42, 0.6);
      border-color: rgba(0, 166, 255, 0.4);
    }
    
    .admin-select:focus {
      outline: none;
      border-color: var(--admin-accent);
      box-shadow: 
        0 0 0 3px rgba(0, 166, 255, 0.1),
        0 0 20px rgba(0, 166, 255, 0.2);
    }
    
    .admin-select.force-active {
      background: rgba(0, 166, 255, 0.15);
      border-color: rgba(0, 166, 255, 0.5);
    }
    
    .admin-select option {
      background: var(--admin-bg-solid);
      color: var(--admin-text);
    }
    
    .admin-btn-primary {
      padding: 10px 24px;
      background: rgba(0, 166, 255, 0.15);
      backdrop-filter: blur(var(--admin-blur));
      -webkit-backdrop-filter: blur(var(--admin-blur));
      color: var(--admin-accent);
      border: 1px solid rgba(0, 166, 255, 0.3);
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .admin-btn-primary:hover {
      background: rgba(0, 166, 255, 0.25);
      border-color: rgba(0, 166, 255, 0.5);
      transform: translateY(-2px);
      box-shadow: 
        0 4px 12px rgba(0, 166, 255, 0.3),
        0 0 24px rgba(0, 166, 255, 0.2);
    }
    
    .admin-btn-primary:active {
      transform: translateY(0);
    }
    
    /* Console */
    .admin-console {
      background: rgba(13, 14, 15, 0.5);
      backdrop-filter: blur(var(--admin-blur));
      -webkit-backdrop-filter: blur(var(--admin-blur));
      border: 1px solid rgba(37, 50, 71, 0.3);
      border-radius: 10px;
      padding: 12px;
      height: 200px;
      overflow-y: auto;
      font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
      font-size: 12px;
    }
    
    .console-line {
      margin-bottom: 4px;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(255, 255, 255, 0.02);
      border-left: 2px solid transparent;
      transition: all 0.2s ease;
    }
    
    .console-line:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    
    .console-line .time {
      color: rgba(153, 167, 187, 0.7);
      font-size: 11px;
    }
    
    .console-line .message {
      flex: 1;
      color: rgba(231, 237, 247, 0.9);
    }
    
    .console-line.info {
      border-left-color: var(--admin-accent);
      background: rgba(0, 166, 255, 0.05);
    }
    
    .console-line.info .message {
      color: var(--admin-accent);
    }
    
    .console-line.success {
      border-left-color: var(--admin-ok);
      background: rgba(39, 201, 63, 0.05);
    }
    
    .console-line.success .message {
      color: var(--admin-ok);
    }
    
    .console-line.warning {
      border-left-color: var(--admin-warning);
      background: rgba(255, 184, 77, 0.05);
    }
    
    .console-line.warning .message {
      color: var(--admin-warning);
    }
    
    .console-line.error {
      border-left-color: var(--admin-danger);
      background: rgba(255, 77, 79, 0.05);
    }
    
    .console-line.error .message {
      color: var(--admin-danger);
    }
    
    .console-line.welcome {
      color: rgba(153, 167, 187, 0.8);
    }
    
    /* Animations */
    @keyframes fadeIn {
      from { 
        opacity: 0;
      }
      to { 
        opacity: 1;
      }
    }
    
    @keyframes slideUp {
      from {
        transform: translateY(24px) scale(0.95);
        opacity: 0;
      }
      to {
        transform: translateY(0) scale(1);
        opacity: 1;
      }
    }
    
    /* Scrollbar */
    .admin-panel-body::-webkit-scrollbar,
    .admin-console::-webkit-scrollbar {
      width: 6px;
    }
    
    .admin-panel-body::-webkit-scrollbar-track,
    .admin-console::-webkit-scrollbar-track {
      background: rgba(15, 20, 28, 0.3);
      border-radius: 3px;
    }
    
    .admin-panel-body::-webkit-scrollbar-thumb,
    .admin-console::-webkit-scrollbar-thumb {
      background: rgba(37, 50, 71, 0.5);
      border-radius: 3px;
    }
    
    .admin-panel-body::-webkit-scrollbar-thumb:hover,
    .admin-console::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 166, 255, 0.4);
    }
    
    /* Mobile */
    @media (max-width: 768px) {
      .admin-panel-content {
        width: 100%;
        height: 100%;
        border-radius: 0;
        max-height: 100%;
      }
      
      .admin-panel-body {
        padding: 16px;
      }
      
      .admin-segments-grid {
        grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      }
      
      .admin-status-bar {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    
    /* Поддержка для браузеров без backdrop-filter */
    @supports not (backdrop-filter: blur(1px)) {
      .admin-panel-content {
        background: rgba(13, 14, 15, 0.95);
      }
      
      .admin-panel-overlay {
        background: rgba(0, 0, 0, 0.8);
      }
      
      .admin-status-item,
      .admin-action-btn,
      .admin-segment-tile,
      .admin-select,
      .admin-console {
        background: rgba(18, 24, 35, 0.9);
      }
    }
  `;
  
  document.head.appendChild(style);
}
  }
  
  // Инициализация админ-панели при загрузке страницы
  document.addEventListener('DOMContentLoaded', () => {
    // Проверяем наличие TEST_MODE
    if (typeof window.TEST_MODE !== 'undefined' && window.TEST_MODE === true) {
      console.log('[AdminPanel] 🛠️ TEST MODE detected, initializing admin panel...');
      window.adminPanel = new AdminPanel();
    } else {
      console.log('[AdminPanel] Production mode, admin panel disabled');
    }
  });
  
  // Экспортируем для глобального доступа
  window.AdminPanel = AdminPanel;
  
  console.log('[AdminPanel] ✅ Admin panel module loaded');