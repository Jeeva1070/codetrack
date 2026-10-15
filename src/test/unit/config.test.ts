import './setup';
import * as assert from 'node:assert';
import { getConfig, getEffectiveProxyUrl, getDashboardUrl, redactUrlForLogging } from '../../config';
import { mockConfigStore } from '../mockVscode';

describe('Config Module Unit Tests', () => {
  beforeEach(() => {
    mockConfigStore['gridly.statusBarInfo'] = 'Total';
    mockConfigStore['gridly.serverEntrypoint'] = 'https://wixjrwlnsabceldorizr.supabase.co';
    mockConfigStore['gridly.proxy'] = '';
    mockConfigStore['http.proxy'] = '';
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
  });

  it('should return default configuration when unset', () => {
    const config = getConfig();
    assert.strictEqual(config.statusBarInfo, 'Total');
    assert.strictEqual(config.serverEntrypoint, 'https://wixjrwlnsabceldorizr.supabase.co');
    assert.strictEqual(config.proxy, '');
    assert.strictEqual(config.displayLanguage, 'Auto');
    assert.strictEqual(config.trackingEnabled, true);
    assert.strictEqual(config.obfuscateFilePaths, false);
  });

  it('should derive dashboard URL correctly for Supabase', () => {
    const url = getDashboardUrl('https://wixjrwlnsabceldorizr.supabase.co');
    assert.strictEqual(url, 'https://supabase.com/dashboard/project/wixjrwlnsabceldorizr');
  });

  it('should derive dashboard URL correctly for custom backend', () => {
    const url = getDashboardUrl('https://custom-proj.supabase.co');
    assert.strictEqual(url, 'https://supabase.com/dashboard/project/custom-proj');
  });

  it('should resolve effective proxy by precedence: extension > vscode > env', () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:8080';
    assert.strictEqual(getEffectiveProxyUrl(), 'http://env-proxy:8080');

    mockConfigStore['http.proxy'] = 'http://vscode-proxy:8080';
    assert.strictEqual(getEffectiveProxyUrl(), 'http://vscode-proxy:8080');

    mockConfigStore['gridly.proxy'] = 'http://extension-proxy:9090';
    assert.strictEqual(getEffectiveProxyUrl(), 'http://extension-proxy:9090');
  });

  it('should safely redact credentials in URLs for logging', () => {
    const redacted = redactUrlForLogging('http://admin:secret123@proxy.internal:8080/path?key=val');
    assert.strictEqual(redacted, 'http://proxy.internal:8080');
    assert.strictEqual(redactUrlForLogging(''), '(none)');
  });
});
