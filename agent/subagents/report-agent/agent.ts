import { defineAgent } from "eve";
import { agentModel } from "../../lib/model.js";

export default defineAgent({
  description: "Render concise reproduction, comparison, and fix reports for issue comments.",
  model: agentModel,
});
