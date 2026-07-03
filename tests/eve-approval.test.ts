import { describe, expect, it } from "vitest";
import createFixPrTool from "../agent/tools/create_fix_pr.ts";

describe("Eve approval gates", () => {
  it("requires native human approval before create_fix_pr can execute", async () => {
    const approval = (
      createFixPrTool as {
        approval?: (ctx: unknown) => unknown | Promise<unknown>;
      }
    ).approval;

    expect(approval).toBeTypeOf("function");
    await expect(Promise.resolve(approval?.({}))).resolves.toBe("user-approval");
  });
});
