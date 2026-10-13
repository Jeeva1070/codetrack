import './setup';
import * as assert from 'node:assert';
import { getConfig, getEffectiveProxyUrl, getDashboardUrl, redactUrlForLogging } from '../../config';
import { mockConfigStore } from '../mockVscode';

describe('Config Module Unit Tests', () => {
  beforeEach(() => {
    mockConfigStore['gridly.statusBarInfo'] = 'Total';
    mockConfigStore['gridly.serverEntrypoint'] = 'https://api.codetime.dev';
    mockConfigStore['gridly.proxy'] = '';
    mockConfigStore['http.proxy'] = '';
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
  });

  it('should return default configuration when unset', () => {
    const config = getConfig();
    assert.strictEqual(config.statusBarInfo, 'Total');
    assert.strictEqual(config.serverEntrypoint, 'https://api.codetime.dev');
    assert.strictEqual(config.proxy, '');
    assert.strictEqual(config.displayLanguage, 'Auto');
    assert.strictEqual(config.trackingEnabled, true);
    assert.strictEqual(config.obfuscateFilePaths, false);
  });

  it('should derive dashboard URL correctly for codetime.dev', () => {
    const url = getDashboardUrl('https://api.codetime.dev');
    assert.strictEqual(url, 'https://codetime.dev/dashboard');
  });

  it('should derive dashboard URL correctly for custom backend', () => {
    const url = getDashboardUrl('https://api.mycompany.io:8443');
    assert.strictEqual(url, 'https://mycompany.io:8443/dashboard');
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
