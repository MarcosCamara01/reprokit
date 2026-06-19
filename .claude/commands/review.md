Execute the /review command defined in .sdd/workflow.md.

Lighter human-touch final pass — runs AFTER /verify has reported green. Read the implementation qualitatively: clarity, naming, simplicity, leaky abstractions, copy-paste smell, comments that lie. Write specs/$ARGUMENTS/review-report.md with findings, follow-ups, or escalation. Don't enforce mechanical checks (that's /verify's job). If a structural issue is found, record `Result: ESCALATED` and escalate to /spec-amend instead of editing.

Spec: $ARGUMENTS
