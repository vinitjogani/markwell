import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import type { Editor, Range } from '@tiptap/core';
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  action: (editor: Editor, range: Range) => void;
}

const COMMANDS: SlashCommand[] = [
  {
    id: 'text',
    label: 'Text',
    description: 'Plain paragraph',
    icon: 'T',
    keywords: ['text', 'paragraph', 'p'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    keywords: ['h1', 'heading', 'title'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    keywords: ['h2', 'heading', 'subtitle'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    keywords: ['h3', 'heading'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet',
    label: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    keywords: ['bullet', 'list', 'ul', 'unordered'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'number',
    label: 'Numbered List',
    description: 'Ordered list',
    icon: '1.',
    keywords: ['number', 'numbered', 'ordered', 'ol', 'list'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Capture a quote or callout',
    icon: '"',
    keywords: ['quote', 'blockquote', 'callout'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    id: 'code',
    label: 'Code Block',
    description: 'Code with syntax highlighting',
    icon: '</>',
    keywords: ['code', 'block', 'snippet', 'pre'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Visual section break',
    icon: '—',
    keywords: ['divider', 'hr', 'rule', 'separator', 'line'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Insert a 3×3 table',
    icon: '▦',
    keywords: ['table', 'grid', 'rows', 'columns'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'pagebreak',
    label: 'Page Break',
    description: 'Force a new page when printing',
    icon: '⤶',
    keywords: ['page', 'break', 'pagebreak', 'print', 'pdf', 'newpage'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setPageBreak().run(),
  },
  {
    id: 'math',
    label: 'Math Block',
    description: 'LaTeX equation (display mode)',
    icon: '∑',
    keywords: ['math', 'latex', 'equation', 'formula', 'katex'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const latex = '\\sum_{i=1}^{n} x_i';
      editor.chain().focus().insertContent({ type: 'blockMath', attrs: { latex } }).run();
    },
  },
  {
    id: 'tasklist',
    label: 'Task List',
    description: 'Checkable to-do list',
    icon: '☑',
    keywords: ['task', 'todo', 'checklist', 'check'],
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'emoji',
    label: 'Emoji',
    description: 'Insert an emoji',
    icon: '😊',
    keywords: ['emoji', 'emoticon', 'smile', 'icon'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      import('./emoji-picker').then(({ openEmojiPicker }) => openEmojiPicker(editor));
    },
  },
  {
    id: 'youtube',
    label: 'YouTube',
    description: 'Embed a YouTube video',
    icon: '▶',
    keywords: ['youtube', 'video', 'embed', 'watch'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const url = window.prompt('YouTube URL:');
      if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
    },
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Embed an image from your computer',
    icon: '⊡',
    keywords: ['image', 'img', 'photo', 'picture', 'embed'],
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      // Open a hidden file picker
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          if (src) editor.chain().focus().setImage({ src, width: '100%' }).run();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
  },
];

function filterCommands(query: string): SlashCommand[] {
  if (!query) return COMMANDS;
  const q = query.toLowerCase();
  return COMMANDS.filter(
    (cmd) =>
      cmd.id.startsWith(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.startsWith(q))
  );
}

// ---- Menu DOM renderer ----

let menuEl: HTMLElement | null = null;
let selectedIndex = 0;
let currentItems: SlashCommand[] = [];
let currentCommandFn: ((cmd: SlashCommand) => void) | null = null;

function getMenu(): HTMLElement {
  if (!menuEl) {
    menuEl = document.getElementById('slash-menu')!;
  }
  return menuEl;
}

function renderMenu(items: SlashCommand[], commandFn: (cmd: SlashCommand) => void) {
  currentItems = items;
  currentCommandFn = commandFn;
  const menu = getMenu();

  if (items.length === 0) {
    menu.style.display = 'none';
    return;
  }

  menu.innerHTML = '';
  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'slash-item' + (idx === selectedIndex ? ' selected' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.innerHTML = `
      <span class="slash-icon">${item.icon}</span>
      <span class="slash-text">
        <span class="slash-label">${item.label}</span>
        <span class="slash-desc">${item.description}</span>
      </span>
    `;
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectedIndex = idx;
      commandFn(item);
    });
    menu.appendChild(row);
  });
  menu.style.display = 'block';
}

function positionMenu(clientRect: (() => DOMRect | null) | null) {
  const menu = getMenu();
  if (!clientRect) return;
  const rect = clientRect();
  if (!rect) return;

  const menuHeight = 320;
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.bottom;

  const top = spaceBelow > menuHeight
    ? rect.bottom + 4
    : rect.top - Math.min(menu.offsetHeight || menuHeight, rect.top) - 4;

  menu.style.left = `${Math.max(8, rect.left)}px`;
  menu.style.top = `${top}px`;
}

function hideMenu() {
  const menu = getMenu();
  menu.style.display = 'none';
  selectedIndex = 0;
  currentItems = [];
  currentCommandFn = null;
}

// ---- Tiptap Extension ----

export const SlashMenuExtension = Extension.create({
  name: 'slashMenu',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      Suggestion({
        editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,

        command({ editor: ed, range, props }: { editor: Editor; range: Range; props: SlashCommand }) {
          props.action(ed, range);
          hideMenu();
        },

        items({ query }: { query: string }) {
          return filterCommands(query);
        },

        render() {
          return {
            onStart(props: SuggestionProps<SlashCommand>) {
              selectedIndex = 0;
              const items = props.items as SlashCommand[];
              renderMenu(items, (cmd) => {
                props.command(cmd);
              });
              positionMenu(props.clientRect ?? null);
            },

            onUpdate(props: SuggestionProps<SlashCommand>) {
              selectedIndex = 0;
              const items = props.items as SlashCommand[];
              renderMenu(items, (cmd) => {
                props.command(cmd);
              });
              positionMenu(props.clientRect ?? null);
            },

            onKeyDown(props: SuggestionKeyDownProps): boolean {
              const { event } = props;

              if (event.key === 'ArrowDown') {
                selectedIndex = (selectedIndex + 1) % currentItems.length;
                renderMenu(currentItems, currentCommandFn!);
                return true;
              }
              if (event.key === 'ArrowUp') {
                selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
                renderMenu(currentItems, currentCommandFn!);
                return true;
              }
              if (event.key === 'Enter') {
                if (currentItems[selectedIndex] && currentCommandFn) {
                  currentCommandFn(currentItems[selectedIndex]);
                }
                return true;
              }
              if (event.key === 'Escape') {
                hideMenu();
                return true;
              }
              return false;
            },

            onExit() {
              hideMenu();
            },
          };
        },
      } as Partial<SuggestionOptions<SlashCommand>>),
    ];
  },
});
