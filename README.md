# BEZ Works

Programs built by Brennan Meyer. Free to download and use.

**Live site:** https://13-1v1.github.io/BEZ-Works/

Link straight to one program by adding its id: `https://13-1v1.github.io/BEZ-Works/#musickid`

## How it's built

A static site (plain HTML/CSS/JS, no framework, no bundler) hosted on GitHub Pages.

| File | What it is |
|---|---|
| `programs.json` | Every program and the category list. The page builds its cards from this. |
| `tools.json` | The "Tools I've used" list. |
| `index.html`, `css/`, `js/app.js` | Layout and code. You shouldn't need to touch these to add a program. |
| `img/<id>/` | Picked screenshots (WebP, full size + thumbnail), plus an optional `preview.mp4` card video. |
| `play/<id>/` | Web builds for programs that run in the browser. |
| `_screenshots/` | Screenshot candidates. Git-ignored, never published. |

Downloads are **not** in the repo. They live on [GitHub Releases](https://github.com/13-1V1/BEZ-Works/releases), one release per program version, tagged `<id>-v<version>`. A program with separate builds per platform gets one release per platform (NoBull: `nobull-desktop-v1.0.1` and `nobull-android-v2.1.0.0`).

## Add a program

1. Upload the build as a Release:
   ```bash
   gh release create <id>-v<version> "path/to/installer.exe" --repo 13-1V1/BEZ-Works --title "<Name> <version>" --notes "..."
   ```
2. Put screenshots in `img/<id>/` (e.g. `1.webp` + `1-thumb.webp`).
3. Add one entry to `programs.json`:
   ```json
   {
     "id": "my-program",
     "name": "My Program",
     "category": "tools",
     "status": "ready",
     "version": "1.0.0",
     "description": "One or two sentences.",
     "note": "Optional extra line, e.g. Needs Docker Desktop.",
     "images": [{ "full": "img/my-program/1.webp", "thumb": "img/my-program/1-thumb.webp" }],
     "downloads": [{ "label": "Download", "platform": "Windows", "url": "https://github.com/13-1V1/BEZ-Works/releases/download/my-program-v1.0.0/file.exe", "sizeBytes": 12345678 }],
     "browser": "play/my-program/",
     "source": "https://github.com/..."
   }
   ```
   `version`, `downloads`, `browser`, `source`, `note` and `images` are all optional, and so is `alt` on each image. `"video": "img/<id>/preview.mp4"` plays a muted loop on the card in place of the first screenshot. `browser` can also be a full URL to a build hosted somewhere else (CHIPLOAD does this). Use `"status": "coming-soon"` for a greyed-out card with no buttons; those always sort last.
   One program on two platforms (like NoBull): give each download its own `"version"`, and make `source` a list of `{ "label": "Source (Windows)", "url": "..." }`.
   Cards show in the same order as `programs.json`, so put an entry where you want it on the page. `"featured": true` makes a card bigger; put featured entries first so they sit at the top.

   You can also skip step 1's hand upload: add the build to `scripts/releases.json`, then run `python scripts/stage-releases.py <id>` and `python scripts/upload-releases.py <id>` The stage script writes each asset's exact size to `_releases/staged.json` for `sizeBytes`.

## Password

The published page is locked with [StatiCrypt](https://github.com/robinmoisson/staticrypt) (MIT). Visitors type the password once; "Remember me" keeps them in for 30 days.

- The password is the repo secret `SITE_PASSWORD`. Change it with:
  ```bash
  gh secret set SITE_PASSWORD --repo 13-1V1/BEZ-Works
  ```
  then re-run the **Publish site** action (or push any change).
- `.staticrypt.json` holds the salt. Keep it, or old "remember me" logins and share links stop working.
- Make a link that opens without typing the password:
  ```bash
  npx staticrypt --share https://13-1v1.github.io/BEZ-Works/ --share-remember -p <password>
  ```
- What the lock covers: the published page, including the program list baked into it. What it doesn't: this repo is public, so `programs.json`, `img/`, `css/` and `js/` can be read on GitHub, and the download files on Releases and the browser builds in `play/` are reachable by direct link.

## Build

GitHub Actions (`.github/workflows/pages.yml`) runs `scripts/build-site.mjs` on every push to `main`. That script copies the site into `_site/`, tucks `programs.json` and `tools.json` inside `index.html`, and locks it.

## Preview locally

```bash
python -m http.server 8787
```

Then open http://localhost:8787.

## Credits

Look and feel adapted from [vCard](https://github.com/codewithsadee/vcard-personal-portfolio) by codewithsadee, MIT License — see `TEMPLATE-LICENSE.txt`.
Password page adapted from [StatiCrypt](https://github.com/robinmoisson/staticrypt), MIT License — see `scripts/STATICRYPT-LICENSE.txt`.
