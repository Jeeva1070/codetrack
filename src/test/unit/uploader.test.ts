import './setup';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { EventQueue } from '../../queue';
import { Uploader, HttpBackendClient, IBackendClient } from '../../uploader';
import { TokenManager, SECRET_STORAGE_TOKEN_KEY } from '../../token';
import { MockCodeTrackServer } from '../../mockServer';
import { IActivityEvent } from '../../tracker';
import { mockConfigStore } from '../mockVscode';

class TestMemento implements vscode.Memento {
  private map = new Map<string, unknown>();
  keys(): readonly string[] {
    return Array.from(this.map.keys());
  }
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.map.has(key) ? (this.map.get(key) as T) : defaultValue;
  }
  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.map.delete(key);
    } else {
      this.map.set(key, value);
    }
  }
}

class TestSecrets implements vscode.SecretStorage {
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

describe('Uploader & MockServer Unit Tests', () => {
  let mockServer: MockCodeTrackServer;
  let serverUrl: string;
  let queue: EventQueue;
  let secrets: TestSecrets;
  let tokenManager: TokenManager;

  const testEvent: IActivityEvent = {
    id: 'test-event-uuid-1',
    timestamp: Date.now(),
    project: 'demo-app',
    language: 'typescript',
    file: 'src/app.ts',
    platform: 'macOS',
    platformArch: 'arm64',
    editor: 'vscode 1.99.0',
    operationType: 'write',
  };

  before(async () => {
    mockServer = new MockCodeTrackServer();
    serverUrl = await mockServer.start();
  });

  after(async () => {
    await mockServer.stop();
  });

  beforeEach(async () => {
    mockServer.setSimulatedStatus(null);
    mockServer.clearReceivedEvents();
    mockConfigStore['gridly.serverEntrypoint'] = serverUrl;
    queue = new EventQueue(new TestMemento());
    secrets = new TestSecrets();
    await secrets.store(SECRET_STORAGE_TOKEN_KEY, mockServer.validToken);
    tokenManager = new TokenManager(secrets as unknown as vscode.SecretStorage);
    await tokenManager.resolveToken();
  });

  it('should successfully upload events via HttpBackendClient to MockServer', async () => {
    const client = new HttpBackendClient();
    queue.push(testEvent);
    const uploader = new Uploader(queue, client, tokenManager);

    const success = await uploader.flush();
    assert.strictEqual(success, true);
    assert.strictEqual(queue.size(), 0);

    const received = mockServer.getReceivedEvents();
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].id, 'test-event-uuid-1');
  });

  it('should handle 401 Unauthorized and mark token invalid', async () => {
    mockServer.setSimulatedStatus(401);
    const client = new HttpBackendClient();
    queue.push(testEvent);
    const uploader = new Uploader(queue, client, tokenManager);

    const success = await uploader.flush();
    assert.strictEqual(success, false);
    assert.strictEqual(tokenManager.isInvalid(), true);
    // Events must remain in queue until token is refreshed
    assert.strictEqual(queue.size(), 1);
  });

  it('should handle 429 Rate Limiting and set backoff from Retry-After', async () => {
    mockServer.setSimulatedStatus(429, 30);
    const client = new HttpBackendClient();
    queue.push(testEvent);
    const uploader = new Uploader(queue, client, tokenManager);

    const success = await uploader.flush();
    assert.strictEqual(success, false);
    assert.strictEqual(queue.size(), 1);
    assert.strictEqual(uploader.getBackoffDelayMs(), 30 * 1000);
  });

  it('should drop malformed batch on 400 Bad Request to prevent poisoning', async () => {
    const stubClient: IBackendClient = {
      uploadEvents: async () => ({ success: false, statusCode: 400, error: 'Bad Request' }),
      fetchStats: async () => ({ minutes: 0 }),
    };
    queue.push(testEvent);
    const uploader = new Uploader(queue, stubClient, tokenManager);

    const success = await uploader.flush();
    assert.strictEqual(success, false);
    assert.strictEqual(queue.size(), 0); // 400 is unrecoverable, batch dropped
  });

  it('should apply exponential backoff on 500 server error and keep events in queue', async () => {
    const stubClient: IBackendClient = {
      uploadEvents: async () => ({ success: false, statusCode: 500, error: 'Internal Server Error' }),
      fetchStats: async () => ({ minutes: 0 }),
    };
    queue.push(testEvent);
    const uploader = new Uploader(queue, stubClient, tokenManager);

    await uploader.flush();
    assert.strictEqual(queue.size(), 1);
    assert.ok(uploader.getBackoffDelayMs() >= 2000);
  });
});
