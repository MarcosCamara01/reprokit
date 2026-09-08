import type { Database } from "@atrium/db";
import {
  findLinearConnection,
  type LinearConnectionMetadata,
  updateLinearConnectionSecrets,
} from "@atrium/db";
import { refreshLinearToken } from "./oauth";

const EXPIRY_SKEW_MS = 60_000;

export async function getValidLinearAccessToken(
  db: Database,
  organizationId: string,
): Promise<{ token: string; connectionId: string } | null> {
  const connection = await findLinearConnection(db, organizationId);
  if (!connection?.secretRef) return null;
  const metadata = (connection.metadata ?? {}) as LinearConnectionMetadata;
  const expired =
    typeof metadata.expiresAt === "number" &&
    metadata.expiresAt - EXPIRY_SKEW_MS <= Date.now();
  if (!expired) {
    return { token: connection.secretRef, connectionId: connection.id };
  }
  if (!metadata.refreshToken) {
    return { token: connection.secretRef, connectionId: connection.id };
  }
  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { token: connection.secretRef, connectionId: connection.id };
  }
  const refreshed = await refreshLinearToken({
    refreshToken: metadata.refreshToken,
    clientId,
    clientSecret,
  });
  await updateLinearConnectionSecrets(db, connection.id, {
    accessToken: refreshed.accessToken,
    metadata: {
      ...metadata,
      refreshToken: refreshed.refreshToken ?? metadata.refreshToken,
      expiresAt: refreshed.expiresAt,
      scopes: refreshed.scope ?? metadata.scopes,
    },
  });
  return { token: refreshed.accessToken, connectionId: connection.id };
}
