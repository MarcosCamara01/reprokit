import { redirect } from "next/navigation";
import {
  exchangeLinearCode,
  linearRedirectUri,
  verifyLinearOAuthState,
} from "@atrium/api";
import { getDb, isDatabaseConfigured, upsertLinearConnection } from "@atrium/db";
import { LinearTracker } from "@atrium/trackers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  const parsed = verifyLinearOAuthState(state, secret);
  if (!code || !parsed) {
    redirect("/settings?linear=oauth_failed");
  }
  if (!isDatabaseConfigured()) redirect("/settings?linear=no_db");

  const appUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const clientId = process.env.LINEAR_CLIENT_ID ?? "";
  const clientSecret = process.env.LINEAR_CLIENT_SECRET ?? "";

  try {
    const tokens = await exchangeLinearCode({
      code,
      redirectUri: linearRedirectUri(appUrl),
      clientId,
      clientSecret,
    });
    const tracker = new LinearTracker({ accessToken: tokens.accessToken });
    const workspace = await tracker.viewerWorkspace();
    await upsertLinearConnection(getDb(), {
      organizationId: parsed.organizationId,
      linearOrganizationId: workspace.organization.id,
      accessToken: tokens.accessToken,
      metadata: {
        organizationName: workspace.organization.name,
        organizationUrlKey: workspace.organization.urlKey,
        linearOrganizationId: workspace.organization.id,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scope,
        actor: "app",
      },
    });
  } catch {
    redirect("/settings?linear=oauth_failed");
  }

  redirect("/settings?linear=connected");
}
