/**
 * PageBreak — a custom Tiptap block node that:
 *  - Renders as a visual "─── Page Break ───" line in the editor
 *  - Serializes to  <!-- pagebreak -->  in the markdown file
 *  - Parses back from  <!-- pagebreak -->  using a custom markdown-it block rule
 *  - Produces  break-after: page  in @media print
 */

import { Node, mergeAttributes } from '@tiptap/core';

export const PageBreak = Node.create({
  name: 'pageBreak',

  group: 'block',
  atom: true,      // non-editable leaf; no children
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-type="pagebreak"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-type': 'pagebreak', class: 'mmw-page-break' }, HTMLAttributes),
      ['span', {}, 'Page Break'],
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  // ── tiptap-markdown integration ──────────────────────────────────────────
  // getMarkdownSpec() in tiptap-markdown reads extension.storage.markdown
  addStorage() {
    return {
      markdown: {
        // ---- Serializer ------------------------------------------------
        serialize(state: any, _node: any) {
          state.write('<!-- pagebreak -->');
          state.closeBlock(_node);
        },

        // ---- Parser ----------------------------------------------------
        parse: {
          /**
           * Called with the markdown-it instance before parsing.
           * We add a custom block rule that recognises `<!-- pagebreak -->`
           * as a standalone line and emits a <div data-type="pagebreak"> token.
           *
           * This works even with html:false because we use a custom token type
           * (not html_block), so markdown-it's HTML-stripping logic skips it.
           */
          setup(_md: any) {
            _md.block.ruler.before(
              'html_block',
              'pagebreak_rule',
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const lineStart = state.bMarks[startLine] + state.tShift[startLine];
                const lineEnd   = state.eMarks[startLine];
                const line      = state.src.slice(lineStart, lineEnd).trim();

                if (line !== '<!-- pagebreak -->') return false;
                if (silent) return true;

                // Emit open+close tags — the default renderer converts these
                // to <div data-type="pagebreak"></div> in the HTML output
                const open = state.push('pagebreak_open', 'div', 1);
                open.attrSet('data-type', 'pagebreak');
                open.attrSet('class', 'mmw-page-break');
                state.push('pagebreak_close', 'div', -1);

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
