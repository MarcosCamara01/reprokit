import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseIssueCommand } from "../../src/utils/command-parser.js";

// Filename → tool name `parse_issue_command`.
export default defineTool({
  description:
    "Parse a GitHub/Linear issue comment body into a structured command " +
    "(/repro, /fix [codex|claude], /compare, /stop). Case- and whitespace-insensitive.",
  inputSchema: z.object({
    body: z.string().describe("The raw comment body to classify."),
  }),
  async execute({ body }) {
    return parseIssueCommand(body);
  },
});
