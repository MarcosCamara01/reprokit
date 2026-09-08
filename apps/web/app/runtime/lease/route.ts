import { handleLease } from "@atrium/api";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

async function lease(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      harnesses?: Array<"claude" | "codex" | "cursor">;
    };
    const result = await handleLease({
      authorization: request.headers.get("authorization"),
      body,
    });
    if (!result.job) return new Response(null, { status: 204 });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  return lease(request);
}

export async function GET(request: Request) {
  return lease(request);
}
