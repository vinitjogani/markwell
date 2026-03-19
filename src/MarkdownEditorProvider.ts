import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

// Cursor command IDs to try in order. These vary by Cursor version.
// The extension tries each silently until one succeeds.
const CURSOR_INLINE_CMDS = [
  'cursor.generateCode',          // Cursor ≤0.42
  'aichat.inlineedit',            // Cursor 0.43+
  'cursor.requestInlineEdit',
  'cursorai.action.generateCodeInline',
];
const CURSOR_CHAT_CMDS = [
  'aichat.newchataction',         // Cursor chat sidebar
  'cursor.openChat',
  'workbench.panel.aichat.view.focus',
  'cursorChat.openChat',
];

const EOF_REGEX = /(<|&lt;)!-- eof --(>|&gt;)/g;
function stripEof(markdown: string): string {
  return markdown.replace(EOF_REGEX, '').trimEnd();
}
function ensureTrailingEof(markdown: string): string {
  return stripEof(markdown) + '\n\n<!-- eof -->\n';
}

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; markdown: string }
  | { type: 'save'; markdown: string }
  | { type: 'selectionChange'; anchorPos: number; headPos: number; selectedText: string }
  | { type: 'revealInSource'; anchorPos: number; headPos: number; triggerInlineEdit?: boolean; triggerChat?: boolean }
  | { type: 'print'; proseHtml: string }
  | { type: 'contentForSave'; markdown: string }
  | { type: 'focus' }
  | { type: 'blur' };

let activePanel: vscode.WebviewPanel | null = null;
const documentPanels = new Map<string, vscode.WebviewPanel>();
let pendingSaveResolvers = new Map<string, (markdown: string) => void>();
const expectedDocumentEdits = new Map<string, string>();

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly selfEdits = new WeakMap<vscode.TextDocument, string>();

  constructor(private readonly context: vscode.ExtensionContext) { }

  static postToActivePanel(message: unknown): boolean {
    if (activePanel) {
      activePanel.webview.postMessage(message);
      return true;
    }
    return false;
  }

  static requestContentBeforeSave(document: vscode.TextDocument): Promise<string | null> {
    const uri = document.uri.toString();
    const panel = documentPanels.get(uri);
    if (!panel) return Promise.resolve(null);
    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        pendingSaveResolvers.delete(uri);
        resolve(null);
      }, 800);
      pendingSaveResolvers.set(uri, (markdown: string) => {
        clearTimeout(timeout);
        resolve(markdown);
      });
      panel.webview.postMessage({ type: 'requestContentForSave' });
    });
  }

  static async applyMarkdownToDocument(document: vscode.TextDocument, markdown: string): Promise<void> {
    const normalized = ensureTrailingEof(markdown);
    if (document.getText() === normalized) return;
    expectedDocumentEdits.set(document.uri.toString(), normalized);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), normalized);
    await vscode.workspace.applyEdit(edit);
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'out')],
    };

    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview);
    documentPanels.set(document.uri.toString(), webviewPanel);

    const applyEditImmediate = async (markdown: string) => {
      markdown = ensureTrailingEof(markdown);
      if (document.getText() === markdown) return;
      expectedDocumentEdits.set(document.uri.toString(), markdown);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), markdown);
      this.selfEdits.set(document, markdown);
      await vscode.workspace.applyEdit(edit);
    };

    let pendingMarkdown: string | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelPendingSave = () => {
      pendingMarkdown = null;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
      }
    };
    const saveEdit = (markdown: string) => {
      pendingMarkdown = markdown;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const next = pendingMarkdown;
        pendingMarkdown = null;
        saveTimer = undefined;
        if (next != null) void applyEditImmediate(next);
      }, 400);
    };

    const msgSub = webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      switch (msg.type) {
        case 'ready':
          webviewPanel.webview.postMessage({ type: 'init', markdown: stripEof(document.getText()) });
          break;
        case 'edit':
          saveEdit(msg.markdown);
          break;
        case 'save':
          cancelPendingSave();
          await applyEditImmediate(msg.markdown);
          await document.save();
          break;
        case 'contentForSave':
          {
            cancelPendingSave();
            const resolve = pendingSaveResolvers.get(document.uri.toString());
            if (resolve) {
              pendingSaveResolvers.delete(document.uri.toString());
              resolve(msg.markdown);
            }
          }
          break;
        case 'focus':
          activePanel = webviewPanel;
          vscode.commands.executeCommand('setContext', 'markwellEditorFocused', true);
          break;
        case 'blur':
          if (activePanel === webviewPanel) {
            activePanel = null;
            vscode.commands.executeCommand('setContext', 'markwellEditorFocused', false);
          }
          break;
        case 'selectionChange':
          break;
        case 'revealInSource':
          await this.revealInSource(
            document, msg.anchorPos, msg.headPos,
            msg.triggerInlineEdit, msg.triggerChat
          );
          break;
        case 'print':
          await this.printDocument(msg.proseHtml);
          break;
      }
    });

    webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        activePanel = webviewPanel;
        vscode.commands.executeCommand('setContext', 'markwellEditorFocused', true);
      } else if (activePanel === webviewPanel) {
        activePanel = null;
        vscode.commands.executeCommand('setContext', 'markwellEditorFocused', false);
      }
    });

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (e.contentChanges.length === 0) return;
      const expected = expectedDocumentEdits.get(document.uri.toString());
      if (expected !== undefined) {
        if (expected.trimEnd() === document.getText().trimEnd()) {
          expectedDocumentEdits.delete(document.uri.toString());
          this.selfEdits.delete(document);
          return;
        }
        expectedDocumentEdits.delete(document.uri.toString());
      }
      const pending = this.selfEdits.get(document);
      if (pending !== undefined) {
        // Normalize trailing whitespace before comparing — tiptap-markdown can
        // add/remove a trailing newline relative to what VS Code stores, which
        // would otherwise break the loop-prevention check and cause a spurious
        // setContent() call in the webview (the "heading deletion" glitch).
        if (pending.trimEnd() === document.getText().trimEnd()) {
          this.selfEdits.delete(document);
          return;
        }
        // Content differed — clear the stale entry so the next external change
        // isn't accidentally swallowed
        this.selfEdits.delete(document);
      }
      webviewPanel.webview.postMessage({ type: 'update', markdown: stripEof(document.getText()) });
    });

    webviewPanel.onDidDispose(() => {
      pendingSaveResolvers.delete(document.uri.toString());
      expectedDocumentEdits.delete(document.uri.toString());
      documentPanels.delete(document.uri.toString());
      if (activePanel === webviewPanel) {
        activePanel = null;
        vscode.commands.executeCommand('setContext', 'markwellEditorFocused', false);
      }
      msgSub.dispose();
      changeSub.dispose();
    });
  }

  private async revealInSource(
    document: vscode.TextDocument,
    anchorOffset: number,
    headOffset: number,
    triggerInlineEdit?: boolean,
    triggerChat?: boolean
  ): Promise<void> {
    const anchor = document.positionAt(Math.max(0, anchorOffset));
    const head = document.positionAt(Math.max(0, headOffset));

    // Open / focus the source file with the selection
    await vscode.window.showTextDocument(document.uri, {
      viewColumn: vscode.ViewColumn.Beside,
      selection: new vscode.Selection(anchor, head),
      preserveFocus: false,
    });

    if (!triggerInlineEdit && !triggerChat) return;

    // Give Cursor time to register focus and the selection
    await sleep(80);
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    await sleep(180);

    const cmds = triggerInlineEdit ? CURSOR_INLINE_CMDS : CURSOR_CHAT_CMDS;
    let fired = false;

    for (const cmd of cmds) {
      try {
        await vscode.commands.executeCommand(cmd);
        fired = true;
        break;
      } catch {
        // command not registered — try next
      }
    }

    if (!fired) {
      // Graceful fallback: user's selection is open, just tell them what to press
      const label = triggerInlineEdit ? '⌘K' : '⌘L';
      vscode.window.showInformationMessage(
        `Selection opened in source. Press ${label} to edit with Cursor AI.`
      );
    }
  }

  private async printDocument(proseHtml: string): Promise<void> {
    const cssUri = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'bundle.css');
    const cssBytes = await vscode.workspace.fs.readFile(cssUri);
    const css = Buffer.from(cssBytes).toString('utf8');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Print</title>
  <!-- Load the same fonts used in the editor -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Rethink+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
  <style>
${css}
/* Standalone print page — use light theme values, preserve all backgrounds */
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body {
  font-family: 'Rethink Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
}
#page {
  padding: 0 !important;
  max-width: 100% !important;
  margin: 0 !important;
}
#topbar, #block-actions, #format-toolbar, #slash-menu,
#img-toolbar, #link-popover, #color-pop, #emoji-picker-wrap,
#toc-panel { display: none !important; }
a::after { content: none !important; }
  </style>
</head>
<body>
  <div id="page">
    <div id="editor"><div class="ProseMirror mmw-prose">${proseHtml}</div></div>
  </div>
  <script>
    // Wait for fonts to load before printing
    document.fonts.ready.then(function() {
      setTimeout(function() { window.print(); }, 300);
    });
  </script>
</body>
</html>`;

    const tmpFile = path.join(os.tmpdir(), 'markwell-print.html');
    const tmpUri = vscode.Uri.file(tmpFile);
    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(html, 'utf8'));
    await vscode.env.openExternal(tmpUri);
  }

  private buildHtml(webview: vscode.Webview): string {
    const bundleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'bundle.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'bundle.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src https://fonts.gstatic.com data:;
             img-src ${webview.cspSource} https: data: blob:;
             frame-src https://www.youtube-nocookie.com https://www.youtube.com;
             script-src 'nonce-${nonce}';">
  <title>Markwell</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Rethink+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <!-- Ghost header -->
  <header id="topbar">
    <span id="doc-title"></span>
    <div id="topbar-actions">
      <span id="word-count"></span>
      <button id="btn-toc" title="Table of contents">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
        Contents
      </button>
      <button id="btn-reveal" title="Open source with selection (⌘⇧↵)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        Source
      </button>
      <button id="btn-print" title="Print document">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print
      </button>
    </div>
  </header>

  <div id="page">
    <!-- Block action handles (repositioned via JS) -->
    <div id="block-actions">
      <button id="block-plus" title="Add block below">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button id="block-drag" title="Drag to reorder">
        <svg width="10" height="15" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="2.5" cy="2" r="1.4"/><circle cx="7.5" cy="2" r="1.4"/>
          <circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/>
          <circle cx="2.5" cy="14" r="1.4"/><circle cx="7.5" cy="14" r="1.4"/>
        </svg>
      </button>
    </div>

    <div id="editor"></div>
  </div>

  <!-- Floating format + AI toolbar (appears on text selection) -->
  <div id="format-toolbar" role="toolbar">
    <button data-fmt="bold"      title="Bold (⌘B)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
    <button data-fmt="italic"    title="Italic (⌘I)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
    <button data-fmt="underline" title="Underline (⌘U)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg></button>
    <button data-fmt="strike"    title="Strikethrough"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><path d="M16 6C16 6 14.5 4 12 4C9.5 4 8 5.5 8 7.5C8 9.5 9.5 10.5 12 11"/><path d="M8 18C8 18 9.5 20 12 20C14.5 20 16 18.5 16 16.5"/></svg></button>
    <button data-fmt="code"      title="Inline code"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></button>
    <div class="ft-sep"></div>
    <button data-fmt="sup"  title="Superscript"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19l8-8"/><path d="M12 19l-8-8"/><path d="M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/></svg></button>
    <button data-fmt="sub"  title="Subscript"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5l8 8"/><path d="M12 5l-8 8"/><path d="M20 21h-4c0-1.5.44-2 1.5-2.5S20 17.33 20 16a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/></svg></button>
    <div class="ft-sep"></div>
    <button data-fmt="link"      title="Link"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
    <button data-fmt="highlight" title="Highlight colour"><span class="ft-hl-dot" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:transparent;border:1.5px dashed currentColor;"></span></button>
    <button data-fmt="color"     title="Text colour"><span class="ft-color-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--ft-text);"></span></button>
    <div class="ft-sep"></div>
    <button data-fmt="ai-edit" class="ft-ai" title="Edit with Cursor AI — ⌘⇧K">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
      ⌘⇧K
    </button>
    <button data-fmt="ai-chat" class="ft-ai" title="Chat with Cursor AI — ⌘⇧L">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ⌘⇧L
    </button>
  </div>

  <!-- Slash command popup -->
  <div id="slash-menu" role="listbox" aria-label="Insert block"></div>

  <script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
  }
}
