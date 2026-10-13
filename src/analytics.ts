import { IActivityEvent } from './tracker';

export interface IDayActivity {
  date: string; // YYYY-MM-DD
  minutes: number;
  intensity: number; // 0 to 4
}

export interface IHeatmapSummary {
  totalMinutes: number;
  todayMinutes: number;
  currentStreakDays: number;
  largestStreakDays: number;
  days: IDayActivity[];
}

export interface IRankedItem {
  rank: number;
  name: string;
  minutes: number;
  percent: number; // 0 - 100
}

export interface ILeaderboardEntry {
  rank: number;
  name: string;
  minutes: number;
  formattedDuration: string;
}

/**
 * Maps minutes coded in a day to an activity intensity level (0-4).
 */
export function getIntensityLevel(minutes: number): number {
  if (minutes <= 0) {
    return 0;
  }
  if (minutes < 60) {
    return 1; // < 1 hr
  }
  if (minutes < 180) {
    return 2; // 1 - 3 hrs
  }
  if (minutes < 360) {
    return 3; // 3 - 6 hrs
  }
  return 4; // >= 6 hrs
}

function formatDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Aggregates raw activity events into a full annual calendar heatmap,
 * calculating total duration, today's time, current streak, and largest streak.
 */
export function calculateHeatmap(events: IActivityEvent[], targetDate = new Date()): IHeatmapSummary {
  const dailyMinutesMap = new Map<string, number>();

  for (const e of events) {
    const eventDate = new Date(e.timestamp);
    const dateKey = formatDateString(eventDate);
    // Estimate 2 minutes active coding per qualifying recorded action (coalesced)
    const current = dailyMinutesMap.get(dateKey) || 0;
    dailyMinutesMap.set(dateKey, current + 2);
  }

  const todayKey = formatDateString(targetDate);
  const todayMinutes = dailyMinutesMap.get(todayKey) || 0;
  let totalMinutes = 0;

  for (const mins of dailyMinutesMap.values()) {
    totalMinutes += mins;
  }

  // Calculate streaks
  const sortedDates = Array.from(dailyMinutesMap.keys()).sort();
  let currentStreak = 0;
  let largestStreak = 0;
  let runningStreak = 0;
  let previousDate: Date | null = null;

  for (const dateStr of sortedDates) {
    const mins = dailyMinutesMap.get(dateStr) || 0;
    if (mins > 0) {
      const parts = dateStr.split('-').map(Number);
      const currentDate = new Date(parts[0], parts[1] - 1, parts[2]);

      if (previousDate) {
        const diffMs = currentDate.getTime() - previousDate.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          runningStreak++;
        } else if (diffDays > 1) {
          runningStreak = 1;
        }
      } else {
        runningStreak = 1;
      }
      previousDate = currentDate;

      if (runningStreak > largestStreak) {
        largestStreak = runningStreak;
      }
    }
  }

  // Check if current streak extends to today or yesterday
  if (previousDate) {
    const diffToToday = Math.round((targetDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffToToday <= 1) {
      currentStreak = runningStreak;
    } else {
      currentStreak = 0;
    }
  }

  const days: IDayActivity[] = sortedDates.map((date) => {
    const mins = dailyMinutesMap.get(date) || 0;
    return {
      date,
      minutes: mins,
      intensity: getIntensityLevel(mins),
    };
  });

  return {
    totalMinutes,
    todayMinutes,
    currentStreakDays: currentStreak,
    largestStreakDays: largestStreak,
    days,
  };
}

/**
 * Calculates top project breakdown ranked by active programming duration.
 */
export function calculateProjectStats(events: IActivityEvent[]): IRankedItem[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const name = e.project || 'Unknown';
    map.set(name, (map.get(name) || 0) + 2);
  }

  let total = 0;
  for (const mins of map.values()) {
    total += mins;
  }

  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  return sorted.map(([name, mins], idx) => ({
    rank: idx + 1,
    name,
    minutes: mins,
    percent: total > 0 ? Math.round((mins / max) * 100) : 0,
  }));
}

/**
 * Calculates top language breakdown ranked by active programming duration.
 */
export function calculateLanguageStats(events: IActivityEvent[]): IRankedItem[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const lang = e.language || 'plaintext';
    map.set(lang, (map.get(lang) || 0) + 2);
  }

  let total = 0;
  for (const mins of map.values()) {
    total += mins;
  }

  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  return sorted.map(([name, mins], idx) => ({
    rank: idx + 1,
    name,
    minutes: mins,
    percent: total > 0 ? Math.round((mins / max) * 100) : 0,
  }));
}

/**
 * Calculates platform breakdown ranked by active programming duration.
 */
export function calculatePlatformStats(events: IActivityEvent[]): IRankedItem[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const plat = e.platform || 'Unknown';
    map.set(plat, (map.get(plat) || 0) + 2);
  }

  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  return sorted.map(([name, mins], idx) => ({
    rank: idx + 1,
    name,
    minutes: mins,
    percent: max > 0 ? Math.round((mins / max) * 100) : 0,
  }));
}

/**
 * Builds a leaderboard ranking list from participant data.
 */
export function calculateLeaderboard(entries: Array<{ name: string; minutes: number }>): ILeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => b.minutes - a.minutes);
  return sorted.map((item, idx) => {
    const hours = Math.floor(item.minutes / 60);
    const mins = item.minutes % 60;
    const formattedDuration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    return {
      rank: idx + 1,
      name: item.name,
      minutes: item.minutes,
      formattedDuration,
    };
  });
}
