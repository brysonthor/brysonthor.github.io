// Gospel Reader & Interactive Notations Client (static, read-only)
// Talk content is pre-rendered at build time by _talks/build.mjs.
// This script only wires up navigation, theme, font size, and the notes sidebar.

(function () {
  const FONT_KEY = 'gospel-font-size';
  const THEME_KEY = 'gospel-theme';
  let currentFontSize = parseFloat(localStorage.getItem(FONT_KEY)) || 1.125; // rem

  const $ = (id) => document.getElementById(id);
  const talkSelector = $('talkSelector');
  const sidebarPanel = $('sidebarPanel');
  const notesToggleBtn = $('notesToggleBtn');
  const closeSidebarBtn = $('closeSidebarBtn');
  const themeToggleBtn = $('themeToggleBtn');
  const themeIcon = $('themeIcon');
  const fontSizeDecBtn = $('fontSizeDecBtn');
  const fontSizeIncBtn = $('fontSizeIncBtn');

  // Theme
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');

  themeToggleBtn?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // Font size
  function applyFontSize() {
    document.documentElement.style.setProperty('--reader-font-size', `${currentFontSize}rem`);
    localStorage.setItem(FONT_KEY, String(currentFontSize));
  }
  if (localStorage.getItem(FONT_KEY)) applyFontSize();

  fontSizeDecBtn?.addEventListener('click', () => {
    if (currentFontSize > 0.875) { currentFontSize -= 0.125; applyFontSize(); }
  });
  fontSizeIncBtn?.addEventListener('click', () => {
    if (currentFontSize < 1.75) { currentFontSize += 0.125; applyFontSize(); }
  });

  // Talk selector navigates between pre-rendered pages
  talkSelector?.addEventListener('change', (e) => {
    if (e.target.value) window.location.href = e.target.value;
  });

  // Everything below only applies to talk pages
  if (!sidebarPanel) return;

  function openSidebar() {
    sidebarPanel.classList.add('open');
    document.body.classList.add('sidebar-open');
  }
  function closeSidebar() {
    sidebarPanel.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }
  notesToggleBtn?.addEventListener('click', () => {
    sidebarPanel.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  closeSidebarBtn?.addEventListener('click', closeSidebar);

  function clearActive() {
    document.querySelectorAll('.note-ref.active-marker').forEach(el => el.classList.remove('active-marker'));
    document.querySelectorAll('.highlight-active-para').forEach(el => el.classList.remove('highlight-active-para'));
    document.querySelectorAll('.note-card.active-note').forEach(el => el.classList.remove('active-note'));
  }

  function highlightMarker(noteId, markerEl, scroll) {
    markerEl = markerEl || document.querySelector(`.note-ref[data-note-id="${noteId}"]`);
    if (!markerEl) return;
    markerEl.classList.add('active-marker');
    const p = markerEl.closest('p');
    if (p) p.classList.add('highlight-active-para');
    if (scroll) markerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Activate a notation from text or endnote
  function activateNotation(noteId, clickedMarker) {
    openSidebar();
    clearActive();
    highlightMarker(noteId, clickedMarker, false);
    const card = document.getElementById(`sidebar-${noteId}`);
    if (card) {
      card.classList.add('active-note');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    history.replaceState(null, '', `#${noteId}`);
  }

  // Focus note back in text from sidebar card
  function focusNoteInText(noteId) {
    clearActive();
    const card = document.getElementById(`sidebar-${noteId}`);
    if (card) card.classList.add('active-note');
    highlightMarker(noteId, null, true);
  }

  document.querySelectorAll('.talk-body .note-ref').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateNotation(btn.dataset.noteId, btn);
    });
  });

  document.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => focusNoteInText(card.dataset.noteId));
  });

  document.querySelectorAll('.endnotes-marker').forEach(marker => {
    marker.addEventListener('click', () => activateNotation(marker.dataset.noteId));
  });

  // Deep link: /talks/<slug>/#note-3
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('note-')) activateNotation(hash);
})();
