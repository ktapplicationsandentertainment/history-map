import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { feature } from 'topojson-client';

// Map shell (build-order step 3) + year control (step 4).
const map = L.map('map', {
  worldCopyJump: true,
}).setView([20, 10], 3);

// CARTO Positron, no-labels variant: a neutral modern physical/reference
// basemap with no political borders or place labels of its own, so it
// doesn't visually compete with the historical boundaries drawn on top.
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

// Deterministic color per SUBJECTO so the same power/region reads as the
// same color across polygons, without maintaining a hand-picked palette.
// Some source polygons carry no NAME/SUBJECTO at all (see data-audit.md
// addendum) — render those as a flat neutral gray.
function colorFor(name) {
  if (!name) return 'hsl(0, 0%, 65%)';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  // Higher saturation/lower lightness than a typical web palette — this
  // needs to still read clearly on a classroom projector from the back row.
  return `hsl(${hue}, 65%, 48%)`;
}

function formatYear(year) {
  return year < 0 ? `${Math.abs(year).toLocaleString()} BCE` : `${year} CE`;
}

// entity-ranges.json: derived, not authoritative — see data-audit.md
// "Gap vs. V1 spec" and README.md's "Decisions made" section. Naive
// first/last-appearance-by-name, so it's built once and looked up per popup.
let entityRanges = {};

function formatExistedRange(name) {
  const range = entityRanges[name];
  if (!range) return null;
  const { firstYear, lastYear, discontinuous } = range;
  const span =
    firstYear === lastYear
      ? `attested only in ${formatYear(firstYear)} in this dataset`
      : `${formatYear(firstYear)} &ndash; ${formatYear(lastYear)}`;
  const caveat = discontinuous
    ? ' <span class="popup-caveat">(name reappears with a gap in between &mdash; may span distinct periods, not continuous existence)</span>'
    : '';
  return `Existed (approx.): ${span}${caveat}`;
}

// wikidata-matches.json (Phase 2, expansion-plan.md): a hand-reviewed match
// against Wikidata for ~modern countries only (see build-wikidata-matches.js
// — entity resolution across the full ~3000-name dataset is future work).
// When a match exists, its inception/dissolution dates are real historical
// record, not derived from which of *our* snapshots the name happens to
// appear in — so they replace the naive range rather than sit alongside it.
let wikidataMatches = {};

function formatWikidataYear(isoDate) {
  return formatYear(parseInt(isoDate, 10));
}

function formatWikidataExistedLine(name) {
  const match = wikidataMatches[name];
  if (!match || !match.inception) return null;
  const span = match.dissolved
    ? `${formatWikidataYear(match.inception)} &ndash; ${formatWikidataYear(match.dissolved)}`
    : `${formatWikidataYear(match.inception)} &ndash; present`;
  return `Existed (per Wikidata): ${span}`;
}

// OHM (Phase 3, expansion-plan.md): patched directly onto specific features
// for specific years by build-ohm.js (OHM_START/OHM_END/OHM_SOURCE), not a
// name-keyed lookup like Wikidata above — it answers a different question.
// Wikidata's range is "how long has this named entity existed overall";
// OHM_START/OHM_END is "since when has *this exact boundary shape* been in
// effect" — genuinely more precise (day-level) but scoped to the specific
// sub-period shown for the currently-viewed year, so both are shown, not
// one replacing the other.
function formatOhmDate(raw) {
  const approx = /[~?]$/.test(raw);
  const cleaned = raw.replace(/[~?]/g, '');
  const parts = cleaned.split('-');
  const year = parseInt(parts[0], 10);
  let text = formatYear(year);
  if (parts[1]) {
    const date = new Date(Date.UTC(year, parseInt(parts[1], 10) - 1, parts[2] ? parseInt(parts[2], 10) : 1));
    text = date.toLocaleDateString('en-US', {
      day: parts[2] ? 'numeric' : undefined,
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return approx ? `${text} (approx.)` : text;
}

function formatOhmLine(properties) {
  if (!properties.OHM_START) return null;
  const span = properties.OHM_END
    ? `${formatOhmDate(properties.OHM_START)} &ndash; ${formatOhmDate(properties.OHM_END)}`
    : `${formatOhmDate(properties.OHM_START)} &ndash; present`;
  const sourceUrl = `https://www.openhistoricalmap.org/${properties.OHM_SOURCE}`;
  return `<div class="popup-ohm-line">This boundary shape dated (<a href="${sourceUrl}" target="_blank" rel="noopener">OpenHistoricalMap</a>): ${span}</div>`;
}

function formatSuccessionLine(name) {
  const match = wikidataMatches[name];
  if (!match) return null;
  const summarize = (list) => (list.length > 4 ? `${list.slice(0, 4).join(', ')}, +${list.length - 4} more` : list.join(', '));
  const lines = [];
  if (match.replaces && match.replaces.length) lines.push(`<div>Preceded by: ${summarize(match.replaces)}</div>`);
  if (match.replacedBy && match.replacedBy.length) lines.push(`<div>Succeeded by: ${summarize(match.replacedBy)}</div>`);
  return lines.join('') || null;
}

let currentLayer = null;
// Guards against a slower-arriving response from an earlier year clobbering
// a faster one that was requested more recently (rapid slider dragging).
let currentRequestId = 0;

// Permanent on-map labels are skipped while showLabels is false (used while
// the slider is actively being dragged, see the debounce in init()) — with
// up to ~1900 features in a single year (1492), binding a label to every one
// on every drag tick would make dragging noticeably laggy for no benefit,
// since the user can't read them while the map is still changing anyway.
// Once labels are on, only named features above a minimum on-screen size get
// one, so a world view doesn't get cluttered with text for tiny polities —
// a simple size cutoff, not real label-collision avoidance.
const LABEL_MIN_PIXEL_AREA = 700;

// Global on/off switch for labels, independent of the drag-settle logic
// above — a caller only gets labels when both this is true AND the slider
// has settled.
let labelsEnabled = true;

// Shown only if a year's fetch+render is still in flight after this delay —
// avoids a flash of "Loading…" on every fast local fetch while still giving
// visible feedback on a slow classroom connection (see data-audit.md's note
// on the larger year files, e.g. 1492).
const LOADING_INDICATOR_DELAY_MS = 200;

function setYearLoading(isLoading) {
  const el = document.getElementById('year-loading-indicator');
  if (el) el.hidden = !isLoading;
}

async function loadYear(year, { showLabels = true } = {}) {
  const requestId = ++currentRequestId;
  const loadingTimer = setTimeout(() => setYearLoading(true), LOADING_INDICATOR_DELAY_MS);
  try {
    const res = await fetch(`/data/years/y${year}.json`);
    if (!res.ok) throw new Error(`Failed to load year ${year}: ${res.status}`);
    const topology = await res.json();
    if (requestId !== currentRequestId) return; // a newer request has since started

    const objectName = Object.keys(topology.objects)[0];
    const geojson = feature(topology, topology.objects[objectName]);

    if (currentLayer) {
      map.removeLayer(currentLayer);
    }

    currentLayer = L.geoJSON(geojson, {
      style: (f) => ({
        // OHM-sourced boundaries get a distinct gold outline — visible even
        // before clicking, so the precision difference is transparent rather
        // than a hidden implementation detail (see expansion-plan.md Phase 3).
        color: f.properties.OHM_START ? '#b8860b' : '#222',
        weight: f.properties.OHM_START ? 2.5 : 1.5,
        fillColor: colorFor(f.properties.SUBJECTO || f.properties.NAME),
        fillOpacity: 0.65,
      }),
      onEachFeature: (f, layer) => {
        const { NAME, SUBJECTO, CAPITAL } = f.properties;
        const title = NAME || 'Unnamed region';
        const subjectoLine = SUBJECTO && SUBJECTO !== NAME ? `<div>Part of / subject to: ${SUBJECTO}</div>` : '';
        const capitalLine = CAPITAL ? `<div>Capital: ${CAPITAL}</div>` : '';
        // Prefer the Wikidata-sourced range (real historical record) over the
        // naive derived one when a match exists, rather than showing both.
        const existedLine = NAME ? formatWikidataExistedLine(NAME) || formatExistedRange(NAME) : null;
        const successionLine = NAME ? formatSuccessionLine(NAME) : null;
        const ohmLine = formatOhmLine(f.properties);
        // A plain search link, not a direct article guess — Wikipedia's
        // search redirects to the article on a good match and otherwise
        // shows results, so this needs no entity-matching/verification of
        // its own (see expansion-plan.md Phase 1 vs. the real crosswalk
        // planned for Phase 2).
        const wikipediaLine = NAME
          ? `<div class="popup-wiki-link"><a href="https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(NAME)}" target="_blank" rel="noopener">Look up on Wikipedia &#8599;</a></div>`
          : '';
        layer.bindPopup(
          `<div class="region-popup"><h3>${title}</h3>${subjectoLine}${capitalLine}${existedLine ? `<div class="popup-existed-line">${existedLine}</div>` : ''}${successionLine || ''}${ohmLine || ''}${wikipediaLine}</div>`
        );
        const baseWeight = f.properties.OHM_START ? 2.5 : 1.5;
        layer.on({
          mouseover: (e) => e.target.setStyle({ weight: baseWeight + 1.5, fillOpacity: 0.85 }),
          mouseout: (e) => e.target.setStyle({ weight: baseWeight, fillOpacity: 0.65 }),
        });

        if (showLabels && NAME) {
          const bounds = layer.getBounds();
          // A feature can have geometry that survives topojson-client's
          // feature() as a non-null MultiPolygon with zero actual parts
          // (simplification collapsed every ring to nothing) — getBounds()
          // on that returns an invalid LatLngBounds, and calling
          // getNorthWest() on it throws, which would otherwise abort
          // rendering of the *entire* layer since this runs inside
          // onEachFeature. Skip labeling it; there's nothing to label anyway.
          if (!bounds.isValid()) return;
          const nw = map.latLngToLayerPoint(bounds.getNorthWest());
          const se = map.latLngToLayerPoint(bounds.getSouthEast());
          const pixelArea = Math.abs((se.x - nw.x) * (se.y - nw.y));
          if (pixelArea >= LABEL_MIN_PIXEL_AREA) {
            layer.bindTooltip(NAME, { permanent: true, direction: 'center', className: 'region-label' });
          }
        }
      },
    }).addTo(map);
  } finally {
    clearTimeout(loadingTimer);
    if (requestId === currentRequestId) setYearLoading(false);
  }
}

// URL state: current year lives in ?year= so a specific view is linkable
// without any server-side session. replaceState (not pushState) on every
// change — a slider drag would otherwise spam the browser history with one
// entry per tick.
function setYearInUrl(year) {
  const url = new URL(window.location.href);
  url.searchParams.set('year', String(year));
  window.history.replaceState(null, '', url);
}

function getYearFromUrl(availableYears) {
  const param = new URLSearchParams(window.location.search).get('year');
  if (param === null) return null;
  const year = Number(param);
  return availableYears.includes(year) ? year : null;
}

function showLoadError(year) {
  hideInitLoading();
  document.getElementById('map').insertAdjacentHTML(
    'beforeend',
    `<div style="position:absolute;top:1rem;left:1rem;background:#fff;padding:0.5rem 1rem;border-radius:4px;z-index:1000;">Failed to load year ${year} data — see console.</div>`
  );
}

function hideInitLoading() {
  const el = document.getElementById('init-loading');
  if (el) el.remove();
}

// Year control: a slider over the *index* into the sorted available-years
// array, not over the year value itself — years are unevenly spaced (dense
// in modern centuries, sparse in antiquity), so the slider must only ever
// land on a year the data actually supports rather than a free-scrubbed date.
const YearControl = L.Control.extend({
  options: { position: 'bottomleft' },

  onAdd() {
    const container = L.DomUtil.create('div', 'year-control');
    container.innerHTML = `
      <div class="year-control-label-row">
        <span class="year-control-label" id="year-label"></span>
        <span class="year-loading-indicator" id="year-loading-indicator" hidden>Loading&hellip;</span>
      </div>
      <div class="year-control-slider-row">
        <button type="button" id="year-prev" class="year-step-btn" aria-label="Previous available year">&#9664;</button>
        <input type="range" id="year-slider" class="year-slider" />
        <button type="button" id="year-next" class="year-step-btn" aria-label="Next available year">&#9654;</button>
      </div>
      <label class="labels-toggle-row">
        <input type="checkbox" id="labels-toggle" checked />
        Show labels
      </label>
    `;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  },
});

// About panel: a short, teacher-facing note on data provenance and known
// caveats (see data-audit.md) — build-order step 7's "credibility" ask.
const AboutControl = L.Control.extend({
  options: { position: 'topright' },

  onAdd() {
    const container = L.DomUtil.create('div', 'about-control');
    container.innerHTML = `
      <button type="button" id="about-toggle" class="about-toggle">About this map</button>
      <div id="about-panel" class="about-panel" hidden>
        <button type="button" id="about-close" class="about-close" aria-label="Close">&times;</button>
        <h3>About this data</h3>
        <p>Boundaries before 1886 come from the open-source <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a> project (GPLv3), a community-maintained, work-in-progress dataset spanning roughly 2000 BCE to today. From 1886&ndash;2019, boundaries come from <a href="https://icr.ethz.ch/data/cshapes/" target="_blank" rel="noopener">CShapes 2.0</a> (Schvitz et al., CC BY-NC-SA 4.0), an academic dataset with a snapshot for every calendar year in that range. Verify against other sources before relying on either for serious research.</p>
        <ul>
          <li>The basemap shows <strong>today's</strong> coastlines and rivers, not physical geography as it was at the selected date.</li>
          <li>Before the Peace of Westphalia (1648), the idea of a fixed national "boundary" doesn't really apply the way it does today &mdash; treat early borders as approximate.</li>
          <li>Overlapping regions in ancient/pre-modern periods are intentional (overlapping spheres of influence), not a rendering error.</li>
          <li>Popup date ranges are <strong>derived automatically</strong> from which snapshots a name appears in, not hand-verified &mdash; a flagged caveat means the name disappears and reappears, so the range may span unrelated periods. For most present-day countries, this is instead replaced with a real date and predecessor/successor history from <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a> (CC0) &mdash; matched automatically, so occasional mismatches are possible.</li>
          <li>A gold outline means that specific boundary's exact shape and dates come from <a href="https://www.openhistoricalmap.org/" target="_blank" rel="noopener">OpenHistoricalMap</a> (CC0), a community-mapped project &mdash; day-precise where it's mapped, but coverage is very uneven: some entities have decades of detailed boundary history, most have none, which is why only some regions show the gold outline.</li>
          <li>Before 1886, a few entities are known to be missing due to broken source geometry &mdash; see the project's data audit notes for specifics.</li>
        </ul>
        <p><a href="/methodology.html">Full methodology &amp; known limitations &#8599;</a> &middot; <a href="/">About / home page</a></p>
      </div>
    `;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  },
});

// Video control: records a play-through from a start to an end year using
// the browser's own tab-capture (getDisplayMedia + MediaRecorder), not a
// hand-rolled canvas renderer. The map draws through three different
// mechanisms — basemap tiles (<img>), boundaries (SVG), labels (DOM
// tooltips) — so faithfully recreating all three on a canvas would mean
// re-implementing a chunk of Leaflet's own rendering. Capturing the real
// rendered tab is simpler and guaranteed to match what's actually on
// screen, at the cost of one native "share this tab" permission prompt per
// recording (unavoidable for any screen/tab capture API).
const VideoControl = L.Control.extend({
  options: { position: 'topright' },

  onAdd() {
    const container = L.DomUtil.create('div', 'video-control');
    container.innerHTML = `
      <button type="button" id="video-toggle" class="about-toggle">Make a video</button>
      <div id="video-panel" class="about-panel" hidden>
        <button type="button" id="video-close" class="about-close" aria-label="Close">&times;</button>
        <h3>Make a video</h3>
        <label class="video-field">Start year<select id="video-start-year"></select></label>
        <label class="video-field">End year<select id="video-end-year"></select></label>
        <label class="labels-toggle-row"><input type="checkbox" id="video-labels-toggle" checked /> Include labels</label>
        <button type="button" id="video-record-btn" class="video-record-btn">Record</button>
        <div id="video-status" class="video-status"></div>
        <div id="video-result" class="video-result" hidden>
          <a id="video-open-link" class="video-result-link" target="_blank" rel="noopener">Open in new tab &#8599;</a>
          <a id="video-download-link" class="video-result-link" download="history-map.webm">Download video</a>
        </div>
      </div>
    `;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  },
});

async function init() {
  const [manifestRes, entityRangesRes, wikidataRes] = await Promise.all([
    fetch('/data/manifest.json'),
    fetch('/data/entity-ranges.json'),
    // Optional enrichment, not core map data (see build-wikidata-matches.js)
    // — missing/failed shouldn't block the app from loading.
    fetch('/data/wikidata-matches.json').catch(() => null),
  ]);
  if (!manifestRes.ok) throw new Error(`Failed to load manifest: ${manifestRes.status}`);
  if (!entityRangesRes.ok) throw new Error(`Failed to load entity ranges: ${entityRangesRes.status}`);
  const manifest = await manifestRes.json();
  entityRanges = await entityRangesRes.json();
  if (wikidataRes && wikidataRes.ok) {
    wikidataMatches = await wikidataRes.json();
  }
  const years = manifest.map((m) => m.year).sort((a, b) => a - b);

  new YearControl().addTo(map);
  new AboutControl().addTo(map);
  new VideoControl().addTo(map);

  const aboutToggle = document.getElementById('about-toggle');
  const aboutPanel = document.getElementById('about-panel');
  aboutToggle.addEventListener('click', () => {
    aboutPanel.hidden = !aboutPanel.hidden;
  });
  document.getElementById('about-close').addEventListener('click', () => {
    aboutPanel.hidden = true;
  });

  const slider = document.getElementById('year-slider');
  const label = document.getElementById('year-label');
  const prevBtn = document.getElementById('year-prev');
  const nextBtn = document.getElementById('year-next');
  slider.min = 0;
  slider.max = years.length - 1;
  slider.step = 1;

  const urlYear = getYearFromUrl(years);
  const defaultIndex = urlYear !== null ? years.indexOf(urlYear) : years.length - 1; // fall back to the most recent snapshot
  slider.value = defaultIndex;
  label.textContent = formatYear(years[defaultIndex]);

  function updateStepButtons() {
    prevBtn.disabled = Number(slider.value) <= Number(slider.min);
    nextBtn.disabled = Number(slider.value) >= Number(slider.max);
  }
  updateStepButtons();

  let labelSettleTimer = null;
  let activeYear = years[defaultIndex];
  slider.addEventListener('input', () => {
    activeYear = years[Number(slider.value)];
    label.textContent = formatYear(activeYear);
    setYearInUrl(activeYear);
    updateStepButtons();

    clearTimeout(labelSettleTimer);
    loadYear(activeYear, { showLabels: false }).catch((err) => {
      console.error(err);
      showLoadError(activeYear);
    });
    // re-render with labels (if enabled) once the user stops moving the slider
    labelSettleTimer = setTimeout(() => {
      loadYear(activeYear, { showLabels: labelsEnabled }).catch((err) => {
        console.error(err);
        showLoadError(activeYear);
      });
    }, 350);
  });

  // Step buttons move exactly one available year at a time and reuse the
  // slider's own 'input' handling rather than duplicating it.
  function stepYear(delta) {
    const newValue = Number(slider.value) + delta;
    if (newValue < Number(slider.min) || newValue > Number(slider.max)) return;
    slider.value = newValue;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
  prevBtn.addEventListener('click', () => stepYear(-1));
  nextBtn.addEventListener('click', () => stepYear(1));

  document.getElementById('labels-toggle').addEventListener('change', (e) => {
    labelsEnabled = e.target.checked;
    // Labels reflect the settled state, so re-render immediately with the
    // new setting rather than waiting for the next year change.
    loadYear(activeYear, { showLabels: labelsEnabled }).catch((err) => {
      console.error(err);
      showLoadError(activeYear);
    });
  });

  // Video control
  const videoToggle = document.getElementById('video-toggle');
  const videoPanel = document.getElementById('video-panel');
  videoToggle.addEventListener('click', () => {
    videoPanel.hidden = !videoPanel.hidden;
  });
  document.getElementById('video-close').addEventListener('click', () => {
    videoPanel.hidden = true;
  });

  const videoStartSelect = document.getElementById('video-start-year');
  const videoEndSelect = document.getElementById('video-end-year');
  for (const y of years) {
    const option = `<option value="${y}">${formatYear(y)}</option>`;
    videoStartSelect.insertAdjacentHTML('beforeend', option);
    videoEndSelect.insertAdjacentHTML('beforeend', option);
  }
  videoStartSelect.value = years[0];
  videoEndSelect.value = years[years.length - 1];

  const VIDEO_FRAME_HOLD_MS = 700; // how long each year stays on screen while recording

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function recordVideo({ startYear, endYear, includeLabels }) {
    const statusEl = document.getElementById('video-status');
    const resultEl = document.getElementById('video-result');
    const recordBtn = document.getElementById('video-record-btn');
    resultEl.hidden = true;
    statusEl.textContent = '';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      statusEl.textContent = "Video recording isn't supported in this browser.";
      return;
    }

    const startIdx = years.indexOf(startYear);
    const endIdx = years.indexOf(endYear);
    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
      statusEl.textContent = 'Pick a start year at or before the end year.';
      return;
    }
    const rangeYears = years.slice(startIdx, endIdx + 1);

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false });
    } catch (err) {
      statusEl.textContent = 'Recording cancelled — screen-share permission was not granted.';
      return;
    }

    const mimeType = ['video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const recordingStopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    // If the user ends sharing via the browser's own "Stop sharing" control,
    // treat that as "finish now" rather than leaving the loop to run past a
    // dead track.
    const track = stream.getVideoTracks()[0];
    const userStoppedSharing = new Promise((resolve) => track.addEventListener('ended', resolve));

    recordBtn.disabled = true;
    videoStartSelect.disabled = true;
    videoEndSelect.disabled = true;

    recorder.start();
    for (let i = 0; i < rangeYears.length; i++) {
      if (track.readyState === 'ended') break;
      const year = rangeYears[i];
      statusEl.textContent = `Recording... ${formatYear(year)} (${i + 1}/${rangeYears.length})`;
      await loadYear(year, { showLabels: includeLabels }).catch(() => {});
      await Promise.race([wait(VIDEO_FRAME_HOLD_MS), userStoppedSharing]);
    }

    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    await recordingStopped;

    recordBtn.disabled = false;
    videoStartSelect.disabled = false;
    videoEndSelect.disabled = false;

    if (chunks.length === 0) {
      statusEl.textContent = 'Recording produced no data — try again.';
    } else {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.getElementById('video-download-link');
      document.getElementById('video-open-link').href = url;
      downloadLink.href = url;
      downloadLink.download = `history-map-${startYear}-to-${endYear}.webm`;
      statusEl.textContent = 'Done.';
      resultEl.hidden = false;
    }

    // Recording plays through with its own label choice, independent of the
    // live map's — put the live map back to what it was actually showing.
    await loadYear(activeYear, { showLabels: labelsEnabled }).catch(() => {});
  }

  document.getElementById('video-record-btn').addEventListener('click', () => {
    recordVideo({
      startYear: Number(videoStartSelect.value),
      endYear: Number(videoEndSelect.value),
      includeLabels: document.getElementById('video-labels-toggle').checked,
    });
  });

  setYearInUrl(years[defaultIndex]);
  await loadYear(years[defaultIndex], { showLabels: labelsEnabled });
  hideInitLoading();
}

init().catch((err) => {
  console.error(err);
  showLoadError('(initial)');
});
