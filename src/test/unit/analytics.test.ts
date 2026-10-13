import './setup';
import * as assert from 'node:assert';
import {
  calculateHeatmap,
  calculateProjectStats,
  calculateLanguageStats,
  calculatePlatformStats,
  calculateLeaderboard,
  getIntensityLevel,
} from '../../analytics';
import { IActivityEvent } from '../../tracker';
import { MockCodeTrackServer } from '../../mockServer';

describe('Analytics Logics Unit Tests (Heatmap, Projects, Languages, Leaderboards)', () => {
  const baseTimestamp = new Date('2026-10-13T12:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const mockEvents: IActivityEvent[] = [
    // Today: 4 events (8 mins) in project "codetrack", languages typescript and swift
    {
      id: 'e1',
      timestamp: baseTimestamp,
      project: 'codetrack',
      language: 'typescript',
      file: 'src/extension.ts',
      platform: 'macOS',
      platformArch: 'arm64',
      editor: 'vscode 1.99.0',
      operationType: 'write',
    },
    {
      id: 'e2',
      timestamp: baseTimestamp + 1000,
      project: 'codetrack',
      language: 'typescript',
      file: 'src/tracker.ts',
      platform: 'macOS',
      platformArch: 'arm64',
      editor: 'vscode 1.99.0',
      operationType: 'write',
    },
    {
      id: 'e3',
      timestamp: baseTimestamp + 2000,
      project: 'mobile-app',
      language: 'swift',
      file: 'ContentView.swift',
      platform: 'macOS',
      platformArch: 'arm64',
      editor: 'vscode 1.99.0',
      operationType: 'write',
    },
    {
      id: 'e4',
      timestamp: baseTimestamp + 3000,
      project: 'backend-api',
      language: 'python',
      file: 'main.py',
      platform: 'linux',
      platformArch: 'x64',
      editor: 'vscode 1.99.0',
      operationType: 'save',
    },

    // Yesterday: 2 events in codetrack (typescript)
    {
      id: 'e5',
      timestamp: baseTimestamp - dayMs,
      project: 'codetrack',
      language: 'typescript',
      file: 'src/config.ts',
      platform: 'macOS',
      platformArch: 'arm64',
      editor: 'vscode 1.99.0',
      operationType: 'write',
    },
    {
      id: 'e6',
      timestamp: baseTimestamp - dayMs + 1000,
      project: 'codetrack',
      language: 'typescript',
      file: 'src/i18n.ts',
      platform: 'macOS',
      platformArch: 'arm64',
      editor: 'vscode 1.99.0',
      operationType: 'save',
    },

    // 2 days ago: 1 event in mobile-app (swift)
    {
      id: 'e7',
      timestamp: baseTimestamp - 2 * dayMs,
      project: 'mobile-app',
      language: 'swift',
      file: 'ProfileView.swift',
      platform: 'macOS',
      platformArch: 'arm64',
      editor: 'vscode 1.99.0',
      operationType: 'write',
    },

    // Gap: 5 days ago (streak break)
    {
      id: 'e8',
      timestamp: baseTimestamp - 5 * dayMs,
      project: 'analytics-dashboard',
      language: 'go',
      file: 'server.go',
      platform: 'windows',
      platformArch: 'x64',
      editor: 'vscode 1.99.0',
      operationType: 'write',
    },
  ];

  describe('01 Heatmap & Streaks Logic', () => {
    it('should assign correct intensity levels based on minutes', () => {
      assert.strictEqual(getIntensityLevel(0), 0);
      assert.strictEqual(getIntensityLevel(30), 1);
      assert.strictEqual(getIntensityLevel(120), 2);
      assert.strictEqual(getIntensityLevel(240), 3);
      assert.strictEqual(getIntensityLevel(400), 4);
    });

    it('should aggregate daily minutes and compute current and largest streak', () => {
      const targetDate = new Date(baseTimestamp);
      const heatmap = calculateHeatmap(mockEvents, targetDate);

      // Today (4 events * 2m = 8m)
      assert.strictEqual(heatmap.todayMinutes, 8);
      // Total (8 events * 2m = 16m)
      assert.strictEqual(heatmap.totalMinutes, 16);

      // Consecutive days: 2 days ago, yesterday, today -> 3 days active streak
      assert.strictEqual(heatmap.currentStreakDays, 3);
      assert.strictEqual(heatmap.largestStreakDays, 3);
      assert.ok(heatmap.days.length >= 4);
    });
  });

  describe('02 Project Distribution Logic', () => {
    it('should calculate project breakdown ranked by time with relative scaling', () => {
      const projects = calculateProjectStats(mockEvents);
      assert.ok(projects.length >= 3);

      // Top project should be codetrack (4 events: e1, e2, e5, e6 = 8 mins)
      assert.strictEqual(projects[0].rank, 1);
      assert.strictEqual(projects[0].name, 'codetrack');
      assert.strictEqual(projects[0].minutes, 8);
      assert.strictEqual(projects[0].percent, 100);

      // Second project should be mobile-app (2 events = 4 mins -> 50%)
      assert.strictEqual(projects[1].rank, 2);
      assert.strictEqual(projects[1].name, 'mobile-app');
      assert.strictEqual(projects[1].minutes, 4);
      assert.strictEqual(projects[1].percent, 50);
    });
  });

  describe('03 Language Distribution Logic', () => {
    it('should calculate language breakdown ranked by time with relative scaling', () => {
      const languages = calculateLanguageStats(mockEvents);
      assert.ok(languages.length >= 3);

      // Top language should be typescript (4 events = 8 mins)
      assert.strictEqual(languages[0].rank, 1);
      assert.strictEqual(languages[0].name, 'typescript');
      assert.strictEqual(languages[0].minutes, 8);
      assert.strictEqual(languages[0].percent, 100);

      // Second language should be swift (2 events = 4 mins -> 50%)
      assert.strictEqual(languages[1].rank, 2);
      assert.strictEqual(languages[1].name, 'swift');
      assert.strictEqual(languages[1].minutes, 4);
      assert.strictEqual(languages[1].percent, 50);
    });
  });

  describe('04 Platform Distribution Logic', () => {
    it('should calculate platform breakdown across operating systems', () => {
      const platforms = calculatePlatformStats(mockEvents);
      assert.ok(platforms.length >= 2);

      // Top platform should be macOS (6 events = 12 mins)
      assert.strictEqual(platforms[0].rank, 1);
      assert.strictEqual(platforms[0].name, 'macOS');
      assert.strictEqual(platforms[0].minutes, 12);
    });
  });

  describe('05 Leaderboard Logic', () => {
    it('should rank participants, format durations, and assign correct rankings', () => {
      const entries = [
        { name: 'Developer A', minutes: 75 },
        { name: 'Developer B', minutes: 300 },
        { name: 'Developer C', minutes: 180 },
      ];

      const leaderboard = calculateLeaderboard(entries);
      assert.strictEqual(leaderboard.length, 3);

      // Rank 1: Developer B (300 mins -> 5h 0m)
      assert.strictEqual(leaderboard[0].rank, 1);
      assert.strictEqual(leaderboard[0].name, 'Developer B');
      assert.strictEqual(leaderboard[0].formattedDuration, '5h 0m');

      // Rank 2: Developer C (180 mins -> 3h 0m)
      assert.strictEqual(leaderboard[1].rank, 2);
      assert.strictEqual(leaderboard[1].name, 'Developer C');
      assert.strictEqual(leaderboard[1].formattedDuration, '3h 0m');

      // Rank 3: Developer A (75 mins -> 1h 15m)
      assert.strictEqual(leaderboard[2].rank, 3);
      assert.strictEqual(leaderboard[2].name, 'Developer A');
      assert.strictEqual(leaderboard[2].formattedDuration, '1h 15m');
    });
  });

  describe('06 Mock Server Analytics HTTP Endpoints', () => {
    let mockServer: MockCodeTrackServer;
    let serverUrl: string;

    before(async () => {
      mockServer = new MockCodeTrackServer();
      serverUrl = await mockServer.start();
    });

    after(async () => {
      await mockServer.stop();
    });

    it('should post events and retrieve Heatmap, Projects, Languages, and Leaderboard via HTTP', async () => {
      // 1. Post batch events
      const postRes = await fetch(`${serverUrl}/v3/users/event-log`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockServer.validToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          mockEvents.map((e) => ({
            id: e.id,
            project: e.project,
            language: e.language,
            relativeFile: e.file,
            eventTime: e.timestamp,
            operationType: e.operationType,
          }))
        ),
      });
      assert.strictEqual(postRes.status, 200);

      // 2. Fetch Heatmap
      const heatmapRes = await fetch(`${serverUrl}/v3/users/self/heatmap`, {
        headers: { 'Authorization': `Bearer ${mockServer.validToken}` },
      });
      assert.strictEqual(heatmapRes.status, 200);
      const heatmapData = (await heatmapRes.json()) as { totalMinutes: number; days: unknown[] };
      assert.strictEqual(heatmapData.totalMinutes, 16);
      assert.ok(Array.isArray(heatmapData.days));

      // 3. Fetch Projects
      const projectsRes = await fetch(`${serverUrl}/v3/users/self/projects`, {
        headers: { 'Authorization': `Bearer ${mockServer.validToken}` },
      });
      assert.strictEqual(projectsRes.status, 200);
      const projectsData = (await projectsRes.json()) as { projects: Array<{ name: string }> };
      assert.strictEqual(projectsData.projects[0].name, 'codetrack');

      // 4. Fetch Languages
      const languagesRes = await fetch(`${serverUrl}/v3/users/self/languages`, {
        headers: { 'Authorization': `Bearer ${mockServer.validToken}` },
      });
      assert.strictEqual(languagesRes.status, 200);
      const languagesData = (await languagesRes.json()) as { languages: Array<{ name: string }> };
      assert.strictEqual(languagesData.languages[0].name, 'typescript');

      // 5. Fetch Leaderboard
      const leaderboardRes = await fetch(`${serverUrl}/v3/users/leaderboard`, {
        headers: { 'Authorization': `Bearer ${mockServer.validToken}` },
      });
      assert.strictEqual(leaderboardRes.status, 200);
      const leaderboardData = (await leaderboardRes.json()) as { leaderboard: Array<{ rank: number }> };
      assert.ok(leaderboardData.leaderboard.length >= 3);
      assert.strictEqual(leaderboardData.leaderboard[0].rank, 1);
    });
  });
});
