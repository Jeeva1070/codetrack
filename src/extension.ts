import * as vscode from 'vscode';
import { getConfig } from './config';
import { initI18n, t } from './i18n';
import { TokenManager } from './token';
import { EventQueue } from './queue';
import { HttpBackendClient, Uploader } from './uploader';
import { StatsService } from './stats';
import { CodeTrackStatusBar } from './statusBar';
import { ActivityTracker } from './tracker';
import { registerCommands } from './commands';

let uploaderInstance: Uploader | undefined;
let statusBarInstance: CodeTrackStatusBar | undefined;
let trackerInstance: ActivityTracker | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    const outputChannel = vscode.window.createOutputChannel('CodeTrack');
    context.subscriptions.push(outputChannel);

    // 1. Load config and initialize i18n
    const initialConfig = getConfig();
    await initI18n(context.extensionUri, initialConfig.displayLanguage);

    // 2. Resolve token
    const tokenManager = new TokenManager(context.secrets);
    const token = await tokenManager.resolveToken();

    // 3. Setup Queue and Backend Client
    const eventQueue = new EventQueue(context.globalState);
    let backendClient = new HttpBackendClient(outputChannel);
    const statsService = new StatsService(backendClient);

    // 4. Create Status Bar
    const statusBar = new CodeTrackStatusBar(statsService, tokenManager);
    statusBarInstance = statusBar;
    context.subscriptions.push(statusBar);

    // 5. Setup Uploader Loop
    const uploader = new Uploader(eventQueue, backendClient, tokenManager, outputChannel);
    uploaderInstance = uploader;
    uploader.setOnFlushSuccess(() => {
      statusBar.refresh();
    });
    uploader.start();
    context.subscriptions.push({
      dispose: () => uploader.stop(),
    });

    // 6. Setup Tracker
    const tracker = new ActivityTracker((event) => {
      eventQueue.push(event);
      uploader.onEventsAdded();
    });
    trackerInstance = tracker;
    context.subscriptions.push(tracker);

    // 7. Register Commands
    registerCommands(context, tokenManager, statusBar);

    // 8. One-time notification if token is missing
    if (!token) {
      statusBar.setNoToken();
      const enterTokenBtn = t('Enter Token');
      vscode.window
        .showInformationMessage(t('CodeTrack: Without Token'), enterTokenBtn)
        .then((choice) => {
          if (choice === enterTokenBtn) {
            tokenManager.promptAndSetToken(() => {
              statusBar.refresh(true);
            });
          }
        });
    } else {
      // Fetch initial duration in background without blocking activate()
      statusBar.refresh();
    }

    // 9. Start stats refresh timer (every 60s)
    statusBar.startRefreshTimer();

    // 10. Register live onDidChangeConfiguration listener
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (!e.affectsConfiguration('codetrack')) {
          return;
        }

        const newConfig = getConfig();

        // React to displayLanguage change live
        if (e.affectsConfiguration('codetrack.displayLanguage')) {
          await initI18n(context.extensionUri, newConfig.displayLanguage);
          await statusBar.refresh();
        }

        // React to serverEntrypoint or proxy changes live
        if (e.affectsConfiguration('codetrack.serverEntrypoint') || e.affectsConfiguration('codetrack.proxy')) {
          backendClient = new HttpBackendClient(outputChannel);
          uploader.setBackendClient(backendClient);
          uploader.flush();
          await statusBar.refresh();
        }

        // React to statusBarInfo mode change live
        if (e.affectsConfiguration('codetrack.statusBarInfo')) {
          await statusBar.refresh();
        }
      })
    );

    outputChannel.appendLine('[CodeTrack] Extension activated successfully');
  } catch (err: unknown) {
    // Activation must never throw
    console.error('[CodeTrack] Error during activation:', err);
  }
}

export async function deactivate(): Promise<void> {
  if (trackerInstance) {
    trackerInstance.dispose();
  }
  if (statusBarInstance) {
    statusBarInstance.stopRefreshTimer();
  }
  if (uploaderInstance) {
    uploaderInstance.stop();
    // Flush remaining queued events on window close/deactivate
    await uploaderInstance.flush();
  }
}
