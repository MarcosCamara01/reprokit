Execute the /verify command defined in .sdd/workflow.md.

Strict mechanical audit — read-only. Check: all tasks marked complete, every goal has an artifact, every acceptance scenario has a passing test, full test suite green, no out-of-scope file changes, no unresolved /impl-gap entries, no pending CRs. Write specs/$ARGUMENTS/verify-report.md. Do not modify code or specs.

Spec: $ARGUMENTS
