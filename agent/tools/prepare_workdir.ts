import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubProviderForTool } from "../../src/tool-helpers.ts";
import { runPaths, ensureRunDirs } from "../../src/utils/paths.ts";
import { prepareWorkdir } from "../../src/workflow/prepare-workdir.ts";
import { logger } from "../../src/utils/logger.ts";

export default defineTool({
  description:
    "Clone the issue's repository into an isolated checkout under .runs/issue-<n>/repo " +
    "for external Codex/Claude workers, then detect package manager and scripts. " +
    "Eve's native GitHub channel may also checkout the repo into the sandbox, but " +
    "this .runs checkout is still required for host-based workers. Never touches the main repo.",
  inputSchema: z.object({
    number: z.number().int(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    install: z.boolean().optional().describe("Run a dependency install after clone."),
  }),
  async execute({ number, owner, repo, install }, ctx) {
    const provider = await githubProviderForTool(ctx, owner, repo);
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
