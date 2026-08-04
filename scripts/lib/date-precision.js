// Parses an OHM/Wikidata-style date string ("1975-06-27", "1975-06", "1975",
// with an optional trailing "~"/"?" uncertainty marker) into its actual
// precision, rather than defaulting missing month/day to January 1st like
// build-ohm.js's parser does for its own (different) purpose of picking
// which snapshot year a boundary was active in. "On this day" content needs
// to know when it *doesn't* actually have a real calendar day, so it can
// skip those rather than fabricate a plausible-looking Jan 1st date.
function parseDatePrecision(str) {
  if (!str) return null;
  const approx = /[~?]$/.test(str);
  const cleaned = str.replace(/[~?]/g, '').trim();
  const match = cleaned.match(/^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (match[3]) return { year, month: parseInt(match[2], 10), day: parseInt(match[3], 10), precision: 'day', approx };
  if (match[2]) return { year, month: parseInt(match[2], 10), precision: 'month', approx };
  return { year, precision: 'year', approx };
}

module.exports = { parseDatePrecision };
