// public/js/splash.js - FIXED (No Overflow)
(function () {
  console.log('[SPLASH] 🎨 Initializing splash (1.2s)');

  const splash = document.getElementById('splash');
  if (!splash) {
    console.warn('[SPLASH] Splash element not found');
    return;
  }

  const fill = document.getElementById('splash-fill');
  const percentEl = document.getElementById('splash-percent');
  
  if (!fill) {
    console.warn('[SPLASH] Progress fill element not found');
    return;
  }

  // ====== CONFIG ======
  const TOTAL_DURATION = 1200; // 1.2 seconds
  const HIDE_DELAY = 200;
  const REMOVE_DELAY = 300;

  let currentProgress = 0;
  let isComplete = false;
  let startTime = performance.now();
  let animationFrame = null;

  // ====== PROGRESS STAGES ======
  const stages = [
    { percent: 20, time: 150 },
    { percent: 40, time: 300 },
    { percent: 55, time: 500 },
    { percent: 70, time: 700 },
    { percent: 85, time: 900 },
    { percent: 95, time: 1100 },
    { percent: 100, time: 1200 }
  ];

  // ====== CALCULATE PROGRESS ======
  function calculateProgress(elapsed) {
    // 🔥 FIX: Cap at 100%
    if (elapsed >= TOTAL_DURATION) {
      return 100;
    }

    let prevStage = { percent: 0, time: 0 };
    let nextStage = stages[0];

    for (let i = 0; i < stages.length; i++) {
      if (elapsed < stages[i].time) {
        nextStage = stages[i];
        if (i > 0) prevStage = stages[i - 1];
        break;
      }
      prevStage = stages[i];
    }

    const stageDuration = nextStage.time - prevStage.time;
    const stageElapsed = elapsed - prevStage.time;
    const stageProgress = Math.min(1, stageElapsed / stageDuration); // 🔥 FIX: Cap at 1

    const easedProgress = easeInOutCubic(stageProgress);
    
    const percentDiff = nextStage.percent - prevStage.percent;
    const progress = prevStage.percent + (percentDiff * easedProgress);

    // 🔥 FIX: Strict clamping
    return Math.min(100, Math.max(0, progress));
  }

  // ====== EASING ======
  function easeInOutCubic(t) {
    // 🔥 FIX: Ensure t is between 0 and 1
    t = Math.min(1, Math.max(0, t));
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ====== UPDATE UI ======
  function updateUI(progress) {
    // 🔥 FIX: Strict clamping before display
    const clampedProgress = Math.min(100, Math.max(0, progress));
    const p = Math.round(clampedProgress);
    
    // 🔥 FIX: Set width with explicit bounds
    fill.style.width = p + '%';
    
    if (percentEl && !percentEl.hidden) {
      percentEl.textContent = p + '%';
    }

    // Debug: warn if trying to overflow
    if (progress > 100) {
      console.warn('[SPLASH] ⚠️ Progress overflow prevented:', progress, '-> 100%');
    }
  }

  // ====== ANIMATE ======
  function animate() {
    if (isComplete) return;

    const elapsed = performance.now() - startTime;
    const progress = calculateProgress(elapsed);

    currentProgress = progress;
    updateUI(progress);

    if (progress >= 100 || elapsed >= TOTAL_DURATION) {
      completeSplash();
      return;
    }

    animationFrame = requestAnimationFrame(animate);
  }

  // ====== COMPLETE ======
  function completeSplash() {
    if (isComplete) return;
    
    console.log('[SPLASH] ✅ Complete! (', Math.round(performance.now() - startTime), 'ms)');
    
    isComplete = true;
    
    // 🔥 FIX: Final update with strict 100%
    currentProgress = 100;
    updateUI(100);
    
    setTimeout(() => {
      splash.classList.add('splash--hide');
      
      setTimeout(() => {
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }
        splash.remove();
        console.log('[SPLASH] Removed from DOM');
        
        window.dispatchEvent(new Event('splash:complete'));
      }, REMOVE_DELAY);
    }, HIDE_DELAY);
  }

  // ====== PUBLIC API ======
  window.setSplashProgress = function (p) {
    console.log('[SPLASH] Manual progress ignored in timed mode:', p + '%');
  };

  window.completeSplash = completeSplash;

  // ====== LOAD EVENT ======
  let loadComplete = false;
  
  window.addEventListener('load', () => {
    loadComplete = true;
    console.log('[SPLASH] Page loaded at', Math.round(performance.now() - startTime), 'ms');
    
    const elapsed = performance.now() - startTime;
    if (elapsed >= TOTAL_DURATION) {
      completeSplash();
    }
  });

  // ====== SAFETY TIMEOUT ======
  const safetyTimeout = setTimeout(() => {
    if (!isComplete) {
      console.warn('[SPLASH] ⏱️ Safety timeout - force complete');
      completeSplash();
    }
  }, 3000);

  // ====== START ======
  console.log('[SPLASH] Starting animation (target: ' + TOTAL_DURATION + 'ms)');
  startTime = performance.now();
  
  // 🔥 FIX: Start from 0
  fill.style.width = '0%';
  
  animate();

  // ====== EXPORT ======
  window.WTSplash = {
    complete: completeSplash,
    getCurrentProgress: () => Math.min(100, Math.round(currentProgress)),
    getElapsedTime: () => Math.round(performance.now() - startTime),
    getDuration: () => TOTAL_DURATION
  };

  // ====== DEBUG ======
  if (window.location.search.includes('debug')) {
    console.log('[SPLASH] Debug mode enabled');
    if (percentEl) percentEl.hidden = false;
    
    const debugInterval = setInterval(() => {
      if (isComplete) {
        clearInterval(debugInterval);
        return;
      }
      const elapsed = performance.now() - startTime;
      console.log('[SPLASH] Progress:', Math.round(currentProgress) + '%', 'Time:', Math.round(elapsed) + 'ms');
    }, 100);
  }

  console.log('[SPLASH] ✅ Initialized');
})();