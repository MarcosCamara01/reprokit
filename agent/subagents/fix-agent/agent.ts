import { defineAgent } from "eve";
import { agentModel } from "../../lib/model.js";

export default defineAgent({
  description: "Apply the smallest safe fix for a reproduced issue after human approval.",
  model: agentModel,
});
