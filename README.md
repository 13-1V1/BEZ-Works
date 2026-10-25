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

## Preview locally

```bash
python -m http.server 8787
```

Then open http://localhost:8787.

## Credits

Look and feel adapted from [vCard](https://github.com/codewithsadee/vcard-personal-portfolio) by codewithsadee, MIT License — see `TEMPLATE-LICENSE.txt`.
