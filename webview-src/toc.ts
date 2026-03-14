/**
 * Table of Contents sidebar.
 * Reads H1/H2/H3 nodes from the ProseMirror doc and renders a floating panel.
 * Clicking a heading scrolls the editor to it.
 * Toggled by the #btn-toc button in the topbar.
 */

import type { Editor } from '@tiptap/core';

interface TocEntry {
  level: number;
  text:  string;
  pos:   number;
}

let panel: HTMLElement | null = null;
let isOpen = false;

function getPanel(): HTMLElement {
  if (!panel) {
    panel = document.createElement('nav');
    panel.id = 'toc-panel';
    panel.setAttribute('aria-label', 'Table of Contents');
    document.body.appendChild(panel);
  }
  return panel;
}

function buildEntries(editor: Editor): TocEntry[] {
  const entries: TocEntry[] = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading') {
      entries.push({
        level: node.attrs.level as number,
        text:  node.textContent,
        pos:   offset + 1,
      });
    }
  });
  return entries;
}

function renderToc(editor: Editor) {
  const entries = buildEntries(editor);
  const p = getPanel();

  if (entries.length === 0) {
    p.innerHTML = '<div class="toc-empty">No headings yet</div>';
    return;
  }

  p.innerHTML = entries.map(e => {
    const cls    = `toc-item toc-h${e.level}`;
    // Use CSS custom property so base horizontal padding is preserved
    const indent = (e.level - 1) * 14;
    return `<div class="${cls}" data-pos="${e.pos}" style="--toc-indent:${indent}px">${e.text || '<em>Untitled</em>'}</div>`;
  }).join('');

  p.querySelectorAll<HTMLElement>('.toc-item').forEach(el => {
    el.addEventListener('click', () => {
      const pos = parseInt(el.dataset.pos!, 10);
      editor.commands.focus();
      editor.commands.setTextSelection(pos);
      const dom = editor.view.domAtPos(pos);
      (dom.node as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  });
}

export function initToc(editor: Editor) {
  const btn = document.getElementById('btn-toc')!;

  function open() {
    isOpen = true;
    renderToc(editor);
    getPanel().classList.add('open');
    btn.classList.add('active');
  }

  function close() {
    isOpen = false;
    getPanel().classList.remove('open');
    btn.classList.remove('active');
  }

  btn.addEventListener('click', () => {
    if (isOpen) close(); else open();
  });

  // Re-render when headings change
  editor.on('update', () => {
    if (isOpen) renderToc(editor);
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    const target = e.target as Element;
    if (!target.closest('#toc-panel') && !target.closest('#btn-toc')) close();
  });
}
