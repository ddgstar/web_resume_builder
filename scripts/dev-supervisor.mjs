import { spawn } from "node:child_process";

const processes = [
  {
    name: "backend",
    command: "npm",
    args: ["--prefix", "Backend", "run", "dev"],
    readyURL: "http://localhost:8080/api/health"
  },
  {
    name: "frontend",
    command: "npm",
    args: ["--prefix", "FrontEnd", "run", "dev"],
    readyURL: "http://localhost:5173"
  }
];

const children = new Map();
const healthFailures = new Map();
let shuttingDown = false;

function log(name, message) {
  const stamp = new Date().toLocaleTimeString();
  process.stdout.write(`[${stamp}] [${name}] ${message}\n`);
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

function start(spec, restartCount = 0) {
  if (shuttingDown) return;
  const child = spawn(spec.command, spec.args, {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  children.set(spec.name, child);
  healthFailures.set(spec.name, 0);
  log(spec.name, `started pid=${child.pid}`);
  prefixStream(spec.name, child.stdout, process.stdout.write.bind(process.stdout));
  prefixStream(spec.name, child.stderr, process.stderr.write.bind(process.stderr));

  child.on("exit", (code, signal) => {
    children.delete(spec.name);
    if (shuttingDown) return;
    const delay = Math.min(20_000, 1_000 * 2 ** Math.min(restartCount, 5));
    log(spec.name, `exited code=${code ?? "none"} signal=${signal ?? "none"}; restarting in ${Math.round(delay / 1000)}s`);
    setTimeout(() => start(spec, restartCount + 1), delay);
  });
}

async function healthLoop() {
  while (!shuttingDown) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    for (const spec of processes) {
      try {
        const response = await fetch(spec.readyURL, { signal: AbortSignal.timeout(2500) });
        if (!response.ok) {
          recordHealthFailure(spec, `health check returned ${response.status}`);
        } else {
          healthFailures.set(spec.name, 0);
        }
      } catch (error) {
        recordHealthFailure(spec, `health check failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }
}

function recordHealthFailure(spec, message) {
  const failures = (healthFailures.get(spec.name) ?? 0) + 1;
  healthFailures.set(spec.name, failures);
  log(spec.name, `${message} (${failures}/3)`);
  if (failures < 3) return;

  const child = children.get(spec.name);
  if (!child) return;
  log(spec.name, "health check failed repeatedly; restarting child process");
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 3000).unref();
  healthFailures.set(spec.name, 0);
}

function stopAll(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("supervisor", `received ${signal}; stopping child processes`);
  for (const child of children.values()) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 1200).unref();
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));

for (const spec of processes) start(spec);
void healthLoop();
