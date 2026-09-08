import { handleJoin } from "@atrium/api";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; name?: string };
    const result = await handleJoin({ body: { code: body.code ?? "", name: body.name } });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
