import type { AgentRunStatus } from "@atrium/domain";
import { cn } from "../../lib/utils";

const LABELS: Record<AgentRunStatus, string> = {
  needs_info: "Needs info",
  awaiting_approval: "Approval",
  queued: "Queued",
  running: "Running",
  pr_open: "PR open",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

const TONE: Record<AgentRunStatus, string> = {
  needs_info: "text-status-needs-info bg-status-needs-info/15",
  awaiting_approval: "text-status-awaiting bg-status-awaiting/15",
  queued: "text-status-queued bg-status-queued/15",
  running: "text-status-running bg-status-running/15",
  pr_open: "text-status-pr bg-status-pr/15",
  done: "text-status-done bg-status-done/15",
  failed: "text-status-failed bg-status-failed/15",
  cancelled: "text-status-cancelled bg-status-cancelled/15",
};

export function StatusBadge({ status }: { status: AgentRunStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0 text-[11px] font-medium leading-5",
        TONE[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}

export function statusLabel(status: AgentRunStatus): string {
  return LABELS[status];
}
