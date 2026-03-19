import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './MarkdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new MarkdownEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'markwell.markdownEditor',
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  const formatCommands: Record<string, string> = {
    'markwell.formatBold': 'bold',
    'markwell.formatItalic': 'italic',
    'markwell.formatUnderline': 'underline',
    'markwell.formatLink': 'link',
  };
  for (const [cmd, format] of Object.entries(formatCommands)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, () => {
        MarkdownEditorProvider.postToActivePanel({ type: 'format', format });
      })
    );
  }

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((e) => {
      if (e.document.languageId !== 'markdown') return;
      e.waitUntil(
        MarkdownEditorProvider.requestContentBeforeSave(e.document).then((markdown) => {
          if (markdown) {
            return MarkdownEditorProvider.applyMarkdownToDocument(e.document, markdown);
          }
        })
      );
    })
  );
}

export function deactivate() { }
