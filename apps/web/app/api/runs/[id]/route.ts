import { HARNESS_IDS, HARNESS_SELECTABLE_STATUSES, type HarnessId } from "@atrium/domain";
import { getDb, getRunWithDetails, updateRunHarness } from "@atrium/db";
import { jsonError } from "@/lib/http";
import { requireApiWorkspace } from "@/lib/api-workspace";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { workspace } = await requireApiWorkspace();
    const { id } = await context.params;
    const body = (await request.json()) as {
      harness?: string;
      machineId?: string | null;
    };
    const run = await getRunWithDetails(getDb(), id);
    if (!run || run.organizationId !== workspace.organization.id) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    if (!(HARNESS_SELECTABLE_STATUSES as readonly string[]).includes(run.status)) {
      return Response.json({ error: "harness is locked after the run starts" }, { status: 409 });
    }
    const harness = body.harness;
    if (!harness || !(HARNESS_IDS as readonly string[]).includes(harness)) {
      return Response.json({ error: "invalid harness" }, { status: 400 });
    }
    const updated = await updateRunHarness(getDb(), {
      runId: id,
      harness: harness as HarnessId,
      machineId: body.machineId ?? null,
    });
    return Response.json({ run: updated });
  } catch (error) {
    return jsonError(error);
  }
}
