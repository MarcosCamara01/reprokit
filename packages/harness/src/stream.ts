import type { HarnessEvent, HarnessJob } from "./types";

const STREAM_JSON_HINTS = ["stream-json", "jsonl", "ndjson"];

export function parseStreamJsonLine(line: string): HarnessEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const type = typeof parsed.type === "string" ? parsed.type : "";
    if (type === "result" || type === "completion") {
      return { type: "result", json: parsed };
    }
    if (type === "hard_stop") {
      return {
        type: "hard_stop",
        category: String(parsed.category ?? "unknown"),
        reason: String(parsed.reason ?? trimmed),
        needs: String(parsed.needs ?? ""),
      };
    }
    const text =
      extractText(parsed) ??
      (typeof parsed.message === "string" ? parsed.message : null) ??
      (typeof parsed.delta === "string" ? parsed.delta : null);
    if (text) return { type: "progress", message: text };
    return { type: "progress", message: trimmed.slice(0, 500) };
  } catch {
    return null;
  }
}

function extractText(parsed: Record<string, unknown>): string | null {
  const message = parsed.message;
  if (message && typeof message === "object") {
    const content = (message as { content?: unknown }).content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text: unknown }).text);
          }
          return "";
        })
        .filter(Boolean)
        .join("");
    }
    if (typeof (message as { text?: unknown }).text === "string") {
      return (message as { text: string }).text;
    }
  }
  if (typeof parsed.result === "string") return parsed.result;
  if (typeof parsed.text === "string") return parsed.text;
  return null;
}

export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

export function looksLikeStreamJson(args: string[]): boolean {
  return args.some((arg) => STREAM_JSON_HINTS.some((hint) => arg.includes(hint)));
}

export function permissionFor(job: HarnessJob): "readonly" | "edits" {
  return job.permission;
}
