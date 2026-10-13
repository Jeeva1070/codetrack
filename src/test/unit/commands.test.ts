import './setup';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { registerCommands } from '../../commands';
import { TokenManager } from '../../token';
import { CodeTrackStatusBar } from '../../statusBar';
import { StatsService } from '../../stats';
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

describe('Commands Unit Tests', () => {
  it('should register all three codetrack commands', () => {
    const registeredCommands: string[] = [];
    const origRegister = vscode.commands.registerCommand;
    vscode.commands.registerCommand = (cmd: string, callback: (...args: unknown[]) => unknown) => {
      registeredCommands.push(cmd);
      return origRegister(cmd, callback);
    };

    const mockContext = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    const stubClient: IBackendClient = {
      uploadEvents: async () => ({ success: true, statusCode: 200 }),
      fetchStats: async () => ({ minutes: 0 }),
    };

    const tokenManager = new TokenManager(new DummySecrets() as unknown as vscode.SecretStorage);
    const statusBar = new CodeTrackStatusBar(new StatsService(stubClient), tokenManager);

    const disposables = registerCommands(mockContext, tokenManager, statusBar);

    assert.strictEqual(disposables.length, 4);
    assert.ok(registeredCommands.includes('gridly.getToken'));
    assert.ok(registeredCommands.includes('gridly.toDashboard'));
    assert.ok(registeredCommands.includes('gridly.codeTimeInStatusBar'));
    assert.ok(registeredCommands.includes('gridly.viewDashboard'));

    statusBar.dispose();
    vscode.commands.registerCommand = origRegister;
  });
});
