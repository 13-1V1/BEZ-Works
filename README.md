# BEZ Works

Programs built by Brennan Meyer. Free to download and use.

**Live site:** https://13-1v1.github.io/BEZ-Works/

Link straight to one program by adding its id: `https://13-1v1.github.io/BEZ-Works/#musickid`

## How it's built

A static site (plain HTML/CSS/JS, no build step) hosted on GitHub Pages.

| File | What it is |
|---|---|
| `programs.json` | Every program and the category list. The page builds its cards from this. |
| `tools.json` | The "Tools I've Used" list. |
| `index.html`, `css/`, `js/app.js` | Layout and code. You shouldn't need to touch these to add a program. |
| `img/<id>/` | Picked screenshots (WebP, full size + thumbnail). |
| `play/<id>/` | Web builds for programs that run in the browser. |
| `_screenshots/` | Screenshot candidates. Git-ignored, never published. |

Downloads are **not** in the repo. They live on [GitHub Releases](https://github.com/13-1V1/BEZ-Works/releases), one release per program version, tagged `<id>-v<version>`.

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
   `downloads`, `browser`, `source`, `note` and `images` are all optional. Use `"status": "coming-soon"` for a greyed-out card with no buttons.

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
- What the lock covers: the page and the program list. What it doesn't: the download files on Releases and the browser builds in `play/` are still reachable by direct link.

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
