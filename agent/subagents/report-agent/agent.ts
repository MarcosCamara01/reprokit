import { defineAgent } from "eve";
import { agentModel } from "../../lib/model.ts";

export default defineAgent({
  description: "Render concise reproduction, comparison, and fix reports for issue comments.",
  model: agentModel,
});
