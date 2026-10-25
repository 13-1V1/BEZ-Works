// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// firing.js -- reads a weapon's DATA and makes it happen. Dispatches on
// `behavior`. Adding a weapon almost never touches this file; adding a NEW
// behavior means adding one small case here.
//
// fire(...) returns { flying: bool } -- true if a projectile is now airborne
// (main waits for it to resolve), false if the shot resolved instantly.

(function (G) {
  "use strict";

  var S = G.settings;

  function barrelTip(shooter, aim) {
    var hp = shooter.handPos();
    var len = 30;
    return { x: hp.x + Math.cos(aim) * len, y: hp.y + Math.sin(aim) * len };
  }

  function fire(game, weapon, shooter, aim, power) {
    var speed = power * S.powerMax;
    var tip = barrelTip(shooter, aim);
    game.spawnMuzzle(tip.x, tip.y, aim);

    switch (weapon.behavior) {
      case "projectile_arc":
        spawnArc(game, weapon, shooter, aim, speed, tip, /*fuse*/ 0);
        return { flying: true };

      case "thrown_bouncy":
        spawnArc(game, weapon, shooter, aim, speed, tip, weapon.fuseSeconds || 0);
        return { flying: true };

      case "hitscan": {
        if (weapon.burstCount) {
          // full-auto: rounds fire one at a time over the burst (see updateBurst)
          game.startBurst(weapon, shooter, aim);
          return { flying: true };
        }
        // shotgun / single rifle: whole spread fires AT ONCE
        var rays = weapon.count || 1;
        for (var ri = 0; ri < rays; ri++) {
          var jitter = rays > 1 ? (Math.random() - 0.5) * 2 * (weapon.spread || 0) : 0;
          doHitscan(game, weapon, shooter, aim + jitter, tip);
        }
        return { flying: false };
      }

      case "beam":
        doBeam(game, weapon, shooter, aim, tip);
        return { flying: false };

      case "airstrike":
        doAirstrike(game, weapon, shooter, aim, power);
        return { flying: true };

      case "place_and_detonate":
        placeMine(game, weapon, shooter);
        return { flying: false };

      default:
        // behaviors for later phases (self_effect/special)
        console.warn("[firing] behavior '" + weapon.behavior + "' not implemented yet");
        return { flying: false };
    }
  }

  // launch `count` projectiles (with optional angular spread) that obey gravity+wind
  function spawnArc(game, weapon, shooter, aim, speed, tip, fuse) {
    var count = weapon.count || 1;
    var spread = weapon.spread || 0;
    for (var i = 0; i < count; i++) {
      var a = aim + (count > 1 ? (i - (count - 1) / 2) * spread : 0);
      var p = new G.Projectile({
        x: tip.x, y: tip.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        radius: weapon.radius || 4,
        affectedByWind: weapon.affectedByWind,
        weapon: weapon,
        owner: shooter,
        fuse: fuse,
        bounciness: weapon.bounciness || 0,
      });
      game.projectiles.push(p);
    }
  }

  // instant ray: march from the barrel until it hits a human or terrain
  function doHitscan(game, weapon, shooter, aim, tip) {
    var range = weapon.range || 2500;
    var dx = Math.cos(aim), dy = Math.sin(aim);
    var stepLen = 3;
    var hitX = tip.x + dx * range, hitY = tip.y + dy * range;
    var struckHuman = null;

    for (var d = 0; d < range; d += stepLen) {
      var x = tip.x + dx * d, y = tip.y + dy * d;
      // human?
      for (var i = 0; i < game.humans.length; i++) {
        var h = game.humans[i];
        if (!h.alive || h === shooter) continue;
        var cx = h.x, cy = h.y - S.human.h * 0.5;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= (S.human.w * 0.6) * (S.human.w * 0.6)) {
          struckHuman = h; hitX = x; hitY = y; d = range; break;
        }
      }
      if (struckHuman) break;
      if (game.terrain.isSolid(x, y)) { hitX = x; hitY = y; break; }
    }

    game.addTracer(tip.x, tip.y, hitX, hitY);
    if (struckHuman) {
      G.Damage.directHit(game, struckHuman, weapon.damage, weapon.knockback, tip.x);
    } else if (weapon.blastRadius > 0) {
      G.Damage.blast(game, hitX, hitY, weapon.blastRadius, weapon.blastDamage, weapon.knockback);
    } else {
      // bullets still chip a tiny bit of terrain where they land
      game.terrain.explodeAt(hitX, hitY, 4);
      game.spawnSpark(hitX, hitY);
    }
    game.camera.addShake(4);
  }

  // RAILGUN-style beam: pierces terrain and hits EVERY human along the line.
  // Carves a thin channel through the ground and pops a small burst at the end.
  function doBeam(game, weapon, shooter, aim, tip) {
    var range = weapon.range || 1400;
    var dx = Math.cos(aim), dy = Math.sin(aim);
    var chR = weapon.channelRadius || 6;
    var struck = [];

    for (var d = 0; d < range; d += 8) {
      var x = tip.x + dx * d, y = tip.y + dy * d;
      if (x < 0 || x > S.world.width || y < 0 || y > S.world.height) { range = d; break; }
      // carve the channel (small radius = no rim circles, just a clean tunnel)
      game.terrain.explodeAt(x, y, chR);
      // pierce humans -- each only once
      for (var i = 0; i < game.humans.length; i++) {
        var h = game.humans[i];
        if (!h.alive || h === shooter || struck.indexOf(h) >= 0) continue;
        var cx = h.x, cy = h.y - S.human.h * 0.5;
        var rr = S.human.w * 0.65;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rr * rr) {
          struck.push(h);
          G.Damage.directHit(game, h, weapon.damage, weapon.knockback, tip.x);
        }
      }
    }

    var ex = tip.x + dx * range, ey = tip.y + dy * range;
    // settle once along the middle + end so the channel edges crumble
    game.spawnDebris(game.terrain.settle((tip.x + ex) / 2, (tip.y + ey) / 2, range / 2 + 20));
    if (weapon.blastRadius > 0) {
      G.Damage.blast(game, ex, ey, weapon.blastRadius, weapon.blastDamage, weapon.knockback);
    }
    game.addTracer(tip.x, tip.y, ex, ey);
    game.camera.addShake(9);
  }

  // AIRSTRIKE: shells rain from above. Target distance is set by charge power,
  // direction by aim -- so it works identically with mouse or controller.
  function doAirstrike(game, weapon, shooter, aim, power) {
    var dir = Math.cos(aim) >= 0 ? 1 : -1;
    var targetX = shooter.x + dir * (220 + power * 1100);
    targetX = Math.max(60, Math.min(S.world.width - 60, targetX));
    var count = weapon.count || 5;
    var spreadW = weapon.strikeSpread || 170;

    for (var i = 0; i < count; i++) {
      var sx = targetX - spreadW / 2 + (spreadW / (count - 1)) * i;
      game.projectiles.push(new G.Projectile({
        x: sx, y: -30 - i * 26,       // staggered heights = rolling impacts
        vx: 0, vy: 260,
        radius: 4,
        affectedByWind: weapon.affectedByWind,
        weapon: weapon,
        owner: shooter,
        fuse: 0,
        bounciness: 0,
      }));
    }
  }

  // LAND MINE: dropped at the shooter's feet, arms after a delay, then blows
  // when anyone comes near. Lives in game.mines (updated every frame).
  function placeMine(game, weapon, shooter) {
    game.mines.push({
      x: shooter.x + shooter.facing * 16,
      y: shooter.y - 4,
      vy: 0,
      landed: false,
      arm: weapon.armSeconds || 1.2,
      blink: 0,
      weapon: weapon,
      owner: shooter,
    });
  }

  // fire a single automatic round (used by main.js's burst ticker)
  function fireBurstRound(game, weapon, shooter, aim) {
    var tip = barrelTip(shooter, aim);
    game.spawnMuzzle(tip.x, tip.y, aim);
    var jitter = (Math.random() - 0.5) * 2 * (weapon.spread || 0);
    doHitscan(game, weapon, shooter, aim + jitter, tip);
  }

  G.Firing = { fire: fire, fireBurstRound: fireBurstRound };
})(window.IBTW = window.IBTW || {});
