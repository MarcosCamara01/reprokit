import { defineAgent } from "eve";
import { agentModel } from "./lib/model.js";

/**
 * Runtime config for the Issue Repro & Fix Agent.
 *
 * Confirmed Eve API: `defineAgent({ model })` from "eve".
 * The model is provided by `agent/lib/model.ts`, which uses Google directly.
 * Docs: https://vercel.com/docs/eve  ·  https://vercel.com/docs/eve/concepts
 */
export default defineAgent({
  model: agentModel,
  // TODO(eve): additional runtime options (tool timeouts, sandbox config, max
  // steps, approvals policy) are not documented verbatim in the public docs.
  // After Eve upgrades, confirm the full option surface in node_modules/eve/docs/
  // and extend this object accordingly.
});
