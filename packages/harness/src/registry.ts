import type { HarnessId } from "@atrium/domain";
import { claudeHarness } from "./claude";
import { codexHarness } from "./codex";
import { cursorHarness } from "./cursor";
import type { Harness, HarnessHealth } from "./types";

const HARNESSES: Record<HarnessId, Harness> = {
  claude: claudeHarness,
  codex: codexHarness,
  cursor: cursorHarness,
};

export function getHarness(id: HarnessId): Harness {
  return HARNESSES[id];
}

export type MachineCapabilities = {
  harnesses: HarnessId[];
  loggedIn: Partial<Record<HarnessId, boolean>>;
  versions: Partial<Record<HarnessId, string>>;
};

export async function collectCapabilities(): Promise<{
  capabilities: MachineCapabilities;
  health: Record<HarnessId, HarnessHealth>;
}> {
  const ids: HarnessId[] = ["claude", "codex", "cursor"];
  const health = {} as Record<HarnessId, HarnessHealth>;
  const harnesses: HarnessId[] = [];
  const loggedIn: MachineCapabilities["loggedIn"] = {};
  const versions: MachineCapabilities["versions"] = {};

  for (const id of ids) {
    const result = await getHarness(id).health();
    health[id] = result;
    loggedIn[id] = result.loggedIn;
    if (result.version) versions[id] = result.version;
    if (result.available) harnesses.push(id);
  }

  return { capabilities: { harnesses, loggedIn, versions }, health };
}
