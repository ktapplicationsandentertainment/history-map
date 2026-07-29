// Converts CShapes 2.0's country-period table (each row has its own
// gwsyear/gweyear, not a fixed benchmark year) into one GeoJSON-then-TopoJSON
// file per calendar year from 1886 to 2019 — the exact range the audit
// flagged as sparse in aourednik (only 9 snapshots across 1900-2010). A row
// is "active" in a given year if gwsyear <= year <= gweyear, the standard
// convention for this kind of country-year panel data.
//
// CShapes has no SUBJECTO/ABBREVN/PARTOF/BORDERPRECISION equivalents (see
// data-audit.md-style schema notes) — only NAME, plus bonus CAPITAL/GWCODE
// fields for free (capital city name, and the Gleditsch & Ward country code,
// kept for future entity-resolution work per expansion-plan.md Phase 2).
const fs = require('fs');
const path = require('path');
const { simplifyToTopojson, yearToFilename } = require('./lib/topojson-utils');

const SOURCE_PATH = path.join(__dirname, '..', '.cache', 'cshapes', 'CShapes-2.0.geojson');
const OUT_YEARS_DIR = path.join(__dirname, '..', 'public', 'data', 'years');

const FIRST_YEAR = 1886;
const LAST_YEAR = 2019;

function toOurSchema(feature) {
  const p = feature.properties;
  return {
    type: 'Feature',
    properties: {
      NAME: p.cntry_name,
      CAPITAL: p.capname || null,
      GWCODE: p.gwcode,
    },
    geometry: feature.geometry,
  };
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error('CShapes source not found. Run `npm run pull-cshapes` first.');
    process.exit(1);
  }
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  fs.mkdirSync(OUT_YEARS_DIR, { recursive: true });

  let written = 0;
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    const activeFeatures = source.features
      .filter((f) => f.properties.gwsyear <= year && year <= f.properties.gweyear)
      .map(toOurSchema);

    // Sanity check: a country shouldn't have two active periods in the same
    // year — if it does, something upstream is off, but we still write the
    // data rather than silently dropping rows.
    const seenCodes = new Set();
    for (const f of activeFeatures) {
      if (seenCodes.has(f.properties.GWCODE)) {
        console.warn(`  warning: gwcode ${f.properties.GWCODE} has overlapping periods in ${year}`);
      }
      seenCodes.add(f.properties.GWCODE);
    }

    const geojson = { type: 'FeatureCollection', features: activeFeatures };
    const rawText = JSON.stringify(geojson);
    const originalBytes = Buffer.byteLength(rawText, 'utf8');

    const topojson = await simplifyToTopojson(rawText);
    const outFilename = yearToFilename(year);
    fs.writeFileSync(path.join(OUT_YEARS_DIR, outFilename), topojson);
    const outputBytes = Buffer.byteLength(topojson, 'utf8');

    const topo = JSON.parse(topojson);
    const objKey = Object.keys(topo.objects)[0];
    const outputFeatureCount = topo.objects[objKey].geometries.length;
    if (outputFeatureCount !== activeFeatures.length) {
      throw new Error(
        `Feature count mismatch for CShapes ${year}: expected ${activeFeatures.length}, output has ${outputFeatureCount}`
      );
    }

    written++;
    console.log(
      `${year}\t${activeFeatures.length} countries -> ${outFilename}\t${originalBytes} -> ${outputBytes} bytes`
    );
  }

  console.log(`\nWrote ${written} CShapes year files (${FIRST_YEAR}-${LAST_YEAR}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
