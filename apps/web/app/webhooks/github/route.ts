import { handleGitHubWebhook } from "@atrium/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleGitHubWebhook({
    rawBody,
    signature: request.headers.get("x-hub-signature-256"),
    event: request.headers.get("x-github-event"),
    secret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result);
}
