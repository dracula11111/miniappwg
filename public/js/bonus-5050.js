// bonus-5050.js - MINIMAL VERSION - Just stops the wheel

console.log('[Bonus5050] 📦 Loading minimal 50/50 bonus module');

class Bonus5050 {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onComplete: options.onComplete || (() => {}),
      ...options
    };
    
    console.log('[Bonus5050] ✅ Initialized (minimal version)');
  }
  
  async start() {
    console.log('[Bonus5050] 🎰 Starting bonus - stopping wheel...');
    
    // Показываем overlay (останавливает колесо)
    const overlay = document.getElementById('bonus5050Overlay');
    if (overlay) {
      overlay.style.display = 'flex';
    }
    
    // Ждём 3 секунды
    await this.wait(3000);
    
    // Закрываем overlay
    if (overlay) {
      overlay.style.display = 'none';
    }
    
    // Очищаем контейнер
    this.container.innerHTML = '';
    
    // Вызываем callback
    this.options.onComplete('2x');
    
    console.log('[Bonus5050] ✅ Bonus completed - wheel resumed');
  }
  
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Экспорт для глобального доступа
window.Bonus5050 = Bonus5050;

console.log('[Bonus5050] ✅ Minimal 50/50 bonus module loaded');