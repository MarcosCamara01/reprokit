import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@atrium/ui";
import { SignOutButton } from "@/components/sign-out-button";
import { requireWorkspace } from "@/lib/workspace";

const NAV = [
  { href: "/board", label: "Board" },
  { href: "/inbox", label: "Inbox" },
  { href: "/specs", label: "Specs" },
  { href: "/machines", label: "Machines" },
  { href: "/settings", label: "Settings" },
];

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session } = await requireWorkspace();
  const initials = session.user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-11 items-center gap-6 border-b border-border px-4">
        <Link href="/board" className="font-mono text-sm tracking-tight">
          Atrium
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Avatar src={session.user.image} alt={session.user.name} fallback={initials} />
          <SignOutButton />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
