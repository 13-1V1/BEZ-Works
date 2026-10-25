// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// renderer.js -- draw order: sky -> parallax hills -> terrain -> humans ->
// projectiles -> fx -> hud. World coords are converted to screen by subtracting
// the camera's draw offset (scroll + shake).

(function (G) {
  "use strict";

  var S = G.settings;

  function draw(game) {
    var ctx = game.ctx;
    var cam = game.camera;

    // --- background: screen space (parallax responds to camera focus/zoom) ---
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawForest(ctx, game, cam);

    // --- world: everything below is drawn in WORLD coords under the camera
    // transform, so zoom + pan + shake all come for free. Helpers take (0,0)
    // offsets because the transform already maps world -> screen. ---
    ctx.save();
    cam.applyTransform(ctx);

    game.terrain.draw(ctx);
    drawDecorations(ctx, game, 0, 0);

    // water fills the bottom of the world
    ctx.fillStyle = "rgba(60,130,180,0.35)";
    ctx.fillRect(0, S.waterY, S.world.width, S.world.height - S.waterY);

    drawMines(ctx, game, 0, 0);

    for (var i = 0; i < game.humans.length; i++) {
      var h = game.humans[i];
      var isActive = h === game.active && game.phase === "aiming";
      h.draw(ctx, h.x, h.y, isActive, isActive ? game.selectedWeapon : null);
    }

    if (game.phase === "aiming" && game.active && game.active.alive) {
      drawAimGuide(ctx, game, 0, 0);
    }

    for (var p = 0; p < game.projectiles.length; p++) {
      var pr = game.projectiles[p];
      pr.draw(ctx, pr.x, pr.y);
    }

    drawExplosions(ctx, game, 0, 0);
    drawParticles(ctx, game, 0, 0);
    drawMuzzles(ctx, game, 0, 0);
    drawTracers(ctx, game, 0, 0);

    ctx.restore();

    // --- HUD: screen space ---
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    G.HUD.draw(ctx, game);
  }

  // Parallax forest: a stretched sky, then tree layers drawn at a SHARED scale
  // and ground line (so they compose into one image) with per-layer horizontal
  // scroll factors that create depth. Layers tile across the width and wrap.
  function drawForest(ctx, game, cam) {
    var W = S.view.width, H = S.view.height;
    var P = G.scenery && G.scenery.parallax;
    var sky = G.Assets.get("bg_sky");
    var fx = cam.fx, fy = cam.fy;

    // sky base (stretched to fill; drifts slightly with camera height)
    if (sky) {
      ctx.imageSmoothingEnabled = false;
      var syOff = -(fy - S.world.height * 0.5) * 0.03;
      ctx.drawImage(sky, 0, syOff - 20, W, H + 40);
    } else {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#243447"); g.addColorStop(1, "#5b7089");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (!P) return;

    // forest floor line drifts with camera height so it feels attached
    var groundLine = H * 0.82 - (fy - S.world.height * 0.55) * 0.06;
    for (var i = 0; i < P.length; i++) {
      if (P[i].asset === "bg_sky") continue; // already drawn as the base
      var img = G.Assets.get(P[i].asset);
      if (!img) continue;
      var layerH = H * 1.5;
      var scale = layerH / img.height;
      var layerW = img.width * scale;
      var drawY = groundLine - layerH;
      var offX = -(fx * P[i].factor) % layerW;
      if (offX > 0) offX -= layerW;
      ctx.imageSmoothingEnabled = false;
      for (var dx = offX; dx < W; dx += layerW) {
        ctx.drawImage(img, dx, drawY, layerW, layerH);
      }
    }
  }

  // Terrain decorations: anchored bottom-center to the LIVE surface, so they
  // follow the crumbling ground and vanish where it's been destroyed.
  function drawDecorations(ctx, game, ox, oy) {
    var sc = G.scenery;
    var img = sc && G.Assets.get(sc.sheet);
    var decos = game.terrain.decorations;
    if (!img || !decos) return;
    ctx.imageSmoothingEnabled = false;
    for (var i = 0; i < decos.length; i++) {
      var d = decos[i];
      if (d.dead) continue;                        // blown up
      var surf = game.terrain.surfaceY(d.x, 0);
      if (surf === null) continue;                 // ground gone -> decoration gone too
      var fr = sc.frames[d.name];
      var scale = (sc.kinds[d.kind].height * d.jit) / fr.h;
      var dw = fr.w * scale, dh = fr.h * scale;
      ctx.save();
      ctx.translate(d.x + ox, surf + oy + 1);      // ox/oy are 0 (world space)
      if (d.flip) ctx.scale(-1, 1);
      ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, -dw / 2, -dh, dw, dh);
      ctx.restore();
    }
  }

  function drawAimGuide(ctx, game, ox, oy) {
    var h = game.active;
    var hp = h.handPos();
    var a = h.aimAngle;
    var sx = hp.x - ox, sy = hp.y - oy;
    var w = game.selectedWeapon;

    if (w.behavior === "beam") {
      // railgun pierces: show the full ray straight through everything
      var bd = w.range || 1400;
      ctx.save();
      ctx.strokeStyle = "rgba(120,200,255,0.5)";
      ctx.setLineDash([10, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * bd, sy + Math.sin(a) * bd);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (w.behavior === "airstrike") {
      // shells drop from the sky at a distance set by charge power: mark the spot
      var dir = Math.cos(a) >= 0 ? 1 : -1;
      var tx = h.x + dir * (220 + game.power * 1100);
      tx = Math.max(60, Math.min(G.settings.world.width - 60, tx));
      var gy = game.terrain.surfaceY(tx, 0);
      if (gy === null) gy = h.y;
      var mx = tx - ox, my = gy - oy;
      ctx.strokeStyle = "rgba(255,90,80,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx - 8, my - 8); ctx.lineTo(mx + 8, my + 8);
      ctx.moveTo(mx + 8, my - 8); ctx.lineTo(mx - 8, my + 8);
      ctx.stroke();
      // falling arrows above the mark
      ctx.fillStyle = "rgba(255,90,80,0.7)";
      for (var ai = 0; ai < 3; ai++) {
        var ay2 = my - 30 - ai * 16 + (performance.now() / 60 % 16);
        ctx.beginPath();
        ctx.moveTo(mx, ay2); ctx.lineTo(mx - 4, ay2 - 6); ctx.lineTo(mx + 4, ay2 - 6);
        ctx.closePath(); ctx.fill();
      }
      return;
    }

    if (w.behavior === "place_and_detonate") return; // drops at your feet, nothing to aim

    if (w.behavior === "hitscan") {
      // instant weapons fly dead straight: show the true ray up to the first
      // terrain hit (an arc here would lie about where the shot goes)
      var maxD = w.range || 2500;
      var dx = Math.cos(a), dy = Math.sin(a);
      var endD = maxD;
      for (var d = 12; d < maxD; d += 6) {
        if (game.terrain.isSolid(hp.x + dx * d, hp.y + dy * d)) { endD = d; break; }
      }
      ctx.save();
      ctx.strokeStyle = "rgba(255,120,120,0.55)";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dx * endD, sy + dy * endD);
      ctx.stroke();
      ctx.restore();
      // crosshair at the impact point
      var ix = sx + dx * endD, iy = sy + dy * endD;
      ctx.strokeStyle = "rgba(255,120,120,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ix - 5, iy); ctx.lineTo(ix + 5, iy);
      ctx.moveTo(ix, iy - 5); ctx.lineTo(ix, iy + 5);
      ctx.stroke();
      return;
    }

    // arcing weapons: short dotted direction line...
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a) * 70, sy + Math.sin(a) * 70);
    ctx.stroke();
    ctx.restore();
    // ...plus a predicted-trajectory arc while charging (gravity + wind)
    if (game.power > 0.02) drawPredictArc(ctx, game, hp, a, ox, oy);
  }

  // faint sampled trajectory so players can learn the wind
  function drawPredictArc(ctx, game, origin, a, ox, oy) {
    var speed = game.power * S.powerMax;
    var vx = Math.cos(a) * speed, vy = Math.sin(a) * speed;
    var x = origin.x, y = origin.y;
    var wind = game.selectedWeapon.affectedByWind ? game.wind : 0;
    var dt = 0.03;
    ctx.fillStyle = "rgba(255,225,120,0.75)";
    for (var i = 0; i < 40; i++) {
      vy += S.gravity * dt;
      vx += wind * dt;
      x += vx * dt; y += vy * dt;
      if (game.terrain.isSolid(x, y)) break;
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x - ox, y - oy, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawMines(ctx, game, ox, oy) {
    for (var i = 0; i < game.mines.length; i++) {
      var m = game.mines[i];
      var x = m.x - ox, y = m.y - oy;
      // squat dark disc
      ctx.fillStyle = "#23282e";
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a424c";
      ctx.beginPath();
      ctx.ellipse(x, y - 4, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // status light: yellow while arming, blinking red when live
      var live = m.arm <= 0;
      var on = !live || (m.blink % 0.7) < 0.35;
      if (on) {
        ctx.fillStyle = live ? "#ff4b3a" : "#ffd24d";
        ctx.beginPath();
        ctx.arc(x, y - 5, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // flash -> fireball -> shockwave ring, all driven by explosion age (0..maxAge)
  function drawExplosions(ctx, game, ox, oy) {
    for (var i = 0; i < game.explosions.length; i++) {
      var e = game.explosions[i];
      var t = e.age / e.maxAge; // 0..1
      var x = e.x - ox, y = e.y - oy;

      // white-hot flash (first 30%)
      if (t < 0.3) {
        var ft = t / 0.3;
        ctx.globalAlpha = 0.9 * (1 - ft);
        ctx.fillStyle = "#fff7d8";
        ctx.beginPath();
        ctx.arc(x, y, e.r * (0.4 + ft * 1.1), 0, Math.PI * 2);
        ctx.fill();
      }

      // fireball: layered orange-to-red radial gradient, grows and fades
      var fr = e.r * (0.45 + t * 0.75);
      var grad = ctx.createRadialGradient(x, y, fr * 0.1, x, y, fr);
      grad.addColorStop(0, "rgba(255,240,180," + 0.95 * (1 - t) + ")");
      grad.addColorStop(0.45, "rgba(255,150,50," + 0.8 * (1 - t) + ")");
      grad.addColorStop(1, "rgba(160,40,20,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, fr, 0, Math.PI * 2);
      ctx.fill();

      // expanding shockwave ring
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.strokeStyle = "#ffe9c0";
      ctx.lineWidth = Math.max(1, 3 * (1 - t));
      ctx.beginPath();
      ctx.arc(x, y, e.r * (0.6 + t * 1.7), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles(ctx, game, ox, oy) {
    for (var i = 0; i < game.particles.length; i++) {
      var pt = game.particles[i];
      var a = pt.life / pt.maxLife;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x - ox, pt.y - oy, pt.size * (pt.grow ? (1.4 - a) : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMuzzles(ctx, game, ox, oy) {
    var img = G.Assets.get("muzzle_flash");
    for (var i = 0; i < game.muzzles.length; i++) {
      var m = game.muzzles[i];
      var a = m.life / m.maxLife;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(m.x - ox, m.y - oy);
      ctx.rotate(m.ang);
      if (img) {
        // real muzzle flash sprite, scaled up slightly and anchored at the barrel
        var s = 0.7 + (1 - a) * 0.4;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, -img.height * s / 2, img.width * s, img.height * s);
      } else {
        ctx.fillStyle = "#ffe6a0";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(14 * a, -6 * a);
        ctx.lineTo(20 * a, 0);
        ctx.lineTo(14 * a, 6 * a);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawTracers(ctx, game, ox, oy) {
    for (var i = 0; i < game.tracers.length; i++) {
      var t = game.tracers[i];
      ctx.globalAlpha = t.life / t.maxLife;
      ctx.strokeStyle = "#fff6c8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1 - ox, t.y1 - oy);
      ctx.lineTo(t.x2 - ox, t.y2 - oy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  G.Renderer = { draw: draw };
})(window.IBTW = window.IBTW || {});
