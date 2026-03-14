import type { Editor } from '@tiptap/core';

type PostFn = (msg: unknown) => void;

export function initFormatToolbar(editor: Editor, postMessage: PostFn) {
  const toolbar = document.getElementById('format-toolbar')!;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function show(x: number, y: number) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    toolbar.style.left = `${x}px`;
    toolbar.style.top = `${y}px`;
    // Force display before adding .visible so transition works
    toolbar.style.display = 'flex';
    // Flush then animate
    requestAnimationFrame(() => toolbar.classList.add('visible'));
  }

  function hide(immediate = false) {
    if (immediate) {
      toolbar.classList.remove('visible');
      toolbar.style.display = 'none';
      return;
    }
    hideTimer = setTimeout(() => {
      toolbar.classList.remove('visible');
      toolbar.style.display = 'none';
    }, 200);
  }

  // Update active states on buttons
  function updateActiveStates() {
    toolbar.querySelectorAll('button[data-fmt]').forEach((btn) => {
      const fmt = (btn as HTMLElement).dataset.fmt!;
      const active =
        (fmt === 'bold' && editor.isActive('bold')) ||
        (fmt === 'italic' && editor.isActive('italic')) ||
        (fmt === 'strike' && editor.isActive('strike')) ||
        (fmt === 'code' && editor.isActive('code'));
      btn.classList.toggle('active', active);
    });
  }

  // Position the toolbar centered above the current selection
  function positionAboveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hide(); return; }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { hide(); return; }

    // Center above the selection; toolbar uses translateX(-50%)
    show(rect.left + rect.width / 2, rect.top - 44 + window.scrollY);
    updateActiveStates();
  }

  // Show/hide based on selection changes
  editor.on('selectionUpdate', () => {
    const { empty } = editor.state.selection;
    if (empty) {
      hide();
    } else {
      // Small delay so the browser has updated window.getSelection()
      requestAnimationFrame(positionAboveSelection);
    }
  });

  // Also update on mouseup (covers click-drag selections)
  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hide(); return; }
      positionAboveSelection();
    }, 10);
  });

  // Keep visible while interacting with toolbar
  toolbar.addEventListener('mouseenter', () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  toolbar.addEventListener('mouseleave', () => hide());

  // Button click handlers
  toolbar.addEventListener('mousedown', (e: MouseEvent) => {
    const btn = (e.target as Element).closest('button[data-fmt]') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault(); // Don't steal focus from editor

    const fmt = btn.dataset.fmt!;
    switch (fmt) {
      case 'bold':   editor.chain().focus().toggleBold().run(); break;
      case 'italic': editor.chain().focus().toggleItalic().run(); break;
      case 'strike': editor.chain().focus().toggleStrike().run(); break;
      case 'code':   editor.chain().focus().toggleCode().run(); break;

      case 'ai-edit':
        sendRevealInSource(postMessage, editor, true, false);
        hide(true);
        break;
      case 'ai-chat':
        sendRevealInSource(postMessage, editor, false, true);
        hide(true);
        break;
    }
    updateActiveStates();
  });
}

function sendRevealInSource(
  postMessage: PostFn,
  editor: Editor,
  triggerInlineEdit: boolean,
  triggerChat: boolean
) {
  // Lazy import to avoid circular dependency
  import('./selection-sync').then(({ buildPmToMarkdownMap, pmPosToMdOffset }) => {
    const { from, to } = editor.state.selection;
    const ranges = buildPmToMarkdownMap(editor);
    postMessage({
      type: 'revealInSource',
      anchorPos: pmPosToMdOffset(ranges, from),
      headPos: pmPosToMdOffset(ranges, to),
      triggerInlineEdit,
      triggerChat,
    });
  });
}
