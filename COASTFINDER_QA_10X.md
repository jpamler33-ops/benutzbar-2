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


## 02.11.2026 – zusätzlicher Safari-Engine/WebKit-Gate (PR #9)

**Echter WebKit-Engine-Test, nicht echte iPhone-Hardware.** Der neue kostenlose GitHub-Actions-Workflow `.github/workflows/webkit-mobile.yml` installiert den Playwright-1.56.1-WebKit-Browser auf fest gepinntem Ubuntu 24.04 und führt `tests/webkit_mobile_10x.js` zehnmal aus. Er wechselt zwischen 390×844 und 375×667 Pixeln (je fünf Browserdurchgänge). Mobile Touch-Steuerelemente, OpenStreetMap-Kacheln und Referer-Richtlinie, Kartendarstellung, Karten-Pan, Regionen, Overpass-Analyse, Tiefen-/EUSeaMap-Layer, RSS und private lokale Fangdatenspeicherung nach Reload sind enthalten. Externe Anfragen werden kontrolliert simuliert und nicht zehnmal an öffentliche APIs gesendet.

**Aufgedeckter Bedienfehler:** Der bestehende mobile Ergebnisauszug wurde bis zu 75dvh hoch und verdeckte nach einer Analyse den darüberliegenden Tiefenkarten-Schalter. Im echten WebKit-Test scheiterte `locator.tap()`, weil das Element `#analyze` im ausgeklappten Drawer Klicks abfing. Korrektur: Die maximale Drawer-Höhe lässt einen sichtbaren Kartenbereich von 160 px und die Layer-Schaltflächen werden bei expandiertem Fenster kompakt in diesen freien Bereich gesetzt; Quellattribution bleibt sichtbar.

**Bestätigte PR-Tests:** WebKit zehn Runden und sechzehn Verhaltensgruppen pro Runde: https://github.com/jpamler33-ops/benutzbar-2/actions/runs/41521813928 (`WEBKIT_MOBILE_ALL_PASS`); Chrome zehn Browserrunden plus zehn Offline-Regressionsrunden: https://github.com/jpamler33-ops/benutzbar-2/actions/runs/41521813956. Standard-Qualitätsprüfung ebenfalls erfolgreich. Das sind **160 zusätzliche WebKit-Assertions** neben bestehenden Tests.

**Grenzen:** WebKit auf Linux ist eine Safari-Engine-Annäherung, keine native iOS-Safari-Ausführung; echte Netzwerkprobleme, Betriebssystem-Berechtigungen, Hardware-Touch und vollständige Barrierefreiheit bleiben gesondert zu überprüfen. Keine Behauptung realer Drittanbieter-API-Verfügbarkeit aus diesen Netzwerkmocks.
