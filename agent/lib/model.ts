import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { loadLocalEnv } from "../../src/utils/load-env.js";

loadLocalEnv();

const apiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY;

const modelId = (process.env.AGENT_MODEL || "gemini-3.5-flash").replace(/^google\//, "");
const google = createGoogleGenerativeAI(apiKey ? { apiKey } : undefined);

export const agentModel = google(modelId);
