/**
 * Math / LaTeX via KaTeX.
 *
 * Uses addNodeView() so KaTeX HTML is injected as innerHTML
 * rather than being escaped as text by Tiptap's renderHTML array format.
 *
 * Inline:  $E = mc^2$
 * Block:   $$\sum_{i=1}^n x_i$$
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewRendererProps } from '@tiptap/core';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false, output: 'html' });
  } catch {
    return `<span class="mmw-math-error">${latex}</span>`;
  }
}

// ── Inline Math ───────────────────────────────────────────────────────────────

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { latex: { default: '' } };
  },

  parseHTML() {
    return [{
      tag: 'span[data-math="inline"]',
      getAttrs: (el) => ({
        latex: decodeURIComponent((el as HTMLElement).getAttribute('data-latex') || ''),
      }),
    }];
  },

  renderHTML({ node }) {
    return ['span', {
      class: 'mmw-math-inline',
      'data-math': 'inline',
      'data-latex': encodeURIComponent(node.attrs.latex || ''),
      title: node.attrs.latex,
    }];
  },

  addNodeView() {
    return ({ node }: NodeViewRendererProps) => {
      const dom = document.createElement('span');
      dom.className = 'mmw-math-inline';
      dom.setAttribute('data-math', 'inline');
      dom.title = node.attrs.latex || '';

      function sync(n: typeof node) {
        dom.innerHTML = renderKatex(n.attrs.latex || '', false);
        dom.setAttribute('data-latex', encodeURIComponent(n.attrs.latex || ''));
        dom.title = n.attrs.latex || '';
      }
      sync(node);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'inlineMath') return false;
          sync(updated);
          return true;
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`$${node.attrs.latex}$`);
        },
        parse: {
          setup(md: any) {
            if ((md as any).__mmwInlineMath) return;
            (md as any).__mmwInlineMath = true;

            md.inline.ruler.before('escape', 'math_inline', (state: any, silent: boolean) => {
              const src = state.src;
              const pos = state.pos;
              if (src[pos] !== '$' || src[pos + 1] === '$') return false;
              const end = src.indexOf('$', pos + 1);
              if (end < 0) return false;
              const latex = src.slice(pos + 1, end);
              if (!latex || latex.includes('\n')) return false;
              if (!silent) {
                const token   = state.push('math_inline', '', 0);
                token.content = latex;
              }
              state.pos = end + 1;
              return true;
            });

            md.renderer.rules['math_inline'] = (tokens: any[], idx: number) => {
              const latex = tokens[idx].content;
              return `<span data-math="inline" data-latex="${encodeURIComponent(latex)}"></span>`;
            };
          },
        },
      },
    };
  },
});

// ── Block Math ────────────────────────────────────────────────────────────────

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { latex: { default: '' } };
  },

  parseHTML() {
    return [{
      tag: 'div[data-math="block"]',
      getAttrs: (el) => ({
        latex: decodeURIComponent((el as HTMLElement).getAttribute('data-latex') || ''),
      }),
    }];
  },

  renderHTML({ node }) {
    return ['div', {
      class: 'mmw-math-block',
      'data-math': 'block',
      'data-latex': encodeURIComponent(node.attrs.latex || ''),
    }];
  },

  addNodeView() {
    return ({ node }: NodeViewRendererProps) => {
      const dom = document.createElement('div');
      dom.className = 'mmw-math-block';
      dom.setAttribute('data-math', 'block');

      function sync(n: typeof node) {
        dom.innerHTML = renderKatex(n.attrs.latex || '', true);
        dom.setAttribute('data-latex', encodeURIComponent(n.attrs.latex || ''));
      }
      sync(node);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'blockMath') return false;
          sync(updated);
          return true;
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`$$${node.attrs.latex}$$`);
          state.closeBlock(node);
        },
        parse: {
          setup(md: any) {
            if ((md as any).__mmwBlockMath) return;
            (md as any).__mmwBlockMath = true;

            md.block.ruler.before('fence', 'math_block',
              (state: any, startLine: number, endLine: number, silent: boolean) => {
                const lineStart = state.bMarks[startLine] + state.tShift[startLine];
                const firstLine = state.src.slice(lineStart, state.eMarks[startLine]).trim();

                if (!firstLine.startsWith('$$')) return false;

                // Single-line: $$latex$$
                if (firstLine.endsWith('$$') && firstLine.length > 4) {
                  if (silent) return true;
                  const latex   = firstLine.slice(2, -2);
                  const token   = state.push('math_block', '', 0);
                  token.content = latex;
                  state.line    = startLine + 1;
                  return true;
                }

                // Multi-line: opening $$ … closing $$
                if (firstLine !== '$$') return false;
                let nextLine = startLine + 1;
                let found = false;
                while (nextLine < endLine) {
                  const ls = state.bMarks[nextLine] + state.tShift[nextLine];
                  if (state.src.slice(ls, state.eMarks[nextLine]).trim() === '$$') {
                    found = true; break;
                  }
                  nextLine++;
                }
                if (!found) return false;
                if (silent) return true;
                const latex   = state.getLines(startLine + 1, nextLine, 0, false).trimEnd();
                const token   = state.push('math_block', '', 0);
                token.content = latex;
                state.line    = nextLine + 1;
                return true;
              },
              { alt: ['paragraph'] }
            );

            md.renderer.rules['math_block'] = (tokens: any[], idx: number) => {
              const latex = tokens[idx].content;
              return `<div data-math="block" data-latex="${encodeURIComponent(latex)}"></div>`;
            };
          },
        },
      },
    };
  },
});
