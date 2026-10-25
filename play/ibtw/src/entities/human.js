// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// human.js -- one soldier. Position is FEET-anchored (x = center, y = ground).
// Rendering: a clean, readable vector soldier (team-colored) so Phase 1 is fun
// to look at. The real Soldier.png sheet is loaded and animations.js holds frame
// rects, so the art can be swapped in later without changing this entity's logic.

(function (G) {
  "use strict";

  var S = G.settings;

  function Human(team, teamIndex, x, y, name) {
    this.team = team;               // team index (0/1)
    this.teamIndex = teamIndex;     // which soldier on the team
    this.name = name || ("Soldier " + (teamIndex + 1));
    this.x = x; this.y = y;
    this.vy = 0;
    this.hp = S.human.startHp;
    this.alive = true;
    this.onGround = false;
    this.facing = team === 0 ? 1 : -1;
    this.aimAngle = team === 0 ? -0.5 : (Math.PI + 0.5); // radians, points where the gun looks
    this.walkPhase = 0;             // for a subtle leg-swing while walking
    this.moving = false;
    this.deathTimer = 0;            // time since death (drives the death anim)
    this.throwTimer = 0;            // >0 while a throw animation plays
  }

  var col = S.teams;

  // hand/barrel anchor in world space (where the weapon pivots from)
  Human.prototype.handPos = function () {
    var hm = S.human;
    return { x: this.x + this.facing * 3, y: this.y - hm.h * 0.55 };
  };

  Human.prototype.hurt = function (amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  };

  Human.prototype.die = function () {
    if (!this.alive) return;
    this.alive = false;
    this.deathTimer = 0;
  };

  Human.prototype.drown = function () {
    if (!this.alive) return;
    this.hp = 0;
    this.alive = false;
  };

  // pick which animation + frame this soldier should show right now
  Human.prototype._currentFrame = function (isActive) {
    var A = G.animations;
    var name, idx;
    if (this.throwTimer > 0 && A.frames.throw) {
      // play the throw once over its duration (held frames -> release)
      name = "throw";
      var dur = A.frames.throw.length / A.fps.throw;
      idx = Math.min(A.frames.throw.length - 1,
                     Math.floor((dur - this.throwTimer) * A.fps.throw));
      if (idx < 0) idx = 0;
      return A.frames.throw[idx];
    }
    if (!this.onGround) {
      name = "jump";
      idx = this.vy < -60 ? 0 : this.vy < 120 ? 1 : 2; // rising / apex / falling
    } else if (this.moving) {
      name = "walk";
      idx = Math.floor(this.walkPhase * A.fps.walk / 12) % A.frames.walk.length;
    } else if (isActive) {
      name = "aim";
      idx = 0;
    } else {
      name = "idle";
      idx = Math.floor(performance.now() / 1000 * A.fps.idle + this.teamIndex) % A.frames.idle.length;
    }
    return A.frames[name][idx] || A.frames.idle[0];
  };

  // --- soldier drawing (screen-space; caller already offset by camera) ---
  // Uses the real sprite frames from soldier_clean.png; falls back to a simple
  // vector figure only if that sheet failed to load.
  Human.prototype.draw = function (ctx, sx, sy, isActive, heldWeapon) {
    var hm = S.human;
    var teamColor = col[this.team].color;

    var A = G.animations;
    var sheet = A.useSheet ? G.Assets.get(A.sheet) : null;

    if (!this.alive) { this._drawDead(ctx, sx, sy, teamColor, sheet); return; }

    ctx.save();
    ctx.translate(sx, sy); // origin at feet

    // active-turn marker: bobbing arrow above the head
    if (isActive) {
      var bob = Math.sin(performance.now() / 220) * 3;
      ctx.fillStyle = "#ffe14d";
      ctx.beginPath();
      ctx.moveTo(0, -hm.h - 20 + bob);
      ctx.lineTo(-6, -hm.h - 30 + bob);
      ctx.lineTo(6, -hm.h - 30 + bob);
      ctx.closePath();
      ctx.fill();
    }

    // ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sheet) {
      var fr = this._currentFrame(isActive);
      var s = A.scale;
      var dw = fr.w * s, dh = fr.h * s;
      ctx.save();
      if (this.facing < 0) ctx.scale(-1, 1); // sheet faces right; mirror for left
      ctx.imageSmoothingEnabled = false;     // keep it pixel-crisp
      ctx.drawImage(sheet, fr.x, fr.y, fr.w, fr.h, -dw / 2, -dh, dw, dh);
      ctx.restore();

      // small team-color chevron on the chest so squads read at a glance
      ctx.fillStyle = teamColor;
      roundRect(ctx, this.facing * 2 - 3, -dh * 0.62, 6, 5, 1.5); ctx.fill();
    } else {
      drawVectorBody(ctx, this, hm, teamColor);
    }

    // held weapon sprite, rotated to the aim angle
    this._drawWeapon(ctx, hm, heldWeapon);

    ctx.restore();

    // health bar floats above (drawn unrotated, in screen space)
    drawHealthBar(ctx, sx, sy - hm.h - 12, this.hp / (S.human.startHp || 100), teamColor);
  };

  Human.prototype._drawWeapon = function (ctx, hm, heldWeapon) {
    // pivot at the shoulder/hands
    var ha = { x: this.facing * 3, y: -hm.h * 0.55 };
    var a = this.aimAngle;
    ctx.save();
    ctx.translate(ha.x, ha.y);
    ctx.rotate(a);
    // when aiming left the rotation passes 90deg -- flip vertically so the gun
    // isn't upside-down (standard side-scroller trick)
    if (Math.cos(a) < 0) ctx.scale(1, -1);

    // held gun: the weapon's own icon if it has one, else the ERA rifle sprite
    var img = null, ic = null;
    if (heldWeapon && heldWeapon.icon && G.Assets.has(heldWeapon.icon.sheet)) {
      img = G.Assets.get(heldWeapon.icon.sheet); ic = heldWeapon.icon;
    } else if (G.Assets.has("era_primary")) {
      img = G.Assets.get("era_primary");
      ic = { x: 0, y: 0, w: img.width, h: img.height };
    }

    if (img) {
      var gs = 26 / ic.w; // normalize gun length to ~26px on screen
      var gw = ic.w * gs, gh = ic.h * gs;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, ic.x, ic.y, ic.w, ic.h, 2, -gh / 2, gw, gh);
    } else {
      // last-resort vector gun
      ctx.fillStyle = "#2f2f33";
      roundRect(ctx, 4, -4, 26, 8, 2); ctx.fill();
    }
    ctx.restore();
  };

  // death: play the collapse animation once, then hold the prone corpse frame.
  Human.prototype._drawDead = function (ctx, sx, sy, teamColor, sheet) {
    var A = G.animations;
    if (sheet && A.frames.death) {
      var frames = A.frames.death;
      var idx = Math.min(frames.length - 1, Math.floor(this.deathTimer * A.fps.death));
      var fr = frames[idx];
      var s = A.scale;
      var dw = fr.w * s, dh = fr.h * s;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.ellipse(0, 0, dw * 0.45, 3, 0, 0, Math.PI * 2); ctx.fill();
      if (this.facing < 0) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, fr.x, fr.y, fr.w, fr.h, -dw / 2, -dh, dw, dh);
      ctx.restore();
      return;
    }
    drawDead(ctx, sx, sy, teamColor); // vector tombstone fallback
  };

  // vector fallback body (only if the generated sheet is missing)
  function drawVectorBody(ctx, h, hm, teamColor) {
    var f = h.facing;
    var swing = h.moving ? Math.sin(h.walkPhase) * 4 : 0;
    ctx.strokeStyle = "#3a4a2f";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-3, -14); ctx.lineTo(-3 + swing, 0);
    ctx.moveTo(3, -14);  ctx.lineTo(3 - swing, 0);
    ctx.stroke();
    ctx.fillStyle = "#556b3d";
    roundRect(ctx, -8, -hm.h + 8, 16, hm.h - 22, 4); ctx.fill();
    ctx.fillStyle = teamColor;
    roundRect(ctx, -8, -hm.h + 14, 16, 7, 2); ctx.fill();
    ctx.fillStyle = "#d9b98c";
    ctx.beginPath(); ctx.arc(f * 2, -hm.h + 4, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a5a38";
    ctx.beginPath(); ctx.arc(0, -hm.h + 2, 8, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-8, -hm.h + 1, 16, 3);
  }

  function drawHealthBar(ctx, cx, y, ratio, color) {
    var w = 30, h = 5;
    ratio = Math.max(0, Math.min(1, ratio));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, cx - w / 2 - 1, y - 1, w + 2, h + 2, 2); ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? "#5fd35f" : ratio > 0.25 ? "#f0c040" : "#e0533a";
    roundRect(ctx, cx - w / 2, y, w * ratio, h, 2); ctx.fill();
  }

  function drawDead(ctx, sx, sy, teamColor) {
    // a small tombstone-ish marker where the soldier fell
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#3a3f47";
    roundRect(ctx, -7, -18, 14, 18, 6); ctx.fill();
    ctx.fillStyle = teamColor;
    ctx.fillRect(-1.5, -14, 3, 8);
    ctx.fillRect(-5, -11, 10, 3);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  G.Human = Human;
  G.roundRect = roundRect; // shared helper
})(window.IBTW = window.IBTW || {});
