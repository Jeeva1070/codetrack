/* eslint-disable @typescript-eslint/no-explicit-any */
export const mockConfigStore: Record<string, any> = {
  'codetrack.statusBarInfo': 'Total',
  'codetrack.serverEntrypoint': 'https://api.codetime.dev',
  'codetrack.proxy': '',
  'codetrack.displayLanguage': 'Auto',
  'codetrack.trackingEnabled': true,
  'codetrack.obfuscateFilePaths': false,
  'http.proxy': '',
};

export const mockVscode = {
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  Disposable: {
    from: (...disposables: any[]) => ({
      dispose: () => disposables.forEach((d) => d && d.dispose && d.dispose()),
    }),
  },
  Uri: {
    parse: (val: string) => ({ toString: () => val, fsPath: val }),
    file: (val: string) => ({ toString: () => `file://${val}`, fsPath: val }),
  },
  env: {
    language: 'en',
    appName: 'Visual Studio Code',
    openExternal: async (_uri: any) => true,
  },
  l10n: {
    t: (message: string, ...args: any[]) => {
      if (args.length > 0) {
        return message.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
      }
      return message;
    },
  },
  workspace: {
    name: 'test-workspace',
    workspaceFolders: [
      {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
        index: 0,
      },
    ],
    getConfiguration: (section?: string) => ({
      get: <T>(key: string, defaultValue?: T): T => {
        const fullKey = section ? `${section}.${key}` : key;
        if (fullKey in mockConfigStore) {
          return mockConfigStore[fullKey];
        }
        return (defaultValue !== undefined ? defaultValue : undefined) as T;
      },
      update: async (key: string, value: any) => {
        const fullKey = section ? `${section}.${key}` : key;
        mockConfigStore[fullKey] = value;
      },
    }),
    asRelativePath: (filePath: string) => {
      if (filePath.startsWith('/test/workspace/')) {
        return filePath.replace('/test/workspace/', '');
      }
      return filePath;
    },
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
  },
  window: {
    activeTextEditor: undefined as any,
    createOutputChannel: (_name: string) => ({
      appendLine: (_line: string) => {},
      dispose: () => {},
    }),
    createStatusBarItem: (_alignment?: any, _priority?: number) => ({
      text: '',
      tooltip: '',
      command: '',
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    showInputBox: async (_options?: any) => undefined,
    showQuickPick: async (_items: any, _options?: any) => undefined,
    showInformationMessage: async (_message: string, ..._items: any[]) => undefined,
    showErrorMessage: async (_message: string, ..._items: any[]) => undefined,
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
    onDidChangeWindowState: () => ({ dispose: () => {} }),
  },
  commands: {
    registerCommand: (_command: string, _callback: any) => ({
      dispose: () => {},
    }),
    executeCommand: async (_command: string, ..._args: any[]) => {},
  },
};
