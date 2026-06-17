import type { IssueContext } from "../types.ts";

/**
 * Provider-agnostic contract for an issue tracker (GitHub today, Linear later).
 * The workflow orchestrator only ever talks to this interface, which keeps the
 * core logic portable across trackers.
 */
export interface IssueProvider {
  readonly id: "github" | "linear";

  /** Fetch and normalize an issue into an IssueContext. `id` is provider-native. */
  getIssue(id: string): Promise<IssueContext>;

  /** Post a comment back onto the issue. */
  postComment(id: string, body: string): Promise<void>;

  /** Optional: record a PR link on the issue (provider-specific behavior). */
  createLinkedPr?(id: string, prUrl: string): Promise<void>;
}
