import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubProviderForTool, persistWorkerResult } from "../../src/tool-helpers.ts";
import { runPaths } from "../../src/utils/paths.ts";
import { runProjectChecks } from "../../src/workflow/project-checks.ts";
import { logger } from "../../src/utils/logger.ts";

export default defineTool({
  description:
    "Run project validation checks (typecheck → lint → test → build, whichever " +
    "exist) against the fixed checkout. Stops at the first failure. Returns a " +
    "structured pass/fail result with redacted, truncated logs. e2e/playwright " +
    "are skipped by default unless RUN_BROWSER_CHECKS=1.",
  inputSchema: z.object({
    number: z.number().int(),
    owner: z.string().optional(),
    repo: z.string().optional(),
  }),
  async execute({ number, owner, repo }, ctx) {
    const provider = await githubProviderForTool(ctx, owner, repo);
    const issue = await provider.getIssue(String(number));
    const key = issue.number ?? issue.id;
    const paths = runPaths(key);
    const result = await runProjectChecks({
      repoDir: paths.repo,
      maxLogChars: Number(process.env.MAX_LOG_CHARS) || 12_000,
      includeBrowserChecks:
        process.env.RUN_BROWSER_CHECKS === "1" ||
        process.env.RUN_PLAYWRIGHT_CHECKS === "1",
      logger,
    });
    persistWorkerResult(key, "last-checks.json", result);
    return result;
  },
});
