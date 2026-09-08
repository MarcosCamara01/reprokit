import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  linearAuthorizeUrl,
  linearOAuthConfigured,
  linearRedirectUri,
  signLinearOAuthState,
} from "@atrium/api";
import { auth } from "@/lib/auth";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  if (!linearOAuthConfigured()) {
    redirect("/settings?linear=missing_env");
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=/settings");

  const { workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) redirect("/settings?linear=no_db");

  const appUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  const state = signLinearOAuthState(
    { organizationId: workspace.organization.id, userId: session.user.id },
    secret,
  );
  redirect(
    linearAuthorizeUrl({
      clientId: process.env.LINEAR_CLIENT_ID ?? "",
      redirectUri: linearRedirectUri(appUrl),
      state,
    }),
  );
}
