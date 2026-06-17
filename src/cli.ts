/**
 * Local CLI to drive the workflow without a webhook. Useful for testing the
 * end-to-end flow against a real GitHub issue.
 *
 *   npm run cli -- repro  --issue 123 --owner acme --repo widgets
 *   npm run cli -- fix    --issue 123 --worker codex
 *   npm run cli -- compare --issue 123
 *   npm run cli -- stop   --issue 123
 *
 * Owner/repo default to GITHUB_OWNER / GITHUB_REPO from the environment.
 * Set WORKER_MOCK=1 to exercise the flow without configured workers.
 */
import { buildGitHubWorkflow } from "./app.ts";
import { parseIssueCommand } from "./utils/command-parser.ts";
import type { IssueRef, WorkerProvider } from "./types.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const verb = process.argv[2];
  if (!verb || verb === "--help" || verb === "-h") {
    console.log(
      "Usage: npm run cli -- <repro|fix|compare|stop> --issue <n> [--owner o --repo r] [--worker codex|claude]",
    );
    process.exit(verb ? 0 : 1);
  }

  const issue = arg("issue");
  if (!issue) {
    console.error("Missing --issue <number>");
    process.exit(1);
  }

  const owner = arg("owner") ?? process.env.GITHUB_OWNER;
  const repo = arg("repo") ?? process.env.GITHUB_REPO;
  if (!owner || !repo) {
    console.error("Missing repo coordinates. Pass --owner/--repo or set GITHUB_OWNER/GITHUB_REPO.");
    process.exit(1);
  }

  const worker = arg("worker") as WorkerProvider | undefined;
  // Re-use the same parser the webhook uses, so CLI and webhook behave identically.
  const command = parseIssueCommand(worker ? `/${verb} ${worker}` : `/${verb}`);
  if (command.type === "unknown") {
    console.error(`Unknown command: ${verb}`);
    process.exit(1);
  }

  const ref: IssueRef = { provider: "github", owner, repo, id: issue };
  const workflow = buildGitHubWorkflow(owner, repo);
  await workflow.dispatch(ref, command);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
