// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// scenery.js -- DATA for terrain decorations + the parallax forest background.
// Decoration frames index Sprites/generated/decorations.png (trimmed + dusk-
// tinted by an offline tool from the Lost Pixel Art forest set). Re-run that
// tool if the source art changes.

(function (G) {
  "use strict";

  G.scenery = {
    sheet: "decorations",

    // packed frame rects (from the generator's DECOR_JSON)
    frames: {
      tree1:   { x: 2,    y: 2, w: 283, h: 350 },
      tree2:   { x: 287,  y: 2, w: 219, h: 279 },
      tree3:   { x: 508,  y: 2, w: 256, h: 316 },
      bush1:   { x: 766,  y: 2, w: 244, h: 146 },
      bush2:   { x: 1012, y: 2, w: 270, h: 162 },
      grass1:  { x: 1284, y: 2, w: 122, h: 148 },
      grass2:  { x: 1408, y: 2, w: 122, h: 134 },
      grass3:  { x: 1532, y: 2, w: 122, h: 134 },
      flower1: { x: 1656, y: 2, w: 310, h: 417 },
      flower2: { x: 1968, y: 2, w: 368, h: 496 },
    },

    // which frames belong to each kind + how tall to draw them on screen (world px)
    kinds: {
      tree:   { names: ["tree1", "tree2", "tree3"], height: 78 },
      bush:   { names: ["bush1", "bush2"],          height: 30 },
      grass:  { names: ["grass1", "grass2", "grass3"], height: 22 },
      flower: { names: ["flower1", "flower2"],      height: 26 },
    },

    // parallax background: layers drawn back -> front, each at the SAME scale/Y
    // (so they compose into one forest); only the horizontal scroll factor
    // differs, which is what creates the depth.
    parallax: [
      { asset: "bg_sky",  factor: 0.05 },
      { asset: "bg_far",  factor: 0.12 },
      { asset: "bg_mid",  factor: 0.22 },
      { asset: "bg_near", factor: 0.34 },
    ],
  };
})(window.IBTW = window.IBTW || {});
