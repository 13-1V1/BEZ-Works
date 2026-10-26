# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BEZ Works is Brennan Meyer's download site for his programs. It's a static site (plain HTML/CSS/JS, no framework, no bundler) on GitHub Pages at https://13-1v1.github.io/BEZ-Works/, password-locked with StatiCrypt. README.md covers adding a program, the password, and credits.

## Commands

```bash
npm ci                                              # once: installs StatiCrypt, which the build needs
python -m http.server 8787                          # preview the unlocked source (npm run serve)
node scripts/build-site.mjs                         # build _site/ unlocked
STATICRYPT_PASSWORD=... node scripts/build-site.mjs # build _site/ locked, same as CI (bash syntax)
```

In PowerShell, set the password first with `$env:STATICRYPT_PASSWORD = '...'`.

There's no lint and no test runner. `tests/vcarve.html` is a standalone scene (open it through the local server) that draws the V-carve toolpaths over the carved render and prints chain counts and timings. Use it when changing `js/hero/vcarve.js`. `tests/` is never copied to `_site/`.

Publishing: pushing to `main` runs `.github/workflows/pages.yml` (`npm ci`, then build with secret `SITE_PASSWORD` as `STATICRYPT_PASSWORD`, then deploy to Pages).

## Data vs. layout

- `programs.json` (categories plus programs) and `tools.json` drive everything. `js/app.js` renders the cards, filters, lightbox, and `#id` deep links from them. Adding a program shouldn't need HTML or JS changes.
- `app.js` `loadJSON(path, inlineId)` reads an inline `<script type="application/json">` first, then falls back to fetching. `build-site.mjs` inlines both JSON files into `index.html` before locking, so the published page doesn't fetch them. The repo itself is public, so the lock hides the page, not the data. The unlocked local preview just fetches them.
- `status: "coming-soon"` cards sort last and show no buttons. `featured: true` cards span wider. Download URLs point to GitHub Releases, tagged `<id>-v<version>`. Binaries are never committed.
- `.staticrypt.json` holds the salt. Don't regenerate it, or saved logins and share links break.

## Hero animation (`js/hero/`)

The hero is a machined nameplate: a CNC job plays back on an 8 × 4 in aluminum plate. Scripts load in order as plain globals on `window.BEZ`. The order is set in `index.html` and matters.

| Module | Job |
|---|---|
| `program.js` | Builds the real Fanuc-style G-code (inches) and the move timeline: load blank, T1 face, T4 scribe the border, T2 V-carve BEZ, T3 V-carve WORKS, park. Each move has `t0`/`dur`. `BEZ.program.at(move, u)` gives the tool position partway through a move. |
| `vcarve.js` | The V-carve CAM. It draws the text to a mask, then runs a distance transform, thinning, tracing, and simplifying to get centerline paths with depth `z = -r/tanHalf`. `carvedImage()` renders the finished shaded carve that the reveal clips into. |
| `surface.js` | WebGL brushed-plate background shader. |
| `stock.js` | Blank textures and the plate's layers (surface, scribe, carve), plus push-off transforms. |
| `machine.js` | Draws the vise, tools, and tool carousel. |
| `effects.js` | Chips only. They spawn from cutting edges on the leading side of the feed. |
| `hero.js` | The conductor. It builds the program after the fonts load, lays out the plate between the control band and the copy, steps the clock at 1/240 s, reveals the cuts, and drives the DRO, G-code listing, and tool table. |

Behavior the user asked for, so keep it:
- The page opens on the finished plate. Nothing auto-starts.
- Cycle start loads a new blank that pushes the old one out.
- No coolant and no heat trail.
- Chips only where they'd really come off the cutter.
- `prefers-reduced-motion` shows the finished plate with no animation.
- An IntersectionObserver pauses the loop when the hero is off-screen.

Fonts: Big Shoulders Display (the carve text), IBM Plex Mono, and Instrument Sans, all from Google Fonts. The toolpaths depend on the font metrics, so `hero.js` waits on `document.fonts.load`.

## Release and screenshot pipeline (`scripts/`, run locally on Brennan's PC)

- `releases.json` lists the Release assets by their absolute source paths on this machine. The `ai-workbench`, `revu` and `game-studio` zips come from hand-made copies in `_releases/_scrubbed/` (gitignored) with personal paths removed. If that folder is gone, remake it before restaging those three. `stage-releases.py [id ...]` builds `_releases/<tag>/` (hard link, zip, zipdir, git archive, or scrub of personal paths). `upload-releases.py [id ...]` uploads with `gh`. It's idempotent and checks sizes. Update `sizeBytes` in `programs.json` to match.
- Mac builds (no Mac here, so none are tested on real hardware):
  - Godot: add a macOS preset copied from NowhereToHide's `export_presets.cfg` (universal, ad-hoc signed). Apple Silicon export needs `textures/vram_compression/import_etc2_astc=true` in project.godot.
  - Electron: `scripts/mac/pack-electron-mac.py` puts the Windows build's `app.asar` into the official Electron Mac zip, ad-hoc signs it with `_releases/_tools/rcodesign.exe`, and zips it with symlinks intact. One zip per chip (arm64, x64). Needs Windows Developer Mode for symlinks.
  - Python console apps: source zip plus a `scripts/mac/*.command` launcher (users install Python).
  - Mac zips made on Windows must be marked Unix-made or Macs drop the run permission: use `"unix_zip": true` or `"add"` in releases.json. `scripts/mac/How to open on Mac.txt` goes in every Mac zip.
- Screenshots: `screenshots/capture-window.ps1` (Win32 window capture with scripted input) and `screenshots/capture-web.mjs <plan.json>` (Playwright plus installed Chrome, step list in a JSON plan). Candidates go in `_screenshots/` (gitignored). `make-contact-sheet.py` builds a picker page, and `apply-picks.py [picks.json]` converts the picks to `img/<id>/N.webp` (1600 px) and `N-thumb.webp` (800 px).
- Screenshots must be full-window shots of current builds in real use, never test or proof images.

## Conventions

- Every code file starts with the two-line header from Brennan's global CLAUDE.md (`Created by: Brennan Meyer with use of Claude Code MM/DD/YYYY Santa Clarita, CA` / `brennanmmeyer@gmail.com`), in that file's comment syntax.
- Keep the dark theme. Design tokens are CSS custom properties at the top of `css/style.css`. Everything must work at phone width with no horizontal scroll.
- No per-program tech stack on cards. The footer is only "Brennan Meyer · brennanmmeyer@gmail.com".
- Program ids are lowercase with hyphens. Browser builds hosted here go in `play/<id>/`; `browser` can also be an outside URL (CHIPLOAD's is).
- Don't add license or "personal use" caveats to programs. Brennan has said every installer should be downloadable.
