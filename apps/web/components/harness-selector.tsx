"use client";

import { HARNESS_IDS, type HarnessId } from "@atrium/domain";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function HarnessSelector({
  runId,
  harness,
  machineId,
  machines,
}: {
  runId: string;
  harness: HarnessId;
  machineId: string | null;
  machines: Array<{ id: string; name: string; status: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const response = await fetch(`/api/runs/${runId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        harness: data.get("harness"),
        machineId: data.get("machineId") || null,
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `HTTP ${response.status}`);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Harness
          <select
            name="harness"
            defaultValue={harness}
            className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
          >
            {HARNESS_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Machine
          <select
            name="machineId"
            defaultValue={machineId ?? ""}
            className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
          >
            <option value="">First compatible</option>
            {machines.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.status})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-8 rounded-md border border-border px-3 text-xs"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? <p className="text-xs text-status-failed">{error}</p> : null}
    </form>
  );
}
