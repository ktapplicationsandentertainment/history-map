// Fetches (or updates) the upstream historical-basemaps dataset into .cache/,
// so the build script always has a local copy to read without re-cloning every run.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '.cache');
const REPO_DIR = path.join(CACHE_DIR, 'historical-basemaps');
const REPO_URL = 'https://github.com/aourednik/historical-basemaps.git';

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

if (fs.existsSync(path.join(REPO_DIR, '.git'))) {
  console.log('Source cache exists, pulling latest...');
  execSync('git pull --ff-only', { cwd: REPO_DIR, stdio: 'inherit' });
} else {
  console.log('Cloning source dataset...');
  execSync(`git clone --depth 1 ${REPO_URL} "${REPO_DIR}"`, { stdio: 'inherit' });
}

console.log('Source ready at', REPO_DIR);
