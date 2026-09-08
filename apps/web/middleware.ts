import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = ["/board", "/runs", "/settings", "/machines", "/specs", "/inbox"];

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get("better-auth.session_token") ??
      request.cookies.get("__Secure-better-auth.session_token"),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (!isProtected) return NextResponse.next();

  if (!hasSessionCookie(request)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/board",
    "/board/:path*",
    "/runs/:path*",
    "/settings",
    "/settings/:path*",
    "/machines",
    "/machines/:path*",
    "/specs",
    "/specs/:path*",
    "/inbox",
    "/inbox/:path*",
  ],
};
