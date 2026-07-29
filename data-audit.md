# Data Audit — aourednik/historical-basemaps

Audit date: 2026-07-21. Source: `https://github.com/aourednik/historical-basemaps`, cloned at HEAD (shallow, depth 1).

## Summary

The dataset is usable as-is for V1. 53 year-snapshots, all referenced files present and parse cleanly, consistent schema, standard lat/lon GeoJSON. One real gap against the V1 spec: **no per-entity existed-date-range field** — that will need to be derived, not read directly.

## Year coverage

53 snapshots, from **-123000** (prehistoric: Homo erectus / Homo heidelbergensis / Neanderthal ranges) to **2010**.

Gap size by era (years between consecutive snapshots):

| Era | Typical gap |
|---|---|
| Prehistoric (-123000 to -2000) | 500–113,000 yrs |
| Ancient (-2000 to 1) | 100–500 yrs |
| Classical/Medieval (1–1400) | ~100 yrs, fairly regular |
| Early modern (1400–1900) | 8–100 yrs, irregular (extra snapshots at key events: 1492, 1783, 1815) |
| Modern (1900–2010) | 6–34 yrs, densest at 1914/1920/1930/1938/1945/1960/1994/2000/2010 |

This matches the plan's expectation exactly: sparse and uneven early, denser in recent centuries. No action needed for V1; densification is already correctly deferred.

## File integrity

- All 53 `index.json` entries have a matching file in `geojson/`.
- No orphan files in `geojson/` beyond `places.geojson` (a separate point layer, see below).
- All 53 files parsed as valid JSON with no errors.
- Spot-checked feature counts vs. `index.json`'s `countries` list — consistent (index is auto-generated from the same `NAME` property, per the repo's `scripts/generateIndex.js`).

## Schema

Every polygon feature carries:
- `NAME` — display name (what the plan calls the "modern/reference name")
- `SUBJECTO` — colonial power / parent authority, or region name if none
- `PARTOF` — larger cultural grouping (e.g. "Czechs" → "Slavic tribes")
- `BORDERPRECISION` — ordinal 1–3 (approximate → legally determined), useful later for a fuzzy-border visual treatment
- `ABBREVN` — abbreviated name (present on most but not all files)

All geometry is `MultiPolygon`, WGS 84 / EPSG:4326 (plain lat/lon) — drops straight into Leaflet or Mapbox GL with no reprojection. The upstream author suggests an equal-area projection (Dymaxion or Mollweide) for whole-world display to reduce distortion; worth a look during the map-shell step but not a blocker.

## Gap vs. V1 spec: no date-range field

**V1 item 3 requires a popup showing the date range an entity existed.** The raw per-feature schema has no `existedFrom`/`existedUntil` field — each file is just a snapshot at one year, with no lifespan metadata attached to individual polygons.

This means date range will have to be **derived**, not read: e.g., for a given `NAME`, scan `index.json` across all years and take the min/max year it appears in. That's an approximation with real caveats — renames, splits, and merges (e.g. an empire fragmenting into successor states with different names) will make the derived range wrong or misleading in plenty of cases. Worth deciding explicitly during the data-pipeline step whether to:
(a) ship the naive min/max-appearance approximation for V1 and caveat it in the popup copy, or
(b) hand-curate date ranges for at least the most-clicked/major entities.

## Size / performance

Total raw GeoJSON: ~73 MB across 53 files. Individual files range from ~100 KB up to:

| File | Size | Features | Notes |
|---|---|---|---|
| `world_1492.geojson` | 4.0 MB | 1946 (1307 named) | Huge spike — captures many small pre-Columbian polities in the Americas at contact. Largest file by far. |
| `world_bc5000.geojson` | 3.7 MB | 279 | Large despite few named entities — likely high vertex density. |
| `world_1815.geojson` | 2.4 MB | 436 | |
| `world_1715.geojson` | 1.9 MB | 758 | |
| `world_1994.geojson` / `world_1600.geojson` / `world_1783.geojson` / `world_1800.geojson` / `world_2000.geojson` | 1.9–1.9 MB | — | |

Recommendation for the data-pipeline step: run these through a simplifier (e.g. `mapshaper -simplify`) and serve gzipped/pre-compressed, especially the 1492 file — a 4 MB fetch on a classroom wifi network on every year-scrub is the kind of thing that'll make the app feel broken.

## Licensing

The repo is **GPLv3** licensed (whole repo, no separate data license file). For a static hosted app that bundles this data, check GPLv3's implications before any public launch — likely just an attribution/credit requirement in practice, but worth a deliberate look rather than assuming MIT-style no-strings reuse. Not a blocker for personal/local development.

## Known upstream-acknowledged quality caveats

Documented directly in the source README, and worth carrying into the app's "about the data" note (already planned as a V1 polish item):
- Historical boundaries are more disputed than modern ones; treat as approximate.
- The nation-state boundary concept itself doesn't really apply before the Peace of Westphalia (1648) — pre-1648 polygons represent something fuzzier than "a country."
- Overlapping civilizational areas in ancient history are intentional, not a data bug.
- Modern physical basemap will visibly mismatch ancient coastlines in places (the README cites the Aral Sea) — already correctly scoped as out-of-bounds for V1.

## Addendum (found while building the map shell)

Some polygons carry **no properties at all** — `NAME`, `SUBJECTO`, `ABBREVN`, `PARTOF` all `null`. Confirmed 102 such features in `world_1815.geojson` alone (out of 436 total). These are presumably unclaimed/unlabeled territory the source author included for coastline completeness but never named. The front end needs to render these as a neutral fallback and show "Unnamed region" rather than crash or show "null" — handled in the map shell (`src/main.js`'s `colorFor`). Worth checking how common this is across other years if it turns out to be visually distracting once more years are wired up.

### Degenerate zero-area polygons upstream — Switzerland is effectively missing from 1994/2000/2010

While wiring up the year control, `topojson-client`'s `feature()` returned `geometry: null` for some features after the pipeline's TopoJSON round-trip. Traced this to the **source data itself**, not the pipeline: reproduces identically even with zero simplification and arbitrarily fine quantization. The affected rings are literally zero-area already in the raw GeoJSON — e.g. one ring is exactly `[P0, P1, P2, P1, P0]`, a there-and-back line with no interior, not a real shape. `mapshaper` (correctly) treats these as empty; `topojson-client` (correctly) reports them as null geometry. Nothing to fix in the pipeline itself.

Across the full 53-file dataset this affects 301 features total, 12 of which carry a real `NAME` rather than being blank placeholders. For 10 of those 12, the entity has a *second* feature (its real territory) that's fine, so it still renders — the dropped one was just a degenerate sliver alongside the real shape (e.g. "Western Roman Empire" in 500, "Danes" in 800, "Apache" in 1600, "Saharan Pastoral Nomads" in bc300).

**But two entities have no surviving feature at all and are effectively absent from the map:**
- **Switzerland** — in **1994, 2000, and 2010** (i.e. every recent/modern snapshot, including the default view). Its only feature in each of these years is a broken 4-point, ~0-area polygon, not a sliver of a bigger shape.
- **West African cereal farmers** — in 900.

**Resolved 2026-07-21** for Switzerland specifically: these three years are now sourced from CShapes 2.0 instead of aourednik (see `expansion-plan.md` Phase 1), which has a correct, real Switzerland polygon. Not a pipeline fix — aourednik's own data still has this defect, it's just no longer the source for those particular years in this app. "West African cereal farmers" (900) is outside the 1886–2019 range CShapes covers, so that one gap is unaffected and still stands.

This is a narrow, upstream data defect (confirmed pre-existing in `aourednik/historical-basemaps`, not introduced by this project's pipeline). Given how central and visible Switzerland is on a modern-day Europe view, it's worth reporting upstream (the source README explicitly invites issue reports) and/or patching locally with a hand-authored replacement geometry for those 4 year-instances. Left as a backlog item for now rather than blocking the map shell — logged here so it isn't rediscovered from scratch later. "West African cereal farmers" (900) remains unresolved.

### Empty (not null) geometry can crash the whole layer, not just the one feature

Found 2026-07-21 while spot-checking years after the CShapes integration (year 1200 was rendering zero polygons). Distinct from the null-geometry case above: some features survive `topojson-client`'s `feature()` as a **non-null** `MultiPolygon` with an empty `coordinates: []` — geometry that "exists" but has no actual rings, presumably simplified away to nothing. Leaflet's `L.GeoJSON` doesn't skip these (only null geometry is skipped), so it builds a real layer with zero points. Calling `.getBounds()` on that layer returns an invalid `LatLngBounds`, and `main.js`'s label-sizing code was calling `.getNorthWest()` on it unguarded — which throws, and since this ran inside `onEachFeature`, the exception aborted the *entire* `L.geoJSON()` call, silently rendering **zero polygons for the whole year**, not just the one broken feature. Confirmed at least one real named entity hit this ("Kingdom of France" in `world_1200.geojson`, alongside two unnamed ones). Fixed with a `bounds.isValid()` guard in `src/main.js` before computing label placement; swept ~20 years across the full 1886–2019 + pre-1886 range afterward with no further zero-polygon years found.

## Other file noted, out of scope for V1

`places.geojson` (4.8 MB) — a point layer of cities/settlements with `inhabitedSince`/`inhabitedUntil` fields per place. Not needed for the polygon-only V1 scope, but it's already shaped like a time-scoped point dataset — worth remembering as a head start when the deferred "event overlay per region/year" feature gets picked up later.

## Recommendation

Proceed to the data-pipeline step (build order item 2) using this dataset as-is. Two decisions to make explicitly during that step rather than later:
1. Naive vs. curated approach to the existed-date-range popup field (see above).
2. Geometry simplification target for the largest files (1492 especially) before they ship to the browser.
