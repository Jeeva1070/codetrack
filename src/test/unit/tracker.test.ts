import './setup';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { ActivityTracker, IActivityEvent, IDLE_TIMEOUT_MS, NON_WRITE_THROTTLE_WINDOW_MS } from '../../tracker';
import { mockConfigStore } from '../mockVscode';
import { sha256 } from '../../utils';

describe('ActivityTracker Unit Tests', () => {
  let tracker: ActivityTracker;
  const emittedEvents: IActivityEvent[] = [];

  beforeEach(() => {
    emittedEvents.length = 0;
    mockConfigStore['gridly.trackingEnabled'] = true;
    mockConfigStore['gridly.obfuscateFilePaths'] = false;
    tracker = new ActivityTracker((e) => emittedEvents.push(e));
  });

  afterEach(() => {
    tracker.dispose();
  });

  it('should ignore non-file schemes and empty untitled documents', () => {
    const outputDoc = {
      uri: { scheme: 'output' },
      isUntitled: false,
      languageId: 'Log',
      getText: () => 'some log',
    } as unknown as vscode.TextDocument;
    assert.strictEqual(tracker.shouldTrackDocument(outputDoc), false);

    const gitDoc = {
      uri: { scheme: 'git' },
      isUntitled: false,
      languageId: 'git-commit',
      getText: () => 'commit',
    } as unknown as vscode.TextDocument;
    assert.strictEqual(tracker.shouldTrackDocument(gitDoc), false);

    const emptyUntitledDoc = {
      uri: { scheme: 'untitled' },
      isUntitled: true,
      languageId: 'plaintext',
      getText: () => '   ',
    } as unknown as vscode.TextDocument;
    assert.strictEqual(tracker.shouldTrackDocument(emptyUntitledDoc), false);

    const qualifyingDoc = {
      uri: { scheme: 'file' },
      isUntitled: false,
      fileName: '/test/workspace/src/app.ts',
      languageId: 'typescript',
      getText: () => 'const x = 1;',
    } as unknown as vscode.TextDocument;
    assert.strictEqual(tracker.shouldTrackDocument(qualifyingDoc), true);
  });

  it('should throttle non-write events for the same file within throttle window', () => {
    const file = 'src/index.ts';
    const t0 = 1000000;

    // First open is not throttled
    assert.strictEqual(tracker.shouldThrottle(file, 'open', t0), false);

    const doc = {
      uri: { scheme: 'file' },
      isUntitled: false,
      fileName: '/test/workspace/' + file,
      languageId: 'typescript',
    } as unknown as vscode.TextDocument;

    const ev1 = tracker.recordActivity(doc, 'open', t0);
    assert.ok(ev1 !== null);

    // Second open within 2 minutes is throttled
    const t1 = t0 + 60 * 1000; // 1 min later
    assert.strictEqual(tracker.shouldThrottle(file, 'open', t1), true);
    const ev2 = tracker.recordActivity(doc, 'open', t1);
    assert.strictEqual(ev2, null);

    // After 2 minutes, open is no longer throttled
    const t2 = t0 + NON_WRITE_THROTTLE_WINDOW_MS + 1000;
    assert.strictEqual(tracker.shouldThrottle(file, 'open', t2), false);
    const ev3 = tracker.recordActivity(doc, 'open', t2);
    assert.ok(ev3 !== null);
  });

  it('should detect idle state when elapsed time exceeds IDLE_TIMEOUT_MS', () => {
    const t0 = 1000000;
    const doc = {
      uri: { scheme: 'file' },
      isUntitled: false,
      fileName: '/test/workspace/src/app.ts',
      languageId: 'typescript',
    } as unknown as vscode.TextDocument;

    tracker.recordActivity(doc, 'write', t0);
    assert.strictEqual(tracker.isIdle(t0 + 1000), false);
    assert.strictEqual(tracker.isIdle(t0 + IDLE_TIMEOUT_MS + 1000), true);
  });

  it('should obfuscate file paths with sha256 when setting is active', () => {
    mockConfigStore['gridly.obfuscateFilePaths'] = true;
    const doc = {
      uri: { scheme: 'file' },
      isUntitled: false,
      fileName: '/test/workspace/secret/passwords.txt',
      languageId: 'plaintext',
    } as unknown as vscode.TextDocument;

    const ev = tracker.recordActivity(doc, 'save', 2000000);
    assert.ok(ev);
    assert.strictEqual(ev.file, sha256('secret/passwords.txt'));
  });

  it('should respect trackingEnabled = false and produce no events', () => {
    mockConfigStore['gridly.trackingEnabled'] = false;
    const doc = {
      uri: { scheme: 'file' },
      isUntitled: false,
      fileName: '/test/workspace/main.ts',
      languageId: 'typescript',
    } as unknown as vscode.TextDocument;

    const ev = tracker.recordActivity(doc, 'write', 3000000);
    assert.strictEqual(ev, null);
    assert.strictEqual(emittedEvents.length, 0);
  });
});
