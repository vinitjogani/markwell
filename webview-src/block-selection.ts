/**
 * Block selection highlight — Notion-style.
 *
 * When a text selection fully covers one or more top-level blocks,
 * each fully-covered block receives a `mmw-block-selected` decoration
 * class, giving it a soft blue background instead of the default
 * browser text highlight.
 */

import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const BlockSelectionHighlight = Extension.create({
  name: 'blockSelectionHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { selection, doc } = state;
            if (selection.empty) return DecorationSet.empty;

            const decorations: Decoration[] = [];

            // Only decorate top-level block nodes (depth 1 children of doc)
            doc.forEach((node, pos) => {
              const nodeStart = pos;
              const nodeEnd   = pos + node.nodeSize;

              // Block is fully covered by the selection
              if (nodeStart >= selection.from && nodeEnd <= selection.to) {
                decorations.push(
                  Decoration.node(nodeStart, nodeEnd, { class: 'mmw-block-selected' })
                );
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
