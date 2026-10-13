import * as vscode from 'vscode';

export type StatusBarInfoMode = 'Total' | 'Today' | '24h';

export interface IExtensionConfig {
  statusBarInfo: StatusBarInfoMode;
  serverEntrypoint: string;
  proxy: string;
  displayLanguage: string;
  trackingEnabled: boolean;
  obfuscateFilePaths: boolean;
}

export const CONFIG_SECTION = 'codetrack';

export const DEFAULT_SERVER_ENTRYPOINT = 'https://api.codetime.dev';
export const DEFAULT_DASHBOARD_URL = 'https://codetime.dev/dashboard';

/**
 * Reads the current extension configuration from VS Code workspace.
 */
export function getConfig(): IExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    statusBarInfo: config.get<StatusBarInfoMode>('statusBarInfo', 'Total'),
    serverEntrypoint: (config.get<string>('serverEntrypoint', DEFAULT_SERVER_ENTRYPOINT) || DEFAULT_SERVER_ENTRYPOINT).trim().replace(/\/+$/, ''),
    proxy: (config.get<string>('proxy', '') || '').trim(),
    displayLanguage: config.get<string>('displayLanguage', 'Auto'),
    trackingEnabled: config.get<boolean>('trackingEnabled', true),
    obfuscateFilePaths: config.get<boolean>('obfuscateFilePaths', false),
  };
}

/**
 * Resolves the effective proxy URL:
 * 1. codetrack.proxy setting
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
 * Derives the dashboard URL from the server entrypoint URL.
 * If server is api.codetime.dev -> https://codetime.dev/dashboard.
 * Otherwise uses the entrypoint host + /dashboard.
 */
export function getDashboardUrl(serverEntrypoint?: string): string {
  const entry = serverEntrypoint || getConfig().serverEntrypoint;
  try {
    const parsed = new URL(entry);
    if (parsed.hostname.includes('api.codetime.dev')) {
      return DEFAULT_DASHBOARD_URL;
    }
    // For custom backends, strip 'api.' prefix if present and append /dashboard
    const host = parsed.hostname.startsWith('api.') ? parsed.hostname.slice(4) : parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${host}${port}/dashboard`;
  } catch {
    return DEFAULT_DASHBOARD_URL;
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
