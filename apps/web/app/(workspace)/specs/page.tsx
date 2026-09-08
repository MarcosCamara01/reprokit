import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@atrium/ui";
import { getDb, listSpecsForOrg } from "@atrium/db";
import { requireWorkspace } from "@/lib/workspace";

export default async function SpecsPage() {
  const { workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) {
    return (
      <main className="px-4 py-8 text-sm text-muted-foreground">
        Database is not configured.
      </main>
    );
  }

  const rows = await listSpecsForOrg(getDb(), workspace.organization.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-sm font-medium">Specs</h1>
        <p className="text-xs text-muted-foreground">
          draft → in_review → approved → implement. Always gated.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No specs yet. Open a ticket in Inbox or comment /spec on GitHub or Linear.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ spec, ticket }) => (
            <li key={spec.id}>
              <Link href={`/specs/${spec.id}`}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {ticket.identifier}
                      </span>
                      <span>{ticket.title}</span>
                      <Badge variant="outline">v{spec.version}</Badge>
                      <Badge>{spec.status}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {ticket.provider}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
