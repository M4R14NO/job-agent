# Ticket 007: Dockerize Frontend and Backend (Non-Root)

## Goal
Provide production-grade container images for frontend and backend running as non-root.

## Scope
- Dockerfile for frontend.
- Dockerfile for backend.
- Runtime user and file permissions.

## Tasks
- Create multi-stage Dockerfile for frontend static build/runtime.
- Create Dockerfile for backend app runtime.
- Ensure non-root execution and minimal base images.
- Validate image startup and health endpoints.

## Definition of Done
- Both services build as images in CI/local.
- Containers run as non-root.
- Startup and health checks pass.

## Priority
P0
