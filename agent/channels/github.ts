/**
 * GitHub channel — the entry point that turns GitHub issue/comment events into
 * agent sessions.
 *
 * ⚠️ API CONFIDENCE: PARTIAL.
 * Eve ships built-in channels and the docs list GitHub among them, but the exact
 * import path and option shape for the GitHub channel are NOT published verbatim
 * in the public docs at the time of writing. The code below mirrors the OFFICIAL
 * Slack template pattern as closely as the evidence allows:
 *
 *   // from vercel-labs/eve-slack-agent-template
 *   import { connectSlackCredentials } from "@vercel/connect/eve";
 *   import { slackChannel } from "eve/channels/slack";
 *   export default slackChannel({
 *     credentials: connectSlackCredentials(process.env.SLACK_CONNECTOR ?? "slack/my-agent"),
 *   });
 *
 * TODO(eve): after `npm install eve@latest`, confirm the GitHub channel against
 *   node_modules/eve/dist/docs/public/ and adjust the import + options below.
 *   Likely shapes to check for:
 *     - `import { githubChannel } from "eve/channels/github"`
 *     - `import { connectGithubCredentials } from "@vercel/connect/eve"`
 *     - a custom `defineChannel({ ... })` HTTP handler from "eve/channels"
 *
 * Until the built-in channel is confirmed, the GUARANTEED-WORKING intake is the
 * standalone webhook in `src/server.ts` (run `npm run webhook`), which verifies
 * the signature, parses the command, and drives the exact same workflow core.
 * Both paths converge on `src/github/github-webhook.ts` → `IssueWorkflow`.
 */

// The line below is the intended Eve-native wiring. It is commented out because
// the symbol names are unverified and an incorrect import would break `eve dev`.
// Uncomment and adjust once confirmed against the installed docs.
//
// import { connectGithubCredentials } from "@vercel/connect/eve";
// import { githubChannel } from "eve/channels/github";
//
// export default githubChannel({
//   credentials: connectGithubCredentials(
//     process.env.GITHUB_CONNECTOR ?? "github/reprokit",
//   ),
//   // The agent should react to issue + issue_comment events. The built-in
//   // channel is expected to start a session per event; instructions.md + the
//   // tools then drive /repro, /fix, /compare, /stop.
// });

export {}; // placeholder so this file is valid until the channel is wired.
