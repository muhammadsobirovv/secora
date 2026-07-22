import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri-specific Vite config: fixed dev port matching tauri.conf.json's
// devUrl, HMR over a clean port so it doesn't collide with apps/web's
// dev server (3001) or apps/api's (3000), and `strictPort` so Tauri
// never silently binds to a different port than the one baked into the
// window's initial URL.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    watch: {
      // Ignore the Rust half — Cargo's own file-watching (via
      // `cargo watch` under `tauri dev`) handles src-tauri; re-triggering
      // Vite's HMR on every `cargo check` artifact write is just noise.
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: "dist",
  },
});
