import Paragraph from '@tiptap/extension-paragraph';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import { defaultMarkdownSerializer } from 'prosemirror-markdown';

const NBSP = '\u00A0';

export const ParagraphWithNbsp = Paragraph.extend({
  addStorage() {
    const defaultSerialize = defaultMarkdownSerializer.nodes.paragraph;
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: any, parent: any, index: number) {
          if (!node.textContent.trim()) {
            state.write(NBSP);
            state.closeBlock(node);
          } else {
            defaultSerialize(state, node, parent, index);
          }
        },
        parse: { /* handled by markdown-it */ },
      },
    };
  },
});
