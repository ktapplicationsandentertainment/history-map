// Builds manifest.json and entity-ranges.json by scanning whatever year
// files are actually on disk in public/data/years/, rather than trusting a
// single source's own index — years now come from two pipelines (aourednik
// via build-data.js, CShapes via build-cshapes.js), so this is the one place
// that needs to know about both. Run this last, after both build steps.
const fs = require('fs');
const path = require('path');
const { filenameToYear } = require('./lib/topojson-utils');

const YEARS_DIR = path.join(__dirname, '..', 'public', 'data', 'years');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');

function main() {
  const files = fs.readdirSync(YEARS_DIR).filter((f) => filenameToYear(f) !== null);
  const years = files.map((f) => ({ file: f, year: filenameToYear(f) })).sort((a, b) => a.year - b.year);

  const manifest = [];
  // name -> sorted list of years it appears in
  const nameYears = new Map();

  for (const { file, year } of years) {
    const filePath = path.join(YEARS_DIR, file);
    const topo = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const objKey = Object.keys(topo.objects)[0];
    const geometries = topo.objects[objKey].geometries;

    const namesThisYear = new Set();
    for (const g of geometries) {
      const name = g.properties && g.properties.NAME;
      if (name) namesThisYear.add(name);
    }

    manifest.push({
      year,
      file: `years/${file}`,
      entityCount: geometries.length,
      outputBytes: fs.statSync(filePath).size,
    });

    for (const name of namesThisYear) {
      if (!nameYears.has(name)) nameYears.set(name, []);
      nameYears.get(name).push(year);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const allYearsSorted = years.map((y) => y.year);
  const entityRanges = {};
  for (const [name, yearsPresent] of nameYears) {
    yearsPresent.sort((a, b) => a - b);
    const first = yearsPresent[0];
    const last = yearsPresent[yearsPresent.length - 1];
    // discontinuous = the entity is missing from at least one available year
    // that falls strictly between its first and last appearance
    const spanned = allYearsSorted.filter((yr) => yr >= first && yr <= last);
    const discontinuous = spanned.length !== yearsPresent.length;

    entityRanges[name] = { firstYear: first, lastYear: last, yearsPresent, discontinuous };
  }
  fs.writeFileSync(path.join(OUT_DIR, 'entity-ranges.json'), JSON.stringify(entityRanges, null, 2));

  const discontinuousCount = Object.values(entityRanges).filter((e) => e.discontinuous).length;
  console.log(`Scanned ${manifest.length} year files, ${nameYears.size} distinct entity names.`);
  console.log(`${discontinuousCount} entity names have discontinuous appearances (naive date range is suspect for these).`);
}

main();
