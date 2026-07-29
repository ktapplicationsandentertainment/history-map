# Third-Party Data Attributions

This project bundles boundary/reference data from several sources under different licenses. This file is the compliance record; see [`methodology.html`](methodology.html) for the reader-facing version.

## historical-basemaps

- Source: https://github.com/aourednik/historical-basemaps
- Author: Ouredník et al. and contributors
- License: **GNU General Public License v3.0 (GPLv3)**
- Used for: boundary geometry, ~123,000 BCE – 1880 CE
- This project's own pipeline scripts (which process this data) are included in this repository in the same spirit of openness the GPL requires.

## CShapes 2.0

- Source: https://icr.ethz.ch/data/cshapes/
- Authors: Schvitz, Rüegger, Girardin, Cederman, Weidmann, Gleditsch (ETH Zürich)
- Citation: Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, Nils Weidmann, and Kristian Skrede Gleditsch. 2022. "Mapping The International System, 1886-2017: The CShapes 2.0 Dataset." *Journal of Conflict Resolution* 66(1): 144–61.
- License: **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**
- Used for: boundary geometry + capital cities, 1886–2019
- **Non-commercial clause**: this project is not monetized (see the sustainability discussion in project notes) — if that ever changes, CShapes-derived data would need to be re-evaluated or removed first.
- **Share-alike clause**: derived data (the simplified/patched TopoJSON in `public/data/`) is distributed under the same CC BY-NC-SA 4.0 terms as a result.

## Wikidata

- Source: https://www.wikidata.org/
- License: **CC0 1.0 Universal (Public Domain Dedication)**
- Used for: existed-date ranges and predecessor/successor links for modern countries

## OpenHistoricalMap

- Source: https://www.openhistoricalmap.org/
- License: **CC0 1.0 Universal (Public Domain Dedication)**
- Used for: precise boundary geometry and dates for specific entities/years where community-mapped (233 entities as of 2026-07-29)

## Basemap tiles

- Provider: CARTO (Positron, no-labels variant), using OpenStreetMap contributor data
- Attribution shown on-map per CARTO's and OpenStreetMap's requirements: "© OpenStreetMap contributors © CARTO"
