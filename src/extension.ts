import * as vscode from 'vscode';
import { getConfig } from './config';
import { initI18n } from './i18n';
import { TokenManager } from './token';
import { EventQueue } from './queue';
import { StatsService } from './stats';
import { CodeTrackStatusBar } from './statusBar';
import { ActivityTracker } from './tracker';
import { registerCommands } from './commands';

let statusBarInstance: CodeTrackStatusBar | undefined;
let trackerInstance: ActivityTracker | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    const outputChannel = vscode.window.createOutputChannel('Gridly');
    context.subscriptions.push(outputChannel);

    // 1. Load config and initialize i18n
    const initialConfig = getConfig();
    await initI18n(context.extensionUri, initialConfig.displayLanguage);

    // 2. Setup TokenManager for backwards compatibility (optional)
    const tokenManager = new TokenManager(context.secrets);

    // 3. Setup Standalone Local Queue & Local Stats Service
    const eventQueue = new EventQueue(context.globalState);
    const statsService = new StatsService(eventQueue);

    // 4. Create Status Bar (points to local stats, opens in-editor dashboard)
    const statusBar = new CodeTrackStatusBar(statsService);
    statusBarInstance = statusBar;
    context.subscriptions.push(statusBar);

    // 5. Setup Activity Tracker: records coding activity locally
    const tracker = new ActivityTracker((event) => {
      eventQueue.push(event);
      statusBar.refresh();
    });
    trackerInstance = tracker;
    context.subscriptions.push(tracker);

    // 6. Register Commands (Dashboard, Time mode switch, etc.)
    registerCommands(context, tokenManager, statusBar, eventQueue);

    // 7. Initial status bar display
    await statusBar.refresh();

    // 8. Start periodic stats refresh timer (every 60s)
    statusBar.startRefreshTimer();

    // 9. Register live onDidChangeConfiguration listener
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (!e.affectsConfiguration('gridly')) {
          return;
        }

        const newConfig = getConfig();

        // React to displayLanguage change live
        if (e.affectsConfiguration('gridly.displayLanguage')) {
          await initI18n(context.extensionUri, newConfig.displayLanguage);
          await statusBar.refresh();
        }

        // React to statusBarInfo mode change live ('Total' | 'Today' | '24h')
        if (e.affectsConfiguration('gridly.statusBarInfo')) {
          await statusBar.refresh();
        }
      })
    );

    outputChannel.appendLine('[Gridly] Standalone local extension activated successfully');
  } catch (err: unknown) {
    // Activation must never throw
    console.error('[Gridly] Error during activation:', err);
  }
}

export async function deactivate(): Promise<void> {
  if (trackerInstance) {
    trackerInstance.dispose();
  }
  if (statusBarInstance) {
    statusBarInstance.stopRefreshTimer();
  }
}
