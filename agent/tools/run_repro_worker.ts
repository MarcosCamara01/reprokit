import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubProvider, persistWorkerResult } from "../../src/tool-helpers.js";
import { runPaths, ensureRunDirs } from "../../src/utils/paths.js";
import { defaultWorkerProvider, getWorker } from "../../src/workers/index.js";

export default defineTool({
  description:
    "Run a reproduction worker (Codex or Claude Code) in the isolated checkout. " +
    "The worker tries to REPRODUCE the bug only — it must not fix, commit, or push. " +
    "Falls back to a clearly-labelled MOCK if the CLI is not installed. " +
    "The structured result is persisted for generate_report.",
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

    const workerProvider = worker ?? defaultWorkerProvider();
    const result = await getWorker(workerProvider).runRepro({
      provider: workerProvider,
      issue,
      workdir: paths.repo,
      timeoutMs: Number(process.env.WORKER_TIMEOUT_MS) || 900_000,
    });

    persistWorkerResult(key, "last-repro.json", result);
    return result;
  },
});
