// backend/server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import requestRoutes from "./routes/requestRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import expressListRoutes from "express-list-routes";
import aiRoutes from './routes/aiRoutes.js';
import Notification from "./models/Notification.js";
import setupSocketHandlers from './socket.js';
import notificationRoutes from "./routes/notificationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";

dotenv.config();
connectDB();

const app = express();
const httpServer = createServer(app);

// ========== CORS MIDDLEWARE (must come before routes) ==========
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser (cap at 1 MB to prevent payload abuse)
app.use(express.json({ limit: "1mb" }));

// 👇 SETUP SOCKET.IO
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// 👇 DECLARE connectedUsers ONCE
const connectedUsers = new Map();

// Socket middleware — throttle: each IP allowed max 10 new connections per 10 s
const connectionTimestamps = new Map();
io.use((socket, next) => {
  const ip = socket.handshake.address;
  const now = Date.now();
  const WINDOW = 10_000; // 10 seconds
  const MAX_CONNECTS = 10;

  if (!connectionTimestamps.has(ip)) connectionTimestamps.set(ip, []);
  const timestamps = connectionTimestamps.get(ip).filter(t => now - t < WINDOW);
  timestamps.push(now);
  connectionTimestamps.set(ip, timestamps);

  if (timestamps.length > MAX_CONNECTS) {
    console.warn(`⚠️  Rate limit hit for IP ${ip} — ${timestamps.length} connections in 10s`);
    return next(new Error("Too many connections"));
  }
  next();
});

// 👇 SETUP SOCKET HANDLERS (imported from socket.js)
setupSocketHandlers(io, connectedUsers);

// 👇 MAKE IO AND CONNECTED USERS AVAILABLE IN ROUTES
app.set("io", io);
app.set("connectedUsers", connectedUsers);

// 🌍 Test route
app.get("/", (req, res) => {
  res.send("✅ ITSolve Backend is running...");
});

// 🛠️ API Routes
console.log("🔹 Loading routes...");
app.use("/api/auth", authRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use("/api/messages", messageRoutes);
console.log("✅ Routes loaded!");

// ── Global Express error handler ────────────────────────────────────────────
// Must be defined AFTER all routes. Catches any error passed via next(err)
// or thrown inside async route handlers (Express 5 propagates them automatically).
app.use((err, req, res, next) => {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || "An unexpected error occurred";

  // Never leak stack traces to the client in production
  if (process.env.NODE_ENV !== "production") {
    console.error("💥 Unhandled route error:", err);
  } else {
    console.error(`💥 [${new Date().toISOString()}] ${status} ${req.method} ${req.url} — ${message}`);
  }

  // Avoid sending headers twice (e.g. if response already started streaming)
  if (res.headersSent) return next(err);

  res.status(status).json({ message });
});

// ── Process-level safety nets ────────────────────────────────────────────────
// These catch bugs that slip past Express (e.g. errors inside socket callbacks,
// setTimeout handlers, or any code outside the request lifecycle).

process.on("uncaughtException", (err) => {
  console.error(`💥 [${new Date().toISOString()}] uncaughtException:`, err.message, err.stack);
  // Give the process 500 ms to flush logs, then exit so the process manager
  // (PM2, systemd, Docker restart policy) can bring it back up cleanly.
  setTimeout(() => process.exit(1), 500);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(`💥 [${new Date().toISOString()}] unhandledRejection at:`, promise, "reason:", reason);
  // Do NOT exit here — unhandled promise rejections are often recoverable.
  // The error is logged so you can fix it, but the server keeps running.
});

// ── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
  if (process.env.NODE_ENV !== "production") {
    console.log("📜 Available Routes:");
    expressListRoutes(app, { prefix: "" });
  }
});