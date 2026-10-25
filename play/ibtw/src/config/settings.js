// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// settings.js -- all the tuning numbers in ONE place. Change gameplay feel here,
// not deep in the logic. Everything is in world pixels and seconds.

(function (G) {
  "use strict";

  G.settings = {
    // --- physics ---
    gravity: 900,          // downward accel on projectiles/humans (px/s^2)
    windMax: 260,          // max |wind| horizontal accel, randomized each turn (px/s^2)
    powerMax: 1080,        // launch speed at 100% charge (px/s)
    powerChargeRate: 1.15, // how fast the power meter fills (fraction per second)
    damageScale: 1.0,      // global multiplier on all damage

    // --- world / view ---
    world: { width: 2600, height: 820 },  // the whole battlefield
    view:  { width: 1000, height: 600 },  // canvas (logical) size / camera window
    waterY: 806,           // fall below this = drowned (near bottom of world)

    // --- turns ---
    turnSeconds: 35,       // time to move + fire
    resolveDelay: 1.1,     // pause after a shot resolves before next turn
    retreatSeconds: 0,     // (future) free-move window after firing

    // --- humans ---
    human: {
      w: 22, h: 40,        // collision box (feet-anchored)
      walkSpeed: 135,      // px/s
      jumpSpeed: 380,      // initial up velocity on jump
      maxStepUp: 14,       // how tall a slope step it can climb while walking
      maxFallSafe: 300,    // fall speed below this = no damage
      fallDamageScale: 0.14, // hp lost per (px/s) over the safe threshold
      startHp: 100,
    },

    // --- teams ---
    teams: [
      { name: "Red Squad",  color: "#ff5a5f", accent: "#ffd0d1" },
      { name: "Blue Squad", color: "#4da3ff", accent: "#cfe6ff" },
    ],
    humansPerTeam: 3,

    // --- camera ---
    camera: { lerp: 0.10, maxShake: 16 },
  };
})(window.IBTW = window.IBTW || {});
