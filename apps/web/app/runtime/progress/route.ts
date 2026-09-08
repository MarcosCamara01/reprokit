import { handleProgress } from "@atrium/api";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      runId: string;
      phase: "diagnosing" | "fixing" | "implementing" | "verifying";
    };
    const result = await handleProgress({
      authorization: request.headers.get("authorization"),
      body,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
