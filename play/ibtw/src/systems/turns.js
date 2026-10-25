// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// turns.js -- whose turn it is. Teams alternate; each team cycles through its
// living soldiers. Randomizes wind every turn and runs the win check.

(function (G) {
  "use strict";

  var S = G.settings;

  function aliveCount(team) {
    var n = 0;
    for (var i = 0; i < team.members.length; i++) if (team.members[i].alive) n++;
    return n;
  }

  // pick the next living soldier on a team, advancing that team's cursor
  function pickNext(game, teamIdx) {
    var team = game.teams[teamIdx];
    var start = game.teamCursor[teamIdx];
    for (var k = 0; k < team.members.length; k++) {
      var idx = (start + k) % team.members.length;
      if (team.members[idx].alive) {
        game.teamCursor[teamIdx] = (idx + 1) % team.members.length;
        return team.members[idx];
      }
    }
    return null;
  }

  function randomizeWind(game) {
    game.wind = (Math.random() * 2 - 1) * S.windMax;
  }

  // start of the very first turn
  function startFirst(game) {
    game.activeTeam = 0;
    game.active = pickNext(game, 0);
    beginTurn(game);
  }

  // hand control to the other team's next soldier
  function next(game) {
    if (checkWin(game)) return;
    game.activeTeam = 1 - game.activeTeam;
    var h = pickNext(game, game.activeTeam);
    if (!h) {           // safety: current team wiped -> other wins
      checkWin(game);
      return;
    }
    game.active = h;
    beginTurn(game);
  }

  // shared per-turn setup
  function beginTurn(game) {
    randomizeWind(game);
    game.turnTimer = S.turnSeconds;
    game.power = 0;
    game.charging = false;
    game.phase = "aiming";
    game.camera.recenter(); // new turn ends any free-look pan
    game.camera.follow(game.active.x, game.active.y - 40);
    // face roughly toward the enemy side for a sensible starting aim
    game.active.facing = game.activeTeam === 0 ? 1 : -1;
  }

  // returns true and sets game.phase='gameover' if someone has won
  function checkWin(game) {
    var a = aliveCount(game.teams[0]);
    var b = aliveCount(game.teams[1]);
    if (a > 0 && b > 0) return false;
    game.phase = "gameover";
    if (a > 0) game.winner = 0;
    else if (b > 0) game.winner = 1;
    else game.winner = -1; // mutual wipeout = draw
    return true;
  }

  G.Turns = {
    startFirst: startFirst,
    next: next,
    checkWin: checkWin,
    aliveCount: aliveCount,
  };
})(window.IBTW = window.IBTW || {});
