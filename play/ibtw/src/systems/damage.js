// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// damage.js -- applies hits. Explosions crater the terrain AND damage every
// human in range (falloff with distance) with a little knockback + screen shake.

(function (G) {
  "use strict";

  var S = G.settings;

  // area explosion at (x,y)
  function blast(game, x, y, radius, maxDamage, knockback) {
    if (radius > 0) {
      game.terrain.explodeAt(x, y, radius);
      // settle pass: shave jagged edges + break off floating chunks -> debris
      var debris = game.terrain.settle(x, y, Math.max(30, radius * 1.8));
      game.spawnDebris(debris);
      // blow up any trees/bushes/grass caught in the blast
      game.spawnFoliage(game.terrain.blastDecorations(x, y, radius));
      game.spawnExplosion(x, y, radius);
      game.camera.addShake(Math.min(S.camera.maxShake, radius * 0.16));
    }

    for (var i = 0; i < game.humans.length; i++) {
      var h = game.humans[i];
      if (!h.alive) continue;
      var cx = h.x, cy = h.y - S.human.h * 0.5;
      var d = Math.hypot(cx - x, cy - y);
      if (d > radius) continue;

      var falloff = 1 - d / radius;              // 1 at center -> 0 at edge
      var dmg = maxDamage * falloff * S.damageScale;
      h.hurt(dmg);

      // knockback: pop up + shove away from the blast (fun, optional)
      if (knockback && h.alive) {
        var dir = (cx - x) >= 0 ? 1 : -1;
        h.vy = -Math.abs(knockback) * (0.4 + falloff * 0.6);
        h.onGround = false;
        var shove = dir * knockback * falloff * 0.06;
        h.x = Math.max(2, Math.min(S.world.width - 3, h.x + shove));
      }
    }
  }

  // instant point hit (bullets / direct rifle rounds)
  function directHit(game, human, damage, knockback, fromX) {
    human.hurt(damage * S.damageScale);
    game.spawnSpark(human.x, human.y - S.human.h * 0.5);
    if (knockback && human.alive) {
      var dir = (human.x - fromX) >= 0 ? 1 : -1;
      human.vy = -Math.abs(knockback) * 0.5;
      human.onGround = false;
      human.x = Math.max(2, Math.min(S.world.width - 3, human.x + dir * knockback * 0.05));
    }
  }

  G.Damage = { blast: blast, directHit: directHit };
})(window.IBTW = window.IBTW || {});
