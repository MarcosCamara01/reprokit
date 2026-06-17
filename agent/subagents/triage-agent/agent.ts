import { defineAgent } from "eve";
import { agentModel } from "../../lib/model.js";

export default defineAgent({
  description: "Classify incoming GitHub issues and identify missing reproduction details.",
  model: agentModel,
});
