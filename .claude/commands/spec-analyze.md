Execute the /spec-analyze command defined in .sdd/workflow.md.

Cross-consistency analysis for a single spec. Check: goal-to-task coverage (every G-ID referenced by a task), plan-to-task coverage (every "Components Affected" entry referenced by a task), scope creep (tasks without goal IDs). Write specs/$ARGUMENTS/analysis.md. Do not modify any other file.

Spec: $ARGUMENTS
