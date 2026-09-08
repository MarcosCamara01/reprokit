/**
 * Eve is optional. CI and machines without a running Eve server stay on the
 * inline jobs channel (deterministic executeJob). A live Eve process is used
 * when we can health-check it.
 */
export function shouldSkipEve(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ATRIUM_EVE === "0") return true;
  if (env.CI === "true" && env.ATRIUM_EVE !== "1") return true;
  return false;
}

export function eveHealthUrl(jobsOrBaseUrl: string): string {
  const url = new URL(jobsOrBaseUrl);
  return `${url.origin}/eve/v1/health`;
}

export function eveJobsUrl(baseOrJobsUrl: string): string {
  const url = new URL(baseOrJobsUrl);
  if (url.pathname === "/jobs" || url.pathname.endsWith("/jobs")) {
    return `${url.origin}${url.pathname}`;
  }
  return `${url.origin}/jobs`;
}

export async function isEveHealthy(
  jobsOrBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(eveHealthUrl(jobsOrBaseUrl), {
      method: "GET",
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => null)) as { ok?: boolean; status?: string } | null;
    return body?.ok === true || body?.status === "ready" || response.ok;
  } catch {
    return false;
  }
}

export async function discoverEveJobsUrl(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (shouldSkipEve(env)) return null;
  const explicit = env.ATRIUM_EVE_JOBS_URL?.trim();
  if (explicit) {
    if (await isEveHealthy(explicit, fetchImpl)) return eveJobsUrl(explicit);
    return null;
  }
  if (env.ATRIUM_EVE !== "1") return null;
  const port = env.ATRIUM_EVE_PORT?.trim() || "2000";
  const local = `http://127.0.0.1:${port}`;
  if (await isEveHealthy(local, fetchImpl)) return eveJobsUrl(local);
  return null;
}
