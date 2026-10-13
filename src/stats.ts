import { IBackendClient } from './uploader';
import { StatusBarInfoMode } from './config';

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

export class StatsService {
  private readonly backendClient: IBackendClient;
  private readonly cachedMinutes = new Map<StatusBarInfoMode, number>();
  private offlineState = false;

  constructor(backendClient: IBackendClient) {
    this.backendClient = backendClient;
  }

  public async fetchStats(mode: StatusBarInfoMode, token: string, now = new Date()): Promise<number> {
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
