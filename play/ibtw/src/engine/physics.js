// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// physics.js -- gravity + wind + movement + collision vs the terrain mask.
// Pure helpers that operate on entities; no rendering, no game rules.

(function (G) {
  "use strict";

  var S = G.settings;

  // ---- humans: gravity + resting on ground; returns land impact speed (0 if none) ----
  function updateHuman(h, terrain, dt) {
    if (!h.alive) return 0;
    var hm = S.human;
    h.vy += S.gravity * dt;
    var newY = h.y + h.vy * dt;

    // scan for ground from just above the highest of old/new feet position
    var scanFrom = Math.min(newY, h.y) - 2;
    var surf = terrain.surfaceY(h.x, scanFrom);

    var impact = 0;
    if (h.vy >= 0 && surf !== null && newY >= surf) {
      // landed
      if (h.vy > 0) impact = h.vy;
      h.y = surf;
      h.vy = 0;
      h.onGround = true;
    } else {
      h.y = newY;
      h.onGround = (h.vy === 0 && surf !== null && Math.abs(surf - h.y) < 2);
    }

    // drowned / fell off the world
    if (h.y >= S.waterY) { h.drown(); }
    return impact;
  }

  // ---- walking with slope climb + wall blocking ----
  function walkHuman(h, dir, terrain, dt) {
    if (!h.alive) return;
    h.facing = dir < 0 ? -1 : 1;
    var hm = S.human;
    var newX = h.x + dir * hm.walkSpeed * dt;
    newX = Math.max(2, Math.min(S.world.width - 3, newX));

    // topmost solid in the climb band at the new column
    var s = terrain.solidTop(newX, h.y - hm.maxStepUp, h.y + hm.maxStepUp + 10);
    if (s === null) {
      // ledge: step off and let gravity handle the fall
      h.x = newX;
      h.onGround = false;
    } else {
      // only step there if the soldier's body wouldn't be buried in a wall
      var headClear = !terrain.isSolid(newX, s - hm.h - 2) &&
                      !terrain.isSolid(newX, s - Math.floor(hm.h / 2));
      if (headClear) {
        h.x = newX;
        h.y = s;
        h.onGround = true;
      } // else: blocked by a wall, don't move
    }
  }

  function jumpHuman(h) {
    if (h.alive && h.onGround) {
      h.vy = -S.human.jumpSpeed;
      h.onGround = false;
    }
  }

  // ---- projectiles: integrate motion, sub-step, and report the first collision ----
  // Returns one of:
  //   { type: "none" }
  //   { type: "terrain", x, y, hitAxis: "x"|"y" }
  //   { type: "human", human, x, y }
  //   { type: "left" }   -- flew off the world
  function stepProjectile(p, terrain, humans, wind, dt) {
    p.vy += S.gravity * dt;
    if (p.affectedByWind) p.vx += wind * dt;

    var speed = Math.hypot(p.vx, p.vy);
    var steps = Math.max(1, Math.ceil((speed * dt) / 3)); // ~3px per sub-step
    var sdt = dt / steps;

    for (var i = 0; i < steps; i++) {
      var px = p.x, py = p.y;
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;

      // off the world?
      if (p.x < 0 || p.x > S.world.width || p.y > S.world.height + 40) {
        return { type: "left" };
      }

      // direct human hit (skip the shooter)
      for (var hI = 0; hI < humans.length; hI++) {
        var h = humans[hI];
        if (!h.alive || h === p.owner) continue;
        var cx = h.x, cy = h.y - S.human.h * 0.5;
        var rr = (p.radius + S.human.w * 0.6);
        if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) <= rr * rr) {
          return { type: "human", human: h, x: p.x, y: p.y };
        }
      }

      // terrain hit? work out which axis we crossed for a clean bounce
      if (terrain.isSolid(p.x, p.y)) {
        var axis = "y";
        if (terrain.isSolid(p.x, py) && !terrain.isSolid(px, p.y)) axis = "x";
        else if (!terrain.isSolid(p.x, py) && terrain.isSolid(px, p.y)) axis = "y";
        // step back to just outside the surface
        p.x = px; p.y = py;
        return { type: "terrain", x: px, y: py, hitAxis: axis };
      }
    }
    return { type: "none" };
  }

  // reflect a projectile off an axis-aligned surface with energy loss
  function bounce(p, axis, bounciness) {
    if (axis === "x") p.vx = -p.vx * bounciness;
    else p.vy = -p.vy * bounciness;
    // dampen the tangential component a touch so it settles
    if (axis === "y") p.vx *= 0.82; else p.vy *= 0.82;
    // nudge out of the surface
    p.x += p.vx * 0.004;
    p.y += p.vy * 0.004;
  }

  G.Physics = {
    updateHuman: updateHuman,
    walkHuman: walkHuman,
    jumpHuman: jumpHuman,
    stepProjectile: stepProjectile,
    bounce: bounce,
  };
})(window.IBTW = window.IBTW || {});
