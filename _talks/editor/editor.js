// Talk Editor client (local only)
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('talkForm');
  const talkList = $('talkList');
  const filter = $('filter');
  const statusEl = $('status');
  const preview = $('preview');
  const content = $('f-content');
  const slugInput = $('f-slug');
  const TEXT_FIELDS = ['title', 'speaker', 'role', 'date', 'session', 'summary', 'sourceUrl'];

  let talks = [];
  let currentSlug = null; // null => new, unsaved talk
  let dirty = false;
  let previewTimer = null;
  let previewSeq = 0;

  const slugify = (s) => String(s).toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-|-$/g, '');

  function setStatus(text, kind = '') {
    statusEl.textContent = text;
    statusEl.className = `status ${kind}`;
  }

  function setDirty(value) {
    dirty = value;
    if (dirty) setStatus('Unsaved changes', 'dirty');
    document.title = `${dirty ? '● ' : ''}Talk Editor`;
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error(data.error || data || res.statusText);
    return data;
  }

  function confirmDiscard() {
    return !dirty || confirm('You have unsaved changes. Discard them?');
  }

  // ----- list -----

  function renderList() {
    const q = filter.value.trim().toLowerCase();
    talkList.innerHTML = '';
    talks
      .filter(t => !q || `${t.title} ${t.speaker} ${t.slug}`.toLowerCase().includes(q))
      .forEach(t => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = t.slug === currentSlug ? 'active' : '';
        btn.innerHTML = `<span class="t-title"></span><span class="t-meta"></span>`;
        btn.querySelector('.t-title').textContent = t.title;
        if (t.draft) btn.querySelector('.t-title').insertAdjacentHTML('beforeend', '<span class="draft-badge">draft</span>');
        btn.querySelector('.t-meta').textContent =
          [t.speaker, t.date, `${t.noteCount} notes`].filter(Boolean).join(' · ');
        btn.addEventListener('click', () => { if (t.slug !== currentSlug && confirmDiscard()) openTalk(t.slug); });
        li.appendChild(btn);
        talkList.appendChild(li);
      });
  }

  async function refreshList() {
    talks = await api('GET', '/api/talks');
    renderList();
  }

  // ----- form -----

  function readForm() {
    const data = {};
    TEXT_FIELDS.forEach(k => { data[k] = $(`f-${k}`).value.trim(); });
    data.draft = $('f-draft').checked;
    return { data, content: content.value };
  }

  function fillForm(data = {}, body = '', slug = '') {
    TEXT_FIELDS.forEach(k => { $(`f-${k}`).value = data[k] ?? ''; });
    $('f-draft').checked = Boolean(data.draft);
    content.value = body;
    slugInput.value = slug;
  }

  async function openTalk(slug) {
    try {
      const talk = await api('GET', `/api/talks/${encodeURIComponent(slug)}`);
      currentSlug = talk.slug;
      fillForm(talk.data, talk.content, talk.slug);
      $('deleteBtn').disabled = false;
      history.replaceState(null, '', `#${talk.slug}`);
      setDirty(false);
      setStatus('Loaded');
      renderList();
      schedulePreview(0);
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  function newTalk() {
    if (!confirmDiscard()) return;
    currentSlug = null;
    const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    fillForm({ date: month, draft: true }, 'Talk text goes here.[^1]\n\n## Notes\n\n[^1]: See Moses 1:39.', '');
    $('deleteBtn').disabled = true;
    history.replaceState(null, '', '#');
    renderList();
    setDirty(false);
    setStatus('New talk');
    $('f-title').focus();
    schedulePreview(0);
  }

  async function save(e) {
    e?.preventDefault();
    if (!form.reportValidity()) return;
    const { data, content: body } = readForm();
    const desiredSlug = slugify(slugInput.value) || slugify(data.title);
    if (!desiredSlug) return setStatus('Title or slug required', 'error');

    try {
      const isNew = currentSlug === null;
      const target = isNew ? desiredSlug : currentSlug;
      const payload = { data, content: body, create: isNew };
      if (!isNew && desiredSlug !== currentSlug) payload.newSlug = desiredSlug;
      const saved = await api('PUT', `/api/talks/${encodeURIComponent(target)}`, payload);
      currentSlug = saved.slug;
      slugInput.value = saved.slug;
      $('deleteBtn').disabled = false;
      history.replaceState(null, '', `#${saved.slug}`);
      setDirty(false);
      setStatus(`Saved content/${saved.slug}.md at ${new Date().toLocaleTimeString()}`);
      await refreshList();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function remove() {
    if (!currentSlug || !confirm(`Delete content/${currentSlug}.md? This cannot be undone.`)) return;
    try {
      await api('DELETE', `/api/talks/${encodeURIComponent(currentSlug)}`);
      setDirty(false);
      setStatus(`Deleted ${currentSlug}`);
      currentSlug = null;
      await refreshList();
      talks.length ? openTalk(talks[0].slug) : newTalk();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function runBuild() {
    if (dirty && !confirm('You have unsaved changes that won\'t be included. Build anyway?')) return;
    const btn = $('buildBtn');
    btn.disabled = true;
    setStatus('Building…');
    try {
      const { count } = await api('POST', '/api/build');
      setStatus(`Built ${count} published talk(s) → /talks/. Commit & push to deploy.`);
    } catch (err) {
      setStatus(`Build failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // Insert the next footnote marker at the cursor and a definition at the end
  function insertFootnote() {
    const val = content.value;
    const nums = (val.match(/\[\^(\d+)\]/g) || []).map(m => parseInt(m.slice(2), 10)).filter(n => !isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    const start = content.selectionStart;
    const end = content.selectionEnd;
    const marker = `[^${next}]`;
    const before = val.slice(0, start) + marker + val.slice(end);
    const hasNotes = /^#{1,3}\s*Notes\s*$/im.test(before);
    const definition = `${before.endsWith('\n') ? '' : '\n'}${hasNotes ? '' : '\n## Notes\n\n'}[^${next}]: `;
    content.value = before + definition;
    // Put the cursor on the new definition so the citation can be typed right away
    content.focus();
    content.setSelectionRange(content.value.length, content.value.length);
    onEdit();
  }

  // ----- live preview -----

  function schedulePreview(delay = 350) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, delay);
  }

  async function renderPreview() {
    const seq = ++previewSeq;
    const { data, content: body } = readForm();
    try {
      const html = await api('POST', '/api/preview', {
        slug: currentSlug || slugify(slugInput.value) || slugify(data.title),
        data: { ...data, title: data.title || 'Untitled Talk' },
        content: body
      });
      if (seq !== previewSeq) return; // a newer render is in flight
      const scrollY = preview.contentWindow?.scrollY || 0;
      preview.onload = () => preview.contentWindow.scrollTo(0, scrollY);
      preview.srcdoc = html;
    } catch (err) {
      setStatus(`Preview error: ${err.message}`, 'error');
    }
  }

  function onEdit() {
    setDirty(true);
    schedulePreview();
  }

  // ----- wiring -----

  form.addEventListener('input', onEdit);
  form.addEventListener('submit', save);
  filter.addEventListener('input', renderList);
  $('newBtn').addEventListener('click', newTalk);
  $('deleteBtn').addEventListener('click', remove);
  $('buildBtn').addEventListener('click', runBuild);
  $('footnoteBtn').addEventListener('click', insertFootnote);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  (async function init() {
    await refreshList();
    const fromHash = decodeURIComponent(location.hash.slice(1));
    if (fromHash && talks.some(t => t.slug === fromHash)) openTalk(fromHash);
    else if (talks.length) openTalk(talks[0].slug);
    else newTalk();
  })();
})();
