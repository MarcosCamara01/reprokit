import { describe, expect, it } from "vitest";
import {
  decideInitialRunStatus,
  evaluateApproval,
  evaluateBinding,
  evaluateIntake,
  evaluateMachine,
  evaluateMerge,
  evaluateSpecApprover,
  evaluateVerify,
} from "./gates";
import { pickSpecCopy, resolveSpecBranchPath, specCopyPath } from "./catalog";
import { DEFAULT_POLICY } from "./types";

describe("evaluateIntake", () => {
  it("blocks empty or vague tickets", () => {
    const result = evaluateIntake({ title: "bug", body: "broken" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("needs_info");
      expect(result.gate).toBe("intake");
    }
  });

  it("accepts a ticket with reproduction signal", () => {
    const result = evaluateIntake({
      title: "Checkout 500",
      body: "Steps to reproduce: open /checkout as a guest. Expected 200, actual 500.",
    });
    expect(result).toEqual({ ok: true, gate: "intake" });
  });
});

describe("evaluateBinding", () => {
  it("requires a GitHub owner/repo", () => {
    const result = evaluateBinding({ githubOwner: "acme", githubRepo: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("needs_info");
  });

  it("passes when both sides exist", () => {
    expect(
      evaluateBinding({ githubOwner: "acme", githubRepo: "app" }),
    ).toEqual({ ok: true, gate: "binding" });
  });

  it("asks which repo when a Linear ticket has no GitHub binding", () => {
    const result = evaluateBinding({
      githubOwner: null,
      githubRepo: null,
      source: "linear",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("needs_info");
      expect(result.reason).toMatch(/Which GitHub repository/i);
    }
  });
});

describe("evaluateApproval", () => {
  it("holds spec_implement until the spec is approved", () => {
    const result = evaluateApproval({
      pipeline: "spec_implement",
      trigger: "web",
      specStatus: "draft",
      policy: DEFAULT_POLICY,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("awaiting_approval");
  });

  it("lets an approved spec through", () => {
    expect(
      evaluateApproval({
        pipeline: "spec_implement",
        trigger: "web",
        specStatus: "approved",
        policy: DEFAULT_POLICY,
      }),
    ).toEqual({ ok: true, gate: "approval" });
  });

  it("always gates spec_implement even if the policy flag is off", () => {
    const result = evaluateApproval({
      pipeline: "spec_implement",
      trigger: "web",
      specStatus: "in_review",
      policy: { ...DEFAULT_POLICY, specRequiresApproval: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("awaiting_approval");
  });

  it("treats slash/web as bug-fix approval", () => {
    expect(
      evaluateApproval({
        pipeline: "bug_fix",
        trigger: "slash",
        policy: DEFAULT_POLICY,
      }),
    ).toEqual({ ok: true, gate: "approval" });
  });

  it("pauses between repro and fix when policy says so", () => {
    const result = evaluateApproval({
      pipeline: "bug_fix",
      trigger: "slash",
      policy: { ...DEFAULT_POLICY, pauseAfterRepro: true },
      justFinishedRepro: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("awaiting_approval");
  });
});

describe("evaluateMachine", () => {
  it("keeps the run queued when no machine is online", () => {
    const result = evaluateMachine({ online: false, harnessAvailable: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("queued");
  });

  it("keeps the run queued when the harness is missing", () => {
    const result = evaluateMachine({ online: true, harnessAvailable: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/harness/i);
  });
});

describe("evaluateVerify", () => {
  it("fails when the bug never reproduced", () => {
    const result = evaluateVerify({
      reproducedBeforeFix: false,
      reproducedAfterFix: null,
      checksPassed: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("failed");
  });

  it("fails when the bug still reproduces after the fix", () => {
    const result = evaluateVerify({
      reproducedBeforeFix: true,
      reproducedAfterFix: true,
      checksPassed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("failed");
  });

  it("fails when project checks fail", () => {
    const result = evaluateVerify({
      reproducedBeforeFix: true,
      reproducedAfterFix: false,
      checksPassed: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/checks/i);
  });

  it("passes a clean verify", () => {
    expect(
      evaluateVerify({
        reproducedBeforeFix: true,
        reproducedAfterFix: false,
        checksPassed: true,
      }),
    ).toEqual({ ok: true, gate: "verify" });
  });
});

describe("evaluateMerge", () => {
  it("never allows merge", () => {
    const result = evaluateMerge();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.gate).toBe("merge");
      expect(result.status).toBe("pr_open");
    }
  });
});

describe("decideInitialRunStatus", () => {
  it("queues a well-formed slash bug fix", () => {
    const result = decideInitialRunStatus({
      intake: {
        title: "Pay button 500",
        body: "Steps to reproduce on /pay. Expected 200, actual 500.",
      },
      binding: { githubOwner: "acme", githubRepo: "app" },
      approval: {
        pipeline: "bug_fix",
        trigger: "slash",
        policy: DEFAULT_POLICY,
      },
    });
    expect(result.status).toBe("queued");
    expect(result.blockedBy).toBeNull();
  });

  it("parks a spec without approval", () => {
    const result = decideInitialRunStatus({
      intake: {
        title: "Add CSV export",
        body: "Expected: users can export the table as CSV from settings.",
      },
      binding: { githubOwner: "acme", githubRepo: "app" },
      approval: {
        pipeline: "spec_implement",
        trigger: "web",
        specStatus: "draft",
        policy: DEFAULT_POLICY,
      },
    });
    expect(result.status).toBe("awaiting_approval");
  });
});

describe("specCopyPath", () => {
  it("writes a reviewable markdown path from the ticket identifier", () => {
    expect(specCopyPath("ENG-12")).toBe("specs/ENG-12.md");
    expect(specCopyPath("#412")).toBe("specs/412.md");
  });

  it("ignores path traversal in artifact metadata", () => {
    expect(resolveSpecBranchPath("ENG-12", "../etc/passwd")).toBe("specs/ENG-12.md");
    expect(resolveSpecBranchPath("ENG-12", "specs/ENG-12.md")).toBe("specs/ENG-12.md");
  });

  it("picks the latest spec artifact for the branch copy", () => {
    const copy = pickSpecCopy({
      identifier: "#412",
      artifacts: [
        { kind: "spec", excerpt: "old", metadata: { branchPath: "specs/412.md" } },
        {
          kind: "spec",
          excerpt: "# Feature\n",
          metadata: { intent: "write_on_branch", branchPath: "specs/412.md" },
        },
      ],
    });
    expect(copy).toMatchObject({ path: "specs/412.md", markdown: "# Feature\n" });
  });
});

describe("evaluateSpecApprover", () => {
  it("lets a solo founder self-approve", () => {
    expect(
      evaluateSpecApprover({
        authorId: "founder",
        approverId: "founder",
        approverRole: "owner",
        approverCount: 1,
      }),
    ).toEqual({ ok: true, selfApprove: true });
  });

  it("blocks self-approve when the org has two or more approvers", () => {
    const result = evaluateSpecApprover({
      authorId: "author",
      approverId: "author",
      approverRole: "owner",
      approverCount: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/two or more approvers/i);
  });

  it("lets a different owner approve", () => {
    expect(
      evaluateSpecApprover({
        authorId: "author",
        approverId: "reviewer",
        approverRole: "approver",
        approverCount: 2,
      }),
    ).toEqual({ ok: true, selfApprove: false });
  });

  it("rejects members who are not approvers", () => {
    const result = evaluateSpecApprover({
      authorId: "author",
      approverId: "member",
      approverRole: "member",
      approverCount: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/owners and approvers/i);
  });
});
