import { defineAgent } from "eve";
import { agentModel } from "./lib/model.ts";

/**
 * Runtime config for the Issue Repro & Fix Agent.
 *
 * The model is a Vercel AI Gateway id (see agent/lib/model.ts). Full option
 * surface for eve 0.20: node_modules/eve/docs/agent-config.md — reasoning,
 * modelOptions, limits, compaction, outputSchema, build, experimental.workflow.
 * Adjacent settings live elsewhere by design: per-tool approvals in
 * agent/tools/*.ts (see run_fix_worker.ts), sandbox in agent/sandbox/,
 * telemetry in agent/instrumentation.ts.
 */
export default defineAgent({
  model: agentModel,
});
