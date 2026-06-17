# Ticket 009: Staging CD and Manual Production Release

## Goal
Deploy automatically to staging and require manual approval for production.

## Scope
- Deployment workflow.
- Environment separation.
- Caddy edge deployment in staging/prod.
- Optional observability stack deployment lane (Langfuse) as separate rollout stream.

## Tasks
- Add staging deployment job.
- Add production deployment job with manual approval gate.
- Add environment-specific configuration handling.
- Document release and rollback commands.
- Include Caddy config deployment and reload/restart step in staging/prod workflows.
- Run Ticket-005 validation checks post staging deployment before promotion.
- Document rollback for Caddy config regressions separately from app rollback.
- Reserve deployment workflow extension point for Langfuse self-hosted service rollout (Ticket-020).

## Definition of Done
- Merge to main deploys to staging.
- Production deploy requires explicit approval.
- Rollback steps are documented and tested once.
- Caddy edge deployment is part of the release path and validated in staging.

## Priority
P1

## Follow-up from Ticket-005
- Ticket-005 wurde im CI erfolgreich im localhost smoke setup verifiziert.
- In Ticket-009 ist zusaetzlich ein echter Domain-Nachweis fuer Staging/Production verpflichtend:
	- Redirect-Validierung gegen reale Staging/Prod-Hostnamen.
	- Security-Header-Pruefung gegen reale Staging/Prod-Hostnamen.
	- CORS-Allowlist-Checks mit realen Frontend-Origin(s).
	- Nachweis per Workflow-Run-Link und Artefaktprotokoll.
