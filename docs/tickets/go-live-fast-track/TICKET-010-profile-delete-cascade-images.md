# Ticket 010: Cascade Delete for Profile-Linked Images

## Goal
Ensure deleting a CV profile also removes orphaned linked image assets.

## Scope
- Backend profile delete behavior.
- Storage cleanup logic.

## Tasks
- Identify image linkage model from profile payload.
- Extend delete endpoint/store logic to remove orphan image files.
- Add safety checks to avoid deleting shared assets incorrectly.
- Add tests for profile delete with and without images.

## Definition of Done
- Profile deletion leaves no orphaned private profile images.
- Regression tests pass.

## Priority
P1
