---
description: >-
  Use for reproducing, diagnosing, or fixing bugs in Next.js apps, especially
  routing, App Router vs Pages Router, Server/Client Component boundaries,
  hydration, caching, server actions, build-only failures, and Next.js dev/prod
  mismatches.
---

# Next.js Debugging

Start by identifying the router, rendering mode, and whether the failure is
dev-only, build-only, or production-only.

## First Checks

- Detect the Next.js version and scripts from `package.json`.
- Identify App Router (`app/`) vs Pages Router (`pages/`), or mixed usage.
- Check whether the failing code runs on the server, client, edge runtime, or
  during build.
- Reproduce in `next dev`; if relevant, confirm with `next build` and
  `next start`.

## Common Root Causes

- Hydration mismatch from dates, random values, locale formatting, browser-only
  APIs, or environment-dependent rendering.
- Missing `"use client"` for hooks, event handlers, refs, browser APIs, or
  client-only context.
- Accidentally moving server-only code into a client boundary.
- Cached `fetch`, `revalidate`, `dynamic`, or route segment settings returning
  stale data.
- Dynamic route params, route groups, parallel routes, or intercepted routes
  resolving differently than expected.
- Server actions or route handlers depending on missing cookies, headers, or
  runtime-specific APIs.

## Reproduction Tips

- Capture both browser console and server terminal output.
- For hydration bugs, compare server-rendered HTML assumptions with first
  client render inputs.
- For cache bugs, log whether data is static, dynamic, revalidated, or tagged.
- For build bugs, quote the exact build error and file/line.

## Fix Bias

- Fix the boundary, data lifetime, or runtime mismatch at the source.
- Avoid broad `dynamic = "force-dynamic"` or disabling caching unless the bug is
  truly about per-request data.
- Avoid wrapping code in client components just to silence an error; preserve
  server rendering where the app expects it.
