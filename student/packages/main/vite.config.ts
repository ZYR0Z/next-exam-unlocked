import { builtinModules } from "module";
import { defineConfig } from "vite";
import pkg from "../../package.json";

export default defineConfig({
  root: __dirname,
  // CHANGED: to remove build error
  define: {
    __VUE_PROD_DEVTOOLS__: "false"
  },
  build: {
    outDir: "../../dist/main",
    emptyOutDir: true,
    lib: {
      entry: "main.ts",
      formats: ["cjs"],
      fileName: () => "[name].cjs"
    },
    minify: true,
    sourcemap: true,
    rollupOptions: {
      external: ["electron", ...builtinModules, ...Object.keys(pkg.dependencies || {})]
    }
  }
});
