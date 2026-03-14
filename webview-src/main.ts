import { createEditor } from './editor';
import { buildPmToMarkdownMap, pmPosToMdOffset } from './selection-sync';
import { initDragHandles } from './drag-handle';
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

// ---- Extension → Webview ----
window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { type: string; markdown?: string };
  switch (msg.type) {
    case 'init':
    case 'update':
      if (msg.markdown == null) return;
      isUpdatingFromExtension = true;
      editor.commands.setContent(msg.markdown, false);
      isUpdatingFromExtension = false;
      updateDocTitle();
      updateWordCount();
      break;
  }
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const cmd = e.metaKey || e.ctrlKey;
  if (!cmd) return;

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
document.getElementById('btn-reveal')!.addEventListener('click', () => {
  const { empty } = editor.state.selection;
  post({ type: 'revealInSource', ...(empty ? { anchorPos: 0, headPos: 0 } : getSelectionOffsets()) });
});

document.getElementById('btn-print')!.addEventListener('click', () => {
  const proseHtml = (editor.view.dom as HTMLElement).innerHTML;
  post({ type: 'print', proseHtml });
});

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
initFormatToolbar(editor, post);
addImagePasteHandler(editor);
initImageToolbar(editor);
initToc(editor);

// ---- Signal ready ----
post({ type: 'ready' });
