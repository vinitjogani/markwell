import { createEditor } from './editor';
import { buildPmToMarkdownMap, pmPosToMdOffset } from './selection-sync';
import { initDragHandles } from './drag-handle';
import { initFormatToolbar } from './format-toolbar';
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
    const markdown = getMarkdown();
    post({ type: 'edit', markdown });
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
  return {
    anchorPos: pmPosToMdOffset(ranges, from),
    headPos: pmPosToMdOffset(ranges, to),
  };
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
      break;
    case 'triggerPrint':
      window.print();
      break;
  }
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const cmd = e.metaKey || e.ctrlKey;

  // ⌘K — Cursor inline edit
  if (cmd && e.key === 'k' && !e.shiftKey) {
    const { empty } = editor.state.selection;
    if (!empty) {
      e.preventDefault();
      post({ type: 'revealInSource', ...getSelectionOffsets(), triggerInlineEdit: true });
    }
    return;
  }

  // ⌘L — Cursor chat
  if (cmd && e.key === 'l') {
    const { empty } = editor.state.selection;
    if (!empty) {
      e.preventDefault();
      post({ type: 'revealInSource', ...getSelectionOffsets(), triggerChat: true });
    }
    return;
  }

  // ⌘⇧↵ — Reveal in source (no AI trigger, just view the markdown)
  if (cmd && e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    const { empty } = editor.state.selection;
    if (!empty) {
      post({ type: 'revealInSource', ...getSelectionOffsets() });
    } else {
      // No selection — reveal whole file
      post({ type: 'revealInSource', anchorPos: 0, headPos: 0 });
    }
    return;
  }
});

// ---- Toolbar buttons ----
document.getElementById('btn-reveal')!.addEventListener('click', () => {
  const { empty } = editor.state.selection;
  post({
    type: 'revealInSource',
    ...(empty ? { anchorPos: 0, headPos: 0 } : getSelectionOffsets()),
  });
});

document.getElementById('btn-print')!.addEventListener('click', () => window.print());

// ---- Doc title from H1 ----
function updateDocTitle() {
  const titleEl = document.getElementById('doc-title')!;
  const firstHeading = editor.state.doc.firstChild;
  if (firstHeading?.type.name === 'heading') {
    titleEl.textContent = firstHeading.textContent;
  } else {
    titleEl.textContent = '';
  }
}

editor.on('update', updateDocTitle);

// ---- Init sub-systems ----
initDragHandles(editor);
initFormatToolbar(editor, post);

// ---- Signal ready ----
post({ type: 'ready' });
