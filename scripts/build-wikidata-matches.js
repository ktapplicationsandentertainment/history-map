// Phase 2 (expansion-plan.md): matches our entity NAMEs against Wikidata so
// the popup can show real inception/dissolution dates and succession links
// instead of only the naive derived range. Scoped to the latest year's ~181
// modern countries for now (the most-visible/most-clicked entities) — not
// all 3014 names in the dataset. Expanding to more (historical) entities is
// a deliberate future increment, not something this pass tries to solve.
//
// Entity resolution is the hard part here (see expansion-plan.md's
// cross-cutting concern): a bare label match pulls in unrelated Wikidata
// items (ships, sports teams, films all named "France"). Filtered to items
// that are an instance of (transitively, via subclass-of) country /
// sovereign state / historical country, and when a name still matches more
// than one such item, the one with the most Wikipedia sitelinks wins — a
// standard "most notable sense" heuristic, not a guarantee of correctness.
const { MANUAL_ALIAS_OVERRIDES } = require('./lib/name-overrides');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_PATH = path.join(__dirname, '..', 'public', 'data', 'wikidata-matches.json');
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'wikidata');
const YEARS_DIR = path.join(__dirname, '..', 'public', 'data', 'years');

const COUNTRY_CLASSES = ['Q6256', 'Q3624078', 'Q13020']; // country, sovereign state, historical country

function sparqlEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sparqlQuery(query) {
  const body = 'query=' + encodeURIComponent(query);
  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://query.wikidata.org/sparql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
          'User-Agent': 'HistoryMapProject/1.0 (personal project, phase 2 entity matching)',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Wikidata query failed: HTTP ${res.statusCode}\n${data.slice(0, 500)}`));
            return;
          }
          resolve(JSON.parse(data).results.bindings);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// "Congo, Democratic Republic of (Zaire)" -> primary "Congo, Democratic Republic of", alt "Zaire"
function splitAliasName(name) {
  const match = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!match) return [name];
  return [match[1].trim(), match[2].trim()];
}

async function getTargetNames() {
  const files = fs.readdirSync(YEARS_DIR).filter((f) => /^y-?\d+\.json$/.test(f));
  const years = files.map((f) => Number(f.match(/^y(-?\d+)\.json$/)[1]));
  const latestYear = Math.max(...years);
  const topo = JSON.parse(fs.readFileSync(path.join(YEARS_DIR, `y${latestYear}.json`), 'utf8'));
  const objKey = Object.keys(topo.objects)[0];
  const names = new Set();
  for (const g of topo.objects[objKey].geometries) {
    if (g.properties && g.properties.NAME) names.add(g.properties.NAME);
  }
  console.log(`Matching against ${names.size} entities from year ${latestYear}`);
  return Array.from(names);
}

async function findCandidates(nameVariants) {
  const values = nameVariants.map((n) => `"${sparqlEscape(n)}"@en`).join(' ');
  const classValues = COUNTRY_CLASSES.map((c) => `wd:${c}`).join(' ');
  const query = `
    SELECT ?item ?matchedLabel ?itemLabel ?sitelinks WHERE {
      VALUES ?matchedLabel { ${values} }
      { ?item rdfs:label ?matchedLabel . } UNION { ?item skos:altLabel ?matchedLabel . }
      ?item wdt:P31/wdt:P279* ?class .
      VALUES ?class { ${classValues} }
      ?item wikibase:sitelinks ?sitelinks .
      ?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel) = "en")
    }
  `;
  return sparqlQuery(query);
}

async function fetchDetails(qids) {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const query = `
    SELECT ?item
      (MIN(?inception) AS ?minInception) (MAX(?dissolved) AS ?maxDissolved)
      (GROUP_CONCAT(DISTINCT ?replacesLabel; separator="|") AS ?replaces)
      (GROUP_CONCAT(DISTINCT ?replacedByLabel; separator="|") AS ?replacedBy)
    WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item wdt:P571 ?inception . }
      OPTIONAL { ?item wdt:P576 ?dissolved . }
      OPTIONAL { ?item wdt:P1365 ?replacesItem . ?replacesItem rdfs:label ?replacesLabel . FILTER(LANG(?replacesLabel)="en") }
      OPTIONAL { ?item wdt:P1366 ?replacedByItem . ?replacedByItem rdfs:label ?replacedByLabel . FILTER(LANG(?replacedByLabel)="en") }
    } GROUP BY ?item
  `;
  return sparqlQuery(query);
}

function qidFromUri(uri) {
  return uri.split('/').pop();
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const targetNames = await getTargetNames();

  // Build the full set of label variants to search for, tracking which
  // original NAME(s) each variant belongs to.
  const variantToNames = new Map();
  for (const name of targetNames) {
    const variants = [...splitAliasName(name), ...(MANUAL_ALIAS_OVERRIDES[name] || [])];
    for (const variant of variants) {
      if (!variantToNames.has(variant)) variantToNames.set(variant, []);
      variantToNames.get(variant).push(name);
    }
  }
  const variants = Array.from(variantToNames.keys());
  console.log(`Searching ${variants.length} label/alias variants...`);

  const candidatesCachePath = path.join(CACHE_DIR, 'candidates.json');
  let candidates;
  if (fs.existsSync(candidatesCachePath)) {
    console.log('Using cached candidates (delete .cache/wikidata/candidates.json to refetch)');
    candidates = JSON.parse(fs.readFileSync(candidatesCachePath, 'utf8'));
  } else {
    candidates = await findCandidates(variants);
    fs.writeFileSync(candidatesCachePath, JSON.stringify(candidates, null, 2));
  }
  console.log(`Got ${candidates.length} candidate rows from Wikidata`);

  // For each of our target NAMEs, pick the best-matching QID: highest
  // sitelink count wins when more than one Wikidata item matches.
  const nameToCandidates = new Map();
  for (const row of candidates) {
    const matchedLabel = row.matchedLabel.value;
    const names = variantToNames.get(matchedLabel) || [];
    for (const name of names) {
      if (!nameToCandidates.has(name)) nameToCandidates.set(name, []);
      nameToCandidates.get(name).push({
        qid: qidFromUri(row.item.value),
        wikidataLabel: row.itemLabel.value,
        sitelinks: Number(row.sitelinks.value),
      });
    }
  }

  const nameToQid = new Map();
  for (const [name, cands] of nameToCandidates) {
    const best = cands.reduce((a, b) => (b.sitelinks > a.sitelinks ? b : a));
    nameToQid.set(name, best);
  }
  console.log(`Matched ${nameToQid.size} of ${targetNames.length} target names`);
  const unmatched = targetNames.filter((n) => !nameToQid.has(n));
  if (unmatched.length) console.log('Unmatched:', unmatched.join(', '));

  const allQids = Array.from(new Set(Array.from(nameToQid.values()).map((v) => v.qid)));
  const detailsCachePath = path.join(CACHE_DIR, 'details.json');
  let details;
  if (fs.existsSync(detailsCachePath)) {
    console.log('Using cached details (delete .cache/wikidata/details.json to refetch)');
    details = JSON.parse(fs.readFileSync(detailsCachePath, 'utf8'));
  } else {
    details = await fetchDetails(allQids);
    fs.writeFileSync(detailsCachePath, JSON.stringify(details, null, 2));
  }

  const detailsByQid = new Map();
  for (const row of details) {
    detailsByQid.set(qidFromUri(row.item.value), {
      inception: row.minInception ? row.minInception.value.slice(0, 10) : null,
      dissolved: row.maxDissolved ? row.maxDissolved.value.slice(0, 10) : null,
      replaces: row.replaces && row.replaces.value ? row.replaces.value.split('|') : [],
      replacedBy: row.replacedBy && row.replacedBy.value ? row.replacedBy.value.split('|') : [],
    });
  }

  const output = {};
  for (const [name, match] of nameToQid) {
    const detail = detailsByQid.get(match.qid) || {};
    output[name] = {
      qid: match.qid,
      wikidataLabel: match.wikidataLabel,
      inception: detail.inception || null,
      dissolved: detail.dissolved || null,
      replaces: detail.replaces || [],
      replacedBy: detail.replacedBy || [],
    };
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${Object.keys(output).length} matches to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
