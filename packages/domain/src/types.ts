import type {
  AgentRunPhase,
  AgentRunStatus,
  ArtifactKind,
  HarnessId,
  MembershipRole,
  Pipeline,
  SpecStatus,
  TicketKind,
  TicketProvider,
  Trigger,
} from "./catalog";

export type TicketRef = {
  provider: TicketProvider;
  externalId: string;
  identifier: string;
};

export type TicketSnapshot = {
  ref: TicketRef;
  url: string;
  title: string;
  body: string;
  kind: TicketKind;
  labels: string[];
};

export type PolicySnapshot = {
  defaultHarness: HarnessId;
  concurrentRuns: number;
  autoIntake: boolean;
  specRequiresApproval: boolean;
  pauseAfterRepro: boolean;
};

export const DEFAULT_POLICY: PolicySnapshot = {
  defaultHarness: "claude",
  concurrentRuns: 1,
  autoIntake: false,
  specRequiresApproval: true,
  pauseAfterRepro: false,
};

export type AgentRunRecord = {
  id: string;
  organizationId: string;
  ticketId: string | null;
  machineId: string | null;
  pipeline: Pipeline;
  harness: HarnessId;
  status: AgentRunStatus;
  phase: AgentRunPhase | null;
  trigger: Trigger;
  prUrl: string | null;
  branchName: string | null;
  errorSummary: string | null;
  policySnapshot: PolicySnapshot;
};

export type Membership = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
};

export type SpecRecord = {
  id: string;
  ticketId: string;
  version: number;
  status: SpecStatus;
  authorId: string;
};

/** Job payload persisted on a RunArtifact so F1 can write the spec copy on the branch. */
export type SpecImplementArtifactMeta = {
  intent: "write_on_branch";
  branchPath: string;
  specId: string;
  specVersion: number;
  ticketIdentifier: string;
};

export type ArtifactRecord = {
  kind: ArtifactKind;
  excerpt: string;
};

export type GateName =
  | "intake"
  | "binding"
  | "approval"
  | "machine"
  | "verify"
  | "merge";

export type GateOk = { ok: true; gate: GateName };

export type GateBlocked = {
  ok: false;
  gate: GateName;
  reason: string;
  status: AgentRunStatus;
};

export type GateResult = GateOk | GateBlocked;
