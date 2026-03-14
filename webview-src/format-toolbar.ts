import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

type PostFn = (msg: unknown) => void;

// ── Colour palettes ───────────────────────────────────────────────────────────

const TEXT_COLORS = [
  { label: 'Default',  value: '' },
  { label: 'Gray',     value: '#6b7280' },
  { label: 'Red',      value: '#dc2626' },
  { label: 'Orange',   value: '#ea580c' },
  { label: 'Yellow',   value: '#ca8a04' },
  { label: 'Green',    value: '#16a34a' },
  { label: 'Blue',     value: '#2563eb' },
  { label: 'Purple',   value: '#9333ea' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None',   value: '' },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green',  value: '#bbf7d0' },
  { label: 'Blue',   value: '#bfdbfe' },
  { label: 'Pink',   value: '#fbcfe8' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'Purple', value: '#e9d5ff' },
  { label: 'Gray',   value: '#e5e7eb' },
];

// ── Shared popup state ────────────────────────────────────────────────────────
// Tracks whether any auxiliary popup (colour, link popover) is open.
// While open, the format toolbar must NOT hide.

let auxPopupOpen = false;

function setAuxPopup(open: boolean) {
  auxPopupOpen = open;
}

// ── Colour palette popup ──────────────────────────────────────────────────────

let colorPop: HTMLElement | null = null;
let colorPopEditor: Editor | null = null;
let colorMode: 'text' | 'highlight' = 'text';
let colorPopHideTimer: ReturnType<typeof setTimeout> | null = null;

function getColorPop(): HTMLElement {
  if (!colorPop) {
    colorPop = document.createElement('div');
    colorPop.id = 'color-pop';
    document.body.appendChild(colorPop);

    colorPop.addEventListener('mouseenter', () => {
      if (colorPopHideTimer) { clearTimeout(colorPopHideTimer); colorPopHideTimer = null; }
    });

    colorPop.addEventListener('mouseleave', () => {
      colorPopHideTimer = setTimeout(() => hideColorPop(), 300);
    });

    colorPop.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const swatch = (e.target as Element).closest('[data-color]') as HTMLElement | null;
      if (!swatch || !colorPopEditor) return;
      const val = swatch.dataset.color!;
      if (colorMode === 'text') {
        val ? colorPopEditor.chain().focus().setColor(val).run()
            : colorPopEditor.chain().focus().unsetColor().run();
      } else {
        val ? colorPopEditor.chain().focus().setHighlight({ color: val }).run()
            : colorPopEditor.chain().focus().unsetHighlight().run();
      }
      hideColorPop();
    });
  }
  return colorPop;
}

function showColorPop(editor: Editor, anchorEl: HTMLElement, mode: 'text' | 'highlight') {
  colorPopEditor = editor;
  colorMode = mode;
  const pop     = getColorPop();
  const palette = mode === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS;

  pop.innerHTML = palette.map(c => {
    const bg  = mode === 'text' ? (c.value || 'var(--text)') : (c.value || 'transparent');
    const bdr = c.value ? 'none' : '1.5px dashed rgba(255,255,255,0.3)';
    return `<button data-color="${c.value}" title="${c.label}" style="background:${bg};border:${bdr};"></button>`;
  }).join('');

  const rect = anchorEl.getBoundingClientRect();
  pop.style.left    = `${rect.left}px`;
  pop.style.top     = `${rect.bottom + 6}px`;
  pop.style.display = 'grid';
  setAuxPopup(true);
}

function hideColorPop() {
  if (colorPop) colorPop.style.display = 'none';
  setAuxPopup(false);
}

// ── Link popover ──────────────────────────────────────────────────────────────

let linkPopover: HTMLElement | null = null;
let linkPopoverEditor: Editor | null = null;

function getLinkPopover(): HTMLElement {
  if (!linkPopover) {
    linkPopover = document.createElement('div');
    linkPopover.id = 'link-popover';
    linkPopover.innerHTML =
      `<a id="lp-href" target="_blank" rel="noopener"></a>` +
      `<span class="lp-sep"></span>` +
      `<button id="lp-edit">Edit</button>` +
      `<button id="lp-unlink">Unlink</button>`;
    document.body.appendChild(linkPopover);

    document.getElementById('lp-unlink')!.addEventListener('mousedown', (e) => {
      e.preventDefault();
      linkPopoverEditor?.chain().focus().unsetLink().run();
      hideLinkPopover();
    });
    document.getElementById('lp-edit')!.addEventListener('mousedown', (e) => {
      e.preventDefault();
      promptLink(linkPopoverEditor!, true);
    });
  }
  return linkPopover;
}

function showLinkPopover(editor: Editor, anchorEl: HTMLElement) {
  linkPopoverEditor = editor;
  const href = editor.getAttributes('link').href || '';
  const pop  = getLinkPopover();
  const a    = document.getElementById('lp-href') as HTMLAnchorElement;
  a.href        = href;
  a.textContent = href.length > 40 ? href.slice(0, 38) + '…' : href;
  const rect    = anchorEl.getBoundingClientRect();
  pop.style.left    = `${rect.left}px`;
  pop.style.top     = `${rect.bottom + 6}px`;
  pop.style.display = 'flex';
  setAuxPopup(true);
}

function hideLinkPopover() {
  if (linkPopover) linkPopover.style.display = 'none';
  setAuxPopup(false);
}

// ── Inline link input (in toolbar) ───────────────────────────────────────────

let linkInputVisible = false;

function showLinkInput(toolbar: HTMLElement, onConfirm: (url: string) => void, initial = '') {
  const input = toolbar.querySelector<HTMLInputElement>('#ft-link-input')!;
  const wrap  = toolbar.querySelector<HTMLElement>('.ft-link-input-wrap')!;
  input.value = initial;
  wrap.style.display = 'flex';
  linkInputVisible = true;
  setAuxPopup(true);
  requestAnimationFrame(() => input.focus());

  const done = () => {
    wrap.style.display = 'none';
    linkInputVisible = false;
    setAuxPopup(false);
    const url = input.value.trim();
    if (url) onConfirm(url.startsWith('http') ? url : `https://${url}`);
    input.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); done(); }
    if (e.key === 'Escape') {
      wrap.style.display = 'none';
      linkInputVisible = false;
      setAuxPopup(false);
      input.removeEventListener('keydown', onKey);
    }
  };
  input.addEventListener('keydown', onKey);
  input.addEventListener('blur', done, { once: true });
}

function promptLink(editor: Editor, editExisting = false) {
  const toolbar   = document.getElementById('format-toolbar')!;
  const existing  = editExisting ? editor.getAttributes('link').href || '' : '';
  showLinkInput(toolbar, (url) => {
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, existing);
}

// ── Main toolbar ──────────────────────────────────────────────────────────────

export function initFormatToolbar(editor: Editor, postMessage: PostFn) {
  const toolbar = document.getElementById('format-toolbar')!;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let isVisible = false;

  // Add link input to toolbar
  const linkWrap = document.createElement('div');
  linkWrap.className = 'ft-link-input-wrap';
  linkWrap.style.display = 'none';
  linkWrap.innerHTML =
    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>` +
    `<input id="ft-link-input" type="url" placeholder="Paste or type a URL…" autocomplete="off" spellcheck="false">`;
  toolbar.appendChild(linkWrap);

  // ---- Show / hide ----

  function show(centerX: number, topY: number) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    toolbar.style.top     = `${topY}px`;
    toolbar.style.display = 'flex';
    requestAnimationFrame(() => {
      // Clamp so the toolbar never goes off the left or right edge
      const tbHalf = toolbar.offsetWidth / 2;
      const margin = 8;
      const clamped = Math.max(margin + tbHalf, Math.min(window.innerWidth - margin - tbHalf, centerX));
      toolbar.style.left = `${clamped}px`;
      toolbar.classList.add('visible');
      isVisible = true;
    });
  }

  function hide(immediate = false) {
    // Never hide while an auxiliary popup is open
    if (auxPopupOpen) return;
    if (immediate) {
      toolbar.classList.remove('visible');
      toolbar.style.display = 'none';
      isVisible = false;
      hideColorPop();
      hideLinkPopover();
      return;
    }
    hideTimer = setTimeout(() => {
      if (auxPopupOpen) return; // re-check before actually hiding
      toolbar.classList.remove('visible');
      toolbar.style.display = 'none';
      isVisible = false;
      hideColorPop();
      hideLinkPopover();
    }, 180);
  }

  // ---- Active states ----

  function syncActive() {
    toolbar.querySelectorAll<HTMLElement>('button[data-fmt]').forEach(btn => {
      const f = btn.dataset.fmt!;
      btn.classList.toggle('active',
        (f === 'bold'      && editor.isActive('bold'))        ||
        (f === 'italic'    && editor.isActive('italic'))      ||
        (f === 'underline' && editor.isActive('underline'))   ||
        (f === 'strike'    && editor.isActive('strike'))      ||
        (f === 'code'      && editor.isActive('code'))        ||
        (f === 'link'      && editor.isActive('link'))        ||
        (f === 'highlight' && editor.isActive('highlight'))   ||
        (f === 'sup'       && editor.isActive('superscript')) ||
        (f === 'sub'       && editor.isActive('subscript'))
      );
    });
    const colorDot = toolbar.querySelector<HTMLElement>('.ft-color-dot');
    if (colorDot) colorDot.style.background = editor.getAttributes('textStyle').color || 'var(--ft-text)';
    const hlDot = toolbar.querySelector<HTMLElement>('.ft-hl-dot');
    if (hlDot) {
      const c = editor.getAttributes('highlight').color;
      hlDot.style.background = c || 'transparent';
      hlDot.style.border     = c ? 'none' : '1.5px dashed rgba(255,255,255,0.5)';
    }
  }

  // ---- Position ----

  function positionAboveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hide(); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) { hide(); return; }
    show(rect.left + rect.width / 2, rect.top - 44);
    syncActive();
  }

  // ---- React to selection ----

  editor.on('selectionUpdate', ({ editor: ed }) => {
    // NodeSelection (e.g. image selected) → format toolbar not relevant
    if (ed.state.selection instanceof NodeSelection) {
      hide(true);
      return;
    }
    if (ed.state.selection.empty) {
      if (ed.isActive('link')) {
        const anchor = window.getSelection()?.anchorNode?.parentElement?.closest('a');
        if (anchor) showLinkPopover(ed, anchor); else hideLinkPopover();
      } else {
        hideLinkPopover();
      }
      hide();
    } else {
      hideLinkPopover();
      requestAnimationFrame(positionAboveSelection);
    }
  });

  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      // Don't show for NodeSelection (image etc.)
      if (editor.state.selection instanceof NodeSelection) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { if (!auxPopupOpen) hide(); return; }
      positionAboveSelection();
    }, 20);
  });

  // ---- Toolbar mouse interaction ----

  toolbar.addEventListener('mouseenter', () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });

  // Start a delayed hide when leaving the toolbar, but allow colour pop to cancel it
  toolbar.addEventListener('mouseleave', () => {
    if (!auxPopupOpen) hide();
    // If colour popup is open, do nothing — popup's own mouseleave handles closing
  });

  toolbar.addEventListener('mousedown', (e: MouseEvent) => {
    const btn = (e.target as Element).closest('button[data-fmt]') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();

    const fmt = btn.dataset.fmt!;
    switch (fmt) {
      case 'bold':      editor.chain().focus().toggleBold().run();        break;
      case 'italic':    editor.chain().focus().toggleItalic().run();      break;
      case 'underline': editor.chain().focus().toggleUnderline().run();   break;
      case 'strike':    editor.chain().focus().toggleStrike().run();      break;
      case 'code':      editor.chain().focus().toggleCode().run();        break;
      case 'sup':       editor.chain().focus().toggleSuperscript().run(); break;
      case 'sub':       editor.chain().focus().toggleSubscript().run();   break;
      case 'link':
        editor.isActive('link')
          ? editor.chain().focus().unsetLink().run()
          : promptLink(editor);
        break;
      case 'color':     showColorPop(editor, btn, 'text');      break;
      case 'highlight': showColorPop(editor, btn, 'highlight'); break;
      case 'ai-edit':   triggerAI(true,  false); hide(true); break;
      case 'ai-chat':   triggerAI(false, true);  hide(true); break;
    }
    requestAnimationFrame(syncActive);
  });

  function triggerAI(triggerInlineEdit: boolean, triggerChat: boolean) {
    import('./selection-sync').then(({ buildPmToMarkdownMap, pmPosToMdOffset }) => {
      const { from, to } = editor.state.selection;
      if (from === to) return;
      const ranges = buildPmToMarkdownMap(editor);
      postMessage({
        type: 'revealInSource',
        anchorPos: pmPosToMdOffset(ranges, from),
        headPos:   pmPosToMdOffset(ranges, to),
        triggerInlineEdit,
        triggerChat,
      });
    });
  }
}
