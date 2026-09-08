import type { HardStop } from "./pipelines";

export type HarnessStepResult = {
  reproduced?: boolean;
  changed?: boolean;
  criteriaMet?: boolean;
  summary: string;
  needsInfo?: string[] | null;
  hardStop?: HardStop | null;
};

export function parseHarnessStepResult(text: string): HarnessStepResult | null {
  const candidates: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) candidates.push(trimmed);
  }
  const lastBrace = text.lastIndexOf("{");
  if (lastBrace >= 0) candidates.push(text.slice(lastBrace).trim());

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i];
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const parsedResult = toStepResult(parsed);
      if (parsedResult) return parsedResult;
    } catch {
      continue;
    }
  }
  return null;
}

function toStepResult(parsed: Record<string, unknown>): HarnessStepResult | null {
  const summary =
    typeof parsed.summary === "string"
      ? parsed.summary
      : typeof parsed.result === "string"
        ? parsed.result
        : null;
  const criteriaMet =
    typeof parsed.criteria_met === "boolean"
      ? parsed.criteria_met
      : typeof parsed.criteriaMet === "boolean"
        ? parsed.criteriaMet
        : undefined;
  if (
    summary === null &&
    parsed.reproduced === undefined &&
    parsed.changed === undefined &&
    criteriaMet === undefined
  ) {
    return null;
  }
  return {
    reproduced: typeof parsed.reproduced === "boolean" ? parsed.reproduced : undefined,
    changed: typeof parsed.changed === "boolean" ? parsed.changed : undefined,
    criteriaMet,
    summary: summary ?? JSON.stringify(parsed),
    needsInfo: stringArray(parsed.needs_info) ?? stringArray(parsed.needsInfo),
    hardStop: parseHardStop(parsed.hard_stop ?? parsed.hardStop),
  };
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

function parseHardStop(value: unknown): HardStop | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.category !== "string" ||
    typeof record.reason !== "string" ||
    typeof record.needs !== "string"
  ) {
    return null;
  }
  return {
    category: record.category,
    reason: record.reason,
    needs: record.needs,
  };
}
