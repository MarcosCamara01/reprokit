import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureUserWorkspace, getDb, isDatabaseConfigured } from "@atrium/db";
import { auth } from "./auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireWorkspace() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isDatabaseConfigured()) {
    return { session, workspace: null as null, dbUnavailable: true as const };
  }
  const db = getDb();
  const workspace = await ensureUserWorkspace(db, {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
  });
  return { session, workspace, dbUnavailable: false as const };
}
