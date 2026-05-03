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

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
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

await bootstrapInitialAdmin();
await pruneExpiredSessions();
await ensureSettings();
await recoverInterruptedJobs();

const server = app.listen(env.PORT, () => {
  console.log(`AutoResumeBuilder API listening on http://localhost:${env.PORT}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error("Server listener failed", error);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down AutoResumeBuilder API.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception", error);
  process.exit(1);
});
