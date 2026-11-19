// Created by: Brennan Meyer with use of Claude Code 11/19/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Day-of-week look. Sets data-day (0 = Sunday) on <html>; css/style.css has one
// accent and background-glow set per day. Runs in <head> so the page never
// flashes the wrong colors. Add ?day=0..6 to the address to preview a day.

(function () {
  'use strict';
  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const LOOKS = ['Gold', 'Blue steel', 'Forge', 'Green', 'Amber', 'Neon', 'Magenta'];
  const asked = new URLSearchParams(location.search).get('day');
  const day = /^[0-6]$/.test(asked || '') ? Number(asked) : new Date().getDay();
  document.documentElement.dataset.day = day;
  window.BEZ = window.BEZ || {};
  window.BEZ.day = { index: day, name: NAMES[day], look: LOOKS[day] };
})();
