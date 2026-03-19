import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { YoutubeExtension } from './youtube-extension';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import { Markdown } from 'tiptap-markdown';
import { ParagraphWithNbsp } from './paragraph-nbsp';
import { SlashMenuExtension } from './slash-menu';
import { PageBreak } from './page-break';
import { ImageExtension } from './image-extension';
import { InlineMath, BlockMath } from './math-extension';
import { FootnoteRef, FootnoteItem, FootnoteSection } from './footnote-extension';
import { InlineToc } from './inline-toc';
import { BlockSelectionHighlight } from './block-selection';
import { HeadingWithIds } from './heading-ids';

export function createEditor(
  element: HTMLElement,
  onChange: () => void,
  onSelectionChange: () => void
): Editor {
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading:   false,
        paragraph: false,
        code:      { HTMLAttributes: { spellcheck: 'false' } },
        codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
      }),
      ParagraphWithNbsp,
      HeadingWithIds.configure({ levels: [1, 2, 3] }),

      // Tables
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,

      // Links — cmd+click to open, linkOnPaste auto-wraps URLs
      Link.configure({
        openOnClick: false,   // we handle cmd+click manually
        linkOnPaste: true,
        autolink: true,
        HTMLAttributes: { class: 'mmw-link' },
      }),

      // Task lists
      TaskList,
      TaskItem.configure({ nested: true }),

      // Text formatting
      Underline,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextStyle,
      Color,

      // Media
      YoutubeExtension.configure({ nocookie: true }),

      // Custom nodes
      PageBreak,
      ImageExtension,
      InlineMath,
      BlockMath,
      FootnoteRef,
      FootnoteItem,
      FootnoteSection,
      InlineToc,

      Markdown.configure({
        html:                false,
        tightLists:          true,
        bulletListMarker:    '-',
        linkify:             true,
        breaks:              false,
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
      BlockSelectionHighlight,
    ],

    autofocus: false,
    onUpdate: onChange,
    onSelectionUpdate: onSelectionChange,

    editorProps: {
      // Cmd+click opens links
      handleClick(view, _pos, event) {
        if ((event.metaKey || event.ctrlKey) && event.target instanceof HTMLAnchorElement) {
          const href = event.target.href;
          if (href) { window.open(href, '_blank'); return true; }
        }
        return false;
      },
      attributes: {
        class:       'mmw-prose',
        spellcheck:  'true',
      },
    },
  });
}
