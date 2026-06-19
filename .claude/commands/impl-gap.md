Execute the /impl-gap command defined in .sdd/workflow.md.

Usage: /impl-gap <feature>

A task is blocked by ambiguity, contradiction, or technical impossibility. STOP execution. Create specs/<feature>/impl-gaps.md from the template if missing, then append a GAP entry with the current task, problem, impact, proposed resolution, action required, and resolution placeholder. Do not improvise — wait for human direction.

If the gap requires changing the spec:
- Escalate to /spec-amend. A formal CR is required before any approved spec edit.

Feature: $ARGUMENTS
