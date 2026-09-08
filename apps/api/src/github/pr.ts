import { mintInstallationToken } from "./app-token";
import { GitHubTracker } from "@atrium/trackers";
import { redactSecrets } from "@atrium/domain";

export async function openPullRequest(input: {
  installationId: string;
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}): Promise<{ url: string; number: number }> {
  const { token } = await mintInstallationToken(input.installationId);
  const tracker = new GitHubTracker({ token });
  return tracker.openPullRequest({
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    body: redactSecrets(input.body),
    head: input.head,
    base: input.base,
  });
}

export async function commentOnIssue(input: {
  installationId: string;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}): Promise<void> {
  const { token } = await mintInstallationToken(input.installationId);
  const tracker = new GitHubTracker({ token });
  await tracker.postCommentOnRepo({
    owner: input.owner,
    repo: input.repo,
    issueNumber: input.issueNumber,
    body: redactSecrets(input.body),
  });
}
