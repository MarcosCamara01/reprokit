import { handleLinearWebhook } from "@atrium/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleLinearWebhook({
    rawBody,
    signature: request.headers.get("linear-signature"),
    event: request.headers.get("linear-event"),
    secret: process.env.LINEAR_WEBHOOK_SECRET ?? "",
    publicAppUrl: process.env.BETTER_AUTH_URL,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result);
}
