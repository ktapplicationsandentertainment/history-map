# Expansion Plan — more data, more years, more depth

Planning doc only — nothing here is built yet. Covers three related but distinct goals the user asked to plan for on 2026-07-21:

1. **Breadth** — more of the world/more entities represented at a given year.
2. **Resolution** — more available years, denser coverage (especially where the audit found sparse gaps).
3. **Depth** — richer content in the per-region popup beyond name/subject-to/derived date range.

All three keep running into the same underlying question — *can we match an entity in our data to the same entity in someone else's data* — so that's called out as a cross-cutting concern rather than solved three separate times.

## Candidate sources evaluated

| Source | What it offers | License | Verdict |
|---|---|---|---|
| **aourednik/historical-basemaps** (current) | 53 snapshots, -123000 to 2010, whole world | GPLv3 | Already in use. |
| **CShapes 2.0** (Schvitz/Girardin/Rüegger/Weidmann/Cederman/Gleditsch, ETH Zürich) | State + dependency boundaries, **near-annual, 1886–2019** | CC BY-NC-SA 4.0 (non-commercial) | **Strong candidate.** Non-commercial clause is a non-issue — this project already isn't monetized. Distributed as an R package/shapefile; needs conversion into our pipeline. Directly targets the audit's densest-need era (modern history) with real recorded data, not interpolation. |
| **OpenHistoricalMap** | Community-edited, OSM-style, **per-feature `start_date`/`end_date`** (not year-snapshots — actual date ranges), ~8.8M tagged elements as of Jan 2025, coverage back to ~4000 BCE via tagging convention | ODbL (open, share-alike, attribution) | **Most promising long-term source**, but coverage is community-driven and therefore unproven for "how complete is whole-world political boundary coverage, really" — needs a research spike before committing engineering effort. Also a different integration shape than our current one (Overpass-API/extract-based, not a tidy `index.json`). |
| **Wikidata** | `P1448` official name, "historical country" class (Q13020), inception/dissolution dates, `P1365`/`P1366` replaces/replaced-by succession links | CC0 (public domain) | **Strong candidate for depth** specifically: period-accurate name variants, authoritative (not naively-derived) existence dates, predecessor/successor links for "what did this become" popup content. Main cost is entity resolution (see below), not licensing or access. |
| **HYDE** (History Database of the Global Environment) | Gridded population/land-use estimates, 10,000 BCE–2025 CE, 5 arc-minute resolution | Unclear from search — needs direct confirmation before use | **Dropped 2026-07-21** — decided unnecessary for this project, not pursuing. |
| **Euratlas** | 21 century-snapshots of Europe, high production quality | Commercial, €120–150 **per century**, per earlier audit not confirmed redistributable | **Ruled out for now.** Paid, and nothing found confirming a license that permits republishing derived vector data in a free public app. Would need to read the actual purchase license before revisiting. |
| **GeaCron** | Interactive atlas since 3000 BCE | N/A — confirmed again: no polygon/GIS export exists in the free tier, no documented API | **Dead end**, consistent with the original 2026-07-21 audit. Drop from consideration. |

## Cross-cutting concern: entity resolution

Every enhancement above — merging in CShapes years, pulling Wikidata names/dates, eventually reconciling OpenHistoricalMap — runs into the same problem: matching "this polygon, this year" to "the same real-world entity in another dataset." Our own data already shows why this is hard (see `data-audit.md`'s note on `entity-ranges.json`: exact-string-match already produces wrong results for renamed/split/merged entities within a *single* source).

Rather than solving this ad hoc per new source, it's worth treating "a canonical entity ID layer" as shared infrastructure: a mapping table from (our dataset's NAME + year) → a stable internal ID → external IDs (Wikidata QID, CShapes country code, etc.) where matched. This can start small (hand-matched for whichever entities the next phase actually touches) and grow incrementally — it doesn't need to be solved for all 3029 names up front.

## Explicitly not recommended: interpolating between snapshots

A tempting shortcut for "more resolution" is to geometrically morph/interpolate a boundary between two known snapshot years to fake intermediate years. Recommend against this — it would present fabricated boundaries as if they were historical fact, which cuts directly against the plan's original goal of being a credible teaching resource. Resolution should only increase by adding *real* additional snapshots from another source (CShapes, OHM), never by synthesizing shapes.

## Phased approach

**Decided 2026-07-21:** proceed in this order — Phase 1 → Phase 2 → Phase 3. HYDE (population overlay) dropped entirely, not just deprioritized. CShapes replaces aourednik's overlapping years outright rather than sitting alongside them (one snapshot per year in that range, not two).

**Phase 1 — low risk, near-term (done 2026-07-21)**
- Integrated **CShapes 2.0** for 1886–2019, **replacing** aourednik's overlapping snapshots (1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010). Turned out CShapes isn't benchmark-year snapshots at all but a table of exact country-periods (`gwsyear`/`gweyear` per row) — so rather than being stuck with whatever years CShapes' own maintainers picked, generated **one snapshot for every calendar year, 1886–2019** (134 years). Total available years went from 53 → 177. See `README.md`'s "Two data sources, reconciled at the manifest layer" for the pipeline restructuring this required.
- Added a plain "Look up on Wikipedia" link per named entity in the popup (search-redirect, not a matched article — no entity-resolution work needed for this cheap version).
- Bonus, unplanned wins from this pass: (1) CShapes includes a capital-city name for free, now shown in the popup for years it covers; (2) the Switzerland-missing-in-1994/2000/2010 defect noted in `data-audit.md` is moot for this app now, since those years no longer come from aourednik; (3) found and fixed a real front-end bug along the way — a feature with non-null-but-empty geometry could silently zero out an *entire* year's rendering (see `data-audit.md`'s newest addendum).

**Phase 2 — moderate effort, depth-focused (done 2026-07-21, scoped to modern countries)**
- Built the NAME→Wikidata-QID crosswalk (`scripts/build-wikidata-matches.js`), scoped to the 181 distinct country names in the latest year (2019) — the most-visible/most-clicked entities, per the plan. **174 of 181 matched** (CC0). The 7 misses are all non-sovereign territories (Puerto Rico, Guadeloupe, Martinique, French Guyana, Réunion, New Caledonia, French Polynesia) correctly excluded by the country/sovereign-state/historical-country class filter — expanding to territories is a deliberate future increment, not a bug.
- Matching approach: exact label/alias match against Wikidata, filtered to items that are (transitively) an instance of country/sovereign-state/historical-country, disambiguated by Wikipedia sitelink count when more than one candidate matches. A handful of high-visibility misses needed a hand-added alias table (e.g. Wikidata's plain label "China" surprisingly resolves to a civilizational/geographic concept, not the sovereign state — the real match needed "People's Republic of China"; CShapes uses historical-lineage names like "Italy/Sardinia" and "German Federal Republic" for the *modern* country, confirmed via capital city). This is exactly the entity-resolution cost flagged as the cross-cutting concern — hand-curation for ~10 names was cheap; generalizing it further would not be.
- For matched entities: the popup's existed-range now shows Wikidata's real inception/dissolution dates (taking the earliest recorded inception where an entity has several, e.g. France has statements for 481/843/1804 — different refoundings of the same enduring state) instead of the naive derived range, plus predecessor/successor links (capped at 4 + "+N more").
- Period-accurate alternate names (the other half of the original Phase 2 scope) was **not** pursued this round — Wikidata's `skos:altLabel` is mostly modern-English synonyms/exonyms, not what an entity called itself at the time, which is a separate, harder research task. Left for later if it turns out to matter.
- Not wired into the main `npm run build` chain — `npm run build-wikidata` is separate and manual, since it depends on a third-party network service (Wikidata's SPARQL endpoint) that the core map-data pipeline shouldn't be blocked by. Results cached in `.cache/wikidata/` (gitignored).

**Phase 3 — research spike done 2026-07-21. Verdict: not ready for a full integration; genuinely exciting as a future opt-in enhancement for specific well-mapped entities.**

Queried OHM's live Overpass API instance directly (`https://overpass-api.openhistoricalmap.org/api/`, CC0) rather than relying on secondary sources — a wiki tracking page suggested sparse coverage, worth confirming against ground truth rather than trusting a possibly-stale summary.

**Data quality where it exists: excellent, better than anything else evaluated.** France alone has **34 separate `admin_level=2` relations** with `start_date`/`end_date` tags, spanning 987 CE ("Reaume de France") through sub-year-precision boundary changes across 20th-century decolonization (e.g. a distinct relation for 1977-06-27 to 1980-07-30) up to the present — far finer temporal resolution than CShapes' annual snapshots, sourced to real historical events (e.g. `end_event: "French Southern and Antarctic Lands organized as a department..."`, with a Wikipedia source tag). Confirmed the geometry itself is real and usable too — fetched the 987 CE France relation directly: 171 member ways with actual lat/lon coordinates, assemblable into a real polygon.

**But coverage is extremely uneven, confirming the plan's original worry.** Sampled beyond France:
| Region | `admin_level=2` relations with `start_date` |
|---|---|
| France | 34 (987 CE–present) |
| Canada | 6 (1871–present) |
| Kenya | 3 (1963–present) |
| Peru | 3 (1822–1836 only) |
| Mali | 1 (1960–present only, no pre-independence history) |
| Nigeria | 1 (1998–present only) |
| East Timor | 1 (1999–2002 only, doesn't even reach the present) |
| Ethiopia | **0** |
| Mongolia | **0** |
| India | **0** |
| Vietnam | **0** |

A global count of every `admin_level=2` relation with a `start_date` tag found **3879 relations across 1580 distinct names** — genuinely global in *subject matter* (Roman/Byzantine Empire, Ottoman Empire, Qing Dynasty, Goryeo-era Korea, Ayutthaya/Thonburi Thai kingdoms, Viceroyalty of Peru, Russian Empire all appear with real depth), so this isn't simply "only Western Europe is mapped."

**Correction found during integration:** the India/Mongolia zeroes above were a spike-methodology artifact, not real gaps — the spike's quick queries only pattern-matched the plain `name` tag, but OHM stores many countries' primary `name` in the local script (Mongolia's relation has `name: "Монгол Улс"`, `name:en: "Mongolia"`; India's has `name: "भारत / India"`). The real pipeline checks `name:en` too and found both. Ethiopia's zero held up as real.

**Decision 2026-07-21: user disagreed with the "don't build it" recommendation** — as long as sourcing is transparent (a methodology page is on the roadmap regardless), more precision where it exists adds credibility rather than undermining it; patchy-but-labeled beats uniform-but-coarse. Proceeded with a real integration: OHM boundaries **replace** the corresponding entity's geometry for whichever specific years OHM covers, rather than staying a text-only enrichment layer. Everything else keeps using aourednik/CShapes untouched.

**Implementation:**
- A blanket global query for full geometry returned **4.8 GB** (OHM boundaries are genuinely detailed — some single relations have 80,000+ coordinate points) — impractical. Fetched tags-only first (~9 MB), matched relation names against our *existing* entity names, then fetched full geometry only for that matched subset: 1197 of 3879 relations, ~2.1 GB raw (`scripts/pull-ohm.js`, batched by ID, cached in `.cache/ohm/`).
- Converted OSM relations to real GeoJSON polygons via `osmtogeojson` (confirmed via direct test: the 987 CE France relation has 171 real member ways with lat/lon geometry, not just tags).
- `scripts/build-ohm.js` decodes each existing year file back to GeoJSON, swaps in OHM's geometry for any entity/year OHM has an active relation for (`gwsyear`-style day-precision matching, not just calendar year), tags the feature with `OHM_START`/`OHM_END`/`OHM_SOURCE`, and re-runs the whole file through the same simplify+topojson step as every other source — same feature-count integrity check as always.
- Reused the Phase 2 Wikidata alias-override table (extracted to `scripts/lib/name-overrides.js`) since the same naming mismatches recur — OHM's "United States" didn't match our "United States of America" until the override was applied in both directions (which relations to even *fetch*, and which our-entity to patch).

**Result:** **233 distinct entities, 10,712 feature-years, across 171 of 177 year files** now carry real OHM-sourced boundaries — including France, the US, UK, most of Europe, much of Latin America, large parts of Africa and Asia, and pre-modern empires (Roman, Ottoman, Abbasid/Umayyad/Fatimid Caliphates, Mongol Empire, Mughal Empire). Total `public/data` size grew from 31 MB to 168 MB — modern year files went from ~90–190 KB to ~1.5 MB each, still a reasonable download.

Front end: OHM-sourced polygons get a distinct gold outline (visible before clicking, not just a popup detail) and the popup shows a separate "This boundary shape dated (OpenHistoricalMap): ..." line with a link to the source relation, alongside (not replacing) the Wikidata existed-range — they answer different questions: Wikidata is "how long has this named entity existed overall," OHM is "since when has *this exact boundary shape* been in effect."
