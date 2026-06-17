# Skill: Next.js Debugging

Reference for reproducing/fixing Next.js bugs.

## Common areas

- **App Router vs Pages Router** — confirm which the repo uses.
- **Server vs Client Components** — `"use client"`, server actions, hydration
  mismatches.
- **Data fetching** — `fetch` caching, `revalidate`, `dynamic`, RSC payloads.
- **Routing** — dynamic segments, route groups, parallel/intercepting routes.
- **Build vs dev** — some bugs only appear in `next build` / `next start`.

## Repro tips

- Reproduce in `dev` first, then confirm in a production build if relevant.
- Check the browser console AND the server terminal.
- Hydration bugs: look for non-deterministic render (dates, random, `window`).

## Useful commands (detect scripts first)

- `<pm> run dev`, `<pm> run build`, `<pm> run start`
- `<pm> run lint`, `<pm> run typecheck`
