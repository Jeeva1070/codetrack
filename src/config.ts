import * as vscode from 'vscode';

export type StatusBarInfoMode = 'Total' | 'Today' | '24h';

export interface IExtensionConfig {
  statusBarInfo: StatusBarInfoMode;
  serverEntrypoint?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  proxy: string;
  displayLanguage: string;
  trackingEnabled: boolean;
  obfuscateFilePaths: boolean;
}

export const CONFIG_SECTION = 'gridly';

export const DEFAULT_SUPABASE_URL = 'https://wixjrwlnsabceldorizr.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_3jx87229ubC1A7ZubateSQ_haHQ4P3Z';

/**
 * Reads the current extension configuration from VS Code workspace.
 */
export function getConfig(): IExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    statusBarInfo: config.get<StatusBarInfoMode>('statusBarInfo', 'Total'),
    serverEntrypoint: config.get<string>('serverEntrypoint', 'https://api.codetime.dev'),
    supabaseUrl: (config.get<string>('supabaseUrl', DEFAULT_SUPABASE_URL) || DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, ''),
    supabaseKey: (config.get<string>('supabaseKey', DEFAULT_SUPABASE_KEY) || DEFAULT_SUPABASE_KEY).trim(),
    proxy: (config.get<string>('proxy', '') || '').trim(),
    displayLanguage: config.get<string>('displayLanguage', 'Auto'),
    trackingEnabled: config.get<boolean>('trackingEnabled', true),
    obfuscateFilePaths: config.get<boolean>('obfuscateFilePaths', false),
  };
}

/**
 * Resolves the effective proxy URL:
 * 1. gridly.proxy setting
 * 2. VS Code http.proxy setting
 * 3. Environment variables (HTTPS_PROXY, HTTP_PROXY, https_proxy, http_proxy)
 */
export function getEffectiveProxyUrl(): string {
  const config = getConfig();
  if (config.proxy) {
    return config.proxy;
  }

  const httpConfig = vscode.workspace.getConfiguration('http');
  const vscodeProxy = httpConfig.get<string>('proxy', '').trim();
  if (vscodeProxy) {
    return vscodeProxy;
  }

  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || '';
  return envProxy.trim();
}

/**
 * Derives the dashboard URL from the server or project URL.
 */
export function getDashboardUrl(customUrl?: string): string {
  const rawUrl = customUrl || getConfig().serverEntrypoint || getConfig().supabaseUrl || '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === 'api.codetime.dev') {
      return 'https://codetime.dev/dashboard';
    }
    const host = parsed.host.replace(/^api\./, '');
    return `${parsed.protocol}//${host}/dashboard`;
  } catch {
    return rawUrl;
  }
}

/**
 * Redacts credential info from proxy or server URLs for safe logging.
 */
export function redactUrlForLogging(rawUrl?: string): string {
  if (!rawUrl) {
    return '(none)';
  }
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '(configured)';
  }
}
