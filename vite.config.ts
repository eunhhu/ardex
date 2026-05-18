import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: "web",
  plugins: [preact()],
  build: {
    outDir: "../web-dist",
    emptyOutDir: true,
  },
});
