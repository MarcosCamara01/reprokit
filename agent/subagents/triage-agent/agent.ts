import { defineAgent } from "eve";
import { agentModel } from "../../lib/model.ts";

export default defineAgent({
  description: "Classify incoming GitHub issues and identify missing reproduction details.",
  model: agentModel,
});
