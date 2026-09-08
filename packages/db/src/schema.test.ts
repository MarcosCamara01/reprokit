import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_RUN_STATUSES,
  HARNESS_IDS,
  PIPELINES,
  TRIGGERS,
} from "@atrium/domain";
import {
  agentRun,
  agentRunStatusEnum,
  harnessEnum,
  pipelineEnum,
  triggerEnum,
} from "./schema/index";

describe("drizzle schema", () => {
  it("exposes every kanban column on agent_run.status", () => {
    expect(agentRun.status.enumValues).toEqual([...AGENT_RUN_STATUSES]);
    expect(agentRunStatusEnum.enumValues).toEqual([...AGENT_RUN_STATUSES]);
  });

  it("covers harness, pipeline, and trigger enums", () => {
    expect(harnessEnum.enumValues).toEqual([...HARNESS_IDS]);
    expect(pipelineEnum.enumValues).toEqual([...PIPELINES]);
    expect(triggerEnum.enumValues).toEqual([...TRIGGERS]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("live database", () => {
  it("DATABASE_URL is present for live checks", () => {
    expect(process.env.DATABASE_URL).toMatch(/^postgres/);
  });
});

describe("lease SQL", () => {
  it("uses FOR UPDATE SKIP LOCKED", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "repos/runtime.ts"), "utf8");
    expect(source).toContain("FOR UPDATE SKIP LOCKED");
  });
});
