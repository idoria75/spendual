/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Backend target for the dev proxy. Override with API_PROXY_TARGET, for example
// API_PROXY_TARGET=http://backend:3000 if the backend runs in another container.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Dev only. Names allowed in the Host header. Open it by IP, spendual.local or localhost.
    // IP addresses are always allowed by Vite. Add a name here if you use another one.
    allowedHosts: [
      "spendual.local",
      "localhost",
      ...(process.env.VITE_ALLOWED_HOSTS ?? "")
        .split(",")
        .map((h) => h.trim())
        .filter((h) => h !== ""),
    ],
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
