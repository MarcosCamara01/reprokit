import type { ReactNode } from "react";
import { KANBAN_COLUMNS, type AgentRunStatus } from "@atrium/domain";
import { statusLabel } from "./status-badge";
import { RunCard, type BoardRun } from "./run-card";

const COLUMN_ACCENT: Record<AgentRunStatus, string> = {
  needs_info: "bg-status-needs-info",
  awaiting_approval: "bg-status-awaiting",
  queued: "bg-status-queued",
  running: "bg-status-running",
  pr_open: "bg-status-pr",
  done: "bg-status-done",
  failed: "bg-status-failed",
  cancelled: "bg-status-cancelled",
};

export function KanbanBoard({
  runs,
  renderCard,
}: {
  runs: BoardRun[];
  renderCard?: (run: BoardRun) => ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((column) => {
        const items = runs.filter((run) => run.status === column);
        return (
          <section
            key={column}
            className="flex w-[240px] shrink-0 flex-col rounded-md bg-background"
          >
            <header className="flex items-center gap-2 px-1 py-2">
              <span className={`size-1.5 rounded-full ${COLUMN_ACCENT[column]}`} />
              <h2 className="text-xs font-medium text-foreground">{statusLabel(column)}</h2>
              <span className="font-mono text-[11px] text-muted-foreground">{items.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <p className="px-1 text-[11px] text-muted-foreground">Empty</p>
              ) : (
                items.map((run) =>
                  renderCard ? (
                    <div key={run.id}>{renderCard(run)}</div>
                  ) : (
                    <RunCard key={run.id} run={run} href={`/runs/${run.id}`} />
                  ),
                )
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
