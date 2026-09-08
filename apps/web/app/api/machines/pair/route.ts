import { handleCreatePairing } from "@atrium/api";
import { jsonError } from "@/lib/http";
import { requireApiWorkspace } from "@/lib/api-workspace";

export async function POST() {
  try {
    const { workspace } = await requireApiWorkspace();
    const result = await handleCreatePairing({
      organizationId: workspace.organization.id,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
