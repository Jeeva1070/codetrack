import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { formatDuration, type Locale } from 'date-fns';

let currentLanguage = 'en';
let activeBundle: Record<string, string> = {};
let fallbackEnglishBundle: Record<string, string> = {};

export const urduLocale: Locale = {
  code: 'ur',
  formatDistance: (_token, count) => `${count}`,
  formatLong: {
    date: () => '',
    time: () => '',
    dateTime: () => '',
  },
  formatRelative: () => '',
  localize: {
    ordinalNumber: (n) => `${n}`,
    era: () => '',
    quarter: () => '',
    month: () => '',
    day: () => '',
    dayPeriod: () => '',
  },
  match: {
    ordinalNumber: () => null,
    era: () => null,
    quarter: () => null,
    month: () => null,
    day: () => null,
    dayPeriod: () => null,
  },
  options: { weekStartsOn: 0, firstWeekContainsDate: 1 },
};

const localeMap: Record<string, () => Promise<unknown>> = {
  'en': () => import('date-fns/locale/en-US'),
  'en-us': () => import('date-fns/locale/en-US'),
  'zh-cn': () => import('date-fns/locale/zh-CN'),
  'zh-tw': () => import('date-fns/locale/zh-TW'),
  'ja': () => import('date-fns/locale/ja'),
  'de': () => import('date-fns/locale/de'),
  'fr': () => import('date-fns/locale/fr'),
  'es': () => import('date-fns/locale/es'),
  'it': () => import('date-fns/locale/it'),
  'pt-br': () => import('date-fns/locale/pt-BR'),
  'ru': () => import('date-fns/locale/ru'),
  'ko': () => import('date-fns/locale/ko'),
  'hi': () => import('date-fns/locale/hi'),
  'ur': async () => urduLocale,
};

export async function getDateFnsLocale(lang: string): Promise<Locale | undefined> {
  const normalized = lang.toLowerCase();
  const loader = localeMap[normalized] || localeMap[normalized.split('-')[0]] || localeMap['en'];
  if (!loader) {
    return undefined;
  }
  try {
    const mod = (await loader()) as Record<string, unknown>;
    if (mod && typeof mod === 'object') {
      if ('code' in mod) {
        return mod as unknown as Locale;
      }
      if ('default' in mod && mod.default && typeof mod.default === 'object' && 'code' in (mod.default as Record<string, unknown>)) {
        return mod.default as unknown as Locale;
      }
      // Check named export
      for (const val of Object.values(mod)) {
        if (val && typeof val === 'object' && 'code' in (val as Record<string, unknown>)) {
          return val as unknown as Locale;
        }
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function toUrduNumber(num: number): string {
  const urduDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return num
    .toString()
    .split('')
    .map((d) => urduDigits[Number(d)] ?? d)
    .join('');
}

/**
 * Formats a duration in minutes into a localized string (e.g. "3h 12m").
 */
export async function formatDurationLocalized(totalMinutes: number, lang = currentLanguage): Promise<string> {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (safeMinutes === 0) {
    if (lang.toLowerCase() === 'ur') {
      return `${toUrduNumber(0)} منٹ`;
    }
    return '0m';
  }

  if (lang.toLowerCase() === 'ur') {
    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${toUrduNumber(hours)} گھنٹے`);
    }
    if (minutes > 0) {
      parts.push(`${toUrduNumber(minutes)} منٹ`);
    }
    return parts.join(' ');
  }

  const locale = await getDateFnsLocale(lang);
  try {
    const formatted = formatDuration(
      { hours, minutes },
      {
        locale: locale,
        format: ['hours', 'minutes'],
        zero: false,
      }
    );
    if (formatted && formatted.trim().length > 0) {
      return formatted;
    }
  } catch {
    // Fallback below
  }

  // Standard compact fallback
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  return parts.join(' ') || '0m';
}

/**
 * Initializes i18n bundle and language resolution.
 */
export async function initI18n(extensionUri: vscode.Uri | string, explicitLanguage = 'Auto'): Promise<void> {
  const basePath = typeof extensionUri === 'string' ? extensionUri : extensionUri.fsPath;

  // Load English fallback bundle first
  try {
    const fallbackPath = path.join(basePath, 'l10n', 'bundle.l10n.json');
    const content = await fs.readFile(fallbackPath, 'utf8');
    fallbackEnglishBundle = JSON.parse(content);
  } catch {
    fallbackEnglishBundle = {};
  }

  let resolved = explicitLanguage;
  if (!resolved || resolved === 'Auto') {
    resolved = vscode.env.language || 'en';
  }
  currentLanguage = resolved;

  // Attempt to load localized bundle
  const normalized = currentLanguage.toLowerCase();
  const candidateFiles = [
    path.join(basePath, 'l10n', `bundle.l10n.${normalized}.json`),
    path.join(basePath, 'l10n', `bundle.l10n.${normalized.split('-')[0]}.json`),
    path.join(basePath, `package.nls.${normalized}.json`),
  ];

  activeBundle = {};
  for (const file of candidateFiles) {
    try {
      const content = await fs.readFile(file, 'utf8');
      activeBundle = JSON.parse(content);
      break;
    } catch {
      // Continue trying candidates
    }
  }
}

/**
 * Retrieves the currently active language.
 */
export function getCurrentLanguage(): string {
  return currentLanguage;
}

/**
 * Localizes a message key.
 * Falls back to:
 * 1. Current active bundle
 * 2. @vscode/l10n.t
 * 3. English fallback bundle
 * 4. The raw key itself
 */
export function t(message: string, ...args: Array<string | number | boolean>): string {
  let result = activeBundle[message];

  if (!result) {
    try {
      result = (vscode.l10n.t as (...a: unknown[]) => string)(message, ...args);
    } catch {
      // ignore
    }
  }

  if (!result || result === message) {
    result = fallbackEnglishBundle[message] || message;
  }

  // Handle placeholders {0}, {1}, etc. if present
  if (args.length > 0 && typeof result === 'string') {
    return result.replace(/\{(\d+)\}/g, (match, indexStr) => {
      const index = Number(indexStr);
      return index < args.length ? String(args[index]) : match;
    });
  }

  return result;
}
