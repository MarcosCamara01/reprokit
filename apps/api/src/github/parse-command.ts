import {
  DEFAULT_HARNESS,
  type HarnessId,
  HARNESS_IDS,
  type Pipeline,
} from "@atrium/domain";

export type SlashCommandName = "repro" | "fix" | "spec" | "stop" | "compare";

export type ParsedSlashCommand = {
  name: SlashCommandName;
  harness: HarnessId;
  pipeline: Pipeline | null;
  raw: string;
};

const COMMAND_RE =
  /(^|\n)\s*\/(repro|fix|spec|stop|compare)(?:\s+\[?(claude|codex|cursor)\]?)?/i;

const PIPELINE_BY_COMMAND: Record<SlashCommandName, Pipeline | null> = {
  repro: "bug_repro",
  fix: "bug_fix",
  spec: "spec_implement",
  stop: null,
  compare: "compare",
};

export function parseSlashCommand(body: string): ParsedSlashCommand | null {
  const match = COMMAND_RE.exec(body);
  if (!match) return null;
  const name = match[2]!.toLowerCase() as SlashCommandName;
  const harnessToken = match[3]?.toLowerCase();
  const harness = isHarness(harnessToken) ? harnessToken : DEFAULT_HARNESS;
  return {
    name,
    harness,
    pipeline: PIPELINE_BY_COMMAND[name],
    raw: match[0].trim(),
  };
}

function isHarness(value: string | undefined): value is HarnessId {
  return Boolean(value && (HARNESS_IDS as readonly string[]).includes(value));
}
