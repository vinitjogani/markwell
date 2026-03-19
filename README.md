# Markwell

A beautiful Notion-like markdown editor for Visual Studio Code and Cursor. Edit your `.md` files in a rich WYSIWYG-style interface while keeping plain markdown on disk.

## Features

### Rich Block Editor

- **Slash commands** — Type `/` for a command palette: headings, lists, code blocks, tables, task lists, quotes, dividers, and more
- **Headings** — H1, H2, H3 with automatic IDs for anchor linking
- **Lists** — Bullet, numbered, and nested task lists with checkboxes
- **Tables** — Insert and edit tables with header rows
- **Code blocks** — Fenced code with syntax highlighting
- **Blockquote** — Capture quotes and callouts

### Text Formatting

- **Inline formatting** — Bold, italic, underline, strikethrough, inline code
- **Subscript & superscript** — For math and references
- **Text color** — Multiple color palettes
- **Highlight** — Yellow, green, blue, pink, and more
- **Links** — With link-on-paste and autolink for URLs

### Media & Embeds

- **Images** — Paste or drag-and-drop; resize with a width handle; supports data URLs
- **YouTube** — Embed videos via URL
- **LaTeX math** — Inline `$...$` and block `$$...$$` with KaTeX rendering
- **Footnotes** — Standard markdown footnote syntax
- **Emoji picker** — Insert emojis from the slash menu

### Layout & Navigation

- **Table of contents** — Floating panel with clickable headings
- **Inline TOC** — Insert a live table of contents block anywhere
- **Page breaks** — For clean PDF / print output
- **Block handles** — Add blocks below and drag to reorder

### Cursor AI Integration

When using [Cursor](https://cursor.com), Markwell integrates with AI editing:

- **⌘⇧K** (Windows: Ctrl+Shift+K) — Open selection in source and trigger inline edit
- **⌘⇧L** (Windows: Ctrl+Shift+L) — Open selection in source and trigger chat
- **⌘⇧↵** (Windows: Ctrl+Shift+Enter) — Reveal selection in source editor
- Format toolbar buttons for quick AI actions on selection

Your selection is synced to the raw markdown view with the correct offsets, so Cursor’s AI edits the right place.

### Printing & Export

- **Print** — Export to a print-ready HTML page (topbar button), preserves layout and colors
- **Source sync** — Edits are written back to the `.md` file; use any other tool to convert to PDF

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/) (when published), or:

1. Download the `.vsix` from releases
2. Open Command Palette (`⌘⇧P` / `Ctrl+Shift+P`) → **Extensions: Install from VSIX...**
3. Select the `.vsix` file

## Usage

1. Open any `.md` file in VS Code or Cursor
2. The file opens in the Markwell editor by default
3. Right-click the tab → **Reopen Editor With...** → **Text Editor** to switch to raw markdown

### Keyboard Shortcuts

Format shortcuts (`⌘B`, `⌘I`, `⌘U`, `⌘K`) are registered to fire only when the Markwell editor has focus, so they won't trigger IDE actions (e.g. toggle sidebar).

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl + B` | Bold |
| `⌘/Ctrl + I` | Italic |
| `⌘/Ctrl + U` | Underline |
| `⌘/Ctrl + K` | Add link |
| `/` | Open slash command menu |
| `⌘⇧↵` | Reveal in source (Cursor: `⌘⇧`) |
| `⌘⇧K` | Reveal + inline edit (Cursor) |
| `⌘⇧L` | Reveal + chat (Cursor) |

## Requirements

- VS Code 1.85.0 or later (or Cursor with equivalent version)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development (watch mode)
npm run dev
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

### Project Structure

```
├── src/                    # Extension host (TypeScript)
│   ├── extension.ts        # Activation entry point
│   └── MarkdownEditorProvider.ts
├── webview-src/            # Webview (TipTap editor + UI)
│   ├── main.ts
│   ├── editor.ts           # TipTap setup
│   ├── slash-menu.ts
│   ├── format-toolbar.ts
│   └── ...
├── out/                    # Compiled output
│   ├── extension.js
│   └── webview/
│       ├── bundle.js
│       └── bundle.css
├── esbuild.mjs             # Webview bundler
└── package.json
```

## Tech Stack

- **TipTap** — ProseMirror-based editor with Markdown round-trip (`tiptap-markdown`)
- **KaTeX** — Math rendering
- **markdown-it-footnote** — Footnote support
- **esbuild** — Webview bundling

## License

MIT

<!-- eof -->
