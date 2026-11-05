// Created by: Brennan Meyer with use of Claude Code 11/05/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// The search panel in the hero's control band. Typing opens a results list right
// under it, each row with its download buttons, so a program can be found and
// downloaded without scrolling. Reads the same programs.json data as the cards.
// Loads before app.js, which calls initSearch() once the data is in.

'use strict';

// Lower case, no apostrophes, punctuation to spaces. Hyphenated words are kept
// both ways so "gcode", "g code" and "code" all find G-Code.
function searchable(parts) {
  const text = parts.filter(Boolean).join(' ').toLowerCase().replace(/['’]/g, '');
  const spaced = (t) => ' ' + t.replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  return spaced(text) + spaced(text.replace(/-/g, ''));
}

function indexProgram(p, catName) {
  const platforms = (p.downloads || []).map((d) => d.platform);
  return {
    program: p,
    catName,
    name: searchable([p.name, p.id]),
    all: searchable([p.name, p.id, p.description, p.note, catName, ...platforms,
      platforms.includes('macOS') && 'mac', p.browser && 'browser web online']),
  };
}

// Words match from their start. "mac" has to be whole, or it finds every "machine".
const hasToken = (text, t) => text.includes(t === 'mac' ? ' mac ' : ' ' + t);

// Name matches first, then ones that only match the description
function findPrograms(index, text) {
  const tokens = text.toLowerCase().replace(/['’-]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokens.length) return null;
  const hits = index.filter((e) => tokens.every((t) => hasToken(e.all, t)));
  const inName = (e) => tokens.every((t) => hasToken(e.name, t));
  return [...hits.filter(inName), ...hits.filter((e) => !inName(e))];
}

function resultActionsHTML(p) {
  if (p.status === 'coming-soon') return '<span class="result-soon">Coming soon</span>';

  const parts = (p.downloads || []).map((d) => {
    const label = [d.platform, d.label !== 'Download' && d.label].filter(Boolean).join(' ');
    return `<a class="btn btn-heat btn-result" href="${esc(d.url)}" rel="noopener">${esc(label || 'Download')}
      <small>${esc(formatSize(d.sizeBytes))}</small></a>`;
  });
  if (p.browser) {
    parts.push(`<a class="btn btn-coolant btn-result" href="${esc(p.browser)}" target="_blank" rel="noopener">Open in browser</a>`);
  }
  return parts.join('');
}

function resultHTML({ program: p, catName }) {
  return `
    <li class="result">
      <a class="result-name" href="#${esc(p.id)}" data-result="${esc(p.id)}">${esc(p.name)}</a>
      <span class="result-meta">${esc([p.version && 'v' + p.version, catName].filter(Boolean).join('  '))}</span>
      <div class="result-actions">${resultActionsHTML(p)}</div>
    </li>`;
}

function initSearch(programs, catNames, openProgram) {
  const panel = $('[data-search-panel]');
  const input = $('[data-search]');
  const box = $('[data-search-results]');
  const count = $('[data-search-count]');
  const index = programs.map((p) => indexProgram(p, catNames[p.category]));
  const idle = `${index.length} programs`;
  count.textContent = idle;

  const close = () => {
    box.hidden = true;
    panel.classList.remove('open');
  };

  function update() {
    const hits = findPrograms(index, input.value);
    if (!hits) {
      count.textContent = idle;
      close();
      return;
    }
    count.textContent = `${hits.length} found`;
    box.innerHTML = hits.length
      ? `<ul>${hits.map(resultHTML).join('')}</ul>`
      : '<p class="result-none">No programs match that.</p>';
    box.scrollTop = 0;
    box.hidden = false;
    panel.classList.add('open');
  }

  function reset() {
    input.value = '';
    update();
  }

  const rows = () => [...box.querySelectorAll('[data-result]')];

  // The whole panel is the search box, not just the line of text inside it
  panel.addEventListener('click', (e) => {
    if (!box.contains(e.target)) input.focus();
  });

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      reset();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows()[0]?.click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      rows()[0]?.focus();
    }
  });

  box.addEventListener('keydown', (e) => {
    const all = rows();
    const at = all.indexOf(document.activeElement.closest('.result')?.querySelector('[data-result]'));
    if (e.key === 'Escape') {
      input.focus();
      reset();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = at + (e.key === 'ArrowDown' ? 1 : -1);
      (next < 0 ? input : all[Math.min(next, all.length - 1)]).focus();
    }
  });

  box.addEventListener('click', (e) => {
    const row = e.target.closest('[data-result]');
    if (!row) return;
    e.preventDefault();
    close();
    input.blur();   // closes the phone keyboard
    openProgram(row.dataset.result);
  });

  // Close when clicking or tabbing away
  document.addEventListener('pointerdown', (e) => {
    if (!panel.contains(e.target)) close();
  });
  panel.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !panel.contains(e.relatedTarget)) close();
  });

  // "/" jumps to the search box from anywhere on the page
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, select') || !$('.lightbox').hidden) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}
