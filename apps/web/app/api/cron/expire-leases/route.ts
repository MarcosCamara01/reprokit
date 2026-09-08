import { handleExpireLeases } from "@atrium/api";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = request.headers.get("authorization");
      if (auth !== `Bearer ${secret}`) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
    }
    const result = await handleExpireLeases();
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  return GET(request);
}
