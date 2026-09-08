import { HarnessSelector } from "@/components/harness-selector";
import { KanbanBoard, RunCard, type BoardRun } from "@atrium/ui";
import { HARNESS_SELECTABLE_STATUSES } from "@atrium/domain";
import { getDb, isDatabaseConfigured, listMachinesForOrg, listRunsForOrg } from "@atrium/db";
import { requireWorkspace } from "@/lib/workspace";

export default async function BoardPage() {
  const { workspace, dbUnavailable } = await requireWorkspace();

  if (dbUnavailable || !workspace) {
    return (
      <main className="px-4 py-8 text-sm text-muted-foreground">
        Database is not configured. Set DATABASE_URL in apps/web/.env.local.
      </main>
    );
  }

  const db = getDb();
  const rows = await listRunsForOrg(db, workspace.organization.id);
  const machines = await listMachinesForOrg(db, workspace.organization.id);
  const runs: BoardRun[] = rows.map((run) => ({
    id: run.id,
    status: run.status,
    phase: run.phase,
    harness: run.harness,
    pipeline: run.pipeline,
    identifier: run.ticket?.identifier ?? run.id.slice(0, 8),
    title: run.ticket?.title ?? run.pipeline,
    machineName: run.machine?.name ?? null,
    createdAt: run.createdAt,
  }));

  return (
    <main className="flex min-h-0 flex-1 flex-col px-4 py-3">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-sm font-medium">Runs</h1>
        <p className="text-xs text-muted-foreground">
          Columns are AgentRun status. Cards do not drag across gates.
        </p>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No runs yet. Comment <span className="font-mono">/fix</span> on a bound GitHub
          issue, or wait until a RepoBinding exists in Settings.
        </p>
      ) : (
        <KanbanBoard
          runs={runs}
          renderCard={(run) => (
            <div className="flex flex-col gap-1">
              <RunCard run={run} href={`/runs/${run.id}`} />
              {(HARNESS_SELECTABLE_STATUSES as readonly string[]).includes(run.status) ? (
                <div className="rounded-md border border-border px-2 py-1.5">
                  <HarnessSelector
                    runId={run.id}
                    harness={run.harness}
                    machineId={
                      rows.find((row) => row.id === run.id)?.machineId ?? null
                    }
                    machines={machines.map((item) => ({
                      id: item.id,
                      name: item.name,
                      status: item.status,
                    }))}
                  />
                </div>
              ) : null}
            </div>
          )}
        />
      )}
    </main>
  );
}
