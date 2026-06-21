---
description: >-
  Use for bugs involving HTTP requests, fetch, API routes, webhooks, auth
  headers, cookies, CORS, retries, status codes, request/response schemas, or
  client-server contract mismatches.
---

# API And Network Debugging

Debug the contract between caller and receiver: method, URL, headers, body,
status, schema, auth, and timing.

## First Checks

- Identify the failing request: method, route, status, request body, response
  body, and caller.
- Check whether failure happens in browser, server, worker, webhook, or test.
- Confirm auth context: cookies, bearer token, CSRF, GitHub app token, session,
  or anonymous request.
- Capture network logs without printing secrets.

## Common Root Causes

- Client sends a shape the server no longer accepts.
- Server returns a shape the client does not handle.
- Missing or stale auth header/cookie.
- CORS/preflight mismatch.
- Retry or timeout hides the original status.
- Webhook signature, timestamp, or event type mismatch.
- Environment-specific base URL or proxy behavior.

## Repro Tips

- Prefer a focused integration test or route-handler test when available.
- Use curl or a local script only when it matches the real caller's headers and
  body.
- Record exact status codes and minimal response bodies.

## Fix Bias

- Fix the contract at the boundary and add validation or tests there.
- Do not broaden accepted input unless the product contract requires it.
- Do not log secrets while debugging auth.
