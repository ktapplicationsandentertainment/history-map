// Downloads the CShapes 2.0 dataset (country-period table + geometry) into
// .cache/, so build-cshapes.js has a local copy to read without re-fetching
// every run. Unlike pull-source.js this isn't a git repo — CShapes ships as
// a static released file — so "refresh" just means deleting the cached file.
const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_DIR = path.join(__dirname, '..', '.cache', 'cshapes');
const DEST_PATH = path.join(CACHE_DIR, 'CShapes-2.0.geojson');
const SOURCE_URL = 'https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson';

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location, destPath).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (fs.existsSync(DEST_PATH)) {
    console.log('CShapes cache already present at', DEST_PATH, '(delete it to force a re-download)');
    return;
  }
  console.log('Downloading CShapes 2.0 from', SOURCE_URL);
  await download(SOURCE_URL, DEST_PATH);
  console.log('Saved to', DEST_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
