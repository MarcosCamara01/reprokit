import { handleHeartbeat } from "@atrium/api";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      capabilities?: { harnesses?: Array<"claude" | "codex" | "cursor"> };
    };
    const result = await handleHeartbeat({
      authorization: request.headers.get("authorization"),
      body,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
