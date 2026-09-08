"use client";

import { useState } from "react";

export function PairingForm() {
  const [code, setCode] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function generate() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/machines/pair", { method: "POST" });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `HTTP ${response.status}`);
      return;
    }
    const body = (await response.json()) as { code: string; joinCommand: string };
    setCode(body.code);
    setCommand(body.joinCommand);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={pending}
        className="h-8 w-fit rounded-md border border-border px-3 text-xs"
      >
        {pending ? "Generating…" : "Generate pairing code"}
      </button>
      {code ? (
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <p className="font-mono text-2xl tracking-[0.35em]">{code}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Expires in 15 minutes. On the Mac mini:
          </p>
          <pre className="mt-1 overflow-auto text-[11px]">{command}</pre>
        </div>
      ) : null}
      {error ? <p className="text-xs text-status-failed">{error}</p> : null}
    </div>
  );
}
