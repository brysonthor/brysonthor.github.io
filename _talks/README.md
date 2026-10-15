# Talks (thornock.org/talks)

Source for the static talk reader. Everything in `_talks/` is ignored by GitHub Pages (underscore prefix); the generated site lives in `/talks/` and is committed.

## Add or edit a talk

### Easiest: local editor

```sh
cd _talks
npm install            # first time only
npm run edit           # opens http://localhost:4000
```

- The list on the left shows every talk in `content/`, drafts included.
- Edit the fields and Markdown, and the preview on the right updates live using the real build templates. `⌘S` saves the `.md` file.
- **+ Footnote** adds the next `[^n]` at your cursor and a definition line at the bottom.
- Changing the **URL slug** renames the file when you save.
- **Build site** regenerates `../talks/` with drafts left out. After that, commit and push.

The editor only listens on `127.0.0.1` and is never deployed.

### By hand

```sh
npm run new -- "My Talk Title"   # creates content/my-talk-title.md (draft)
# edit the markdown, remove `draft: true`
npm run build          # regenerates ../talks/
git add -A .. && git commit -m "Add talk" && git push
```

`npm run preview` builds (including drafts) and serves the site at http://localhost:8000/talks/. Run `npm run build` again before committing so drafts aren't published.

## Talk format

```markdown
---
title: "Come to the Lord in His Holy House"
speaker: "Elder Gerrit W. Gong"
role: "Of the Quorum of the Twelve Apostles"
date: "October 2026"          # used for sorting (newest first)
session: "Saturday Morning Session"
summary: "Short summary shown on the card and under the title."
sourceUrl: "https://…"        # optional
draft: true                   # optional; excluded from `npm run build`
---

Body text with a citation.[^1]

## Notes

[^1]: See Moses 1:39.
```

The file name becomes the URL: `content/foo.md` → `/talks/foo/`.

> `/talks/` is wiped on every build — don't hand-edit files there.
