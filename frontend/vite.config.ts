import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  assetsInclude: ["**/*.glb"],
  // Pre-bundle these up front: if Vite discovers one mid-session it re-bundles all deps, and open
  // pages fail with "Failed to fetch dynamically imported module" (504 outdated dep).
  optimizeDeps: { include: ["react-dom", "react-dom/client"] },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    // demo GLBs, metadata and contract fixtures live in ../packages
    fs: { allow: [".", "../packages"] },
    proxy: {
      "/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:8000", changeOrigin: true },
    },
  },
});
