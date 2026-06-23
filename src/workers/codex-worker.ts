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
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import { codexMetadata } from "./metadata.ts";

/**
 * Codex CLI worker.
 *
 * Conceptual invocation (from the brief):
 *   codex exec --sandbox workspace-write "<prompt>"
 *
 * The prompt is passed as a single argv element (no shell), so no quoting/
 * injection concerns. The CLI runs with `cwd` set to the isolated checkout.
 *
 * TODO(codex): confirm the exact flag surface of the installed Codex CLI
 * (sandbox modes, non-interactive output, JSON mode). Adjust `args` accordingly.
 */
export class CodexWorker implements CodingWorker {
  readonly provider = "codex" as const;
  private readonly bin = process.env.CODEX_BIN || "codex";
  private readonly metadata = codexMetadata();

  async isAvailable(): Promise<boolean> {
    if (process.env.WORKER_MOCK === "1") return false;
    return commandExists(this.bin);
  }

  private mock(): MockWorker {
    return new MockWorker("codex");
  }

  async runRepro(input: ReproWorkerInput): Promise<ReproWorkerResult> {
    if (!(await this.isAvailable())) return this.mock().runRepro(input);
    const prompt = buildReproPrompt(input.issue, input.contextNote, { browser: input.browser });
    const res = await safeExec(
      this.bin,
      buildCodexArgs(prompt, "read-only", this.metadata.model, this.metadata.effort),
      { cwd: input.workdir, timeoutMs: input.timeoutMs, env: input.env },
    );
    const combined = `# stdout\n${res.stdout}\n\n# stderr\n${res.stderr}`;
    const rawPath = writeRawOutput(
      dirname(input.workdir),
      "codex-repro.txt",
      redactSecrets(combined),
    );
    return coerceReproResult("codex", extractJsonResult(res.stdout), rawPath, this.metadata);
  }

  async runFix(input: FixWorkerInput): Promise<FixWorkerResult> {
    if (!(await this.isAvailable())) return this.mock().runFix(input);
    let report = "(reproduction report unavailable)";
    try {
      report = readFileSync(input.reportPath, "utf8");
    } catch {
      /* keep fallback */
    }
    const prompt = buildFixPrompt(input.issue, report, { browser: input.browser });
    // Fixes need write access to the workspace.
    const res = await safeExec(
      this.bin,
      buildCodexArgs(prompt, "workspace-write", this.metadata.model, this.metadata.effort),
      { cwd: input.workdir, timeoutMs: input.timeoutMs, env: input.env },
    );
    const combined = `# stdout\n${res.stdout}\n\n# stderr\n${res.stderr}`;
    writeRawOutput(dirname(input.workdir), "codex-fix.txt", redactSecrets(combined));
    return coerceFixResult("codex", extractJsonResult(res.stdout), this.metadata);
  }
}

export function buildCodexArgs(
  prompt: string,
  sandbox: "read-only" | "workspace-write",
  model: string,
  effort: string,
): string[] {
  const args = ["exec", "--sandbox", sandbox];
  if (model !== "unknown") args.push("--model", model);
  if (effort !== "unknown") args.push("--config", `model_reasoning_effort="${effort}"`);
  args.push(prompt);
  return args;
}
