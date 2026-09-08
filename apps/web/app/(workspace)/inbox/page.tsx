import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@atrium/ui";
import { getDb, listTicketsForOrg } from "@atrium/db";
import { requireWorkspace } from "@/lib/workspace";
import { openTicketAsSpecAction, startBugFixAction } from "./actions";

export default async function InboxPage() {
  const { workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) {
    return (
      <main className="px-4 py-8 text-sm text-muted-foreground">
        Database is not configured.
      </main>
    );
  }

  const tickets = await listTicketsForOrg(getDb(), workspace.organization.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-sm font-medium">Inbox</h1>
        <p className="text-xs text-muted-foreground">
          GitHub + Linear mirror. The tracker stays the SoT for the ticket.
        </p>
      </div>
      {tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tickets yet. Slash commands and Linear Agent Sessions create them here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.map((ticket) => {
            const latestSpec = ticket.specs
              .slice()
              .sort((a, b) => b.version - a.version)[0];
            return (
              <li key={ticket.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {ticket.identifier}
                      </span>
                      <span>{ticket.title}</span>
                      <Badge variant="outline">{ticket.provider}</Badge>
                      <Badge>{ticket.kind}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2">
                    {latestSpec ? (
                      <Link
                        href={`/specs/${latestSpec.id}`}
                        className="text-xs text-primary underline"
                      >
                        Spec v{latestSpec.version} · {latestSpec.status}
                      </Link>
                    ) : (
                      <form action={openTicketAsSpecAction}>
                        <input type="hidden" name="ticketId" value={ticket.id} />
                        <Button type="submit" size="sm" variant="secondary">
                          Open as spec
                        </Button>
                      </form>
                    )}
                    <form action={startBugFixAction} className="flex items-center gap-2">
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <select
                        name="harness"
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                        defaultValue="claude"
                      >
                        <option value="claude">claude</option>
                        <option value="codex">codex</option>
                        <option value="cursor">cursor</option>
                      </select>
                      <Button type="submit" size="sm">
                        Fix
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
