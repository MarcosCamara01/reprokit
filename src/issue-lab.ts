/**
 * Small deterministic helpers used to exercise the issue-to-fix workflow.
 * The current implementations are intentionally wrong for a controlled test.
 */

export function normalizeIssueLabels(labels: string[]): string[] {
  return labels;
}

export function retryDelayMs(attempt: number, baseMs = 250, maxMs = 5_000): number {
  return Math.min(attempt * baseMs, maxMs);
}
