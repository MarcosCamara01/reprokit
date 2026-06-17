import type { IssueContext } from "../types.js";
import type { IssueProvider } from "./issue-provider.js";

/**
 * Linear adapter — STUB.
 *
 * The design is intentionally identical to GitHubIssueProvider so that wiring
 * Linear later is a drop-in. Nothing in the workflow orchestrator needs to
 * change; only this file and the channel/webhook intake do.
 *
 * TODO(linear): implement using the Linear SDK / GraphQL API.
 *   1. Auth: Linear API key (LINEAR_API_KEY) or OAuth via Vercel Connect.
 *   2. getIssue(id): query Issue(id) { title description labels comments url }
 *      and map onto IssueContext (provider: "linear"). Reuse parseBug().
 *   3. postComment(id, body): commentCreate mutation.
 *   4. createLinkedPr(id, prUrl): attach the PR as a link / attachment.
 *   5. Repository resolution: Linear issues are not 1:1 with a repo, so the
 *      repo must be derived from a label/team mapping or issue metadata.
 *   6. Command intake: Linear "agent session" / webhook events instead of
 *      GitHub issue_comment. Parse the same /repro, /fix, /compare, /stop.
 */
export class LinearIssueProvider implements IssueProvider {
  readonly id = "linear" as const;

  async getIssue(_id: string): Promise<IssueContext> {
    throw new Error("Linear provider not implemented yet (see TODO in linear-provider.ts).");
  }

  async postComment(_id: string, _body: string): Promise<void> {
    throw new Error("Linear provider not implemented yet (see TODO in linear-provider.ts).");
  }
}
