import { createHmac, timingSafeEqual } from "node:crypto";

export const LINEAR_AUTHORIZE_URL = "https://linear.app/oauth/authorize";
export const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";
export const LINEAR_OAUTH_SCOPES = "read,write,app:assignable,app:mentionable";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export type LinearOAuthState = {
  organizationId: string;
  userId: string;
  iat: number;
};

export function linearOAuthConfigured(): boolean {
  return Boolean(process.env.LINEAR_CLIENT_ID && process.env.LINEAR_CLIENT_SECRET);
}

export function linearRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/linear/callback`;
}

export function linearWebhookPublicPath(): string {
  return "/webhooks/linear";
}

export function linearAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: LINEAR_OAUTH_SCOPES,
    state: input.state,
    actor: "app",
    prompt: "consent",
  });
  return `${LINEAR_AUTHORIZE_URL}?${params.toString()}`;
}

export function signLinearOAuthState(
  input: { organizationId: string; userId: string },
  secret: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({ ...input, iat: Date.now() } satisfies LinearOAuthState),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyLinearOAuthState(
  state: string | null,
  secret: string,
  nowMs = Date.now(),
): LinearOAuthState | null {
  if (!state || !secret) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LinearOAuthState;
    if (!parsed.organizationId || !parsed.userId) return null;
    if (Math.abs(nowMs - parsed.iat) > STATE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type LinearTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
};

export async function exchangeLinearCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}): Promise<LinearTokenSet> {
  return requestLinearToken(
    {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    },
    input.fetch,
  );
}

export async function refreshLinearToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}): Promise<LinearTokenSet> {
  return requestLinearToken(
    {
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    },
    input.fetch,
  );
}

async function requestLinearToken(
  body: Record<string, string>,
  fetchFn: typeof fetch = fetch,
): Promise<LinearTokenSet> {
  const response = await fetchFn(LINEAR_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string | string[];
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Linear token exchange failed");
  }
  const scope = Array.isArray(payload.scope) ? payload.scope.join(",") : payload.scope;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt:
      typeof payload.expires_in === "number"
        ? Date.now() + payload.expires_in * 1000
        : undefined,
    scope,
  };
}
