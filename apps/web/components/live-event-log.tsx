"use client";

import { useEffect, useState } from "react";

type EventRow = {
  id: string;
  seq: number;
  stream: string;
  level: string;
  message: string;
};

export function LiveEventLog({
  runId,
  initial,
  live,
}: {
  runId: string;
  initial: EventRow[];
  live: boolean;
}) {
  const [events, setEvents] = useState(initial);

  useEffect(() => {
    setEvents(initial);
  }, [initial]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/runs/${runId}/live`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { events?: EventRow[] } | null) => {
          if (body?.events) setEvents(body.events);
        })
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [live, runId]);

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No events yet. Logs show up when a machine posts to /runtime/events.
      </p>
    );
  }

  return (
    <ol className="flex max-h-[480px] flex-col gap-1 overflow-auto font-mono text-[12px] text-muted-foreground">
      {events.map((event) => (
        <li key={event.id}>
          <span className="text-foreground/70">{event.seq}</span> {event.message}
        </li>
      ))}
    </ol>
  );
}
