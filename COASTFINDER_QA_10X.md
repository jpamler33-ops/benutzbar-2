# COASTFINDER – 10×-Funktionsprüfung (02.11.2026)

**Belegbarer CI-Lauf:** https://github.com/jpamler33-ops/benutzbar-2/actions/runs/41517463448

## Nachgewiesener Testumfang

- **10 vollständige Browserdurchgänge auf echtem Chrome (headless)**, jeweils Desktop **und** mobiles Touch-Emulationsprofil. Die 48 ausgewiesenen Verhaltensbereiche wurden jeweils in allen zehn Durchgängen mit Assertions geprüft (**480 Browser-Prüfungen**).
- **10 weitere Durchgänge** mit den bestehenden JavaScript- und Python-Regressionstests, öffentliches RSS-Qualitäts-Gate und Syntaxchecks. Die wiederholten Node-Kartentests enthalten **120 GPS-Roundtrip-Fälle** über fünf Breitengrade, sechs Längengrade und vier Zoomstufen (**1.200 zusätzlich ausgeführte Roundtrip-Assertions**).
- Browserfunktionen: OSM-Kartenkacheln, Layout, Zoom +/−, Maus-/Touch-Pan, Zwei-Finger-Pinch, alle sieben Regionen, Ortung mit Genehmigung, OpenStreetMap-Analyse, Spot-Karten, Filter, Entdecker-Modus, Spotdetails, Favoriten, Pins, Wetter, Wellen, Tiefenprofil, Lebensraum-Layer, RSS-Radar, redaktionelle Quellen ohne Ortsbeleg, Fang- und Nullfangstatistik, Export/Import/Löschen, Browser-Storage über Reload, Gesetzeslinks, HTML-Escaping und JS-Fehlerfreiheit.
- Ergänzende Eingabe-/Sicherheitstests: fehlerhafte Koordinaten, dünn besetzte Tiefenraster, vorzeichenrichtige Tiefen, OSM-Projektionsumkehr, Dubletten, unvollständige Wetterdaten, Jahreszeiten und Windrichtungs-Wrap, HTTPS-URL-Prüfung, Privatfang-Validierung, Nullfangstatistik, korrupter Browser-Speicher.

## ROOT CAUSE und behobener Fehler

Der zusätzliche Karten-Roundtrip-Test fand einen schwerwiegenden Fehler in `app.js`: Die Umrechnung der projizierten Pixel-X-Koordinate nach Längengrad nutzte `((x/scale*360+540)%360)-180` und konnte dabei um **180° falsche Längengrade** zurückliefern. Ersetzt durch `mod(x/scale*360,360)-180`. Pan-Richtung und 120 Roundtrip-Fälle sind jetzt automatische Regressionstests.

## Automatisierte Ausführung

- `.github/workflows/tenfold-qa.yml` wird bei Pull Requests, nach Änderungen in `main` und bei manuellem Start ausgelöst.
- Prüft zunächst die bestehenden lokalen Regressionstests 10×. Danach installiert GitHub Actions den kostenlosen Playwright-Treiber und nutzt das auf dem GitHub Runner bereitgestellte Chrome für 10 Desktop-/Mobil-Zyklen.
- Bei irgendeiner nicht erfüllten Assertion bricht die Prüfung rot ab. Bei erfolgreichen Läufen wird `TENFOLD_ALL_PASS` mit den tatsächlichen Zählern protokolliert.
- `tests/browser_10x.js` blockiert unbeabsichtigte externe Netzzugriffe und simuliert OSM-, Overpass-, Wetter-/Marine- und EMODnet-Dienste durch deterministische Testdaten. Dies schont öffentliche APIs und erlaubt reproduzierbare Fehlerdiagnosen.

## Aussagegrenzen

**Nicht getestet:** echtes iPhone Safari/WebKit, vollständige WCAG-Barrierefreiheit, sämtliche internen Funktionen außerhalb der geprüften Nutzerpfade, Last-/Rate-Limits im echten Mehrnutzerbetrieb, Langzeit-Datenhaltbarkeit bei Browserdaten-Löschung oder zehn unabhängige Echtaufrufe der externen Dienste. Der unabhängige Live-API-Diagnose-Workflow bleibt separat bestehen.

Die 48 gezählten Gruppen sind **Funktionsbereiche/Assertions**, nicht 48 verifizierte, unabhängig ausgelöste Drittanbieter-API-Vorgänge. Ein erfolgreicher GitHub-Pages-Deploymentlauf bedeutet nicht automatisch einen erfolgreichen Gerätetest.
