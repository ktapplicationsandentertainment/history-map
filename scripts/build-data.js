// Reads the raw historical-basemaps snapshots from .cache/, simplifies each
// year's geometry and converts it to TopoJSON (shared-arc encoding shrinks
// adjacent-country borders a lot compared to raw GeoJSON), and writes one
// file per year to public/data/years/. manifest.json and entity-ranges.json
// are built separately (build-manifest.js) by scanning whatever's actually
// on disk, since years now come from more than one source (see build-cshapes.js).
const fs = require('fs');
const path = require('path');
const { simplifyToTopojson, yearToFilename } = require('./lib/topojson-utils');

const SOURCE_DIR = path.join(__dirname, '..', '.cache', 'historical-basemaps');
const OUT_YEARS_DIR = path.join(__dirname, '..', 'public', 'data', 'years');

// These years are superseded by CShapes 2.0's near-annual coverage of
// 1886-2019 (decided 2026-07-21, see expansion-plan.md Phase 1) — skip them
// here so build-cshapes.js's output is the one that ends up on disk.
const SUPERSEDED_BY_CSHAPES = new Set([1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010]);

async function main() {
  const indexPath = path.join(SOURCE_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('Source data not found. Run `npm run pull-source` first.');
    process.exit(1);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const years = index.years.slice().sort((a, b) => a.year - b.year);

  fs.mkdirSync(OUT_YEARS_DIR, { recursive: true });

  let written = 0;
  for (const y of years) {
    if (SUPERSEDED_BY_CSHAPES.has(y.year)) {
      console.log(`${y.year}\tskipped (superseded by CShapes)`);
      continue;
    }

    const rawPath = path.join(SOURCE_DIR, 'geojson', y.filename);
    const raw = fs.readFileSync(rawPath, 'utf8');
    const originalBytes = Buffer.byteLength(raw, 'utf8');

    const originalFeatureCount = JSON.parse(raw).features.length;
    const topojson = await simplifyToTopojson(raw);
    const outFilename = yearToFilename(y.year);
    fs.writeFileSync(path.join(OUT_YEARS_DIR, outFilename), topojson);
    const outputBytes = Buffer.byteLength(topojson, 'utf8');

    const topo = JSON.parse(topojson);
    const objKey = Object.keys(topo.objects)[0];
    const outputFeatureCount = topo.objects[objKey].geometries.length;
    if (outputFeatureCount !== originalFeatureCount) {
      throw new Error(
        `Feature count mismatch for ${y.filename}: source had ${originalFeatureCount}, output has ${outputFeatureCount}`
      );
    }

    written++;
    console.log(
      `${y.year}\t${y.filename} -> ${outFilename}\t${originalBytes} -> ${outputBytes} bytes (${Math.round((outputBytes / originalBytes) * 100)}%)`
    );
  }

  console.log(`\nWrote ${written} aourednik year files (${SUPERSEDED_BY_CSHAPES.size} skipped, superseded).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
