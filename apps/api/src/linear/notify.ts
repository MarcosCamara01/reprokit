import { LinearTracker } from "@atrium/trackers";
import { getDb, getRunWithDetails } from "@atrium/db";
import { getValidLinearAccessToken } from "./token";

function metaValue(events: Array<{ stream: string; message: string }>, prefix: string) {
  const row = events.find(
    (event) => event.stream === "linear" && event.message.startsWith(prefix),
  );
  return row ? row.message.slice(prefix.length) : null;
}

/** After the runtime completes a run, attach the GitHub PR onto the Linear issue. */
export async function notifyLinearOfRun(runId: string): Promise<void> {
  const db = getDb();
  const run = await getRunWithDetails(db, runId);
  if (!run?.ticket || run.ticket.provider !== "linear") return;
  if (!run.prUrl && run.status !== "needs_info") return;

  const token = await getValidLinearAccessToken(db, run.organizationId);
  if (!token) return;

  const events = run.events ?? [];
  const sessionId = metaValue(events, "agent_session:");
  const runUrl =
    metaValue(events, "run_url:") ??
    (process.env.BETTER_AUTH_URL
      ? `${process.env.BETTER_AUTH_URL.replace(/\/$/, "")}/runs/${run.id}`
      : undefined);

  const tracker = new LinearTracker({
    accessToken: token.token,
    agentSessionId: sessionId,
    runUrl,
  });
  const ref = {
    provider: "linear" as const,
    externalId: run.ticket.externalId,
    identifier: run.ticket.identifier,
  };

  if (run.prUrl) {
    await tracker.linkPr(ref, {
      url: run.prUrl,
      title: run.ticket.title,
      runUrl,
    });
    return;
  }

  if (run.status === "needs_info") {
    await tracker.requestInfo(ref, [
      run.errorSummary ?? "Need more information before Atrium can continue.",
    ]);
  }
}
