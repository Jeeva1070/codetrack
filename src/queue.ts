import * as vscode from 'vscode';
import { IActivityEvent } from './tracker';

export const QUEUE_STORAGE_KEY = 'gridly.eventQueue';
export const LEGACY_QUEUE_STORAGE_KEY = 'codetrack.eventQueue';
export const MAX_STORED_EVENTS = 5000;

export class EventQueue {
  private inMemoryQueue: IActivityEvent[] = [];
  private readonly globalState: vscode.Memento;
  private readonly storageKey: string;

  constructor(globalState: vscode.Memento, storageKey = QUEUE_STORAGE_KEY) {
    this.globalState = globalState;
    this.storageKey = storageKey;
    this.load();
  }

  /**
   * Loads persisted events from globalState on startup.
   */
  public load(): void {
    try {
      const persisted =
        this.globalState.get<IActivityEvent[]>(this.storageKey) ||
        (this.storageKey === QUEUE_STORAGE_KEY ? this.globalState.get<IActivityEvent[]>(LEGACY_QUEUE_STORAGE_KEY, []) : []);
      if (Array.isArray(persisted)) {
        this.inMemoryQueue = [...persisted];
      }
    } catch {
      this.inMemoryQueue = [];
    }
  }

  /**
   * Appends events to the in-memory queue and persists to globalState.
   */
  public push(...events: IActivityEvent[]): void {
    if (events.length === 0) {
      return;
    }
    this.inMemoryQueue.push(...events);
    if (this.inMemoryQueue.length > MAX_STORED_EVENTS) {
      this.inMemoryQueue = this.inMemoryQueue.slice(this.inMemoryQueue.length - MAX_STORED_EVENTS);
    }
    this.persist();
  }

  /**
   * Retrieves up to count events without removing them from queue.
   */
  public peek(count = 50): IActivityEvent[] {
    return this.inMemoryQueue.slice(0, count);
  }

  /**
   * Removes successfully processed events by their UUIDs and persists to globalState.
   */
  public remove(eventIds: string[]): void {
    if (eventIds.length === 0) {
      return;
    }
    const idSet = new Set(eventIds);
    this.inMemoryQueue = this.inMemoryQueue.filter((e) => !idSet.has(e.id));
    this.persist();
  }

  /**
   * Returns current queue size.
   */
  public size(): number {
    return this.inMemoryQueue.length;
  }

  /**
   * Clears all queued events.
   */
  public clear(): void {
    this.inMemoryQueue = [];
    this.persist();
  }

  /**
   * Returns copy of all queued items.
   */
  public getAll(): IActivityEvent[] {
    return [...this.inMemoryQueue];
  }

  private persist(): void {
    try {
      this.globalState.update(this.storageKey, this.inMemoryQueue);
    } catch {
      // ignore
    }
  }
}
