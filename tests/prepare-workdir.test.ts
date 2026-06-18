import { describe, expect, it } from "vitest";
import type { IssueContext } from "../src/types.ts";
import { publicCloneUrlForIssue } from "../src/workflow/prepare-workdir.ts";

function issue(repo: Partial<IssueContext["repository"]> = {}): IssueContext {
  return {
    provider: "github",
    id: "1",
    number: 1,
    url: "https://github.com/MarcosCamara01/reprokit/issues/1",
    title: "test",
    body: "",
    labels: [],
    comments: [],
    repository: {
      owner: "MarcosCamara01",
      name: "reprokit",
      defaultBranch: "main",
      ...repo,
    },
    parsedBug: { summary: "test", reproductionSteps: ["run test"] },
  };
}

describe("publicCloneUrlForIssue", () => {
  it("strips credentials from authenticated clone URLs", () => {
    expect(
      publicCloneUrlForIssue(
        issue({ cloneUrl: "https://x-access-token:secret@github.com/MarcosCamara01/reprokit.git" }),
        "https://x-access-token:secret@github.com/MarcosCamara01/reprokit.git",
      ),
    ).toBe("https://github.com/MarcosCamara01/reprokit.git");
  });

  it("derives a public GitHub URL when provider metadata is available", () => {
    expect(
      publicCloneUrlForIssue(
        issue({ cloneUrl: undefined }),
        "https://x-access-token:secret@github.com/MarcosCamara01/reprokit.git",
      ),
    ).toBe("https://github.com/MarcosCamara01/reprokit.git");
  });
});
