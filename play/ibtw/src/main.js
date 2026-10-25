// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// main.js -- boot, the shared game object, the main loop, and the top-level
// state machine (aiming -> flying -> resolve -> next turn / gameover).

(function (G) {
  "use strict";

  var S = G.settings;

  // ---------------- the shared game object ----------------
  var game = {
    canvas: null, ctx: null,
    terrain: null, camera: null,
    teams: [], humans: [],
    projectiles: [], particles: [], muzzles: [], tracers: [], explosions: [],
    mines: [],
    teamCursor: [0, 0],
    activeTeam: 0, active: null,
    wind: 0, turnTimer: 0,
    power: 0, charging: false,
    phase: "loading", winner: null,
    resolveTimer: 0,
    burst: null,        // active full-auto burst, or null
    selectedWeaponId: G.weapons.order[0],
    selectedWeapon: G.weapons.byId[G.weapons.order[0]],
  };
  G.game = game;

  // ---------------- fx spawners (kept here so entities stay simple) ----------------
  game.spawnExplosion = function (x, y, r) {
    // animated fireball/flash/shockwave (drawn by the renderer)
    this.explosions.push({ x: x, y: y, r: r, age: 0, maxAge: 0.55 });
    var n = Math.max(8, Math.floor(r * 0.5));
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = Math.random() * r * 2;
      var smoke = Math.random() > 0.4;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40,
        life: 0.5 + Math.random() * 0.7, maxLife: 1.2,
        size: smoke ? 3 + Math.random() * 4 : 2 + Math.random() * 2,
        color: smoke ? "rgba(90,80,70,0.9)"
                     : (Math.random() > 0.5 ? "#ffcf3f" : "#ff7a3f"),
        grow: smoke,
      });
    }
  };
  game.spawnSpark = function (x, y) {
    for (var i = 0; i < 6; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 140;
      this.particles.push({
        x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 0.25 + Math.random() * 0.2, maxLife: 0.45,
        size: 1.5 + Math.random() * 1.5, color: "#ffe27a", grow: false,
      });
    }
  };
  // falling dirt chunks from crumbled terrain (points come from terrain.settle)
  game.spawnDebris = function (pts) {
    for (var i = 0; i < pts.length; i++) {
      this.particles.push({
        x: pts[i].x, y: pts[i].y,
        vx: (Math.random() - 0.5) * 70,
        vy: -30 - Math.random() * 70,
        life: 0.6 + Math.random() * 0.5, maxLife: 1.1,
        size: 2 + Math.random() * 2.5,
        color: Math.random() > 0.5 ? "#6b4a30" : "#54381f",
        grow: false,
      });
    }
  };
  // leaves + splinters when a tree/bush is destroyed
  game.spawnFoliage = function (wrecked) {
    for (var i = 0; i < wrecked.length; i++) {
      var w = wrecked[i];
      var n = w.kind === "tree" ? 16 : w.kind === "bush" ? 10 : 5;
      for (var k = 0; k < n; k++) {
        var ang = Math.random() * Math.PI * 2;
        var sp = 40 + Math.random() * 130;
        this.particles.push({
          x: w.x + (Math.random() - 0.5) * 14, y: w.y + (Math.random() - 0.5) * 20,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40,
          life: 0.5 + Math.random() * 0.6, maxLife: 1.1,
          size: 2 + Math.random() * 2,
          color: Math.random() > 0.35 ? "#4f7a33" : "#6b4a2a", // leaves + splinters
          grow: false,
        });
      }
    }
  };
  game.spawnMuzzle = function (x, y, ang) {
    this.muzzles.push({ x: x, y: y, ang: ang, life: 0.09, maxLife: 0.09 });
  };
  game.addTracer = function (x1, y1, x2, y2) {
    this.tracers.push({ x1: x1, y1: y1, x2: x2, y2: y2, life: 0.14, maxLife: 0.14 });
  };

  // ---------------- setup / restart ----------------
  function setupMatch() {
    game.terrain = new G.Terrain(S.world.width, S.world.height);
    game.terrain.generate();
    game.camera = new G.Camera();

    game.teams = [];
    game.humans = [];
    game.teamCursor = [0, 0];
    game.projectiles = []; game.particles = []; game.muzzles = []; game.tracers = [];
    game.explosions = []; game.mines = []; game.burst = null;

    // spread soldiers: team 0 on the left, team 1 on the right
    var slots0 = [0.10, 0.18, 0.26];
    var slots1 = [0.74, 0.82, 0.90];
    for (var t = 0; t < 2; t++) {
      var cfg = S.teams[t];
      var team = { name: cfg.name, color: cfg.color, members: [] };
      var slots = t === 0 ? slots0 : slots1;
      for (var i = 0; i < S.humansPerTeam; i++) {
        var x = Math.floor(S.world.width * slots[i % slots.length]);
        var surf = game.terrain.surfaceY(x, 0);
        if (surf === null) surf = S.world.height * 0.5;
        var h = new G.Human(t, i, x, surf, cfg.name.split(" ")[0] + " " + (i + 1));
        team.members.push(h);
        game.humans.push(h);
      }
      game.teams.push(team);
    }

    selectWeapon(0);
    game.winner = null;
    G.Turns.startFirst(game);
    game.camera.snap(game.active.x, game.active.y - 40);
  }

  function selectWeapon(index) {
    var order = G.weapons.order;
    index = ((index % order.length) + order.length) % order.length;
    game.selectedWeaponId = order[index];
    game.selectedWeapon = G.weapons.byId[game.selectedWeaponId];
  }
  function currentWeaponIndex() {
    return G.weapons.order.indexOf(game.selectedWeaponId);
  }

  // ---------------- firing / detonation ----------------
  function fireActive() {
    // thrown weapons get a visible wind-up/throw animation
    if (game.selectedWeapon.behavior === "thrown_bouncy") {
      game.active.throwTimer = G.animations.frames.throw.length / G.animations.fps.throw + 0.1;
    }
    var res = G.Firing.fire(game, game.selectedWeapon, game.active, game.active.aimAngle, game.power);
    game.camera.recenter(); // follow the shot even if the player was free-looking
    game.charging = false;
    game.power = 0;
    if (res.flying) {
      game.phase = "flying";
    } else {
      game.phase = "resolve";
      game.resolveTimer = S.resolveDelay;
    }
  }

  // full-auto burst: queue rounds to fire one at a time (see updateBurst)
  game.startBurst = function (weapon, shooter, aim) {
    this.burst = {
      weapon: weapon, shooter: shooter,
      aim: aim, climb: 0,
      remaining: weapon.burstCount,
      timer: 0,
    };
  };

  function updateBurst(dt) {
    var b = game.burst;
    if (!b) return;
    b.timer -= dt;
    if (b.timer <= 0 && b.remaining > 0) {
      // recoil climb tilts the muzzle "up" regardless of facing
      var up = -Math.sign(Math.cos(b.aim)) * b.climb;
      G.Firing.fireBurstRound(game, b.weapon, b.shooter, b.aim + up);
      b.remaining--;
      b.climb += b.weapon.burstClimb || 0;
      b.timer = b.weapon.burstInterval || 0.07;
    }
    if (b.remaining <= 0) game.burst = null;
  }

  function detonate(p, x, y) {
    var w = p.weapon;
    if (w.blastRadius > 0) {
      G.Damage.blast(game, x, y, w.blastRadius, w.blastDamage, w.knockback);
    } else {
      game.terrain.explodeAt(x, y, 5);
      game.spawnSpark(x, y);
    }
    // cluster: spawn bomblets on the first (non-child) detonation
    if (w.cluster && !p.isChild) spawnCluster(w, x, y);
    p.dead = true;
  }

  function spawnCluster(parent, x, y) {
    var c = parent.cluster;
    var childWeapon = {
      behavior: "thrown_bouncy",
      blastRadius: c.childBlastRadius, blastDamage: c.childBlastDamage,
      damage: c.childBlastDamage, knockback: 140, radius: 3,
      affectedByWind: true, bounciness: 0.2,
    };
    for (var i = 0; i < c.count; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      var sp = c.spread * (0.5 + Math.random());
      game.projectiles.push(new G.Projectile({
        x: x, y: y - 4,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        radius: 3, affectedByWind: true, weapon: childWeapon,
        owner: game.active, fuse: 0.9 + Math.random() * 0.5,
        bounciness: 0.2, isChild: true,
      }));
    }
  }

  // ---------------- update: state machine ----------------
  function update(dt) {
    G.Input.pollGamepads(); // gamepad intents must be fresh before anything reads input
    applyCameraInput();
    game.camera.update(dt);
    updateFx(dt);
    updateMines(dt);

    // gravity + landing (all humans, so knockback/falls resolve everywhere)
    for (var i = 0; i < game.humans.length; i++) {
      var h = game.humans[i];
      if (h.throwTimer > 0) h.throwTimer -= dt;
      if (!h.alive) {
        h.deathTimer += dt; // drives the death animation
        // dead markers still fall until they rest on ground (no floating graves)
        if (h.y < S.waterY && !game.terrain.isSolid(h.x, h.y)) {
          h.vy += S.gravity * dt;
          h.y += h.vy * dt;
          var surf = game.terrain.surfaceY(h.x, h.y - 4);
          if (surf !== null && h.y >= surf) { h.y = surf; h.vy = 0; }
        } else h.vy = 0;
        continue;
      }
      var impact = G.Physics.updateHuman(h, game.terrain, dt);
      if (impact > S.human.maxFallSafe && h.alive) {
        h.hurt((impact - S.human.maxFallSafe) * S.human.fallDamageScale);
      }
    }

    switch (game.phase) {
      case "aiming":  updateAiming(dt); break;
      case "flying":  updateFlying(dt); break;
      case "resolve":
        game.resolveTimer -= dt;
        if (game.resolveTimer <= 0) G.Turns.next(game);
        break;
      case "gameover":
        if (G.Input.restartPressed) setupMatch();
        break;
    }

    G.Input.endFrame();
  }

  // zoom / pan / recenter work in every phase (watch a shot land, survey the map)
  function applyCameraInput() {
    if (G.Input.zoomDelta) game.camera.zoomBy(G.Input.zoomDelta);
    if (G.Input.panDX || G.Input.panDY) game.camera.pan(G.Input.panDX, G.Input.panDY);
    if (G.Input.recenterPressed) game.camera.recenter();
  }

  function updateAiming(dt) {
    var h = game.active;
    if (!h || !h.alive) { endTurnSoon(); return; }

    // weapon selection (number keys beyond the arsenal do nothing; scroll wraps)
    if (G.Input.weaponPick !== null && G.Input.weaponPick < G.weapons.order.length) {
      selectWeapon(G.Input.weaponPick);
    }
    if (G.Input.weaponScroll) selectWeapon(currentWeaponIndex() + G.Input.weaponScroll);

    // aim: right stick if it acted last, otherwise the mouse
    if (G.Input.aimMode === "pad") {
      h.aimAngle = G.Input.padAimAngle;
    } else {
      var mw = game.camera.screenToWorld(G.Input.mouse.x, G.Input.mouse.y);
      var hp = h.handPos();
      h.aimAngle = Math.atan2(mw.y - hp.y, mw.x - hp.x);
    }
    h.facing = Math.cos(h.aimAngle) >= 0 ? 1 : -1;

    // walk + jump
    var dir = G.Input.walkDir();
    if (dir !== 0) { G.Physics.walkHuman(h, dir, game.terrain, dt); h.moving = true; h.walkPhase += dt * 12; }
    else h.moving = false;
    if (G.Input.jumpPressed) G.Physics.jumpHuman(h);

    // charge power while the fire input (mouse button or trigger) is held
    if (G.Input.firePressed) game.charging = true;
    if (game.charging && G.Input.fireHeld()) {
      game.power = Math.min(1, game.power + S.powerChargeRate * dt);
    }
    if (G.Input.fireReleased && game.charging) {
      if (game.power >= 0.05) fireActive();
      else { game.charging = false; game.power = 0; } // tiny tap = cancel, don't waste the turn
    }

    // camera follows the soldier; walking snaps the view back from any free-look
    if (dir !== 0) game.camera.recenter();
    game.camera.follow(h.x, h.y - 40);

    // turn timer
    game.turnTimer -= dt;
    if (game.turnTimer <= 0) endTurnSoon();
  }

  function endTurnSoon() {
    game.phase = "resolve";
    game.resolveTimer = S.resolveDelay * 0.5;
  }

  function updateFlying(dt) {
    updateBurst(dt); // tick any full-auto burst in progress

    var live = [];
    for (var i = 0; i < game.projectiles.length; i++) {
      var p = game.projectiles[i];
      if (p.dead) continue;
      p.age += dt;
      if (p.age > 8) { p.dead = true; continue; } // safety fuse against strays
      p.pushTrail();

      // timed fuse (grenades etc.)
      if (p.fuse > 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) { detonate(p, p.x, p.y); continue; }
      }

      var ev = G.Physics.stepProjectile(p, game.terrain, game.humans, game.wind, dt);
      if (ev.type === "terrain") {
        if (p.bounciness > 0) G.Physics.bounce(p, ev.hitAxis, p.bounciness);
        else detonate(p, ev.x, ev.y);
      } else if (ev.type === "human") {
        G.Damage.directHit(game, ev.human, p.weapon.damage, 0, p.x);
        detonate(p, ev.x, ev.y);
      } else if (ev.type === "left") {
        p.dead = true;
      }
      if (!p.dead) live.push(p);
    }
    game.projectiles = live;

    // follow the frontmost projectile
    if (live.length) {
      var last = live[live.length - 1];
      game.camera.follow(last.x, last.y);
    }

    // resolve only once BOTH projectiles and any burst are done
    if (live.length === 0 && !game.burst) {
      game.phase = "resolve";
      game.resolveTimer = S.resolveDelay;
    }
  }

  // mines persist across turns: fall to rest, arm, then trigger on proximity
  function updateMines(dt) {
    var kept = [];
    for (var i = 0; i < game.mines.length; i++) {
      var m = game.mines[i];

      // settle onto the ground (and fall again if the ground under it is blown away)
      if (m.landed && !game.terrain.isSolid(m.x, m.y + 2)) m.landed = false;
      if (!m.landed) {
        m.vy += S.gravity * dt;
        m.y += m.vy * dt;
        var surf = game.terrain.surfaceY(m.x, m.y - 6);
        if (surf !== null && m.y >= surf) { m.y = surf; m.vy = 0; m.landed = true; }
        if (m.y > S.waterY) continue; // drowned mine is gone
      }

      // arm countdown, then blink + proximity trigger
      if (m.arm > 0) {
        m.arm -= dt;
      } else {
        m.blink += dt;
        var triggered = false;
        for (var h = 0; h < game.humans.length; h++) {
          var hu = game.humans[h];
          if (!hu.alive) continue;
          var dx = hu.x - m.x, dy = (hu.y - S.human.h * 0.5) - m.y;
          var tr = m.weapon.triggerRadius || 26;
          if (dx * dx + dy * dy <= tr * tr) { triggered = true; break; }
        }
        if (triggered) {
          G.Damage.blast(game, m.x, m.y - 2, m.weapon.blastRadius, m.weapon.blastDamage, m.weapon.knockback);
          continue; // mine consumed
        }
      }
      kept.push(m);
    }
    game.mines = kept;
  }

  function updateFx(dt) {
    var kept = [];
    for (var i = 0; i < game.particles.length; i++) {
      var pt = game.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.94; pt.vy = pt.vy * 0.94 + (pt.grow ? -30 : 260) * dt;
      if (pt.life > 0) kept.push(pt);
    }
    game.particles = kept;
    game.muzzles = decay(game.muzzles, dt);
    game.tracers = decay(game.tracers, dt);
    var ex = [];
    for (var e = 0; e < game.explosions.length; e++) {
      var xp = game.explosions[e];
      xp.age += dt;
      if (xp.age < xp.maxAge) ex.push(xp);
    }
    game.explosions = ex;
  }
  function decay(arr, dt) {
    var out = [];
    for (var i = 0; i < arr.length; i++) { arr[i].life -= dt; if (arr[i].life > 0) out.push(arr[i]); }
    return out;
  }

  // ---------------- boot + main loop ----------------
  var lastT = 0;
  function frame(now) {
    var dt = lastT ? (now - lastT) / 1000 : 0.016;
    lastT = now;
    if (dt > 0.033) dt = 0.033; // clamp (tab switches / hitches)
    if (game.phase !== "loading") {
      update(dt);
      G.Renderer.draw(game);
    }
    requestAnimationFrame(frame);
  }

  function boot() {
    game.canvas = document.getElementById("game");
    game.ctx = game.canvas.getContext("2d");
    game.ctx.imageSmoothingEnabled = false;
    G.Input.init(game.canvas);

    var bar = document.querySelector("#bar > div");
    G.Assets.loadAll(function (p) { if (bar) bar.style.width = Math.round(p * 100) + "%"; })
      .then(function () {
        setupMatch();
        var overlay = document.getElementById("loading");
        if (overlay) { overlay.style.opacity = "0"; setTimeout(function () { overlay.remove(); }, 400); }
        requestAnimationFrame(frame);
      });
  }

  // Boot no matter when this script runs relative to the page's load event.
  // (Waiting only for "load" can hang forever if that event already fired.)
  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot);
  }
})(window.IBTW = window.IBTW || {});
