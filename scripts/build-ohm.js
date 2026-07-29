// Phase 3 (expansion-plan.md): patches OpenHistoricalMap's more precise,
// date-accurate boundaries into our existing per-year files, for whichever
// entities/years OHM actually covers. Everything else is untouched — this
// is an opportunistic upgrade, not a new base layer, since OHM's real-world
// coverage is confirmed (see the Phase 3 research spike) to be excellent
// for some entities and completely absent for most.
//
// Integration point: decode each existing year's TopoJSON back to GeoJSON,
// swap in the OHM geometry for any matching, active entity, then re-run the
// whole file through the same simplify+topojson step every other source
// uses — one consistent quantization/topology pass, not two.
const fs = require('fs');
const path = require('path');
const osmtogeojson = require('osmtogeojson');
const { feature } = require('topojson-client');
const { simplifyToTopojson } = require('./lib/topojson-utils');
const { REVERSE_ALIAS_OVERRIDES } = require('./lib/name-overrides');

const CACHE_DIR = path.join(__dirname, '..', '.cache', 'ohm');
const GEOM_DIR = path.join(CACHE_DIR, 'geometry-batches');
const YEARS_DIR = path.join(__dirname, '..', 'public', 'data', 'years');

function parseOhmDate(str) {
  if (!str) return null;
  const cleaned = str.replace(/[~?]/g, '').trim();
  const match = cleaned.match(/^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = match[2] ? parseInt(match[2], 10) : 1;
  const day = match[3] ? parseInt(match[3], 10) : 1;
  return Date.UTC(year, month - 1, day);
}

function loadOhmCandidates() {
  const geomFiles = fs.readdirSync(GEOM_DIR).filter((f) => f.endsWith('.json'));
  const candidatesByName = new Map(); // ourName -> [{ geometry, startMs, endMs, startRaw, endRaw, sourceRelationId }]

  for (const file of geomFiles) {
    const batch = JSON.parse(fs.readFileSync(path.join(GEOM_DIR, file), 'utf8'));
    const gj = osmtogeojson(batch);
    for (const f of gj.features) {
      // osmtogeojson also emits standalone Point features for member nodes
      // (e.g. admin_centre) — only the boundary polygon itself is useful here.
      if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
      const props = f.properties;
      const rawName = props['name:en'] || props.name;
      if (!rawName) continue;
      const ourName = REVERSE_ALIAS_OVERRIDES[rawName] || rawName;
      const startMs = parseOhmDate(props.start_date);
      if (startMs === null) continue; // can't place it in time, useless for our purposes
      const endMs = parseOhmDate(props.end_date);

      if (!candidatesByName.has(ourName)) candidatesByName.set(ourName, []);
      candidatesByName.get(ourName).push({
        geometry: f.geometry,
        startMs,
        endMs,
        startRaw: props.start_date,
        endRaw: props.end_date || null,
        sourceRelationId: f.id, // e.g. "relation/2750108" — osmtogeojson puts this at feature.id, not properties['@id']
      });
    }
  }
  return candidatesByName;
}

function findActiveCandidate(candidates, year) {
  const jan1 = Date.UTC(year, 0, 1);
  return candidates.find((c) => c.startMs <= jan1 && (c.endMs === null || jan1 <= c.endMs)) || null;
}

async function main() {
  const candidatesByName = loadOhmCandidates();
  console.log(`Loaded OHM geometry for ${candidatesByName.size} distinct matched names`);

  const yearFiles = fs.readdirSync(YEARS_DIR).filter((f) => /^y-?\d+\.json$/.test(f));
  let totalReplacements = 0;
  let yearsTouched = 0;

  for (const file of yearFiles) {
    const year = Number(file.match(/^y(-?\d+)\.json$/)[1]);
    const filePath = path.join(YEARS_DIR, file);
    const topo = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const objKey = Object.keys(topo.objects)[0];
    const gj = feature(topo, topo.objects[objKey]);
    const originalCount = gj.features.length;

    let replacedThisYear = 0;
    for (const f of gj.features) {
      const name = f.properties && f.properties.NAME;
      if (!name || !candidatesByName.has(name)) continue;
      const active = findActiveCandidate(candidatesByName.get(name), year);
      if (!active) continue;

      f.geometry = active.geometry;
      f.properties.OHM_START = active.startRaw;
      f.properties.OHM_END = active.endRaw;
      f.properties.OHM_SOURCE = active.sourceRelationId;
      replacedThisYear++;
    }

    if (replacedThisYear === 0) continue;

    const topojson = await simplifyToTopojson(JSON.stringify(gj));
    const rewritten = JSON.parse(topojson);
    const rewrittenKey = Object.keys(rewritten.objects)[0];
    const outputCount = rewritten.objects[rewrittenKey].geometries.length;
    if (outputCount !== originalCount) {
      throw new Error(`Feature count changed for ${file} after OHM patch: ${originalCount} -> ${outputCount}`);
    }

    fs.writeFileSync(filePath, topojson);
    totalReplacements += replacedThisYear;
    yearsTouched++;
    console.log(`${year}: replaced ${replacedThisYear} feature(s) with OHM geometry`);
  }

  console.log(`\nDone. ${totalReplacements} total feature-years upgraded across ${yearsTouched} year files.`);
  console.log('Run `npm run build-manifest` next to refresh manifest.json/entity-ranges.json.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
