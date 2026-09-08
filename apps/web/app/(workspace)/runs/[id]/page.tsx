import { CompareReports } from "@/components/compare-reports";
import { HarnessSelector } from "@/components/harness-selector";
import { LiveEventLog } from "@/components/live-event-log";
import { Badge, StatusBadge } from "@atrium/ui";
import { HARNESS_SELECTABLE_STATUSES } from "@atrium/domain";
import { getDb, getRunWithDetails, isDatabaseConfigured, listMachinesForOrg } from "@atrium/db";
import { requireWorkspace } from "@/lib/workspace";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  if (!isDatabaseConfigured() || !workspace) notFound();

  const run = await getRunWithDetails(getDb(), id);
  if (!run || run.organizationId !== workspace.organization.id) notFound();

  const machines = await listMachinesForOrg(getDb(), workspace.organization.id);
  const events = run.events ?? [];
  const artifacts = run.artifacts ?? [];
  const selectable = (HARNESS_SELECTABLE_STATUSES as readonly string[]).includes(run.status);
  const compareReports = artifacts.filter((item) => item.kind === "repro_report");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <Link href="/board" className="text-xs text-muted-foreground hover:text-foreground">
        Board
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {run.ticket?.identifier ?? run.id.slice(0, 8)}
          </span>
          <StatusBadge status={run.status} />
          {run.phase ? <Badge variant="outline">{run.phase}</Badge> : null}
        </div>
        <h1 className="text-xl font-medium tracking-tight">
          {run.ticket?.title ?? run.pipeline}
        </h1>
        <p className="text-sm text-muted-foreground">
          {run.pipeline} · {run.harness} · {run.trigger}
          {run.machine?.name ? ` · ${run.machine.name}` : ""}
        </p>
      </header>

      {selectable ? (
        <section className="rounded-md border border-border p-3">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">
            Harness and machine (before queued/lease)
          </h2>
          <HarnessSelector
            runId={run.id}
            harness={run.harness}
            machineId={run.machineId}
            machines={machines.map((item) => ({
              id: item.id,
              name: item.name,
              status: item.status,
            }))}
          />
        </section>
      ) : null}

      {run.prUrl ? (
        <p className="text-sm">
          PR:{" "}
          <a href={run.prUrl} className="text-primary underline">
            {run.prUrl}
          </a>
        </p>
      ) : null}

      {run.errorSummary ? (
        <p className="rounded-md border border-status-failed/40 bg-status-failed/10 px-3 py-2 text-sm">
          {run.errorSummary}
        </p>
      ) : null}

      {run.pipeline === "compare" ? (
        <section>
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">
            Compare reports (no automatic winner)
          </h2>
          <CompareReports artifacts={compareReports} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-xs font-medium text-muted-foreground">Timeline</h2>
        <LiveEventLog
          runId={run.id}
          initial={events}
          live={run.status === "running"}
        />
      </section>
    </main>
  );
}
