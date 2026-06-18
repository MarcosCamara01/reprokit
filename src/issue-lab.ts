/**
 * Small deterministic helpers used to exercise the issue-to-fix workflow.
 */

export function normalizeIssueLabels(labels: string[]): string[] {
  const normalizedLabels = new Set<string>();

  for (const label of labels) {
    const normalizedLabel = label.trim().toLowerCase();
    if (normalizedLabel) {
      normalizedLabels.add(normalizedLabel);
    }
  }

  return [...normalizedLabels];
}

export function retryDelayMs(attempt: number, baseMs = 250, maxMs = 5_000): number {
  return Math.min(baseMs * 2 ** attempt, maxMs);
}
