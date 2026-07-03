import "./helpers.ts";
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "/repro gathers evidence and never opens a PR.",
  tags: ["workflow", "mock"],
  async test(t) {
    await t.send(
      "GitHub issue comment: /repro\nIssue #123 has clear steps and expected/actual behavior.",
    );

    t.succeeded();
    t.calledTool("parse_issue_command", { count: 1, input: { body: /\/repro/ } });
    t.notCalledTool("create_fix_pr");
    t.check(t.reply, includes(/PR created: no/i));
  },
});
