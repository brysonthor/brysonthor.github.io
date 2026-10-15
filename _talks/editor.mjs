#!/usr/bin/env node
// Local talk editor:  npm run edit   (→ http://localhost:4000)
//
// A localhost-only authoring tool that reads/writes Markdown in _talks/content/.
// It is NOT deployed — the public site is still produced by `npm run build`.
// Live preview uses the exact same render pipeline as build.mjs.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
  CONTENT_DIR, ASSETS_DIR, BASE,
  parseTalkSource, loadTalks, assetUrls, renderTalkPage, renderIndexPage, build
} from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = path.join(__dirname, 'editor');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4000;

// Frontmatter fields, in the order they're written to disk
const FIELDS = ['title', 'speaker', 'role', 'date', 'session', 'summary', 'sourceUrl', 'draft'];
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

// ---------- helpers ----------

const fileFor = (slug) => path.join(CONTENT_DIR, `${slug}.md`);

function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-|-$/g, '');
}

function normalizeData(data) {
  const out = { ...data };
  if (out.date instanceof Date) out.date = out.date.toISOString().slice(0, 10);
  return out;
}

/** Serialize editor fields to a Markdown file, keeping any extra frontmatter keys. */
function toMarkdown(data, content, existing = {}) {
  const fm = {};
  for (const key of FIELDS) {
    const v = data[key];
    if (key === 'draft') { if (v) fm.draft = true; continue; }
    if (key === 'sourceUrl' && !v) continue;
    fm[key] = v == null ? '' : String(v);
  }
  for (const [k, v] of Object.entries(existing)) if (!FIELDS.includes(k)) fm[k] = v;
  return matter.stringify(`\n${String(content || '').trim()}\n`, fm);
}

function send(res, status, body, type = 'application/json') {
  const payload = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(payload);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
}

// ---------- routes ----------

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method;

  // Editor UI
  if (url.pathname === '/') return serveFile(res, path.join(EDITOR_DIR, 'index.html'));
  if (parts[0] === 'editor' && parts.length === 2) return serveFile(res, path.join(EDITOR_DIR, path.basename(parts[1])));

  // Live site preview (includes drafts), mirrors the built URL structure
  if (parts[0] === 'talks') {
    if (parts[1] === 'assets' && parts[2]) return serveFile(res, path.join(ASSETS_DIR, path.basename(parts[2])));
    const talks = loadTalks({ includeDrafts: true });
    if (parts.length === 1) return send(res, 200, renderIndexPage(talks, assetUrls()), 'text/html');
    const talk = talks.find(t => t.slug === parts[1]);
    if (!talk) return send(res, 404, 'Talk not found', 'text/plain');
    return send(res, 200, renderTalkPage(talk, talks, assetUrls()), 'text/html');
  }

  if (parts[0] !== 'api') return send(res, 404, 'Not found', 'text/plain');
  const [, resource, slug] = parts;

  // List talks
  if (resource === 'talks' && !slug && method === 'GET') {
    const talks = loadTalks({ includeDrafts: true }).map(t => ({
      slug: t.slug, title: t.title, speaker: t.speaker, date: t.date, draft: t.draft, noteCount: t.notes.length
    }));
    return send(res, 200, talks);
  }

  if (resource === 'talks' && slug) {
    if (!SLUG_RE.test(slug)) return send(res, 400, { error: 'Invalid slug' });
    const file = fileFor(slug);

    if (method === 'GET') {
      if (!fs.existsSync(file)) return send(res, 404, { error: 'Talk not found' });
      const { data, content } = matter(fs.readFileSync(file, 'utf8'));
      return send(res, 200, { slug, data: normalizeData(data), content: content.trim() });
    }

    // Create or update. Body: { data, content, newSlug?, create? }
    if (method === 'PUT') {
      const body = await readJson(req);
      if (!body.data?.title?.trim()) return send(res, 400, { error: 'Title is required' });
      if (body.create && fs.existsSync(file)) {
        return send(res, 409, { error: `A talk named "${slug}" already exists — change the slug` });
      }
      const target = body.newSlug ? slugify(body.newSlug) : slug;
      if (!SLUG_RE.test(target)) return send(res, 400, { error: 'Invalid slug' });
      if (target !== slug && fs.existsSync(fileFor(target))) {
        return send(res, 409, { error: `A talk named "${target}" already exists` });
      }
      const existing = fs.existsSync(file) ? matter(fs.readFileSync(file, 'utf8')).data : {};
      fs.writeFileSync(fileFor(target), toMarkdown(body.data, body.content, existing), 'utf8');
      if (target !== slug && fs.existsSync(file)) fs.unlinkSync(file); // rename
      console.log(`  ✎ saved content/${target}.md`);
      return send(res, 200, { slug: target });
    }

    if (method === 'DELETE') {
      if (!fs.existsSync(file)) return send(res, 404, { error: 'Talk not found' });
      fs.unlinkSync(file);
      console.log(`  ✗ deleted content/${slug}.md`);
      return send(res, 200, { ok: true });
    }
  }

  // Render unsaved editor state with the real templates
  if (resource === 'preview' && method === 'POST') {
    const body = await readJson(req);
    const previewSlug = SLUG_RE.test(body.slug || '') ? body.slug : (slugify(body.data?.title || '') || 'untitled');
    const talk = parseTalkSource(previewSlug, toMarkdown(body.data || {}, body.content || ''));
    const others = loadTalks({ includeDrafts: true }).filter(t => t.slug !== previewSlug);
    return send(res, 200, renderTalkPage(talk, [talk, ...others], assetUrls()), 'text/html');
  }

  // Run the production build (drafts excluded)
  if (resource === 'build' && method === 'POST') {
    const talks = build();
    return send(res, 200, { count: talks.length });
  }

  send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    send(res, 500, { error: err.message });
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Talk editor running at ${url}  (live site preview: ${url}${BASE}/)`);
  console.log('Press Ctrl+C to stop.');
  if (!process.argv.includes('--no-open') && process.platform === 'darwin') execFile('open', [url]);
});
