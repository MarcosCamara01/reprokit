import { describe, expect, it } from "vitest";
import { buildReproPrompt } from "../src/workers/prompts.ts";
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
});
