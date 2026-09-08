"use client";

import { Button } from "@atrium/ui";
import { authClient } from "@/lib/auth-client";

export function GitHubLoginButton() {
  return (
    <Button
      className="w-full"
      onClick={() => {
        void authClient.signIn.social({ provider: "github", callbackURL: "/board" });
      }}
    >
      Continue with GitHub
    </Button>
  );
}
