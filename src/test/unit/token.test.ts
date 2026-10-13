import './setup';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { TokenManager, SECRET_STORAGE_TOKEN_KEY } from '../../token';

class MockSecretStorage {
  private storeMap = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.storeMap.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.storeMap.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.storeMap.delete(key);
  }

  onDidChange = () => ({ dispose: () => {} });
}

describe('TokenManager Unit Tests', () => {
  let mockSecrets: MockSecretStorage;

  beforeEach(() => {
    mockSecrets = new MockSecretStorage();
    delete process.env.CODETIME_TOKEN;
  });

  afterEach(() => {
    delete process.env.CODETIME_TOKEN;
  });

  it('should return empty when no token is present in env or secrets', async () => {
    const tm = new TokenManager(mockSecrets as unknown as vscode.SecretStorage);
    const token = await tm.resolveToken();
    assert.strictEqual(token, '');
    assert.strictEqual(tm.hasToken(), false);
    assert.strictEqual(tm.redactToken(), '(empty)');
  });

  it('should resolve token from SecretStorage when env is unset', async () => {
    await mockSecrets.store(SECRET_STORAGE_TOKEN_KEY, 'secret-token-1234');
    const tm = new TokenManager(mockSecrets as unknown as vscode.SecretStorage);
    const token = await tm.resolveToken();
    assert.strictEqual(token, 'secret-token-1234');
    assert.strictEqual(tm.hasToken(), true);
    assert.strictEqual(tm.redactToken(), '***1234');
  });

  it('should prioritize CODETIME_TOKEN environment variable over SecretStorage', async () => {
    await mockSecrets.store(SECRET_STORAGE_TOKEN_KEY, 'stored-token');
    process.env.CODETIME_TOKEN = 'env-token-xyz9';

    const tm = new TokenManager(mockSecrets as unknown as vscode.SecretStorage);
    const token = await tm.resolveToken();
    assert.strictEqual(token, 'env-token-xyz9');
    assert.strictEqual(tm.redactToken(), '***xyz9');
  });

  it('should validate token successfully when validator passes', async () => {
    const validator = async (token: string) => token === 'valid-token';
    const tm = new TokenManager(mockSecrets as unknown as vscode.SecretStorage, validator);

    const valid = await tm.validateToken('valid-token', 'https://api.codetime.dev');
    assert.strictEqual(valid, true);

    const invalid = await tm.validateToken('bad-token', 'https://api.codetime.dev');
    assert.strictEqual(invalid, false);
  });

  it('should handle markInvalid state and status update callback', () => {
    let statusUpdated = false;
    const tm = new TokenManager(mockSecrets as unknown as vscode.SecretStorage);
    assert.strictEqual(tm.isInvalid(), false);

    tm.markInvalid(() => {
      statusUpdated = true;
    });

    assert.strictEqual(tm.isInvalid(), true);
    assert.strictEqual(statusUpdated, true);

    tm.markValid();
    assert.strictEqual(tm.isInvalid(), false);
  });
});
