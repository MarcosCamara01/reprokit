import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";

export type InstallationToken = {
  token: string;
  expiresAt: string;
};

function appCredentials(): { appId: string; pem: string } {
  const appId = process.env.GITHUB_APP_ID;
  const pem = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !pem) {
    throw Object.assign(new Error("GitHub App credentials are not configured"), {
      status: 503,
    });
  }
  return { appId, pem };
}

export async function mintGitHubAppJwt(): Promise<string> {
  const { appId, pem } = appCredentials();
  const key = createPrivateKey(pem);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(appId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 9 * 60)
    .sign(key);
}

export async function mintInstallationToken(
  installationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InstallationToken> {
  const jwt = await mintGitHubAppJwt();
  const response = await fetchImpl(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`installation token mint failed: ${response.status}`);
  }
  const body = (await response.json()) as { token: string; expires_at: string };
  return { token: body.token, expiresAt: body.expires_at };
}

export function githubCloneUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}
