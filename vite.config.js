import { defineConfig } from "vite";

export default defineConfig({
  root: "public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/public/js/")) return undefined;
          if (id.includes("/features/wheel/")) return "feature-wheel";
          if (id.includes("/features/cases/")) return "feature-cases";
          if (id.includes("/features/crash/")) return "feature-crash";
          if (id.includes("/features/market/")) return "feature-market";
          if (id.includes("/features/profile/")) return "feature-profile";
          if (id.includes("/features/tasks/")) return "feature-tasks";
          if (id.includes("/features/combo/")) return "feature-combo";
          if (id.includes("/core/")) return "core";
          if (id.includes("/shared/")) return "shared";
          return undefined;
        }
      }
    }
  }
});
