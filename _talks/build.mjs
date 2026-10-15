#!/usr/bin/env node
// Static site generator for the Talk Reader.
//
// Reads Markdown talks (with YAML frontmatter + [^n] footnotes) from
// _talks/content/ and writes fully pre-rendered HTML to <repo>/talks/,
// which GitHub Pages serves at https://thornock.org/talks/.
//
// Usage:  cd _talks && npm install && npm run build

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, 'content');
const ASSETS_DIR = path.join(__dirname, 'assets');
const OUT_DIR = path.join(__dirname, '..', 'talks');
const BASE = '/talks';
const SITE_ORIGIN = 'https://thornock.org';
const SITE_NAME = 'Gospel Reader';

// ---------- helpers ----------

const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }
  return String(value);
}

function sortKey(value) {
  if (value instanceof Date) return value.getTime();
  const t = Date.parse(String(value || ''));
  return Number.isNaN(t) ? 0 : t;
}

const hashOf = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);

// ---------- markdown + footnote parsing ----------

const FOOTNOTE_DEF = /^\[\^([A-Za-z0-9_-]+)\]:\s?(.*)$/;
const FOOTNOTE_REF = /\[\^([A-Za-z0-9_-]+)\]/g;

/**
 * Splits footnote definitions out of the markdown body. A definition starts
 * with `[^id]: text` and may continue on following indented lines.
 */
function extractFootnotes(markdown) {
  const bodyLines = [];
  const notes = [];
  let current = null;

  for (const line of markdown.split(/\r?\n/)) {
    const def = line.match(FOOTNOTE_DEF);
    if (def) {
      current = { key: def[1], lines: [def[2]] };
      notes.push(current);
      continue;
    }
    if (current && /^( {2,}|\t)\S/.test(line)) {
      current.lines.push(line.trim());
      continue;
    }
    current = null;
    bodyLines.push(line);
  }

  return {
    body: bodyLines.join('\n'),
    notes: notes.map(n => {
      const text = n.lines.join(' ').trim();
      return { id: `note-${n.key}`, key: n.key, text, html: marked.parseInline(text) };
    })
  };
}

export function parseTalk(file) {
  const slug = path.basename(file, '.md');
  return parseTalkSource(slug, fs.readFileSync(file, 'utf8'));
}

export function parseTalkSource(slug, raw) {
  const { data, content } = matter(raw);

  const { body, notes } = extractFootnotes(content);
  const known = new Set(notes.map(n => n.key));

  // Strip trailing "## Notes" heading left empty after removing definitions
  let cleaned = body.trim().replace(/#{1,3}\s*Notes\s*$/i, '').trim();

  // Replace inline references with interactive notation buttons
  cleaned = cleaned.replace(FOOTNOTE_REF, (m, key) => {
    if (!known.has(key)) {
      console.warn(`  ⚠ ${slug}: reference [^${key}] has no definition`);
      return m;
    }
    return `<button type="button" class="note-ref" data-note-id="note-${key}" aria-label="View note ${key}"><sup class="marker">${key}</sup></button>`;
  });

  return {
    slug,
    url: `${BASE}/${slug}/`,
    draft: Boolean(data.draft),
    title: data.title || slug,
    speaker: data.speaker || '',
    role: data.role || '',
    date: formatDate(data.date),
    sortKey: sortKey(data.date),
    session: data.session || '',
    summary: data.summary || '',
    sourceUrl: data.sourceUrl || '',
    bodyHtml: marked.parse(cleaned),
    notes
  };
}

// ---------- templates ----------

const ICONS = {
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/><path d="M6 14h6"/></svg>`,
  doc: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  back: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>`
};

// Applied before first paint to avoid a light/dark flash
const THEME_BOOTSTRAP = `<script>(function(){try{var t=localStorage.getItem('gospel-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);var f=localStorage.getItem('gospel-font-size');if(f)document.documentElement.style.setProperty('--reader-font-size',f+'rem');}catch(e){}})();</script>`;

function layout({ title, description, canonical, header, main, assets }) {
  return `<!DOCTYPE html>
<!-- Generated by _talks/build.mjs — do not edit by hand. -->
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${SITE_ORIGIN}${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${SITE_ORIGIN}${canonical}">
  <meta property="og:type" content="article">
  ${THEME_BOOTSTRAP}
  <link rel="icon" type="image/svg+xml" href="${assets.favicon}">
  <link rel="stylesheet" href="${assets.css}">
</head>
<body>
  <header class="app-header">
${header}
  </header>
${main}
  <script src="${assets.js}" defer></script>
</body>
</html>
`;
}

function brand() {
  return `<a class="brand" href="${BASE}/" title="All talks">${ICONS.book}<span>${SITE_NAME}</span></a>`;
}

function themeButton() {
  return `<button id="themeToggleBtn" class="btn btn-icon" title="Toggle theme" aria-label="Toggle theme"><span id="themeIcon">🌙</span></button>`;
}

function talkSelector(talks, current) {
  const options = talks
    .map(t => {
      const label = t.speaker ? `${t.title} (${t.speaker})` : t.title;
      return `<option value="${t.url}"${t.slug === current.slug ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
  return `<select id="talkSelector" class="talk-selector" title="Select a talk" aria-label="Select a talk">${options}</select>`;
}

function renderTalkPage(talk, talks, assets) {
  const sessionLine = [talk.date, talk.session].filter(Boolean).join(' • ');

  const sidebarCards = talk.notes.length
    ? talk.notes.map(n => `
        <div class="note-card" id="sidebar-${n.id}" data-note-id="${n.id}">
          <div class="note-card-header">
            <span class="note-badge">Note ${escapeHtml(n.key)}</span>
            <button type="button" class="note-jump-btn" title="Jump to note in text">${ICONS.back} In text</button>
          </div>
          <div class="note-card-body">${n.html}</div>
        </div>`).join('')
    : `<div style="padding: 1rem; color: var(--text-tertiary); text-align: center;">No notes or citations in this talk.</div>`;

  const endnotes = talk.notes.length
    ? `
        <section class="endnotes-section">
          <h2 class="endnotes-title">Notes &amp; References</h2>
          <ol class="endnotes-list">${talk.notes.map(n => `
            <li class="endnotes-item" id="endnote-${n.id}">
              <span class="endnotes-marker" data-note-id="${n.id}">[${escapeHtml(n.key)}]</span>
              <div class="endnotes-body">${n.html}</div>
            </li>`).join('')}
          </ol>
        </section>`
    : '';

  const header = `
    <div class="header-left">
      ${brand()}
      ${talkSelector(talks, talk)}
    </div>
    <div class="header-right">
      <button id="fontSizeDecBtn" class="btn btn-icon" title="Decrease font size" aria-label="Decrease font size"><span style="font-weight: 700; font-size: 0.85rem;">A-</span></button>
      <button id="fontSizeIncBtn" class="btn btn-icon" title="Increase font size" aria-label="Increase font size"><span style="font-weight: 700; font-size: 1.1rem;">A+</span></button>
      ${themeButton()}
      <button id="notesToggleBtn" class="btn" title="Toggle notes panel">
        ${ICONS.doc}
        <span class="header-actions-text">Notes</span>
        <span class="notes-toggle-badge">${talk.notes.length}</span>
      </button>
    </div>`;

  const main = `
  <main class="main-layout">
    <div class="reader-container">
      <article class="article-content">
        <header class="talk-meta">
          ${sessionLine ? `<div class="session-badge">${escapeHtml(sessionLine)}</div>` : ''}
          <h1 class="talk-title">${escapeHtml(talk.title)}</h1>
          ${talk.speaker ? `<div class="talk-speaker">${escapeHtml(talk.speaker)}</div>` : ''}
          ${talk.role ? `<div class="talk-role">${escapeHtml(talk.role)}</div>` : ''}
          ${talk.summary ? `<div class="talk-summary-box">${escapeHtml(talk.summary)}</div>` : ''}
          ${talk.sourceUrl ? `<a class="source-link" href="${escapeHtml(talk.sourceUrl)}" target="_blank" rel="noopener noreferrer">View original source ↗</a>` : ''}
        </header>

        <div class="talk-body">
${talk.bodyHtml}
        </div>
${endnotes}
      </article>
    </div>

    <aside id="sidebarPanel" class="sidebar-panel" aria-label="Notes sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title">${ICONS.doc}<span>Notes &amp; Citations (${talk.notes.length})</span></div>
        <button id="closeSidebarBtn" class="btn btn-icon" title="Close notes panel" aria-label="Close notes panel">${ICONS.close}</button>
      </div>
      <div class="sidebar-content">${sidebarCards}
      </div>
    </aside>
  </main>`;

  return layout({
    title: `${talk.title} - ${SITE_NAME}`,
    description: talk.summary || `${talk.title}${talk.speaker ? ` by ${talk.speaker}` : ''}`,
    canonical: talk.url,
    header,
    main,
    assets
  });
}

function renderIndexPage(talks, assets) {
  const items = talks.map(t => {
    const meta = [t.date, t.session].filter(Boolean).join(' • ');
    return `
          <li>
            <a class="talk-card" href="${t.url}">
              ${meta ? `<div class="session-badge">${escapeHtml(meta)}</div>` : ''}
              <div class="talk-card-title">${escapeHtml(t.title)}</div>
              ${t.speaker ? `<div class="talk-card-speaker">${escapeHtml(t.speaker)}</div>` : ''}
              ${t.summary ? `<div class="talk-card-summary">${escapeHtml(t.summary)}</div>` : ''}
              <div class="talk-card-notes">${t.notes.length} note${t.notes.length === 1 ? '' : 's'}</div>
            </a>
          </li>`;
  }).join('');

  const header = `
    <div class="header-left">${brand()}</div>
    <div class="header-right">${themeButton()}</div>`;

  const main = `
  <main class="main-layout">
    <div class="reader-container">
      <div class="article-content">
        <h1 class="library-title">Talks</h1>
        <p class="library-subtitle">${talks.length} talk${talks.length === 1 ? '' : 's'} with notes &amp; citations.</p>
        <ul class="talk-list">${items}
        </ul>
      </div>
    </div>
  </main>`;

  return layout({
    title: `Talks - ${SITE_NAME}`,
    description: 'A library of talks with interactive notes and citations.',
    canonical: `${BASE}/`,
    header,
    main,
    assets
  });
}

// ---------- build ----------

export const ASSET_FILES = [['css', 'styles.css'], ['js', 'reader.js'], ['favicon', 'favicon.svg']];

/** Cache-busted public URLs for the reader assets (optionally copying them to outDir). */
export function assetUrls(outDir = null) {
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  const urls = {};
  for (const [key, name] of ASSET_FILES) {
    const buf = fs.readFileSync(path.join(ASSETS_DIR, name));
    if (outDir) fs.writeFileSync(path.join(outDir, name), buf);
    urls[key] = `${BASE}/assets/${name}?v=${hashOf(buf)}`; // cache-bust on change
  }
  return urls;
}

export function loadTalks({ includeDrafts = false } = {}) {
  return fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => parseTalk(path.join(CONTENT_DIR, f)))
    .filter(t => includeDrafts || !t.draft)
    .sort((a, b) => b.sortKey - a.sortKey || a.title.localeCompare(b.title));
}

export function build({ includeDrafts = false } = {}) {
  const talks = loadTalks({ includeDrafts });

  // Output dir is fully generated: wipe and rebuild so deleted talks disappear.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const assets = assetUrls(path.join(OUT_DIR, 'assets'));

  for (const talk of talks) {
    const dir = path.join(OUT_DIR, talk.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderTalkPage(talk, talks, assets));
    console.log(`  ✓ ${talk.url}  (${talk.notes.length} notes)`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndexPage(talks, assets));
  console.log(`Built ${talks.length} talk(s) → ${path.relative(process.cwd(), OUT_DIR) || OUT_DIR}`);
  return talks;
}

export { CONTENT_DIR, ASSETS_DIR, BASE, renderTalkPage, renderIndexPage };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build({ includeDrafts: process.argv.includes('--drafts') });
}
