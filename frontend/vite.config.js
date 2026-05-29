import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// This config is ONLY used during development ("npm run dev").
// On the production server, nginx serves the built files and proxies
// /api and /socket.io — Vite is not involved at all.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    host: true, // allows access from other devices on the same network during dev
    proxy: {
      // Proxy /api calls to the backend during development
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      // Proxy /socket.io so WebSocket upgrades work through the Vite dev server
      // configure() swallows ECONNRESET — these happen when a phone disconnects
      // or Windows briefly drops the adapter; the app keeps working fine.
      "/socket.io": {
        target: "http://localhost:5000",
        changeOrigin: true,
        ws: true,
         configure: (proxy) => {
          proxy.on("error", (err) => {
            if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") return; // suppress noise
            console.error("[vite proxy] unexpected error:", err.message);
          });
          proxy.on("proxyReqWsError", (err) => {
            if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") return;
            console.error("[vite proxy ws] unexpected error:", err.message);
          });
        },
      },
    },
  },
});
