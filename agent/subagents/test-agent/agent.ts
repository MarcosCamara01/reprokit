import { defineAgent } from "eve";
import { agentModel } from "../../lib/model.js";

export default defineAgent({
  description: "Run and interpret project checks for a proposed fix.",
  model: agentModel,
});
