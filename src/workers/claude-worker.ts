import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CodingWorker } from "./coding-worker.ts";
import {
  coerceFixResult,
  coerceReproResult,
  extractJsonResult,
  writeRawOutput,
} from "./coding-worker.ts";
import type {
  FixWorkerInput,
  FixWorkerResult,
  ReproWorkerInput,
  ReproWorkerResult,
} from "../types.ts";
import { buildFixPrompt, buildReproPrompt } from "./prompts.ts";
import { commandExists, safeExec } from "../utils/safe-exec.ts";
import { redactSecrets } from "../utils/redact-secrets.ts";
import { MockWorker } from "./mock-worker.ts";

/**
 * Claude Code CLI worker.
 *
 * Conceptual invocation (from the brief):
 *   claude -p "<prompt>"
 *
 * `-p` runs Claude Code in non-interactive "print" mode and exits when done.
 *
 * TODO(claude): confirm flags for the installed Claude Code version. For repro
 * we want read-only behavior; consider `--permission-mode plan` or a tool
 * allowlist. For fix we need edit permission (e.g. `--permission-mode acceptEdits`).
 * Output format flags (e.g. `--output-format json`) may simplify parsing.
 */
export class ClaudeWorker implements CodingWorker {
  readonly provider = "claude" as const;
  private readonly bin = process.env.CLAUDE_BIN || "claude";

  async isAvailable(): Promise<boolean> {
    if (process.env.WORKER_MOCK === "1") return false;
    return commandExists(this.bin);
  }

  private mock(): MockWorker {
    return new MockWorker("claude");
  }

  async runRepro(input: ReproWorkerInput): Promise<ReproWorkerResult> {
    if (!(await this.isAvailable())) return this.mock().runRepro(input);
    const prompt = buildReproPrompt(input.issue);
    const res = await safeExec(this.bin, ["-p", prompt], {
      cwd: input.workdir,
      timeoutMs: input.timeoutMs,
    });
    const combined = `# stdout\n${res.stdout}\n\n# stderr\n${res.stderr}`;
    const rawPath = writeRawOutput(
      dirname(input.workdir),
      "claude-repro.txt",
      redactSecrets(combined),
    );
    return coerceReproResult("claude", extractJsonResult(res.stdout), rawPath);
  }

  async runFix(input: FixWorkerInput): Promise<FixWorkerResult> {
    if (!(await this.isAvailable())) return this.mock().runFix(input);
    let report = "(reproduction report unavailable)";
    try {
      report = readFileSync(input.reportPath, "utf8");
    } catch {
      /* keep fallback */
    }
    const prompt = buildFixPrompt(input.issue, report);
    const res = await safeExec(this.bin, ["-p", prompt], {
      cwd: input.workdir,
      timeoutMs: input.timeoutMs,
    });
    const combined = `# stdout\n${res.stdout}\n\n# stderr\n${res.stderr}`;
    writeRawOutput(dirname(input.workdir), "claude-fix.txt", redactSecrets(combined));
    return coerceFixResult("claude", extractJsonResult(res.stdout));
  }
}
