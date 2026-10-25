// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// animations.js -- DATA ONLY. Frame rectangles for the soldier sprite.
//
// The original Sprites/Soldier.png is a reference poster with a painted-in
// background and uneven frames, so a one-time offline tool sliced it, removed
// the background, and packed the frames (bottom-aligned on a shared baseline)
// into Sprites/generated/soldier_clean.png. These rects index THAT sheet.
// Re-run the slicer (scratchpad tool) if the source art ever changes.

(function (G) {
  "use strict";

  G.animations = {
    useSheet: true,
    sheet: "soldier_clean",   // nice-name in the asset manifest

    // one fixed scale for every frame keeps pose proportions + baseline honest
    scale: 0.40,

    // frames per second while an animation cycles (throw/death play once)
    fps: { idle: 3, walk: 10, jump: 1, aim: 1, throw: 14, death: 9 },

    frames: {
      idle: [
        { x: 2,   y: 16, w: 63, h: 136 },
        { x: 67,  y: 29, w: 56, h: 123 },
        { x: 125, y: 29, w: 56, h: 123 },
        { x: 183, y: 31, w: 60, h: 121 },
      ],
      walk: [
        { x: 245, y: 16, w: 74, h: 136 },
        { x: 321, y: 30, w: 77, h: 122 },
        { x: 400, y: 32, w: 80, h: 120 },
        { x: 482, y: 32, w: 83, h: 120 },
      ],
      jump: [
        { x: 567, y: 16, w: 80, h: 136 },
        { x: 649, y: 24, w: 94, h: 128 },
        { x: 745, y: 52, w: 80, h: 100 },
      ],
      aim: [
        { x: 827, y: 19, w: 71, h: 133 },
        { x: 900, y: 14, w: 68, h: 138 },
        { x: 970, y: 37, w: 69, h: 115 },
      ],
      // arm cocks back -> extends -> releases
      throw: [
        { x: 1041, y: 15, w: 109, h: 137 },
        { x: 1152, y: 2,  w: 109, h: 150 },
        { x: 1263, y: 31, w: 109, h: 121 },
      ],
      // collapses to a prone corpse; last frame is held after death
      death: [
        { x: 1374, y: 81,  w: 105, h: 71 },
        { x: 1481, y: 96,  w: 105, h: 56 },
        { x: 1588, y: 100, w: 105, h: 52 },
      ],
    },
  };
})(window.IBTW = window.IBTW || {});
