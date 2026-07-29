const mapshaper = require('mapshaper');

const SIMPLIFY_PCT = '10%';

// Deliberately no `-clean`: it dissolves/drops what it considers slivers and
// overlaps, but overlapping/small polities are sometimes intentional in this
// kind of data (see data-audit.md) — `-clean` was found silently deleting
// real entities (up to 485 of 1946 features on one aourednik snapshot alone).
async function simplifyToTopojson(rawGeojsonText) {
  const input = { 'in.json': rawGeojsonText };
  const command = `-i in.json -simplify ${SIMPLIFY_PCT} keep-shapes -o out.json format=topojson`;
  return new Promise((resolve, reject) => {
    mapshaper.applyCommands(command, input, (err, output) => {
      if (err) return reject(err);
      resolve(output['out.json']);
    });
  });
}

function yearToFilename(year) {
  return `y${year}.json`;
}

function filenameToYear(filename) {
  const match = filename.match(/^y(-?\d+)\.json$/);
  return match ? Number(match[1]) : null;
}

module.exports = { simplifyToTopojson, yearToFilename, filenameToYear };
