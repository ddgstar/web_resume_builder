import { spawn } from "node:child_process";

const root = new URL("..", import.meta.url);
const healthURL = process.env.HEALTH_URL ?? "http://127.0.0.1:8080/api/health";
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "production",
  PORT: process.env.PORT ?? "8080",
  FRONTEND_DIST_DIR: process.env.FRONTEND_DIST_DIR ?? new URL("../FrontEnd/dist", import.meta.url).pathname
};

let child;
let shuttingDown = false;
let restartCount = 0;
let healthFailures = 0;

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] [prod-supervisor] ${message}\n`);
}

function prefixStream(name, stream, write) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) write(`[${name}] ${line}\n`);
    }
  });
}

function start() {
  if (shuttingDown) return;
  child = spawn("node", ["dist/server.js"], {
    cwd: new URL("../Backend", import.meta.url),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  log(`started backend pid=${child.pid}`);
  prefixStream("backend", child.stdout, process.stdout.write.bind(process.stdout));
  prefixStream("backend", child.stderr, process.stderr.write.bind(process.stderr));

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(restartCount, 5));
    log(`backend exited code=${code ?? "none"} signal=${signal ?? "none"}; restarting in ${Math.round(delay / 1000)}s`);
    restartCount += 1;
    setTimeout(start, delay);
  });
}

async function healthLoop() {
  while (!shuttingDown) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    if (!child || child.exitCode !== null) continue;

    try {
      const response = await fetch(healthURL, { signal: AbortSignal.timeout(4_000) });
      if (!response.ok) {
        recordHealthFailure(`health returned ${response.status}`);
      } else {
        healthFailures = 0;
        restartCount = 0;
      }
    } catch (error) {
      recordHealthFailure(`health failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

function recordHealthFailure(message) {
  healthFailures += 1;
  log(`${message} (${healthFailures}/3)`);
  if (healthFailures < 3 || !child) return;
  log("health failed repeatedly; restarting backend");
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child && !child.killed) child.kill("SIGKILL");
  }, 5_000).unref();
  healthFailures = 0;
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}; stopping`);
  if (child) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
void healthLoop();
