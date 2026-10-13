import './setup';
import * as assert from 'node:assert';
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
});
