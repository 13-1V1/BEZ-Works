// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Builds the published site into _site/:
//   1. copies the page, styles, script, images and browser builds
//   2. tucks programs.json + tools.json inside index.html (so they get locked too)
//   3. if STATICRYPT_PASSWORD is set, password-locks index.html with StatiCrypt
//
// Usage:  node scripts/build-site.mjs
//         STATICRYPT_PASSWORD=... node scripts/build-site.mjs

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = '_site';
const COPY = ['css', 'js', 'img', 'play', '.nojekyll', 'TEMPLATE-LICENSE.txt'];
const STATICRYPT = 'node_modules/staticrypt/cli/index.js'; // pinned in package.json — run `npm ci` first

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const item of COPY) {
  if (existsSync(item)) cpSync(item, join(OUT, item), { recursive: true });
}
// the password page is adapted from StatiCrypt and points at this license
cpSync('scripts/STATICRYPT-LICENSE.txt', join(OUT, 'STATICRYPT-LICENSE.txt'));

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
writeFileSync(join(OUT, 'index.html'), html);

if (process.env.STATICRYPT_PASSWORD) {
  execFileSync(process.execPath, [STATICRYPT, join(OUT, 'index.html'),
    '-d', OUT,
    '--short',
    '--remember', '30',
    '-t', 'scripts/password_template.html',
    '--template-title', 'BEZ Works',
    '--template-instructions', 'Enter the password to see the programs.',
    '--template-button', 'Enter',
    '--template-placeholder', 'Password',
    '--template-remember', 'Remember me on this device',
    '--template-error', 'Wrong password. Try again.',
    '--template-color-primary', '#ff7a2f',
    '--template-color-secondary', '#0b151e',
  ], { stdio: 'inherit' });
  console.log('Built _site/ (password-locked)');
} else {
  console.log('Built _site/ (NOT locked: STATICRYPT_PASSWORD not set)');
}
