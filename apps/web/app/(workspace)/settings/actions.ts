"use server";

import { revalidatePath } from "next/cache";
import { HARNESS_IDS, type HarnessId } from "@atrium/domain";
import { deleteLinearConnection, deleteRepoBinding, getDb, upsertRepoBinding } from "@atrium/db";
import { requireWorkspace } from "@/lib/workspace";

function isHarness(value: string): value is HarnessId {
  return (HARNESS_IDS as readonly string[]).includes(value);
}

function fail(message: string): never {
  throw new Error(message);
}

export async function saveRepoBindingAction(formData: FormData): Promise<void> {
  const { workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) fail("Database is not configured.");

  const githubOwner = String(formData.get("githubOwner") ?? "").trim();
  const githubRepo = String(formData.get("githubRepo") ?? "").trim();
  if (!githubOwner || !githubRepo) {
    fail("GitHub owner and repo are required.");
  }
  const harness = String(formData.get("defaultHarness") ?? "claude");
  await upsertRepoBinding(getDb(), {
    organizationId: workspace.organization.id,
    githubOwner,
    githubRepo,
    defaultBranch: String(formData.get("defaultBranch") ?? "main").trim() || "main",
    linearTeamId: String(formData.get("linearTeamId") ?? "").trim() || null,
    linearProjectId: String(formData.get("linearProjectId") ?? "").trim() || null,
    defaultHarness: isHarness(harness) ? harness : "claude",
  });
  revalidatePath("/settings");
}

export async function deleteRepoBindingAction(formData: FormData): Promise<void> {
  const { workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) fail("Database is not configured.");
  const bindingId = String(formData.get("bindingId") ?? "");
  if (!bindingId) fail("Missing binding.");
  await deleteRepoBinding(getDb(), {
    organizationId: workspace.organization.id,
    bindingId,
  });
  revalidatePath("/settings");
}

export async function disconnectLinearAction(): Promise<void> {
  const { workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) fail("Database is not configured.");
  await deleteLinearConnection(getDb(), workspace.organization.id);
  revalidatePath("/settings");
}
