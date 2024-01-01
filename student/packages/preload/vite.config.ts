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
    target: "esnext",
    outDir: "../../dist/preload",
    emptyOutDir: true,
    lib: {
      entry: "preload.ts",
      formats: ["cjs"],
      fileName: () => "[name].cjs"
    },
    minify: true,
    sourcemap: "inline",
    rollupOptions: {
      external: ["electron", ...builtinModules, ...Object.keys(pkg.dependencies || {})]
    }
  }
});
