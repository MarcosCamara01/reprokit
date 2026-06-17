import { defineSchedule } from "eve/schedules";
import { findStaleRuns } from "../../src/workflow/sweep-stale-runs.js";
import { logger } from "../../src/utils/logger.js";

/**
 * Scheduled job: nudge issues that have been waiting for human approval too long.
 */

/** Verified core: list runs parked in WAITING_FOR_APPROVAL / FIX_FAILED. */
export async function sweep(): Promise<void> {
  const stale = findStaleRuns();
  logger.info(`Stale-run sweep found ${stale.length} run(s) awaiting action.`, {
    runs: stale.map((s) => `${s.issueKey}:${s.state}`),
  });
  // TODO(eve): for each stale run, post a reminder comment via the GitHub channel
  // / provider, e.g. "This issue has a reproduction report awaiting /fix or /stop."
}

export default defineSchedule({
  cron: "0 9 * * *",
  async run() {
    await sweep();
  },
});
