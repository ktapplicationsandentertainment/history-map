// Downloads OpenHistoricalMap boundary relation geometry into .cache/ohm/.
//
// Two-step, not one global query: a blanket "all admin_level=2 relations
// with start_date, out geom" query returned 4.8 GB (OHM's boundaries are
// genuinely highly detailed — some single relations have 80,000+ coordinate
// points). Fetching full geometry for all ~3900 such relations worldwide
// would be ~2.75 GB raw, impractical for a static site. Instead: fetch tags
// only first (cheap, ~9 MB), match relation names against our *existing*
// entity names (see expansion-plan.md Phase 3 "integration" decision — only
// bother fetching geometry for entities we'd actually use), then fetch full
// geometry only for that matched subset (~1200 of 3900 relations).
const fs = require('fs');
const path = require('path');
const https = require('https');
const { REVERSE_ALIAS_OVERRIDES } = require('./lib/name-overrides');

const CACHE_DIR = path.join(__dirname, '..', '.cache', 'ohm');
const TAGS_PATH = path.join(CACHE_DIR, 'relations-tags.json');
const GEOM_DIR = path.join(CACHE_DIR, 'geometry-batches');
const MATCHED_IDS_PATH = path.join(CACHE_DIR, 'matched-relation-ids.json');
const ENTITY_RANGES_PATH = path.join(__dirname, '..', 'public', 'data', 'entity-ranges.json');
const BATCH_SIZE = 15; // small batches — some individual relations have 80k+ coordinate points

const OVERPASS_URL = 'https://overpass-api.openhistoricalmap.org/api/interpreter';

function overpassQuery(query, { asPost = true } = {}) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const req = https.request(
      OVERPASS_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'HistoryMapProject/1.0 (personal project, phase 3 OHM integration)',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Overpass query failed: HTTP ${res.statusCode}\n${data.slice(0, 500)}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function ensureTags() {
  if (fs.existsSync(TAGS_PATH)) {
    console.log('Using cached relation tags (delete .cache/ohm/relations-tags.json to refetch)');
    return;
  }
  console.log('Fetching relation tags from OHM...');
  const query = `[out:json][timeout:150];\nrelation["boundary"="administrative"]["admin_level"="2"]["start_date"];\nout tags;`;
  const result = await overpassQuery(query);
  fs.writeFileSync(TAGS_PATH, result);
}

function computeMatchedIds() {
  const tags = JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));
  const ourNames = new Set(Object.keys(JSON.parse(fs.readFileSync(ENTITY_RANGES_PATH, 'utf8'))));
  const matchedIds = [];
  for (const rel of tags.elements) {
    const candidates = [rel.tags.name, rel.tags['name:en']].filter(Boolean).flatMap((c) => [c, REVERSE_ALIAS_OVERRIDES[c]]);
    if (candidates.some((c) => c && ourNames.has(c))) matchedIds.push(rel.id);
  }
  fs.writeFileSync(MATCHED_IDS_PATH, JSON.stringify(matchedIds, null, 2));
  console.log(`${matchedIds.length} of ${tags.elements.length} OHM relations match an existing entity name`);
  return matchedIds;
}

async function fetchGeometry(ids) {
  fs.mkdirSync(GEOM_DIR, { recursive: true });
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));

  for (let i = 0; i < batches.length; i++) {
    const outPath = path.join(GEOM_DIR, `batch-${i}.json`);
    if (fs.existsSync(outPath)) {
      console.log(`batch ${i + 1}/${batches.length} already cached, skipping`);
      continue;
    }
    const query = `[out:json][timeout:120];\nrelation(id:${batches[i].join(',')});\nout geom;`;
    const result = await overpassQuery(query);
    fs.writeFileSync(outPath, result);
    console.log(`batch ${i + 1}/${batches.length}: ${(Buffer.byteLength(result) / 1024).toFixed(0)} KB`);
  }
}

async function main() {
  await ensureTags();
  const matchedIds = fs.existsSync(MATCHED_IDS_PATH)
    ? JSON.parse(fs.readFileSync(MATCHED_IDS_PATH, 'utf8'))
    : computeMatchedIds();
  await fetchGeometry(matchedIds);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
