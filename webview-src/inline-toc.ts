/**
 * InlineToc — a Tiptap block node that renders a live Table of Contents
 * directly in the document body.
 *
 *  - Reads H1/H2/H3 nodes from the ProseMirror doc and renders them as a
 *    styled list with dotted leaders.
 *  - Live-updates via editor 'update' event.
 *  - Clicking an entry scrolls the editor to that heading.
 *  - Serializes as `<!-- toc -->` in the markdown file.
 *  - Parses back with a custom markdown-it block rule.
 *  - Prints cleanly with dotted leaders via CSS.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewRendererProps } from '@tiptap/core';
import { buildHeadingSlugs } from './heading-ids';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineToc: {
      setInlineToc: () => ReturnType;
    };
  }
}

export const InlineToc = Node.create({
  name: 'inlineToc',

  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-type="inline-toc"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-type': 'inline-toc', class: 'mmw-inline-toc' }, HTMLAttributes),
    ];
  },

  addCommands() {
    return {
      setInlineToc:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return ({ editor, node }: NodeViewRendererProps) => {
      const dom = document.createElement('div');
      dom.className = 'mmw-inline-toc';
      dom.setAttribute('data-type', 'inline-toc');
      dom.contentEditable = 'false';

      function render() {
        const entries: { level: number; text: string; pos: number }[] = [];
        editor.state.doc.forEach((n, offset) => {
          if (n.type.name === 'heading') {
            entries.push({
              level: n.attrs.level as number,
              text:  n.textContent,
              pos:   offset + 1,
            });
          }
        });

        const slugs = buildHeadingSlugs(editor.state.doc);

        if (entries.length === 0) {
          dom.innerHTML = `
            <div class="mmw-toc-header">Contents</div>
            <div class="mmw-toc-empty">No headings yet</div>`;
          return;
        }

        dom.innerHTML =
          '<div class="mmw-toc-header">Contents</div>' +
          entries.map(e => {
            const indent = (e.level - 1) * 16;
            const cls = `mmw-toc-entry mmw-toc-h${e.level}`;
            const slug = slugs.get(e.pos) ?? `pos-${e.pos}`;
            return `<a class="${cls}" href="#${slug}" style="--toc-indent:${indent}px" data-pos="${e.pos}">` +
              `<span class="mmw-toc-text">${e.text || '<em>Untitled</em>'}</span>` +
              `<span class="mmw-toc-leader"></span>` +
              `</a>`;
          }).join('');

        dom.querySelectorAll<HTMLElement>('.mmw-toc-entry').forEach(el => {
          el.addEventListener('click', (ev) => {
            ev.preventDefault();
            const pos = parseInt(el.dataset.pos!, 10);
            editor.commands.focus();
            editor.commands.setTextSelection(pos);
            const atPos = editor.view.domAtPos(pos);
            (atPos.node as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          });
        });
      }

      render();

      const onUpdate = () => render();
      editor.on('update', onUpdate);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'inlineToc') return false;
          // Re-render on every doc update (handled via editor.on above)
          return true;
        },
        destroy() {
          editor.off('update', onUpdate);
        },
      };
    };
  },

  // ── tiptap-markdown integration ───────────────────────────────────────────
  addStorage() {
    return {
      markdown: {
        serialize(state: any, _node: any) {
          state.write('<!-- toc -->');
          state.closeBlock(_node);
        },

        parse: {
          setup(_md: any) {
            if ((_md as any).__mmwInlineToc) return;
            (_md as any).__mmwInlineToc = true;

            _md.block.ruler.before(
              'html_block',
              'inline_toc_rule',
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const lineStart = state.bMarks[startLine] + state.tShift[startLine];
                const lineEnd   = state.eMarks[startLine];
                const line      = state.src.slice(lineStart, lineEnd).trim();

                if (line !== '<!-- toc -->') return false;
                if (silent) return true;

                const open = state.push('inline_toc_open', 'div', 1);
                open.attrSet('data-type', 'inline-toc');
                open.attrSet('class', 'mmw-inline-toc');
                state.push('inline_toc_close', 'div', -1);

                state.line = startLine + 1;
                return true;
              },
              { alt: ['paragraph'] }
            );
          },
        },
      },
    };
  },
});
