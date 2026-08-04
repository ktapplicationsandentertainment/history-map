// "On this day" (2026-07-29 brainstorm). All filtering happens here, client
// side, against a static, unchanging facts file — there's no scheduled
// rebuild or backend. "Changes daily" is just "today's date, computed live
// in the visitor's browser" — see build-onthisday.js for where the facts
// file itself comes from.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateHeading(month, day) {
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

function getDateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const month = parseInt(params.get('month'), 10);
  const day = parseInt(params.get('day'), 10);
  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate() };
}

function setDateInUrl(month, day) {
  const url = new URL(window.location.href);
  url.searchParams.set('month', String(month));
  url.searchParams.set('day', String(day));
  window.history.replaceState(null, '', url);
}

// Steps a {month, day} pair by delta days without needing to know which
// year it is (this page is deliberately year-agnostic) — walk through a
// fixed non-leap-year calendar so Feb 29 never comes up as a step target.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function stepDate({ month, day }, delta) {
  let m = month;
  let d = day + delta;
  while (d < 1) {
    m = m === 1 ? 12 : m - 1;
    d += DAYS_IN_MONTH[m - 1];
  }
  while (d > DAYS_IN_MONTH[m - 1]) {
    d -= DAYS_IN_MONTH[m - 1];
    m = m === 12 ? 1 : m + 1;
  }
  return { month: m, day: d };
}

function formatYear(year) {
  return year < 0 ? `${Math.abs(year).toLocaleString()} BCE` : `${year} CE`;
}

async function init() {
  const res = await fetch('/data/on-this-day-facts.json');
  const facts = await res.json();

  const listEl = document.getElementById('facts-list');
  const headingEl = document.getElementById('date-heading');
  let current = getDateFromUrl();

  function render() {
    setDateInUrl(current.month, current.day);
    headingEl.textContent = formatDateHeading(current.month, current.day);
    document.title = `${formatDateHeading(current.month, current.day)} — On This Day in History`;

    const todaysFacts = facts
      .filter((f) => f.month === current.month && f.day === current.day)
      .sort((a, b) => a.year - b.year);

    if (todaysFacts.length === 0) {
      listEl.innerHTML = `<p class="no-facts">No recorded boundary changes on this exact date in the data yet &mdash; try a nearby day, or <a href="/map.html">explore the map directly</a>.</p>`;
      return;
    }

    listEl.innerHTML = todaysFacts
      .map(
        (f) => `
        <div class="fact-item">
          <div class="fact-year">${formatYear(f.year)}</div>
          <div class="fact-text">${f.text}</div>
          <a class="fact-link" href="/map.html?year=${f.mapYear}">See ${formatYear(f.mapYear)} on the map &rarr;</a>
          <span class="fact-source">via ${f.source}</span>
        </div>`
      )
      .join('');
  }

  document.getElementById('prev-day').addEventListener('click', () => {
    current = stepDate(current, -1);
    render();
  });
  document.getElementById('next-day').addEventListener('click', () => {
    current = stepDate(current, 1);
    render();
  });

  render();
}

init().catch((err) => {
  console.error(err);
  document.getElementById('facts-list').innerHTML = '<p class="no-facts">Failed to load — see console.</p>';
});
