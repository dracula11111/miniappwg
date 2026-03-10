import { defineConfig } from "vite";

const FEATURE_CHUNK_RULES = [
  { name: "feature-wheel", re: /[\\/]public[\\/]js[\\/]features[\\/]wheel[\\/]/ },
  { name: "feature-crash", re: /[\\/]public[\\/]js[\\/]features[\\/]crash[\\/]/ },
  { name: "feature-cases", re: /[\\/]public[\\/]js[\\/]features[\\/]cases[\\/]/ },
  { name: "feature-market", re: /[\\/]public[\\/]js[\\/]features[\\/]market[\\/]/ },
  { name: "feature-profile", re: /[\\/]public[\\/]js[\\/]features[\\/]profile[\\/]/ },
  { name: "feature-tasks", re: /[\\/]public[\\/]js[\\/]features[\\/]tasks[\\/]/ },
  { name: "feature-payments", re: /[\\/]public[\\/]js[\\/]features[\\/]payments[\\/]/ }
];

function resolveFeatureChunk(id) {
  for (const rule of FEATURE_CHUNK_RULES) {
    if (rule.re.test(id)) return rule.name;
  }
  return null;
}

export default defineConfig({
  root: "public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveFeatureChunk(id);
        }
      }
    }
  }
});
