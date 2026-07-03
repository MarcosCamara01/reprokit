import "./helpers.ts";
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "/fix does not open a PR when checks fail.",
  tags: ["workflow", "mock"],
  async test(t) {
    await t.send(
      "GitHub issue comment: /fix\nThe worker made a change but npm test failed during project checks.",
    );

    t.succeeded();
    t.calledTool("parse_issue_command", { count: 1, input: { body: /\/fix/ } });
    t.notCalledTool("create_fix_pr");
    t.check(t.reply, includes(/checks failed/i));
    t.check(t.reply, includes(/PR creation is blocked/i));
  },
});
