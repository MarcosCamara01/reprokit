import { spawn } from "node:child_process";
import { redactSecrets } from "./redact-secrets.js";

export interface SafeExecOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Extra env merged on top of a sanitized base. */
  env?: Record<string, string | undefined>;
  /** Max bytes to retain per stream (older bytes dropped). Default 5 MiB. */
  maxBuffer?: number;
  /** When false, the command is run even if it matches a destructive pattern. Default true. */
  guard?: boolean;
  input?: string;
}

export interface SafeExecResult {
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export class UnsafeCommandError extends Error {
  constructor(public readonly reason: string) {
    super(`Refused to run unsafe command: ${reason}`);
    this.name = "UnsafeCommandError";
  }
}

/**
 * Patterns we will never execute. The agent orchestration layer should never
 * generate these, but workers and the model can — this is the last line of defense.
 * Matched against the normalized `${bin} ${args.join(" ")}` string.
 */
const DESTRUCTIVE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i, reason: "rm -rf" },
  { re: /\brm\s+-[a-z]*r\b.*(\/|~|\*)/i, reason: "recursive rm of broad path" },
  { re: /\bgit\s+push\b.*(--force\b|-f\b|\+)/i, reason: "git push --force" },
  { re: /\bgit\s+reset\s+--hard\b/i, reason: "git reset --hard" },
  { re: /\bgit\s+clean\s+-[a-z]*f/i, reason: "git clean -f" },
  { re: /\b(mkfs|dd)\b/i, reason: "disk-level command" },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, reason: "power command" },
  { re: /\b(drop\s+database|drop\s+table|truncate\s+table)\b/i, reason: "destructive SQL" },
  { re: /:\(\)\s*\{.*\}\s*;\s*:/, reason: "fork bomb" },
  { re: />\s*\/dev\/sd[a-z]/i, reason: "write to raw disk" },
  { re: /\b(curl|wget)\b.*\|\s*(sh|bash)\b/i, reason: "pipe-to-shell" },
];

export function assertSafeCommand(bin: string, args: string[]): void {
  const normalized = `${bin} ${args.join(" ")}`;
  for (const { re, reason } of DESTRUCTIVE_PATTERNS) {
    if (re.test(normalized)) throw new UnsafeCommandError(reason);
  }
}

/**
 * Build a sanitized environment for child processes. We strip the most
 * sensitive variables so they can't leak into worker output, but keep PATH
 * and friends so tooling works.
 */
function sanitizedEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env };
  const STRIP = [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "GITHUB_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "AI_GATEWAY_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "DATABASE_URL",
    "AWS_SECRET_ACCESS_KEY",
  ];
  for (const k of STRIP) delete base[k];
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) delete base[k];
      else base[k] = v;
    }
  }
  return base;
}

/**
 * Run a command without a shell (no string interpolation / injection surface).
 * Always returns a result — non-zero exit codes are not thrown. Throws only on
 * a refused (unsafe) command or a spawn failure.
 */
export function safeExec(
  bin: string,
  args: string[] = [],
  options: SafeExecOptions = {},
): Promise<SafeExecResult> {
  const {
    cwd,
    timeoutMs = 5 * 60_000,
    env,
    maxBuffer = 5 * 1024 * 1024,
    guard = true,
    input,
  } = options;

  if (guard) assertSafeCommand(bin, args);

  const commandForLog = redactSecrets(`${bin} ${args.join(" ")}`);

  return new Promise<SafeExecResult>((resolvePromise, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: sanitizedEnv(env),
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const cap = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      return next.length > maxBuffer ? next.slice(next.length - maxBuffer) : next;
    };

    child.stdout?.on("data", (c: Buffer) => (stdout = cap(stdout, c)));
    child.stderr?.on("data", (c: Buffer) => (stderr = cap(stderr, c)));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      // ENOENT etc. — surface as a rejection so callers can detect a missing binary.
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({
        command: commandForLog,
        code,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
        timedOut,
      });
    });

    if (input !== undefined) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
}

/** True if a binary is resolvable on PATH. */
export async function commandExists(bin: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  try {
    const res = await safeExec(probe, [bin], { timeoutMs: 5000 });
    return res.code === 0;
  } catch {
    return false;
  }
}
