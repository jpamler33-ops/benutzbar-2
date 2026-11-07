# BLACKTIDE · erste Etappe · 2026-11-07

Ausgangsstand: `262f6e4` auf `main` (RSS-Metadaten nach dem Karten-Fix PR #15). Live-App vor dem Patch in Chrome geöffnet; OSM-Grundkarte bei Istrien sichtbar. Issue #16 (echtes iPhone-Safari) bleibt offen.

## Designentscheidung

- **A: Chartroom / Nautical Intelligence**: dunkles Marinegrau, warmes Weiß, ruhiges Seegrün, harte Kanten, Karte als Hauptfläche.
- **B: Field Notes / Tageslicht**: helles Papierweiß, dunkle Tinte, Sand als Akzent, stärkerer Dokumentcharakter.

A gewählt: Karte, Rasterlayer und Controls bleiben bei einem Wechsel zwischen Analyse und Navigation optisch stabil. Der Kontrast der Texte und die Touchflächen wurden erhöht. B wäre bei grellem Licht attraktiv; ein expliziter Tageslichtmodus bleibt ein späterer Kandidat, falls Feldtests das bestätigen.

## Priorisierte Befunde

| Prio | Symptom | Ursache | Wirkung | Korrektur | Nachweis |
| --- | --- | --- | --- | --- | --- |
| P0 | Overlay kann auf großen Bildschirmen verzerrt erscheinen | Breite/Höhe der WMS-Pixel werden unabhängig gekappt | Raster und Küste stimmen nicht sauber überein | Proportionale Skalierung der WMS-Bildgröße für EMODnet und EUSeaMap | Dimensionstest, Browser-Layer-Test |
| P0 | Schnelle Karte kann wiederholt Raster nachladen | Während eines WMS-Requests wird nur das alte Bild als Referenz genutzt | Unnötige Requests, späte Bilder und unruhige Karte | Pending-Frame bei kleinen Bewegungen wiederverwenden, veraltete Antwort durch Request-ID verwerfen | 10× Chrome/WebKit, WMS-Requestzählung |
| P0 | Restfinger einer Pinch-Geste bewegt die Karte; Pin-Modus kann einen Pin setzen | Pointer-Zustand geht nach dem ersten Finger in Einzelbewegung zurück | Ungewollte Position und private Markierung | Geste bis zum letzten Pointer als Pinch behandeln, cancel nie als Pin-Tap | Unit-Gestentest und Browser-Pinch |
| P1 | Fehlende Modellwerte und Ortszeiten sind schwer vergleichbar | Niederschlag nicht angefordert; lokale API-Zeit wurde als Browserzeit geparst | Falsches Zeitfenster bei anderer Zeitzone/DST | Stundenwert Niederschlag, Ortszeitvergleich und sichtbare Modellzeit | DST- und Nullwert-Test, Wetter-Browserpfad |
| P1 | Spot-Score wirkt präziser als die Belege | OSM-Struktur und Zugang/Fang werden zusammen gelesen | Überinterpretation eines Kandidaten | Belegt/Abgeleitet/Unbekannt direkt am Spot | Detailansicht in Browser |
| P2 | Mobile Karte und Sheet konkurrieren um Platz | Hoher permanenter Sheet, sechs kleine Nav-Ziele | Weniger Karte und schwache Hierarchie | Kompaktes Karten-Sheet, klare Tab-Leiste, Touchflächen und funktionale Palette | 375×667, 390×844, Desktop-Screenshots |
| P3 | Tageslichtmodus, Spotvergleich, verifizierte Zugangsdaten | Benötigen Feldtest bzw. belastbare Daten | Noch kein belegter Mehrwert | Nächste Iteration nach iPhone-Abnahme | Nutzer- und Datenprüfung |

Grenzen: Transparente WMS-Pixel und tatsächliche Modellabdeckung lassen sich mit dem Image-Element nicht zuverlässig getrennt erkennen; es wird keine Tiefenangabe aus transparentem Raster abgeleitet. Safari auf echter iPhone-Hardware ist weiterhin ungetestet. Private Pins, Favoriten und Fangspeicherformate werden nicht verändert.
