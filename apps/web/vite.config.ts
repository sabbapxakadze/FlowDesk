import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The /api proxy forwards to the Express server in dev, so the browser only
 * ever talks to one origin. That sidesteps CORS entirely during development
 * and mirrors how a reverse proxy will route things in production.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // Socket.IO's default path — needs ws: true explicitly, unlike
      // /api above: a plain HTTP proxy entry doesn't forward the
      // upgrade-to-WebSocket handshake on its own.
      "/socket.io": {
        target: "http://localhost:4000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
