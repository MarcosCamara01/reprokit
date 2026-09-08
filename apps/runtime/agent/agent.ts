import { defineAgent } from "eve";

export default defineAgent({
  model: process.env.ATRIUM_EVE_MODEL ?? "google/gemini-2.5-flash",
});
