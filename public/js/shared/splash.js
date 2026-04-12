// public/js/shared/splash.js
(function () {
  const splash = document.getElementById("splash");
  if (!splash) return;

  const fill = document.getElementById("splash-fill");
  const percentEl = document.getElementById("splash-percent");
  const canRenderProgress = !!fill;

  const TOTAL_DURATION = 1200;
  const HIDE_DELAY = 200;
  const REMOVE_DELAY = 300;
  const FORCE_COMPLETE_MS = 6500;

  const stages = [
    { percent: 20, time: 150 },
    { percent: 40, time: 300 },
    { percent: 55, time: 500 },
    { percent: 70, time: 700 },
    { percent: 85, time: 900 },
    { percent: 95, time: 1100 },
    { percent: 100, time: 1200 }
  ];

  let currentProgress = 0;
  let isComplete = false;
  let startTime = performance.now();
  let animationFrame = 0;
  let forceTimer = 0;
  let loadComplete = document.readyState === "complete";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeInOutCubic(t) {
    const v = clamp(t, 0, 1);
    return v < 0.5
      ? 4 * v * v * v
      : 1 - Math.pow(-2 * v + 2, 3) / 2;
  }

  function calculateProgress(elapsed) {
    if (elapsed >= TOTAL_DURATION) return 100;

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

    const stageDuration = Math.max(1, nextStage.time - prevStage.time);
    const stageElapsed = elapsed - prevStage.time;
    const stageProgress = clamp(stageElapsed / stageDuration, 0, 1);
    const easedProgress = easeInOutCubic(stageProgress);
    const percentDiff = nextStage.percent - prevStage.percent;

    return clamp(prevStage.percent + (percentDiff * easedProgress), 0, 100);
  }

  function updateUI(progress) {
    const p = Math.round(clamp(progress, 0, 100));
    if (canRenderProgress) {
      fill.style.width = p + "%";
    }
    if (percentEl && !percentEl.hidden) {
      percentEl.textContent = p + "%";
    }
  }

  function removeSplashNow() {
    try {
      splash.remove();
    } catch {
      splash.style.display = "none";
    }
    window.dispatchEvent(new Event("splash:complete"));
  }

  function completeSplash() {
    if (isComplete) return;

    isComplete = true;
    currentProgress = 100;
    updateUI(100);

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    if (forceTimer) {
      clearTimeout(forceTimer);
      forceTimer = 0;
    }

    setTimeout(() => {
      splash.classList.add("splash--hide");
      setTimeout(removeSplashNow, REMOVE_DELAY);
    }, HIDE_DELAY);
  }

  function forceComplete(reason) {
    if (isComplete) return;
    try {
      console.warn("[SPLASH] Force complete:", reason);
    } catch {}
    completeSplash();
  }

  function animate() {
    if (isComplete) return;

    const elapsed = performance.now() - startTime;
    const progress = calculateProgress(elapsed);
    const minDurationReached = elapsed >= TOTAL_DURATION || progress >= 100;
    const uiProgress = loadComplete ? progress : Math.min(progress, 98);

    currentProgress = uiProgress;
    updateUI(uiProgress);

    if (minDurationReached && loadComplete) {
      completeSplash();
      return;
    }

    animationFrame = requestAnimationFrame(animate);
  }

  if (!canRenderProgress) {
    try {
      console.warn("[SPLASH] #splash-fill not found, running fallback mode");
    } catch {}
  } else {
    fill.style.width = "0%";
  }

  window.addEventListener("load", () => {
    loadComplete = true;
    const elapsed = performance.now() - startTime;
    if (elapsed >= TOTAL_DURATION || currentProgress >= 98) {
      completeSplash();
    }
  });

  window.addEventListener("error", () => {
    setTimeout(() => forceComplete("window error"), 0);
  }, { once: true });

  window.addEventListener("unhandledrejection", () => {
    setTimeout(() => forceComplete("unhandled rejection"), 0);
  }, { once: true });

  forceTimer = setTimeout(() => {
    forceComplete("timeout");
  }, FORCE_COMPLETE_MS);

  startTime = performance.now();
  animate();

  window.setSplashProgress = function () {};
  window.completeSplash = completeSplash;
  window.WTSplash = {
    complete: completeSplash,
    getCurrentProgress: () => Math.min(100, Math.round(currentProgress)),
    getElapsedTime: () => Math.round(performance.now() - startTime),
    getDuration: () => TOTAL_DURATION
  };
})();
