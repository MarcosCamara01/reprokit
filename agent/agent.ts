import { defineAgent } from "eve";

/**
 * Runtime config for the Issue Repro & Fix Agent.
 *
 * Confirmed Eve API: `defineAgent({ model })` from "eve".
 * Model strings resolve through Vercel AI Gateway.
 * Docs: https://vercel.com/docs/eve  ·  https://vercel.com/docs/eve/concepts
 */
export default defineAgent({
  model: "anthropic/claude-sonnet-4.6",
  // TODO(eve): additional runtime options (tool timeouts, sandbox config, max
  // steps, approvals policy) are not documented verbatim in the public docs.
  // After `npm install eve@latest`, confirm the full option surface in
  // node_modules/eve/dist/docs/public/ and extend this object accordingly.
});
