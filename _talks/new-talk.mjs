#!/usr/bin/env node
// Scaffold a new talk:  npm run new -- "Talk Title"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: npm run new -- "Talk Title"');
  process.exit(1);
}

const slug = title.toLowerCase().trim()
  .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
const file = path.join(__dirname, 'content', `${slug}.md`);
if (fs.existsSync(file)) {
  console.error(`Already exists: ${path.relative(process.cwd(), file)}`);
  process.exit(1);
}

const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
fs.writeFileSync(file, `---
title: ${JSON.stringify(title)}
speaker: ""
role: ""
date: "${month}"
session: ""
summary: ""
sourceUrl: ""
draft: true
---

Talk text goes here. Add a citation like this.[^1]

## Notes

[^1]: See Moses 1:39.
`);
console.log(`Created ${path.relative(process.cwd(), file)} (draft: true — remove when ready to publish)`);
