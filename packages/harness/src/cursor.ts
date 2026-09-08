import type { Harness, HarnessEvent, HarnessHealth, HarnessJob } from "./types";
import { runVersion, spawnCommand, which } from "./spawn";
import { parseStreamJsonLine, splitLines } from "./stream";

const BIN = process.env.ATRIUM_CURSOR_BIN ?? "agent";

/**
 * Cursor CLI binary is `agent`. Isolation is our git worktree (cwd), not `agent -w`.
 */
export const cursorHarness: Harness = {
  id: "cursor",
  async health(): Promise<HarnessHealth> {
    const resolved = await which("agent", process.env.ATRIUM_CURSOR_BIN);
    if (!resolved) return { available: false, loggedIn: false };
    const version = await runVersion(resolved);
    return {
      available: version.available,
      version: version.version,
      loggedIn: version.loggedIn,
    };
  },
  async *run(job: HarnessJob): AsyncIterable<HarnessEvent> {
    const bin = (await which("agent", process.env.ATRIUM_CURSOR_BIN)) ?? BIN;
    const args = ["-p", job.prompt, "--force", "--output-format", "stream-json"];
    yield {
      type: "progress",
      message: `cursor agent -p (worktree ${job.worktree}, not -w)`,
    };
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
