// bonus-5050.js - COMPLETE FIXED VERSION
// Fixes:
// 1. Wheel stops completely during bonus
// 2. Notifications only show on wheel page
// 3. Wheel waits for bonus completion before resuming

console.log('[Bonus5050] 📦 Loading 50/50 bonus module');

class Bonus5050 {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onComplete: options.onComplete || (() => {}),
      duration: options.duration || 5, // 5 seconds countdown
      ...options
    };
    
    console.log('[Bonus5050] ✅ Initialized');
  }
  
  async start() {
    console.log('[Bonus5050] 🎰 Starting 50/50 bonus...');
    
    // 🔥 STOP THE WHEEL COMPLETELY
    if (typeof window.omega !== 'undefined') {
      window.omega = 0;
      console.log('[Bonus5050] 🛑 Wheel stopped (omega = 0)');
    }
    
    // Set wheel to bonus waiting state
    if (typeof window.phase !== 'undefined') {
      window.phase = 'bonus_waiting';
      console.log('[Bonus5050] ⏸️ Wheel phase set to bonus_waiting');
    }
    
    // Get overlay
    const overlay = document.getElementById('bonus5050Overlay');
    if (!overlay) {
      console.error('[Bonus5050] ❌ Overlay not found!');
      this.options.onComplete('2x');
      return;
    }
    
    // Show overlay with blur effect
    overlay.style.display = 'flex';
    overlay.classList.add('bonus-overlay--active');
    
    // Create countdown UI
    this.createCountdownUI();
    
    // Wait for countdown
    await this.runCountdown();
    
    // Hide overlay
    overlay.classList.remove('bonus-overlay--active');
    await this.wait(300);
    overlay.style.display = 'none';
    this.container.innerHTML = '';
    
    // Call completion callback
    this.options.onComplete('2x');
    
    console.log('[Bonus5050] ✅ Bonus completed - wheel can resume');
  }
  
  createCountdownUI() {
    this.container.innerHTML = `
      <div class="bonus5050-content">
        <div class="bonus5050-title">50 & 50</div>
        <div class="bonus5050-countdown" id="bonus5050Timer">
          <span id="bonus5050CountNumber">${this.options.duration}</span>
        </div>
        <div class="bonus5050-subtitle">Get ready...</div>
      </div>
    `;
  }
  
  async runCountdown() {
    const countNumber = document.getElementById('bonus5050CountNumber');
    if (!countNumber) return;
    
    let remaining = this.options.duration;
    
    return new Promise(resolve => {
      const interval = setInterval(() => {
        remaining--;
        
        if (remaining > 0) {
          countNumber.textContent = remaining;
          // Pulse animation
          countNumber.style.animation = 'none';
          void countNumber.offsetWidth; // Trigger reflow
          countNumber.style.animation = 'bonusCountPulse 0.4s ease';
        } else {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
  }
  
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export globally
window.Bonus5050 = Bonus5050;

console.log('[Bonus5050] ✅ 50/50 bonus module loaded');

// ============================================
// BONUS 50/50 STYLES - Inject directly
// ============================================
if (!document.getElementById('bonus5050-styles')) {
  const style = document.createElement('style');
  style.id = 'bonus5050-styles';
  style.textContent = `
    /* Overlay */
    .bonus-overlay {
      position: fixed;
      inset: 0;
      z-index: 9000;
      display: none;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    
    .bonus-overlay--active {
      opacity: 1;
      pointer-events: auto;
    }
    
    /* Blurred backdrop */
    .bonus-overlay__blur-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    
    /* Content container */
    .bonus-container {
      position: relative;
      z-index: 1;
    }
    
    /* 50/50 Content */
    .bonus5050-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      animation: bonus5050FadeIn 0.5s ease;
    }
    
    /* Title */
    .bonus5050-title {
      font-size: 72px;
      font-weight: 900;
      color: #ffffff;
      text-shadow: 
        0 0 20px rgba(255, 255, 255, 0.5),
        0 4px 16px rgba(0, 0, 0, 0.8);
      letter-spacing: 4px;
      animation: bonus5050Glow 2s ease-in-out infinite;
    }
    
    /* Countdown circle */
    .bonus5050-countdown {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      border: 4px solid rgba(255, 255, 255, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 
        0 0 40px rgba(255, 255, 255, 0.2),
        inset 0 0 20px rgba(255, 255, 255, 0.1);
    }
    
    #bonus5050CountNumber {
      font-size: 64px;
      font-weight: 900;
      color: #ffffff;
      text-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
    }
    
    /* Subtitle */
    .bonus5050-subtitle {
      font-size: 20px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.7);
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    /* Animations */
    @keyframes bonus5050FadeIn {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    @keyframes bonus5050Glow {
      0%, 100% {
        text-shadow: 
          0 0 20px rgba(255, 255, 255, 0.5),
          0 4px 16px rgba(0, 0, 0, 0.8);
      }
      50% {
        text-shadow: 
          0 0 40px rgba(255, 255, 255, 0.8),
          0 0 60px rgba(255, 255, 255, 0.4),
          0 4px 16px rgba(0, 0, 0, 0.8);
      }
    }
    
    @keyframes bonusCountPulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.2);
      }
    }
    
    /* Mobile responsiveness */
    @media (max-width: 420px) {
      .bonus5050-title {
        font-size: 56px;
      }
      
      .bonus5050-countdown {
        width: 100px;
        height: 100px;
      }
      
      #bonus5050CountNumber {
        font-size: 52px;
      }
      
      .bonus5050-subtitle {
        font-size: 16px;
      }
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .bonus5050-content,
      .bonus5050-title,
      #bonus5050CountNumber {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
  console.log('[Bonus5050] ✅ Styles injected');
}