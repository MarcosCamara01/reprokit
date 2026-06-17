import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubProvider } from "../../src/tool-helpers.ts";
import { redactSecrets } from "../../src/utils/redact-secrets.ts";

export default defineTool({
  description:
    "Post a comment on a GitHub issue. The body is secret-redacted before sending.",
  inputSchema: z.object({
    number: z.number().int().describe("Issue number."),
    body: z.string().describe("Markdown comment body."),
    owner: z.string().optional(),
    repo: z.string().optional(),
  }),
  async execute({ number, body, owner, repo }) {
    const provider = githubProvider(owner, repo);
    await provider.postComment(String(number), redactSecrets(body));
    return { ok: true };
  },
});
