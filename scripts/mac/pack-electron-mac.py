# Created by: Brennan Meyer with use of Claude Code 10/26/2026 Santa Clarita, CA
# brennanmmeyer@gmail.com
#
# Builds a Mac version of an Electron app on Windows, no Mac needed:
#   1. unpacks the official Electron Mac zip (keeping its symlinks)
#   2. drops in the app's code (the same app.asar / app folder the Windows build ships)
#   3. sets the name, bundle id, version and icon in Info.plist
#   4. ad-hoc signs the whole bundle with rcodesign (so Macs offer "Open Anyway"
#      instead of calling it "damaged")
#   5. zips it with Unix permissions and symlinks intact
#
# Windows must allow symlinks (Settings > System > For developers > Developer Mode).
#
# Usage:
#   python scripts/mac/pack-electron-mac.py --electron-zip electron-v33.4.11-darwin-arm64.zip
#       --app path/to/app.asar (or an app folder) --name "Fractal Gen" --id com.example.app
#       --version 1.0.0 --icon build/icon.png --rcodesign path/to/rcodesign.exe
#       --work some/temp/dir --out "Fractal Gen-1.0.0-mac-arm64.zip"

import argparse
import os
import plistlib
import shutil
import stat
import subprocess
import sys
import time
import zipfile
from pathlib import Path

from PIL import Image

MACHO_MAGICS = {b"\xca\xfe\xba\xbe", b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf"}


def unpack_electron(zip_path, dest):
    """Extract the Electron zip, recreating symlinks. Returns {relative path: unix mode}."""
    modes, links = {}, []
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            mode = info.external_attr >> 16
            target = dest / info.filename
            modes[info.filename.rstrip("/")] = stat.S_IMODE(mode)
            if stat.S_ISLNK(mode):
                links.append((target, z.read(info).decode()))
            elif info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as r, open(target, "wb") as w:
                    shutil.copyfileobj(r, w, 1 << 20)
    # Links can point through other links (Resources -> Versions/Current/Resources),
    # so make each one once whatever it points at exists; Windows needs to know file vs folder.
    while links:
        left = []
        for target, link in links:
            real = target.parent / link
            if real.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                os.symlink(link.replace("/", os.sep), target, target_is_directory=real.is_dir())   # Windows wants backslashes
            else:
                left.append((target, link))
        if len(left) == len(links):
            raise RuntimeError(f"unresolvable symlinks: {left}")
        links = left
    return modes


def make_icns(src, dst):
    im = Image.open(src)
    if getattr(im, "ico", None):          # .ico: take the biggest image inside
        im = im.ico.getimage(max(im.ico.sizes()))
    im = im.convert("RGBA")
    if im.width < 1024:
        im = im.resize((1024, 1024), Image.LANCZOS)
    im.save(dst, format="ICNS")


def patch_plist(path, name, bundle_id, version):
    with open(path, "rb") as f:
        pl = plistlib.load(f)
    pl.update({
        "CFBundleName": name,
        "CFBundleDisplayName": name,
        "CFBundleIdentifier": bundle_id,
        "CFBundleShortVersionString": version,
        "CFBundleVersion": version,
        "CFBundleIconFile": "app.icns",
    })
    with open(path, "wb") as f:
        plistlib.dump(pl, f)


def is_macho(path):
    with open(path, "rb") as f:
        return f.read(4) in MACHO_MAGICS


def zip_bundle(root, app_dir_name, out, modes, extra):
    """Zip root/<app>.app with Unix 'made by', original modes, real symlink entries."""
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        base = root / app_dir_name
        for dirpath, dirnames, filenames in os.walk(base, followlinks=False):
            dp = Path(dirpath)
            for name in sorted(dirnames + filenames):
                p = dp / name
                rel = p.relative_to(root).as_posix()
                info = zipfile.ZipInfo(rel, date_time=time.localtime()[:6])
                info.create_system = 3
                if p.is_symlink():
                    info.external_attr = (stat.S_IFLNK | 0o755) << 16
                    z.writestr(info, os.readlink(p).replace("\\", "/"))
                    if name in dirnames:
                        dirnames.remove(name)       # don't walk into linked dirs
                elif p.is_dir():
                    continue
                else:
                    orig = modes.get(rel.replace(app_dir_name, "Electron.app", 1))
                    mode = orig if orig else (0o755 if is_macho(p) else 0o644)
                    info.external_attr = (stat.S_IFREG | mode) << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    with open(p, "rb") as r, z.open(info, "w", force_zip64=True) as w:
                        shutil.copyfileobj(r, w, 1 << 20)
        for src, arc in extra:
            info = zipfile.ZipInfo(arc, date_time=time.localtime()[:6])
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, Path(src).read_bytes())


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--electron-zip", required=True)
    ap.add_argument("--app", required=True, help="app.asar file or app folder from the Windows build")
    ap.add_argument("--name", required=True)
    ap.add_argument("--id", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--icon", required=True)
    ap.add_argument("--rcodesign", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--note", help="text file to put next to the app in the zip")
    a = ap.parse_args()

    work = Path(a.work)
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    modes = unpack_electron(a.electron_zip, work)

    app = work / f"{a.name}.app"
    (work / "Electron.app").rename(app)
    res = app / "Contents" / "Resources"
    (res / "default_app.asar").unlink(missing_ok=True)
    src = Path(a.app)
    if src.is_dir():
        shutil.copytree(src, res / "app")
    else:
        shutil.copy2(src, res / "app.asar")
        unpacked = src.with_name(src.name + ".unpacked")
        if unpacked.is_dir():
            shutil.copytree(unpacked, res / (src.name + ".unpacked"))
    (res / "electron.icns").unlink(missing_ok=True)
    make_icns(a.icon, res / "app.icns")
    patch_plist(app / "Contents" / "Info.plist", a.name, a.id, a.version)
    # Electron's helper apps don't name their main executable; codesign needs it to seal them
    for helper in (app / "Contents" / "Frameworks").glob("*.app"):
        pl_path = helper / "Contents" / "Info.plist"
        with open(pl_path, "rb") as f:
            pl = plistlib.load(f)
        if "CFBundleExecutable" not in pl:
            exe = [p.name for p in (helper / "Contents" / "MacOS").iterdir()]
            assert len(exe) == 1, (helper, exe)
            pl["CFBundleExecutable"] = exe[0]
            with open(pl_path, "wb") as f:
                plistlib.dump(pl, f)

    subprocess.run([a.rcodesign, "sign", str(app)], check=True)

    extra = [(a.note, Path(a.note).name)] if a.note else []
    zip_bundle(work, app.name, a.out, modes, extra)
    print(f"wrote {a.out} ({Path(a.out).stat().st_size:,} bytes)")


if __name__ == "__main__":
    sys.exit(main())
