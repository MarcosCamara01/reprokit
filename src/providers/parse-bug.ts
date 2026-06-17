import type { ParsedBug } from "../types.js";

/**
 * Heuristic extraction of structured bug fields from free-form issue text.
 *
 * This is deliberately simple and dependency-free: it looks for common section
 * headings and keywords. The reproduction WORKER does the real understanding;
 * this just gives the orchestrator enough signal to triage and to ask for more
 * info when the report is too thin.
 */

const SECTION_ALIASES: Record<keyof ParsedBugSections, string[]> = {
  expectedBehavior: ["expected", "expected behavior", "expected behaviour", "what should happen"],
  actualBehavior: ["actual", "actual behavior", "actual behaviour", "what happens", "current behavior"],
  reproductionSteps: ["steps", "steps to reproduce", "reproduction", "repro", "to reproduce", "how to reproduce"],
  environment: ["environment", "env", "system", "versions", "version"],
};

interface ParsedBugSections {
  expectedBehavior?: string;
  actualBehavior?: string;
  reproductionSteps?: string;
  environment?: string;
}

/** Split markdown into { heading -> body } blocks using `#`/`##`/bold headings. */
function extractSections(body: string): Record<string, string> {
  const lines = body.split(/\r?\n/);
  const sections: Record<string, string> = {};
  let current = "_preamble";
  sections[current] = "";

  for (const line of lines) {
    const heading =
      line.match(/^#{1,6}\s+(.*\S)\s*$/)?.[1] ??
      line.match(/^\*\*(.+?)\*\*\s*:?\s*$/)?.[1];
    if (heading) {
      current = heading.trim().toLowerCase().replace(/[:#]+$/, "");
      sections[current] = "";
    } else {
      sections[current] = (sections[current] ?? "") + line + "\n";
    }
  }
  return sections;
}

function findSection(
  sections: Record<string, string>,
  aliases: string[],
): string | undefined {
  for (const alias of aliases) {
    for (const key of Object.keys(sections)) {
      if (key === alias || key.startsWith(alias)) {
        const value = sections[key]?.trim();
        if (value) return value;
      }
    }
  }
  return undefined;
}

function toSteps(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter((l) => l.length > 0);
}

export function parseBug(title: string, body: string): ParsedBug {
  const text = body ?? "";
  const sections = extractSections(text);
  const lower = text.toLowerCase();

  const reproSection = findSection(sections, SECTION_ALIASES.reproductionSteps);

  return {
    summary: title?.trim() || firstSentence(text) || "(no summary)",
    expectedBehavior: findSection(sections, SECTION_ALIASES.expectedBehavior),
    actualBehavior: findSection(sections, SECTION_ALIASES.actualBehavior),
    reproductionSteps: toSteps(reproSection),
    environment: findSection(sections, SECTION_ALIASES.environment),
    suspectedArea: guessArea(lower),
    needsBrowser: /\b(browser|chrome|firefox|safari|playwright|cypress|e2e|click|page|ui)\b/.test(lower),
    needsDatabase: /\b(database|db|postgres|mysql|prisma|sql|migration|query)\b/.test(lower),
    needsAuth: /\b(auth|login|session|token|oauth|jwt|sign in|signin|permission)\b/.test(lower),
  };
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const dot = t.indexOf(". ");
  return dot > 0 ? t.slice(0, dot + 1) : t.slice(0, 160);
}

function guessArea(lower: string): string | undefined {
  const areas: Array<[string, RegExp]> = [
    ["next.js", /\bnext(\.js)?\b|app router|getserversideprops|use server/],
    ["react", /\breact\b|usestate|useeffect|hook|component|render/],
    ["typescript", /\btypescript\b|\bts\b|type error|ts\d{4}/],
    ["api", /\bapi\b|endpoint|route handler|fetch|http/],
    ["database", /\bdatabase\b|prisma|sql|postgres/],
  ];
  for (const [name, re] of areas) if (re.test(lower)) return name;
  return undefined;
}

export interface TriageResult {
  looksLikeBug: boolean;
  hasEnoughInfo: boolean;
  missing: string[];
}

/** Decide whether we have enough to attempt a reproduction. */
export function triage(parsed: ParsedBug): TriageResult {
  const missing: string[] = [];
  if (parsed.reproductionSteps.length === 0) missing.push("steps to reproduce");
  if (!parsed.expectedBehavior) missing.push("expected behavior");
  if (!parsed.actualBehavior) missing.push("actual behavior");

  // We can still attempt a repro with at least steps OR (expected + actual).
  const hasSteps = parsed.reproductionSteps.length > 0;
  const hasExpectations = !!parsed.expectedBehavior && !!parsed.actualBehavior;
  const hasEnoughInfo = hasSteps || hasExpectations;

  return {
    looksLikeBug: true, // MVP: treat everything routed here as a candidate bug.
    hasEnoughInfo,
    missing,
  };
}
