# Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
# brennanmmeyer@gmail.com
#
# Uploads everything staged in _releases/ (see stage-releases.py) to GitHub
# Releases on 13-1V1/BEZ-Works, one release per tag. Safe to re-run: existing
# assets with the right size are skipped. Ends by checking every asset's size.
#
# Usage:  python scripts/upload-releases.py [id ...]     (no ids = all staged)

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "13-1V1/BEZ-Works"
SITE = "https://13-1v1.github.io/BEZ-Works/"


def gh(*args, check=True):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=check)


def remote_assets(tag):
    r = gh("api", f"repos/{REPO}/releases/tags/{tag}", check=False)
    if r.returncode != 0:
        return None
    return {a["name"]: a["size"] for a in json.loads(r.stdout)["assets"]}


def main():
    staged = json.loads((ROOT / "_releases" / "staged.json").read_text(encoding="utf-8"))
    wanted = set(sys.argv[1:])
    problems = []

    for pid, rel in staged.items():
        if wanted and pid not in wanted:
            continue
        tag, folder = rel["tag"], ROOT / "_releases" / rel["tag"]
        files = [folder / a["name"] for a in rel["assets"]]
        have = remote_assets(tag)

        if have is None:
            print(f"[{tag}] creating release with {len(files)} file(s) ...", flush=True)
            notes = f"{rel['title']}. More info and install help: {SITE}#{pid}"
            gh("release", "create", tag, *map(str, files), "--repo", REPO,
               "--title", rel["title"], "--notes", notes)
        else:
            for f in files:
                if have.get(f.name) == f.stat().st_size:
                    continue
                print(f"[{tag}] uploading {f.name} ...", flush=True)
                gh("release", "upload", tag, str(f), "--repo", REPO, "--clobber")

        # Verify sizes match what was staged
        have = remote_assets(tag) or {}
        for a in rel["assets"]:
            if have.get(a["name"]) != a["sizeBytes"]:
                problems.append(f"{tag}/{a['name']}: local {a['sizeBytes']} vs remote {have.get(a['name'])}")
        print(f"[{tag}] ok", flush=True)

    if problems:
        print("SIZE MISMATCHES:\n  " + "\n  ".join(problems))
        sys.exit(1)
    print("All assets uploaded and sizes match.")


if __name__ == "__main__":
    main()
