# COASTFINDER — Autonomer Verbesserungs-Backlog

**Stand:** 2026-11-01 · **Ziel:** maximal hilfreiche, nachvollziehbare Küsten-Angelspot-App für Frankreich/Kroatien, **0 € Pflichtkosten**.
**Live-App:** https://jpamler33-ops.github.io/benutzbar-2/
**Scope:** nur dieses bestehende Repository. Keine private Benutzerposition, keine persönlichen Fänge oder API-Schlüssel in GitHub.

## Arbeitsregel (bei JEDEM stündlichen Autopilot-Lauf)
1. Zuerst **tatsächlichen Istzustand** prüfen: Git HEAD, Pages-Deploy, Actions, `feed/radar.json`, letzte Einträge in `COASTFINDER_PROGRESS.md`, offene Codefehler.
2. **P0-Fehler vor Features**, dann obersten unbeendeten und unabhängig umsetzbaren Punkt wählen. Abhängigkeiten/Blocker dokumentieren, niemals still überspringen.
3. Root Cause und messbares Akzeptanzkriterium klären → **kleinsten kohärenten Patch** → Tests → gezieltes Red Team → gegebenenfalls nachbessern → Tests wiederholen.
4. **Nur getestete, reversible, unkritische Änderungen** direkt nach `main`; größere oder unsichere Änderungen zunächst auf Branch/PR. Vor Schreibzugriff Git HEAD erneut prüfen; niemals force-push.
5. Nach jedem Lauf `COASTFINDER_PROGRESS.md` mit tatsächlichen Belegen aktualisieren (auch bei Blockade), Punktstatus in dieser Datei nur mit Prüfnachweis ändern. Kein wertloser Commit nur für eine Statusmeldung; Arbeitsprotokoll nur zusammen mit echten Änderungen committen, wenn möglich.
6. **Keine erzwungenen Änderungen**: Wenn kein sinnvoller und sicher testbarer Patch möglich ist, mit reproduzierbarem Blocker und nächster Aktion abstimmen. Nicht alle Aufgaben in einem Lauf auf einmal beginnen.
7. Zweiter Verbesserungsdurchgang: `Patch -> Tests -> Gegenprobe -> Patch-Korrektur -> Tests`. Auswirkungen auf vorhandene App-Funktionen kontrollieren.

### Statuslegende
- `TODO`: offen · `IN_PROGRESS`: in Bearbeitung · `BLOCKED`: nachweisbarer Blocker · `DONE`: Implementierung + Tests belegt.
- Priorität: `P0` Datenkorrektheit/Sicherheit/Defekte, `P1` Hauptnutzen, `P2` Erweiterung, `P3` Forschung.
- Diese Liste ist **geplante Arbeit, keine Behauptung implementierter Features**.

## P0 — zuerst Datenqualität, Sicherheit und laufende V6 abschließen
- [ ] **CF-001 · V6 Geo-Scanner sauber integrieren.** Aktuellen Git-Stand gegen vorhandene V6-Arbeit vergleichen; EMODnet Tiefenprofil + EUSeaMap-Bodenlayer **nur nach dokumentiertem URL-/Antworttest** integrieren. A: Desktop + Mobil nutzbar; Ladefehler und Datenlücken sichtbar; keine erfundenen Ufertiefen; bestehende V5 läuft unverändert weiter.
- [ ] **CF-002 · Falsche Foren-Treffer entfernen.** Region Côte d’Azur/„Riviera“ darf nur bei räumlichem Beleg gesetzt werden; Angelruten-Kleinanzeigen und reine Hardware-Besprechungen nicht als Fang-/Spot-Hinweise zählen. A: negative und positive Testfälle, u.a. französische Winston-Anzeige, werden korrekt klassifiziert.
- [ ] **CF-003 · RSS-Eingabe härten.** Kroatischen XML-Fehler diagnostizieren und bei nicht unterstütztem Format Quelle sauber deaktivieren/kennzeichnen; keine Umgehung von robots.txt, Sperren, ToS, Rate-Limits. A: Fehler isoliert, valider Feed funktioniert, andere Quellen werden nicht blockiert.
- [ ] **CF-004 · Test-Gate vor Deploy.** CI prüft JavaScript-Syntax, Python/RSS-Parser, Daten- und Richtungsberechnungen sowie Null/Timeout/Rate-Limit und gefährliche URL-/Eingabe-Daten. A: reproduzierbar grün; bei Testfehlern kein direktes Update.
- [ ] **CF-005 · End-to-End Live-Prüfung.** Pages-Erreichbarkeit, Asset-Pfade unter `/benutzbar-2/`, Kartenkacheln, Geo-Analyse, Tiefenlayer, Wetter, Favoriten, RSS-Fallback und Home-Screen auf Mobilformat überprüfen. A: Fehlerprotokoll und verifizierte Korrekturen; externe API-Ausfälle als `nicht verfügbar` statt `0` zeigen.

## P1 — beste echte Spot-Entdeckung
- [ ] **CF-006 · Tiefenprofil-Qualität.** Nutzer wählt Länge/Richtung; Karte zeigt Tiefenverlauf aus echtem EMODnet-Dienst mit räumlicher Auflösung, Datum, Abdeckung und Warnung zu Küstennähe. A: nachvollziehbare Quelle + Graceful Degradation.
- [ ] **CF-007 · Meeresboden-Typen.** EUSeaMap/EMODnet-Bodenhabitat nur dort anzeigen, wo abgedeckt; Datensatzklasse und Legende nennen; fehlende Bodenklassifikation weder erraten noch als Fels labeln. A: echte Karten-Requests verifiziert, mobile Lesbarkeit.
- [ ] **CF-008 · Spot-Evidenz statt Fake-Score.** Struktur / Zugang / maritime Bedingungen / Beobachtungsqualität getrennt darstellen; keine scheinpräzisen Fisch- oder Fangwahrscheinlichkeiten. A: jedes Urteil kann anhand Tags/Quelle erklärt werden.
- [ ] **CF-009 · Wind/Welle/Strömung sauber kombinieren.** Windrichtung = **von**, Strömungsvektor = **nach**; Datengültigkeit, stündliche Zeitindizes, Prognosehorizonte und Modelle begrenzen; kein Score bei unvollständigen Kerndaten. A: feste Rechentests einschl. Zeitzone, gegenläufiger Vektoren, API-Nullwerte.
- [ ] **CF-010 · Zugang + Risiko.** Öffentliche Fußwege/OSM access, Klippen, Brandung, Schutzgebiete und angelrechtliche Unsicherheit als getrennte Warnungen. A: „potenzieller Spot“ niemals mit „zugänglich/legal/sicher“ verwechseln.
- [ ] **CF-011 · Mobile Karten-UX.** iPhone-Safe-Areas, Layer-Toggles, große Touch-Ziele, Spot-Detail, nützliche Leer-/Fehlerzustände, Tastatur/Screenreader. A: reale oder reproduzierbare Mobile-Smoke-Checks.

## P2 — intelligenter Quellenradar und Fang-Lernen
- [ ] **CF-012 · Qualifizierte Forensuche.** Nur zulässige öffentliche RSS/API-Quellen. Mehrsprachig FR/HR/DE; Ort, Datum, Fischart, Methode, Fangbehauptung, Quelle und Konfidenz separat extrahieren. A: Testset mit belegten false positives/negatives; keine Verkaufsanzeigen als Spotberichte.
- [ ] **CF-013 · Quellenaudit und Deduplizierung.** URL-Normalisierung, Artikel-ID, Zeitstempel, Quelle-Fehlerstatus, Cache/Backoff, Herkunftsnachweis; keine privaten Community-Daten. A: identische Beiträge nicht doppelt.
- [ ] **CF-014 · Fang- und Nullfang-Statistik.** Privat im Browser, Aufwand in Angelstunden, Datum, Methode, Zielfisch; Trennung eigene Fänge vs externe Behauptung. A: CPUE nur bei genügend Daten, Exporte/Importe mit Schema und Duplikatkontrolle, keinerlei Upload privater Daten.
- [ ] **CF-015 · Historische Bedingungen.** Beobachtungsdatum und Zeit normalisieren; reale historische Wind-/Wellen-/Strömungswerte, wo erlaubt/verfügbar, mit Quellen und Unsicherheit verknüpfen. A: kein Zukunftswetter als Beobachtungszeit und keine erfundene Historie.
- [ ] **CF-016 · Saison und Zielfisch.** Biologisch begründete Saisonalität als allgemeine Evidenz mit Quelle, neben eigenen Fanglogs; kleine Stichproben offen kennzeichnen. A: keine unzulässige Erfolgsbehauptung.
- [ ] **CF-017 · Offline-/PWA-Robustheit.** App-Shell offline (keine unerlaubten OSM-Tile-Massendownloads), lokale Export-Sicherung, Datenmigration, Reload-Tests, Datenschutz. A: kein Verlust bestehender Fänge/Favoriten.
- [ ] **CF-018 · Performance und API-Kosten.** Kein unkontrollierter Overpass-Scan; Boundingbox-Cap, Request-Caching und Warnung vor großen Scans; öffentliche Gratis-Limits respektieren. A: reproduzierbare Grenzwerttests und Ressourcenbegrenzung.

## P3 — Forschung, erst nach belastbarer Datengrundlage
- [ ] **CF-019 · OBIS-Artenvorkommen prüfen.** Forschungsbeobachtung und tatsächliche Fänge streng trennen; räumliche und zeitliche Unsicherheit anzeigen.
- [ ] **CF-020 · Copernicus-Satellitenanalyse prüfen.** Nur belastbar verfügbare kostenlose Bilder/Dienste; Wassertrübung und Küstenstruktur als Hinweise, nicht Fisch-Nachweis.
- [ ] **CF-021 · Backtesting statt Hype.** Mit genügend echten Fang-/Nullfang-Beobachtungen Out-of-sample-Auswertung, Basisrate, Kalibrierung, Fehlalarme und Vergleich ohne Wettermodell prüfen.
- [ ] **CF-022 · Selbstverbesserungs-Audit.** Monitore für Fehlerrate, Falsch-Positiv-Quote RSS, Datenausfall-Anteil, Testabdeckung und reale Nutzenmetriken; Aufgaben anhand echter Metriken neu sortieren.

## Explizite Grenzen
**0 € Pflichtkosten**, nur kostenlose zulässige APIs, keine API-Schlüssel in Client/Repo; GitHub Pages/Actions im Gratisrahmen.
Kein unerlaubtes Scraping, keine angeblich „geheimen“ Privatspots, keine veröffentlichen persönlichen Koordinaten, keine bezahlten Deployments, keine Garantie auf Fang.
Bei riskanten Migrationen, Verlust privater Daten, Veröffentlichung sensibler Informationen, kostenpflichtigen Diensten oder breiten Code-Umbauten: **nicht autonom deployen**.

## Stundenbericht (Format)
`UTC-Datum | Git-HEAD vorher | CF-ID | Root Cause | Änderung | Tests (ausgeführt) | Red Team | Commit/PR | Deployment-Status | Rest-Risiko | Nächster Punkt`

**Einziger Maßstab:** nachweisbar bessere reale App, nicht mehr Code oder mehr Claims.
