// "World in your lifetime" (2026-07-29 brainstorm, idea 2). Renders frames
// directly onto a <canvas> instead of reusing Leaflet — the desktop "Make a
// video" tool captures the rendered tab via getDisplayMedia, which mobile
// browsers largely don't support. canvas.captureStream() + MediaRecorder
// works on mobile, at the cost of reimplementing rendering by hand: no
// basemap tiles (ocean is a flat fill), simple equirectangular projection
// instead of Leaflet's Mercator, no on-map labels. Boundaries only — same
// data, same colorFor() scheme as the main map, just drawn differently.
import { feature } from 'topojson-client';

const canvas = document.getElementById('render-canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

function colorFor(name) {
  if (!name) return 'hsl(0, 0%, 65%)';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 48%)`;
}

function formatYear(year) {
  return year < 0 ? `${Math.abs(year).toLocaleString()} BCE` : `${year} CE`;
}

// Plate carrée: linear in lon/lat, not Leaflet's Mercator — much simpler to
// implement without a mapping library, close enough for a shareable video.
function project([lon, lat]) {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

function drawYear(geojson, year) {
  ctx.fillStyle = '#aad3df';
  ctx.fillRect(0, 0, W, H);

  for (const f of geojson.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    ctx.fillStyle = colorFor(f.properties.SUBJECTO || f.properties.NAME);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.75;
    const path = new Path2D();
    for (const poly of polys) {
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          const [x, y] = project([lon, lat]);
          if (i === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        });
        path.closePath();
      }
    }
    ctx.fill(path, 'evenodd');
    ctx.stroke(path);
  }

  ctx.fillStyle = '#000';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText(formatYear(year), 16, 36);
}

async function loadYear(year) {
  const res = await fetch(`/data/years/y${year}.json`);
  const topology = await res.json();
  const objectName = Object.keys(topology.objects)[0];
  return feature(topology, topology.objects[objectName]);
}

async function main() {
  const manifest = await (await fetch('/data/manifest.json')).json();
  const years = manifest.map((m) => m.year).sort((a, b) => a - b);
  const birthYears = years.filter((y) => y >= 1900);

  const select = document.getElementById('birth-year');
  for (const y of birthYears) {
    select.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
  }
  select.value = birthYears[0];

  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const generateBtn = document.getElementById('generate-btn');

  generateBtn.addEventListener('click', async () => {
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      statusEl.textContent = "Video recording isn't supported in this browser.";
      return;
    }

    const birthYear = Number(select.value);
    const range = years.filter((y) => y >= birthYear);
    if (range.length === 0) return;

    generateBtn.disabled = true;
    select.disabled = true;
    resultEl.hidden = true;

    const stream = canvas.captureStream(30);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));

    recorder.start();
    for (let i = 0; i < range.length; i++) {
      statusEl.textContent = `Rendering ${formatYear(range[i])}... (${i + 1}/${range.length})`;
      const gj = await loadYear(range[i]);
      drawYear(gj, range[i]);
      await new Promise((r) => setTimeout(r, 500));
    }
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    await stopped;

    generateBtn.disabled = false;
    select.disabled = false;

    if (chunks.length === 0) {
      statusEl.textContent = 'Recording produced no data — try again.';
      return;
    }
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    document.getElementById('open-link').href = url;
    document.getElementById('download-link').href = url;
    statusEl.textContent = 'Done.';
    resultEl.hidden = false;
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById('status').textContent = 'Failed to load — see console.';
});
