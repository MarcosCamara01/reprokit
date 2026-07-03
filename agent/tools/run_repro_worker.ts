import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubProviderForTool, persistWorkerResult } from "../../src/tool-helpers.ts";
import { runPaths, ensureRunDirs } from "../../src/utils/paths.ts";
import { defaultWorkerProvider, getWorker } from "../../src/workers/index.ts";

export default defineTool({
  description:
    "Run a reproduction worker (Codex or Claude Code) in the isolated checkout. " +
    "The worker tries to REPRODUCE the bug only — it must not fix, commit, or push. " +
    "Falls back to a clearly-labelled MOCK if the worker is not configured. " +
    "The structured result is persisted for generate_report.",
  inputSchema: z.object({
    number: z.number().int(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    worker: z.enum(["codex", "claude"]).optional(),
    phase: z.enum(["repro", "pre-fix", "post-fix"]).optional(),
  }),
  async execute({ number, owner, repo, worker, phase }, ctx) {
    const provider = await githubProviderForTool(ctx, owner, repo);
    const issue = await provider.getIssue(String(number));
    const key = issue.number ?? issue.id;
    const paths = runPaths(key);
    ensureRunDirs(paths);

    const workerProvider = worker ?? defaultWorkerProvider();
    const result = await getWorker(workerProvider).runRepro({
      provider: workerProvider,
      issue,
      workdir: paths.repo,
      timeoutMs: Number(process.env.WORKER_TIMEOUT_MS) || 900_000,
      contextNote:
        phase === "post-fix"
          ? "This is post-fix verification. Validate the current working tree exactly as it is, including uncommitted changes from the fix worker."
          : undefined,
    });

    persistWorkerResult(key, "last-repro.json", result);
    if (phase === "post-fix") {
      persistWorkerResult(key, "last-post-fix-repro.json", result);
    }
    return result;
  },
});
