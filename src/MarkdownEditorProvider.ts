import * as vscode from 'vscode';

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; markdown: string }
  | { type: 'selectionChange'; anchorPos: number; headPos: number; selectedText: string }
  | { type: 'revealInSource'; anchorPos: number; headPos: number; triggerInlineEdit?: boolean; triggerChat?: boolean };

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly selfEdits = new WeakMap<vscode.TextDocument, string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

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

    const saveEdit = debounce(async (markdown: string) => {
      if (document.getText() === markdown) return;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), markdown);
      this.selfEdits.set(document, markdown);
      await vscode.workspace.applyEdit(edit);
    }, 400);

    const msgSub = webviewPanel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      switch (msg.type) {
        case 'ready':
          webviewPanel.webview.postMessage({ type: 'init', markdown: document.getText() });
          break;
        case 'edit':
          await saveEdit(msg.markdown);
          break;
        case 'selectionChange':
          break;
        case 'revealInSource':
          await this.revealInSource(document, msg.anchorPos, msg.headPos, msg.triggerInlineEdit, msg.triggerChat);
          break;
      }
    });

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (e.contentChanges.length === 0) return;
      const pending = this.selfEdits.get(document);
      if (pending !== undefined && pending === document.getText()) {
        this.selfEdits.delete(document);
        return;
      }
      webviewPanel.webview.postMessage({ type: 'update', markdown: document.getText() });
    });

    webviewPanel.onDidDispose(() => {
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
    const anchor = document.positionAt(anchorOffset);
    const head = document.positionAt(headOffset);
    await vscode.window.showTextDocument(document.uri, {
      viewColumn: vscode.ViewColumn.Beside,
      selection: new vscode.Selection(anchor, head),
      preserveFocus: false,
    });

    // Give the editor a moment to focus, then trigger Cursor's AI command
    if (triggerInlineEdit || triggerChat) {
      await new Promise((r) => setTimeout(r, 120));
      const cmd = triggerChat
        ? 'aichat.newchataction'
        : 'cursor.generateCode'; // Cursor's Cmd+K equivalent
      try {
        await vscode.commands.executeCommand(cmd);
      } catch {
        // Cursor commands not available (e.g. running in plain VS Code) — ignore silently
      }
    }
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
             font-src https://fonts.gstatic.com;
             img-src ${webview.cspSource} https: data:;
             script-src 'nonce-${nonce}';">
  <title>Mark My Words</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Rethink+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <!-- Ghost header — fades in on hover -->
  <header id="topbar">
    <span id="doc-title"></span>
    <div id="topbar-actions">
      <button id="btn-reveal" title="View/edit source (⌘⇧↵)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        Source
      </button>
      <button id="btn-print" title="Print">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print
      </button>
    </div>
  </header>

  <!-- Page scroll container -->
  <div id="page">
    <!-- Block action handles — repositioned via JS on block hover -->
    <div id="block-actions">
      <button id="block-plus" title="Add block">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button id="block-drag" title="Drag to reorder" draggable="true">
        <svg width="14" height="14" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="2.5" cy="2" r="1.5"/><circle cx="7.5" cy="2" r="1.5"/>
          <circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/>
          <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
        </svg>
      </button>
    </div>

    <!-- The Tiptap editor mounts here -->
    <div id="editor"></div>
  </div>

  <!-- Floating format toolbar — appears above text selection -->
  <div id="format-toolbar" role="toolbar" aria-label="Format">
    <button data-fmt="bold" title="Bold (⌘B)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
    <button data-fmt="italic" title="Italic (⌘I)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
    <button data-fmt="strike" title="Strikethrough"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.3 12H6.7"/><path d="M12 3c-1.2 0-2.4.6-3 1.7-.6 1.1-.5 2.4.2 3.3"/><path d="M12 21c1.2 0 2.4-.6 3-1.7.6-1.1.5-2.4-.2-3.3"/></svg></button>
    <button data-fmt="code" title="Inline code"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></button>
    <div class="ft-sep"></div>
    <button data-fmt="ai-edit" title="Edit with Cursor AI (⌘K)" class="ft-ai">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      ⌘K
    </button>
    <button data-fmt="ai-chat" title="Chat with Cursor AI (⌘L)" class="ft-ai">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ⌘L
    </button>
  </div>

  <!-- Slash command menu -->
  <div id="slash-menu" role="listbox" aria-label="Block commands"></div>

  <script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
  }
}
