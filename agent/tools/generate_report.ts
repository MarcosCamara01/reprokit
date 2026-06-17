import { defineTool } from "eve/tools";
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { githubProvider, readWorkerResult } from "../../src/tool-helpers.ts";
import { runPaths, ensureRunDirs } from "../../src/utils/paths.ts";
import {
  renderReproductionReport,
  summarizeReportForComment,
} from "../../src/reports/reproduction-report.ts";
import type { ReproWorkerResult } from "../../src/types.ts";

export default defineTool({
  description:
    "Render the reproduction report markdown from the last repro worker result, " +
    "save it to .runs/issue-<n>/report.md, and return both the full markdown and a " +
    "comment-sized summary (for very long reports).",
  inputSchema: z.object({
    number: z.number().int(),
    owner: z.string().optional(),
    repo: z.string().optional(),
  }),
  async execute({ number, owner, repo }) {
    const provider = githubProvider(owner, repo);
    const issue = await provider.getIssue(String(number));
    const key = issue.number ?? issue.id;

    const result = readWorkerResult<ReproWorkerResult>(key, "last-repro.json");
    if (!result) {
      throw new Error("No reproduction result found. Run run_repro_worker first.");
    }

    const paths = runPaths(key);
    ensureRunDirs(paths);
    const markdown = renderReproductionReport({
      issue,
      result,
      environment: issue.parsedBug.environment,
    });
    writeFileSync(paths.report, markdown);

    const { body, truncated } = summarizeReportForComment(markdown, 60_000);
    return { reportPath: paths.report, markdown, commentBody: body, truncated };
  },
});
