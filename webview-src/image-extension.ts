/**
 * Image extension — block image node with resizable width.
 *
 * Uses addNodeView() so attribute updates (width changes) immediately
 * reflect in the DOM without requiring a full re-render.
 *
 * Markdown round-trip: ![alt](src "w=50%")
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor, NodeViewRendererProps } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage:      (attrs: { src: string; alt?: string; width?: string }) => ReturnType;
      setImageWidth: (width: string) => ReturnType;
    };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const ImageExtension = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src:   { default: null },
      alt:   { default: null },
      width: {
        default: '100%',
        parseHTML(el: HTMLElement) {
          const dw = el.getAttribute('data-width');
          if (dw) return dw;
          const title = el.getAttribute('title') || '';
          const m = title.match(/^w=(\d+%)$/);
          return m ? m[1] : '100%';
        },
        renderHTML() { return {}; },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  // renderHTML is used for copy/paste and print serialisation
  renderHTML({ HTMLAttributes }) {
    const { src, alt, width } = HTMLAttributes;
    return ['img', mergeAttributes({
      src: src || '', alt: alt || '',
      class: 'mmw-image',
      'data-width': width || '100%',
      style: `width:${width || '100%'}`,
    })];
  },

  // addNodeView ensures attribute updates immediately update the DOM element
  addNodeView() {
    return ({ node }: NodeViewRendererProps) => {
      const img = document.createElement('img');
      img.className = 'mmw-image';

      function sync(n: typeof node) {
        img.src            = n.attrs.src  || '';
        img.alt            = n.attrs.alt  || '';
        img.style.width    = n.attrs.width || '100%';
        img.setAttribute('data-width', n.attrs.width || '100%');
        img.setAttribute('title', n.attrs.alt || '');
      }

      sync(node);

      return {
        dom: img,
        update(updatedNode) {
          if (updatedNode.type.name !== 'image') return false;
          sync(updatedNode);
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      setImage:      (attrs) => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
      setImageWidth: (width) => ({ commands }) => commands.updateAttributes(this.name, { width }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { src, alt, width } = node.attrs;
          const titlePart = width && width !== '100%' ? ` "w=${width}"` : '';
          state.write(`![${alt || ''}](${src || ''}${titlePart})`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

// ── Paste / drop ──────────────────────────────────────────────────────────────

export function addImagePasteHandler(editor: Editor) {
  editor.view.dom.addEventListener('paste', async (e: ClipboardEvent) => {
    const img = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
    if (!img) return;
    e.preventDefault();
    const blob = img.getAsFile();
    if (!blob) return;
    editor.chain().focus().setImage({ src: await blobToDataUrl(blob), width: '100%' }).run();
  });

  editor.view.dom.addEventListener('drop', async (e: DragEvent) => {
    const file = Array.from(e.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    editor.chain().focus().setImage({ src: await blobToDataUrl(file), width: '100%' }).run();
  }, true);
}

// ── Image width toolbar ───────────────────────────────────────────────────────

const WIDTH_STEPS = [
  { label: '¼', value: '25%'  },
  { label: '½', value: '50%'  },
  { label: '¾', value: '75%'  },
  { label: 'Full', value: '100%' },
];

let imgToolbar: HTMLElement | null = null;
let imgToolbarEditor: Editor | null = null;
let imgNodePos = -1;

function getImgToolbar(): HTMLElement {
  if (!imgToolbar) {
    imgToolbar = document.createElement('div');
    imgToolbar.id = 'img-toolbar';
    imgToolbar.innerHTML =
      WIDTH_STEPS.map(s => `<button data-w="${s.value}">${s.label}</button>`).join('') +
      `<span class="img-tb-sep"></span>` +
      `<button data-w="remove" title="Remove image"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    document.body.appendChild(imgToolbar);

    imgToolbar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const btn = (e.target as Element).closest('button[data-w]') as HTMLElement | null;
      if (!btn || !imgToolbarEditor) return;
      const w = btn.dataset.w!;
      if (w === 'remove') {
        imgToolbarEditor.chain().focus().deleteSelection().run();
        hideImgToolbar();
      } else {
        // Update via direct transaction on the stored position
        if (imgNodePos >= 0) {
          const { state, view } = imgToolbarEditor;
          const node = state.doc.nodeAt(imgNodePos);
          if (node?.type.name === 'image') {
            view.dispatch(state.tr.setNodeMarkup(imgNodePos, undefined, { ...node.attrs, width: w }));
          }
        }
        syncImgToolbarActive(w);
      }
    });
  }
  return imgToolbar;
}

function syncImgToolbarActive(currentWidth: string) {
  getImgToolbar().querySelectorAll<HTMLElement>('button[data-w]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.w === currentWidth);
  });
}

function positionImgToolbar(imgDom: HTMLElement, width: string) {
  const tb   = getImgToolbar();
  const rect = imgDom.getBoundingClientRect();
  tb.style.left    = `${rect.left}px`;
  tb.style.top     = `${rect.bottom + 7}px`;
  tb.style.display = 'flex';
  syncImgToolbarActive(width);
}

export function hideImgToolbar() {
  if (imgToolbar) imgToolbar.style.display = 'none';
  imgNodePos = -1;
}

export function initImageToolbar(editor: Editor) {
  imgToolbarEditor = editor;

  editor.on('selectionUpdate', ({ editor: ed }) => {
    const sel = ed.state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === 'image') {
      imgNodePos = sel.from;
      const dom = ed.view.nodeDOM(sel.from) as HTMLElement | null;
      if (dom) positionImgToolbar(dom, sel.node.attrs.width || '100%');
    } else {
      hideImgToolbar();
    }
  });

  editor.on('blur', () => setTimeout(hideImgToolbar, 150));

  // Click image → NodeSelection
  // For a NodeView where dom === img, the reliable way to get the PM position
  // is posAtDOM(parent, childIndex) — this gives the position just before the node.
  editor.view.dom.addEventListener('click', (e: MouseEvent) => {
    const img = (e.target as Element).closest('img.mmw-image') as HTMLElement | null;
    if (!img) return;
    try {
      const parent = img.parentElement;
      if (!parent) return;
      const index  = Array.from(parent.childNodes).indexOf(img as ChildNode);
      const pos    = editor.view.posAtDOM(parent, index);
      const node   = editor.state.doc.nodeAt(pos);
      if (node?.type.name === 'image') {
        editor.view.dispatch(
          editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))
        );
      }
    } catch { /* ignore */ }
  });
}
