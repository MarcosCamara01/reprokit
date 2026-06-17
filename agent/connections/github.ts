/**
 * GitHub connection — typed credentials/config for talking to GitHub.
 *
 * ⚠️ API CONFIDENCE: LOW.
 * The Eve concepts docs describe `connections/` as "typed integrations with
 * external services" and recommend pairing tools with Vercel Connect for
 * delegated credentials, but the exact `defineConnection` / connector API is not
 * published verbatim. We therefore keep this file as documentation + a plain
 * config object, and do the real GitHub auth in `src/github/github-client.ts`
 * (token from GITHUB_TOKEN). This keeps the MVP fully functional today.
 *
 * TODO(eve): after install, confirm the connection API in
 *   node_modules/eve/dist/docs/public/ and convert this to the real shape, e.g.
 *   a Vercel Connect connector (`vercel connect create github --triggers`) and
 *   `connectGithubCredentials("github/reprokit")`, then have tools read the
 *   delegated token from the connection instead of process.env.GITHUB_TOKEN.
 */

export const githubConnection = {
  service: "github" as const,
  // MVP auth strategy. Swap to Vercel Connect once the connection API is confirmed.
  auth: {
    strategy: "token" as const,
    tokenEnv: "GITHUB_TOKEN",
    // Designed-for (not required in MVP):
    appIdEnv: "GITHUB_APP_ID",
    privateKeyEnv: "GITHUB_PRIVATE_KEY",
    webhookSecretEnv: "GITHUB_WEBHOOK_SECRET",
  },
  scopes: ["repo"],
};

export default githubConnection;
