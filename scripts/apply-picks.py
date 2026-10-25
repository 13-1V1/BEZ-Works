# Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
# brennanmmeyer@gmail.com
#
# Turns the contact sheet's picks.json into site images and fills programs.json:
#   _screenshots/<id>/<file>  ->  img/<id>/1.webp (max 1600 px wide)
#                                 img/<id>/1-thumb.webp (800 px wide, for the card)
# The first file listed for each program is the main (card) shot.
#
# Usage:  python scripts/apply-picks.py [path/to/picks.json]
#         (default: ~/Downloads/picks.json)

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FULL_W, THUMB_W = 1600, 800


def to_webp(src, dst, width, quality):
    with Image.open(src) as im:
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(dst, "WEBP", quality=quality, method=6)


def main():
    picks_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "picks.json"
    picks = json.loads(picks_path.read_text(encoding="utf-8"))
    data_path = ROOT / "programs.json"
    data = json.loads(data_path.read_text(encoding="utf-8"))
    by_id = {p["id"]: p for p in data["programs"]}

    for pid, files in picks.items():
        if pid not in by_id:
            print(f"skip unknown id {pid}")
            continue
        out = ROOT / "img" / pid
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob("*.webp"):
            old.unlink()
        images = []
        for i, name in enumerate(files, 1):
            src = ROOT / "_screenshots" / pid / name
            to_webp(src, out / f"{i}.webp", FULL_W, 82)
            to_webp(src, out / f"{i}-thumb.webp", THUMB_W, 76)
            images.append({"full": f"img/{pid}/{i}.webp", "thumb": f"img/{pid}/{i}-thumb.webp",
                           "alt": f"{by_id[pid]['name']} screenshot {i}"})
        by_id[pid]["images"] = images
        kb = sum(f.stat().st_size for f in out.glob("*.webp")) // 1024
        print(f"{pid}: {len(images)} shot(s), {kb} KB")

    data_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("programs.json updated")


if __name__ == "__main__":
    main()
