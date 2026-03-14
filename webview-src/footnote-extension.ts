/**
 * Footnote support.
 *
 * Markdown syntax:
 *   Inline reference: Some text.[^1]
 *   Definition:       [^1]: The footnote text.
 *
 * Uses markdown-it-footnote for parsing, with three custom Tiptap nodes:
 *   - FootnoteRef  (inline atom) — the [^1] superscript marker
 *   - FootnoteItem (block)       — one footnote definition paragraph
 *   - FootnoteSection (block)    — wraps all FootnoteItems at end of doc
 */

import { Node, mergeAttributes } from '@tiptap/core';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const markdownItFootnote = require('markdown-it-footnote');

// ── FootnoteRef — inline superscript ─────────────────────────────────────────

export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { label: { default: '' } };
  },

  parseHTML() {
    return [{
      tag: 'sup.footnote-ref',
      getAttrs(el) {
        const a = (el as HTMLElement).querySelector('a');
        const href = a?.getAttribute('href') || '';
        // markdown-it-footnote uses #fn1, #fn2... label is the number
        const label = href.replace(/^#fn/, '');
        return { label };
      },
    }];
  },

  renderHTML({ node }) {
    const label = node.attrs.label;
    return ['sup', { class: 'mmw-footnote-ref' },
      ['a', { href: `#fn-${label}`, 'data-fnlabel': label }, label],
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[^${node.attrs.label}]`);
        },
      },
    };
  },
});

// ── FootnoteItem — one definition ─────────────────────────────────────────────

export const FootnoteItem = Node.create({
  name: 'footnoteItem',
  group: '',           // not in 'block' — only appears inside FootnoteSection
  content: 'block+',
  defining: true,

  addAttributes() {
    return { label: { default: '' } };
  },

  parseHTML() {
    return [{
      tag: 'li.footnote-item',
      getAttrs(el) {
        const id = (el as HTMLElement).getAttribute('id') || '';
        const label = id.replace(/^fn/, '');
        return { label };
      },
    }];
  },

  renderHTML({ node }) {
    return ['li', mergeAttributes({ class: 'mmw-footnote-item', id: `fn-${node.attrs.label}` }), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[^${node.attrs.label}]: `);
          // Inline-render the first paragraph's children
          const para = node.firstChild;
          if (para) {
            para.forEach((child: any) => state.renderInline(child));
          }
          state.closeBlock(node);
        },
      },
    };
  },
});

// ── FootnoteSection — wrapper for all footnotes ───────────────────────────────

export const FootnoteSection = Node.create({
  name: 'footnoteSection',
  group: 'block',
  content: 'footnoteItem+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'section.footnotes' }];
  },

  renderHTML() {
    return ['section', { class: 'mmw-footnote-section' }, 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          // Each footnoteItem serializes itself
          node.forEach((item: any) => {
            state.renderNode(item);
          });
        },
        parse: {
          // Add markdown-it-footnote plugin once (guards against double-add)
          setup(md: any) {
            if (!(md as any).__mmwFootnote) {
              md.use(markdownItFootnote);
              (md as any).__mmwFootnote = true;
            }
          },
        },
      },
    };
  },
});
