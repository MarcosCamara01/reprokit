import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import type { HarnessEvent } from "./types";

const STRIP_ENV = [
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_CLIENT_SECRET",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "MACHINE_JWT_SECRET",
  "GITHUB_WEBHOOK_SECRET",
  "CRON_SECRET",
];

export function sanitizedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of STRIP_ENV) delete env[key];
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

export function gitAuthEnv(token: string): NodeJS.ProcessEnv {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    ...sanitizedEnv(),
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    GIT_ASKPASS: "echo",
  };
}

export async function which(bin: string, extraPath?: string): Promise<string | null> {
  // An explicit override wins: if it is missing, do not fall through to PATH.
  if (extraPath) return existsSync(extraPath) ? extraPath : null;
  if (bin.includes("/") || bin.includes("\\")) {
    return existsSync(bin) ? bin : null;
  }

  const pathDirs = (process.env.PATH ?? "").split(delimiter);
  for (const dir of pathDirs) {
    if (!dir) continue;
    const unix = `${dir}/${bin}`;
    const win = `${dir}\\${bin}.exe`;
    if (existsSync(unix)) return unix;
    if (existsSync(win)) return win;
  }
  return null;
}

export function spawnCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}): AsyncIterable<HarnessEvent> {
  return iterateSpawn(input);
}

async function* iterateSpawn(input: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}): AsyncGenerator<HarnessEvent> {
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env ?? sanitizedEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const chunks: HarnessEvent[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  let exitCode: number | null = null;

  const push = (event: HarnessEvent) => {
    chunks.push(event);
    wake?.();
  };

  child.stdout?.on("data", (buf: Buffer) => {
    push({ type: "log", stream: "stdout", chunk: buf.toString("utf8") });
  });
  child.stderr?.on("data", (buf: Buffer) => {
    push({ type: "log", stream: "stderr", chunk: buf.toString("utf8") });
  });
  child.on("error", (error) => {
    push({ type: "log", stream: "stderr", chunk: error.message });
    exitCode = 127;
    closed = true;
    wake?.();
  });
  child.on("close", (code) => {
    exitCode = code ?? 1;
    closed = true;
    wake?.();
  });

  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    push({ type: "progress", message: `harness timed out after ${input.timeoutMs}ms` });
  }, input.timeoutMs);

  try {
    while (!closed || chunks.length > 0) {
      if (chunks.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
        continue;
      }
      const next = chunks.shift();
      if (next) yield next;
    }
    yield { type: "exit", code: exitCode ?? 1 };
  } finally {
    clearTimeout(timer);
    if (!child.killed) child.kill("SIGKILL");
  }
}

export async function runVersion(bin: string, args = ["--version"]): Promise<{
  available: boolean;
  version?: string;
  loggedIn: boolean;
  detail: string;
}> {
  const resolved = existsSync(bin) ? bin : await which(bin);
  if (!resolved) {
    return { available: false, loggedIn: false, detail: `${bin} not found on PATH` };
  }

  const child = spawn(resolved, args, {
    env: sanitizedEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout?.on("data", (buf: Buffer) => {
    out += buf.toString("utf8");
  });
  child.stderr?.on("data", (buf: Buffer) => {
    err += buf.toString("utf8");
  });
  const code: number = await new Promise((resolve) => {
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(124);
    }, 8_000);
    child.on("close", (value) => {
      clearTimeout(t);
      resolve(value ?? 1);
    });
    child.on("error", () => {
      clearTimeout(t);
      resolve(127);
    });
  });
  const detail = `${out}\n${err}`.trim();
  const lower = detail.toLowerCase();
  const loggedOut =
    lower.includes("not logged") ||
    lower.includes("please login") ||
    lower.includes("please log in") ||
    lower.includes("unauthorized") ||
    lower.includes("auth required");
  const version = out.trim().split("\n")[0]?.trim() || undefined;
  return {
    available: code === 0 || Boolean(version),
    version,
    loggedIn: !loggedOut && code !== 127,
    detail,
  };
}
