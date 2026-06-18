import { createHmac, timingSafeEqual } from "node:crypto";
import { parseIssueCommand, type IssueCommand } from "../utils/command-parser.ts";
import { buildGitHubWorkflow } from "../app.ts";
import { createLogger } from "../utils/logger.ts";
import type { IssueRef } from "../types.ts";

const log = createLogger("webhook");
const GENERATED_COMMENT_PREFIXES = [
  "# Reproduction Report",
  "# Worker Comparison",
];

/**
 * Verify a GitHub webhook signature (X-Hub-Signature-256: sha256=...).
 * Returns true if the secret is unset (with a warning) so local testing works,
 * but in any real deployment GITHUB_WEBHOOK_SECRET MUST be configured.
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret = process.env.GITHUB_WEBHOOK_SECRET,
): boolean {
  if (!secret) {
    log.warn("GITHUB_WEBHOOK_SECRET not set — skipping signature verification (NOT for production).");
    return true;
  }
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ParsedWebhook {
  ref: IssueRef;
  command: IssueCommand;
}

/**
 * Extract an actionable command from a GitHub webhook payload.
 * Supports `issue_comment` (created) and `issues` (opened, with a command in body).
 * Returns null for events/payloads we don't act on (e.g. PR comments, no command).
 */
export function parseWebhookEvent(
  eventName: string,
  payload: any,
): ParsedWebhook | null {
  if (eventName === "issue_comment") {
    if (payload.action !== "created") return null;
    // Ignore comments on pull requests (issue_comment fires for both).
    if (payload.issue?.pull_request) return null;
    const body = payload.comment?.body ?? "";
    if (isGeneratedAgentComment(body)) return null;
    const command = parseIssueCommand(body);
    if (command.type === "unknown") return null;
    return { ref: refFrom(payload), command };
  }

  if (eventName === "issues") {
    if (payload.action !== "opened") return null;
    const command = parseIssueCommand(payload.issue?.body ?? "");
    if (command.type === "unknown") return null;
    return { ref: refFrom(payload), command };
  }

  return null;
}

function isGeneratedAgentComment(body: string): boolean {
  const trimmed = body.trimStart();
  return GENERATED_COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function refFrom(payload: any): IssueRef {
  return {
    provider: "github",
    owner: payload.repository?.owner?.login,
    repo: payload.repository?.name,
    id: String(payload.issue?.number),
  };
}

/**
 * Top-level webhook handler: verify, parse, dispatch.
 * Returns a small status object; throws only on signature failure.
 */
export async function handleWebhook(args: {
  eventName: string;
  rawBody: string;
  signature?: string;
}): Promise<{ handled: boolean; reason?: string }> {
  if (!verifyGitHubSignature(args.rawBody, args.signature)) {
    throw new Error("Invalid webhook signature");
  }

  let payload: any;
  try {
    payload = JSON.parse(args.rawBody);
  } catch {
    return { handled: false, reason: "invalid JSON body" };
  }

  const parsed = parseWebhookEvent(args.eventName, payload);
  if (!parsed) return { handled: false, reason: "no actionable command" };

  const { ref, command } = parsed;
  if (!ref.owner || !ref.repo || !ref.id) {
    return { handled: false, reason: "missing repo/issue coordinates" };
  }

  log.info("Handling command from webhook", { ref, command });
  const workflow = buildGitHubWorkflow(ref.owner, ref.repo);
  // Run async; webhook responses should return quickly. Errors are logged.
  void workflow.dispatch(ref, command).catch((err) => {
    log.error("Workflow dispatch failed", { error: String(err) });
  });

  return { handled: true };
}
