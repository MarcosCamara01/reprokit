---
description: >-
  Use for reproducing, diagnosing, or fixing TypeScript bugs, including tsc
  failures, type narrowing, generics, module resolution, tsconfig issues,
  declaration files, runtime-vs-type mismatches, and unsafe any/assertion fixes.
---

# TypeScript Debugging

Treat the TypeScript diagnostic as evidence, not as the root cause by itself.

## First Checks

- Run the project typecheck script when present; otherwise use `tsc --noEmit`.
- Quote the exact diagnostic code, message, file, and line.
- Inspect `tsconfig` for `strict`, `module`, `moduleResolution`, `paths`,
  `target`, `lib`, JSX mode, and included files.
- Determine whether the issue is type-only or changes runtime behavior.

## Common Root Causes

- Value can be absent but the type assumes it is present.
- Union is not narrowed before property access.
- Generic constraint is too broad or too narrow.
- External library types changed or are missing.
- Path aliases work in TypeScript but not at runtime or test time.
- ESM/CJS or NodeNext resolution mismatch.
- Generated or declaration files drifted from runtime code.

## Fix Bias

- Prefer improving source types, schemas, guards, or call sites over `as any`.
- Use `unknown` plus narrowing for untrusted data.
- Use discriminated unions when behavior depends on a `kind` or `type` field.
- Keep type assertions local and justified when unavoidable.
- Re-run tests when the type fix changes runtime code.

## Anti-Patterns

- Do not silence diagnostics with blanket `any`, `// @ts-ignore`, or broad
  casts unless the report explicitly calls out why no safer fix is available.
- Do not change `tsconfig` to hide one local bug.
