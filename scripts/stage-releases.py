# Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
# brennanmmeyer@gmail.com
#
# Builds _releases/<tag>/ from scripts/releases.json: clean-named copies of
# installers, zips of loose builds, and git-archive source zips.
# Writes _releases/staged.json (asset sizes) for filling in programs.json.
#
# Usage:  python scripts/stage-releases.py [id ...]     (no ids = all)

import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_releases"


def tag_of(rel):
    return f"{rel['id']}-v{rel['version']}"


def place_file(src, dst):
    """Hard-link when possible (no extra disk), copy otherwise."""
    if dst.exists():
        dst.unlink()
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def add_path(zf, src, arc):
    src = Path(src)
    if src.is_dir():
        for f in sorted(src.rglob("*")):
            if f.is_file():
                zf.write(f, f"{arc}/{f.relative_to(src).as_posix()}")
    else:
        zf.write(src, arc)


def make_zip(items, dst):
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        for item in items:
            src, arc = (item if isinstance(item, list) else (item, Path(item).name))
            if not Path(src).exists():
                raise FileNotFoundError(src)
            add_path(zf, src, arc)


def make_zipdir(src_dir, dst, exclude):
    src_dir = (ROOT / src_dir) if not Path(src_dir).is_absolute() else Path(src_dir)
    top = src_dir.name
    skip = [Path(e) for e in exclude]
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        for f in sorted(src_dir.rglob("*")):
            rel = f.relative_to(src_dir)
            if any(rel == s or s in rel.parents for s in skip):
                continue
            if f.is_file():
                zf.write(f, f"{top}/{rel.as_posix()}")


def make_git_zip(repo, dst, prefix):
    subprocess.run(["git", "-C", repo, "archive", "--format=zip",
                    f"--prefix={prefix}/", "-o", str(dst), "HEAD"], check=True)


def scrub_zip(path, rules):
    """Rewrite a zip: drop matching entries, replace text in the rest (staged copy only)."""
    drop = rules.get("drop", [])
    reps = [(f.encode(), t.encode()) for f, t in rules.get("replace", [])]
    tmp = path.with_suffix(".tmp")
    with zipfile.ZipFile(path) as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as dst:
        for info in src.infolist():
            name = info.filename
            if any(d in name.split("/") or name.endswith(d) for d in drop):
                continue
            data = src.read(info)
            for f, t in reps:
                data = data.replace(f, t)
            dst.writestr(info, data)
    tmp.replace(path)


def main():
    manifest = json.loads((ROOT / "scripts" / "releases.json").read_text(encoding="utf-8"))
    wanted = set(sys.argv[1:])
    staged_path = OUT / "staged.json"
    staged = json.loads(staged_path.read_text(encoding="utf-8")) if staged_path.exists() else {}

    for rel in manifest["releases"]:
        if wanted and rel["id"] not in wanted:
            continue
        tag = tag_of(rel)
        folder = OUT / tag
        folder.mkdir(parents=True, exist_ok=True)
        rows = []
        for a in rel["assets"]:
            dst = folder / a["name"]
            print(f"[{tag}] {a['name']} ...", flush=True)
            if "file" in a:
                place_file(a["file"], dst)
            elif "zip" in a:
                make_zip(a["zip"], dst)
            elif "zipdir" in a:
                make_zipdir(a["zipdir"], dst, a.get("exclude", []))
            elif "git" in a:
                make_git_zip(a["git"], dst, rel["id"])
            if "scrub" in a:
                scrub_zip(dst, a["scrub"])
            rows.append({**{k: v for k, v in a.items() if k in ("name", "label", "platform", "source")},
                         "sizeBytes": dst.stat().st_size})
        staged[rel["id"]] = {"tag": tag, "version": rel["version"], "title": rel["title"], "assets": rows}

    staged_path.write_text(json.dumps(staged, indent=2), encoding="utf-8")
    print(f"Wrote {staged_path}")


if __name__ == "__main__":
    main()
