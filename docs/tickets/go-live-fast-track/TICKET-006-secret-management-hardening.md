# Ticket 006: Move Runtime Secrets to Secure Storage

## Context
Production should not rely on ad-hoc environment setup for secrets.

## Goal
Use a secure secret management path for all sensitive runtime values.

## Scope
- Deployment environment variables and secret injection.
- Documentation and rotation process.

## Implementation Strategy (Current)
- Primary path: Coolify-first deployment with secrets managed in Coolify.
- Backup path: existing Caddy plus repository workflows/manual deployment remains operational.
- Shared env contract: both paths use the same backend env variable names to avoid code forks.

## Execution Checklist
- Runbook and done criteria: `docs/deployment/SECRET-MANAGEMENT.md`
- Caddy fallback runbook: `docs/deployment/CADDY-CONFIG.md`

## Tasks
- Inventory sensitive variables (tokens, credentials, signing keys).
- Store secrets in host or platform secret manager.
- Remove any sensitive defaults from app config.
- Document rotation procedure and owner.

## Definition of Done
- No hardcoded secrets in repo.
- Deployment uses secure secret source.
- Rotation process documented and tested once.

## Acceptance Criteria
- New environment can be bootstrapped without exposing secrets in code.

## Priority
P0
