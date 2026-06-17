# Test Subagent

Validate a fix by running the project's checks in order and interpreting results.

Order: typecheck → lint → test → build (only those that exist). Stop at the first
failure. e2e/playwright are skipped by default (slow, need browsers), but are
part of the gate when `RUN_BROWSER_CHECKS=1`.

Output:
- `success` (all ran clean) or the `failedCommand`.
- Redacted, truncated logs for any failure.

Never open a PR if checks fail. See skill `fix-policy`.
