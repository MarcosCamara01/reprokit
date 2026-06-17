import { defineTool } from "eve/tools";
import { z } from "zod";
import { existsSync } from "node:fs";
import { githubProvider, persistWorkerResult } from "../../src/tool-helpers.js";
import { runPaths, ensureRunDirs } from "../../src/utils/paths.js";
import { prepareWorkdir } from "../../src/workflow/prepare-workdir.js";
import { defaultWorkerProvider, getWorker } from "../../src/workers/index.js";
import { logger } from "../../src/utils/logger.js";

export default defineTool({
  description:
    "Run a FIX worker (Codex or Claude Code) in the isolated checkout. ONLY call " +
    "this after a human approved with /fix on the issue. The worker makes the " +
    "smallest safe change; it must not commit or push. Returns a structured result.",
  inputSchema: z.object({
    number: z.number().int(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    worker: z.enum(["codex", "claude"]).optional(),
  }),
  async execute({ number, owner, repo, worker }) {
    const provider = githubProvider(owner, repo);
    const issue = await provider.getIssue(String(number));
    const key = issue.number ?? issue.id;
    const paths = runPaths(key);
    ensureRunDirs(paths);

    if (!existsSync(paths.repo)) {
      const cloneUrl = provider.githubClient.authedRemoteUrl(
        issue.repository!.owner,
        issue.repository!.name,
      );
      await prepareWorkdir({ issue, repoDir: paths.repo, cloneUrl, logger });
    }

    const workerProvider = worker ?? defaultWorkerProvider();
    const branchName = `agent/fix-issue-${issue.number ?? issue.id}`;
    const result = await getWorker(workerProvider).runFix({
      provider: workerProvider,
      issue,
      reportPath: paths.report,
      workdir: paths.repo,
      branchName,
      timeoutMs: Number(process.env.WORKER_TIMEOUT_MS) || 900_000,
    });

    persistWorkerResult(key, "last-fix.json", result);
    return { ...result, branchName };
  },
});
