/**
 * Small helpers shared by the Eve `agent/tools/*` wrappers. Kept in `src/` (not
 * under `agent/tools/`) so Eve doesn't mistake it for a tool file.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadLocalEnv } from "./utils/load-env.ts";
import { GitHubIssueProvider } from "./providers/github-provider.ts";
import { ensureRunDirs, runPaths } from "./utils/paths.ts";
import {
  githubClientFromEnvOrGitHubApp,
  hasGitHubAppEnv,
} from "./github/github-client.ts";

loadLocalEnv();

export type RunArtifactName =
  | "last-repro.json"
  | "last-post-fix-repro.json"
  | "last-fix.json"
  | "last-checks.json";

type AuthAttributeValue = string | readonly string[] | undefined;

interface EveLikeToolContext {
  readonly session?: {
    readonly auth?: {
      readonly current?: {
        readonly attributes?: Readonly<Record<string, AuthAttributeValue>>;
      } | null;
    };
  };
}

export function githubProvider(owner?: string, repo?: string): GitHubIssueProvider {
  return GitHubIssueProvider.fromEnv(owner, repo);
}

function firstString(value: AuthAttributeValue): string | undefined {
  if (typeof value === "string") return value;
  return value?.[0];
}

function repoFromContext(ctx?: EveLikeToolContext): { owner?: string; repo?: string } {
  const repository = firstString(ctx?.session?.auth?.current?.attributes?.repository);
  if (!repository) return {};
  const [owner, repo] = repository.split("/", 2);
  return { owner, repo };
}

function installationIdFromContext(ctx?: EveLikeToolContext): string | undefined {
  return (
    firstString(ctx?.session?.auth?.current?.attributes?.installation_id) ||
    process.env.GITHUB_APP_INSTALLATION_ID
  );
}

export async function githubProviderForTool(
  ctx?: EveLikeToolContext,
  owner?: string,
  repo?: string,
): Promise<GitHubIssueProvider> {
  const contextRepo = repoFromContext(ctx);
  const resolvedOwner = owner ?? contextRepo.owner ?? process.env.GITHUB_OWNER;
  const resolvedRepo = repo ?? contextRepo.repo ?? process.env.GITHUB_REPO;
  if (!resolvedOwner || !resolvedRepo) {
    throw new Error(
      "GitHub owner/repo not provided. Pass them explicitly, set GITHUB_OWNER / GITHUB_REPO, " +
        "or dispatch through Eve's native GitHub channel so repository context is available.",
    );
  }

  const installationId = installationIdFromContext(ctx);
  const client =
    installationId && hasGitHubAppEnv()
      ? await githubClientFromEnvOrGitHubApp(installationId)
      : undefined;
  return new GitHubIssueProvider({
    owner: resolvedOwner,
    repo: resolvedRepo,
    client,
  });
}

/** Persist a worker result so a later tool/turn can read it (durable handoff). */
export function persistWorkerResult(
  key: string | number,
  name: RunArtifactName,
  value: unknown,
): string {
  const paths = runPaths(key);
  ensureRunDirs(paths);
  const file = join(paths.workerOutput, name);
  writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

export function readWorkerResult<T>(
  key: string | number,
  name: RunArtifactName,
): T | null {
  const file = join(runPaths(key).workerOutput, name);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}
