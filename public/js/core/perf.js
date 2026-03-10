(() => {
  const root = document.documentElement;
  if (!root) return;

  const supportsMatchMedia = typeof window.matchMedia === "function";
  const reducedMotionQuery = supportsMatchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  const coarsePointerQuery = supportsMatchMedia
    ? window.matchMedia("(pointer: coarse)")
    : null;

  const deviceMemory = Number(window.navigator?.deviceMemory || 0);
  const hardwareConcurrency = Number(window.navigator?.hardwareConcurrency || 0);
  const saveData = Boolean(window.navigator?.connection?.saveData);

  const isLowPowerDevice =
    saveData ||
    (deviceMemory > 0 && deviceMemory <= 4) ||
    (hardwareConcurrency > 0 && hardwareConcurrency <= 4);

  const applyRuntimeClasses = () => {
    root.classList.toggle("wt-lite", isLowPowerDevice);
    root.classList.toggle("wt-touch", Boolean(coarsePointerQuery?.matches));
    root.classList.toggle("wt-reduced-motion", Boolean(reducedMotionQuery?.matches));
  };

  applyRuntimeClasses();

  if (reducedMotionQuery) {
    if (typeof reducedMotionQuery.addEventListener === "function") {
      reducedMotionQuery.addEventListener("change", applyRuntimeClasses);
    } else if (typeof reducedMotionQuery.addListener === "function") {
      reducedMotionQuery.addListener(applyRuntimeClasses);
    }
  }

  if (coarsePointerQuery) {
    if (typeof coarsePointerQuery.addEventListener === "function") {
      coarsePointerQuery.addEventListener("change", applyRuntimeClasses);
    } else if (typeof coarsePointerQuery.addListener === "function") {
      coarsePointerQuery.addListener(applyRuntimeClasses);
    }
  }

  const shouldSkipLazy = (img) => {
    if (!(img instanceof HTMLImageElement)) return true;

    if (img.id === "userAvatarImg" || img.id === "pillCurrencyIcon" || img.id === "pointer") {
      return true;
    }

    if (img.classList.contains("main-logo")) return true;
    if (img.closest(".topbar, .logo-header, .wheel, .bottom-nav")) return true;

    return false;
  };

  const optimizeImage = (img) => {
    if (!(img instanceof HTMLImageElement)) return;

    if (!img.hasAttribute("decoding")) img.decoding = "async";

    if (!shouldSkipLazy(img)) {
      if (!img.hasAttribute("loading")) img.loading = "lazy";
      if (!img.hasAttribute("fetchpriority")) img.setAttribute("fetchpriority", "low");
    }
  };

  const optimizeImagesIn = (scope) => {
    if (!(scope instanceof Element) && !(scope instanceof Document)) return;

    if (scope instanceof HTMLImageElement) {
      optimizeImage(scope);
      return;
    }

    const imgs = scope.querySelectorAll("img");
    imgs.forEach(optimizeImage);
  };

  const runImageOptimization = () => optimizeImagesIn(document);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runImageOptimization, { once: true });
  } else {
    runImageOptimization();
  }

  window.WT = window.WT || {};
  window.WT.optimizeImages = optimizeImagesIn;
})();
