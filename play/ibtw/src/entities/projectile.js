// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// projectile.js -- a flying thing. Holds motion + which weapon spawned it.
// The actual stepping/collision lives in physics.js; game rules (detonate/bounce)
// live in main.js so this stays a plain data entity.

(function (G) {
  "use strict";

  function Projectile(opts) {
    this.x = opts.x; this.y = opts.y;
    this.vx = opts.vx; this.vy = opts.vy;
    this.radius = opts.radius || 4;
    this.affectedByWind = opts.affectedByWind !== false;
    this.weapon = opts.weapon;      // source weapon data
    this.owner = opts.owner;        // Human who fired (immune to direct self-hit)
    this.fuse = opts.fuse || 0;     // seconds until timed detonation (0 = none)
    this.bounciness = opts.bounciness || 0;
    this.isChild = !!opts.isChild;  // spawned by a cluster
    this.dead = false;
    this.age = 0;
    this.trail = [];                // recent positions for a motion streak
  }

  Projectile.prototype.pushTrail = function () {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.shift();
  };

  // draw in screen space (caller offsets by camera)
  Projectile.prototype.draw = function (ctx, sx, sy) {
    // trail streak
    ctx.strokeStyle = "rgba(255,210,120,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < this.trail.length; i++) {
      var t = this.trail[i];
      var tx = sx + (t.x - this.x), ty = sy + (t.y - this.y);
      if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
    }
    ctx.lineTo(sx, sy);
    ctx.stroke();

    var w = this.weapon;
    // grenades tumble; rockets/shells align to their velocity
    var ang = (w && w.projSpin) ? this.age * 9 : Math.atan2(this.vy, this.vx);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);

    var ic = w && w.projIcon;
    var img = ic && G.Assets.get(ic.sheet);
    if (img) {
      // real weapon-sheet art, normalized (+50% bigger than before)
      var len = (w && w.projSpin) ? 15 : 27;
      var s = len / ic.w;
      var pw = ic.w * s, ph = ic.h * s;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, ic.x, ic.y, ic.w, ic.h, -pw / 2, -ph / 2, pw, ph);
      // rocket exhaust flicker behind arcing shots (not tumbling grenades)
      if (!(w && w.projSpin)) {
        ctx.fillStyle = Math.random() > 0.5 ? "#ffcf3f" : "#ff8a3f";
        ctx.beginPath();
        ctx.moveTo(-pw / 2, -2);
        ctx.lineTo(-pw / 2 - 6 - Math.random() * 3, 0);
        ctx.lineTo(-pw / 2, 2);
        ctx.closePath(); ctx.fill();
      }
    } else {
      // fallback: little vector shell
      ctx.fillStyle = "#d8d8dc";
      G.roundRect(ctx, -7, -3, 12, 6, 2); ctx.fill();
      ctx.fillStyle = "#e0533a";
      ctx.beginPath();
      ctx.moveTo(5, -3); ctx.lineTo(10, 0); ctx.lineTo(5, 3); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  G.Projectile = Projectile;
})(window.IBTW = window.IBTW || {});
