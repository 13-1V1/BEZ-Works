// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Screenshot a web build with Playwright (Chromium), driven by a small JSON plan.
//
//   node capture-web.mjs plan.json
//
// plan.json:
// {
//   "serve": "C:\\path\\to\\folder",   // folder served with `python -m http.server` (killed at the end)
//   "port": 8177,
//   "path": "index.html",              // page under the server root (or "url": "http://..." instead)
//   "viewport": [1600, 1000],
//   "scale": 1.5,                      // device pixel ratio (1707x1019 at 1.5 = a 2560x1528 shot)
//   "steps": [
//     { "wait": 1500 },                       // ms
//     { "waitFor": "canvas" },                // CSS selector to appear
//     { "click": "button.start" },            // CSS selector
//     { "clickText": "Start" },               // first visible element with this text
//     { "clickXY": [800, 500] },
//     { "press": "Enter" },                   // key tap (Playwright key names)
//     { "hold": "ArrowRight", "ms": 600 },    // hold a key
//     { "type": "hello" },
//     { "drag": [[100,100],[300,200],[500,120]] },   // mouse down, move through points, up
//     { "wheel": [800, 500, -400] },          // x, y, deltaY (negative = zoom in for most apps)
//     { "eval": "window.foo && foo()" },      // run JS in the page, result is printed
//     { "canvasPng": "canvas#x", "saveAs": "C:\out\x.png" },  // a canvas with transparency
//     { "download": "#exportBtn", "saveAs": "C:\out\file.gif", "timeout": 600000 },  // save a download
//     { "dump": true },                       // print visible buttons/links (for exploring)
//     { "shot": "C:\\out\\auto-01-x.png" },   // viewport screenshot
//     { "shot": "C:\\out\\x.png", "fullPage": true },
//     { "shot": "C:\\out\\x.png", "selector": "canvas" },  // just one element
//     { "move": [x,y] }, { "mousedown": [x,y] }, { "mouseup": true }
//   ]
// }
//
// Playwright is resolved from Chipload's node_modules; the browser is the installed Chrome.
// Optional plan keys: "channel": "msedge", "headless": false.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const require = createRequire('C:/Users/brenn/Chipload/chipload/node_modules/');
const { chromium } = require('playwright');

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const port = plan.port || 8177;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
if (plan.serve) {
  // refuse to run if something else (e.g. a local AI tool) already owns the port
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { headers: { connection: 'close' } });
    await r.arrayBuffer();
    console.log(`[abort] port ${port} is already in use by another program; pick a different "port"`);
    process.exit(2);
  } catch { /* port is free */ }
  server = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', plan.serve], {
    stdio: 'ignore',
    windowsHide: true,
  });
  process.on('exit', () => { try { server.kill(); } catch {} });   // never leave the server running
  // wait until it answers
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/`, { headers: { connection: 'close' } }); await r.arrayBuffer(); break; } catch { await sleep(250); }
  }
}

const url = plan.url || `http://127.0.0.1:${port}/${(plan.path || '').replace(/^\//, '')}`;
const [vw, vh] = plan.viewport || [1600, 1000];
// Playwright's own browsers aren't downloaded on this PC, so use the installed
// Google Chrome (or Edge with "channel": "msedge"). Nothing gets installed.
let browser = null;
try {
  browser = await chromium.launch({
    channel: plan.channel || 'chrome',
    headless: plan.headless !== false,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: plan.scale || 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

  console.log('open', url);
  await page.goto(url, { waitUntil: 'load' });
  for (const s of plan.steps || []) {
    if (s.wait) await sleep(s.wait);
    else if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: s.timeout || 15000 });
    else if (s.click) await page.click(s.click, { timeout: s.timeout || 5000 });
    else if (s.clickText) await page.getByText(s.clickText, { exact: !!s.exact }).first().click({ timeout: s.timeout || 5000 });
    else if (s.clickXY) await page.mouse.click(s.clickXY[0], s.clickXY[1]);
    else if (s.press) await page.keyboard.press(s.press);
    else if (s.hold) { await page.keyboard.down(s.hold); await sleep(s.ms || 500); await page.keyboard.up(s.hold); }
    else if (s.type) await page.keyboard.type(s.type, { delay: 30 });
    else if (s.canvasPng) {
      // save a canvas's own pixels (keeps transparency)
      const url = await page.evaluate((sel) => document.querySelector(sel).toDataURL('image/png'), s.canvasPng);
      mkdirSync(dirname(s.saveAs), { recursive: true });
      (await import('node:fs')).writeFileSync(s.saveAs, Buffer.from(url.split(',')[1], 'base64'));
      console.log('canvas saved', s.saveAs);
    }
    else if (s.download) {
      // click something that triggers a file download and save it
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: s.timeout || 600000 }),
        page.click(s.download),
      ]);
      mkdirSync(dirname(s.saveAs), { recursive: true });
      await dl.saveAs(s.saveAs);
      console.log('downloaded', s.saveAs);
    }
    else if (s.drag) {
      const pts = s.drag;
      await page.mouse.move(pts[0][0], pts[0][1]);
      await page.mouse.down();
      for (let i = 1; i < pts.length; i++) await page.mouse.move(pts[i][0], pts[i][1], { steps: s.steps || 12 });
      await page.mouse.up();
    }
    else if (s.move) await page.mouse.move(s.move[0], s.move[1], { steps: 8 });
    else if (s.mousedown) { await page.mouse.move(s.mousedown[0], s.mousedown[1]); await page.mouse.down(); }
    else if (s.mouseup) await page.mouse.up();
    else if (s.wheel) { await page.mouse.move(s.wheel[0], s.wheel[1]); await page.mouse.wheel(0, s.wheel[2]); await sleep(200); }
    else if (s.eval) console.log('eval ->', JSON.stringify(await page.evaluate(s.eval)));
    else if (s.dump) {
      const items = await page.evaluate((limit) =>
        [...document.querySelectorAll('button, a, [role=button], [onclick], .btn, li, h1, h2, h3')]
          .filter((e) => e.offsetParent !== null)
          .map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} :: ${(e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80)}`)
          .slice(0, limit), s.limit || 80);
      console.log(items.join('\n'));
    }
    else if (s.shot) {
      mkdirSync(dirname(s.shot), { recursive: true });
      if (s.selector) await page.locator(s.selector).first().screenshot({ path: s.shot });
      else await page.screenshot({ path: s.shot, fullPage: !!s.fullPage });
      console.log('saved', s.shot);
    }
  }
} catch (e) {
  console.log('[step failed]', e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
