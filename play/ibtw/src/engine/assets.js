// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// assets.js -- loads images and hands them out by a friendly nice-name.
// Never crashes on a missing file: it logs a warning and get() returns null so
// callers can fall back to a placeholder. Paths are relative to index.html.

(function (G) {
  "use strict";

  var SP = "Sprites/"; // asset root

  // nice-name -> file path. (Confirmed by scanning the Sprites folder.)
  var manifest = {
    // clean transparent soldier frames, generated from Soldier.png (see animations.js)
    soldier_clean: SP + "generated/soldier_clean.png",

    // terrain (forest-floor tiles sliced from Fantasy_Forest_Tileset_v2)
    dirt_forest:  SP + "generated/dirt_forest.png",
    grass_forest: SP + "generated/grass_forest.png",
    dirt_tile:    SP + "Dirt Tileset/Dirt Tileset/Dirt1.png", // fallback

    // scenery: trimmed decoration atlas + parallax forest layers
    decorations: SP + "generated/decorations.png",
    bg_sky:  SP + "Free Pixel Art Forest/Free Pixel Art Forest/PNG/Background layers/Layer_0011_0.png",
    bg_far:  SP + "Free Pixel Art Forest/Free Pixel Art Forest/PNG/Background layers/Layer_0009_2.png",
    bg_mid:  SP + "Free Pixel Art Forest/Free Pixel Art Forest/PNG/Background layers/Layer_0006_4.png",
    bg_near: SP + "Free Pixel Art Forest/Free Pixel Art Forest/PNG/Background layers/Layer_0002_7.png",

    // weapons (held sprites + HUD icons)
    clockmaster_weapons: SP + "Clockmaster77's Free Modern Weapons Asset 1.png",
    era_primary:   SP + "Eradication Wars Weapon Sprite Pack v1.1/Eradication Wars Weapon Sprite Pack/Weapons/ERA Weapon Primary (1).png",
    era_railgun:   SP + "Eradication Wars Weapon Sprite Pack v1.1/Eradication Wars Weapon Sprite Pack/Weapons/ERA Weapon Primary (58).png",
    era_secondary: SP + "Eradication Wars Weapon Sprite Pack v1.1/Eradication Wars Weapon Sprite Pack/Weapons/ERA Weapon Secondary (1).png",

    // projectiles + fx
    era_projectiles: SP + "Eradication Wars Weapon Sprite Pack v1.1/Eradication Wars Weapon Sprite Pack/Eradication Wars Tiny Projectiles Bx.png",
    muzzle_flash:    SP + "Eradication Wars Weapon Sprite Pack v1.1/Eradication Wars Weapon Sprite Pack/Tiny Bonus/tiny muzzles/micro muzzle (1).png",
    muzzle_flash2:   SP + "Eradication Wars Weapon Sprite Pack v1.1/Eradication Wars Weapon Sprite Pack/Tiny Bonus/tiny muzzles/micro muzzle (2).png",
  };

  var images = {};   // nice-name -> HTMLImageElement (only successful loads)
  var missing = {};  // nice-name -> true (warned)

  function loadAll(onProgress) {
    var names = Object.keys(manifest);
    var total = names.length;
    var done = 0;
    var settled = false;
    return new Promise(function (resolve) {
      if (total === 0) { resolve(); return; }

      // WATCHDOG: never let a stalled image (blocked request, weird sandbox that
      // fires neither onload nor onerror) hang the game on the loading screen.
      // After 6s we start with placeholders for whatever hasn't arrived.
      var watchdog = setTimeout(function () {
        if (settled) return;
        console.warn("[assets] load watchdog fired after 6s (" + done + "/" + total +
                     " loaded) -- starting with placeholders for the rest");
        finish();
      }, 6000);

      names.forEach(function (name) {
        var img = new Image();
        img.onload = function () {
          images[name] = img;
          tick();
        };
        img.onerror = function () {
          missing[name] = true;
          console.warn("[assets] missing sprite '" + name + "' -> " + manifest[name] + " (using placeholder)");
          tick();
        };
        // encodeURI handles spaces/parens/apostrophes in the folder names.
        img.src = encodeURI(manifest[name]);
      });

      function tick() {
        done++;
        if (onProgress) onProgress(done / total);
        if (done >= total) finish();
      }
      function finish() {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        resolve();
      }
    });
  }

  G.Assets = {
    manifest: manifest,
    loadAll: loadAll,
    get: function (name) { return images[name] || null; },
    has: function (name) { return !!images[name]; },
  };
})(window.IBTW = window.IBTW || {});
