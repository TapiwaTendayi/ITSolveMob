// frontend/src/utils/socket.js
import { io } from "socket.io-client";

let socket = null;

// For a local internal server deployment, the frontend and backend run on
// the same machine behind nginx. The browser connects to socket.io using
// the same IP/hostname it used to load the page — nginx proxies /socket.io
// to the backend on port 5000.
//
// During development on a developer's laptop, the Vite dev server runs on
// a different port (8080) from the backend (5000), so we connect directly
// to localhost:5000 for socket.io.
const getSocketURL = () => {
  const hostname = window.location.hostname;

  // Development (running via "npm run dev")
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }

  // Production (served via nginx on the company's local server).
  // Empty string means "same origin as the page" — nginx handles the proxy.
  return "";
};

export const connectSocket = (userId, role) => {
  const SOCKET_URL = getSocketURL();

  // If socket exists and is connected, just re-register
  if (socket && socket.connected) {
    socket.emit("register", userId, role);
    return socket;
  }

  // If socket exists but disconnected, reconnect
  if (socket && !socket.connected) {
    socket.connect();
    return socket;
  }

  // Create new socket connection
  socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    randomizationFactor: 0.5,
  });

  socket.on("connect", () => {
    socket.emit("register", userId, role);
  });

  socket.on("registered", (data) => {
    console.log("✅ Socket registered:", data);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Socket connection error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("🔌 Socket disconnected:", reason);
  });

  // Server fires this when an admin soft-deletes the logged-in user
  socket.on("force-logout", ({ message } = {}) => {
    socket.disconnect();
    window.dispatchEvent(
      new CustomEvent("itsolve:force-logout", { detail: { message } })
    );
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;
