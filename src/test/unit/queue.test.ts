import './setup';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { EventQueue, QUEUE_STORAGE_KEY } from '../../queue';
import { IActivityEvent } from '../../tracker';

class MockMemento implements vscode.Memento {
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

describe('EventQueue Unit Tests', () => {
  let memento: MockMemento;
  let queue: EventQueue;

  const sampleEvent: IActivityEvent = {
    id: 'evt-123',
    timestamp: Date.now(),
    project: 'test-project',
    language: 'typescript',
    file: 'src/main.ts',
    platform: 'macOS',
    platformArch: 'arm64',
    editor: 'vscode 1.99.0',
    operationType: 'write',
  };

  beforeEach(() => {
    memento = new MockMemento();
    queue = new EventQueue(memento);
  });

  it('should push events and persist to globalState', () => {
    assert.strictEqual(queue.size(), 0);
    queue.push(sampleEvent);
    assert.strictEqual(queue.size(), 1);

    const persisted = memento.get<IActivityEvent[]>(QUEUE_STORAGE_KEY);
    assert.ok(persisted);
    assert.strictEqual(persisted.length, 1);
    assert.strictEqual(persisted[0].id, 'evt-123');
  });

  it('should peek without removing items', () => {
    queue.push(sampleEvent);
    const peeked = queue.peek(10);
    assert.strictEqual(peeked.length, 1);
    assert.strictEqual(queue.size(), 1);
  });

  it('should remove items by id and update persistent state', () => {
    const e2: IActivityEvent = { ...sampleEvent, id: 'evt-456' };
    queue.push(sampleEvent, e2);
    assert.strictEqual(queue.size(), 2);

    queue.remove(['evt-123']);
    assert.strictEqual(queue.size(), 1);
    assert.strictEqual(queue.peek()[0].id, 'evt-456');

    const persisted = memento.get<IActivityEvent[]>(QUEUE_STORAGE_KEY);
    assert.strictEqual(persisted?.length, 1);
  });

  it('should reload existing queued events from globalState on initialization', () => {
    queue.push(sampleEvent);

    // Create a new queue instance with same memento
    const reloaded = new EventQueue(memento);
    assert.strictEqual(reloaded.size(), 1);
    assert.strictEqual(reloaded.peek()[0].id, 'evt-123');
  });
});
