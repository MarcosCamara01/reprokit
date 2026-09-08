import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Textarea,
} from "@atrium/ui";
import { evaluateSpecApprover } from "@atrium/domain";
import {
  countApprovers,
  getDb,
  getMembershipForUser,
  getSpecWithTicket,
  isDatabaseConfigured,
  listApprovalsForSubject,
  listMachinesForOrg,
  listSpecVersions,
} from "@atrium/db";
import { requireWorkspace } from "@/lib/workspace";
import {
  approveSpecAction,
  implementSpecAction,
  newSpecVersionAction,
  requestSpecChangesAction,
  submitSpecForReviewAction,
} from "../actions";

export default async function SpecReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace || !isDatabaseConfigured()) notFound();

  const db = getDb();
  const row = await getSpecWithTicket(db, id);
  if (!row?.ticket || row.ticket.organizationId !== workspace.organization.id) {
    notFound();
  }

  const [approvals, versions, membership, approverCount, machines] = await Promise.all([
    listApprovalsForSubject(db, "spec", row.id),
    listSpecVersions(db, row.ticketId),
    getMembershipForUser(db, workspace.organization.id, session.user.id),
    countApprovers(db, workspace.organization.id),
    listMachinesForOrg(db, workspace.organization.id),
  ]);

  const canApprove = membership
    ? evaluateSpecApprover({
        authorId: row.authorId,
        approverId: session.user.id,
        approverRole: membership.role,
        approverCount,
      })
    : { ok: false as const, reason: "Not a member." };
  const approved = row.status === "approved";
  const onlineHarnesses = new Set(
    machines
      .filter((machine) => machine.status === "online")
      .flatMap((machine) => machine.capabilities.harnesses),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <Link href="/specs" className="text-xs text-muted-foreground hover:text-foreground">
        Specs
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {row.ticket.identifier}
          </span>
          <Badge>v{row.version}</Badge>
          <Badge variant="outline">{row.status}</Badge>
        </div>
        <h1 className="text-xl font-medium tracking-tight">{row.ticket.title}</h1>
        <p className="text-sm text-muted-foreground">
          Author {row.author?.name ?? row.authorId}
          {row.ticket.url ? (
            <>
              {" · "}
              <a href={row.ticket.url} className="text-primary underline">
                ticket
              </a>
            </>
          ) : null}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Spec</CardTitle>
          <CardDescription>Versioned markdown stored in Atrium. Runtime writes specs/{row.ticket.identifier.replace(/^#/, "")}.md onto the branch.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground/90">
            {row.bodyMarkdown}
          </pre>
        </CardContent>
      </Card>

      {versions.length > 1 ? (
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="text-xs font-medium text-muted-foreground">Versions</h2>
          <ul className="flex flex-col gap-1">
            {versions.map((version) => (
              <li key={version.id}>
                <Link
                  href={`/specs/${version.id}`}
                  className={version.id === row.id ? "text-foreground" : "text-muted-foreground"}
                >
                  v{version.version} · {version.status}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Approvals</CardTitle>
          <CardDescription>
            Specs always need approval. Solo founder self-approve is allowed and visible.
            Two or more approvers: author cannot approve.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approval records yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {approvals.map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5">
                  <span>
                    {item.status}
                    {item.approverId === row.authorId ? (
                      <Badge className="ml-2">Self-approved (solo founder)</Badge>
                    ) : null}
                  </span>
                  {item.comment ? (
                    <span className="text-muted-foreground">{item.comment}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {row.status === "draft" || row.status === "in_review" || row.status === "rejected" ? (
            <form action={submitSpecForReviewAction} className="flex flex-col gap-2">
              <input type="hidden" name="specId" value={row.id} />
              <Label htmlFor="bodyMarkdown">Edit before review</Label>
              <Textarea
                id="bodyMarkdown"
                name="bodyMarkdown"
                defaultValue={row.bodyMarkdown}
              />
              <Button type="submit" variant="secondary" size="sm">
                Submit for review
              </Button>
            </form>
          ) : null}

          {canApprove.ok && (row.status === "draft" || row.status === "in_review") ? (
            <form action={approveSpecAction} className="flex flex-col gap-2">
              <input type="hidden" name="specId" value={row.id} />
              <Label htmlFor="approve-comment">Comment (optional)</Label>
              <Textarea id="approve-comment" name="comment" />
              <Button type="submit" size="sm">
                {canApprove.selfApprove ? "Self-approve (solo founder)" : "Approve"}
              </Button>
            </form>
          ) : null}

          {!canApprove.ok && (row.status === "in_review" || row.status === "draft") ? (
            <p className="text-sm text-muted-foreground">{canApprove.reason}</p>
          ) : null}

          {membership &&
          (membership.role === "owner" || membership.role === "approver") &&
          (row.status === "in_review" || row.status === "draft") ? (
            <form action={requestSpecChangesAction} className="flex flex-col gap-2">
              <input type="hidden" name="specId" value={row.id} />
              <Label htmlFor="changes">Request changes</Label>
              <Textarea id="changes" name="comment" required />
              <Button type="submit" variant="outline" size="sm">
                Request changes
              </Button>
            </form>
          ) : null}

          {row.status === "rejected" ? (
            <form action={newSpecVersionAction} className="flex flex-col gap-2">
              <input type="hidden" name="specId" value={row.id} />
              <Label htmlFor="new-body">New version</Label>
              <Textarea id="new-body" name="bodyMarkdown" defaultValue={row.bodyMarkdown} />
              <Button type="submit" variant="secondary" size="sm">
                Open new draft version
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Implement</CardTitle>
          <CardDescription>
            Queues pipeline spec_implement. The spec copy is persisted as a run artifact
            so the runtime can write it onto the branch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approved ? (
            <form action={implementSpecAction} className="flex items-end gap-2">
              <input type="hidden" name="specId" value={row.id} />
              <div className="flex flex-col gap-1">
                <Label htmlFor="harness">Harness</Label>
                <select
                  id="harness"
                  name="harness"
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                  defaultValue="claude"
                >
                  {(["claude", "codex", "cursor"] as const).map((id) => (
                    <option key={id} value={id}>
                      {id}
                      {onlineHarnesses.has(id) ? "" : " (queued until a machine is up)"}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit">Implement with harness</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Approve the spec before implementing.
            </p>
          )}
          {approved && onlineHarnesses.size === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No online machine yet. The run will wait in queued until a machine leases it.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
