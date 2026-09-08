"use client";

import { Button } from "@atrium/ui";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void authClient.signOut({
          fetchOptions: { onSuccess: () => { window.location.href = "/login"; } },
        });
      }}
    >
      Sign out
    </Button>
  );
}
