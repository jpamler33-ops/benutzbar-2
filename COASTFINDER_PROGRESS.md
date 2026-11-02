# COASTFINDER – verified engineering progress

## 2026-11-01: Reproducible fixes and V6 release
**Scope**: public repository jpamler33-ops/benutzbar-2. Zero mandatory costs. No personal catch records or coordinates are uploaded.

### Verified releases
- **Baseline QA infrastructure** – squash commit \`89821e91c2b924108d4ecd7b55c2006552835590\`, [PR #1](https://github.com/jpamler33-ops/benutzbar-2/pull/1). Adds \`.github/workflows/quality-gate.yml\` and read-only smoke checks; GitHub CI green.
- **RSS precision fix** – squash commit \`3dd04438265011ded6ae9968dfcbdb337a226401\`, [PR #2](https://github.com/jpamler33-ops/benutzbar-2/pull/2). Root cause: French *cannes* means rods and the city Cannes. Fixed ambiguous place names, rejected sales/gear-only headlines, added cached-article revalidation so stale false positives cannot return, and removed two previously misclassified posts. CI tested offline positive and negative samples, syntax and public dataset security: green. A false-positive fix improves precision but can reduce recall; check relevant articles carefully.
- **V6 Geo Intelligence** – squash commit \`36aac83912d4c997c9678b20a8cd388722cd8c4d\`, [PR #3](https://github.com/jpamler33-ops/benutzbar-2/pull/3). Adds opt-in 250/500/1000m seaward profile from EMODnet REST, EUSeaMap 2025 WMS overlay, direction selection, per-spot weather summary, missing-data warnings and cached depth requests. Official EMODnet docs confirm REST /depth_profile uses LineString and returns numeric array. Local Node geo assertions and mocked desktop/iPhone browser interaction passed; GitHub CI for PR and main green. GitHub Pages deploy for V6 commit also green.

### Important test limits
- **Not end-to-end verified:** production mobile Safari, actual browser-to-EMODnet CORS and WMS image availability, real coastal line profiles, marine warning accuracy, actual access/legal suitability. A green Pages deployment is **not** proof that all live APIs work.
- Profile bearings are selected manually: an inland line or a bathymetric raster gap is **unknown**, not a valid depth or a safe fishing spot.
- The conditions score is an **uncalibrated model burden**, not a fish catch probability.
- User catch records and private pins remain exclusively in device-local storage.

### Next incremental actions (in evidence-first order)
1. **CF-005/CF-006/CF-007**: independently smoke-test real deployed V6 via browser and official EMODnet APIs; confirm WMS layer \`eusm2025_subs_400\`, profile parsing, service timeout and CORS behavior. Do not invent confirmation when live requests cannot be run.
2. **CF-003**: audit RSS source configuration for genuine coastal relevance, license and source language. Known: \`morski-ribolov.net/feed/\` returned invalid XML; \`morski-ribolov.net\` describes itself as a *Slovenian* maritime-fishing forum, not a Croatian forum. Do not blindly substitute an untested RSS URL. Prefer truly relevant FR/HR feeds.
3. Audit classifier *precision and recall* using multilingual held-out fixtures (FR, HR, German, Slovenian), especially geo names \`Cannes/Nice/Var/Vis/Vir\`, fish vs gear, and seasonal terms. Never count forum words as confirmed catches.
4. Improve automated live-source checks with explicit attribution and practical failure diagnostics while respecting zero-cost limits and avoiding alert spam.
5. Only change main after relevant CI green, and verify subsequent Pages deployment. Keep changes small and reversible.

### Rules for hourly automation
Re-read current Git HEAD, CI, deployed assets and these notes at each iteration. No duplicated fixes or status-only commits. Prioritize a reproducible current defect and a testable patch. Distinguish *implemented*, *CI-verified* and *live API-verified*. No paid account, no unpublished/private user coordinates, no experimental catch predictions, no changes to other projects. Report root cause, exact changed code, tests actually run, result, remaining risk and next step.


## 2026-11-02: verified Croatian shore-RSS and evidence separation
- **Problem (verified):** After the old French gear false positives were removed, static `feed/radar.json` had 0 matched posts. The former Slovenian sea-fishing forum URLs `/feed/`, `/feed.php`, `/app.php/feed` served invalid RSS/XML; an additional Croatian forum endpoint returned HTTP 404. The forum itself remains readable manually, but automatic ingestion was not functional.
- **Independent candidate probe:** `https://naudici.com/feed/` passed robots.txt and produced valid RSS with 10 items in the live GitHub Actions runner on 2026-11-02. Specialized shore category RSS URLs returned zero items, so ingestion filters the *publisher's RSS category metadata* `Ribolov s obale` from the verified main feed. The portal publishes editorial fishing articles, **not forum comments or verified catches**.
- **Implementation:** enable `naudici_shore` with exact category allowlist, disable bad `morski_ribolov` feed without removing its manual homepage; extract RSS tags before classification; show editorials without geographical proof in a clearly separate expandable Adriatic section (not in regional spot count/fish statistics). Country of publication does **not** establish catch country. Preserve already validated editorial items across RSS refreshes; fetched source metric now counts actual RSS entries rather than only filtered articles. A GitHub main-branch source-code change now triggers feed refresh in addition to the existing twice-daily schedule.
- **Red Team:** added Croatian sales/gear vocabulary `prodaja`, `stapovi` etc. New 13-test Python RSS suite caught an actual false positive (Croatian gear sale), which was corrected; Node UI test verifies locality separation, escaping HTML injection attempts, disabled-source display, and France/Croatia isolation.
- **Real diagnostics on PR #5:** connected sources `barsch_alarm`, `anglerboard`, `gobages`, `naudici_shore` checked successfully; broken Slovenian RSS disabled. Controlled noncommitting CI import produced **1 article** (from 10 RSS items in the verified Croatian feed). This article has **no verified region**; zero regional articles remains an honest outcome. No personal catches or coordinates were uploaded.
- **Limits and next work:** initial feed has limited eligible fresh posts; editorial titles/brief RSS descriptions cannot prove a precise fishing place, fish presence or catch time. Monitor real future data and keep expanding only verified, robots-allowed specialist sources; don't substitute untested feed URLs. Production pages and next scheduled RSS import must be confirmed separately after merge.
