import { defineChannel, POST } from "eve/channels";
import { handleWebhook } from "../../src/github/github-webhook.js";

/**
 * Eve channel wrapper for the same GitHub webhook core used by `npm run webhook`.
 *
 * Eve also ships a native `githubChannel` for GitHub Apps at `/eve/v1/github`.
 * This project intentionally keeps the MVP on a personal access token, so this
 * custom channel exposes POST /webhook and delegates to the framework-agnostic
 * workflow in `src/github/github-webhook.ts`.
 */
export default defineChannel({
  routes: [
    POST("/webhook", async (request) => {
      try {
        const rawBody = await request.text();
        const eventName = request.headers.get("x-github-event") ?? "";
        const signature = request.headers.get("x-hub-signature-256") ?? undefined;
        const result = await handleWebhook({ eventName, rawBody, signature });
        return Response.json(result, { status: result.handled ? 202 : 200 });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 400 });
      }
    }),
  ],
});
