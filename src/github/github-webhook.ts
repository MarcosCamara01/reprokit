import { createHmac, timingSafeEqual } from "node:crypto";
import { parseIssueCommand, type IssueCommand } from "../utils/command-parser.ts";
import { buildGitHubWorkflow } from "../app.ts";
import { createLogger } from "../utils/logger.ts";
import type { IssueRef, WorkerProvider } from "../types.ts";

const log = createLogger("webhook");
const GENERATED_COMMENT_PREFIXES = [
  "# Reproduction Report",
  "# Pre-Fix Reproduction Report",
  "# Fix Report",
  "# Post-Fix Verification Report",
  "# Fix Blocked",
  "# Fix Ready For Review",
  "# Workflow Stopped",
  "# Worker Comparison",
  "# More Information Needed",
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
  commands: IssueCommand[];
  autoWorker?: WorkerProvider;
}

/**
 * Extract an actionable command from a GitHub webhook payload.
 * Supports `issue_comment` (created), `issues` (opened with a command in body),
 * and optional automatic repro/fix for newly opened issues.
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
    return { ref: refFrom(payload), commands: [command] };
  }

  if (eventName === "issues") {
    if (payload.action !== "opened") return null;
    const command = parseIssueCommand(payload.issue?.body ?? "");
    if (command.type !== "unknown") return { ref: refFrom(payload), commands: [command] };

    const auto = autoOpenedIssueCommands();
    if (!auto) return null;
    return { ref: refFrom(payload), ...auto };
  }

  return null;
}

function isGeneratedAgentComment(body: string): boolean {
  const trimmed = body.trimStart();
  return GENERATED_COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function envFlag(name: string): boolean {
  const raw = process.env[name]?.toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function autoOpenedIssueCommands():
  | { commands: IssueCommand[]; autoWorker?: WorkerProvider }
  | null {
  const shouldFix = envFlag("AUTO_FIX_ON_NEW_ISSUE");
  const shouldRepro = shouldFix || envFlag("AUTO_REPRO_ON_NEW_ISSUE");
  if (!shouldRepro) return null;

  const worker = autoIssueWorker();
  const commands: IssueCommand[] = [{ type: "repro" }];
  if (!shouldFix) return worker ? { commands, autoWorker: worker } : { commands };

  commands.push(worker ? { type: "fix", provider: worker } : { type: "fix" });
  return worker ? { commands, autoWorker: worker } : { commands };
}

function autoIssueWorker(): WorkerProvider | undefined {
  const raw = (process.env.AUTO_ISSUE_WORKER ?? process.env.AUTO_FIX_WORKER)?.toLowerCase();
  return raw === "codex" || raw === "claude" ? raw : undefined;
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

  const { ref, commands, autoWorker } = parsed;
  if (!ref.owner || !ref.repo || !ref.id) {
    return { handled: false, reason: "missing repo/issue coordinates" };
  }

  log.info("Handling commands from webhook", { ref, commands });
  const workflow = buildGitHubWorkflow(ref.owner, ref.repo);
  // Run async; webhook responses should return quickly. Errors are logged.
  void (async () => {
    for (const command of commands) {
      if (command.type === "repro" && autoWorker) {
        await workflow.runRepro(ref, autoWorker);
      } else {
        await workflow.dispatch(ref, command);
      }
    }
  })().catch((err) => {
    log.error("Workflow dispatch failed", { error: String(err) });
  });

  return { handled: true };
}
