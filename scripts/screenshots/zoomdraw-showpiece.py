# Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
# brennanmmeyer@gmail.com
#
# Writes a capture-web.mjs plan that draws a ZoomDraw showpiece with the app's
# own pen tool: three glowing mandalas nested inside each other, each one drawn
# in the empty core of the last after zooming in ~10.8x. Then it takes shots at
# 1x, partway in, and at the deepest level.
#
# Usage:  python zoomdraw-showpiece.py <plan-out.json> <shots-dir>
#         node capture-web.mjs <plan-out.json>

import json
import math
import sys

OUT, SHOTS = sys.argv[1], sys.argv[2].rstrip("/\\") + "/"
W, H = 1707, 1019
CX, CY = 853.5, 509.5      # mandala center = view center (CSS px), so Center-mode GIFs dive straight in
R = 440                    # mandala outer radius on screen
CORE = 0.093               # empty core, as a fraction of R (next level fills it)
STEP_ZOOM = 1.15           # ZoomDraw's zoom per wheel notch
NOTCHES = 17               # 1.15^17 = 10.76x  ->  CORE * R * 10.76 ~= R

steps = []


def setv(el_id, value):
    js = ("(()=>{const e=document.getElementById('%s');e.value='%s';"
          "e.dispatchEvent(new Event('input',{bubbles:true}));"
          "e.dispatchEvent(new Event('change',{bubbles:true}));return e.value})()") % (el_id, value)
    steps.append({"eval": js})


def brush(color, size, opacity=100, hardness=100):
    setv("colorPicker", color)
    setv("sizeSlider", str(size))
    setv("opacitySlider", str(opacity))
    setv("hardnessSlider", str(hardness))


def stroke(points):
    steps.append({"drag": [[round(x, 1), round(y, 1)] for x, y in points], "steps": 2})


def polar(r, a):
    return CX + r * math.cos(a), CY + r * math.sin(a)


def circle(r, n=72):
    return [polar(r, 2 * math.pi * k / n) for k in range(n + 1)]


def petal(a, r0, r1, w, n=22):
    out = [polar(r0 + (r1 - r0) * t / n, a + w * math.sin(math.pi * t / n)) for t in range(n + 1)]
    back = [polar(r0 + (r1 - r0) * t / n, a - w * math.sin(math.pi * t / n)) for t in range(n, -1, -1)]
    return out + back


def mandala(pal, rot):
    outer = [petal(rot + 2 * math.pi * k / 12, 0.52 * R, 0.93 * R, 0.20) for k in range(12)]
    inner = [petal(rot + math.pi / 12 + 2 * math.pi * k / 12, 0.33 * R, 0.68 * R, 0.24) for k in range(12)]
    small = [petal(rot + 2 * math.pi * k / 24, 0.15 * R, 0.31 * R, 0.16) for k in range(24)]
    veins = [[polar(0.56 * R, rot + 2 * math.pi * k / 12), polar(0.88 * R, rot + 2 * math.pi * k / 12)] for k in range(12)]
    spokes = [[polar(0.36 * R, rot + math.pi / 24 + 2 * math.pi * k / 24), polar(0.50 * R, rot + math.pi / 24 + 2 * math.pi * k / 24)] for k in range(24)]

    # glow underneath: wide, see-through, hard-edged strokes (ZoomDraw's soft edge is a
    # real blur filter, which gets very slow at deep zoom and in GIF export)
    for size, alpha in ((24, 10), (13, 16)):
        brush(pal["outer"], size, alpha)
        for p in outer: stroke(p)
        brush(pal["inner"], size, alpha)
        for p in inner: stroke(p)
        brush(pal["small"], size - 6, alpha)
        for p in small: stroke(p)
        brush(pal["ring"], size + 4, alpha)
        stroke(circle(0.97 * R, 120))

    # crisp line work on top
    brush(pal["outer"], 4)
    for p in outer: stroke(p)
    brush(pal["inner"], 4)
    for p in inner: stroke(p)
    brush(pal["small"], 3)
    for p in small: stroke(p)
    brush(pal["outer"], 2, 70)
    for v in veins: stroke(v)
    brush(pal["ring"], 2, 80)
    for s in spokes: stroke(s)
    brush(pal["ring"], 3)
    for r in (0.97, 0.995, 0.335, 0.14, 0.105):
        stroke(circle(r * R, 120 if r > 0.5 else 72))
    brush(pal["dot"], 6)
    for k in range(48):
        x, y = polar(0.955 * R, rot + 2 * math.pi * k / 48)
        stroke([(x, y), (x + 0.6, y + 0.6)])
    for k in range(16):
        x, y = polar(0.123 * R, rot + 2 * math.pi * k / 16)
        stroke([(x, y), (x + 0.5, y + 0.5)])


PALETTES = [
    {"outer": "#7c4dff", "inner": "#40c4ff", "small": "#64ffda", "ring": "#ffd740", "dot": "#ff80ab"},
    {"outer": "#ff4081", "inner": "#ffab40", "small": "#ffd740", "ring": "#18ffff", "dot": "#b388ff"},
    {"outer": "#00e676", "inner": "#1de9b6", "small": "#40c4ff", "ring": "#ff80ab", "dot": "#ffd740"},
]

steps += [{"wait": 2000}, {"click": "#cardZoom"}, {"click": "#startBtn"}, {"wait": 1200}, {"press": "Escape"}]
setv("bgPicker", "#0b0a1a")

for level, pal in enumerate(PALETTES):
    mandala(pal, rot=level * math.pi / 12)
    if level < len(PALETTES) - 1:
        steps += [{"move": [CX, CY]}] + [{"wheel": [CX, CY, -240]} for _ in range(NOTCHES)] + [{"wait": 400}]

steps += [{"move": [W - 40, H - 30]}, {"wait": 600}, {"shot": SHOTS + "_zd-deep.png"}]
# the app's own GIF export: Center mode, ping-pong (dive in, then back out), from 1x to this depth
steps += [{"click": "#zgCenterBtn"}, {"click": "#zgPongBtn"}, {"wait": 300},
          {"download": "#zgExportBtn", "saveAs": SHOTS + "zoomdraw/zoomdraw-zoom.gif", "timeout": 900000}, {"wait": 1500}]
# back out: halfway (level 2 framed), then all the way to 1x
steps += [{"move": [CX, CY]}] + [{"wheel": [CX, CY, 240]} for _ in range(NOTCHES)] + [{"move": [W - 40, H - 30]}, {"wait": 600}, {"shot": SHOTS + "_zd-mid.png"}]
steps += [{"move": [CX, CY]}] + [{"wheel": [CX, CY, 240]} for _ in range(NOTCHES - 8)] + [{"move": [W - 40, H - 30]}, {"wait": 600}, {"shot": SHOTS + "_zd-between.png"}]
steps += [{"move": [CX, CY]}] + [{"wheel": [CX, CY, 240]} for _ in range(8)] + [{"move": [W - 40, H - 30]}, {"wait": 600}, {"shot": SHOTS + "_zd-full.png"}]

plan = {"serve": "C:/Users/brenn/BEZ WORKS/play/zoomdraw", "port": 8463, "path": "index.html",
        "viewport": [W, H], "scale": 1.5, "steps": steps}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(plan, f)
print(f"{len(steps)} steps")
