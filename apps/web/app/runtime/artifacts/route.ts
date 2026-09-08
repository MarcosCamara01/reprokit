import { handleArtifact } from "@atrium/api";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      runId: string;
      kind: "repro_report" | "fix_report" | "spec" | "diff_stat" | "checks";
      excerpt: string;
      metadata?: { localPath?: string; [key: string]: unknown };
    };
    const result = await handleArtifact({
      authorization: request.headers.get("authorization"),
      body,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
