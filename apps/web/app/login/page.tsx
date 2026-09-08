import { redirect } from "next/navigation";
import { GitHubLoginButton } from "@/components/github-login-button";
import { getSession } from "@/lib/workspace";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/board");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <p className="font-mono text-xs text-muted-foreground">Atrium</p>
      <h1 className="mt-3 text-2xl font-medium tracking-tight">Sign in to the board</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GitHub is the only login. Machines pair separately; Linear is a tracker, not an identity.
      </p>
      <div className="mt-8">
        <GitHubLoginButton />
      </div>
    </main>
  );
}
