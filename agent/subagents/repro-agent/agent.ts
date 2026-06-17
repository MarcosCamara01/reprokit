import { defineAgent } from "eve";
import { agentModel } from "../../lib/model.ts";

export default defineAgent({
  description: "Reproduce reported bugs in an isolated checkout without applying fixes.",
  model: agentModel,
});
