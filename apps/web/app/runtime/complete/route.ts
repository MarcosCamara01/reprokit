import { handleComplete, notifyLinearOfRun } from "@atrium/api";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      runId: string;
      status: "pr_open" | "done" | "failed" | "cancelled" | "needs_info" | "awaiting_approval";
      questions?: string[];
      errorSummary?: string | null;
      prUrl?: string | null;
      branchName?: string | null;
    };
    const result = await handleComplete({
      authorization: request.headers.get("authorization"),
      body,
    });
    if (result.run?.id) {
      await notifyLinearOfRun(result.run.id).catch(() => undefined);
    }
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
