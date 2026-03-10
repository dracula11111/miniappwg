import { defineConfig } from "vite";

export default defineConfig({
  root: "public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false
  }
});
