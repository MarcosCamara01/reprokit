import type { MembershipRole, Pipeline, SpecStatus, Trigger } from "./catalog";
import { LINEAR_MISSING_REPO_REASON } from "./catalog";
import type { GateBlocked, GateResult, PolicySnapshot } from "./types";

const INTAKE_HINTS =
  /\b(repro|reproduc|steps? to|expected|actual|stack(trace)?|error|fail(s|ed|ing)?)\b/i;

export type IntakeInput = {
  title: string;
  body: string;
};

export function evaluateIntake(input: IntakeInput): GateResult {
  const title = input.title.trim();
  const body = input.body.trim();
  const substantial = body.length >= 40 || INTAKE_HINTS.test(`${title}\n${body}`);
  if (!title || !substantial) {
    return {
      ok: false,
      gate: "intake",
      reason: "Ticket does not have enough information to attempt a run.",
      status: "needs_info",
    };
  }
  return { ok: true, gate: "intake" };
}

export type BindingInput = {
  githubOwner?: string | null;
  githubRepo?: string | null;
  source?: "github" | "linear";
};

export function evaluateBinding(input: BindingInput): GateResult {
  const owner = input.githubOwner?.trim();
  const repo = input.githubRepo?.trim();
  if (!owner || !repo) {
    return {
      ok: false,
      gate: "binding",
      reason:
        input.source === "linear"
          ? LINEAR_MISSING_REPO_REASON
          : "No GitHub repository is bound for this ticket.",
      status: "needs_info",
    };
  }
  return { ok: true, gate: "binding" };
}

export type ApprovalInput = {
  pipeline: Pipeline;
  trigger: Trigger;
  specStatus?: SpecStatus | null;
  policy: PolicySnapshot;
  justFinishedRepro?: boolean;
};

export function evaluateApproval(input: ApprovalInput): GateResult {
  if (input.pipeline === "spec_implement") {
    // Specs always need a human approval, even if the org policy flag is off.
    if (input.specStatus !== "approved") {
      return {
        ok: false,
        gate: "approval",
        reason: "Specs require human approval before implement.",
        status: "awaiting_approval",
      };
    }
    return { ok: true, gate: "approval" };
  }

  if (
    input.pipeline === "bug_fix" &&
    input.policy.pauseAfterRepro &&
    input.justFinishedRepro
  ) {
    return {
      ok: false,
      gate: "approval",
      reason: "Policy pause_after_repro is on; waiting for a human to continue.",
      status: "awaiting_approval",
    };
  }

  // Slash / board / Linear delegate / api is the approval for bugs.
  return { ok: true, gate: "approval" };
}

export type MachineInput = {
  online: boolean;
  harnessAvailable: boolean;
};

export function evaluateMachine(input: MachineInput): GateResult {
  if (!input.online) {
    return {
      ok: false,
      gate: "machine",
      reason: "No online machine is available to lease this run.",
      status: "queued",
    };
  }
  if (!input.harnessAvailable) {
    return {
      ok: false,
      gate: "machine",
      reason: "Online machine is missing the requested harness.",
      status: "queued",
    };
  }
  return { ok: true, gate: "machine" };
}

export type VerifyInput = {
  reproducedBeforeFix: boolean | null;
  reproducedAfterFix: boolean | null;
  checksPassed: boolean | null;
};

export function evaluateVerify(input: VerifyInput): GateResult {
  if (input.reproducedBeforeFix === false) {
    return {
      ok: false,
      gate: "verify",
      reason: "Bug did not reproduce; no PR.",
      status: "failed",
    };
  }
  if (input.checksPassed === false) {
    return {
      ok: false,
      gate: "verify",
      reason: "Project checks failed after the change.",
      status: "failed",
    };
  }
  if (input.reproducedAfterFix === true) {
    return {
      ok: false,
      gate: "verify",
      reason: "Bug still reproduces after the fix; no PR.",
      status: "failed",
    };
  }
  return { ok: true, gate: "verify" };
}

export function evaluateMerge(): GateBlocked {
  return {
    ok: false,
    gate: "merge",
    reason: "Atrium never merges. Human review of the PR is required.",
    status: "pr_open",
  };
}

export type ReadinessInput = {
  intake: IntakeInput;
  binding: BindingInput;
  approval: ApprovalInput;
};

export function decideInitialRunStatus(input: ReadinessInput): {
  status: "needs_info" | "awaiting_approval" | "queued";
  blockedBy: GateResult | null;
} {
  const intake = evaluateIntake(input.intake);
  if (!intake.ok) {
    return { status: "needs_info", blockedBy: intake };
  }
  const binding = evaluateBinding(input.binding);
  if (!binding.ok) {
    return { status: "needs_info", blockedBy: binding };
  }
  const approval = evaluateApproval(input.approval);
  if (!approval.ok) {
    return { status: "awaiting_approval", blockedBy: approval };
  }
  return { status: "queued", blockedBy: null };
}

export type SpecApproverInput = {
  authorId: string;
  approverId: string;
  approverRole: MembershipRole;
  /** Count of members with role owner or approver. */
  approverCount: number;
};

export type SpecApproverResult =
  | { ok: true; selfApprove: boolean }
  | { ok: false; reason: string };

/**
 * Specs always need approval. Solo founder (one approver in the org) may
 * self-approve; that fact is recorded and shown in the UI. With two or more
 * approvers, author ≠ approver.
 */
export function evaluateSpecApprover(input: SpecApproverInput): SpecApproverResult {
  if (input.approverRole !== "owner" && input.approverRole !== "approver") {
    return { ok: false, reason: "Only owners and approvers can approve specs." };
  }
  const selfApprove = input.authorId === input.approverId;
  if (selfApprove && input.approverCount >= 2) {
    return {
      ok: false,
      reason:
        "Author cannot approve their own spec when the organization has two or more approvers.",
    };
  }
  return { ok: true, selfApprove };
}
