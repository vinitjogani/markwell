import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';
import { SlashMenuExtension } from './slash-menu';

export function createEditor(
  element: HTMLElement,
  onChange: () => void,
  onSelectionChange: () => void
): Editor {
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        code: {
          HTMLAttributes: { spellcheck: 'false' },
        },
        codeBlock: {
          HTMLAttributes: { spellcheck: 'false' },
        },
      }),

      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,

      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: '-',
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: false,
      }),

      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Untitled';
          return "Write something, or type '/' for commands…";
        },
        showOnlyCurrent: true,
      }),

      Typography,
      SlashMenuExtension,
    ],

    autofocus: false,

    onUpdate: onChange,
    onSelectionUpdate: onSelectionChange,

    editorProps: {
      attributes: {
        class: 'mmw-prose',
        spellcheck: 'true',
      },
    },
  });
}
