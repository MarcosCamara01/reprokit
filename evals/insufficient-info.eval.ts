import "./helpers.ts";
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "Insufficient bug reports ask for more details instead of guessing.",
  tags: ["triage", "mock"],
  async test(t) {
    await t.send("GitHub issue comment: /repro\nThis bug is vague with no steps and missing details.");

    t.succeeded();
    t.calledTool("parse_issue_command", { count: 1, input: { body: /\/repro/ } });
    t.notCalledTool("create_fix_pr");
    t.check(t.reply, includes(/need more information/i));
    t.check(t.reply, includes(/steps/i));
  },
});
