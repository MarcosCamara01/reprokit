export function CompareReports({
  artifacts,
}: {
  artifacts: Array<{
    id: string;
    excerpt: string;
    metadata: { harness?: string; reproduced?: boolean; [key: string]: unknown };
  }>;
}) {
  if (artifacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Compare reports appear after diagnose runs finish on this machine.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {artifacts.map((artifact) => (
        <article key={artifact.id} className="rounded-md border border-border p-3">
          <p className="font-mono text-xs text-muted-foreground">
            {String(artifact.metadata.harness ?? "harness")}
            {typeof artifact.metadata.reproduced === "boolean"
              ? artifact.metadata.reproduced
                ? " · reproduced"
                : " · not reproduced"
              : ""}
          </p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[12px]">
            {artifact.excerpt || "(empty)"}
          </pre>
        </article>
      ))}
    </div>
  );
}
