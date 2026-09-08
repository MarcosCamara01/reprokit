import { PairingForm } from "@/components/pairing-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@atrium/ui";
import { getDb, isDatabaseConfigured, listMachinesForOrg } from "@atrium/db";
import { requireWorkspace } from "@/lib/workspace";

export default async function MachinesPage() {
  const { workspace, dbUnavailable } = await requireWorkspace();
  const machines =
    !dbUnavailable && workspace && isDatabaseConfigured()
      ? await listMachinesForOrg(getDb(), workspace.organization.id)
      : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-sm font-medium">Machines</h1>
      <Card>
        <CardHeader>
          <CardTitle>Pair a machine</CardTitle>
          <CardDescription>
            Generate a 6-digit code, then run `atrium machine join --code` on the Mac mini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PairingForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Runtime fleet</CardTitle>
          <CardDescription>
            Heartbeat every 15s. Missing three beats marks the machine offline and fails
            running leases (requeueable).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {machines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No machines registered yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {machines.map((item) => {
                const loggedIn = item.capabilities.loggedIn;
                const missingLogin = (item.capabilities.harnesses ?? []).filter(
                  (harness) => loggedIn && loggedIn[harness] === false,
                );
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3">
                    <span>{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.status}
                      {item.capabilities.harnesses.length
                        ? ` · ${item.capabilities.harnesses.join(", ")}`
                        : ""}
                      {missingLogin.length ? ` · login ${missingLogin.join(",")}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
