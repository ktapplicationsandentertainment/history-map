// "On this day in history" (idea from 2026-07-29 brainstorm): scans the two
// sources that carry real day-precise dates — OHM's start_date/end_date
// (read from the cached geometry batches, not the shipped year files, since
// only the raw OHM tags carry the descriptive start_event/end_event text)
// and Wikidata's inception/dissolved — into one flat facts file. The front
// end filters it client-side by today's month/day. Deliberately no new
// backend/scheduling infrastructure: "changes daily" comes for free because
// the filtering happens live in the visitor's browser against a static,
// unchanging facts list, not from regenerating anything server-side.
const fs = require('fs');
const path = require('path');
const osmtogeojson = require('osmtogeojson');
const { parseDatePrecision } = require('./lib/date-precision');

const OHM_GEOM_DIR = path.join(__dirname, '..', '.cache', 'ohm', 'geometry-batches');
const WIKIDATA_PATH = path.join(__dirname, '..', 'public', 'data', 'wikidata-matches.json');
const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'data', 'manifest.json');
const OUT_PATH = path.join(__dirname, '..', 'public', 'data', 'on-this-day-facts.json');

let availableYears = null;
function nearestMapYear(year) {
  if (!availableYears) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    availableYears = manifest.map((m) => m.year).sort((a, b) => a - b);
  }
  let closest = availableYears[0];
  for (const y of availableYears) {
    if (Math.abs(y - year) < Math.abs(closest - year)) closest = y;
  }
  return closest;
}

function fromOhm() {
  if (!fs.existsSync(OHM_GEOM_DIR)) {
    console.log('No cached OHM geometry found (.cache/ohm/geometry-batches) — skipping OHM facts. Run `npm run pull-ohm` first if you want them included.');
    return [];
  }
  const facts = [];
  // Batch files are cached per-fetch by index (see pull-ohm.js) — if the
  // matched-ID list changes between runs and old batches aren't cleared,
  // the same relation can end up cached under two different batch files.
  // Guard against that here regardless, rather than trusting the cache to
  // always be clean.
  const seenRelationIds = new Set();
  for (const file of fs.readdirSync(OHM_GEOM_DIR)) {
    const batch = JSON.parse(fs.readFileSync(path.join(OHM_GEOM_DIR, file), 'utf8'));
    const gj = osmtogeojson(batch);
    for (const f of gj.features) {
      if (!f.properties || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) continue;
      if (seenRelationIds.has(f.id)) continue;
      seenRelationIds.add(f.id);
      const name = f.properties['name:en'] || f.properties.name;
      if (!name) continue;

      const start = parseDatePrecision(f.properties.start_date);
      if (start && start.precision === 'day') {
        facts.push({
          month: start.month,
          day: start.day,
          year: start.year,
          name,
          text: f.properties.start_event ? `${name}: ${f.properties.start_event}` : `${name}'s modern boundary took effect`,
          mapYear: nearestMapYear(start.year),
          source: 'OpenHistoricalMap',
        });
      }
      const end = parseDatePrecision(f.properties.end_date);
      if (end && end.precision === 'day') {
        facts.push({
          month: end.month,
          day: end.day,
          year: end.year,
          name,
          text: f.properties.end_event ? `${name}: ${f.properties.end_event}` : `${name}'s borders changed`,
          mapYear: nearestMapYear(end.year),
          source: 'OpenHistoricalMap',
        });
      }
    }
  }
  return facts;
}

function fromWikidata() {
  const wd = JSON.parse(fs.readFileSync(WIKIDATA_PATH, 'utf8'));
  const facts = [];
  for (const [name, match] of Object.entries(wd)) {
    const inception = parseDatePrecision(match.inception);
    if (inception && inception.precision === 'day') {
      const predecessor = match.replaces && match.replaces.length ? `, succeeding ${match.replaces[0]}` : '';
      facts.push({
        month: inception.month,
        day: inception.day,
        year: inception.year,
        name,
        text: `${name} was established${predecessor}`,
        mapYear: nearestMapYear(inception.year),
        source: 'Wikidata',
      });
    }
    const dissolved = parseDatePrecision(match.dissolved);
    if (dissolved && dissolved.precision === 'day') {
      const successor = match.replacedBy && match.replacedBy.length ? `, succeeded by ${match.replacedBy[0]}` : '';
      facts.push({
        month: dissolved.month,
        day: dissolved.day,
        year: dissolved.year,
        name,
        text: `${name} was dissolved${successor}`,
        mapYear: nearestMapYear(dissolved.year),
        source: 'Wikidata',
      });
    }
  }
  return facts;
}

// Different OHM relations sometimes describe the same real event with
// identical wording (e.g. two overlapping "Spain" relations both recording
// the 1704 capture of Gibraltar) — a relation-ID dedup doesn't catch this
// since the IDs genuinely differ. Dedupe on what the reader would actually
// perceive as "the same fact" instead.
function dedupeFacts(facts) {
  const seen = new Set();
  return facts.filter((f) => {
    const key = `${f.month}-${f.day}-${f.year}-${f.name}-${f.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function main() {
  const facts = dedupeFacts([...fromOhm(), ...fromWikidata()]);
  facts.sort((a, b) => a.month - b.month || a.day - b.day || a.year - b.year);
  fs.writeFileSync(OUT_PATH, JSON.stringify(facts));

  const byDay = {};
  for (const f of facts) {
    const key = `${f.month}-${f.day}`;
    byDay[key] = (byDay[key] || 0) + 1;
  }
  const counts = Object.values(byDay);
  const missingDays = 366 - Object.keys(byDay).length;
  console.log(`Wrote ${facts.length} day-precise facts to ${OUT_PATH}`);
  console.log(
    `Spread across ${Object.keys(byDay).length} distinct calendar days (of up to 366); ${missingDays} days have zero facts. Min/max per covered day: ${Math.min(...counts)}/${Math.max(...counts)}.`
  );
}

main();
