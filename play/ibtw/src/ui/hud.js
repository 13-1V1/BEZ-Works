// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// hud.js -- readability layer: whose turn, timer, WIND (the game's identity),
// power meter while charging, weapon picker, controls, scores, game-over banner.

(function (G) {
  "use strict";

  var S = G.settings;

  function draw(ctx, game) {
    var W = S.view.width;
    ctx.textBaseline = "top";

    drawTurnBanner(ctx, game, W);
    drawWind(ctx, game, W);
    drawWeapon(ctx, game);
    if (game.charging || game.power > 0) drawPower(ctx, game, W);
    drawControls(ctx);

    if (G.Input.showScores || game.phase === "gameover") drawScores(ctx, game, W);
    if (game.phase === "gameover") drawGameOver(ctx, game, W);
  }

  function drawTurnBanner(ctx, game, W) {
    var team = game.teams[game.activeTeam];
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    G.roundRect(ctx, 12, 12, 230, 40, 8); ctx.fill();
    // team swatch
    ctx.fillStyle = team.color;
    G.roundRect(ctx, 20, 20, 24, 24, 5); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
    ctx.fillText(team.name, 54, 16);
    // timer
    ctx.font = "13px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = game.turnTimer < 6 ? "#ff8a7a" : "#cfe0f0";
    ctx.fillText("Turn: " + Math.ceil(game.turnTimer) + "s", 54, 35);
  }

  // WIND indicator -- big and central; this is what the game is named after.
  function drawWind(ctx, game, W) {
    var cx = W / 2, y = 20;
    var strength = game.wind / S.windMax;   // -1..1
    var mag = Math.abs(strength);

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    G.roundRect(ctx, cx - 90, 12, 180, 46, 8); ctx.fill();

    ctx.fillStyle = "#cfe0f0";
    ctx.font = "bold 12px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WIND", cx, 16);

    // arrow
    var dir = strength >= 0 ? 1 : -1;
    var len = 20 + mag * 46;
    var ay = 40;
    ctx.strokeStyle = mag > 0.66 ? "#ff8a5a" : mag > 0.33 ? "#ffd166" : "#9fe0a0";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - dir * len / 2, ay);
    ctx.lineTo(cx + dir * len / 2, ay);
    ctx.stroke();
    // arrowhead
    var hx = cx + dir * len / 2;
    ctx.beginPath();
    ctx.moveTo(hx, ay);
    ctx.lineTo(hx - dir * 8, ay - 6);
    ctx.lineTo(hx - dir * 8, ay + 6);
    ctx.closePath(); ctx.fill();
    ctx.textAlign = "left";
  }

  function drawWeapon(ctx, game) {
    var w = game.selectedWeapon;
    var boxY = S.view.height - 54;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    G.roundRect(ctx, 12, boxY, 220, 42, 8); ctx.fill();

    // icon slot: crop the weapon's icon rect out of its sheet
    ctx.fillStyle = "#1b2530";
    G.roundRect(ctx, 18, boxY + 6, 34, 30, 5); ctx.fill();
    var ic = w.icon;
    var img = ic && G.Assets.get(ic.sheet);
    if (img) {
      var scale = Math.min(30 / ic.w, 24 / ic.h);
      var iw = ic.w * scale, ih = ic.h * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, ic.x, ic.y, ic.w, ic.h,
                    18 + (34 - iw) / 2, boxY + 6 + (30 - ih) / 2, iw, ih);
    } else {
      ctx.fillStyle = "#4da3ff";
      ctx.fillRect(24, boxY + 16, 22, 8);
    }

    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px 'Trebuchet MS', sans-serif";
    ctx.fillText(w.name, 56, boxY + 6);
    ctx.fillStyle = "#9fb3c8";
    ctx.font = "11px 'Trebuchet MS', sans-serif";
    var idx = G.weapons.order.indexOf(w.id) + 1;
    ctx.fillText("[" + idx + "]  " + w.tier + "  •  Q/E / 1-9", 56, boxY + 25);
  }

  function drawPower(ctx, game, W) {
    var barW = 260, barH = 16;
    var x = W / 2 - barW / 2, y = S.view.height - 40;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    G.roundRect(ctx, x - 4, y - 4, barW + 8, barH + 8, 6); ctx.fill();
    // gradient fill by power
    var grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0, "#63d16b");
    grad.addColorStop(0.6, "#f0c040");
    grad.addColorStop(1, "#e0533a");
    ctx.fillStyle = grad;
    G.roundRect(ctx, x, y, barW * game.power, barH, 4); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    G.roundRect(ctx, x, y, barW, barH, 4); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "11px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(G.Input.aimMode === "pad"
      ? "POWER  (hold RT, release to fire)"
      : "POWER  (hold mouse, release to fire)", W / 2, y - 18);
    ctx.textAlign = "left";
  }

  function drawControls(ctx) {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "11px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "right";
    var hint = G.Input.padConnected
      ? "stick move • A jump • R-stick aim • RT power • LB/RB weapon • d-pad zoom"
      : "A/D move • W/Space jump • wheel zoom • right-drag pan • C recenter • Q/E weapon";
    ctx.fillText(hint, S.view.width - 12, S.view.height - 18);
    ctx.textAlign = "left";
  }

  function drawScores(ctx, game, W) {
    var bx = W / 2 - 150, by = 80, bw = 300;
    var rows = game.teams.length;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    G.roundRect(ctx, bx, by, bw, 30 + rows * 26, 10); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px 'Trebuchet MS', sans-serif";
    ctx.fillText("SQUADS", bx + 14, by + 8);
    for (var t = 0; t < game.teams.length; t++) {
      var team = game.teams[t];
      var y = by + 30 + t * 26;
      ctx.fillStyle = team.color;
      G.roundRect(ctx, bx + 14, y, 14, 14, 3); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "13px 'Trebuchet MS', sans-serif";
      var alive = G.Turns.aliveCount(team);
      var totalHp = 0;
      team.members.forEach(function (m) { totalHp += Math.max(0, m.hp); });
      ctx.fillText(team.name + "   " + alive + "/" + team.members.length + " alive   " + Math.round(totalHp) + " hp", bx + 36, y);
    }
  }

  function drawGameOver(ctx, game, W) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, S.view.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px 'Trebuchet MS', sans-serif";
    var msg = game.winner < 0 ? "DRAW" : game.teams[game.winner].name + " WINS!";
    ctx.fillText(msg, W / 2, S.view.height / 2 - 30);
    ctx.font = "16px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#cfe0f0";
    ctx.fillText("Press R to play again", W / 2, S.view.height / 2 + 20);
    ctx.textAlign = "left";
  }

  G.HUD = { draw: draw };
})(window.IBTW = window.IBTW || {});
