# Skill: TypeScript Debugging

Reference for reproducing/fixing TypeScript bugs.

## Common areas

- **Type errors** — narrowing, generics, discriminated unions, `unknown` vs `any`.
- **Config** — `strict`, `moduleResolution`, `paths`, `lib`, `target`.
- **Runtime vs types** — a green `tsc` doesn't guarantee correct runtime behavior.
- **Declaration files** — missing/incorrect `@types/*`.

## Repro tips

- Reproduce the type error with `<pm> run typecheck` (or `tsc --noEmit`).
- Quote the exact diagnostic code (e.g. `TS2345`) in the report.
- Prefer fixing types at the source over `as`/`any` casts.

## After a fix

- Re-run typecheck and the test suite. A type-only fix still needs tests if it
  changes runtime behavior.
