import { IBackendClient } from './uploader';
import { StatusBarInfoMode } from './config';
import { IActivityEvent } from './tracker';
import { EventQueue } from './queue';

/**
 * Calculates the number of minutes to request from the server based on the mode.
 */
export function calculateMinutesQuery(mode: StatusBarInfoMode, now = new Date()): number {
  switch (mode) {
    case 'Today': {
      // Local minutes from midnight
      const hours = now.getHours();
      const mins = now.getMinutes();
      return Math.max(1, hours * 60 + mins);
    }
    case '24h': {
      return 24 * 60; // 1440 minutes
    }
    case 'Total':
    default: {
      return 60 * 24 * 365 * 100; // 100 years (all-time)
    }
  }
}

/**
 * Calculates coding duration locally from activity events.
 * Coalesces activity into 2-minute time buckets.
 */
export function calculateLocalMinutes(events: IActivityEvent[], mode: StatusBarInfoMode, now = new Date()): number {
  if (events.length === 0) {
    return 0;
  }

  const nowMs = now.getTime();
  const startOfTodayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const twentyFourHoursAgoMs = nowMs - 24 * 60 * 60 * 1000;

  let filtered = events;
  if (mode === 'Today') {
    filtered = events.filter((e) => e.timestamp >= startOfTodayMs && e.timestamp <= nowMs);
  } else if (mode === '24h') {
    filtered = events.filter((e) => e.timestamp >= twentyFourHoursAgoMs && e.timestamp <= nowMs);
  }

  const bucketMs = 2 * 60 * 1000;
  const buckets = new Set<number>();
  for (const e of filtered) {
    buckets.add(Math.floor(e.timestamp / bucketMs));
  }
  return buckets.size * 2;
}

export class StatsService {
  private readonly backendClient?: IBackendClient;
  private readonly eventQueue?: EventQueue;
  private readonly cachedMinutes = new Map<StatusBarInfoMode, number>();
  private offlineState = false;

  constructor(backendOrQueue?: IBackendClient | EventQueue, eventQueue?: EventQueue) {
    if (backendOrQueue && 'uploadEvents' in backendOrQueue) {
      this.backendClient = backendOrQueue as IBackendClient;
      this.eventQueue = eventQueue;
    } else if (backendOrQueue && 'getAll' in backendOrQueue) {
      this.eventQueue = backendOrQueue as EventQueue;
    }
  }

  public async fetchStats(mode: StatusBarInfoMode, tokenOrNow?: string | Date, maybeNow?: Date): Promise<number> {
    const token = typeof tokenOrNow === 'string' ? tokenOrNow : undefined;
    const now = tokenOrNow instanceof Date ? tokenOrNow : (maybeNow || new Date());

    if (this.backendClient && token) {
      const minutesQuery = calculateMinutesQuery(mode, now);
      try {
        const res = await this.backendClient.fetchStats(token, minutesQuery);
        const minutes = res.minutes;
        this.cachedMinutes.set(mode, minutes);
        this.offlineState = false;
        return minutes;
      } catch (err: unknown) {
        this.offlineState = true;
        const cached = this.cachedMinutes.get(mode);
        if (cached !== undefined) {
          return cached;
        }
        throw err;
      }
    }

    // Standalone local calculation
    const events = this.eventQueue ? this.eventQueue.getAll() : [];
    const minutes = calculateLocalMinutes(events, mode, now);
    this.cachedMinutes.set(mode, minutes);
    this.offlineState = false;
    return minutes;
  }

  public getCachedMinutes(mode: StatusBarInfoMode): number | undefined {
    return this.cachedMinutes.get(mode);
  }

  public setCachedMinutes(mode: StatusBarInfoMode, minutes: number): void {
    this.cachedMinutes.set(mode, minutes);
  }

  public isOffline(): boolean {
    return this.offlineState;
  }

  public setOffline(offline: boolean): void {
    this.offlineState = offline;
  }
}
