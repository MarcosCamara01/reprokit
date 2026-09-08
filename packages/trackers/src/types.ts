import type { TicketRef, TicketSnapshot } from "@atrium/domain";

export interface IssueTracker {
  readonly id: "github" | "linear";
  getIssue(ref: TicketRef): Promise<TicketSnapshot>;
  postComment(ref: TicketRef, body: string): Promise<void>;
  requestInfo(ref: TicketRef, questions: string[]): Promise<void>;
  linkPr(ref: TicketRef, pr: { url: string; title: string; runUrl?: string }): Promise<void>;
  applyLabels?(ref: TicketRef, labels: string[]): Promise<void>;
}

export class TrackerNotImplementedError extends Error {
  constructor(id: IssueTracker["id"], method: string) {
    super(`${id} tracker.${method} is not implemented in this phase.`);
    this.name = "TrackerNotImplementedError";
  }
}
