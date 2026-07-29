// Known high-visibility name mismatches between our dataset's NAME strings
// (mostly CShapes' GW-style historical-lineage names) and the common English
// names external sources (Wikidata, OpenHistoricalMap) actually use. Found
// during Phase 2 Wikidata matching 2026-07-21; reused for Phase 3 OHM
// matching since the same entities hit the same mismatch (e.g. OHM's
// "United States" vs. our "United States of America"). Hand-added rather
// than building fuzzier matching, per expansion-plan.md's "curate
// high-traffic entities by hand."
//
// Maps OUR canonical name -> alternate name(s) an external source might use.
const MANUAL_ALIAS_OVERRIDES = {
  'United States of America': ['United States'],
  China: ["People's Republic of China"],
  'Korea, People’s Republic of': ['North Korea'],
  'Korea, People\'s Republic of': ['North Korea'],
  'Korea, Republic of': ['South Korea'],
  'Vietnam, Democratic Republic of': ['Vietnam'],
  "Cote D'Ivoire": ['Ivory Coast'],
  // Both of these are GW/CShapes historical-lineage names for the *modern*
  // country (confirmed via capital city: Berlin and Rome respectively), not
  // the historical states their names suggest — a naming convention quirk,
  // not a data error.
  'German Federal Republic': ['Germany'],
  'Italy/Sardinia': ['Italy'],
  'Congo, Democratic Republic of (Zaire)': ['Democratic Republic of the Congo'],
};

// Reverse map: alternate name -> our canonical name. Built once, used when
// matching *from* an external source's name back to ours (e.g. OHM's
// "United States" needs to resolve to our "United States of America").
const REVERSE_ALIAS_OVERRIDES = {};
for (const [ourName, alternates] of Object.entries(MANUAL_ALIAS_OVERRIDES)) {
  for (const alt of alternates) REVERSE_ALIAS_OVERRIDES[alt] = ourName;
}

module.exports = { MANUAL_ALIAS_OVERRIDES, REVERSE_ALIAS_OVERRIDES };
