import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubProviderForTool } from "../../src/tool-helpers.ts";
import { triage } from "../../src/providers/parse-bug.ts";

export default defineTool({
  description:
    "Read a GitHub issue (title, body, labels, comments, repo) and return a " +
    "normalized IssueContext plus a triage verdict (enough info to reproduce?).",
  inputSchema: z.object({
    number: z.number().int().describe("Issue number."),
    owner: z.string().optional().describe("Repo owner (defaults to GITHUB_OWNER)."),
    repo: z.string().optional().describe("Repo name (defaults to GITHUB_REPO)."),
  }),
  async execute({ number, owner, repo }, ctx) {
    const provider = await githubProviderForTool(ctx, owner, repo);
    const issue = await provider.getIssue(String(number));
    return { issue, triage: triage(issue.parsedBug) };
  },
});
