import type { Harness, HarnessEvent, HarnessHealth, HarnessJob } from "./types";
import { runVersion, spawnCommand, which } from "./spawn";
import { parseStreamJsonLine, splitLines } from "./stream";

const BIN = process.env.ATRIUM_CODEX_BIN ?? "codex";

export const codexHarness: Harness = {
  id: "codex",
  async health(): Promise<HarnessHealth> {
    const resolved = await which("codex", process.env.ATRIUM_CODEX_BIN);
    if (!resolved) return { available: false, loggedIn: false };
    const version = await runVersion(resolved);
    return {
      available: version.available,
      version: version.version,
      loggedIn: version.loggedIn,
    };
  },
  async *run(job: HarnessJob): AsyncIterable<HarnessEvent> {
    const bin = (await which("codex", process.env.ATRIUM_CODEX_BIN)) ?? BIN;
    const sandbox = job.permission === "readonly" ? "read-only" : "workspace-write";
    const args = ["exec", "--sandbox", sandbox, "--skip-git-repo-check", job.prompt];
    yield { type: "progress", message: `codex exec sandbox=${sandbox}` };
    yield* relay(bin, args, job);
  },
};

async function* relay(
  bin: string,
  args: string[],
  job: HarnessJob,
): AsyncIterable<HarnessEvent> {
  let stdout = "";
  for await (const event of spawnCommand({
    command: bin,
    args,
    cwd: job.worktree,
    timeoutMs: job.timeoutMs,
  })) {
    if (event.type === "log" && event.stream === "stdout") {
      stdout += event.chunk;
      const { lines, rest } = splitLines(stdout);
      stdout = rest;
      for (const line of lines) {
        const parsed = parseStreamJsonLine(line);
        yield parsed ?? { type: "log", stream: "stdout", chunk: `${line}\n` };
      }
      continue;
    }
    yield event;
  }
}
