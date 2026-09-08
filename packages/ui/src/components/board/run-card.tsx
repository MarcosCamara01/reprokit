import type { AgentRunPhase, AgentRunStatus, HarnessId, Pipeline } from "@atrium/domain";
import { formatAge } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { StatusBadge } from "./status-badge";

export type BoardRun = {
  id: string;
  status: AgentRunStatus;
  phase: AgentRunPhase | null;
  harness: HarnessId;
  pipeline: Pipeline;
  identifier: string;
  title: string;
  machineName: string | null;
  createdAt: Date | string;
};

export function RunCard({ run, href }: { run: BoardRun; href: string }) {
  return (
    <a
      href={href}
      className="block rounded-md border border-border bg-card px-2.5 py-2 hover:border-primary/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{run.identifier}</span>
        {run.status === "running" && run.phase ? (
          <Badge variant="outline">{run.phase}</Badge>
        ) : (
          <StatusBadge status={run.status} />
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug">{run.title}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{run.harness}</span>
        {run.machineName ? <span>{run.machineName}</span> : null}
        <span className="ml-auto">{formatAge(run.createdAt)}</span>
      </div>
    </a>
  );
}
