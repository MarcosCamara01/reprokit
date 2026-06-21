import { describe, expect, it } from "vitest";
import { buildCodexArgs } from "../src/workers/codex-worker.ts";
import { buildClaudeArgs } from "../src/workers/claude-worker.ts";
import {
  buildFixPrompt,
  buildReproPrompt,
  WORKER_SKILL_FILES,
  workerSkillsBlock,
} from "../src/workers/prompts.ts";
import type { IssueContext } from "../src/types.ts";

const issue: IssueContext = {
  provider: "github",
  id: "20",
  number: 20,
  url: "https://github.com/acme/widgets/issues/20",
  title: "Widget labels are not normalized",
  body: "## Steps\n1. Run the focused test.\n\n## Expected\nLabels are normalized.\n\n## Actual\nLabels are unchanged.",
  labels: [],
  comments: [],
  parsedBug: {
    summary: "Widget labels are not normalized",
    expectedBehavior: "Labels are normalized.",
    actualBehavior: "Labels are unchanged.",
    reproductionSteps: ["Run the focused test."],
  },
};

describe("worker prompts", () => {
  it("includes extra reproduction context when provided", () => {
    const prompt = buildReproPrompt(
      issue,
      "Validate the current working tree, including uncommitted changes.",
    );

    expect(prompt).toContain("Additional context:");
    expect(prompt).toContain("Validate the current working tree");
  });

  it("embeds the SDD reproduce/diagnose protocol in the repro prompt", () => {
    const prompt = buildReproPrompt(issue);
    expect(prompt).toContain("Execution principles (SDD)");
    expect(prompt).toContain("Reproduce -> Diagnose");
    expect(prompt).toContain("ROOT CAUSE");
    expect(prompt).toContain("Worker skills:");
    expect(prompt).toContain("## root-cause-analysis.md");
    expect(prompt).toContain("## browser-playwright-debugging.md");
    // Hard-stop channel must remain wired.
    expect(prompt).toContain('"hardStop"');
  });

  it("embeds the SDD fix/validate protocol and scope guard in the fix prompt", () => {
    const prompt = buildFixPrompt(issue, "Pre-fix reproduction report.");
    expect(prompt).toContain("Fix -> Validate");
    expect(prompt).toContain("Scope guard");
    expect(prompt).toContain("out-of-scope");
    expect(prompt).toContain("Pre-fix reproduction report.");
    expect(prompt).toContain("## fix-policy.md");
    expect(prompt).toContain("## post-fix-verification.md");
  });

  it("loads every authored worker skill without frontmatter", () => {
    const block = workerSkillsBlock();
    for (const file of WORKER_SKILL_FILES) {
      expect(block).toContain(`## ${file}`);
    }
    expect(block).not.toContain("description: >-");
  });

  it("passes Claude Code model and effort overrides when provided", () => {
    expect(
      buildClaudeArgs("diagnose this", "claude-opus-4-8", "high", "acceptEdits"),
    ).toEqual([
      "-p",
      "--model",
      "claude-opus-4-8",
      "--effort",
      "high",
      "--permission-mode",
      "acceptEdits",
      "diagnose this",
    ]);
  });

  it("passes Codex model and effort overrides when provided", () => {
    expect(buildCodexArgs("fix this", "workspace-write", "gpt-5.5", "xhigh")).toEqual([
      "exec",
      "--sandbox",
      "workspace-write",
      "--model",
      "gpt-5.5",
      "--config",
      "model_reasoning_effort=\"xhigh\"",
      "fix this",
    ]);
  });
});
