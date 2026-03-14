import type { Editor } from '@tiptap/core';

const HIDE_DELAY = 600;

/**
 * Finds the direct child of `.mmw-prose` that contains or is the target element.
 */
function findTopLevelBlock(target: Element, proseEl: Element): HTMLElement | null {
  let el: Element | null = target;
  while (el && el.parentElement !== proseEl) {
    el = el.parentElement;
  }
  if (el && el !== proseEl && el instanceof HTMLElement) return el;
  return null;
}

export function initDragHandles(editor: Editor) {
  const actionsEl = document.getElementById('block-actions')!;
  const plusBtn = document.getElementById('block-plus')!;
  const dragBtn = document.getElementById('block-drag')!;
  const proseEl = editor.view.dom as HTMLElement;
  const page = document.getElementById('page')!;

  let currentBlock: HTMLElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function showAt(block: HTMLElement) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    currentBlock = block;
    const rect = block.getBoundingClientRect();

    // Position to the left of the block, vertically centered on its first line (~12px from top)
    actionsEl.style.top = `${rect.top + 4}px`;
    // Sit in the left gutter — 48px left of the block's left edge
    actionsEl.style.left = `${rect.left - 52}px`;
    actionsEl.classList.add('visible');
  }

  function scheduleHide() {
    hideTimer = setTimeout(() => {
      actionsEl.classList.remove('visible');
      currentBlock = null;
    }, HIDE_DELAY);
  }

  // Track mouse over prose content
  proseEl.addEventListener('mousemove', (e: MouseEvent) => {
    const target = e.target as Element;
    if (target === proseEl) return;
    const block = findTopLevelBlock(target, proseEl);
    if (block && block !== currentBlock) showAt(block);
  });

  proseEl.addEventListener('mouseleave', scheduleHide);

  // Keep visible while hovering the handles themselves
  actionsEl.addEventListener('mouseenter', () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    actionsEl.classList.add('visible');
  });
  actionsEl.addEventListener('mouseleave', scheduleHide);

  // "+" button — insert a new paragraph below the hovered block
  plusBtn.addEventListener('click', () => {
    if (!currentBlock) return;
    const pos = editor.view.posAtDOM(currentBlock, currentBlock.childNodes.length);
    editor.chain()
      .focus()
      .insertContentAt(pos, { type: 'paragraph' })
      .setTextSelection(pos + 1)
      .run();
  });

  // Drag handle — use ProseMirror's built-in drag mechanism
  dragBtn.addEventListener('dragstart', (e: DragEvent) => {
    if (!currentBlock || !e.dataTransfer) return;

    try {
      // Get the ProseMirror position of the block being dragged
      const startPos = editor.view.posAtDOM(currentBlock, 0);
      const $pos = editor.state.doc.resolve(startPos);
      const nodePos = $pos.before($pos.depth);
      const node = editor.state.doc.nodeAt(nodePos);
      if (!node) return;

      // Create a ProseMirror slice for the dragged node
      const { Slice, Fragment } = (editor.schema as any).cached
        ? { Slice: (window as any).__tiptap_pm_Slice, Fragment: (window as any).__tiptap_pm_Fragment }
        : { Slice: null, Fragment: null };

      // Fall back: let ProseMirror handle it by making the element draggable
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', currentBlock.textContent ?? '');

      // Mark the dragged block visually
      currentBlock.style.opacity = '0.4';
      const cleanup = () => {
        if (currentBlock) currentBlock.style.opacity = '';
        dragBtn.removeEventListener('dragend', cleanup);
      };
      dragBtn.addEventListener('dragend', cleanup);

    } catch {
      // Ignore drag errors
    }
  });

  // Update position on scroll
  page.addEventListener('scroll', () => {
    if (currentBlock) showAt(currentBlock);
  }, { passive: true });
}
