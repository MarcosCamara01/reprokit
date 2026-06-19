# Claude — Project Context

This project uses the SDD Protocol. Read these files before starting any task:

1. **[.sdd/workflow.md](.sdd/workflow.md)** — commands, permissions, stop points, anti-patterns
2. **[.sdd/project-overview.md](.sdd/project-overview.md)** — what this app is, its non-goals, domains, and definition of done
3. **[.sdd/conventions.md](.sdd/conventions.md)** — project-specific conventions and patterns
4. **[.sdd/autonomy.md](.sdd/autonomy.md)** — delegated self-approval policy for agent autonomy

Before treating any stop point as delegated, read `.sdd/autonomy.md`, identify its
`Mode`, and apply its `Operating Mode` as the default behavior. Self-approval is allowed
only when that policy explicitly permits it; otherwise stop for human input.

## Quick Reference

### Project setup
| Intent | Command |
|---|---|
| Initialize project context (new) | `/bootstrap` |
| Initialize project context (existing codebase) | `/bootstrap --scan` |
| Discovery-only scan, no `.sdd/` writes | `/scan` |
| Refresh conventions from current project state | `/conventions-sync` |

### Exploration and research artifacts
| Intent | Command |
|---|---|
| Research / ask without changing files | `/ask` |
| Compare options; may write research artifacts, not code | `/research` |
| Surface and validate assumptions | `/assume` |

### Feature flow
| Intent | Command |
|---|---|
| Scaffold a spec folder | `/spec-new` |
| Clarify a draft before planning | `/spec-clarify` |
| Generate technical plan (stops for approval) | `/spec-plan` |
| Execute approved plan one task at a time | `/spec-tasks` |
| Stop and report an implementation gap | `/impl-gap` |
| Document a Change Request for spec edits | `/spec-amend` |
| Cross-consistency analysis | `/spec-analyze` |
| Strict mechanical audit | `/verify` |
| Lighter human-touch final pass (writes `review-report.md`) | `/review` |
| Stage and commit | `/finish` |

### Multi-spec awareness
| Intent | Command |
|---|---|
| Show state of all active specs | `/spec-status` |
| Detect file-level conflicts between specs | `/spec-conflicts` |

### Other
| Intent | Command |
|---|---|
| Fix a confirmed bug | `/bugfix` → `/finish` |
| Restructure without behavior change | `/refactor` → `/finish` |

Standard workflow: `/spec-new` → `/spec-clarify` → `/spec-plan` → `/spec-tasks` → `/verify` → `/review` → `/finish`.

## Per-Phase Permissions

See `.sdd/workflow.md` §Per-Phase Permissions for the full table. Quick summary:

| Command | Edit specs | Edit code |
|---|---|---|
| `/spec-plan` | ✓ (`2-plan.md` only) | ✗ |
| `/spec-tasks` | ✓ (`3-tasks.md` checklist only) | ✓ |
| `/impl-gap` | ✓ (`impl-gaps.md` only) | ✗ |
| `/spec-amend` | ✓ (with CR approval) | ✗ |
| `/verify`, `/review` | ✗ | ✗ |
| `/bugfix`, `/refactor` | ✗ | ✓ |

## Files to Read Per Command

What context to load before running each command. Skip the rest — context budget is finite.

| Command | Always read | Conditionally read |
|---|---|---|
| `/bootstrap`, `/scan` | `package.json`, env files, manifests | Existing `.sdd/project-overview.md` if updating |
| `/spec-new` | `specs/_template/*` | — |
| `/spec-clarify`, `/spec-plan`, `/spec-tasks` | `specs/<feature>/*.md`, `.sdd/conventions.md`, `.sdd/project-overview.md` | Relevant domain file `.sdd/domains/<x>.md` |
| `/impl-gap` | `specs/<feature>/2-plan.md`, `specs/<feature>/3-tasks.md` | The current task code under work |
| `/verify`, `/spec-analyze` | All `specs/<feature>/*.md`, files listed in "Components Affected" | Prior `verify-report.md` / `analysis.md` |
| `/review` | `verify-report.md`, all changed files | Existing `review-report.md` if rerunning; `2-plan.md` tradeoffs section |
| `/bugfix` | Test suite root, the failing path | `.sdd/conventions.md` |
| `/refactor` | Target files, their tests, callers | — |
| `/conventions-sync` | `.sdd/conventions.md`, `package.json`, lint/format configs | — |
| `/finish` | `git status`, `git diff` | — |

## Anti-Patterns

See `.sdd/workflow.md` §Anti-Patterns for the full list. The three most critical:

1. **Edit approved spec files silently.** Use `/spec-amend` or explicit user approval.
2. **Improvise when the spec is ambiguous.** Use `/impl-gap` and stop.
3. **Skip `/verify` before `/finish`.** Mechanical checks exist to catch real problems.

## Active Specs

<!-- List specs currently in progress — completed specs live in specs/_done/ and are not active context.
- specs/auth-refresh/ — in /spec-tasks (task 3 of 5)
- specs/payments-v2/ — plan pending approval
-->

## Domain Files

Relevant domain context lives in `.sdd/domains/`. Read the relevant domain file before working in that area.

<!-- List domains present in this project, e.g.:
- [.sdd/domains/auth.md](.sdd/domains/auth.md)
- [.sdd/domains/payments.md](.sdd/domains/payments.md)
-->
