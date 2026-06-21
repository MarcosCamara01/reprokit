---
description: >-
  Use for bugs in install, package manager behavior, lockfiles, build tooling,
  Vite, tsx, Vitest, ESLint, Node version, module resolution, CI-only failures,
  or version skew.
---

# Dependency And Tooling Debugging

Reproduce tooling failures with the same package manager, Node version, and
script path the project expects.

## First Checks

- Read `package.json`, lockfile, engines, and detected package manager.
- Run the exact failing script before trying alternatives.
- Capture Node version, package manager, command, and first relevant error.
- Distinguish install failure, typecheck failure, test failure, build failure,
  and runtime failure.

## Common Root Causes

- Node version below `engines`.
- Lockfile and package manager mismatch.
- ESM/CJS interop or extension resolution mismatch.
- Test environment differs from app runtime.
- Generated files missing before build.
- CI has different env vars, working directory, or shell.
- Dependency minor version changed behavior.

## Fix Bias

- Prefer script/config fixes over dependency changes.
- Do not add or upgrade dependencies unless explicitly approved.
- Do not delete lockfiles or regenerate them blindly.
- If a dependency change is truly required, stop and report the human approval
  requirement.
