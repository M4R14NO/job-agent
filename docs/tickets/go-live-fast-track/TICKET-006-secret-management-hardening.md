# Ticket 006: Move Runtime Secrets to Secure Storage

## Context
Production should not rely on ad-hoc environment setup for secrets.

## Goal
Use a secure secret management path for all sensitive runtime values.

## Scope
- Deployment environment variables and secret injection.
- Documentation and rotation process.

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
