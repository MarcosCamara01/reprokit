import { getDb, getRunWithDetails } from "@atrium/db";
import { jsonError } from "@/lib/http";
import { requireApiWorkspace } from "@/lib/api-workspace";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { workspace } = await requireApiWorkspace();
    const { id } = await context.params;
    const run = await getRunWithDetails(getDb(), id);
    if (!run || run.organizationId !== workspace.organization.id) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json({
      status: run.status,
      phase: run.phase,
      events: run.events ?? [],
      artifacts: run.artifacts ?? [],
    });
  } catch (error) {
    return jsonError(error);
  }
}
