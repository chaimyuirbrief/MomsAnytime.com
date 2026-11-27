import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  // `pnpm dev` and `pnpm preview` serve the whole site with no CAPTCHA wall
  // (they don't run worker.ts), so they listen on this machine only, never on
  // every network interface. To try the site from a phone on the same
  // network, pass `--host` for that one run: `pnpm dev --host`.
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: "localhost",
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    host: "localhost",
  },
});
