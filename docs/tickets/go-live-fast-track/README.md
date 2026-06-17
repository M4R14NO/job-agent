# Go-Live Fast-Track Tickets

Dieses Verzeichnis enthaelt die technischen Tickets fuer den priorisierten Go-Live-Pfad ohne Scraping.

## Zielbild

- Production ohne Plattform-Scraping.
- Jobkontext nur durch Nutzerinput (Link/Text).
- DSGVO- und Security-Mindestanforderungen fuer einen sicheren ersten Launch.

## Aktueller Stand

- TICKET-001-disable-scraping-production.md: Erledigt
  - Backend-Feature-Flag `ENABLE_SCRAPING` vorhanden (Default aus).
  - `/search` und `/search/linkedin/enrich` sind bei deaktiviertem Scraping gesperrt.
  - `/health` liefert `scraping_enabled` fuer Frontend-Steuerung.
- TICKET-002-manual-job-input-default.md: Erledigt
  - Frontend schaltet bei deaktiviertem Scraping auf Create/Newbie um.
  - Manuelle Job-Kontextfelder (URL/Text) sind vorhanden und optional.
  - Frontend-Test fuer optionalen manuellen Job-Kontext wurde hinzugefuegt.
- TICKET-003-log-redaction-pii.md: Erledigt
  - PII-safe Logging Helper ist vorhanden und in kritischen Backend-Fehlerpfaden eingebunden.
  - Regressionstests verhindern rohe PII in API-Fehlerdetails und Log-Metadaten.
- TICKET-004-minimum-auth-production.md: Erledigt
  - Backend-Endpunkte `/auth/login`, `/auth/logout`, `/auth/me` sind implementiert.
  - Signierte Session-Cookies und geschuetzte CV/CV-Profile-Endpunkte sind aktiv.
  - Frontend Auth-Gate (Sign-in) und Logout-Flow sind eingebunden.

## Current Checkpoint

- Phase 1: abgeschlossen.
- Phase 2: teilweise abgeschlossen (TICKET-004 erledigt; TICKET-005 erledigt; TICKET-006 offen).
- Parallel: TICKET-019 (Langfuse + vLLM Go/No-Go) als schneller Entscheidungs-Gate.
- Naechster Schwerpunkt: TICKET-006 -> Phase-3 Tickets 007/008/009.

## Empfohlene Umsetzungsreihenfolge

### Phase 1: Blocker entfernen (Tag 1-2)

1. TICKET-001-disable-scraping-production.md
2. TICKET-002-manual-job-input-default.md
3. TICKET-003-log-redaction-pii.md

### Phase 2: Sicherheitsbasis (Tag 2-4)

4. TICKET-004-minimum-auth-production.md
5. TICKET-005-tls-and-security-headers.md
6. TICKET-006-secret-management-hardening.md

### Phase 2c: LLM Observability Entscheidung (Tag 3-4)

19. TICKET-019-llm-tracing-decision-langfuse-vllm.md

### Phase 2b: Rechtliche Mindestbasis (Tag 2)

16. TICKET-016-privacy-notice-no-scraping.md
17. TICKET-017-data-inventory-and-vvt-reduced-scope.md
18. TICKET-018-retention-policy-definition-profiles-images-logs.md

### Phase 3: Delivery und Betrieb (Tag 3-6)

7. TICKET-007-dockerize-frontend-backend-nonroot.md
8. TICKET-008-minimum-ci-pipeline.md
9. TICKET-009-staging-cd-and-manual-prod-release.md
20. TICKET-020-llm-tracing-implementation-langfuse-vllm.md

### Phase 4: DSGVO Technik und Nachweise (Tag 5-7)

10. TICKET-010-profile-delete-cascade-images.md
11. TICKET-011-user-data-export-mvp.md
12. TICKET-012-retention-and-cleanup-jobs.md
13. TICKET-013-e2e-smoke-test-no-scraping.md
14. TICKET-014-backup-restore-validation.md
15. TICKET-015-incident-runbook-and-privacy-breach-flow.md

## Owner-Zuordnung (Vorschlag)

- Backend Lead:
  - TICKET-001, TICKET-003, TICKET-004, TICKET-010, TICKET-011
  - Mitwirkung bei TICKET-019, TICKET-020
- Frontend Lead:
  - TICKET-002
- DevOps:
  - TICKET-005, TICKET-006, TICKET-007, TICKET-008, TICKET-009, TICKET-014, TICKET-019, TICKET-020
- Product + Datenschutz/Recht:
  - TICKET-015
  - Mitwirkung bei TICKET-001, TICKET-002, TICKET-011
  - Mitwirkung bei TICKET-019, TICKET-020
- QA:
  - TICKET-013

## Kritischer Pfad bis NO-GO -> GO

Diese Tickets sind fuer einen schnellen Production-Start am wichtigsten:

1. TICKET-001-disable-scraping-production.md
2. TICKET-002-manual-job-input-default.md
3. TICKET-003-log-redaction-pii.md
4. TICKET-004-minimum-auth-production.md
5. TICKET-005-tls-and-security-headers.md
6. TICKET-008-minimum-ci-pipeline.md
7. TICKET-019-llm-tracing-decision-langfuse-vllm.md

Wenn diese Kern-Tickets gruen sind und Legal den reduzierten no-scraping Scope freigibt, ist ein erster kontrollierter Go-Live realistisch.

## Ticket-005 Architektur-Entscheid (aktualisiert)

- Edge/TLS Layer: Caddy (statt Nginx).
- CORS in Production: environment-variable-basierte Allowlist (keine hardcoded Domains).
- Nachweis: Redirect- und Security-Header-Checks als Deployment-Validierung.

## LLM Tracing Track (neu)

- Zielbild: self-hosted LLM tracing mit Langfuse + vLLM.
- Entscheidung und Datenschutzmodell in TICKET-019.
- Umsetzung und Rollout in TICKET-020.

## Tracking-Template

Fuer jedes Ticket im Projektboard:

- Status: Offen / In Arbeit / Blockiert / Erledigt
- Owner:
- ETA:
- Abhaengigkeiten:
- Risiko bei Verzug:
- Nachweis-Link (PR, Build, Testprotokoll):

## CI Evidence (Ticket-005/008)

Fuer jeden relevanten CI-Lauf (mindestens pro Release-Kandidat) bitte ausfuellen:

- Datum (UTC):
- Owner:
- Workflow:
  - Core CI: `CI` (`.github/workflows/ci.yml`)
  - Security Validation: `Ticket-005 Security Validation` (`.github/workflows/ticket005-security-validation.yml`)
- Run-Link:
- Commit/PR-Link:

Letzter erfolgreicher Nachweislauf (Ticket-005/008):

- Datum (UTC): 2026-06-17T20:12:58Z
- Owner: M4R14NO
- Workflow:
  - CI (.github/workflows/ci.yml)
  - Ticket-005 Security Validation (.github/workflows/ticket005-security-validation.yml)
- Run-Link: bitte aus Actions-Lauf eintragen
- Commit/PR-Link: bitte aus PR/Commit eintragen
- Job-Status:
  - backend-tests: Pass
  - frontend-build-and-test: Pass
  - llm-tracing-validation-placeholder: Pass
  - ticket005-security-validation: Pass
- Artifact-Status:
  - ticket005-security-validation: vorhanden
  - ticket005-result.txt: passed
  - llm-tracing-placeholder: vorhanden
- Ticket-005 Nachweisfelder:
  - STAGING_URL: https://localhost:8443
  - ALLOWED_ORIGIN: https://localhost:8443
  - Disallowed Origin: https://evil.example.com
  - Redirect Check: Pass
  - Header Check: Pass
  - CORS Check: Pass

Erwartete Jobs:

- `backend-tests`: Pass
- `frontend-build-and-test`: Pass
- `llm-tracing-validation-placeholder`: Pass (Placeholder bis Ticket-020)
- `ticket005-security-validation`: Pass

Erwartete Artifacts:

- `ticket005-security-validation`
  - `ticket005-security-check.log`
  - `ticket005-result.txt` (Erwartung: `passed`)
- `llm-tracing-placeholder`
  - `placeholder.txt`

Ticket-005 Nachweisfelder:

- Staging URL (`STAGING_URL`):
- Allowed Origin (`ALLOWED_ORIGIN`):
- Disallowed Origin Testwert:
- Redirect Check (HTTP -> HTTPS): Pass/Fail
- Header Check (HSTS, XCTO, Referrer-Policy, CSP): Pass/Fail
- CORS Check (allowed/disallowed): Pass/Fail

Abweichungen / Incidents:

- Beschreibung:
- Auswirkungen:
- Mitigation / Fix-PR:
- Retest-Run-Link:

### Workflow Dispatch: Schnellanleitung

So startest du den CI-Lauf manuell fuer Ticket-005 Nachweise:

1. GitHub Repository -> Actions -> Workflow `Ticket-005 Security Validation` oeffnen.
2. `Run workflow` waehlen.
3. Inputs setzen:
  - `staging_url`: Default `https://localhost:8443` (kein public domain notwendig)
  - `allowed_origin`: Default `https://localhost:8443`
  - `disallowed_origin`: optional (Default: `https://evil.example.com`)
4. Lauf starten und auf alle Job-Statuses warten.
5. Artifacts herunterladen und im Abschnitt `CI Evidence (Ticket-005/008)` eintragen.

Hinweise:

- Mit Default-Inputs laeuft der Stage im CI in einem lokalen Smoke-Setup auf dem Runner (Backend + Frontend + Caddy).
- Fuer einen gueltigen Ticket-005 Nachweis muss `ticket005-result.txt` den Wert `passed` enthalten.
