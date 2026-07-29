# Going Live — Deployment Plan

Planning doc, nothing executed yet. The repo has no commits at all yet (`git init` was run, nothing committed) and no remote — this plan assumes starting from zero.

## Current state check (done)

- `npm run build` (Vite production bundle) works cleanly: `dist/` comes out to **169 MB**, correctly includes everything from `public/data/` (Vite copies `public/` into the build output automatically) plus both `index.html` and `methodology.html` (multi-page build configured in `vite.config.js`).
- Fixed a naming collision before this plan made sense to write: `npm run build` used to mean "run the data pipeline," which would have collided with what every static host expects `npm run build` to do (produce the deployable bundle). Data pipeline is now `build-all-data`; `build` is `vite build`.

## A real gotcha to resolve before choosing a host

The app uses **absolute root paths** everywhere — `fetch('/data/years/...')`, `fetch('/data/manifest.json')`, the methodology link (`href="/methodology.html"`), the back-link (`href="/"`). This works perfectly at a domain root. It **breaks** if the site is hosted under a subpath, which is what GitHub Pages does by default for a normal repo (`username.github.io/history-map/` — anything except a special `username.github.io`-named repo). Vite's `base` config option would fix build-processed asset references automatically, but our hand-written `fetch('/data/...')` calls and hand-written hrefs are plain string literals — Vite doesn't rewrite those, so they'd silently 404 under a subpath.

Two ways to avoid this entirely, rather than patching every path to be relative:
1. Host somewhere that serves at the domain root by default (Cloudflare Pages, Netlify, Vercel all do, via their generated subdomain) — recommended, avoids the whole problem.
2. Use GitHub Pages with a **custom domain** (or the special `username.github.io` repo name) — also serves at root.

Either way: **don't deploy to a plain GitHub Pages project URL without addressing this.**

## Recommendation: Cloudflare Pages

- Free tier comfortably covers this site: no practical total-size limit for the use case, 25 MB per-file limit (our largest file is ~1.5 MB), generous bandwidth, fast global CDN.
- Serves at `<project-name>.pages.dev` by default — no subpath issue.
- Git-connected: push to the repo, it deploys automatically. Build command `npm run build`, output directory `dist`.
- Supports a custom domain later at no extra cost, if you ever want one.

GitHub Pages is the fallback if you'd rather not create another account — works fine as long as it's set up as a `username.github.io` repo (root-served) or paired with a custom domain, not a plain project-page URL.

## Data licensing — one file to add before publishing

The bundled data mixes several licenses (GPLv3 historical-basemaps, CC BY-NC-SA 4.0 CShapes, CC0 Wikidata + OpenHistoricalMap). The methodology page already covers this for a human reader, but a proper `LICENSE`/`NOTICE` file at the repo root cataloguing each source, its license, and attribution is worth adding as a matter of record before making the repo public — not just user-facing, but the actual compliance artifact.

## What "going live" actually involves, in order

1. **Add a data/license attributions file** (see above).
2. **First commit.** Everything's currently untracked. Decide what's committed vs. gitignored — recommendation: commit `public/data/` directly (no Git LFS; 169 MB is well within GitHub/any host's limits, and LFS adds setup complexity with little benefit at this size). `.cache/`, `node_modules/`, `dist/` already gitignored correctly.
3. **Create a remote repo** (GitHub, presumably, given `git init` was run — this needs *your* GitHub account, not something I can do for you) and push.
4. **Connect the host** (Cloudflare Pages recommended) to that repo, set build command `npm run build`, output `dist`.
5. **Verify the live deploy**, not just the local dev server — click through several years, check the methodology page loads, check a slow-connection-style test (the classroom-wifi concern from `data-audit.md` is exactly what a real deploy should be checked against, not just localhost).
6. **Document the update workflow**: re-running `build-all-data`/`build-ohm`/`build-wikidata` locally, committing the refreshed `public/data/`, and pushing is what "densifying more later" looks like going forward — no server to maintain, just an occasional local re-run + push, consistent with the original plan's "no backend, nothing that needs to be kept running" goal.

## What I need from you before doing anything in steps 2 onward

- **Confirm Cloudflare Pages** (or say if you'd rather use GitHub Pages, Netlify, or Vercel instead — any work, Cloudflare's just my default recommendation).
- **Do you want a custom domain**, or is the host's free subdomain (e.g. `history-map.pages.dev`) fine for now?
- Creating the GitHub repo and pushing code, and creating/connecting a Cloudflare account, are actions I'll wait for your explicit go-ahead on rather than doing unprompted — let me know when you want me to proceed and I'll walk through it with you.
