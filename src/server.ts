import { createServer, type IncomingMessage } from "node:http";
import { handleWebhook } from "./github/github-webhook.ts";
import { createLogger } from "./utils/logger.ts";

/**
 * Standalone webhook server (Phase 1 path). This is the simplest way to run the
 * agent without the full Eve runtime: point a GitHub webhook (issues +
 * issue_comment events) at POST /webhook.
 *
 * When running under Eve (`eve dev`), the GitHub *channel* is the intake instead
 * (see agent/channels/github.ts) and this file is not used.
 */
const log = createLogger("server");
const PORT = Number(process.env.PORT) || 3001;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/webhook") {
    try {
      const rawBody = await readBody(req);
      const eventName = String(req.headers["x-github-event"] ?? "");
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const result = await handleWebhook({ eventName, rawBody, signature });
      res.writeHead(result.handled ? 202 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      log.error("Webhook error", { error: String(err) });
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  log.info(`Webhook server listening on http://127.0.0.1:${PORT}/webhook`);
  log.info("Health check: GET /health");
});
