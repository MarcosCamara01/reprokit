import type { AgentRunPhase, AgentRunStatus, HarnessId, Pipeline } from "./catalog";
import { evaluateMerge, evaluateVerify } from "./gates";

export type HardStop = {
  category: string;
  reason: string;
  needs: string;
};

export type PipelineFacts = {
  pipeline: Pipeline;
  intakeOk: boolean;
  pauseAfterRepro: boolean;
  diagnosed: boolean;
  reproducedBeforeFix: boolean | null;
  implemented: boolean;
  checksPassed: boolean | null;
  verified: boolean;
  reproducedAfterFix: boolean | null;
  prOpened: boolean;
  specCopied: boolean;
  specCriteriaMet: boolean | null;
  compareReports: Partial<Record<HarnessId, string>>;
  compareHarnesses: HarnessId[];
  needsInfo?: string[] | null;
  hardStop?: HardStop | null;
};

export type PipelineCommand =
  | { type: "needs_info"; questions: string[] }
  | { type: "hard_stop"; stop: HardStop }
  | {
      type: "diagnose";
      phase: AgentRunPhase;
      permission: "readonly";
      harness?: HarnessId;
    }
  | { type: "write_spec"; phase: "implementing" }
  | { type: "implement"; phase: "fixing" | "implementing"; permission: "edits" }
  | { type: "checks"; phase: "verifying" }
  | { type: "verify"; phase: "verifying"; permission: "readonly" }
  | { type: "open_pr" }
  | { type: "finish"; status: Exclude<AgentRunStatus, "queued" | "running">; reason?: string };

export function emptyFacts(pipeline: Pipeline): PipelineFacts {
  return {
    pipeline,
    intakeOk: true,
    pauseAfterRepro: false,
    diagnosed: false,
    reproducedBeforeFix: null,
    implemented: false,
    checksPassed: null,
    verified: false,
    reproducedAfterFix: null,
    prOpened: false,
    specCopied: false,
    specCriteriaMet: null,
    compareReports: {},
    compareHarnesses: [],
  };
}

export function nextPipelineCommand(facts: PipelineFacts): PipelineCommand {
  if (facts.hardStop) {
    return { type: "hard_stop", stop: facts.hardStop };
  }
  if (facts.needsInfo && facts.needsInfo.length > 0) {
    return { type: "needs_info", questions: facts.needsInfo };
  }
  if (!facts.intakeOk) {
    return {
      type: "needs_info",
      questions: [
        "Please add reproduction steps, expected vs actual behavior, and environment.",
      ],
    };
  }

  switch (facts.pipeline) {
    case "bug_repro":
      return nextBugRepro(facts);
    case "bug_fix":
      return nextBugFix(facts);
    case "compare":
      return nextCompare(facts);
    case "spec_implement":
      return nextSpecImplement(facts);
  }
}

function nextBugRepro(facts: PipelineFacts): PipelineCommand {
  if (!facts.diagnosed) {
    return { type: "diagnose", phase: "diagnosing", permission: "readonly" };
  }
  if (facts.reproducedBeforeFix === true) {
    return { type: "finish", status: "done", reason: "Bug reproduced (diagnose-only)." };
  }
  return {
    type: "finish",
    status: "failed",
    reason: "Bug did not reproduce; no PR.",
  };
}

function nextBugFix(facts: PipelineFacts): PipelineCommand {
  if (!facts.diagnosed) {
    return { type: "diagnose", phase: "diagnosing", permission: "readonly" };
  }

  const before = evaluateVerify({
    reproducedBeforeFix: facts.reproducedBeforeFix,
    reproducedAfterFix: null,
    checksPassed: null,
  });
  if (!before.ok && facts.reproducedBeforeFix === false) {
    return { type: "finish", status: "failed", reason: before.reason };
  }

  if (facts.pauseAfterRepro && !facts.implemented) {
    return {
      type: "finish",
      status: "awaiting_approval",
      reason: "Policy pause_after_repro is on; waiting for a human to continue.",
    };
  }

  if (!facts.implemented) {
    return { type: "implement", phase: "fixing", permission: "edits" };
  }

  if (facts.checksPassed === null) {
    return { type: "checks", phase: "verifying" };
  }

  const afterChecks = evaluateVerify({
    reproducedBeforeFix: facts.reproducedBeforeFix,
    reproducedAfterFix: null,
    checksPassed: facts.checksPassed,
  });
  if (!afterChecks.ok && facts.checksPassed === false) {
    return { type: "finish", status: "failed", reason: afterChecks.reason };
  }

  if (!facts.verified) {
    return { type: "verify", phase: "verifying", permission: "readonly" };
  }

  const verify = evaluateVerify({
    reproducedBeforeFix: facts.reproducedBeforeFix,
    reproducedAfterFix: facts.reproducedAfterFix,
    checksPassed: facts.checksPassed,
  });
  if (!verify.ok) {
    return { type: "finish", status: "failed", reason: verify.reason };
  }

  if (!facts.prOpened) {
    return { type: "open_pr" };
  }

  const merge = evaluateMerge();
  return { type: "finish", status: "pr_open", reason: merge.reason };
}

function nextSpecImplement(facts: PipelineFacts): PipelineCommand {
  if (!facts.specCopied) {
    return { type: "write_spec", phase: "implementing" };
  }
  if (!facts.implemented) {
    return { type: "implement", phase: "implementing", permission: "edits" };
  }
  if (facts.checksPassed === null) {
    return { type: "checks", phase: "verifying" };
  }
  if (facts.checksPassed === false) {
    return {
      type: "finish",
      status: "failed",
      reason: "Project checks failed after the change.",
    };
  }
  if (!facts.verified) {
    return { type: "verify", phase: "verifying", permission: "readonly" };
  }
  if (facts.specCriteriaMet === false) {
    return {
      type: "finish",
      status: "failed",
      reason: "Implementation does not meet spec criteria; no PR.",
    };
  }
  if (!facts.prOpened) {
    return { type: "open_pr" };
  }
  const merge = evaluateMerge();
  return { type: "finish", status: "pr_open", reason: merge.reason };
}

function nextCompare(facts: PipelineFacts): PipelineCommand {
  const remaining = facts.compareHarnesses.filter((id) => !(id in facts.compareReports));
  const next = remaining[0];
  if (next) {
    return {
      type: "diagnose",
      phase: "diagnosing",
      permission: "readonly",
      harness: next,
    };
  }
  return {
    type: "finish",
    status: "done",
    reason: "Compare reports collected. No automatic winner.",
  };
}

export const MISSING_HARNESS_PREFIX = "machine missing harness";

export function missingHarnessMessage(harness: HarnessId): string {
  return `${MISSING_HARNESS_PREFIX}: ${harness}`;
}
