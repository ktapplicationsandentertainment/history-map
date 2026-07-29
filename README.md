# History Map — Data Pipeline & Front End

See [`historical-boundaries-map-plan.md`](historical-boundaries-map-plan.md) for the original V1 plan, [`data-audit.md`](data-audit.md) for the source-data audit, and [`expansion-plan.md`](expansion-plan.md) for the post-V1 roadmap (more data, more years, more depth) currently in progress.

All of the original build order (steps 1–7: audit, pipeline, map shell, year control, popup, URL state, polish) is done, plus all three phases of the expansion plan.

## Site structure (as of 2026-07-29)

Three pages, deliberately split for SEO: the interactive app has almost no crawlable text (it's a JS-rendered map), so it can't carry search/social-preview duty itself.

- `/` (`index.html`) — the SEO landing page: real prose, Open Graph/Twitter meta tags, JSON-LD, `og-image.png`. This is what search engines and link previews should show.
- `/map.html` — the actual interactive map (former `index.html`). Marked `noindex, follow` so it doesn't compete with the landing page for search ranking.
- `/methodology.html` — unchanged.

`?year=` links now live on `/map.html`, not `/` (e.g. `/map.html?year=1815`). `robots.txt` and `sitemap.xml` (listing `/` and `/methodology.html` only — not the noindexed map) live in `public/`.

## Running it

```
npm install
npm run build-all-data   # pulls aourednik + CShapes, rebuilds year files + manifest
npm run pull-ohm && npm run build-ohm && npm run build-manifest   # optional: patch in OHM boundaries (see below)
npm run build-wikidata                                            # optional: Wikidata date/succession enrichment
npm run dev               # starts the map at localhost:5174 (or whatever port is free)
```

`npm run build` is reserved for Vite's own production bundle (`vite build`, outputs to `dist/`) — the data pipeline is `build-all-data`, a separate, deliberately-not-automatic step (see "Going live" below for why).

Individual data-pipeline steps: `pull-source` (aourednik, clones/updates `.cache/historical-basemaps`) → `build-data` (aourednik years) → `pull-cshapes` (downloads `.cache/cshapes/CShapes-2.0.geojson`, cached — delete it to force a re-fetch) → `build-cshapes` (CShapes years) → `build-manifest` (scans everything on disk in `public/data/years/` and (re)builds `manifest.json` + `entity-ranges.json`). Order matters for a clean build: manifest must run last since it just reflects whatever's already on disk. `pull-ohm`/`build-ohm` and `build-wikidata` are separate, optional enrichment passes — not part of `build-all-data` since both depend on third-party network services the core map data shouldn't be blocked by; run `build-manifest` again after either.

## What it produces

- `public/data/years/y{YEAR}.json` — one TopoJSON file per year (negative years for BC, e.g. `y-500.json`). **177 years** as of 2026-07-21: 43 from aourednik (-123000 to 1880) + 134 from CShapes (1886–2019, one for every calendar year).
- `public/data/manifest.json` — the list of available years with per-year stats.
- `public/data/entity-ranges.json` — a derived `{ name: { firstYear, lastYear, yearsPresent, discontinuous } }` map for every entity name across the whole combined dataset.

## Three data sources, reconciled at the manifest layer

`build-data.js` (aourednik), `build-cshapes.js` (CShapes), and `build-ohm.js` (OpenHistoricalMap) each just write/patch year files in the same `public/data/years/` directory — none of them know about each other. `build-manifest.js` is the one place that scans the *actual resulting files on disk* to build `manifest.json`/`entity-ranges.json`, rather than trusting any one source's own index. That was a deliberate choice from Phase 1 that paid off directly in Phase 3: adding OHM required zero changes to the manifest logic.

**OHM is a patch, not a base layer.** Unlike aourednik/CShapes (which generate whole year files), `build-ohm.js` decodes an *existing* year file, replaces the geometry (and adds `OHM_START`/`OHM_END`/`OHM_SOURCE` properties) for whichever specific entities OHM has an active, matched relation for that year, and leaves everything else in the file untouched. See `expansion-plan.md` Phase 3 for why: OHM's real-world coverage is excellent for some entities (France: 34 relations back to 987 CE) and completely absent for most — patching in the good parts and leaving gaps as gaps (using the existing aourednik/CShapes geometry) beats forcing a uniform layer that doesn't exist.

**aourednik's 1900/1914/1920/1930/1938/1945/1960/1994/2000/2010 are deliberately skipped** in `build-data.js` (see `SUPERSEDED_BY_CSHAPES`) — CShapes replaces them outright rather than sitting alongside them, per the 2026-07-21 decision to prioritize one denser source over two sparser overlapping ones for the modern era.

## Decisions made

**Geometry simplification: `mapshaper -simplify 10% keep-shapes`, deliberately *without* `-clean`, for both sources.**
`-clean` dissolves/drops what it considers slivers and overlapping polygons — intentional in this kind of data, not errors (see the audit's "Conceptual limitations" section). It silently deleted up to 485 of 1946 features on the 1492 snapshot alone. Dropped from the pipeline entirely; both `build-data.js` and `build-cshapes.js` assert output feature count matches source feature count and throw if they ever diverge. (Shared as `scripts/lib/topojson-utils.js`.)

**CShapes 2.0 for 1886–2019, one snapshot per calendar year, replacing aourednik's overlapping years.** Decided 2026-07-21 (see `expansion-plan.md` Phase 1). CShapes' raw data isn't benchmark-year snapshots at all — it's a table of country-periods, each with its own `gwsyear`/`gweyear`. `build-cshapes.js` picks, for each of the 134 calendar years, whichever period row was active (`gwsyear <= year <= gweyear`) and assembles a synthetic GeoJSON for that year. CShapes has no `SUBJECTO`/`ABBREVN`/`PARTOF` equivalent, but does include a capital city name for free (`CAPITAL` in our schema) and the Gleditsch & Ward country code (`GWCODE`, kept for future entity-matching work, not yet used by the front end). License: CC BY-NC-SA 4.0 — non-commercial, which is a non-issue since this project already isn't monetized.

**Date-range popup field: naive derivation for most entities, real Wikidata dates for modern countries.** For each entity `NAME`, `build-manifest.js` takes the min/max year it appears across *all* 177 combined years — an approximation, since renames/splits/merges produce a misleading range (e.g. "Roman Empire" only literally spans -1 to 200 in this scheme). `entity-ranges.json` flags `discontinuous: true` for any name whose appearances have a gap in the middle. For the 174 (of 181) modern countries `scripts/build-wikidata-matches.js` could confidently match to a Wikidata item (see `expansion-plan.md` Phase 2), the front end shows Wikidata's real inception/dissolution dates and predecessor/successor links instead — a strictly better source when it's available, so it takes priority over the naive range rather than sitting alongside it.

**OHM entity matching, and a shared alias-override table.** `scripts/lib/name-overrides.js` holds a small hand-curated table of naming mismatches between our dataset (mostly CShapes' GW-style historical-lineage names) and what external sources actually call things — first found in Phase 2 (Wikidata's plain label "China" resolves to a civilizational concept, not the sovereign state) and reused as-is in Phase 3, since OHM hit the *same* mismatches (its "United States" didn't match our "United States of America" until the override was wired into both `pull-ohm.js`'s fetch-list and `build-ohm.js`'s patch-matching). One naming/data-quality lesson specific to OHM: a quick manual Overpass query only checking the plain `name` tag reported zero coverage for Mongolia and India during the Phase 3 research spike — both actually have real data, just with `name` in the local script (`Монгол Улс`, `भारत / India`) and the English name only in `name:en`. The real pipeline checks both tags, so it found matches the spike's quicker manual check missed. Ethiopia's zero held up as real.

**Fetching OHM: batched by matched relation ID, not one global query.** A blanket "every admin_level=2 relation with start_date, full geometry" query against OHM's Overpass API returned **4.8 GB** — some individual relations have 80,000+ coordinate points, genuinely detailed data, not a bug. `pull-ohm.js` fetches tags only first (~9 MB), matches names against our *existing* entities so it only bothers fetching geometry for entities we'd actually use (1197 of 3879 relations, ~2.1 GB raw, batched by ID in groups of 15 and cached), then `build-ohm.js` converts each via `osmtogeojson` and patches it in.

## Front end

`index.html` / `src/main.js` / `src/style.css` — Leaflet + CARTO Positron (no-labels) basemap, a year slider + prev/next step buttons driven by `manifest.json` (snaps only to supported years), click-to-popup with name/subject/capital/derived date-range/Wikipedia link, an on-map labels toggle, a loading-state overlay, an "About this map" panel, and `?year=` URL state.

Notable non-obvious things in `src/main.js`:
- Rapid slider dragging is guarded against races (a `currentRequestId` counter discards a slow response from an old year if a newer one has since been requested).
- On-map labels (permanent tooltips) are skipped while the slider is actively moving and only added ~350ms after it settles, and can be toggled off entirely via the "Show labels" checkbox. Labels are also skipped for any polygon under `LABEL_MIN_PIXEL_AREA` px² on screen, so a world view doesn't get cluttered with text for tiny historical polities.
- A feature can have **non-null but empty** geometry (`MultiPolygon` with `coordinates: []`, simplified away to nothing) — `layer.getBounds()` on that throws when read, and since that call runs inside `onEachFeature`, an unguarded read used to silently abort rendering of the *entire* year, not just that one feature (found 2026-07-21 on `world_1200.geojson`). Guarded with `bounds.isValid()` — see `data-audit.md`'s addendum.
- Popup date ranges plus a plain (unverified) Wikipedia search link per named entity — see `expansion-plan.md` Phase 1 for why the link is a cheap search-redirect rather than a matched article.
- `wikidataMatches` (loaded from `public/data/wikidata-matches.json`, optional — missing/failed fetch doesn't block the app) takes priority over the derived `entityRanges` range when a name has a match; `formatWikidataExistedLine`/`formatSuccessionLine` in `src/main.js` do the formatting, including truncating long predecessor/successor lists to 4 + "+N more".
- Features with `OHM_START` (patched by `build-ohm.js`) get a distinct gold outline (`#b8860b`, thicker weight) so the extra precision is visible before clicking, and the popup shows a separate gold-highlighted "This boundary shape dated (OpenHistoricalMap): ..." line via `formatOhmLine` — shown *alongside* the Wikidata existed-range, not replacing it, since they answer different questions (overall entity existence vs. this specific boundary shape's date range).

## Next

All three expansion-plan.md phases are done: CShapes for 1886–2019 (Phase 1), Wikidata date/succession enrichment for modern countries (Phase 2), and OpenHistoricalMap boundary patching for 233 well-documented entities (Phase 3). A methodology/"how this map was built" page has been mentioned as wanted at some point — the "About this map" panel currently covers this compactly, but a fuller standalone page is still open. No other phase currently queued; next steps are open for direction.
