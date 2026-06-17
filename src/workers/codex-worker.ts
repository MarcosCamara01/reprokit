import type { CodingWorker } from "./coding-worker.js";
import {
  coerceFixResult,
  coerceReproResult,
  extractJsonResult,
  writeRawOutput,
} from "./coding-worker.js";
import type {
  FixWorkerInput,
  FixWorkerResult,
  ReproWorkerInput,
  ReproWorkerResult,
} from "../types.js";
import { buildFixPrompt, buildReproPrompt } from "./prompts.js";
import { commandExists, safeExec } from "../utils/safe-exec.js";
import { redactSecrets } from "../utils/redact-secrets.js";
import { MockWorker } from "./mock-worker.js";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";

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

  async isAvailable(): Promise<boolean> {
    if (process.env.WORKER_MOCK === "1") return false;
    return commandExists(this.bin);
  }

  private mock(): MockWorker {
    return new MockWorker("codex");
  }

  async runRepro(input: ReproWorkerInput): Promise<ReproWorkerResult> {
    if (!(await this.isAvailable())) return this.mock().runRepro(input);
    const prompt = buildReproPrompt(input.issue);
    const res = await safeExec(
      this.bin,
      ["exec", "--sandbox", "read-only", prompt],
      { cwd: input.workdir, timeoutMs: input.timeoutMs },
    );
    const combined = `# stdout\n${res.stdout}\n\n# stderr\n${res.stderr}`;
    const rawPath = writeRawOutput(
      dirname(input.workdir),
      "codex-repro.txt",
      redactSecrets(combined),
    );
    return coerceReproResult("codex", extractJsonResult(res.stdout), rawPath);
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
    // Fixes need write access to the workspace.
    const res = await safeExec(
      this.bin,
      ["exec", "--sandbox", "workspace-write", prompt],
      { cwd: input.workdir, timeoutMs: input.timeoutMs },
    );
    const combined = `# stdout\n${res.stdout}\n\n# stderr\n${res.stderr}`;
    writeRawOutput(dirname(input.workdir), "codex-fix.txt", redactSecrets(combined));
    return coerceFixResult("codex", extractJsonResult(res.stdout));
  }
}
