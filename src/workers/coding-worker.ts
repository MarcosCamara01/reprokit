import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  FixWorkerInput,
  FixWorkerResult,
  HardStop,
  HardStopCategory,
  ReproWorkerInput,
  ReproWorkerResult,
  WorkerProvider,
} from "../types.ts";
import type { WorkerRunMetadata } from "./metadata.ts";

const HARD_STOP_CATEGORIES: readonly HardStopCategory[] = [
  "ambiguous-requirements",
  "new-dependency",
  "auth",
  "payments",
  "security",
  "data-loss",
  "public-api",
  "external-contract",
  "out-of-scope",
  "infeasible",
  "other",
];

/**
 * A coding worker is an EXTERNAL agent (Codex CLI, Claude Code CLI, …) that runs
 * inside an isolated repo checkout. The orchestrator never edits code itself —
 * it delegates to a worker and consumes its structured result.
 */
export interface CodingWorker {
  readonly provider: WorkerProvider;
  /** True if the underlying CLI is available; false means results will be mocked. */
  isAvailable(): Promise<boolean>;
  runRepro(input: ReproWorkerInput): Promise<ReproWorkerResult>;
  runFix(input: FixWorkerInput): Promise<FixWorkerResult>;
}

/**
 * Pull the last balanced JSON object out of a worker's stdout. Workers are
 * instructed to print one JSON object last; this tolerates surrounding prose.
 */
export function extractJsonResult(output: string): Record<string, unknown> | null {
  if (!output) return null;
  // Prefer a fenced ```json block if present.
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  const candidates: string[] = [];
  if (fenced) {
    for (const block of fenced) {
      candidates.push(block.replace(/```(?:json)?/i, "").replace(/```$/, ""));
    }
  }
  // Then any balanced top-level {...} (scan from the end).
  const lastBrace = output.lastIndexOf("}");
  if (lastBrace !== -1) {
    let depth = 0;
    for (let i = lastBrace; i >= 0; i--) {
      const ch = output[i];
      if (ch === "}") depth++;
      else if (ch === "{") {
        depth--;
        if (depth === 0) {
          candidates.push(output.slice(i, lastBrace + 1));
          break;
        }
      }
    }
  }
  for (const c of candidates.reverse()) {
    try {
      const parsed = JSON.parse(c.trim());
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Coerce a worker's `hardStop` blob into a typed HardStop, or null. A hard stop
 * only counts when the worker actually said why it stopped; an empty/garbage
 * object is treated as "no hard stop" so it can't silently park a run.
 */
export function coerceHardStop(v: unknown): HardStop | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const reason = String(o.reason ?? "").trim();
  const needs = String(o.needs ?? "").trim();
  if (!reason && !needs) return null;
  const rawCategory = String(o.category ?? "").trim() as HardStopCategory;
  const category = HARD_STOP_CATEGORIES.includes(rawCategory) ? rawCategory : "other";
  return {
    category,
    reason: reason || "The worker stopped for a human decision but gave no reason.",
    needs: needs || "Review the issue and decide how to proceed, then re-run the command.",
  };
}

/** Coerce a parsed JSON blob into a typed ReproWorkerResult. */
export function coerceReproResult(
  provider: WorkerProvider,
  json: Record<string, unknown> | null,
  rawOutputPath?: string,
  metadata: WorkerRunMetadata = { model: "unknown", effort: "unknown" },
): ReproWorkerResult {
  const j = json ?? {};
  return {
    provider,
    model: metadata.model,
    effort: metadata.effort,
    reproduced: Boolean(j.reproduced),
    confidence: asNumber(j.confidence),
    summary: String(j.summary ?? (json ? "" : "Worker produced no structured output.")),
    reproductionSteps: asStringArray(j.reproductionSteps),
    commandsRun: asStringArray(j.commandsRun),
    relevantLogs: asStringArray(j.relevantLogs),
    suspectedFiles: asStringArray(j.suspectedFiles),
    suspectedCause: j.suspectedCause ? String(j.suspectedCause) : undefined,
    createdFiles: asStringArray(j.createdFiles),
    modifiedFiles: asStringArray(j.modifiedFiles),
    screenshots: asStringArray(j.screenshots),
    recommendation: String(j.recommendation ?? ""),
    rawOutputPath,
    hardStop: coerceHardStop(j.hardStop),
  };
}

/** Coerce a parsed JSON blob into a typed FixWorkerResult. */
export function coerceFixResult(
  provider: WorkerProvider,
  json: Record<string, unknown> | null,
  metadata: WorkerRunMetadata = { model: "unknown", effort: "unknown" },
): FixWorkerResult {
  const j = json ?? {};
  return {
    provider,
    model: metadata.model,
    effort: metadata.effort,
    fixed: Boolean(j.fixed),
    confidence: asNumber(j.confidence),
    summary: String(j.summary ?? (json ? "" : "Worker produced no structured output.")),
    filesChanged: asStringArray(j.filesChanged),
    testsAddedOrUpdated: asStringArray(j.testsAddedOrUpdated),
    commandsRun: asStringArray(j.commandsRun),
    relevantLogs: asStringArray(j.relevantLogs),
    risks: asStringArray(j.risks),
    recommendation: String(j.recommendation ?? ""),
    hardStop: coerceHardStop(j.hardStop),
  };
}

export function writeRawOutput(
  outputDir: string,
  name: string,
  content: string,
): string {
  const file = join(outputDir, name);
  try {
    writeFileSync(file, content);
  } catch {
    /* ignore */
  }
  return file;
}
