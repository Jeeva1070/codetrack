import './setup';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { CodeTrackStatusBar } from '../../statusBar';
import { StatsService } from '../../stats';
import { TokenManager } from '../../token';
import { IBackendClient } from '../../uploader';

class DummySecrets implements vscode.SecretStorage {
  private map = new Map<string, string>();
  async keys(): Promise<string[]> {
    return Array.from(this.map.keys());
  }
  async get(key: string): Promise<string | undefined> {
    return this.map.get(key);
  }
  async store(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  onDidChange = () => ({ dispose: () => {} });
}

describe('CodeTrackStatusBar Unit Tests', () => {
  let statsService: StatsService;
  let tokenManager: TokenManager;
  let statusBar: CodeTrackStatusBar;
  let secrets: DummySecrets;

  beforeEach(() => {
    const stubClient: IBackendClient = {
      uploadEvents: async () => ({ success: true, statusCode: 200 }),
      fetchStats: async () => ({ minutes: 195 }),
    };
    statsService = new StatsService(stubClient);
    secrets = new DummySecrets();
    tokenManager = new TokenManager(secrets as unknown as vscode.SecretStorage);
    statusBar = new CodeTrackStatusBar(statsService, tokenManager);
  });

  afterEach(() => {
    statusBar.dispose();
  });

  it('should initialize with Initializing text', () => {
    const item = statusBar.getStatusBarItem();
    assert.ok(item.text.includes('Initializing'), `Text was: ${item.text}`);
  });

  it('should transition to Without Token state when token is empty', async () => {
    await statusBar.refresh();
    const item = statusBar.getStatusBarItem();
    assert.ok(item.text.includes('Without Token'), `Text was: ${item.text}`);
    assert.strictEqual(item.command, 'codetrack.getToken');
  });

  it('should transition to Token Invalid state when token marked invalid', async () => {
    await secrets.store('codetrack.token', 'bad-token');
    await tokenManager.resolveToken();
    tokenManager.markInvalid();

    await statusBar.refresh();
    const item = statusBar.getStatusBarItem();
    assert.ok(item.text.includes('Token Invalid'), `Text was: ${item.text}`);
    assert.strictEqual(item.command, 'codetrack.getToken');
  });

  it('should transition to success duration when token is valid', async () => {
    await secrets.store('codetrack.token', 'good-token');
    await tokenManager.resolveToken();

    await statusBar.refresh();
    const item = statusBar.getStatusBarItem();
    assert.ok(item.text.includes('$(clock)'), `Text was: ${item.text}`);
    assert.ok(item.text.includes('3h') || item.text.includes('3 hours'), `Text was: ${item.text}`);
    assert.strictEqual(item.command, 'codetrack.toDashboard');
  });
});
