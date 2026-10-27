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
import stat
import subprocess
import sys
import time
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


def unix_zip(path, add=()):
    """Mark every entry as made on Unix so Mac unzip keeps the run permission (staged copy only).
    Zips written on Windows say 'MS-DOS', and macOS then ignores the stored permissions.
    add: [[source file, name in zip, optional mode], ...] extra files to put in (e.g. the Mac open-me note)."""
    tmp = path.with_suffix(".tmp")
    with zipfile.ZipFile(path) as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as dst:
        for extra, arc, *mode in add:   # optional third item: permission, e.g. "755" for a launcher
            info = zipfile.ZipInfo(arc, date_time=time.localtime()[:6])
            info.create_system = 3
            info.external_attr = (0o100000 | int(mode[0] if mode else "644", 8)) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            dst.writestr(info, (ROOT / extra).read_bytes())
        for info in src.infolist():
            is_dir = info.filename.endswith("/")
            mode = ((info.external_attr >> 16) & 0o777 or (0o755 if is_dir else 0o644)) & ~0o022   # no group/other write
            ftype = (info.external_attr >> 16) & 0o170000   # keep symlinks (Mac apps are full of them)
            if not ftype:
                ftype = 0o040000 if is_dir else 0o100000
            info.create_system = 3
            info.external_attr = (ftype | mode) << 16 | (0x10 if is_dir else 0)
            if is_dir:
                dst.writestr(info, b"")
                continue
            with src.open(info) as r, dst.open(info, "w", force_zip64=True) as w:
                shutil.copyfileobj(r, w, 1 << 20)
    tmp.replace(path)


def adhoc_sign(path):
    """Ad-hoc sign every .app in a Mac zip (staged copy only). Apple Silicon refuses to run
    unsigned code at all ("damaged... Move to Trash"), so an unsigned export must be signed.
    Uses _releases/_tools/rcodesign.exe; needs Windows Developer Mode if the zip has symlinks."""
    rcodesign = ROOT / "_releases" / "_tools" / "rcodesign.exe"
    work = path.with_suffix(".signwork")
    shutil.rmtree(work, ignore_errors=True)
    infos = []
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            infos.append(info)
            dest = work / info.filename
            if stat.S_ISLNK(info.external_attr >> 16):
                dest.parent.mkdir(parents=True, exist_ok=True)
                link = z.read(info).decode()
                os.symlink(link.replace("/", os.sep), dest, target_is_directory=(dest.parent / link).is_dir())
            elif info.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as r, open(dest, "wb") as w:
                    shutil.copyfileobj(r, w, 1 << 20)
    modes = {i.filename.rstrip("/"): i.external_attr >> 16 for i in infos}
    apps = sorted({p.split("/")[0] for p in modes if p.split("/")[0].endswith(".app")})
    for app in apps:
        subprocess.run([str(rcodesign), "sign", str(work / app)], check=True, stdout=subprocess.DEVNULL)
    tmp = path.with_suffix(".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        for p in sorted(work.rglob("*")):
            rel = p.relative_to(work).as_posix()
            info = zipfile.ZipInfo(rel + ("/" if p.is_dir() and not p.is_symlink() else ""), date_time=time.localtime()[:6])
            info.create_system = 3
            if p.is_symlink():
                info.external_attr = (stat.S_IFLNK | 0o755) << 16
                z.writestr(info, os.readlink(p).replace("\\", "/"))
            elif p.is_dir():
                info.external_attr = (stat.S_IFDIR | 0o755) << 16 | 0x10
                z.writestr(info, b"")
            else:
                mode = stat.S_IMODE(modes.get(rel, 0)) or 0o644
                info.external_attr = (stat.S_IFREG | mode) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(p, "rb") as r, z.open(info, "w", force_zip64=True) as w:
                    shutil.copyfileobj(r, w, 1 << 20)
    tmp.replace(path)
    shutil.rmtree(work, ignore_errors=True)


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
            if a.get("unix_zip") or a.get("add"):
                unix_zip(dst, a.get("add", []))
            if a.get("sign"):
                adhoc_sign(dst)
            rows.append({**{k: v for k, v in a.items() if k in ("name", "label", "platform", "source")},
                         "sizeBytes": dst.stat().st_size})
        staged[rel["id"]] = {"tag": tag, "version": rel["version"], "title": rel["title"], "assets": rows}

    staged_path.write_text(json.dumps(staged, indent=2), encoding="utf-8")
    print(f"Wrote {staged_path}")


if __name__ == "__main__":
    main()
