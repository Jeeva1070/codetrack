import * as vscode from 'vscode';
import { t } from './i18n';
import { TokenManager } from './token';
import { CodeTrackStatusBar } from './statusBar';
import { getDashboardUrl, StatusBarInfoMode } from './config';

export function registerCommands(
  context: vscode.ExtensionContext,
  tokenManager: TokenManager,
  statusBar: CodeTrackStatusBar,
  eventQueue?: import('./queue').EventQueue
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // 1. codetrack.getToken
  disposables.push(
    vscode.commands.registerCommand('codetrack.getToken', async () => {
      await tokenManager.promptAndSetToken(() => {
        statusBar.refresh(true);
      });
    })
  );

  // 2. codetrack.toDashboard
  disposables.push(
    vscode.commands.registerCommand('codetrack.toDashboard', async () => {
      const url = getDashboardUrl();
      await vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  // 3. codetrack.viewDashboard (In-editor interactive analytics)
  disposables.push(
    vscode.commands.registerCommand('codetrack.viewDashboard', async () => {
      if (eventQueue) {
        const { DashboardPanel } = await import('./dashboardView');
        DashboardPanel.createOrShow(eventQueue);
      }
    })
  );

  // 3. codetrack.codeTimeInStatusBar
  disposables.push(
    vscode.commands.registerCommand('codetrack.codeTimeInStatusBar', async () => {
      const currentMode = vscode.workspace.getConfiguration('codetrack').get<string>('statusBarInfo', 'Total');

      interface ModeQuickPickItem extends vscode.QuickPickItem {
        mode: StatusBarInfoMode;
      }

      const items: ModeQuickPickItem[] = [
        {
          label: t('Total code time'),
          description: currentMode === 'Total' ? '✓' : undefined,
          mode: 'Total',
        },
        {
          label: t('Today code time'),
          description: currentMode === 'Today' ? '✓' : undefined,
          mode: 'Today',
        },
        {
          label: t('24h code time'),
          description: currentMode === '24h' ? '✓' : undefined,
          mode: '24h',
        },
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: t('CodeTrack: Select Status Bar Display'),
      });

      if (selected) {
        await vscode.workspace
          .getConfiguration('codetrack')
          .update('statusBarInfo', selected.mode, vscode.ConfigurationTarget.Global);
        await statusBar.refresh();
      }
    })
  );

  for (const d of disposables) {
    context.subscriptions.push(d);
  }

  return disposables;
}
