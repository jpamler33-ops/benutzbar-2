# COASTFINDER FREE – kostenloser Küsten-Angelspot-Explorer

**Projektstatus:** Die komplette statische COASTFINDER V5 ist im bereits vorhandenen Repository `jpamler33-ops/benutzbar-2` auf dem Branch `main` hochgeladen (18 App-/Workflow-Dateien plus README). Andere Projekte blieben unverändert.

## Kostenlos veröffentlichen

1. Repository öffnen: https://github.com/jpamler33-ops/benutzbar-2
2. **Settings → Pages → Build and deployment → Deploy from a branch** wählen.
3. Branch **main**, Ordner **/(root)** auswählen und **Save** klicken.
4. Nach erfolgreicher Veröffentlichung zeigt GitHub unter **Settings → Pages** den tatsächlichen HTTPS-Link. Die App kann dann in Safari über „Teilen → Zum Home-Bildschirm“ installiert werden.

Hinweis: GitHub Pages muss einmalig im Repository aktiviert werden. Bis diese Einstellung bestätigt und die Seite erreichbar ist, wird **kein Live-Deployment behauptet**.

## Enthalten

- Küstenkarte für Frankreich und Kroatien, OSM-Struktursuche, optionale EMODnet-Tiefenkarte
- Open-Meteo Wetter-/Meeresprognosen und nachvollziehbare Bedingungenanalyse
- Private Fangmeldungen inklusive Null-Fang-Ausflüge, Statistik und JSON-Export/Import im Browser
- Öffentliches RSS-Quellenradar aus `feed/radar.json`
- Automatisierung in `.github/workflows/update-feeds.yml` (2× täglich nach UTC-Zeitplan, soweit GitHub Actions und die Feeds laufen)
- Progressive Web App / Home-Screen-Verknüpfung

## RSS-Radar aktivieren

Unter **Actions → Free RSS Radar → Run workflow** den ersten Lauf starten, nachdem GitHub Actions aktiviert ist. Falls der Bot keine Schreibrechte hat, unter **Settings → Actions → General → Workflow permissions** `Read and write permissions` freigeben. Das ist eine GitHub-Einstellung, kein kostenpflichtiger Tarif.

## Schutz und Grenzen

**0 € Pflichtkosten**: öffentliches GitHub-Pages-Repository, GitHub Actions im Free-Rahmen, kostenlose nichtkommerzielle APIs. Keine Kreditkarte nötig. Nicht für kommerzielle Open-Meteo-Nutzung. API-Limits und Berechtigungen beachten.

**Datenschutz:** Persönliche Fangmeldungen, private Koordinaten und Notizen werden in Browser-`localStorage` gespeichert, **nicht** in GitHub oder `feed/radar.json`. Regelmäßig per JSON exportieren und sichern. Kein Login, keine Cloud-Synchronisation. Eigene Browserdaten lassen sich durch Löschen der Website-Daten verlieren.

Der Foren-Radar importiert ausschließlich konfigurierte und zulässige RSS-Quellen – keine umfassende Suche aller Foren. Quellenhinweise sind keine bestätigten Fänge. Die Wetter- und Struktur-Scores sind keine Fangwahrscheinlichkeiten; lokale Sicherheit, Zugang, Lizenzen und Schutzgebiete prüfen.

**Tests:** Die V5 wurde zuvor lokal mit simulierten Wetter- und RSS-Daten getestet. Echte öffentliche Live-API-Abfragen und die veröffentlichte Pages-Seite sind noch nicht end-to-end geprüft.
