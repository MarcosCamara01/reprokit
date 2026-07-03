import "./helpers.ts";
import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";

interface ChannelInfo {
  name: string;
  urlPath: string;
}

export default defineEval({
  description: "Smoke test for the native Eve GitHub surface using the mock model.",
  tags: ["github", "smoke", "mock"],
  async test(t) {
    const info = (await (await t.target.fetch("/eve/v1/info")).json()) as {
      channels?: { available?: Array<{ name: string; urlPath: string }> };
    };
    t.check(
      info.channels?.available ?? [],
      satisfies<ChannelInfo[]>(
        (channels) =>
          channels.some(
            (channel) =>
              channel.name === "github" && channel.urlPath === "/eve/v1/github",
          ),
        "native githubChannel is available",
      ),
    );

    await t.send(
      "Native GitHub channel smoke: GitHub issue comment /repro with clear reproduction details.",
    );

    t.succeeded();
    t.calledTool("parse_issue_command", { count: 1, input: { body: /\/repro/ } });
    t.notCalledTool("create_fix_pr");
    t.check(t.reply, includes(/GitHub issue flow parsed/i));
  },
});
