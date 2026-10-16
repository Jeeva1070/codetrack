import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import osName from 'os-name';
import { getConfig } from './config';
import { getGitCurrentBranch, getGitOriginUrl, sha256 } from './utils';

export type OperationType = 'write' | 'save' | 'open' | 'focus';

export interface IActivityEvent {
  id: string;
  timestamp: number;
  project: string;
  language: string;
  file: string;
  absoluteFile?: string;
  platform: string;
  platformArch: string;
  editor: string;
  gitBranch?: string;
  gitOrigin?: string;
  operationType: OperationType;
}

/**
 * Default timing constants [VERIFY]
 */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle threshold
export const NON_WRITE_THROTTLE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes window for non-write events
export const WRITE_THROTTLE_WINDOW_MS = 1000; // 1 second debounce window for write events

export class ActivityTracker implements vscode.Disposable {
  private readonly onEvent: (event: IActivityEvent) => void;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly platformString: string;
  private readonly platformArch: string;
  private lastActivityTime: number = Date.now();
  private isWindowFocused: boolean = true;
  private readonly lastFileEvents = new Map<string, { timestamp: number; op: OperationType }>();

  constructor(onEvent: (event: IActivityEvent) => void) {
    this.onEvent = onEvent;
    this.platformString = osName();
    this.platformArch = os.arch();
    this.setupListeners();
  }

  private setupListeners(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(this.onDocumentChanged, this),
      vscode.workspace.onDidSaveTextDocument(this.onDocumentSaved, this),
      vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChanged, this),
      vscode.window.onDidChangeTextEditorSelection(this.onSelectionChanged, this),
      vscode.window.onDidChangeWindowState(this.onWindowStateChanged, this)
    );
  }

  /**
   * Evaluates if a document qualifies for tracking.
   */
  public shouldTrackDocument(doc?: vscode.TextDocument): boolean {
    if (!doc) {
      return false;
    }

    const scheme = doc.uri.scheme;
    if (scheme === 'output' || scheme === 'git' || scheme.startsWith('vscode-')) {
      return false;
    }

    // Ignore untitled files with no content or no language specified
    if (doc.isUntitled && (!doc.languageId || doc.languageId === 'plaintext')) {
      if (doc.getText().trim().length === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if user has exceeded idle timeout or window is unfocused.
   */
  public isIdle(now = Date.now()): boolean {
    if (!this.isWindowFocused) {
      return true;
    }
    return now - this.lastActivityTime > IDLE_TIMEOUT_MS;
  }

  /**
   * Throttles events for the same file.
   * - Non-write events (open, focus) are coalesced within NON_WRITE_THROTTLE_WINDOW_MS (2 minutes).
   * - Write events are throttled within WRITE_THROTTLE_WINDOW_MS.
   */
  public shouldThrottle(file: string, op: OperationType, now = Date.now()): boolean {
    const last = this.lastFileEvents.get(file);
    if (!last) {
      return false;
    }

    const elapsed = now - last.timestamp;
    if (op === 'write') {
      return elapsed < WRITE_THROTTLE_WINDOW_MS;
    }

    if (op === 'open' || op === 'focus') {
      return elapsed < NON_WRITE_THROTTLE_WINDOW_MS;
    }

    return false;
  }

  private onDocumentChanged(e: vscode.TextDocumentChangeEvent): void {
    if (e.contentChanges.length === 0) {
      return;
    }
    if (!this.shouldTrackDocument(e.document)) {
      return;
    }

    this.recordActivity(e.document, 'write');
  }

  private onDocumentSaved(doc: vscode.TextDocument): void {
    if (!this.shouldTrackDocument(doc)) {
      return;
    }
    this.recordActivity(doc, 'save');
  }

  private onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    if (!editor || !this.shouldTrackDocument(editor.document)) {
      return;
    }
    this.recordActivity(editor.document, 'open');
  }

  private onSelectionChanged(e: vscode.TextEditorSelectionChangeEvent): void {
    if (!this.shouldTrackDocument(e.textEditor.document)) {
      return;
    }
    // Minor cursor movements: treat as focus if qualifying
    this.recordActivity(e.textEditor.document, 'focus');
  }

  private onWindowStateChanged(state: vscode.WindowState): void {
    this.isWindowFocused = state.focused;
    if (state.focused) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && this.shouldTrackDocument(activeEditor.document)) {
        this.recordActivity(activeEditor.document, 'focus');
      }
    }
  }

  /**
   * Constructs an activity event and emits it if not throttled or disabled.
   */
  public recordActivity(doc: vscode.TextDocument, operationType: OperationType, now = Date.now()): IActivityEvent | null {
    const config = getConfig();
    if (!config.trackingEnabled) {
      return null;
    }

    // Update last activity heartbeat
    this.lastActivityTime = now;

    let relativeFilePath = vscode.workspace.asRelativePath(doc.fileName);
    if (relativeFilePath === doc.fileName) {
      relativeFilePath = path.basename(doc.fileName);
    }

    if (this.shouldThrottle(relativeFilePath, operationType, now)) {
      return null;
    }

    this.lastFileEvents.set(relativeFilePath, { timestamp: now, op: operationType });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const projectName = vscode.workspace.name || workspaceFolder?.name || 'Unknown';
    const folderPath = workspaceFolder?.uri.fsPath;

    const fileValue = config.obfuscateFilePaths ? sha256(relativeFilePath) : relativeFilePath;
    const absoluteFileValue = config.obfuscateFilePaths ? sha256(doc.fileName) : doc.fileName;

    const event: IActivityEvent = {
      id: uuidv4(),
      timestamp: now,
      project: projectName,
      language: doc.languageId || 'unknown',
      file: fileValue,
      absoluteFile: absoluteFileValue,
      platform: this.platformString,
      platformArch: this.platformArch,
      editor: `vscode ${vscode.version || '1.99.0'}`,
      gitBranch: getGitCurrentBranch(folderPath) || undefined,
      gitOrigin: getGitOriginUrl(folderPath) || undefined,
      operationType,
    };

    this.onEvent(event);
    return event;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.lastFileEvents.clear();
  }
}
