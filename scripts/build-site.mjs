// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Builds the published site into _site/:
//   1. copies the page, styles, script, images and browser builds
//   2. tucks programs.json + tools.json inside index.html (saves two fetches on load)
//   3. stamps each css/js link with a content hash so browsers never mix old and new files
//   4. also publishes programs.json as a file; the BMeyer portfolio reads its "rooms" lists
//
// Usage:  node scripts/build-site.mjs

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const OUT = '_site';
const COPY = ['css', 'js', 'img', 'play', '.nojekyll', 'TEMPLATE-LICENSE.txt', 'programs.json'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const item of COPY) {
  if (existsSync(item)) cpSync(item, join(OUT, item), { recursive: true });
}

// Inline the data. "</" is escaped so a description can never close the script tag.
const inline = (id, file) => {
  const json = JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))).replace(/<\//g, '<\\/');
  return `<script type="application/json" id="${id}">${json}</script>`;
};
const html = readFileSync('index.html', 'utf8').replace(
  '<script src="js/app.js"></script>',
  inline('data-programs', 'programs.json') + '\n  ' +
  inline('data-tools', 'tools.json') + '\n  ' +
  '<script src="js/app.js"></script>'
);
if (!html.includes('id="data-programs"')) throw new Error('Could not find the app.js script tag in index.html');

// Stamp every local stylesheet and script with a hash of its contents ("css/style.css?v=1a2b3c4d").
// Browsers cache these files for a while; a new stamp makes them fetch the new file the
// moment the page changes, so a visitor never gets the new page with an old stylesheet.
const stamped = html.replace(/(href|src)="((?:css|js)\/[^"?]+\.(?:css|js))"/g, (m, attr, file) => {
  const v = createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);
  return `${attr}="${file}?v=${v}"`;
});
writeFileSync(join(OUT, 'index.html'), stamped);

console.log('Built _site/');
