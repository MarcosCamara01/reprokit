import { getSession } from "./workspace";
import { ensureUserWorkspace, getDb, isDatabaseConfigured } from "@atrium/db";

export async function requireApiWorkspace() {
  const session = await getSession();
  if (!session) {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    throw Object.assign(new Error("DATABASE_URL is not set"), { status: 503 });
  }
  const workspace = await ensureUserWorkspace(getDb(), {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
  });
  return { session, workspace };
}
