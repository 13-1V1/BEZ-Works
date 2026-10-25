// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// weapons.js -- DATA. Every weapon is a plain object. firing.js reads `behavior`
// and dispatches. Adding a weapon = add an entry here (+ maybe one small behavior
// function). Numbers live here so they're easy to tune.
//
// Behavior types (a small set covers everything):
//   projectile_arc  - obeys gravity + wind (bazooka, mortar, mini-nuke)
//   thrown_bouncy   - arcs, bounces off terrain, fuse timer (grenade, dynamite)
//   hitscan         - instant straight line, high direct damage (sniper, rifle)
//   airstrike/beam/place_and_detonate/self_effect/special -> later phases.
//
// BALANCE: rifles/precision do high DIRECT damage; explosives trade direct for area.

(function (G) {
  "use strict";

  // icon = {sheet, x, y, w, h}: a crop into a sprite sheet, used for both the
  // HUD selector and the gun drawn in the soldier's hands.
  var list = [
    {
      id: "bazooka",
      name: "Bazooka",
      tier: "classic",
      sprite: "clockmaster_weapons",
      icon: { sheet: "clockmaster_weapons", x: 180, y: 2, w: 112, h: 28 },
      // projIcon = crop drawn as the flying projectile (rotated to velocity)
      projIcon: { sheet: "clockmaster_weapons", x: 193, y: 38, w: 91, h: 17 }, // rocket
      behavior: "projectile_arc",
      damage: 34,          // direct hit (explosives = modest direct...)
      blastRadius: 62,     // ...but strong area
      blastDamage: 46,     // max damage at blast center
      count: 1,
      fuseSeconds: 0,
      radius: 4,           // projectile collision radius (px)
      affectedByWind: true,
      knockback: 220,
    },
    {
      id: "grenade",
      name: "Grenade",
      tier: "classic",
      sprite: "clockmaster_weapons",
      icon: { sheet: "clockmaster_weapons", x: 0, y: 226, w: 22, h: 28 },
      projIcon: { sheet: "clockmaster_weapons", x: 0, y: 226, w: 22, h: 28 },
      projSpin: true, // grenades tumble instead of aligning to velocity
      behavior: "thrown_bouncy",
      damage: 20,
      blastRadius: 55,
      blastDamage: 42,
      count: 1,
      fuseSeconds: 2.6,    // detonates on timer, bounces until then
      radius: 5,
      bounciness: 0.55,
      affectedByWind: true,
      knockback: 200,
    },
    {
      id: "cluster",
      name: "Cluster Bomb",
      tier: "classic",
      sprite: "clockmaster_weapons",
      icon: { sheet: "clockmaster_weapons", x: 188, y: 283, w: 175, h: 40 },
      projIcon: { sheet: "clockmaster_weapons", x: 188, y: 283, w: 175, h: 40 },
      projSpin: true,
      behavior: "thrown_bouncy",
      damage: 14,
      blastRadius: 40,
      blastDamage: 26,
      count: 1,
      fuseSeconds: 2.2,
      radius: 5,
      bounciness: 0.5,
      affectedByWind: true,
      // on detonation, spawn some child bomblets:
      cluster: { count: 5, childBlastRadius: 34, childBlastDamage: 22, spread: 260 },
      knockback: 160,
    },
    {
      id: "sniper",
      name: "Sniper Rifle",
      tier: "rifle",
      sprite: "era_primary",
      icon: { sheet: "clockmaster_weapons", x: 26, y: 96, w: 94, h: 38 },
      projectileSprite: "era_projectiles",
      behavior: "hitscan",
      damage: 68,          // rifles feel POWERFUL: high direct damage
      blastRadius: 0,      // pure bullet, no explosion
      blastDamage: 0,
      count: 1,
      fuseSeconds: 0,
      affectedByWind: false, // instant line -> wind can't bend it (that's the trade)
      knockback: 90,
      range: 3000,
    },
    {
      id: "mortar",
      name: "Mortar",
      tier: "classic",
      sprite: "clockmaster_weapons",
      icon: { sheet: "clockmaster_weapons", x: 188, y: 60, w: 110, h: 28 },
      projIcon: { sheet: "clockmaster_weapons", x: 192, y: 189, w: 119, h: 22 }, // artillery shell
      behavior: "projectile_arc",
      damage: 26,
      blastRadius: 70,
      blastDamage: 40,
      count: 3,            // lobs a small spread
      spread: 0.10,        // radians of angle jitter per extra projectile
      fuseSeconds: 0,
      radius: 4,
      affectedByWind: true,
      knockback: 180,
    },
    {
      id: "shotgun",
      name: "Shotgun",
      tier: "rifle",
      icon: { sheet: "clockmaster_weapons", x: 28, y: 64, w: 64, h: 26 },
      behavior: "hitscan",
      // one trigger pull -> a whole cone of pellets fired AT ONCE. Devastating
      // point-blank (all pellets land), falls off fast as the cone widens.
      damage: 22,          // per pellet
      count: 8,            // 8 x 22 = 176 max at contact range
      spread: 0.12,        // wide cone
      range: 480,          // short reach: get close or graze
      blastRadius: 0,
      blastDamage: 0,
      affectedByWind: false,
      knockback: 150,
    },
    {
      id: "assault",
      name: "Assault Rifle",
      tier: "rifle",
      icon: { sheet: "clockmaster_weapons", x: 28, y: 0, w: 88, h: 24 },
      behavior: "hitscan",
      // full-auto: rounds fire ONE AT A TIME over ~0.5s (rat-tat-tat), each
      // small, stacking up on a held target. Tight aim + a little recoil climb.
      damage: 11,          // per round
      burstCount: 8,       // 8 rounds -> up to 88 if you keep them on target
      burstInterval: 0.065,// seconds between rounds
      burstClimb: 0.012,   // aim drifts up a touch each round (recoil)
      spread: 0.018,       // tight base scatter
      range: 2400,
      blastRadius: 0,
      blastDamage: 0,
      affectedByWind: false,
      knockback: 40,
    },
    {
      id: "railgun",
      name: "Railgun",
      tier: "rifle",
      icon: { sheet: "era_railgun", x: 0, y: 0, w: 66, h: 22 },
      behavior: "beam",    // pierces terrain AND everyone on the line
      damage: 38,          // strong but no longer one-shots (was 75)
      range: 1400,
      channelRadius: 6,    // width of the tunnel it carves
      blastRadius: 26,     // small burst at the end of the beam
      blastDamage: 20,
      affectedByWind: false,
      knockback: 160,
    },
    {
      id: "dynamite",
      name: "Dynamite",
      tier: "classic",
      icon: { sheet: "clockmaster_weapons", x: 0, y: 348, w: 20, h: 26 },
      projIcon: { sheet: "clockmaster_weapons", x: 0, y: 348, w: 20, h: 26 },
      projSpin: true,
      behavior: "thrown_bouncy",
      damage: 30,
      blastRadius: 85,     // the big one
      blastDamage: 62,
      count: 1,
      fuseSeconds: 3.0,
      radius: 5,
      bounciness: 0.3,
      affectedByWind: true,
      knockback: 300,
    },
    {
      id: "airstrike",
      name: "Airstrike",
      tier: "classic",
      icon: { sheet: "clockmaster_weapons", x: 300, y: 2, w: 26, h: 24 },
      projIcon: { sheet: "clockmaster_weapons", x: 192, y: 292, w: 158, h: 23 }, // aerial bomb
      behavior: "airstrike",
      damage: 18,
      blastRadius: 45,
      blastDamage: 30,
      count: 5,            // shells in the carpet
      strikeSpread: 170,   // width of the carpet (px)
      affectedByWind: false,
      knockback: 150,
    },
    {
      id: "mine",
      name: "Land Mine",
      tier: "classic",
      icon: { sheet: "clockmaster_weapons", x: 0, y: 288, w: 20, h: 26 },
      behavior: "place_and_detonate",
      damage: 0,
      blastRadius: 55,
      blastDamage: 52,
      armSeconds: 1.2,     // safe to walk away, then live
      triggerRadius: 26,
      affectedByWind: false,
      knockback: 260,
    },
  ];

  var byId = {};
  list.forEach(function (w) { byId[w.id] = w; });

  G.weapons = {
    list: list,
    byId: byId,
    order: list.map(function (w) { return w.id; }), // selection order for 1..9 / scroll
  };
})(window.IBTW = window.IBTW || {});
