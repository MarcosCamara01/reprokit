import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubProvider } from "../../src/tool-helpers.js";
import { runPaths, ensureRunDirs } from "../../src/utils/paths.js";
import { prepareWorkdir } from "../../src/workflow/prepare-workdir.js";
import { logger } from "../../src/utils/logger.js";

export default defineTool({
  description:
    "Clone the issue's repository into an isolated checkout under .runs/issue-<n>/repo " +
    "and detect the package manager and available scripts. Never touches the main repo.",
  inputSchema: z.object({
    number: z.number().int(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    install: z.boolean().optional().describe("Run a dependency install after clone."),
  }),
  async execute({ number, owner, repo, install }) {
    const provider = githubProvider(owner, repo);
    const issue = await provider.getIssue(String(number));
    const paths = runPaths(issue.number ?? issue.id);
    ensureRunDirs(paths);
    const cloneUrl = provider.githubClient.authedRemoteUrl(
      issue.repository!.owner,
      issue.repository!.name,
    );
    const result = await prepareWorkdir({
      issue,
      repoDir: paths.repo,
      cloneUrl,
      install: install ?? false,
      logger,
    });
    // Strip the absolute repoDir nuance — return only safe, useful fields.
    return {
      repoDir: result.repoDir,
      cloned: result.cloned,
      defaultBranch: result.defaultBranch,
      packageManager: result.packageManager,
      scripts: result.scripts,
      installed: result.installed,
    };
  },
});
