import type { Harness, HarnessEvent, HarnessHealth, HarnessJob } from "./types";
import { runVersion, spawnCommand, which } from "./spawn";
import { parseStreamJsonLine, splitLines } from "./stream";

const BIN = process.env.ATRIUM_CLAUDE_BIN ?? "claude";

export const claudeHarness: Harness = {
  id: "claude",
  async health(): Promise<HarnessHealth> {
    const resolved = await which("claude", process.env.ATRIUM_CLAUDE_BIN);
    if (!resolved) return { available: false, loggedIn: false };
    const version = await runVersion(resolved);
    return {
      available: version.available,
      version: version.version,
      loggedIn: version.loggedIn,
    };
  },
  async *run(job: HarnessJob): AsyncIterable<HarnessEvent> {
    const bin = (await which("claude", process.env.ATRIUM_CLAUDE_BIN)) ?? BIN;
    const permissionMode = job.permission === "readonly" ? "plan" : "acceptEdits";
    const args = [
      "-p",
      job.prompt,
      "--permission-mode",
      permissionMode,
      "--output-format",
      "stream-json",
      "--verbose",
    ];
    yield { type: "progress", message: `claude ${permissionMode} in ${job.worktree}` };
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
