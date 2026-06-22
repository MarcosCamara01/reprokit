import type { IssueContext, ReproWorkerInput } from "../types.ts";

/**
 * Build the constrained environment a worker inherits when it is granted the
 * headless-browser capability. Target repositories are untrusted, so the browser is
 * locked down: never headed, a session unique to this run (no cross-run state bleed),
 * and a navigation allowlist limited to the local dev server. These names match the
 * `AGENT_BROWSER_*` variables the agent-browser CLI reads.
 */
export function buildBrowserEnv(runKey: string | number): Record<string, string> {
  return {
    AGENT_BROWSER_HEADED: "0",
    AGENT_BROWSER_SESSION: `reprokit-${runKey}`,
    AGENT_BROWSER_ALLOWED_DOMAINS: "localhost,127.0.0.1",
  };
}

/**
 * Decide the browser-related fields to merge into a repro worker input. Gated on the
 * already-parsed `needsBrowser` flag so non-UI bugs are untouched (returns `{}`), which
 * keeps their worker prompt and environment byte-identical to before this feature.
 */
export function browserFieldsFor(
  issue: IssueContext,
  runKey: string | number,
): Pick<ReproWorkerInput, "browser" | "env"> {
  if (!issue.parsedBug.needsBrowser) return {};
  return { browser: true, env: buildBrowserEnv(runKey) };
}
