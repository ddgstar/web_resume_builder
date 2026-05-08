import app, { initializeApp, prisma } from "./app.js";
import { env } from "./config/env.js";

await initializeApp();

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
