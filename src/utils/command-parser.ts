import type { WorkerProvider } from "../types.ts";

/**
 * A command parsed from a GitHub/Linear issue comment.
 */
export type IssueCommand =
  | { type: "repro"; provider?: WorkerProvider }
  | { type: "fix"; provider?: WorkerProvider }
  | { type: "compare" }
  | { type: "stop" }
  | { type: "unknown"; raw: string };

const WORKERS: WorkerProvider[] = ["codex", "claude"];

/**
 * Parse the first slash-command found in a comment body.
 *
 * Rules:
 *  - case-insensitive
 *  - tolerant of leading/trailing whitespace and surrounding prose
 *  - the first recognized slash command anywhere in the text is used
 *
 * Examples:
 *   "/repro"              -> { type: "repro" }
 *   "/repro codex"        -> { type: "repro", provider: "codex" }
 *   "  /Fix   Codex "     -> { type: "fix", provider: "codex" }
 *   "/fix claude"         -> { type: "fix", provider: "claude" }
 *   "/compare"            -> { type: "compare" }
 *   "/stop"               -> { type: "stop" }
 *   "please /repro now"   -> { type: "repro" }   (line contains a command token)
 *   "hello"               -> { type: "unknown", raw: "hello" }
 */
export function parseIssueCommand(raw: string): IssueCommand {
  const text = (raw ?? "").trim();
  if (!text) return { type: "unknown", raw };

  const tokenMatch = text.match(
    /(?:^|[^\w/])\/(reproduce|compare|cancel|repro|fix|stop)(?:\s+([a-z]+))?(?=$|[^\w-])/i,
  );
  if (!tokenMatch) return { type: "unknown", raw };

  const verb = tokenMatch[1]!.toLowerCase();
  const arg = tokenMatch[2]?.toLowerCase();

  switch (verb) {
    case "repro":
    case "reproduce": {
      const provider = WORKERS.find((w) => w === arg);
      return provider ? { type: "repro", provider } : { type: "repro" };
    }
    case "fix": {
      const provider = WORKERS.find((w) => w === arg);
      return provider ? { type: "fix", provider } : { type: "fix" };
    }
    case "compare":
      return { type: "compare" };
    case "stop":
    case "cancel":
      return { type: "stop" };
    default:
      return { type: "unknown", raw };
  }
}

/** True if a comment body contains any command this agent understands. */
export function hasIssueCommand(raw: string): boolean {
  return parseIssueCommand(raw).type !== "unknown";
}
