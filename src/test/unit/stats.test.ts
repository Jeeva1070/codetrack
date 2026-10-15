import './setup';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { calculateMinutesQuery, StatsService } from '../../stats';
import { IBackendClient } from '../../uploader';

describe('StatsService Unit Tests', () => {
  it('should calculate correct minutes query for Total, 24h, and Today', () => {
    const fixedDate = new Date('2026-10-13T14:30:00'); // 14h 30m local -> 14 * 60 + 30 = 870
    const todayMinutes = calculateMinutesQuery('Today', fixedDate);
    assert.strictEqual(todayMinutes, 14 * 60 + 30);

    const h24Minutes = calculateMinutesQuery('24h', fixedDate);
    assert.strictEqual(h24Minutes, 1440);

    const totalMinutes = calculateMinutesQuery('Total', fixedDate);
    assert.strictEqual(totalMinutes, 60 * 24 * 365 * 100);
  });

  it('should fetch and cache stats from backend client', async () => {
    const stubClient: IBackendClient = {
      uploadEvents: async () => ({ success: true, statusCode: 200 }),
      fetchStats: async (_token, query) => ({ minutes: query === 1440 ? 120 : 500 }),
    };

    const service = new StatsService(stubClient);
    assert.strictEqual(service.getCachedMinutes('24h'), undefined);

    const fetched = await service.fetchStats('24h', 'dummy-token');
    assert.strictEqual(fetched, 120);
    assert.strictEqual(service.getCachedMinutes('24h'), 120);
    assert.strictEqual(service.isOffline(), false);
  });

  it('should fallback to cached stats and set offline state on network error', async () => {
    let fail = false;
    const stubClient: IBackendClient = {
      uploadEvents: async () => ({ success: true, statusCode: 200 }),
      fetchStats: async () => {
        if (fail) {
          throw new Error('Connection refused');
        }
        return { minutes: 300 };
      },
    };

    const service = new StatsService(stubClient);
    // Initial successful fetch
    await service.fetchStats('Total', 'dummy-token');
    assert.strictEqual(service.getCachedMinutes('Total'), 300);

    // Network drops
    fail = true;
    const fallback = await service.fetchStats('Total', 'dummy-token');
    assert.strictEqual(fallback, 300);
    assert.strictEqual(service.isOffline(), true);
  });

  it('should compute standalone minutes locally from EventQueue with zero API and zero token', async () => {
    class DummyMemento implements vscode.Memento {
      private map = new Map<string, unknown>();
      keys(): readonly string[] {
        return Array.from(this.map.keys());
      }
      get<T>(key: string): T | undefined;
      get<T>(key: string, defaultValue: T): T;
      get<T>(key: string, defaultValue?: T): T | undefined {
        return this.map.has(key) ? (this.map.get(key) as T) : defaultValue;
      }
      async update(key: string, value: unknown): Promise<void> {
        this.map.set(key, value);
      }
    }

    const { EventQueue } = await import('../../queue');
    const queue = new EventQueue(new DummyMemento());

    const now = new Date('2026-10-15T12:00:00Z');
    const nowMs = now.getTime();

    // Push 3 events: two within the same 2-minute bucket, one 10 minutes later
    queue.push(
      {
        id: '1',
        timestamp: nowMs - 1000, // 1 sec ago
        project: 'test-project',
        language: 'typescript',
        file: 'test.ts',
        platform: 'macOS',
        platformArch: 'arm64',
        editor: 'vscode',
        operationType: 'write',
      },
      {
        id: '2',
        timestamp: nowMs - 30000, // 30 sec ago (same 2-minute bucket)
        project: 'test-project',
        language: 'typescript',
        file: 'test.ts',
        platform: 'macOS',
        platformArch: 'arm64',
        editor: 'vscode',
        operationType: 'write',
      },
      {
        id: '3',
        timestamp: nowMs - 10 * 60 * 1000, // 10 min ago (different bucket)
        project: 'test-project',
        language: 'typescript',
        file: 'test.ts',
        platform: 'macOS',
        platformArch: 'arm64',
        editor: 'vscode',
        operationType: 'save',
      }
    );

    const standaloneService = new StatsService(queue);
    // Fetch stats in standalone mode with no token passed
    const todayMinutes = await standaloneService.fetchStats('Today', now);
    assert.strictEqual(todayMinutes, 4); // 2 distinct buckets * 2 min = 4 min

    const totalMinutes = await standaloneService.fetchStats('Total', now);
    assert.strictEqual(totalMinutes, 4);

    const h24Minutes = await standaloneService.fetchStats('24h', now);
    assert.strictEqual(h24Minutes, 4);
  });
});
