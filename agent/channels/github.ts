import {
  defaultGitHubAuth,
  githubChannel,
  type GitHubCiPayload,
  type GitHubComment,
  type GitHubConversationKind,
  type GitHubIssueEvent,
} from "eve/channels/github";
import { parseIssueCommand } from "../../src/utils/command-parser.ts";

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
  "# Human Decision Needed",
];

interface DispatchCommentInput {
  body: string;
  botName?: string;
  conversationKind: GitHubConversationKind;
  author?: Pick<NonNullable<GitHubComment["author"]>, "login" | "type">;
}

export function shouldDispatchGitHubComment(input: DispatchCommentInput): boolean {
  if (isIgnoredComment(input.body, input.author, input.botName)) return false;

  const command = parseIssueCommand(input.body);
  if (command.type !== "unknown") {
    return input.conversationKind === "issue";
  }

  return mentionsBot(input.body, input.botName);
}

export function shouldDispatchOpenedIssue(input: {
  action: string;
  body: string;
  autoFix?: boolean;
  autoRepro?: boolean;
}): boolean {
  if (input.action !== "opened") return false;
  if (parseIssueCommand(input.body).type !== "unknown") return true;
  return input.autoFix === true || input.autoRepro === true || autoIssueEnabled();
}

function shouldDispatchCiFailure(event: GitHubCiPayload): boolean {
  return (
    event.action === "completed" &&
    event.conclusion === "failure" &&
    event.app.slug === "github-actions" &&
    event.pullRequests.length > 0
  );
}

function isIgnoredComment(
  body: string,
  author?: Pick<NonNullable<GitHubComment["author"]>, "login" | "type">,
  botName?: string,
): boolean {
  const trimmed = body.trimStart();
  if (trimmed.includes("<!-- eve:github:")) return true;
  if (GENERATED_COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return true;
  if (author?.type === "Bot") return true;
  const expectedBotLogin = botName ? `${botName}[bot]`.toLowerCase() : "";
  return expectedBotLogin.length > 0 && author?.login.toLowerCase() === expectedBotLogin;
}

function mentionsBot(body: string, botName?: string): boolean {
  const name = botName?.trim();
  if (!name) return false;
  return new RegExp(`@${escapeRegExp(name)}(?=$|[^A-Za-z0-9_-])`, "iu").test(body);
}

function autoIssueEnabled(): boolean {
  return envFlag("AUTO_FIX_ON_NEW_ISSUE") || envFlag("AUTO_REPRO_ON_NEW_ISSUE");
}

function envFlag(name: string): boolean {
  const raw = process.env[name]?.toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function issueBody(issue: GitHubIssueEvent): string {
  const body = issue.raw.body;
  return typeof body === "string" ? body : "";
}

function issueContext(issue: GitHubIssueEvent): string[] {
  const body = issueBody(issue);
  const command = parseIssueCommand(body);
  if (command.type !== "unknown") {
    return [`Issue body contains a Reprokit command. Process this command:\n\n${body}`];
  }

  const worker = process.env.AUTO_ISSUE_WORKER ?? process.env.AUTO_FIX_WORKER;
  if (envFlag("AUTO_FIX_ON_NEW_ISSUE")) {
    return [
      `Automatic Reprokit intake is enabled. Process this opened issue as /repro and then /fix${
        worker ? ` ${worker}` : ""
      }.`,
    ];
  }
  return ["Automatic Reprokit intake is enabled. Process this opened issue as /repro."];
}

const botName = process.env.GITHUB_APP_SLUG || process.env.GITHUB_BOT_NAME;

export default githubChannel({
  botName,
  credentials: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  onComment: (ctx, comment) =>
    shouldDispatchGitHubComment({
      author: comment.author,
      body: comment.body,
      botName,
      conversationKind: ctx.conversation.kind,
    })
      ? { auth: defaultGitHubAuth(ctx) }
      : null,
  onIssue: (ctx, issue) =>
    shouldDispatchOpenedIssue({ action: issue.action, body: issueBody(issue) })
      ? { auth: defaultGitHubAuth(ctx), context: issueContext(issue) }
      : null,
  onCheckSuite: (ctx, suite) =>
    shouldDispatchCiFailure(suite)
      ? {
          auth: defaultGitHubAuth(ctx),
          context: [`Triage failed check suite ${suite.checkSuiteId} at ${suite.headSha}.`],
        }
      : null,
  onCheckRun: (ctx, run) =>
    shouldDispatchCiFailure(run)
      ? {
          auth: defaultGitHubAuth(ctx),
          context: [`Triage failed check run ${run.checkRunId} at ${run.headSha}.`],
        }
      : null,
  onWorkflowRun: (ctx, run) =>
    shouldDispatchCiFailure(run)
      ? {
          auth: defaultGitHubAuth(ctx),
          context: [`Triage failed workflow run ${run.workflowRunId} at ${run.headSha}.`],
        }
      : null,
});
