import express from "express";
import fs from "node:fs";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import routes from "./routes/index.js";
import { errorHandler } from "./utils/errors.js";
import { ensureSettings, recoverInterruptedJobs } from "./services/generationRunner.js";
import { bootstrapInitialAdmin, pruneExpiredSessions } from "./services/auth.js";

const app = express();
let initialization: Promise<void> | null = null;

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: corsOrigin(), credentials: true }));
app.disable("etag");
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({
  autoLogging: {
    ignore: (req) => req.url === "/api/health"
  }
}));
app.use(rateLimit({
  windowMs: 60_000,
  limit: env.API_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(async (_req, _res, next) => {
  try {
    await initializeApp();
    next();
  } catch (error) {
    next(error);
  }
});
app.use("/api", routes);

if (env.FRONTEND_DIST_DIR) {
  const frontendDistDir = env.FRONTEND_DIST_DIR;
  const indexHTML = `${frontendDistDir}/index.html`;
  if (fs.existsSync(indexHTML)) {
    app.use(express.static(frontendDistDir, {
      etag: false,
      index: false,
      maxAge: env.NODE_ENV === "production" ? "1h" : 0
    }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        return res.status(404).json({ error: "NOT_FOUND", message: "API route not found." });
      }
      return res.sendFile(indexHTML, { headers: { "Cache-Control": "no-store" } }, (error) => {
        if (error) next(error);
      });
    });
  } else {
    console.warn(`FRONTEND_DIST_DIR is set, but index.html was not found at ${indexHTML}`);
  }
}

app.use(errorHandler);

export async function initializeApp() {
  initialization ??= bootstrap();
  return initialization;
}

async function bootstrap() {
  await bootstrapInitialAdmin();
  await pruneExpiredSessions();
  await ensureSettings();
  if (!env.VERCEL) {
    await recoverInterruptedJobs();
  }
}

function corsOrigin() {
  const origins = new Set([env.WEB_ORIGIN]);
  if (env.VERCEL_URL) {
    origins.add(`https://${env.VERCEL_URL}`);
  }
  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || origins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

export { prisma };
export default app;
