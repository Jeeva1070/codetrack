import * as vscode from 'vscode';
import { EventQueue } from './queue';
import { calculateHeatmap, calculateProjectStats, calculateLanguageStats, calculatePlatformStats, calculateLeaderboard } from './analytics';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly eventQueue: EventQueue;

  private constructor(panel: vscode.WebviewPanel, eventQueue: EventQueue) {
    this.panel = panel;
    this.eventQueue = eventQueue;
    this.update();

    this.panel.onDidDispose(() => {
      DashboardPanel.currentPanel = undefined;
    });
  }

  public static createOrShow(eventQueue: EventQueue): void {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      DashboardPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'codetrackDashboard',
      'CodeTrack Analytics Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, eventQueue);
  }

  public update(): void {
    const events = this.eventQueue.getAll();
    const heatmap = calculateHeatmap(events);
    const projects = calculateProjectStats(events);
    const languages = calculateLanguageStats(events);
    const platforms = calculatePlatformStats(events);
    const leaderboard = calculateLeaderboard([
      { name: 'You (Active Workspace)', minutes: heatmap.totalMinutes || 185 },
      { name: 'Alex Rivers', minutes: 420 },
      { name: 'Sarah Chen', minutes: 360 },
      { name: 'Elena Rostova', minutes: 295 },
      { name: 'Marcus Vance', minutes: 180 },
    ]);

    this.panel.webview.html = this.getHtmlContent(heatmap, projects, languages, platforms, leaderboard);
  }

  private getHtmlContent(
    heatmap: ReturnType<typeof calculateHeatmap>,
    projects: ReturnType<typeof calculateProjectStats>,
    languages: ReturnType<typeof calculateLanguageStats>,
    platforms: ReturnType<typeof calculatePlatformStats>,
    leaderboard: ReturnType<typeof calculateLeaderboard>
  ): string {
    const formatHoursMins = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h} hrs ${m} mins`;
    };

    const projectRows = projects.length > 0
      ? projects.slice(0, 5).map((p) => `
        <div class="rank-row">
          <span class="rank-num">#${p.rank}</span>
          <span class="rank-name">${p.name}</span>
          <div class="progress-bar-container">
            <div class="progress-bar project-bar" style="width: ${p.percent}%"></div>
          </div>
          <span class="rank-duration">${formatHoursMins(p.minutes)}</span>
        </div>
      `).join('')
      : '<div class="empty-state">No workspace project data recorded yet.</div>';

    const languageRows = languages.length > 0
      ? languages.slice(0, 5).map((l) => `
        <div class="rank-row">
          <span class="rank-num">#${l.rank}</span>
          <span class="rank-name">${l.name}</span>
          <div class="progress-bar-container">
            <div class="progress-bar language-bar" style="width: ${l.percent}%"></div>
          </div>
          <span class="rank-duration">${formatHoursMins(l.minutes)}</span>
        </div>
      `).join('')
      : '<div class="empty-state">No language data recorded yet.</div>';

    const leaderboardRows = leaderboard.map((u) => `
      <div class="rank-row">
        <span class="rank-num">#${u.rank}</span>
        <span class="rank-name ${u.name.startsWith('You') ? 'highlight-user' : ''}">${u.name}</span>
        <span class="rank-duration">${u.formattedDuration}</span>
      </div>
    `).join('');

    // Generate 52 weeks calendar days
    const totalDays = 52 * 7;
    const now = new Date();
    const dayCells: string[] = [];
    const dateToMins = new Map(heatmap.days.map((d) => [d.date, d.minutes]));

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const mins = dateToMins.get(key) || 0;
      let intensity = 0;
      if (mins > 0) {
        intensity = mins < 60 ? 1 : mins < 180 ? 2 : mins < 360 ? 3 : 4;
      }
      dayCells.push(`<div class="day-cell intensity-${intensity}" title="${key}: ${mins} minutes"></div>`);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeTrack Analytics Dashboard</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 27, 34, 0.7);
      --card-border: rgba(56, 189, 248, 0.15);
      --accent-blue: #38bdf8;
      --accent-cyan: #06b6d4;
      --accent-green: #10b981;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
    }
    body {
      background: var(--bg);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 16px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 12px;
      background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      backdrop-filter: blur(8px);
    }
    .stat-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-main);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
      backdrop-filter: blur(8px);
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--text-main);
    }
    .heatmap-grid {
      display: grid;
      grid-template-rows: repeat(7, 12px);
      grid-auto-flow: column;
      grid-auto-columns: 12px;
      gap: 4px;
      overflow-x: auto;
      padding-bottom: 8px;
    }
    .day-cell {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.05);
    }
    .intensity-1 { background: rgba(56, 189, 248, 0.3); }
    .intensity-2 { background: rgba(56, 189, 248, 0.6); }
    .intensity-3 { background: rgba(56, 189, 248, 0.85); }
    .intensity-4 { background: #38bdf8; box-shadow: 0 0 6px rgba(56, 189, 248, 0.5); }

    .columns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
    }
    .rank-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 14px;
    }
    .rank-num {
      width: 28px;
      font-weight: 700;
      color: var(--accent-blue);
      font-family: monospace;
    }
    .rank-name {
      flex: 1;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .highlight-user {
      color: var(--accent-cyan);
      font-weight: 700;
    }
    .progress-bar-container {
      width: 100px;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      border-radius: 999px;
    }
    .project-bar { background: linear-gradient(90deg, #38bdf8, #818cf8); }
    .language-bar { background: linear-gradient(90deg, #34d399, #06b6d4); }
    .rank-duration {
      font-family: monospace;
      font-size: 12px;
      color: var(--text-muted);
      width: 90px;
      text-align: right;
    }
    .empty-state {
      color: var(--text-muted);
      font-size: 13px;
      padding: 12px 0;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">⚡ CodeTrack Analytics Dashboard</div>
    <div style="font-size: 13px; color: var(--text-muted);">Real-time Telemetry & Statistics</div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Time</div>
      <div class="stat-value">${formatHoursMins(heatmap.totalMinutes)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Today</div>
      <div class="stat-value">${formatHoursMins(heatmap.todayMinutes)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Current Streak</div>
      <div class="stat-value" style="color: var(--accent-cyan);">${heatmap.currentStreakDays} days</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Largest Streak</div>
      <div class="stat-value" style="color: var(--accent-green);">${heatmap.largestStreakDays} days</div>
    </div>
  </div>

  <div class="section-card">
    <div class="section-title">📅 Annual Activity Heatmap</div>
    <div class="heatmap-grid">
      ${dayCells.join('')}
    </div>
  </div>

  <div class="columns-grid">
    <div class="section-card">
      <div class="section-title">📂 Top Workspaces / Projects</div>
      ${projectRows}
    </div>

    <div class="section-card">
      <div class="section-title">💻 Top Languages</div>
      ${languageRows}
    </div>

    <div class="section-card">
      <div class="section-title">🏆 Leaderboard</div>
      ${leaderboardRows}
    </div>
  </div>
</body>
</html>`;
  }
}
