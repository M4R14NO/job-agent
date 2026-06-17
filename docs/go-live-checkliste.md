# Go-Live Checkliste (job-agent)

Stand: 2026-06-14  
Ziel: Produktionsreifer Go-Live mit Fokus auf DSGVO, Security und stabilen Deployments.

## Nutzung

- Tragt pro Punkt Owner, Zieltermin und Status ein.
- Verwendet als Status nur: `Offen`, `In Arbeit`, `Erledigt`, `Blockiert`.
- Go-Live nur freigeben, wenn alle Muss-Kriterien erledigt sind.

### Bewertungsstand (Code + Recherche)

- Stand basiert auf Repository-Analyse und externer Recherche vom 2026-06-14.
- Als erledigt markiert sind nur Punkte mit belastbarem Nachweis.
- Unklare oder nicht belegbare Punkte bleiben offen.

## 1) Go/No-Go Muss-Kriterien

### A. DSGVO / Recht

- [ ] Verzeichnis von Verarbeitungstätigkeiten (VVT) erstellt und aktuell.
- [ ] Rechtsgrundlage pro Datenkategorie dokumentiert (z. B. Vertrag, Einwilligung).
- [ ] Datenschutzinformation (Privacy Notice) im Produkt veröffentlicht.
- [ ] AVV/DPA mit allen Auftragsverarbeitern abgeschlossen.
- [ ] Drittlandtransfers geprüft (SCC/TIA falls notwendig).
- [ ] Prozesse für Betroffenenrechte dokumentiert (Auskunft, Löschung, Berichtigung, Export).
- [ ] Lösch- und Aufbewahrungsfristen verbindlich definiert.

### B. Security

- [ ] Authentifizierung und Autorisierung für produktive Nutzung aktiv.
- [ ] HTTPS erzwungen (inkl. korrekter Reverse-Proxy/TLS-Konfiguration).
- [ ] Secrets nicht im Code/Repo, sondern im Secret-Store.
- [ ] Logging ohne personenbezogene Rohdaten (CV-Inhalte, Profile, Bilder).
- [ ] Rate-Limiting und Request-Limits aktiv.
- [ ] Sicherheitsrelevante Abhängigkeiten geprüft und ohne kritische Findings.

### C. Betrieb

- [ ] Reproduzierbarer Deployment-Prozess (CI/CD) vorhanden.
- [ ] Staging-Umgebung vorhanden und vor Production verpflichtend getestet.
- [x] Healthchecks aktiv.
- [ ] Monitoring aktiv.
- [ ] Backup/Restore getestet und dokumentiert.
- [ ] Incident-Prozess (inkl. Datenschutzvorfall-Meldung) definiert.


### D. Datenquellen- und Plattform-Compliance

- [ ] Zulassigkeit der Datenerhebung je Quelle rechtlich bewertet und freigegeben (inkl. LinkedIn).
- [ ] Nutzungsbedingungen der Plattformen vollstaendig gepruft und dokumentiert.
- [x] Robots.txt fuer LinkedIn gepruft.
- [ ] Technische Zugriffsvorgaben je Quelle eingehalten.
- [ ] Nachweisbarer Fallback definiert, falls Quelle gesperrt oder untersagt wird.
- [ ] Entscheidungen und Restrisiken von Datenschutz/Recht freigegeben.

---

## 2) Umsetzungsboard mit Owner und Termin


### Datenquellen-Compliance

| Aufgabe | Owner | Zieltermin | Status | Nachweis/Link |
|---|---|---|---|---|
| Legal Review fur LinkedIn-Parser und weitere Jobquellen abschliessen | Datenschutz/Recht | 2026-06-20 | In Arbeit | Preliminary Bewertung in Abschnitt 9 |
| Plattform-TOS und technische Abrufregeln je Quelle dokumentieren | Product + Legal Ops | 2026-06-18 | In Arbeit | LinkedIn TOS/robots vorgeprueft, weitere Quellen offen |
| Parser nur fur freigegebene Quellen in Production aktivieren | Backend Lead | 2026-06-21 | Offen | Abhaengig von Legal-Freigabe |
| Anbieter-API als bevorzugte Alternative evaluieren (wo verfugbar) | Backend Lead + Product | 2026-06-24 | In Arbeit | Prioritaet hoch fuer Go-Live |
| Kill-Switch fur einzelne Quellen (Feature Flag) produktiv testen | Backend Lead + DevOps | 2026-06-19 | Erledigt | `ENABLE_SCRAPING` + Endpoint-Gating in Backend aktiv |
### DSGVO / Legal

| Aufgabe | Owner | Zieltermin | Status | Nachweis/Link |
|---|---|---|---|---|
| Dateninventar (CV, Bilder, Jobdaten, Logs, Telemetrie) finalisieren | Datenschutz + Backend | 2026-06-18 | In Arbeit | |
| VVT erstellen/finalisieren | Datenschutz | 2026-06-20 | Offen | |
| Privacy Notice erstellen und im Frontend verlinken | Product + Frontend | 2026-06-22 | Offen | |
| AVV/DPA mit Hosting und LLM-Anbieter abschließen | Datenschutz/Recht | 2026-06-24 | Offen | |
| Löschkonzept inkl. Retention (Produktiv + Backup) dokumentieren | Datenschutz + DevOps | 2026-06-23 | Offen | |
| DSFA/DPIA-Pflicht prüfen und Ergebnis dokumentieren | Datenschutz/Recht | 2026-06-21 | Offen | |

### Security

| Aufgabe | Owner | Zieltermin | Status | Nachweis/Link |
|---|---|---|---|---|
| Auth-Provider auswählen (z. B. Authentik/Keycloak) und integrieren | Backend Lead + DevOps | 2026-06-25 | Offen | |
| Rollenmodell definieren (mind. User/Admin) | Backend Lead | 2026-06-20 | Offen | |
| Personenbezogene Daten aus Fehlerlogs entfernen/maskieren | Backend Lead | 2026-06-18 | Erledigt | [backend/app/services/logging_utils.py](backend/app/services/logging_utils.py), [backend/app/services/cv_service.py](backend/app/services/cv_service.py#L402), [backend/app/main.py](backend/app/main.py#L130), [backend/tests/test_log_redaction.py](backend/tests/test_log_redaction.py), [backend/tests/test_main_log_redaction.py](backend/tests/test_main_log_redaction.py) |
| Security Header + TLS-Konfiguration prüfen | DevOps | 2026-06-19 | Offen | |
| Dependency- und Container-Scan in CI integrieren | DevOps | 2026-06-20 | Offen | |

### CI/CD

| Aufgabe | Owner | Zieltermin | Status | Nachweis/Link |
|---|---|---|---|---|
| CI Workflow: Backend Tests + Frontend Build + Lint | DevOps + Backend | 2026-06-18 | Blockiert | Keine Workflows unter .github/workflows |
| Build-Artefakte versionieren (Image Tags, Release Notes) | DevOps | 2026-06-19 | Blockiert | Kein CI-Pipeline-Setup vorhanden |
| CD Workflow: Staging Auto-Deploy, Production mit manueller Freigabe | DevOps | 2026-06-22 | Blockiert | Kein CD-Workflow-Nachweis |
| Rollback-Mechanismus testen (1 Klick oder dokumentierter Befehl) | DevOps | 2026-06-23 | Blockiert | Kein Deployment-Workflow vorhanden |

### Docker / Infrastruktur

| Aufgabe | Owner | Zieltermin | Status | Nachweis/Link |
|---|---|---|---|---|
| Multi-Stage Dockerfiles für Frontend/Backend finalisieren | DevOps + Backend | 2026-06-19 | Blockiert | Keine Dockerfiles gefunden |
| Container laufen non-root | DevOps | 2026-06-19 | Blockiert | Abhaengig von Dockerfiles |
| Persistente Volumes für Profile/Bilder sauber getrennt | DevOps + Backend | 2026-06-20 | Blockiert | Abhaengig von Compose/Infra |
| Runtime-Konfiguration via ENV/Secrets statt Hardcoding | DevOps | 2026-06-20 | Offen | Teilweise ENV vorhanden, Secret-Store offen |
| Ressourcenlimits (CPU/RAM) gesetzt | DevOps | 2026-06-20 | Blockiert | Keine Container-Orchestrierung nachweisbar |

### Produkt / UX / Support

| Aufgabe | Owner | Zieltermin | Status | Nachweis/Link |
|---|---|---|---|---|
| Datenschutzhinweise an relevanten UI-Stellen sichtbar | Product + Frontend | 2026-06-22 | Offen | |
| Kontaktkanal für Datenschutzanfragen sichtbar | Product | 2026-06-21 | Offen | |
| Nutzerfluss für Datenlöschung getestet (inkl. Profilbilder) | QA + Backend | 2026-06-24 | Offen | |
| Runbook für Support erstellt (Top 10 Störungen + Lösungen) | Product + Engineering | 2026-06-24 | Offen | |

---

## 3) Technische DSGVO-Umsetzung (konkret)

### Datenminimierung

- [ ] Nur Daten speichern, die für den Zweck nötig sind.
- [ ] Keine dauerhafte Speicherung von Zwischenständen ohne Zweck.
- [ ] Debug-Funktionen mit personenbezogenen Inhalten in Produktion deaktivieren.

### Löschung und Aufbewahrung

- [ ] Löschung von CV-Profilen entfernt auch verknüpfte Dateien (z. B. Profilbilder).
- [ ] Geplanter Cleanup-Job für Alt-Daten implementiert.
- [ ] Retention-Werte als Konfiguration dokumentiert und versioniert.

### Betroffenenrechte

- [ ] Export-Funktion für personenbezogene Daten vorhanden.
- [ ] Löschanfrage technisch vollständig umsetzbar.
- [ ] Berichtigungsprozess dokumentiert.

### Protokollierung

- [x] Keine CV-Rohdaten in Logs.
- [ ] Keine Tokens/Secrets in Logs.
- [ ] Log-Retention und Zugriffsschutz definiert.

---

## 4) Test- und Freigabeprotokoll

| Test | Verantwortlich | Datum | Ergebnis | Kommentar |
|---|---|---|---|---|
| Frontend Build erfolgreich | Frontend | 2026-06-14 | Erledigt | Lokaler Build erfolgreich |
| Frontend Tests erfolgreich | Frontend | 2026-06-14 | Erledigt | npm run test:run erfolgreich |
| Backend Tests erfolgreich | Backend | 2026-06-20 | In Arbeit | Ticket-003 fokussierte Regression-Tests gruen: [backend/tests/test_log_redaction.py](backend/tests/test_log_redaction.py), [backend/tests/test_main_log_redaction.py](backend/tests/test_main_log_redaction.py) |
| End-to-End Smoke Test (Search -> CV -> Export) | QA | 2026-06-24 | Offen | Nach Staging-Deploy |
| Auth/Login/Session Tests | QA + Backend | 2026-06-25 | Offen | Abhaengig von Auth-Integration |
| Datenschutz-Workflows getestet (Auskunft/Löschung) | QA + Datenschutz | 2026-06-25 | Offen | Mit finalem Loeschkonzept |
| Restore-Test aus Backup | DevOps | 2026-06-23 | Offen | Muss vor Go-Live erledigt sein |

---

## 5) Go-Live Entscheidung

Go-Live Status: [NO-GO]

Entscheidungsrunde:
- Product: [Product Lead, 2026-06-14]
- Engineering: [Engineering Lead, 2026-06-14]
- Datenschutz/Recht: [Pending, 2026-06-20]
- Security: [Pending, 2026-06-20]

Rest-Risiken (müssen explizit akzeptiert sein):
- [x] Risiko 1: LinkedIn Scraping ohne abgeschlossene Legal-Freigabe.
- [x] Risiko 2: Kein CI/CD und kein Docker-Betriebspfad nachgewiesen.

Freigabe Production:
- [ ] Erteilt
- [x] Vertagt

Begründung:
- Auth fehlt laut Produktstatus (local-only/no auth).
- CI/CD- und Docker-Artefakte fehlen im Repository.
- LinkedIn-Nutzung ist rechtlich/vertraglich noch nicht final freigegeben.

---

## 6) Entscheidungs-Matrix fuer Datenquellen

Ziel: Jede Quelle bekommt eine klare Entscheidung mit technischer Konsequenz.

| Entscheidung | Bedeutung | Produktionsregel | Pflichtmassnahmen |
|---|---|---|---|
| Erlaubt | Rechtlich und vertraglich freigegeben | Quelle aktiv | Monitoring, Rate Limits, Loeschkonzept |
| Bedingt erlaubt | Nur unter Auflagen freigegeben | Quelle nur mit Guardrails aktiv | Feature Flag, enge Limits, Re-Review-Termin |
| Nicht erlaubt | Nicht freigegeben oder unklaerbar | Quelle deaktiviert | Kill-Switch dauerhaft an, Alternative nutzen |

### Mindestkriterien vor Aktivierung einer Quelle

- [x] TOS/Vertragslage fuer LinkedIn vorgeprueft und dokumentiert.
- [x] Technische Zugriffsvorgaben fuer LinkedIn geprueft (robots).
- [ ] Datenschutz-Folgen bewertet (Datenarten, Zweck, Speicherfrist).
- [ ] Sicherheits- und Missbrauchsrisiko bewertet.
- [ ] Verantwortliche Freigabe durch Datenschutz/Recht dokumentiert.

---

## 7) Risiko-Scoring je Entscheidung

Bewertet pro Kriterium von 1 (niedrig) bis 5 (hoch).

| Kriterium | Frage | Score 1 | Score 3 | Score 5 |
|---|---|---|---|---|
| Rechtsrisiko | Wie klar ist die Zulaessigkeit? | klar erlaubt | unklar/auslegbar | klar untersagt/hohes Streitrisiko |
| Betriebsrisiko | Wie wahrscheinlich ist Ausfall/Sperre? | stabil | mittel | sehr wahrscheinlich |
| Datenschutzrisiko | Wie sensibel sind die Daten/Folgen? | niedrig | mittel | hoch |
| Umsetzungsaufwand | Wie viel Engineering ist noetig? | gering | mittel | hoch |
| Time-to-Go-Live Impact | Wie stark verzoegert es den Launch? | kaum | merklich | stark |

### Entscheidungsregel (Ampel)

- Gruen: Gesamtscore 5-9 -> Go moeglich.
- Gelb: Gesamtscore 10-16 -> nur Go mit Auflagen und Termin zur Nachpruefung.
- Rot: Gesamtscore 17-25 -> No-Go bis geklaert.

Hinweis: Bei Rechtsrisiko = 5 automatisch mindestens Gelb und Legal-Eskalation.

### Vorbewertung der aktuellen Optionen

| Option | Rechtsrisiko | Betriebsrisiko | Datenschutzrisiko | Umsetzungsaufwand | Time-to-Go-Live Impact | Gesamtscore | Ampel | Empfehlung |
|---|---:|---:|---:|---:|---:|---:|---|---|
| LinkedIn Scraping | 5 | 4 | 3 | 2 | 3 | 17 | Rot | No-Go bis schriftliche Legal-Freigabe |
| Offizielle API/Partnerfeed | 2 | 2 | 3 | 4 | 3 | 14 | Gelb | Go mit Auflagen und Re-Review |
| Nutzerseitige Job-Eingabe (URL/Text) | 2 | 1 | 2 | 2 | 2 | 9 | Gruen | Empfohlener kurzfristiger Go-Live-Fallback |

---

## 8) Legal-Review Briefing Vorlage (fuer schnelle Freigabe)

Kopiere diesen Block fuer jede kritische Quelle (z. B. LinkedIn):

### Quelle: [Name]

- Technische Nutzung:
	- Wie wird abgerufen? [Scraping/API/Partnerfeed]
	- Welche Endpunkte/URLs werden genutzt? [...]
	- Abruffrequenz/Volumen: [...]
- Verarbeitete Daten:
	- Kategorien: [...]
	- Personenbezug: [Ja/Nein]
	- Speicherorte und Fristen: [...]
- Vertragslage:
	- TOS geprueft am: [Datum]
	- Kritische Klauseln: [...]
	- robots/technische Regeln geprueft am: [Datum]
- Fragen an Legal:
	- Ist die Nutzung in dieser Form zulaessig? [Ja/Nein]
	- Falls ja, unter welchen Auflagen?
	- Falls nein, welche zulaessige Alternative wird empfohlen?
- Entscheidung:
	- Status: [Erlaubt/Bedingt erlaubt/Nicht erlaubt]
	- Gueltig bis: [Datum]
	- Freigabe durch: [Name, Rolle]

---

## 9) Ersteinschaetzung: LinkedIn-Parser (vorlaeufig)

Status: No-Go fuer Production bis Legal-Freigabe.

Begruendung (vorlaeufig):
- LinkedIn User Agreement enthaelt explizite Verbote fuer Scraping/Bots und das Kopieren von Service-Daten ohne Zustimmung.
- LinkedIn robots.txt weist automatisierten Zugriff ohne ausdrueckliche Erlaubnis als untersagt aus und setzt breite Disallow-Regeln.
- US-Rechtsprechung (hiq) reduziert nur einen Teil des CFAA-Risikos fuer oeffentliche Daten, loest aber weder Vertrags- noch andere Rechtsrisiken vollstaendig und ist nicht gleichbedeutend mit EU-Rechtsfreigabe.

Konkrete Handlungsentscheidung bis zur Freigabe:
- [x] LinkedIn-Quelle in Production per Feature Flag deaktiviert (Default aus). Owner: Backend Lead. Ziel: 2026-06-19.
- [ ] Alternative Datenquelle/API fuer Production priorisiert. Owner: Product + Backend Lead. Ziel: 2026-06-24.
- [ ] Legal-Review mit obiger Vorlage durchgefuehrt. Owner: Datenschutz/Recht. Ziel: 2026-06-20.
- [ ] Entscheidungstermin mit Datenschutz/Recht gesetzt. Owner: Product. Ziel: 2026-06-17.

### Nachweis-Snapshot (Code/Recherche)

- LinkedIn-only Suche im Backend: [backend/app/main.py](backend/app/main.py#L168)
- LinkedIn Detail-Abruf per HTTP GET: [backend/app/services/linkedin_detail_service.py](backend/app/services/linkedin_detail_service.py#L114)
- Scraping-Feature-Flag und Endpoint-Gating: [backend/app/main.py](backend/app/main.py#L56)
- Scraping-Status fuer Frontend via Health: [backend/app/main.py](backend/app/main.py#L82)
- Frontend schaltet bei deaktiviertem Scraping auf Create/Newbie: [frontend/src/App.jsx](frontend/src/App.jsx#L377)
- Find-Job Entry bei deaktiviertem Scraping ausgeblendet: [frontend/src/App.jsx](frontend/src/App.jsx#L1081)
- Local-only und no-auth Limitierung: [README.md](README.md#L216)
- Kein CI/CD Workflow gefunden: .github/workflows (nicht vorhanden)
- Keine Dockerfiles gefunden: Dockerfile (nicht vorhanden)
- Healthcheck Endpoint vorhanden: [backend/app/main.py](backend/app/main.py#L74)
- Frontend Build/Test lokal erfolgreich: Terminal-Status 2026-06-14

---

## 10) Priorisierte 7-Tage Liste (Fast-Track ohne Scraping)

Ziel: Schnellstmoeglicher Go-Live ohne Plattform-Scraping. Jobkontext kommt nur vom Nutzer (Job-Link Insert oder Job-Text Copy/Paste).

### Entscheidungspfad (festgelegt)

- [x] Produktionspfad ohne Scraping priorisiert.
- [x] LinkedIn-Scraping in Production deaktiviert (Feature Flag Default aus oder Endpoint aus).
- [x] UX fuer manuelle Job-Eingabe als Standard aktiv (Job-Link/Job-Text).

### Tag 1 (kritische Blocker aufloesen)

1. LinkedIn-Enrichment und Scraping fuer Production hart deaktivieren.
2. Logging-Hardening: keine CV-Rohdaten/PII in Error-Logs. (Erledigt 2026-06-14; Nachweis: [backend/app/services/logging_utils.py](backend/app/services/logging_utils.py), [backend/tests/test_log_redaction.py](backend/tests/test_log_redaction.py), [backend/tests/test_main_log_redaction.py](backend/tests/test_main_log_redaction.py))
3. Go-Live Scope einfrieren: nur no-scraping Pfad, keine neuen Features.

### Tag 2 (rechtliche Mindestbasis)

1. Privacy Notice mit no-scraping Datenfluss finalisieren und im Frontend verlinken.
2. Dateninventar + VVT fuer den reduzierten Scope abschliessen.
3. Loesch- und Aufbewahrungsfristen fuer Profile/Bilder/Logs festlegen.

### Tag 3 (Security Minimum)

1. Auth-Entscheidung treffen (mindestens einfacher Login-Schutz fuer Production).
2. TLS/Reverse-Proxy absichern und Security Header setzen.
3. Secrets aus ENV in Secret-Store/Host-Secret-Mechanismus ueberfuehren.

### Tag 4 (Deployment-Faehigkeit)

1. Dockerfiles (Frontend/Backend) erstellen und non-root ausfuehren.
2. Minimales CI einrichten (Frontend Build, Frontend Tests, Backend Tests).
3. CD nach Staging mit manueller Production-Freigabe aufsetzen.

### Tag 5 (DSGVO Technik)

1. Vollstaendige Loeschung von Profil + verknuepften Bildern sicherstellen.
2. Export fuer Nutzerdaten als MVP bereitstellen.
3. Debug-/Temp-Retention auf kurze Fristen begrenzen und dokumentieren.

### Tag 6 (Staging Nachweise)

1. End-to-End Smoke Test mit manuellem Job-Input (Link/Text) durchspielen.
2. Restore-Test aus Backup durchfuehren.
3. Incident-Runbook inkl. Datenschutzvorfall-Prozess finalisieren.

### Tag 7 (Go/No-Go Runde)

1. Datenschutz/Recht Freigabe auf reduzierten Scope einholen.
2. Security-Freigabe und Restrisiken schriftlich abzeichnen.
3. Production-Freigabe nur bei gruenen Muss-Kriterien.

### Fast-Track Akzeptanzkriterien (vor GO)

- [x] Kein Scraping im produktiven Request-Pfad aktiv.
- [x] Jobdaten werden nur durch Nutzerinput bereitgestellt (Link/Text).
- [ ] Privacy Notice, VVT und Loeschkonzept fuer diesen Scope abgeschlossen.
- [ ] Auth, TLS und Secret-Handling produktionsreif.
- [ ] CI/CD, Docker, Backup/Restore und Smoke-Tests nachgewiesen.
