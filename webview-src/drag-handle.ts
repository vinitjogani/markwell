/**
 * Block drag handles + plus button.
 *
 * HOVER: Handled via document.mousemove (not mouseleave/mouseenter which are
 * flaky). We define an "active zone" = prose area + left gutter. While mouse
 * is inside that zone the handles stay visible.
 *
 * DRAG: Uses mousedown→mousemove→mouseup (NOT the HTML5 drag API). This avoids
 * the fragile dataTransfer machinery and the restriction that the drag source
 * must be inside the editor DOM. We follow the cursor with a ghost clone and
 * dispatch a ProseMirror transaction on mouseup.
 */

import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Walk up the DOM until we hit a direct child of proseEl. */
function findTopBlock(target: Node | null, proseEl: HTMLElement): HTMLElement | null {
  let el: Node | null = target;
  while (el) {
    if (el.parentElement === proseEl && el instanceof HTMLElement) return el;
    el = el.parentElement;
    if (!el || el === document.body) return null;
  }
  return null;
}

/**
 * Given a direct child of proseEl, return the ProseMirror position of its
 * *start* (the position before the node, i.e. what you pass to doc.nodeAt()).
 */
function blockNodePos(editor: Editor, el: HTMLElement): number {
  const raw = editor.view.posAtDOM(el, 0);
  const $pos = editor.state.doc.resolve(raw);
  return $pos.depth >= 1 ? $pos.before(1) : raw;
}

// ─── drop indicator ───────────────────────────────────────────────────────────

let dropLine: HTMLDivElement | null = null;

function getDropLine(): HTMLDivElement {
  if (!dropLine) {
    dropLine = document.createElement('div');
    dropLine.style.cssText = [
      'position:fixed',
      'height:2px',
      'background:#2563eb',
      'border-radius:2px',
      'pointer-events:none',
      'z-index:9999',
      'display:none',
      'transition:top 60ms ease',
    ].join(';');
    document.body.appendChild(dropLine);
  }
  return dropLine;
}

function showDropLine(rect: DOMRect, above: boolean) {
  const el = getDropLine();
  const y  = above ? rect.top - 1 : rect.bottom - 1;
  el.style.left    = `${rect.left}px`;
  el.style.width   = `${rect.width}px`;
  el.style.top     = `${y}px`;
  el.style.display = 'block';
}

function hideDropLine() {
  if (dropLine) dropLine.style.display = 'none';
}

// ─── auto-scroll while dragging ──────────────────────────────────────────────

const SCROLL_ZONE = 80; // px from viewport edge
let scrollRafId = 0;

function doAutoScroll(mouseY: number) {
  const page = document.getElementById('page');
  if (!page) return;
  if (mouseY < SCROLL_ZONE) {
    page.scrollBy(0, -8);
  } else if (mouseY > window.innerHeight - SCROLL_ZONE) {
    page.scrollBy(0, 8);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

export function initDragHandles(editor: Editor) {
  const actionsEl = document.getElementById('block-actions')!;
  const plusBtn   = document.getElementById('block-plus')!;
  const dragBtn   = document.getElementById('block-drag')!;
  const proseEl   = editor.view.dom as HTMLElement;

  // ── hover tracking ──────────────────────────────────────────────────────────

  let hoveredEl: HTMLElement | null = null;
  let hoveredPos = -1;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let isDragging = false;

  /** Position handles next to `el` and make them visible. */
  function showHandles(el: HTMLElement, pos: number) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    hoveredEl  = el;
    hoveredPos = pos;

    const r = el.getBoundingClientRect();
    actionsEl.style.top  = `${r.top + 4}px`;
    actionsEl.style.left = `${r.left - 54}px`;
    actionsEl.classList.add('visible');
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      actionsEl.classList.remove('visible');
      hoveredEl  = null;
      hoveredPos = -1;
    }, 600);
  }

  /**
   * True when the mouse is inside the "live zone": the prose content area
   * plus a 60 px gutter on the left where the handles live.
   */
  function inLiveZone(x: number, y: number): boolean {
    const r = proseEl.getBoundingClientRect();
    return x >= r.left - 60 && x <= r.right && y >= r.top && y <= r.bottom;
  }

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (isDragging) return; // drag logic handles movement separately

    if (!inLiveZone(e.clientX, e.clientY)) {
      scheduleHide();
      return;
    }

    // Cancel pending hide — we're still inside the zone
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    // Only care about finding a block when the cursor is over the prose itself
    // (not the handle element in the gutter)
    const elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
    if (!elAtPoint || !proseEl.contains(elAtPoint)) return;

    const block = findTopBlock(elAtPoint, proseEl);
    if (!block) return;

    try {
      const pos = blockNodePos(editor, block);
      if (block !== hoveredEl || pos !== hoveredPos) showHandles(block, pos);
    } catch { /* stale ref, ignore */ }
  });

  // ── plus button ────────────────────────────────────────────────────────────

  plusBtn.addEventListener('click', () => {
    if (hoveredPos < 0) return;

    const node = editor.state.doc.nodeAt(hoveredPos);
    if (!node) return;

    const insertAt = hoveredPos + node.nodeSize;
    const para     = editor.state.schema.nodes.paragraph.create();
    const tr       = editor.state.tr.insert(insertAt, para);
    const sel      = TextSelection.create(tr.doc, insertAt + 1);

    editor.view.dispatch(tr.setSelection(sel).scrollIntoView());
    editor.view.focus();
  });

  // ── drag ────────────────────────────────────────────────────────────────────

  let dragSrcEl:  HTMLElement | null = null;
  let dragSrcPos  = -1;
  let ghost:      HTMLElement | null = null;
  let ghostOffX   = 0;
  let ghostOffY   = 0;

  // Which top-level block is currently targeted (above/below)
  let dropTargetEl:  HTMLElement | null = null;
  let dropAbove      = true;

  dragBtn.addEventListener('mousedown', (e: MouseEvent) => {
    if (hoveredEl === null || hoveredPos < 0) return;
    e.preventDefault();
    e.stopPropagation();

    isDragging  = true;
    dragSrcEl   = hoveredEl;
    dragSrcPos  = hoveredPos;

    // Build ghost
    ghost = dragSrcEl.cloneNode(true) as HTMLElement;
    const srcRect = dragSrcEl.getBoundingClientRect();
    ghostOffX = e.clientX - srcRect.left;
    ghostOffY = e.clientY - srcRect.top;

    ghost.style.cssText = [
      `position:fixed`,
      `left:${srcRect.left}px`,
      `top:${srcRect.top}px`,
      `width:${srcRect.width}px`,
      `opacity:0.55`,
      `pointer-events:none`,
      `z-index:9998`,
      `background:var(--bg)`,
      `border-radius:4px`,
      `box-shadow:0 4px 16px rgba(0,0,0,0.12)`,
      `transform:scale(1.01)`,
    ].join(';');
    document.body.appendChild(ghost);

    // Dim the source
    dragSrcEl.style.opacity = '0.2';

    // Block text selection during drag
    document.body.style.userSelect = 'none';

    // Show initial drop line
    getDropLine(); // ensure created

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragUp);
  });

  function onDragMove(e: MouseEvent) {
    if (!isDragging || !ghost) return;

    // Move ghost with cursor
    ghost.style.left = `${e.clientX - ghostOffX}px`;
    ghost.style.top  = `${e.clientY - ghostOffY}px`;

    // Auto-scroll
    cancelAnimationFrame(scrollRafId);
    scrollRafId = requestAnimationFrame(() => doAutoScroll(e.clientY));

    // Find block under cursor (ghost has pointer-events:none so it's transparent)
    const elAtPoint = document.elementFromPoint(e.clientX, e.clientY);
    if (!elAtPoint) { hideDropLine(); dropTargetEl = null; return; }

    const block = findTopBlock(elAtPoint, proseEl) ??
                  (proseEl.contains(elAtPoint) ? hoveredEl : null);

    if (!block || block === dragSrcEl) { hideDropLine(); dropTargetEl = null; return; }

    const rect  = block.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;

    dropTargetEl = block;
    dropAbove    = above;
    showDropLine(rect, above);
  }

  function onDragUp(e: MouseEvent) {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup',   onDragUp);
    cancelAnimationFrame(scrollRafId);

    // Restore
    if (dragSrcEl)            dragSrcEl.style.opacity = '';
    if (ghost)               { ghost.remove(); ghost = null; }
    document.body.style.userSelect = '';
    hideDropLine();

    isDragging = false;

    // Commit the move if we have a valid target
    if (dropTargetEl && dragSrcPos >= 0 && dropTargetEl !== dragSrcEl) {
      commitMove();
    }

    dropTargetEl = null;
    dragSrcEl    = null;
    dragSrcPos   = -1;
  }

  function commitMove() {
    if (!dropTargetEl || dragSrcPos < 0) return;

    const srcNode = editor.state.doc.nodeAt(dragSrcPos);
    if (!srcNode) return;

    let tgtPos: number;
    try { tgtPos = blockNodePos(editor, dropTargetEl); }
    catch { return; }

    if (tgtPos === dragSrcPos) return;

    const tgtNode = editor.state.doc.nodeAt(tgtPos);
    if (!tgtNode) return;

    // Raw insert position: before or after the target block
    let insertAt = dropAbove ? tgtPos : tgtPos + tgtNode.nodeSize;

    // Account for the deletion shifting positions
    if (insertAt > dragSrcPos) insertAt -= srcNode.nodeSize;

    const tr = editor.state.tr
      .delete(dragSrcPos, dragSrcPos + srcNode.nodeSize)
      .insert(insertAt, srcNode);

    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  }
}
