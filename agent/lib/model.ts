import { mockModel, type MockModelRequest, type MockModelResponse } from "eve/evals";
import { loadLocalEnv } from "../../src/utils/load-env.ts";

loadLocalEnv();

/**
 * Model strings resolve through Vercel AI Gateway: OIDC when deployed on
 * Vercel, AI_GATEWAY_API_KEY when running locally. Provider keys (e.g. your
 * Google API key) are configured once in the dashboard via BYOK.
 * Docs: https://vercel.com/docs/ai-gateway
 */
const raw = process.env.AGENT_MODEL || "google/gemini-3.5-flash";

// Accept bare model ids from older .env files ("gemini-3.5-flash").
const gatewayModelId = raw.includes("/") ? raw : `google/${raw}`;
const modelId = gatewayModelId.replace(/^google\//, "");

type ParsedCommand = { type: string; provider?: string };

function latestParsedCommand(request: MockModelRequest): ParsedCommand | null {
  for (let i = request.toolResults.length - 1; i >= 0; i -= 1) {
    const result = request.toolResults[i];
    if (result?.name !== "parse_issue_command" || result.isError) continue;
    const output = result.output;
    if (typeof output === "object" && output !== null && "type" in output) {
      return output as ParsedCommand;
    }
  }
  return null;
}

function hasTool(request: MockModelRequest, name: string): boolean {
  return request.tools.some((tool) => tool.name === name);
}

function redactEvalSecrets(text: string): string {
  return text
    .replace(/gh[pousr]_[A-Za-z0-9_]{10,}/g, "[REDACTED]")
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, "[REDACTED]");
}

function evalMockResponse(request: MockModelRequest): MockModelResponse | string {
  const user = request.lastUserMessage ?? "";
  const lower = user.toLowerCase();
  const parsed = latestParsedCommand(request);

  if (
    !parsed &&
    hasTool(request, "parse_issue_command") &&
    /\/(?:reproduce|compare|cancel|repro|fix|stop)\b/i.test(user)
  ) {
    return {
      toolCalls: [
        {
          name: "parse_issue_command",
          input: { body: user },
        },
      ],
    };
  }

  if (/gh[pousr]_|api[_-]?key|token|password|secret\s*[:=]/i.test(user)) {
    return `I redacted sensitive material before writing a comment: ${redactEvalSecrets(user)}`;
  }

  if (lower.includes("hard stop") || lower.includes("human decision") || parsed?.type === "stop") {
    return [
      "Human decision needed.",
      "The workflow is parked and no branch, push, PR, or merge was created.",
      "Please decide how to proceed before the agent continues.",
    ].join("\n");
  }

  if (parsed?.type === "fix" || /\/fix\b/i.test(user)) {
    if (/check.*fail|checks.*fail|failed checks|failing checks|npm test failed/i.test(user)) {
      return [
        "Project checks failed, so PR creation is blocked.",
        "PR created: no.",
        "The next step is to inspect the failed check logs and retry after the fix is corrected.",
      ].join("\n");
    }
    return [
      "Fix flow acknowledged.",
      "Required order: run_fix_worker, run_project_checks, post-fix reproduction verification, then create_fix_pr with native approval.",
      "No auto-merge will happen.",
    ].join("\n");
  }

  if (parsed?.type === "repro" || /\/repro\b/i.test(user)) {
    if (/insufficient|vague|no steps|not enough|missing details/i.test(user)) {
      return [
        "I need more information before I can reproduce this safely.",
        "Please add concrete steps, expected behavior, actual behavior, environment, and any logs.",
        "PR created: no.",
      ].join("\n");
    }
    if (lower.includes("github")) {
      return [
        "GitHub issue flow parsed successfully.",
        "I will run reproduction-only evidence gathering and post a report.",
        "PR created: no.",
      ].join("\n");
    }
    return [
      "Reproduction flow started.",
      "I will gather evidence and post a report, then wait for /fix approval.",
      "PR created: no.",
    ].join("\n");
  }

  if (parsed?.type === "compare") {
    return "Compare flow acknowledged. Both workers stay read-only and no PR is created.";
  }

  return "Mock response";
}

export const agentModel =
  process.env.REPROKIT_EVAL_MOCK_MODEL === "1"
    ? mockModel({
        modelId,
        provider: "google",
        respond: evalMockResponse,
      })
    : gatewayModelId;
