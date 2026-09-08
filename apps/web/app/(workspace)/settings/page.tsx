import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@atrium/ui";
import {
  getDb,
  isDatabaseConfigured,
  findLinearConnection,
  listBindingsForOrg,
  type LinearConnectionMetadata,
} from "@atrium/db";
import {
  getValidLinearAccessToken,
  linearOAuthConfigured,
  linearWebhookPublicPath,
} from "@atrium/api";
import { LinearTracker } from "@atrium/trackers";
import { requireWorkspace } from "@/lib/workspace";
import {
  deleteRepoBindingAction,
  disconnectLinearAction,
  saveRepoBindingAction,
} from "./actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linear?: string }>;
}) {
  const { linear } = await searchParams;
  const { workspace, dbUnavailable } = await requireWorkspace();
  const dbReady = !dbUnavailable && workspace && isDatabaseConfigured();
  const db = dbReady ? getDb() : null;
  const bindings = db && workspace ? await listBindingsForOrg(db, workspace.organization.id) : [];

  const token =
    db && workspace ? await getValidLinearAccessToken(db, workspace.organization.id) : null;
  let linearOrg: LinearConnectionMetadata | null = null;
  let teams: Array<{ id: string; key: string; name: string }> = [];
  if (db && workspace && token) {
    const connection = await findLinearConnection(db, workspace.organization.id);
    linearOrg = (connection?.metadata ?? null) as LinearConnectionMetadata | null;
    try {
      const tracker = new LinearTracker({ accessToken: token.token });
      const viewer = await tracker.viewerWorkspace();
      teams = viewer.teams;
      linearOrg = {
        ...linearOrg,
        organizationName: workspaceName(viewer.organization.name, linearOrg),
        organizationUrlKey: viewer.organization.urlKey,
      };
    } catch {
      // Cached metadata is enough when Linear is briefly unreachable.
    }
  }

  const appUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const webhookUrl = `${appUrl}${linearWebhookPublicPath()}`;
  const oauthReady = linearOAuthConfigured();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-sm font-medium">Settings</h1>
      {linear === "connected" ? (
        <p className="text-sm text-primary">Linear workspace connected.</p>
      ) : null}
      {linear === "oauth_failed" ? (
        <p className="text-sm text-destructive">Linear OAuth failed. Try connecting again.</p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>GitHub App</CardTitle>
          <CardDescription>Webhook URL: /webhooks/github</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Set GITHUB_WEBHOOK_SECRET and the App credentials in the environment.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Linear</CardTitle>
          <CardDescription>
            OAuth with app:assignable / app:mentionable. Agent Sessions hit this
            control plane, not Eve on the machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="font-mono text-xs text-muted-foreground">Webhook URL: {webhookUrl}</p>
          {!oauthReady ? (
            <p className="text-muted-foreground">
              Set LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET, and LINEAR_WEBHOOK_SECRET.
            </p>
          ) : token ? (
            <div className="flex items-center justify-between gap-3">
              <p>
                Connected
                {linearOrg?.organizationName ? ` · ${linearOrg.organizationName}` : ""}
              </p>
              <form action={disconnectLinearAction}>
                <Button type="submit" variant="outline" size="sm">
                  Disconnect
                </Button>
              </form>
            </div>
          ) : (
            <a
              href="/api/linear/connect"
              className="inline-flex h-8 w-fit items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Connect Linear workspace
            </a>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Repo bindings</CardTitle>
          <CardDescription>
            Linear team/project → GitHub owner/repo. Without a binding, Linear runs
            park in needs_info.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {bindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bindings yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {bindings.map((binding) => (
                <li key={binding.id} className="flex items-center justify-between gap-2">
                  <span className="font-mono">
                    {binding.githubOwner}/{binding.githubRepo}
                    {binding.linearTeamId
                      ? ` · team ${binding.linearTeamId.slice(0, 8)}`
                      : ""}
                    {binding.linearProjectId ? ` · project` : ""}
                    {` · ${binding.defaultHarness}`}
                  </span>
                  <form action={deleteRepoBindingAction}>
                    <input type="hidden" name="bindingId" value={binding.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={saveRepoBindingAction} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Field name="githubOwner" label="GitHub owner" required />
              <Field name="githubRepo" label="GitHub repo" required />
              <Field name="defaultBranch" label="Default branch" placeholder="main" />
              <div className="flex flex-col gap-1">
                <Label htmlFor="defaultHarness">Default harness</Label>
                <select
                  id="defaultHarness"
                  name="defaultHarness"
                  defaultValue="claude"
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="claude">claude</option>
                  <option value="codex">codex</option>
                  <option value="cursor">cursor</option>
                </select>
              </div>
              {teams.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="linearTeamId">Linear team</Label>
                  <select
                    id="linearTeamId"
                    name="linearTeamId"
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                    defaultValue=""
                  >
                    <option value="">None</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.key} · {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <Field name="linearTeamId" label="Linear team id" />
              )}
              <Field name="linearProjectId" label="Linear project id" />
            </div>
            <Button type="submit" size="sm">
              Save binding
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Policies</CardTitle>
          <CardDescription>
            Auto-intake off. Specs always require approval. Pause after repro off. Never
            merge.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

function workspaceName(
  live: string,
  cached: LinearConnectionMetadata | null,
): string | undefined {
  return live || cached?.organizationName;
}

function Field({
  name,
  label,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} placeholder={placeholder} required={required} />
    </div>
  );
}
