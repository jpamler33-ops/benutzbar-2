# BLACKTIDE · Iteration 1 · 7 November 2026

Baseline: `main` at `262f6e4d7644bbcdeed63be0f3e9542c76c80fce`. PR #15 supplied buffered WMS layers; the following commit only updated RSS metadata. Issue #16 remains open for real iPhone Safari verification. Live GitHub Pages was inspected on desktop: OSM rendered and EMODnet bathymetry appeared after loading. This is not a hardware Safari pass.

## Design decision

| Direction | Character | Mobile reading | Decision |
| --- | --- | --- | --- |
| BLACKTIDE / field instrument | Deep ink, warm paper, muted sea green, compact chart controls, square hardware edges | Strong distinction between map, controls and evidence, with restrained contrast | Chosen |
| DAYMARK / coastal atlas | Light limestone, navy type, amber chart annotations | Excellent daylight potential but less separation from bright OSM tiles and less continuity with the existing dark shell | Deferred for a future daylight mode |

## Prioritized findings

| Priority | Symptom → root cause | User effect → correction → verification |
| --- | --- | --- |
| P0 | Holding the map creates a pin without activating Pin mode; `pointerdown` timer and context menu called `createPin` unconditionally. | Accidental private records → require Pin mode and clear it after placing → map smoke regression. |
| P1 | Region changed while Overpass responded; the previous request could populate the new region. | Wrong location evidence → abort on region switch, invalidate stale response → code review and browser regression pending. |
| P1 | Forecast model hours lacked offsets; `new Date(localHour)` interpreted the fishing location's wall time in the browser's time zone. | Wrong hour selection when travelling or during DST → request UTC, preserve absolute instant and display France/Croatia local hour → DST regression and 10× trip tests. |
| P1 | A structure score and GPS point were prominent without an immediately readable evidence ledger. | Spot could look verified → explicit BELEGT / ABGELEITET / UNBEKANNT; source freshness and access uncertainty → detail UI browser check pending. |
| P2 | Six crowded tabs and rounded cyan dashboard styling compete with the map. | Small screen navigation and weak information hierarchy → BLACKTIDE tokens, compact chart controls and map-first sheet → 375×667, 390×844, desktop visual verification pending. |
| P3 | A local-time `datetime-local` plan cannot distinguish the repeated hour at autumn DST change. | Ambiguous trip timestamp → add explicit offset or UTC instant to a future migration, retaining the current storage format until migration is validated. |

## Limits and release gate

The CI 10× Chromium and 10× WebKit workflows remain intact. Local browser executables could not be downloaded in this environment; no post-redesign screenshot or mobile browser pass is claimed. The PR must stay unmerged until CI and mobile visual inspection pass. A real iPhone Safari run remains required for issue #16. External raster coverage and legal access are unverified; the app does not infer a depth or an accessible fishing position from an empty raster.
