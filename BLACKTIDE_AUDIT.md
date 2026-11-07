# BLACKTIDE · first implementation audit (2026-11-07)

Baseline: `main` at `262f6e4` (public RSS metadata after PR #15). Live GitHub Pages opened in Chrome at 1365×936: OSM tiles and attribution rendered; map, region strip, six-item navigation and side drawer observed. Existing CI has offline quality checks, 10× Chrome and 10× WebKit mobile workflows. Actual iPhone Safari remains unverified under issue #16. Local Chromium/WebKit binaries could not be downloaded in this restricted executor; browser release gate is GitHub Actions.

## Priority and correction

| Priority | Symptom → root cause | User impact → correction → verification |
| --- | --- | --- |
| P0 | Overpass response can arrive after region/pan/zoom change; request commits without view identity check. | Wrong map candidates → abort on region change and discard stale result after movement/zoom → delayed-response regression in `tests/test_map.js`. |
| P0 | WMS PNG success alone is treated as usable local depth coverage. | Blank/transparent raster can be mistaken for data → status explicitly says coverage unverified and distinguishes request, service failure, zoom limit and antimeridian → mocked browser layer checks, live iPhone still pending. Pixel-level coverage check requires a separately verified source. |
| P1 | Open-Meteo local timestamps were parsed in the visitor device timezone. | Wrong future hours for travellers and DST → request UTC, convert display/grouping to France/Croatia timezone, preserve null precipitation → DST and missing-data regressions; browser forecast path. |
| P1 | Spot card highlighted an unvalidated numeric structure score. | False precision → show source/evidence and keep historical heuristic collapsed, preserving stored data → spot detail browser checks. |
| P2 | Numerous small labels, gradients and six tightly packed navigation items. | Poor field readability → BLACKTIDE tokens, flat controls, 44px targets and direct map-return button → 375×667, 390×844, desktop visual gate. |
| P3 | Verified access, local shore hazard and raster coverage remain absent. | Future work: authoritative layers and explicit unknown states, without inferred safety or fish probability. |

Design directions considered: (1) light hydrographic chart with navy ink, strong daylight contrast but visually competes with bright OSM tiles; (2) BLACKTIDE dark chart-room frame with warm text, muted sea-green action and flat controls. Direction 2 chosen for separation of controls from the bright map and compatibility with existing app modules. The map stays the largest mobile surface, with a compact result sheet and a one-tap return to map.

Private `localStorage` keys and catch backup format are unchanged. No new dependency, paid provider or public coordinate fixture was added. Existing score and features remain available. This is one transformation slice, not completion of all requested intelligence modules.
