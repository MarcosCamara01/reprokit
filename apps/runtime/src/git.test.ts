import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertCleanRemoteUrl, git, isSpecOnlyDiff, prepareWorktree, resolveInsideWorktree, writeSpecCopy } from "./git";
import { branchName, cacheDir, resolveAtriumHome, runDir } from "./config";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

describe("worktree helpers", () => {
  const previousHome = process.env.ATRIUM_HOME;

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ATRIUM_HOME;
    else process.env.ATRIUM_HOME = previousHome;
  });

  it("names branches and paths under ATRIUM_HOME", () => {
    process.env.ATRIUM_HOME = "/tmp/atrium-home-test";
    expect(resolveAtriumHome()).toBe("/tmp/atrium-home-test");
    expect(cacheDir("/tmp/a", "acme", "app")).toBe("/tmp/a/cache/acme/app.git");
    expect(runDir("/tmp/a", "run-1", "claude")).toBe("/tmp/a/runs/run-1-claude");
    expect(branchName("bug_fix", "#412", "abcdef12zzzz")).toBe("atrium/bug_fix/412/abcdef12");
  });

  it("refuses remotes that embed tokens", () => {
    expect(() => assertCleanRemoteUrl("https://x-access-token:ghs_secret@github.com/a/b.git")).toThrow(
      /token/,
    );
    expect(() => assertCleanRemoteUrl("https://github.com/a/b.git")).not.toThrow();
  });

  it("creates an isolated worktree from a bare cache", async () => {
    const root = tmp("atrium-git-");
    const origin = join(root, "origin");
    await git(["init", origin], root);
    await git(
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"],
      origin,
    );
    await git(["branch", "-M", "main"], origin);

    const prepared = await prepareWorktree({
      home: join(root, "home"),
      runId: "run-abc",
      owner: "acme",
      repo: "app",
      cloneUrl: origin,
      defaultBranch: "main",
      pipeline: "bug_fix",
      identifier: "#12",
      token: "unused-local",
    });

    const { stdout } = await git(["rev-parse", "--abbrev-ref", "HEAD"], prepared.worktree);
    expect(stdout.trim()).toBe(prepared.branch);
    const { stdout: remote } = await git(["remote", "get-url", "origin"], prepared.worktree);
    expect(remote.trim()).toBe(origin);
    expect(remote).not.toMatch(/unused-local/);
  });

  it("writes a spec copy inside the worktree and rejects escapes", () => {
    const root = tmp("atrium-spec-");
    expect(isSpecOnlyDiff(["specs/ENG-12.md"])).toBe(true);
    expect(isSpecOnlyDiff(["specs/ENG-12.md", "src/app.ts"])).toBe(false);
    const written = writeSpecCopy(root, "specs/ENG-12.md", "# Title");
    expect(written).toBe("specs/ENG-12.md");
    expect(() => resolveInsideWorktree(root, "../outside.md")).toThrow(/escapes/);
  });
});
