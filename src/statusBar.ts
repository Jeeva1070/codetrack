import * as vscode from 'vscode';
import { t, formatDurationLocalized, getCurrentLanguage } from './i18n';
import { StatsService } from './stats';
import { TokenManager } from './token';
import { getConfig } from './config';

export class CodeTrackStatusBar implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly statsService: StatsService;
  private readonly tokenManager: TokenManager;
  private refreshTimer?: NodeJS.Timeout;

  constructor(statsService: StatsService, tokenManager: TokenManager) {
    this.statsService = statsService;
    this.tokenManager = tokenManager;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.statusBarItem.command = 'gridly.toDashboard';
    this.setInitializing();
    this.statusBarItem.show();
  }

  public setInitializing(): void {
    this.statusBarItem.text = `$(clock) ${t('Gridly: Initializing...')}`;
    this.statusBarItem.tooltip = t('Gridly: Initializing...');
    this.statusBarItem.command = 'gridly.toDashboard';
  }

  public setNoToken(): void {
    this.statusBarItem.text = `$(clock) ${t('Gridly: Without Token')}`;
    this.statusBarItem.tooltip = t('Enter Token');
    this.statusBarItem.command = 'gridly.getToken';
  }

  public setInvalidToken(): void {
    this.statusBarItem.text = `$(clock) ${t('Gridly: Token Invalid')}`;
    this.statusBarItem.tooltip = t('Enter Token');
    this.statusBarItem.command = 'gridly.getToken';
  }

  public async setOffline(cachedMinutes?: number): Promise<void> {
    const config = getConfig();
    const lang = config.displayLanguage === 'Auto' ? getCurrentLanguage() : config.displayLanguage;
    const durationText = cachedMinutes !== undefined ? await formatDurationLocalized(cachedMinutes, lang) : '0m';
    this.statusBarItem.text = `$(cloud-offline) ${durationText}`;
    this.statusBarItem.tooltip = t('Gridly: Offline (cached)');
    this.statusBarItem.command = 'gridly.toDashboard';
  }

  public async setSuccess(minutes: number): Promise<void> {
    const config = getConfig();
    const lang = config.displayLanguage === 'Auto' ? getCurrentLanguage() : config.displayLanguage;
    const durationText = await formatDurationLocalized(minutes, lang);
    this.statusBarItem.text = `$(clock) ${durationText}`;
    this.statusBarItem.tooltip = t('Gridly: Head to dashboard for statistics');
    this.statusBarItem.command = 'gridly.toDashboard';
  }

  /**
   * Refreshes the status bar state according to token and server stats.
   */
  public async refresh(showSuccessToast = false): Promise<void> {
    if (!this.tokenManager.hasToken()) {
      this.setNoToken();
      return;
    }

    if (this.tokenManager.isInvalid()) {
      this.setInvalidToken();
      return;
    }

    const config = getConfig();
    const mode = config.statusBarInfo;
    const token = this.tokenManager.getToken();

    try {
      const minutes = await this.statsService.fetchStats(mode, token);
      await this.setSuccess(minutes);
      if (showSuccessToast) {
        vscode.window.showInformationMessage(t('Gridly: Token validation succeeded'));
      }
    } catch {
      // Offline fallback: check cached value
      const cached = this.statsService.getCachedMinutes(mode);
      if (cached !== undefined) {
        await this.setOffline(cached);
      } else {
        this.statusBarItem.text = `$(clock) ${t('Gridly: Network Error')}`;
        this.statusBarItem.tooltip = t('Gridly: Network Error');
        this.statusBarItem.command = 'gridly.toDashboard';
      }
    }
  }

  /**
   * Starts periodic polling for stats refresh (e.g. every 60-120 seconds).
   */
  public startRefreshTimer(intervalMs = 60 * 1000): void {
    this.stopRefreshTimer();
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, intervalMs);
  }

  public stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  public getStatusBarItem(): vscode.StatusBarItem {
    return this.statusBarItem;
  }

  public dispose(): void {
    this.stopRefreshTimer();
    this.statusBarItem.dispose();
  }
}
