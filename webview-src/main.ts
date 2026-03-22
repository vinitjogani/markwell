import { createEditor } from './editor';
import { buildPmToMarkdownMap, pmPosToMdOffset } from './selection-sync';
import { initDragHandles } from './drag-handle';
import { initTableHoverUI } from './table-hover-ui';
import { initFormatToolbar } from './format-toolbar';
import { addImagePasteHandler, initImageToolbar } from './image-extension';
import { initToc } from './toc';
import './styles.css';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const post = (msg: unknown) => vscode.postMessage(msg);

// ---- State ----
let isUpdatingFromExtension = false;

// ---- Editor ----
const editorEl = document.getElementById('editor')!;

const editor = createEditor(
  editorEl,
  () => {
    if (isUpdatingFromExtension) return;
    post({ type: 'edit', markdown: getMarkdown() });
  },
  () => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const ranges = buildPmToMarkdownMap(editor);
    post({
      type: 'selectionChange',
      anchorPos: pmPosToMdOffset(ranges, from),
      headPos: pmPosToMdOffset(ranges, to),
      selectedText: editor.state.doc.textBetween(from, to, ' '),
    });
  }
);

function getMarkdown(): string {
  return (editor.storage.markdown as { getMarkdown(): string }).getMarkdown();
}

function getSelectionOffsets() {
  const { from, to } = editor.state.selection;
  const ranges = buildPmToMarkdownMap(editor);
  return { anchorPos: pmPosToMdOffset(ranges, from), headPos: pmPosToMdOffset(ranges, to) };
}

function applyExternalMarkdown(markdown: string) {
  if (getMarkdown() === markdown) return;

  const prevSelection = editor.state.selection;
  isUpdatingFromExtension = true;
  editor.commands.setContent(markdown, false);
  isUpdatingFromExtension = false;

  const maxPos = Math.max(1, editor.state.doc.content.size);
  const from = Math.max(1, Math.min(prevSelection.from, maxPos));
  const to = Math.max(1, Math.min(prevSelection.to, maxPos));
  editor.commands.setTextSelection({ from, to });
}

// ---- Extension → Webview ----
window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { type: string; markdown?: string; format?: string };
  switch (msg.type) {
    case 'init':
    case 'update':
      if (msg.markdown == null) return;
      applyExternalMarkdown(msg.markdown);
      updateDocTitle();
      updateWordCount();
      break;
    case 'format':
      if (msg.format === 'bold') editor.chain().focus().toggleBold().run();
      else if (msg.format === 'italic') editor.chain().focus().toggleItalic().run();
      else if (msg.format === 'underline') editor.chain().focus().toggleUnderline().run();
      else if (msg.format === 'link') {
        if (editor.isActive('link')) editor.chain().focus().unsetLink().run();
        else import('./format-toolbar').then(({ promptLink }) => promptLink(editor));
      }
      break;
    case 'requestContentForSave':
      post({ type: 'contentForSave', markdown: getMarkdown() });
      break;
  }
});

editorEl.addEventListener('focusin', () => post({ type: 'focus' }));
editorEl.addEventListener('focusout', (e: FocusEvent) => {
  if (!e.relatedTarget || !editorEl.contains(e.relatedTarget as Node)) {
    post({ type: 'blur' });
  }
});

// ---- Keyboard shortcuts ----
function handleFormatShortcut(e: KeyboardEvent): boolean {
  const cmd = e.metaKey || e.ctrlKey;
  if (!cmd || e.shiftKey || e.altKey) return false;

  const key = e.key.toLowerCase();
  if (key === 'b') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    editor.chain().focus().toggleBold().run();
    return true;
  }
  if (key === 'i') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    editor.chain().focus().toggleItalic().run();
    return true;
  }
  if (key === 'u') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    editor.chain().focus().toggleUnderline().run();
    return true;
  }
  if (key === 'k') {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (editor.isActive('link')) editor.chain().focus().unsetLink().run();
    else import('./format-toolbar').then(({ promptLink }) => promptLink(editor));
    return true;
  }

  return false;
}

function handleSaveShortcut(e: KeyboardEvent): boolean {
  const cmd = e.metaKey || e.ctrlKey;
  if (!cmd || e.shiftKey || e.altKey) return false;
  if (e.key.toLowerCase() !== 's') return false;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  post({ type: 'save', markdown: getMarkdown() });
  return true;
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (handleSaveShortcut(e)) return;
  handleFormatShortcut(e);
}, { capture: true });

document.addEventListener('keydown', (e: KeyboardEvent) => {
  const cmd = e.metaKey || e.ctrlKey;
  if (!cmd) return;
  if (handleSaveShortcut(e)) return;
  if (handleFormatShortcut(e)) return;

  // ⌘⇧K → reveal + trigger Cursor inline edit
  if (e.shiftKey && (e.key === 'K' || e.key === 'k')) {
    if (!editor.state.selection.empty) {
      e.preventDefault();
      e.stopPropagation();
      post({ type: 'revealInSource', ...getSelectionOffsets(), triggerInlineEdit: true });
    }
    return;
  }

  // ⌘⇧L → reveal + trigger Cursor chat
  if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
    if (!editor.state.selection.empty) {
      e.preventDefault();
      e.stopPropagation();
      post({ type: 'revealInSource', ...getSelectionOffsets(), triggerChat: true });
    }
    return;
  }

  // ⌘⇧↵ → reveal source (no AI)
  if (e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    const { empty } = editor.state.selection;
    post({ type: 'revealInSource', ...(empty ? { anchorPos: 0, headPos: 0 } : getSelectionOffsets()) });
  }
});

// ---- Toolbar buttons ----
function revealSelectionInSource() {
  const { empty } = editor.state.selection;
  post({ type: 'revealInSource', ...(empty ? { anchorPos: 0, headPos: 0 } : getSelectionOffsets()) });
}

function printDocument() {
  const proseHtml = (editor.view.dom as HTMLElement).innerHTML;
  post({ type: 'print', proseHtml });
}

function bindTopbarButton(id: string, action: () => void) {
  const button = document.getElementById(id)!;
  button.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    action();
  });
  button.addEventListener('click', (e: MouseEvent) => {
    if (e.detail === 0) action();
  });
}

bindTopbarButton('btn-reveal', revealSelectionInSource);
bindTopbarButton('btn-print', printDocument);

// ---- Live doc title (from first H1) ----
function updateDocTitle() {
  const el = document.getElementById('doc-title')!;
  const first = editor.state.doc.firstChild;
  el.textContent = first?.type.name === 'heading' ? first.textContent : '';
}
editor.on('update', updateDocTitle);

// ---- Word count ----
function updateWordCount() {
  const text = editor.state.doc.textContent;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const el = document.getElementById('word-count');
  if (el) el.textContent = words === 1 ? '1 word' : `${words.toLocaleString()} words`;
}
editor.on('update', updateWordCount);

// ---- Init sub-systems ----
initDragHandles(editor);
initTableHoverUI(editor);
initFormatToolbar(editor, post);
addImagePasteHandler(editor);
initImageToolbar(editor);
initToc(editor);

// ---- Signal ready ----
post({ type: 'ready' });
