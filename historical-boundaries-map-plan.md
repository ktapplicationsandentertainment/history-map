# Historical Political Boundaries Map — Project Plan

## Overview
A web app that shows a map of the world's political boundaries for any year in history, with a year-based control to move through time. Long-standing personal passion project, intended to also serve as a free research/teaching resource for high school and college history classrooms.

## Purpose & Audience
- Primary: personal passion project
- Secondary: usable by teachers and students (high school / college level) as a research and teaching resource
- Not profit-driven — no monetization requirement should shape design decisions

## Core Concept
- A single whole-world view (not scoped down to one region) — the point is to see interactions between regions at a glance, for any year.
- A year control lets the user jump to a year; the app renders political boundaries as they existed at that time, over a **modern** physical basemap (today's coastlines/rivers — not modeling how physical geography itself has changed).

## V1 Scope (Locked)
1. Whole-world map, single view, political boundaries only.
2. Year control that only offers years the underlying data actually supports (snap-to-available, not a free-text date field). Coverage will be sparse and unevenly spaced early in history, denser in modern centuries — expected and fine for v1.
3. Click a region → popup showing:
   - Modern/reference name of the entity
   - Date range the entity existed
4. No accounts, no login, nothing server-side required to use the app.
5. Shareable/linkable URL that captures the current year, so a specific moment can be linked from a lesson plan.

## Explicitly Deferred (Not in V1)
- **Period-accurate names** — what a region called itself at the time, not its modern name. Its own research/data task, separate from boundary rendering.
- **Event overlays per region/year** (e.g. "what happened here in 1848") — needs its own curated data source, possibly seeded from Wikipedia links, layered on top once the map itself is solid.
- **Denser year coverage** — filling gaps between existing data snapshots.
- **Disputed-border nuance** beyond whatever the source data already encodes.
- Any login, accounts, or user-generated content.

## Data Strategy
- Start from an existing open/free dataset rather than authoring boundary data from scratch.
- Leading candidate: the `aourednik/historical-basemaps` GitHub project — GeoJSON boundaries at roughly 40–100 unevenly-spaced year snapshots from ~2000 BC to present. Used by several comparable existing tools (Historic Borders, Point in History).
- **First concrete task**: pull the dataset's index file and inventory exactly which years exist, which regions/entities are covered per year, and where the obvious gaps or quality issues are. This turns "whole-world, all-history" from an assumption into a known, scoped dataset.
- After the audit, decide per gap whether to (a) leave it and let the year control skip it, (b) patch in a supplementary source for that period, or (c) author new data. Treat this as an ongoing backlog, not a v1 blocker.
- Other sources noted as possible future supplements: Euratlas.net, GeaCron.com (data not freely extractable as-is), David Rumsey Map Collection, Ancient World Mapping Center (UNC).

## Technical Architecture (Conceptual)
Design goal: no backend, no database, nothing that needs to be kept running or maintained. The boundary data is read-only reference content, not something requiring live writes.

- **Data pipeline**: a script (run once, then occasionally re-run as data improves) that pulls the source GeoJSON and reshapes/cleans it into whatever per-year file structure the front end consumes.
- **Front end**: a mapping library built for GeoJSON rendering (Leaflet or Mapbox GL are the standard options), a year-slider/control component, and region click handlers for the info popup.
- **Hosting**: static hosting only (GitHub Pages, Cloudflare Pages, Netlify, or Vercel) — free tier is sufficient, nothing to maintain.
- **State/sharing**: current year encoded in the URL (e.g. a query parameter) so a specific view is linkable without any server-side session.

## Suggested Build Order
1. **Data audit** — pull the dataset, inventory available years, coverage, and quality.
2. **Data pipeline** — script to convert raw source data into per-year files the front end will use.
3. **Map shell** — render a single hardcoded year's GeoJSON on a basemap; prove the rendering approach.
4. **Year control** — wire up a slider/selector to swap the rendered year, restricted to available years.
5. **Region click → info popup** — modern name + existed date range.
6. **Shareable URL state.**
7. **Polish pass** — loading states, legibility on a classroom projector, a short "about the data" note for credibility with teachers.

## Open Questions to Revisit Later
- How to progressively densify year coverage over time.
- How/whether to source period-accurate names.
- Where event data would come from for the future event-overlay feature.
- Any accessibility/classroom-specific needs (e.g. high-contrast mode for projectors).
